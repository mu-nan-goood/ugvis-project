"""backend/routers/points.py"""
import io
import csv
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from database import get_db
from models import SamplingPoint
from services.auth import get_current_user, require_role
from schemas import UserResponse
from schemas import SamplingPointResponse, SamplingPointList, ImportResult, ImportError
from utils import get_gvi_col

router = APIRouter(prefix="/api", tags=["Sampling Points"])

# ── 读取 ────────────────────────────────────────────────

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

    content = await file.read()
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

            records.append(record)

        except Exception as e:
            errors.append(ImportError(row=row_num, message=f"未知解析错误: {str(e)}"))

    # ── 5. 批量 upsert ──────────────────────────────────
    success_count = 0
    error_rows = set(e.row for e in errors)

    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        for rec in batch:
            try:
                existing = db.query(SamplingPoint).filter(
                    SamplingPoint.point_id == rec["point_id"]
                ).first()
                if existing:
                    # 更新已有记录
                    for key, val in rec.items():
                        if key != "point_id":
                            setattr(existing, key, val)
                else:
                    db.add(SamplingPoint(**rec))
                db.commit()
                success_count += 1
            except IntegrityError:
                db.rollback()
                errors.append(ImportError(
                    row=0,  # 无法确定行号
                    point_id=rec["point_id"],
                    message=f"point_id={rec['point_id']} 违反完整性约束",
                ))
            except Exception as e:
                db.rollback()
                errors.append(ImportError(
                    row=0,
                    point_id=rec["point_id"],
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
