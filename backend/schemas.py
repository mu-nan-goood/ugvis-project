import re

from pydantic import BaseModel, field_validator
from typing import List, Optional, Dict, Any
from datetime import datetime


def _validate_password(v: str) -> str:
    """密码复杂度校验（公共逻辑）"""
    if len(v) < 8:
        raise ValueError("密码长度不能少于8个字符")
    if not re.search(r"[A-Z]", v):
        raise ValueError("密码必须包含至少一个大写字母")
    if not re.search(r"[a-z]", v):
        raise ValueError("密码必须包含至少一个小写字母")
    if not re.search(r"[0-9]", v):
        raise ValueError("密码必须包含至少一个数字")
    if not re.search(r'[!@#$%^&*(),.?":{}|<>_\-=+\[\]\\/]', v):
        raise ValueError("密码必须包含至少一个特殊字符")
    return v

class HealthResponse(BaseModel):
    message: str
    version: str
    database: str = "ok"
    sample_count: int = 0

class SamplingPointResponse(BaseModel):
    id: int
    point_id: int
    lat: float
    lng: float
    gvi_spring: Optional[float]
    gvi_summer: Optional[float]
    gvi_autumn: Optional[float]
    gvi_winter: Optional[float]
    ndvi_spring: Optional[float]
    ndvi_summer: Optional[float]
    ndvi_autumn: Optional[float]
    ndvi_winter: Optional[float]
    road_type: Optional[str]
    created_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class SamplingPointList(BaseModel):
    items: List[SamplingPointResponse]
    total: int
    skip: int
    limit: int

class RoadSegmentResponse(BaseModel):
    id: int
    name: Optional[str]
    road_type: Optional[str]
    geometry: Optional[str]
    created_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class RoadSegmentList(BaseModel):
    items: List[RoadSegmentResponse]
    total: int
    skip: int
    limit: int

class SeasonalStats(BaseModel):
    season: str
    avg_gvi: float
    avg_ndvi: float
    sample_count: int

class StatsResponse(BaseModel):
    total_points: int
    total_roads: int
    road_types: Dict[str, int]
    seasonal: List[SeasonalStats]

# === 季节分析相关 ===

class BoxplotData(BaseModel):
    season: str
    min_val: float
    q1: float
    median: float
    q3: float
    max_val: float
    outliers: List[float] = []

class SeasonalSummary(BaseModel):
    season: str
    min_val: float
    median: float
    max_val: float
    mean: float
    std: float
    cv: float
    sample_count: int

class CVPoint(BaseModel):
    lat: float
    lng: float
    cv: float
    mean_gvi: float
    road_type: Optional[str] = None
    summer_winter_diff: Optional[float] = None

class StabilityStats(BaseModel):
    stable: int
    moderate: int
    unstable: int
    stable_pct: float
    moderate_pct: float
    unstable_pct: float

class SeasonalAnalysisResponse(BaseModel):
    boxplot: List[BoxplotData]
    summary: List[SeasonalSummary]
    cv_points: List[CVPoint]
    stability: StabilityStats

# === 空间分析相关 ===

class ModelMetrics(BaseModel):
    model_type: str
    r2: float
    adj_r2: float
    rmse: float
    aicc: float
    ndvi_coef: str
    intercept: str
    is_estimated: bool = False  # GWR/MGWR 文献估算时为 True

class LocalR2Point(BaseModel):
    lat: float
    lng: float
    local_r2: float
    model_type: str | None = None

class AnalysisResponse(BaseModel):
    models: List[ModelMetrics]
    local_r2_points: List[LocalR2Point]
    total_points_used: int


class ScatterPoint(BaseModel):
    ndvi: float
    gvi: float
    road_type: Optional[str] = None


class RegressionLine(BaseModel):
    model_type: str
    slope: float
    intercept: float
    r2: float
    color: str


class ScatterResponse(BaseModel):
    points: List[ScatterPoint]
    regression_lines: List[RegressionLine]
    total_available: int


# === 规划决策相关 ===

class WeakArea(BaseModel):
    id: int
    point_id: int
    lat: float
    lng: float
    gvi_winter: Optional[float]
    gvi_spring: Optional[float]
    gvi_summer: Optional[float]
    gvi_autumn: Optional[float]
    road_type: Optional[str]
    priority: str
    suggestion: str

class PlanningStats(BaseModel):
    high_priority: int
    medium_priority: int
    low_priority: int
    estimated_trees: int
    estimated_gvi_improvement: float

class PlanningResponse(BaseModel):
    stats: PlanningStats
    weak_areas: List[WeakArea]
    total: int = 0
    skip: int = 0
    limit: int = 50

# === 数据导入相关 ===

class ImportError(BaseModel):
    row: int
    point_id: Optional[int] = None
    message: str

class ImportResult(BaseModel):
    success_count: int
    error_count: int
    total_rows: int
    errors: List[ImportError] = []

# === AI / LLM 相关 ===

class LLMConfigRequest(BaseModel):
    """前端只传 provider 和可选 model，API Key 由后端 .env 管理
    
    对于 custom provider，前端仍需传 api_key 和 api_base（用户自建服务）
    """
    provider: str = "deepseek"
    model: Optional[str] = None
    api_key: Optional[str] = None  # 仅 custom provider 需要
    api_base: Optional[str] = None  # 仅 custom provider 需要

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []
    llm_config: Optional[LLMConfigRequest] = None
    preferences: Optional[Dict[str, Any]] = None

class ChatStreamEvent(BaseModel):
    type: str
    content: Optional[str] = None
    name: Optional[str] = None
    arguments: Optional[Dict[str, Any]] = None
    data: Optional[Any] = None
    success: Optional[bool] = None
    error: Optional[str] = None
    structured: Optional[Dict[str, Any]] = None

class RenovationAdviceRequest(BaseModel):
    areas: Optional[List[Dict[str, Any]]] = None
    preferences: Optional[Dict[str, Any]] = None
    llm_config: Optional[LLMConfigRequest] = None
    system_prompt: Optional[str] = None
    retrieve_knowledge: bool = True  # RAG: 是否检索历史高好评建议

class RenovationAdviceResponse(BaseModel):
    advice: str
    route_plan: Optional[Any] = None
    implementation_plan: Optional[Any] = None
    budget_estimate: Optional[Any] = None
    priority_areas: Optional[Any] = None
    raw_response: Optional[str] = None

# === 建议质量反馈相关 ===

class AdviceFeedbackCreate(BaseModel):
    """提交反馈时的请求体"""
    vote: str  # 'up' | 'down'
    comment: Optional[str] = None
    advice_context: Optional[str] = None  # 建议内容摘要
    area_ids: Optional[str] = None  # 逗号分隔的 point_id
    season: Optional[str] = None


class AdviceFeedbackResponse(BaseModel):
    id: int
    vote: str
    comment: Optional[str]
    advice_context: Optional[str]
    area_ids: Optional[str]
    season: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class AdviceFeedbackStats(BaseModel):
    total: int
    up_count: int
    down_count: int
    up_rate: float


# === 认证相关 ===

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 1800  # Access Token 有效期（秒），默认 30 分钟


class TokenData(BaseModel):
    username: Optional[str] = None
    user_id: Optional[int] = None
    role: Optional[str] = None


class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: str = "analyst"  # admin | analyst | guest

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validate_password(v)


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    username: str  # 可传 username 或 email
    password: str


class TokenRefreshRequest(BaseModel):
    refresh_token: str


class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validate_password(v)
