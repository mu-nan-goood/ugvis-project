from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models import SamplingPoint, ModelResult
from schemas import SeasonalStats, ModelComparison

router = APIRouter()

@router.get("/seasonal-stats")
async def get_seasonal_stats(db: Session = Depends(get_db)):
    seasons = ["spring", "summer", "autumn", "winter"]
    stats = []
    
    for season in seasons:
        gvi_col = getattr(SamplingPoint, f"gvi_{season}")
        result = db.query(
            func.avg(gvi_col).label("mean"),
            func.min(gvi_col).label("min"),
            func.max(gvi_col).label("max"),
            func.stddev(gvi_col).label("std"),
        ).first()
        
        stats.append({
            "season": season,
            "mean": float(result.mean) if result.mean else 0,
            "min": float(result.min) if result.min else 0,
            "max": float(result.max) if result.max else 0,
            "std": float(result.std) if result.std else 0,
        })
    
    return stats

@router.get("/model-comparison")
async def get_model_comparison(db: Session = Depends(get_db)):
    # Return mock data for now - replace with actual model results
    return [
        {"model_type": "LR", "r2": 0.524, "adj_r2": 0.523, "rmse": 8.24, "aicc": 4521.3, "ndvi_coef": 15.82, "intercept": 8.45},
        {"model_type": "GWR", "r2": 0.683, "adj_r2": 0.678, "rmse": 6.52, "aicc": 3842.7, "ndvi_coef": 12.45, "intercept": 2.15},
        {"model_type": "MGWR", "r2": 0.742, "adj_r2": 0.736, "rmse": 5.78, "aicc": 3215.4, "ndvi_coef": 8.32, "intercept": -2.45},
    ]

@router.get("/correlation")
async def get_correlation(season: str = "spring", db: Session = Depends(get_db)):
    gvi_col = getattr(SamplingPoint, f"gvi_{season}")
    
    # Calculate Pearson correlation using SQL
    result = db.query(
        func.corr(gvi_col, SamplingPoint.ndvi).label("correlation")
    ).first()
    
    return {"season": season, "correlation": float(result.correlation) if result.correlation else 0}
