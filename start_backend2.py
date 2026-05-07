#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import os

# Clear all cached modules first
for mod in list(sys.modules.keys()):
    if any(x in mod for x in ['backend', 'models', 'database', 'config', 'routers', 'schemas']):
        del sys.modules[mod]

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

import uvicorn

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
