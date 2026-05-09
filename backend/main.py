"""backend/main.py — FastAPI 应用入口，路由全部由 routers/ 模块提供"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
# 必须显式导入所有模型，SQLAlchemy 才能在 Base.metadata 中注册表
from models import SamplingPoint, RoadSegment, ModelResult  # noqa: F401
from config import settings
from routers import health, points, stats, map, seasonal, analysis, planning


@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动时建表，关闭时清理（保持原有行为不变）"""
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="UGVIS API", version="0.2.0", lifespan=lifespan)

# CORS（开发阶段允许本地前端）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 路由注册 ────────────────────────────────────────────
app.include_router(health.router)
app.include_router(points.router)
app.include_router(stats.router)
app.include_router(map.router)
app.include_router(seasonal.router)
app.include_router(analysis.router)
app.include_router(planning.router)
