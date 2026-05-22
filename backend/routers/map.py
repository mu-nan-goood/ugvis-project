"""backend/routers/map.py"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from models import SamplingPoint
from utils import get_gvi_ndvi_cols

router = APIRouter(prefix="/api", tags=["Map"])


@router.get("/map/points", summary="Get sampling points for map rendering")
def get_map_points(
    season: str = Query("spring", description="季节: spring/summer/autumn/winter"),
    limit: int = Query(5000, ge=1, le=50000, description="返回点数上限"),
    min_gvi: float = Query(None, description="GVI 下限"),
    max_gvi: float = Query(None, description="GVI 上限"),
    road_type: str = Query(None, description="道路类型: rc1/rc2/rc3/rc4"),
    db: Session = Depends(get_db),
):
    """获取地图采样点，支持按 GVI 范围和道路类型过滤。"""
    gvi_col, ndvi_col = get_gvi_ndvi_cols(season, SamplingPoint)

    q = db.query(
        SamplingPoint.id,
        SamplingPoint.lat,
        SamplingPoint.lng,
        gvi_col.label("gvi"),
        ndvi_col.label("ndvi"),
        SamplingPoint.road_type,
    ).filter(gvi_col != None)

    if min_gvi is not None:
        q = q.filter(gvi_col >= min_gvi)
    if max_gvi is not None:
        q = q.filter(gvi_col <= max_gvi)
    if road_type:
        q = q.filter(SamplingPoint.road_type == road_type)

    points = q.limit(limit).all()

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


@router.get("/map/stats", summary="Get map layer statistics")
def get_map_stats(
    season: str = Query("spring"),
    db: Session = Depends(get_db),
):
    """获取指定季节的 GVI 分布统计（用于地图图例/色带）。"""
    from sqlalchemy import func
    gvi_col, _ = get_gvi_ndvi_cols(season, SamplingPoint)

    result = db.query(
        func.count(gvi_col).label("count"),
        func.min(gvi_col).label("min_gvi"),
        func.max(gvi_col).label("max_gvi"),
        func.avg(gvi_col).label("avg_gvi"),
    ).filter(gvi_col != None).first()

    return {
        "season": season,
        "count": result.count,
        "min_gvi": round(result.min_gvi, 2) if result.min_gvi else None,
        "max_gvi": round(result.max_gvi, 2) if result.max_gvi else None,
        "avg_gvi": round(result.avg_gvi, 2) if result.avg_gvi else None,
    }
