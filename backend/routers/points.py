"""backend/routers/points.py"""
import io
import csv
import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from database import get_db
from models import SamplingPoint
from services.auth import get_current_user, require_role
from schemas import UserResponse
from schemas import SamplingPointResponse, SamplingPointList, ImportResult, ImportError
from utils import get_gvi_col

# ── M5: CSV 导入文件大小上限 (50 MB) ──────────────────────
MAX_CSV_IMPORT_SIZE = 50 * 1024 * 1024  # 50 MB

router = APIRouter(prefix="/api", tags=["Sampling Points"])

# ── 读取 ────────────────────────────────────────────────

@router.get("/points", response_model=SamplingPointList)
def get_points(
    skip: int = 0,
    limit: int = 100,
    season: str = None,
    road_type: str = None,
    search: str = None,
    db: Session = Depends(get_db),
):
    query = db.query(SamplingPoint)

    if road_type:
        query = query.filter(SamplingPoint.road_type == road_type)

    if season:
        col = get_gvi_col(season, SamplingPoint)
        query = query.filter(col != None)

    if search:
        try:
            pid = int(search)
            query = query.filter(SamplingPoint.point_id == pid)
        except ValueError:
            query = query.filter(SamplingPoint.road_type.contains(search))

    total = query.count()
    points = query.offset(skip).limit(limit).all()

    return {"items": points, "total": total, "skip": skip, "limit": limit}


# ── 导出 ────────────────────────────────────────────────

@router.get("/points/export/geojson")
def export_points_geojson(
    season: str = Query(None, description="Season filter: spring/summer/autumn/winter"),
    road_type: str = Query(None, description="Road type filter: rc1/rc2/rc3/rc4"),
    db: Session = Depends(get_db),
):
    """
    Export sampling points as OGC GeoJSON (RFC 7946).
    Geometry uses WGS-84 (EPSG:4326) coordinates.
    """
    query = db.query(SamplingPoint)
    if road_type:
        query = query.filter(SamplingPoint.road_type == road_type)
    if season:
        col = get_gvi_col(season, SamplingPoint)
        query = query.filter(col != None)

    # ── 行数上限（与 CSV 导出一致）───────────────────────
    total = query.count()
    MAX_EXPORT_ROWS = 50000
    if total > MAX_EXPORT_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"数据量过大 ({total} 行)，上限 {MAX_EXPORT_ROWS} 行，请使用筛选条件缩小范围",
        )

    points = query.all()

    features = []
    for p in points:
        gvi_val = getattr(p, f"gvi_{season}", None) if season else None
        properties = {
            "point_id": p.point_id,
            "road_type": p.road_type,
        }
        if gvi_val is not None:
            properties["gvi"] = round(gvi_val, 4)
        # Include all-season GVI if no season filter
        if not season:
            for s in ("spring", "summer", "autumn", "winter"):
                val = getattr(p, f"gvi_{s}", None)
                if val is not None:
                    properties[f"gvi_{s}"] = round(val, 4)
            for s in ("spring", "summer", "autumn", "winter"):
                val = getattr(p, f"ndvi_{s}", None)
                if val is not None:
                    properties[f"ndvi_{s}"] = round(val, 4)

        feature = {
            "type": "Feature",
            "id": p.point_id,
            "geometry": {
                "type": "Point",
                "coordinates": [round(p.lng, 6), round(p.lat, 6)],  # [lon, lat] per RFC 7946
            },
            "properties": properties,
        }
        features.append(feature)

    geojson = {
        "type": "FeatureCollection",
        "name": "UGVIS_Sampling_Points",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"},
        },
        "features": features,
    }

    return Response(
        content=json.dumps(geojson, ensure_ascii=False),
        media_type="application/geo+json",
        headers={"Content-Disposition": 'attachment; filename="ugvis_points.geojson"'},
    )


@router.get("/points/export/csv")
def export_points_csv(
    season: str = Query(None, description="Season filter: spring/summer/autumn/winter"),
    road_type: str = Query(None, description="Road type filter: rc1/rc2/rc3/rc4"),
    search: str = Query(None, description="Search point_id or road_type"),
    db: Session = Depends(get_db),
):
    """
    Export sampling points as CSV (full dataset, not just current page).
    Supports server-side search and filtering.
    """
    query = db.query(SamplingPoint)
    if road_type:
        query = query.filter(SamplingPoint.road_type == road_type)
    if season:
        col = get_gvi_col(season, SamplingPoint)
        query = query.filter(col != None)
    if search:
        try:
            pid = int(search)
            query = query.filter(SamplingPoint.point_id == pid)
        except ValueError:
            query = query.filter(SamplingPoint.road_type.contains(search))

    # ── L2: CSV 导出行数上限 ─────────────────────────────
    total = query.count()
    MAX_EXPORT_ROWS = 50000
    if total > MAX_EXPORT_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"数据量过大 ({total} 行)，上限 {MAX_EXPORT_ROWS} 行，请使用筛选条件缩小范围",
        )

    points = query.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'point_id', 'lat', 'lng',
        'gvi_spring', 'gvi_summer', 'gvi_autumn', 'gvi_winter',
        'ndvi_spring', 'ndvi_summer', 'ndvi_autumn', 'ndvi_winter',
        'road_type',
    ])
    for p in points:
        writer.writerow([
            p.point_id, p.lat, p.lng,
            p.gvi_spring or '', p.gvi_summer or '', p.gvi_autumn or '', p.gvi_winter or '',
            p.ndvi_spring or '', p.ndvi_summer or '', p.ndvi_autumn or '', p.ndvi_winter or '',
            p.road_type or '',
        ])

    return Response(
        content='\ufeff' + output.getvalue(),  # BOM for Excel compatibility
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="ugvis_points.csv"'},
    )


@router.get("/points/{point_id}", response_model=SamplingPointResponse)
def get_point(point_id: int, db: Session = Depends(get_db)):
    point = db.query(SamplingPoint).filter(SamplingPoint.point_id == point_id).first()
    if not point:
        raise HTTPException(status_code=404, detail="Point not found")
    return point


# ── 导入 ────────────────────────────────────────────────

# CSV 必需列
_REQUIRED_COLS = {"point_id", "lat", "lng"}
# CSV 可选列（与数据库字段一一对应）
_OPTIONAL_COLS = {
    "gvi_spring", "gvi_summer", "gvi_autumn", "gvi_winter",
    "ndvi_spring", "ndvi_summer", "ndvi_autumn", "ndvi_winter",
    "road_type",
}
_VALID_ROAD_TYPES = {"rc1", "rc2", "rc3", "rc4"}


@router.post("/points/import", response_model=ImportResult)
async def import_points(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(require_role(["admin"])),
):
    """
    导入 CSV 格式的采样点数据。

    支持的列（第一行必须为表头）：
      - 必需：point_id, lat, lng
      - 可选：gvi_spring, gvi_summer, gvi_autumn, gvi_winter,
              ndvi_spring, ndvi_summer, ndvi_autumn, ndvi_winter,
              road_type

    行为：upsert（新数据覆盖旧数据）；返回成功/失败行数及错误详情。
    """
    # ── 1. 校验文件类型 ──────────────────────────────────
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="只支持 .csv 文件")

    # ── M5: 文件大小校验 ────────────────────────────────
    content = await file.read()
    if len(content) > MAX_CSV_IMPORT_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"文件过大 ({len(content) // (1024*1024)} MB)，上限 50 MB",
        )
    if not content:
        raise HTTPException(status_code=400, detail="文件为空")

    # ── 2. 解析 CSV ─────────────────────────────────────
    try:
        text = content.decode("utf-8-sig")  # utf-8-sig 自动去掉 BOM
        reader = csv.DictReader(io.StringIO(text))
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="文件编码错误，请使用 UTF-8 编码的 CSV")

    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=400, detail="CSV 文件无数据")

    # ── 3. 校验表头 ─────────────────────────────────────
    fieldnames = {col.lower().strip() for col in rows[0].keys()}
    missing = _REQUIRED_COLS - fieldnames
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"缺少必需列: {', '.join(sorted(missing))}，必需列: point_id, lat, lng",
        )

    # ── 4. 逐行校验 & 准备批量数据 ─────────────────────
    BATCH_SIZE = 1000
    records = []
    errors = []
    row_num = 1  # CSV 行号从 1 开始（跳过表头）

    for row in rows:
        row_num += 1
        try:
            point_id_str = row.get("point_id", "").strip()
            lat_str = row.get("lat", "").strip()
            lng_str = row.get("lng", "").strip()

            if not point_id_str:
                errors.append(ImportError(row=row_num, message="point_id 为空"))
                continue
            if not lat_str or not lng_str:
                errors.append(ImportError(row=row_num, point_id=int(point_id_str), message="lat 或 lng 为空"))
                continue

            try:
                point_id = int(point_id_str)
                lat = float(lat_str)
                lng = float(lng_str)
            except ValueError as e:
                errors.append(ImportError(row=row_num, point_id=int(point_id_str) if point_id_str.isdigit() else None, message=f"数据类型错误: {e}"))
                continue

            # 范围校验
            if not (-90 <= lat <= 90):
                errors.append(ImportError(row=row_num, point_id=point_id, message=f"lat={lat} 超出范围 [-90, 90]"))
                continue
            if not (-180 <= lng <= 180):
                errors.append(ImportError(row=row_num, point_id=point_id, message=f"lng={lng} 超出范围 [-180, 180]"))
                continue

            # 构建记录
            record = {
                "point_id": point_id,
                "lat": lat,
                "lng": lng,
            }

            for col in _OPTIONAL_COLS:
                val_str = row.get(col, "").strip()
                if val_str:
                    try:
                        val = float(val_str)
                        if col.startswith("gvi") and not (0 <= val <= 100):
                            errors.append(ImportError(row=row_num, point_id=point_id, message=f"{col}={val} 超出范围 [0, 100]"))
                            continue
                        if col.startswith("ndvi") and not (-1 <= val <= 1):
                            errors.append(ImportError(row=row_num, point_id=point_id, message=f"{col}={val} 超出范围 [-1, 1]"))
                            continue
                        record[col] = val
                    except ValueError:
                        errors.append(ImportError(row=row_num, point_id=point_id, message=f"{col} 值非法: '{val_str}'"))
                        continue

            road_type = record.get("road_type")
            if road_type and road_type not in _VALID_ROAD_TYPES:
                errors.append(ImportError(row=row_num, point_id=point_id, message=f"road_type='{road_type}' 非法，有效值: rc1/rc2/rc3/rc4"))
                continue

            records.append(record)

        except Exception as e:
            errors.append(ImportError(row=row_num, message=f"未知解析错误: {str(e)}"))

    # ── 5. 批量 upsert ──────────────────────────────────
    success_count = 0
    error_rows = set(e.row for e in errors)
    batch_success_indices = set()  # R9 fix: track which records succeeded in batch phase

    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        try:
            for rec in batch:
                existing = db.query(SamplingPoint).filter(
                    SamplingPoint.point_id == rec["point_id"]
                ).first()
                if existing:
                    for key, val in rec.items():
                        if key != "point_id":
                            setattr(existing, key, val)
                else:
                    db.add(SamplingPoint(**rec))
            db.commit()
            # R9 fix: only count after successful commit
            success_count += len(batch)
            batch_success_indices.update(range(i, i + len(batch)))
        except Exception:
            db.rollback()
            # B5 fix: batch commit failed, fall back to row-by-row for granular error reporting
            for j, rec in enumerate(batch):
                # R9 fix: skip records already counted in a previous successful batch
                if i + j in batch_success_indices:
                    continue
                try:
                    existing = db.query(SamplingPoint).filter(
                        SamplingPoint.point_id == rec["point_id"]
                    ).first()
                    if existing:
                        for key, val in rec.items():
                            if key != "point_id":
                                setattr(existing, key, val)
                    else:
                        db.add(SamplingPoint(**rec))
                    db.commit()
                    success_count += 1
                except Exception as e:
                    db.rollback()
                    errors.append(ImportError(
                        row=0,
                        point_id=rec.get("point_id"),
                        message=f"数据库写入失败: {str(e)}",
                    ))

    # ── 6. 构造返回 ─────────────────────────────────────
    # 限制返回的错误数量（避免响应过大）
    MAX_ERRORS = 100
    return ImportResult(
        success_count=success_count,
        error_count=len(errors),
        total_rows=len(rows),
        errors=errors[:MAX_ERRORS],
    )
