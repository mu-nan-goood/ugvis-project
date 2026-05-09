"""backend/routers/points.py"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import SamplingPoint
from schemas import SamplingPointResponse, SamplingPointList
from utils import get_gvi_col

router = APIRouter(prefix="/api", tags=["Sampling Points"])


@router.get("/points", response_model=SamplingPointList)
def get_points(
    skip: int = 0,
    limit: int = 100,
    season: str = None,
    road_type: str = None,
    db: Session = Depends(get_db),
):
    query = db.query(SamplingPoint)

    if road_type:
        query = query.filter(SamplingPoint.road_type == road_type)

    if season:
        col = get_gvi_col(season, SamplingPoint)
        query = query.filter(col != None)

    total = query.count()
    points = query.offset(skip).limit(limit).all()

    return {"items": points, "total": total, "skip": skip, "limit": limit}


@router.get("/points/{point_id}", response_model=SamplingPointResponse)
def get_point(point_id: int, db: Session = Depends(get_db)):
    point = db.query(SamplingPoint).filter(SamplingPoint.point_id == point_id).first()
    if not point:
        raise HTTPException(status_code=404, detail="Point not found")
    return point
