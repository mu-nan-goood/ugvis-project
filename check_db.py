#!/usr/bin/env python3
import sys
sys.path.insert(0, 'E:/ugvis-project/backend')
from database import engine
from sqlalchemy import inspect

inspector = inspect(engine)
columns = inspector.get_columns('sampling_points')
print('Current columns in sampling_points:')
for c in columns:
    print(f"  {c['name']}: {c['type']}")
