from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models import SamplingPoint
from schemas import WeakArea

router = APIRouter()

@router.get("/weak-areas")
async def get_weak_areas(
    threshold: float = Query(10.0, description="冬季GVI阈值"),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """识别绿化薄弱区"""
    areas = db.query(SamplingPoint).filter(
        SamplingPoint.gvi_winter < threshold
    ).order_by(SamplingPoint.gvi_winter.asc()).limit(limit).all()
    
    result = []
    for area in areas:
        # Determine priority and suggestion based on GVI values
        if area.gvi_winter < 5:
            priority = "high"
            suggestion = "补植常绿乔木（香樟、广玉兰），增设垂直绿化"
        elif area.gvi_winter < 10:
            priority = "medium"
            suggestion = "行道树补植，优化树冠覆盖"
        else:
            priority = "low"
            suggestion = "绿篱优化，增加中层绿化"
        
        result.append({
            "id": area.point_id,
            "lat": area.lat,
            "lng": area.lng,
            "gvi_winter": area.gvi_winter,
            "gvi_spring": area.gvi_spring,
            "road_type": area.road_type,
            "priority": priority,
            "suggestion": suggestion,
        })
    
    return result

@router.get("/statistics")
async def get_planning_statistics(db: Session = Depends(get_db)):
    """获取规划统计信息"""
    total = db.query(SamplingPoint).count()
    
    high_priority = db.query(SamplingPoint).filter(SamplingPoint.gvi_winter < 5).count()
    medium_priority = db.query(SamplingPoint).filter(
        SamplingPoint.gvi_winter >= 5,
        SamplingPoint.gvi_winter < 10
    ).count()
    
    return {
        "total_points": total,
        "high_priority": high_priority,
        "medium_priority": medium_priority,
        "estimated_trees": high_priority * 3 + medium_priority * 2,
    }
