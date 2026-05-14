"""Test the routing module"""
import sys
sys.path.insert(0, "/mnt/e/ugvis-project/backend")

from routers.routing import sample_gvi_along_route, generate_green_alternative
print("Import OK")

# Test with a mock DB
from database import SessionLocal, engine
from models import Base

try:
    db = SessionLocal()
    coords = [{"lat": 32.05, "lng": 118.78}, {"lat": 32.06, "lng": 118.79}, {"lat": 32.07, "lng": 118.80}]
    result = sample_gvi_along_route(coords, db)
    print(f"Route length: {result['total_length_m']}m")
    print(f"Spring GVI: {result['overall_gvi']['spring']}")
    print(f"Samples: {result['total_samples']}")
    db.close()
except Exception as e:
    import traceback
    traceback.print_exc()
