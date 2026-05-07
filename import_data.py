#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
导入真实GVI数据到SQLite数据库
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

import pandas as pd
import geopandas as gpd
from sqlalchemy.orm import Session
from database import SessionLocal, engine, Base
from models import SamplingPoint, RoadSegment, SeasonalMetric

def import_sampling_points():
    """导入采样点数据"""
    print("正在导入采样点数据...")
    
    # 读取shapefile
    shp_path = r"E:\ugvis-project\data\代码整理\nj_gvi_ndvi_data\pnt_gvi_ndvi.shp"
    gdf = gpd.read_file(shp_path)
    
    print(f"Shapefile列名: {list(gdf.columns)}")
    print(f"总记录数: {len(gdf)}")
    print(gdf.head())
    
    db = SessionLocal()
    try:
        # 清空现有数据
        db.query(SamplingPoint).delete()
        db.commit()
        
        count = 0
        for idx, row in gdf.iterrows():
            # 获取几何坐标
            lon = row.geometry.x if row.geometry else None
            lat = row.geometry.y if row.geometry else None
            
            # 获取GVI和NDVI值（根据实际列名调整）
            gvi_spring = float(row.get('gvi_spring', row.get('spring_gvi', -1)))
            gvi_summer = float(row.get('gvi_summer', row.get('summer_gvi', -1)))
            gvi_autumn = float(row.get('gvi_autumn', row.get('autumn_gvi', -1)))
            gvi_winter = float(row.get('gvi_winter', row.get('winter_gvi', -1)))
            
            ndvi_spring = float(row.get('ndvi_spring', row.get('spring_ndvi', -1)))
            ndvi_summer = float(row.get('ndvi_summer', row.get('summer_ndvi', -1)))
            ndvi_autumn = float(row.get('ndvi_autumn', row.get('autumn_ndvi', -1)))
            ndvi_winter = float(row.get('ndvi_winter', row.get('winter_ndvi', -1)))
            
            road_type = str(row.get('type', row.get('road_type', 'unknown')))
            
            point = SamplingPoint(
                id=count + 1,
                point_id=count + 1,
                lng=lon,
                lat=lat,
                gvi_spring=gvi_spring if gvi_spring >= 0 else None,
                gvi_summer=gvi_summer if gvi_summer >= 0 else None,
                gvi_autumn=gvi_autumn if gvi_autumn >= 0 else None,
                gvi_winter=gvi_winter if gvi_winter >= 0 else None,
                ndvi_spring=ndvi_spring if ndvi_spring >= 0 else None,
                ndvi_summer=ndvi_summer if ndvi_summer >= 0 else None,
                ndvi_autumn=ndvi_autumn if ndvi_autumn >= 0 else None,
                ndvi_winter=ndvi_winter if ndvi_winter >= 0 else None,
                road_type=road_type
            )
            db.add(point)
            count += 1
            
            if count % 1000 == 0:
                db.commit()
                print(f"已导入 {count} 条记录...")
        
        db.commit()
        print(f"[OK] 成功导入 {count} 条采样点数据")
        
    except Exception as e:
        db.rollback()
        print(f"[ERROR] 导入失败: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

def import_road_segments():
    """导入道路数据"""
    print("\n正在导入道路数据...")
    
    shp_path = r"E:\ugvis-project\data\代码整理\nj_gvi_ndvi_data\roadClipSingle2.shp"
    gdf = gpd.read_file(shp_path)
    
    print(f"道路Shapefile列名: {list(gdf.columns)}")
    print(f"总路段数: {len(gdf)}")
    
    db = SessionLocal()
    try:
        db.query(RoadSegment).delete()
        db.commit()
        
        count = 0
        for idx, row in gdf.iterrows():
            # 获取道路几何（转换为WKT）
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
                print(f"已导入 {count} 条路段...")
        
        db.commit()
        print(f"[OK] 成功导入 {count} 条道路数据")
        
    except Exception as e:
        db.rollback()
        print(f"[ERROR] 导入失败: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

def main():
    print("=" * 60)
    print("UGVIS 数据导入工具")
    print("=" * 60)
    
    # 创建表
    Base.metadata.create_all(bind=engine)
    print("数据库表已创建/更新\n")
    
    # 导入数据
    import_sampling_points()
    import_road_segments()
    
    print("\n" + "=" * 60)
    print("数据导入完成！")
    print("=" * 60)

if __name__ == "__main__":
    main()
