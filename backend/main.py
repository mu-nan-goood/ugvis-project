"""backend/main.py — FastAPI 应用入口，路由全部由 routers/ 模块提供"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
# 必须显式导入所有模型，SQLAlchemy 才能在 Base.metadata 中注册表
from models import SamplingPoint, RoadSegment, ModelResult  # noqa: F401
from config import settings
from routers import health, points, stats, map, seasonal, analysis, planning


try:
    from backend.services.llm_client import llm_client
except ImportError:
    from services.llm_client import llm_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动时建表，关闭时清理 LLM 客户端连接池。"""
    Base.metadata.create_all(bind=engine)
    yield
    await llm_client.close()


app = FastAPI(title="UGVIS API", version="0.2.0", lifespan=lifespan)

# CORS（开发阶段允许本地前端）
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://frontend:80",
        "http://127.0.0.1:5173",
        # Production domains — edit or remove as needed
        # "https://your-production-domain.com",
    ],
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
