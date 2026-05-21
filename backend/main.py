"""backend/main.py — FastAPI 应用入口，路由全部由 routers/ 模块提供"""
import logging

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from database import engine, Base, SessionLocal
# 必须显式导入所有模型，SQLAlchemy 才能在 Base.metadata 中注册表
from models import SamplingPoint, RoadSegment, ModelResult, AdviceFeedback, User  # noqa: F401
from config import settings
from routers import health, points, stats, map, seasonal, analysis, planning, feedback, routing, auth
from services.auth import get_password_hash

logger = logging.getLogger(__name__)

# ── 速率限制 ────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=[])
# 导入 LLM 客户端（容错）
try:
    from backend.services.llm_client import llm_client
except ImportError:
    from services.llm_client import llm_client


def _create_initial_admin():
    """在数据库中创建初始管理员用户（如果配置了 INIT_ADMIN_USERNAME 和 INIT_ADMIN_PASSWORD）"""
    if not settings.init_admin_username or not settings.init_admin_password:
        logger.info("未配置初始管理员，跳过创建")
        return

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == settings.init_admin_username).first()
        if existing:
            logger.info(f"管理员用户 {settings.init_admin_username} 已存在")
            return

        admin = User(
            username=settings.init_admin_username,
            email=f"{settings.init_admin_username}@ugvis.local",
            hashed_password=get_password_hash(settings.init_admin_password),
            role="admin",
            is_active=1,
        )
        db.add(admin)
        db.commit()
        logger.info(f"✅ 初始管理员用户已创建: {settings.init_admin_username}")
    except Exception as e:
        db.rollback()
        logger.error(f"创建初始管理员失败: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动时建表 + 创建初始管理员，关闭时清理 LLM 客户端连接池。"""
    # 1. 建表
    Base.metadata.create_all(bind=engine)
    # 2. 创建初始管理员
    _create_initial_admin()
    yield
    # 3. 关闭 LLM
    await llm_client.close()


app = FastAPI(title="UGVIS API", version="0.2.0", lifespan=lifespan)

# 速率限制错误处理
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — 来源由 config.py 配置管理，支持环境变量 CORS_ORIGINS（逗号分隔）
# 示例: CORS_ORIGINS=http://localhost:5173,https://example.com
_allowed_origins = settings.cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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
app.include_router(feedback.router)
app.include_router(routing.router)
app.include_router(auth.router)  # 认证路由


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
