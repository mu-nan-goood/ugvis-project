"""backend/routers/seasonal.py"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
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
        boxplot_data = []
        summary_data = []

        # 季节统计
        for season_name, gvi_col in _SEASONS_MAP.items():
            rows = db.query(gvi_col).filter(gvi_col != None).all()
            values = [r[0] for r in rows if r[0] is not None]

            bp = compute_boxplot(values)
            boxplot_data.append(BoxplotData(season=season_name, **bp))

            if values:
                mean_val = statistics.mean(values)
                std_val = statistics.stdev(values) if len(values) > 1 else 0
                cv_val = (std_val / mean_val * 100) if mean_val > 0 else 0
                summary_data.append(SeasonalSummary(
                    season=season_name,
                    min_val=round(min(values), 2),
                    median=round(statistics.median(values), 2),
                    max_val=round(max(values), 2),
                    mean=round(mean_val, 2),
                    std=round(std_val, 2),
                    cv=round(cv_val, 1),
                    sample_count=len(values),
                ))
            else:
                summary_data.append(SeasonalSummary(
                    season=season_name, min_val=0, median=0, max_val=0,
                    mean=0, std=0, cv=0, sample_count=0,
                ))

        # 变异系数 — 逐点计算 CV
        all_points = db.query(
            SamplingPoint.lat,
            SamplingPoint.lng,
            SamplingPoint.gvi_spring,
            SamplingPoint.gvi_summer,
            SamplingPoint.gvi_autumn,
            SamplingPoint.gvi_winter,
            SamplingPoint.road_type,
        ).all()

        cv_points = []
        stable = 0
        moderate = 0
        unstable = 0

        # 两阶段采样：优先有 summer_winter_diff 的点，再均匀补充其余
        diff_points = []   # 有 summer_winter_diff 的点
        other_points = []  # 其余符合条件的点

        for p in all_points:
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
