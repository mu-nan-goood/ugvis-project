from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from database import get_db
from models import SamplingPoint
from schemas import PointResponse, PointListResponse

router = APIRouter()

@router.get("/", response_model=PointListResponse)
async def list_points(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    road_type: Optional[str] = None,
    season: Optional[str] = None,
    min_gvi: Optional[float] = None,
    max_gvi: Optional[float] = None,
    db: Session = Depends(get_db)
):
    query = db.query(SamplingPoint)
    
    if road_type:
        query = query.filter(SamplingPoint.road_type == road_type)
    if min_gvi is not None:
        if season == "spring":
            query = query.filter(SamplingPoint.gvi_spring >= min_gvi)
        elif season == "summer":
            query = query.filter(SamplingPoint.gvi_summer >= min_gvi)
        elif season == "autumn":
            query = query.filter(SamplingPoint.gvi_autumn >= min_gvi)
        elif season == "winter":
            query = query.filter(SamplingPoint.gvi_winter >= min_gvi)
    if max_gvi is not None:
        if season == "spring":
            query = query.filter(SamplingPoint.gvi_spring <= max_gvi)
        elif season == "summer":
            query = query.filter(SamplingPoint.gvi_summer <= max_gvi)
        elif season == "autumn":
            query = query.filter(SamplingPoint.gvi_autumn <= max_gvi)
        elif season == "winter":
            query = query.filter(SamplingPoint.gvi_winter <= max_gvi)
    
    total = query.count()
    items = query.offset(skip).limit(limit).all()
    
    return {"total": total, "items": items}

@router.get("/bounds")
async def get_bounds(db: Session = Depends(get_db)):
    result = db.query(
        func.min(SamplingPoint.lat).label("min_lat"),
        func.max(SamplingPoint.lat).label("max_lat"),
        func.min(SamplingPoint.lng).label("min_lng"),
        func.max(SamplingPoint.lng).label("max_lng"),
    ).first()
    return {
        "min_lat": result.min_lat,
        "max_lat": result.max_lat,
        "min_lng": result.min_lng,
        "max_lng": result.max_lng,
    }
