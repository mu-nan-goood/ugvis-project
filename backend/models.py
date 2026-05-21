from sqlalchemy import Column, Integer, Float, String, DateTime, func, Text, ForeignKey
from database import Base

class SamplingPoint(Base):
    __tablename__ = "sampling_points"
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    point_id = Column(Integer, unique=True, index=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    
    # GVI values for 4 seasons
    gvi_spring = Column(Float)
    gvi_summer = Column(Float)
    gvi_autumn = Column(Float)
    gvi_winter = Column(Float)
    
    # NDVI for 4 seasons
    ndvi_spring = Column(Float)
    ndvi_summer = Column(Float)
    ndvi_autumn = Column(Float)
    ndvi_winter = Column(Float)
    
    # Road type
    road_type = Column(String(10))
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class RoadSegment(Base):
    __tablename__ = "road_segments"
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100))
    road_type = Column(String(20))
    geometry = Column(Text)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ModelResult(Base):
    __tablename__ = "model_results"
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True)
    point_id = Column(Integer, index=True)
    model_type = Column(String(20))
    
    pred_spring = Column(Float)
    pred_summer = Column(Float)
    pred_autumn = Column(Float)
    pred_winter = Column(Float)
    
    coef_ndvi = Column(Float)
    coef_intercept = Column(Float)
    local_r2 = Column(Float)
    
    residual = Column(Float)
    std_residual = Column(Float)

class SeasonalMetric(Base):
    __tablename__ = "seasonal_metrics"
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True)
    road_type = Column(String(20))
    season = Column(String(10))
    
    mean_gvi = Column(Float)
    std_gvi = Column(Float)
    mean_ndvi = Column(Float)
    std_ndvi = Column(Float)
    correlation = Column(Float)
    sample_count = Column(Integer)


class AdviceFeedback(Base):
    """用户对 AI 改造建议的反馈记录"""
    __tablename__ = "advice_feedback"
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    # 关联的建议上下文（可选：可以是对应哪个区域/哪个advice）
    advice_context = Column(Text, nullable=True)  # 建议内容的摘要或原始 JSON
    # 反馈类型: 'up' (👍有用) 或 'down' (👎无用)
    vote = Column(String(10), nullable=False)  # 'up' | 'down'
    # 可选的文字反馈
    comment = Column(Text, nullable=True)
    # 关联的优先区域 ID（如果有）
    area_ids = Column(String(200), nullable=True)  # 逗号分隔的 point_id 列表
    # 季节
    season = Column(String(20), nullable=True)
    # 提交用户（外键关联 users 表）
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    # 创建时间
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    """系统用户表"""
    __tablename__ = "users"
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), default="analyst")  # admin | analyst | guest
    is_active = Column(Integer, default=1)  # 1=active, 0=inactive
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
