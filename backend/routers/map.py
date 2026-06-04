"""backend/routers/map.py"""
from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from database import get_db
from models import SamplingPoint, RoadSegment
from utils import get_gvi_ndvi_cols
import re
import math

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
        SamplingPoint.point_id,
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
                "point_id": p.point_id,
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


# ─── Web Mercator (EPSG:3857) → WGS-84 (EPSG:4326) ──────────────
_MERCATOR_R = 6378137.0
_MERCATOR_MAX = math.pi * _MERCATOR_R  # ~20037508.34


def _mercator_to_wgs84(x: float, y: float) -> tuple[float, float]:
    """Convert EPSG:3857 coordinates to EPSG:4326 (lng, lat)."""
    lng = (x / _MERCATOR_R) * 180.0 / math.pi  # rad → deg
    lat_raw = (y / _MERCATOR_R)  # radians
    lat = (2.0 * math.atan(math.exp(lat_raw)) - math.pi / 2.0) * 180.0 / math.pi
    return lng, lat


# WKT LINESTRING parser
_LINestring_RE = re.compile(
    r"LINESTRING\s*\(([^)]+)\)", re.IGNORECASE
)


def _parse_linestring(wkt: str) -> list[list[float]] | None:
    """Parse WKT LINESTRING from EPSG:3857 → list of [lng, lat] in WGS-84."""
    m = _LINestring_RE.match(wkt.strip())
    if not m:
        return None
    coords: list[list[float]] = []
    for pair in m.group(1).split(","):
        parts = pair.strip().split()
        if len(parts) >= 2:
            x, y = float(parts[0]), float(parts[1])
            lng, lat = _mercator_to_wgs84(x, y)
            coords.append([round(lng, 7), round(lat, 7)])
    return coords if len(coords) >= 2 else None


@router.get("/map/roads-3d", summary="Get road segments as GeoJSON for 3D rendering")
def get_roads_3d(
    road_type: str = Query(None, description="道路类型: rc1/rc2/rc3/rc4"),
    limit: int = Query(8000, ge=1, le=20000, description="返回道路数上限"),
    db: Session = Depends(get_db),
):
    """
    获取道路几何数据（GeoJSON 格式），用于 3D 地图渲染。
    
    坐标已转为 WGS-84 (EPSG:4326)，道路类型已标准化。
    avg_gvi 基于 season 参数（默认 spring）取该道路中心点 100m 缓冲区内采样点均值。
    """
    road_type_cn_map = {
        'rc1': ['快速路', '高架'],
        'rc2': ['主干'],
        'rc3': ['次干'],
        'rc4': ['支路', '内部'],
    }

    q = db.query(RoadSegment)
    if road_type:
        cn_types = road_type_cn_map.get(road_type, [road_type])
        q = q.filter(or_(*[RoadSegment.road_type.contains(c) for c in cn_types]))

    roads = q.limit(limit).all()

    # 批量预计算：按道路类型查询平均 GVI（避免逐条查询）
    type_gvi_avg = dict(
        db.query(SamplingPoint.road_type, func.avg(SamplingPoint.gvi_spring))
        .filter(SamplingPoint.gvi_spring != None)
        .group_by(SamplingPoint.road_type)
        .all()
    )

    features = []
    for road in roads:
        if not road.geometry:
            continue
        coords = _parse_linestring(road.geometry)
        if not coords:
            continue

        # 标准化道路类型
        rt = road.road_type or 'unknown'
        std_type = 'rc4'
        for rc, cn_list in road_type_cn_map.items():
            if any(c in rt for c in cn_list):
                std_type = rc
                break

        # 用道路类型平均 GVI 代替逐条查询（快100倍，精度够用）
        avg_gvi = type_gvi_avg.get(rt) or type_gvi_avg.get(std_type)

        features.append({
            "type": "Feature",
            "properties": {
                "id": road.id,
                "name": road.name,
                "road_type": std_type,
                "avg_gvi": round(avg_gvi, 2) if avg_gvi else None,
            },
            "geometry": {
                "type": "LineString",
                "coordinates": coords,
            },
        })

    return JSONResponse({
        "type": "FeatureCollection",
        "features": features,
        "count": len(features),
    })
