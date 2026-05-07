#!/usr/bin/env python3
import sys
sys.path.insert(0, 'E:/ugvis-project/backend')
from sqlalchemy import inspect
from database import engine

inspector = inspect(engine)
for t in inspector.get_table_names():
    print(f"Table: {t}")
    for c in inspector.get_columns(t):
        print(f"  {c['name']}")
