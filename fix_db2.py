#!/usr/bin/env python3
import os
import shutil

os.chdir('E:/ugvis-project/backend')

if os.path.exists('ugvis.db'):
    os.remove('ugvis.db')
if os.path.exists('__pycache__'):
    shutil.rmtree('__pycache__')

from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime, func, Text, inspect
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

engine = create_engine('sqlite:///./ugvis.db', connect_args={"check_same_thread": False})
Base = declarative_base()

class SamplingPoint(Base):
    __tablename__ = "sampling_points"
    id = Column(Integer, primary_key=True, index=True)
    point_id = Column(Integer, unique=True, index=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    gvi_spring = Column(Float)
    gvi_summer = Column(Float)
    gvi_autumn = Column(Float)
    gvi_winter = Column(Float)
    ndvi_spring = Column(Float)
    ndvi_summer = Column(Float)
    ndvi_autumn = Column(Float)
    ndvi_winter = Column(Float)
    road_type = Column(String(10))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class RoadSegment(Base):
    __tablename__ = "road_segments"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100))
    road_type = Column(String(20))
    geometry = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

Base.metadata.create_all(bind=engine)

inspector = inspect(engine)
cols = inspector.get_columns('sampling_points')
print("Columns in sampling_points:")
for c in cols:
    print(f"  {c['name']}")
print("\nDatabase recreated!")
