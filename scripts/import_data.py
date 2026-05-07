#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据导入脚本
将CSV数据导入PostgreSQL/PostGIS数据库

用法:
    python import_data.py --csv /path/to/gvi_4seasons.csv
"""

import argparse
import pandas as pd
from sqlalchemy import create_engine, text
from geoalchemy2 import Geometry
import sys

def create_tables(engine):
    """创建数据库表"""
    with engine.connect() as conn:
        conn.execute(text('''
            CREATE TABLE IF NOT EXISTS sampling_points (
                id SERIAL PRIMARY KEY,
                point_id INTEGER UNIQUE,
                lat DOUBLE PRECISION NOT NULL,
                lng DOUBLE PRECISION NOT NULL,
                gvi_spring DOUBLE PRECISION,
                gvi_summer DOUBLE PRECISION,
                gvi_autumn DOUBLE PRECISION,
                gvi_winter DOUBLE PRECISION,
                ndvi DOUBLE PRECISION,
                road_type VARCHAR(10),
                geom GEOMETRY(POINT, 4326),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        '''))
        
        # Create spatial index
        conn.execute(text('''
            CREATE INDEX IF NOT EXISTS idx_sampling_points_geom 
            ON sampling_points USING GIST(geom)
        '''))
        
        conn.commit()
        print("[OK] Tables created")

def import_csv(csv_path, db_url):
    """导入CSV数据"""
    print(f"Reading {csv_path}...")
    df = pd.read_csv(csv_path)
    
    print(f"Loaded {len(df)} rows")
    print(f"Columns: {list(df.columns)}")
    
    # Rename columns if needed
    column_mapping = {
        'gvi_sp': 'gvi_spring',
        'gvi_su': 'gvi_summer',
        'gvi_au': 'gvi_autumn',
        'gvi_wi': 'gvi_winter',
    }
    df = df.rename(columns=column_mapping)
    
    # Add point_id if not exists
    if 'point_id' not in df.columns:
        df['point_id'] = range(1, len(df) + 1)
    
    # Create engine
    engine = create_engine(db_url)
    
    # Create tables
    create_tables(engine)
    
    # Import data
    print("Importing data...")
    df.to_sql('sampling_points', engine, if_exists='append', index=False,
              dtype={'geom': Geometry('POINT', srid=4326)})
    
    # Update geometry column
    with engine.connect() as conn:
        conn.execute(text('''
            UPDATE sampling_points 
            SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
            WHERE geom IS NULL
        '''))
        conn.commit()
    
    print(f"[OK] Imported {len(df)} records")

def main():
    parser = argparse.ArgumentParser(description='Import GVI data to PostgreSQL')
    parser.add_argument('--csv', required=True, help='Path to CSV file')
    parser.add_argument('--db-url', default='postgresql+psycopg2://ugvis:ugvis123@localhost:5432/ugvis_db',
                        help='Database URL')
    
    args = parser.parse_args()
    
    import_csv(args.csv, args.db_url)

if __name__ == '__main__':
    main()
