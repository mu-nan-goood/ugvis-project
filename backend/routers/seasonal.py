"""backend/routers/seasonal.py"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import SamplingPoint
from schemas import SeasonalAnalysisResponse, BoxplotData, SeasonalSummary, CVPoint, StabilityStats
from utils import compute_boxplot

router = APIRouter(prefix="/api/seasonal", tags=["Seasonal Analysis"])

_SEASONS_MAP = {
    "spring": SamplingPoint.gvi_spring,
    "summer": SamplingPoint.gvi_summer,
    "autumn": SamplingPoint.gvi_autumn,
    "winter": SamplingPoint.gvi_winter,
}


@router.get("/analysis", response_model=SeasonalAnalysisResponse)
def get_seasonal_analysis(db: Session = Depends(get_db)):
    """季节变异分析：箱线图、统计摘要、变异系数、稳定性分区"""
    import statistics

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

    # 变异系数 — 逐点计算 CV (采样以提高性能)
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

        cv_points.append(CVPoint(
            lat=p.lat,
            lng=p.lng,
            cv=round(cv, 1),
            mean_gvi=round(mean_gvi, 2),
            road_type=p.road_type,
        ))

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
