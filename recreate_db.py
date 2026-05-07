#!/usr/bin/env python3
import os
import shutil
import sys

sys.path.insert(0, 'E:/ugvis-project/backend')
os.chdir('E:/ugvis-project/backend')

# Clear cache and db
if os.path.exists('__pycache__'):
    shutil.rmtree('__pycache__')
if os.path.exists('ugvis.db'):
    os.remove('ugvis.db')

# Remove cached modules
for mod in list(sys.modules.keys()):
    if 'backend' in mod or 'models' in mod or 'database' in mod:
        del sys.modules[mod]

from database import engine, Base
import models
Base.metadata.create_all(bind=engine)

from sqlalchemy import inspect
inspector = inspect(engine)
cols = inspector.get_columns('sampling_points')
print('Columns in sampling_points:')
for c in cols:
    print(f"  {c['name']}")
