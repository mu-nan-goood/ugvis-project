#!/usr/bin/env python3
import os
import shutil

os.chdir('E:/ugvis-project/backend')

# Remove cache
if os.path.exists('__pycache__'):
    shutil.rmtree('__pycache__')

# Read current models.py
with open('models.py', 'r', encoding='utf-8') as f:
    content = f.read()

print("Current models.py content:")
print(content[:500])
print("...")

# Check if ndvi_spring exists
if 'ndvi_spring' in content:
    print("\nndvi_spring IS in models.py")
else:
    print("\nndvi_spring is NOT in models.py")
