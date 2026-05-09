"""backend/routers/health.py"""
from fastapi import APIRouter
from schemas import HealthResponse

router = APIRouter(tags=["Health"])


@router.get("/", response_model=HealthResponse)
def root():
    return {"message": "UGVIS API is running", "version": "0.2.0"}


@router.get("/api/health", response_model=HealthResponse)
def health_check():
    return {"message": "healthy", "version": "0.2.0"}
