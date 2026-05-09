"""backend/routers/planning.py"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import SamplingPoint
from schemas import PlanningResponse, PlanningStats, WeakArea

router = APIRouter(prefix="/api/planning", tags=["Planning"])


_ROAD_SUGGESTIONS = {
    "rc1": "增设中央隔离带绿化，补植抗寒常绿树种（雪松、龙柏）",
    "rc2": "行道树优化补植，增加常绿树种比例（香樟、广玉兰）",
    "rc3": "绿篱与中层绿化提升，增设花灌木（红叶石楠、海桐）",
    "rc4": "口袋公园建设、立体绿化改造、藤本植物覆盖墙面",
}


@router.get("/weak-areas", response_model=PlanningResponse)
def get_planning(db: Session = Depends(get_db)):
    """规划决策：识别绿化薄弱区并给出改造建议"""

    # 筛选冬季 GVI < 10% 的薄弱点
    weak_rows = db.query(SamplingPoint).filter(
        SamplingPoint.gvi_winter != None,
        SamplingPoint.gvi_winter < 10,
    ).all()

    weak_areas = []
    high_count = 0
    medium_count = 0
    low_count = 0

    for idx, p in enumerate(weak_rows[:500]):
        winter_gvi = p.gvi_winter if p.gvi_winter else 0

        if winter_gvi < 3:
            priority = "high"
            high_count += 1
        elif winter_gvi < 6:
            priority = "medium"
            medium_count += 1
        else:
            priority = "low"
            low_count += 1

        suggestion = _ROAD_SUGGESTIONS.get(
            p.road_type,
            "综合绿化提升：补植常绿乔木，增设垂直绿化"
        )

        weak_areas.append(WeakArea(
            id=idx + 1,
            point_id=p.point_id,
            lat=p.lat,
            lng=p.lng,
            gvi_winter=p.gvi_winter,
            gvi_spring=p.gvi_spring,
            gvi_summer=p.gvi_summer,
            gvi_autumn=p.gvi_autumn,
            road_type=p.road_type,
            priority=priority,
            suggestion=suggestion,
        ))

    # 完整统计
    total_weak = db.query(SamplingPoint).filter(
        SamplingPoint.gvi_winter != None,
        SamplingPoint.gvi_winter < 10,
    ).count()
    high_total = db.query(SamplingPoint).filter(
        SamplingPoint.gvi_winter != None,
        SamplingPoint.gvi_winter < 3,
    ).count()
    med_total = db.query(SamplingPoint).filter(
        SamplingPoint.gvi_winter != None,
        SamplingPoint.gvi_winter >= 3,
        SamplingPoint.gvi_winter < 6,
    ).count()
    low_total = db.query(SamplingPoint).filter(
        SamplingPoint.gvi_winter != None,
        SamplingPoint.gvi_winter >= 6,
        SamplingPoint.gvi_winter < 10,
    ).count()

    stats = PlanningStats(
        high_priority=high_total,
        medium_priority=med_total,
        low_priority=low_total,
        estimated_trees=high_total * 3 + med_total * 2,
        estimated_gvi_improvement=round(min(15.0, high_total * 0.02 + med_total * 0.01), 1),
    )

    return PlanningResponse(stats=stats, weak_areas=weak_areas)
