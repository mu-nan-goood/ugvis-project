from sqlalchemy import Column, Integer, Float, String, DateTime, func, Text
from database import Base

class SamplingPoint(Base):
    __tablename__ = "sampling_points"
    
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
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100))
    road_type = Column(String(20))
    geometry = Column(Text)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ModelResult(Base):
    __tablename__ = "model_results"
    
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
    
    id = Column(Integer, primary_key=True)
    road_type = Column(String(20))
    season = Column(String(10))
    
    mean_gvi = Column(Float)
    std_gvi = Column(Float)
    mean_ndvi = Column(Float)
    std_ndvi = Column(Float)
    correlation = Column(Float)
    sample_count = Column(Integer)
