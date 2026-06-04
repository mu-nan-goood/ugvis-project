"""backend/routers/seasonal.py"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models import SamplingPoint
from schemas import SeasonalAnalysisResponse, BoxplotData, SeasonalSummary, CVPoint, StabilityStats
from utils import compute_boxplot
from services.cache import cache

router = APIRouter(prefix="/api/seasonal", tags=["Seasonal Analysis"])

_SEASONS_MAP = {
    "spring": SamplingPoint.gvi_spring,
    "summer": SamplingPoint.gvi_summer,
    "autumn": SamplingPoint.gvi_autumn,
    "winter": SamplingPoint.gvi_winter,
}


@router.get("/map", summary="Get seasonal GVI map points for a specific season")
async def get_seasonal_map(
    season: str = Query("spring", description="Season: spring/summer/autumn/winter"),
    sample_size: int = Query(3000, description="Max number of map points", ge=500, le=5000),
    db: Session = Depends(get_db),
):
    """返回指定季节的GVI地图散点数据，用于四季地图Tab"""
    season_key = season.lower()
    if season_key not in ("spring", "summer", "autumn", "winter"):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Invalid season: {season}")

    gvi_col = _SEASONS_MAP[season_key]

    import random
    total = db.query(func.count(SamplingPoint.id)).filter(gvi_col != None).scalar()
    offset = random.randint(0, max(0, total - sample_size))

    rows = (
        db.query(
            SamplingPoint.lat,
            SamplingPoint.lng,
            gvi_col.label("gvi"),
            SamplingPoint.road_type,
        )
        .filter(gvi_col != None)
        .offset(offset)
        .limit(sample_size)
        .all()
    )

    points = [
        {"lat": round(r.lat, 6), "lng": round(r.lng, 6), "gvi": round(r.gvi, 2), "road_type": r.road_type}
        for r in rows
    ]
    return {"season": season_key, "points": points, "total_available": total}


@router.get("/analysis", response_model=SeasonalAnalysisResponse, summary="Get seasonal GVI/NDVI analysis by road type")
async def get_seasonal_analysis(cv_limit: int = 3000, db: Session = Depends(get_db)):
    """季节变异分析：箱线图、统计摘要、变异系数、稳定性分区

    R5 fix: Run heavy computation in a thread pool to avoid blocking the event loop.
    """
    # Try cache first (TTL: 10 min — seasonal data rarely changes)
    cached = cache.get("seasonal:analysis")
    if cached is not None:
        return cached

    import statistics
    import asyncio

    def _compute():
        import statistics
        from sqlalchemy import func as sa_func

        # 1. 季节统计 — 单次查询全部4季聚合值
        season_stats = {}
        for season_name, gvi_col in _SEASONS_MAP.items():
            row = db.query(
                sa_func.count(gvi_col).label("count"),
                sa_func.min(gvi_col).label("min_val"),
                sa_func.max(gvi_col).label("max_val"),
                sa_func.avg(gvi_col).label("mean_val"),
            ).filter(gvi_col != None).first()
            season_stats[season_name] = row

        boxplot_data = []
        summary_data = []

        for season_name in _SEASONS_MAP:
            gvi_col = _SEASONS_MAP[season_name]
            rows = db.query(gvi_col).filter(gvi_col != None).all()
            values = [r[0] for r in rows if r[0] is not None]

            bp = compute_boxplot(values)
            boxplot_data.append(BoxplotData(season=season_name, **bp))

            row = season_stats[season_name]
            count = row.count or 0
            if count > 1:
                # std from Python — already loaded a relatively small column
                std_val = statistics.stdev(values) if len(values) > 1 else 0
                cv_val = (std_val / (row.mean_val or 1) * 100) if row.mean_val and row.mean_val > 0 else 0
                summary_data.append(SeasonalSummary(
                    season=season_name,
                    min_val=round(row.min_val, 2) if row.min_val else 0,
                    median=round(statistics.median(values), 2),
                    max_val=round(row.max_val, 2) if row.max_val else 0,
                    mean=round(row.mean_val, 2) if row.mean_val else 0,
                    std=round(std_val, 2),
                    cv=round(cv_val, 1),
                    sample_count=count,
                ))
            else:
                summary_data.append(SeasonalSummary(
                    season=season_name, min_val=0, median=0, max_val=0,
                    mean=0, std=0, cv=0, sample_count=0,
                ))

        # 2. 变异系数 — 流式处理，逐批读取避免内存峰值
        # R14 fix: 不再 .all() 加载全量 201K 行，改用 yield_per 流式迭代
        query = db.query(
            SamplingPoint.lat,
            SamplingPoint.lng,
            SamplingPoint.gvi_spring,
            SamplingPoint.gvi_summer,
            SamplingPoint.gvi_autumn,
            SamplingPoint.gvi_winter,
            SamplingPoint.road_type,
        ).yield_per(2000)

        cv_points = []
        stable = 0
        moderate = 0
        unstable = 0

        # 两阶段采样：优先有 summer_winter_diff 的点，再均匀补充其余
        diff_points = []   # 有 summer_winter_diff 的点
        other_points = []  # 其余符合条件的点
        other_count = 0     # 仅计数 other 点，不存全量

        for p in query:
            gvi_vals = [v for v in [p.gvi_spring, p.gvi_summer, p.gvi_autumn, p.gvi_winter] if v is not None]
            if len(gvi_vals) < 2:
                continue
            mean_gvi = statistics.mean(gvi_vals)
            if mean_gvi <= 0:
                continue
            std_gvi = statistics.stdev(gvi_vals) if len(gvi_vals) > 1 else 0
            cv = (std_gvi / mean_gvi) * 100

            if cv < 25:
                stable += 1
            elif cv < 50:
                moderate += 1
            else:
                unstable += 1

            # Summer-Winter GVI difference
            summer_winter_diff = None
            if p.gvi_summer is not None and p.gvi_winter is not None:
                summer_winter_diff = round(p.gvi_summer - p.gvi_winter, 2)

            cv_point = CVPoint(
                lat=p.lat,
                lng=p.lng,
                cv=round(cv, 1),
                mean_gvi=round(mean_gvi, 2),
                road_type=p.road_type,
                summer_winter_diff=summer_winter_diff,
            )

            if summer_winter_diff is not None:
                diff_points.append(cv_point)
            else:
                # 仅按比例保留 other 点，避免存储全量
                other_count += 1
                if len(other_points) < cv_limit:
                    other_points.append(cv_point)

        # 两阶段合并：先全部 diff 点（最多限额80%），再均匀采样 other 点补满
        diff_cap = int(cv_limit * 0.8)
        cv_points = diff_points[:diff_cap]
        remaining = cv_limit - len(cv_points)
        if remaining > 0 and other_points:
            step = max(1, len(other_points) // remaining)
            cv_points.extend(other_points[i] for i in range(0, len(other_points), step) if len(cv_points) < cv_limit)

        total_pts = stable + moderate + unstable
        stability = StabilityStats(
            stable=stable,
            moderate=moderate,
            unstable=unstable,
            stable_pct=round(stable / total_pts * 100, 1) if total_pts > 0 else 0,
            moderate_pct=round(moderate / total_pts * 100, 1) if total_pts > 0 else 0,
            unstable_pct=round(unstable / total_pts * 100, 1) if total_pts > 0 else 0,
        )

        return SeasonalAnalysisResponse(
            boxplot=boxplot_data,
            summary=summary_data,
            cv_points=cv_points,
            stability=stability,
        )

    result = await asyncio.to_thread(_compute)
    cache.set("seasonal:analysis", result.model_dump(), ttl=600)
    return result
