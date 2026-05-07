#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

# Clear any cached modules
for mod in list(sys.modules.keys()):
    if 'backend' in mod or 'models' in mod or 'database' in mod or 'config' in mod:
        del sys.modules[mod]

import geopandas as gpd
from sqlalchemy.orm import Session
from database import SessionLocal, engine, Base
from models import SamplingPoint, RoadSegment

def import_sampling_points():
    print("Importing sampling points...")
    
    shp_path = r"E:\ugvis-project\data\代码整理\nj_gvi_ndvi_data\pnt_gvi_ndvi.shp"
    gdf = gpd.read_file(shp_path)
    
    print(f"Columns: {list(gdf.columns)}")
    print(f"Total records: {len(gdf)}")
    
    db = SessionLocal()
    try:
        db.query(SamplingPoint).delete()
        db.commit()
        
        count = 0
        for idx, row in gdf.iterrows():
            lon = row.geometry.x if row.geometry else None
            lat = row.geometry.y if row.geometry else None
            
            # Map column names from shapefile
            gvi_spring = float(row.get('sp_GVI', -1))
            gvi_summer = float(row.get('su_GVI', -1))
            gvi_autumn = float(row.get('au_GVI', -1))
            gvi_winter = float(row.get('wi_GVI', -1))
            
            ndvi_spring = float(row.get('sp_NDVI', -1))
            ndvi_summer = float(row.get('su_NDVI', -1))
            ndvi_autumn = float(row.get('au_NDVI', -1))
            ndvi_winter = float(row.get('wi_NDVI', -1))
            
            road_type = str(row.get('type', 'unknown'))
            
            point = SamplingPoint(
                id=count + 1,
                point_id=int(row.get('ID', count + 1)),
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
                print(f"  Imported {count} records...")
        
        db.commit()
        print(f"[OK] Imported {count} sampling points")
        
    except Exception as e:
        db.rollback()
        print(f"[ERROR] {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

def import_road_segments():
    print("\nImporting road segments...")
    
    shp_path = r"E:\ugvis-project\data\代码整理\nj_gvi_ndvi_data\roadClipSingle2.shp"
    gdf = gpd.read_file(shp_path)
    
    print(f"Columns: {list(gdf.columns)}")
    print(f"Total roads: {len(gdf)}")
    
    db = SessionLocal()
    try:
        db.query(RoadSegment).delete()
        db.commit()
        
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
        
    except Exception as e:
        db.rollback()
        print(f"[ERROR] {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

def main():
    print("=" * 60)
    print("UGVIS Data Import Tool")
    print("=" * 60)
    
    # Create tables
    Base.metadata.create_all(bind=engine)
    print("Database tables ready\n")
    
    import_sampling_points()
    import_road_segments()
    
    print("\n" + "=" * 60)
    print("Import complete!")
    print("=" * 60)

if __name__ == "__main__":
    main()
