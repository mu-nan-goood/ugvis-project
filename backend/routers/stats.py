"""backend/routers/stats.py"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models import SamplingPoint, RoadSegment
from schemas import StatsResponse, SeasonalStats, RoadSegmentList

router = APIRouter(prefix="/api", tags=["Statistics"])


@router.get("/stats", response_model=StatsResponse)
def get_stats(db: Session = Depends(get_db)):
    total_points = db.query(SamplingPoint).count()
    total_roads = db.query(RoadSegment).count()

    # Road type distribution
    road_types = db.query(
        SamplingPoint.road_type,
        func.count(SamplingPoint.id)
    ).group_by(SamplingPoint.road_type).all()

    # Seasonal averages
    seasons = ["spring", "summer", "autumn", "winter"]
    seasonal_stats = []

    for season in seasons:
        col_map = {
            "spring": (SamplingPoint.gvi_spring, SamplingPoint.ndvi_spring),
            "summer": (SamplingPoint.gvi_summer, SamplingPoint.ndvi_summer),
            "autumn": (SamplingPoint.gvi_autumn, SamplingPoint.ndvi_autumn),
            "winter": (SamplingPoint.gvi_winter, SamplingPoint.ndvi_winter),
        }
        gvi_col, ndvi_col = col_map[season]

        result = db.query(
            func.avg(gvi_col).label("avg_gvi"),
            func.avg(ndvi_col).label("avg_ndvi"),
            func.count(gvi_col).label("count")
        ).filter(gvi_col != None).first()

        seasonal_stats.append(SeasonalStats(
            season=season,
            avg_gvi=round(result.avg_gvi, 2) if result.avg_gvi else 0,
            avg_ndvi=round(result.avg_ndvi, 2) if result.avg_ndvi else 0,
            sample_count=result.count,
        ))

    return {
        "total_points": total_points,
        "total_roads": total_roads,
        "road_types": {rt: count for rt, count in road_types},
        "seasonal": seasonal_stats,
    }


@router.get("/roads", response_model=RoadSegmentList)
def get_roads(
    skip: int = 0,
    limit: int = 100,
    road_type: str = None,
    db: Session = Depends(get_db),
):
    query = db.query(RoadSegment)

    if road_type:
        query = query.filter(RoadSegment.road_type == road_type)

    total = query.count()
    roads = query.offset(skip).limit(limit).all()

    return {"items": roads, "total": total, "skip": skip, "limit": limit}
