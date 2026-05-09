"""backend/routers/map.py"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import SamplingPoint
from utils import get_gvi_ndvi_cols

router = APIRouter(prefix="/api", tags=["Map"])


@router.get("/map/points")
def get_map_points(
    season: str = "spring",
    limit: int = 5000,
    db: Session = Depends(get_db),
):
    gvi_col, ndvi_col = get_gvi_ndvi_cols(season, SamplingPoint)

    points = db.query(
        SamplingPoint.id,
        SamplingPoint.lat,
        SamplingPoint.lng,
        gvi_col.label("gvi"),
        ndvi_col.label("ndvi"),
        SamplingPoint.road_type,
    ).filter(gvi_col != None).limit(limit).all()

    return {
        "points": [
            {
                "id": p.id,
                "lat": p.lat,
                "lng": p.lng,
                "gvi": p.gvi,
                "ndvi": p.ndvi,
                "road_type": p.road_type,
            }
            for p in points
        ]
    }
