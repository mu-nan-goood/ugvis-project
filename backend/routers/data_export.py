from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session
from database import get_db
from models import SamplingPoint
import csv
import io

router = APIRouter()

@router.get("/csv")
async def export_csv(db: Session = Depends(get_db)):
    """导出所有采样点数据为CSV"""
    points = db.query(SamplingPoint).all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        "point_id", "lat", "lng",
        "gvi_spring", "gvi_summer", "gvi_autumn", "gvi_winter",
        "ndvi", "road_type"
    ])
    
    # Data
    for p in points:
        writer.writerow([
            p.point_id, p.lat, p.lng,
            p.gvi_spring, p.gvi_summer, p.gvi_autumn, p.gvi_winter,
            p.ndvi, p.road_type
        ])
    
    output.seek(0)
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=gvi_data.csv"}
    )
