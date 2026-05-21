"""backend/routers/health.py"""
from fastapi import APIRouter
from schemas import HealthResponse
from database import engine
from sqlalchemy import text

router = APIRouter(tags=["Health"])


@router.get("/", response_model=HealthResponse, summary="Root health check")
def root():
    return {"message": "UGVIS API is running", "version": "0.2.0"}


@router.get("/api/health", summary="API health check with database status")
def health_check():
    """健康检查 + 依赖状态。"""
    db_ok = True
    db_count = 0
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT count(*) FROM sampling_points"))
            db_count = result.scalar() or 0
    except Exception:
        db_ok = False

    return {
        "message": "healthy" if db_ok else "degraded",
        "version": "0.2.0",
        "database": "ok" if db_ok else "error",
        "sample_count": db_count,
    }
