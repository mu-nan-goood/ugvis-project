#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import os

sys.path.insert(0, 'E:/ugvis-project/backend')
os.chdir('E:/ugvis-project/backend')

import geopandas as gpd
from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime, func, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Fresh engine
engine = create_engine('sqlite:///./ugvis.db', connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
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

def import_sampling_points():
    print("Importing sampling points...")
    shp_path = r"E:\ugvis-project\data\代码整理\nj_gvi_ndvi_data\pnt_gvi_ndvi.shp"
    gdf = gpd.read_file(shp_path)
    
    print(f"Total records: {len(gdf)}")
    print(f"Columns: {list(gdf.columns)}")
    
    db = SessionLocal()
    count = 0
    valid_count = 0
    
    for idx, row in gdf.iterrows():
        lon = row.geometry.x if row.geometry else None
        lat = row.geometry.y if row.geometry else None
        
        gvi_sp = float(row.get('sp_GVI', -1))
        gvi_su = float(row.get('su_GVI', -1))
        gvi_au = float(row.get('au_GVI', -1))
        gvi_wi = float(row.get('wi_GVI', -1))
        
        ndvi_sp = float(row.get('sp_NDVI', -1))
        ndvi_su = float(row.get('su_NDVI', -1))
        ndvi_au = float(row.get('au_NDVI', -1))
        ndvi_wi = float(row.get('wi_NDVI', -1))
        
        # Check if at least one season has valid data
        has_data = any(v >= 0 for v in [gvi_sp, gvi_su, gvi_au, gvi_wi])
        if not has_data:
            continue
        
        point = SamplingPoint(
            id=valid_count + 1,
            point_id=int(row.get('ID', valid_count + 1)),
            lng=lon,
            lat=lat,
            gvi_spring=gvi_sp if gvi_sp >= 0 else None,
            gvi_summer=gvi_su if gvi_su >= 0 else None,
            gvi_autumn=gvi_au if gvi_au >= 0 else None,
            gvi_winter=gvi_wi if gvi_wi >= 0 else None,
            ndvi_spring=ndvi_sp if ndvi_sp >= 0 else None,
            ndvi_summer=ndvi_su if ndvi_su >= 0 else None,
            ndvi_autumn=ndvi_au if ndvi_au >= 0 else None,
            ndvi_winter=ndvi_wi if ndvi_wi >= 0 else None,
            road_type=str(row.get('type', 'unknown'))
        )
        db.add(point)
        valid_count += 1
        
        if valid_count % 1000 == 0:
            db.commit()
            print(f"  Imported {valid_count} valid records...")
    
    db.commit()
    print(f"[OK] Imported {valid_count} valid sampling points (from {len(gdf)} total)")
    db.close()

def import_road_segments():
    print("\nImporting road segments...")
    shp_path = r"E:\ugvis-project\data\代码整理\nj_gvi_ndvi_data\roadClipSingle2.shp"
    gdf = gpd.read_file(shp_path)
    
    print(f"Total roads: {len(gdf)}")
    
    db = SessionLocal()
    count = 0
    
    for idx, row in gdf.iterrows():
        geom_wkt = row.geometry.wkt if row.geometry else None
        
        road = RoadSegment(
            id=count + 1,
            name=str(row.get('name', f"Road_{count}")),
            road_type=str(row.get('type', row.get('fclass', 'unknown'))),
            geometry=geom_wkt
        )
        db.add(road)
        count += 1
        
        if count % 1000 == 0:
            db.commit()
            print(f"  Imported {count} roads...")
    
    db.commit()
    print(f"[OK] Imported {count} road segments")
    db.close()

if __name__ == "__main__":
    print("=" * 60)
    print("UGVIS Data Import")
    print("=" * 60)
    import_sampling_points()
    import_road_segments()
    print("\n" + "=" * 60)
    print("Import complete!")
    print("=" * 60)
