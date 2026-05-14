"""backend/routers/routing.py — 绿波路线规划 API"""
import math
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import SamplingPoint

router = APIRouter(prefix="/api/routing", tags=["Routing"])

# ── 工具函数 ─────────────────────────────────────────────

def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """计算两点间距离（米）"""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def route_length(coords: list) -> float:
    """计算路线总长度（米）"""
    total = 0.0
    for i in range(1, len(coords)):
        total += haversine(
            coords[i - 1]["lat"], coords[i - 1]["lng"],
            coords[i]["lat"], coords[i]["lng"],
        )
    return total


def sample_gvi_along_route(coords: list, db: Session, buffer_m: float = 50, limit_per_segment: int = 30) -> dict:
    """
    沿路线采样 GVI 点。
    对每个路段的中点进行缓冲区查询，取最近的点。
    返回平均 GVI（四季），以及每段的统计。
    """
    all_nearby = []
    segments = []

    for i in range(1, len(coords)):
        lat1, lng1 = coords[i - 1]["lat"], coords[i - 1]["lng"]
        lat2, lng2 = coords[i]["lat"], coords[i]["lng"]
        length = haversine(lat1, lng1, lat2, lng2)

        # 路段中点
        mid_lat = (lat1 + lat2) / 2
        mid_lng = (lng1 + lng2) / 2

        # 在中点附近找采样点（简化：用近似度数范围代替真实缓冲区）
        deg_buffer = buffer_m / 111320.0
        nearby = (
            db.query(SamplingPoint)
            .filter(
                SamplingPoint.lat.between(mid_lat - deg_buffer, mid_lat + deg_buffer),
                SamplingPoint.lng.between(mid_lng - deg_buffer, mid_lng + deg_buffer),
            )
            .limit(limit_per_segment)
            .all()
        )

        if nearby:
            # 计算该路段四季平均 GVI
            spring_vals = [p.gvi_spring for p in nearby if p.gvi_spring is not None]
            summer_vals = [p.gvi_summer for p in nearby if p.gvi_summer is not None]
            autumn_vals = [p.gvi_autumn for p in nearby if p.gvi_autumn is not None]
            winter_vals = [p.gvi_winter for p in nearby if p.gvi_winter is not None]

            def avg(vals):
                return round(sum(vals) / len(vals), 2) if vals else None

            segments.append({
                "from_idx": i - 1,
                "to_idx": i,
                "length_m": round(length, 1),
                "sample_count": len(nearby),
                "avg_gvi": {
                    "spring": avg(spring_vals),
                    "summer": avg(summer_vals),
                    "autumn": avg(autumn_vals),
                    "winter": avg(winter_vals),
                },
            })
            all_nearby.extend(nearby)

    # 全局四季平均
    all_spring = [p.gvi_spring for p in all_nearby if p.gvi_spring is not None]
    all_summer = [p.gvi_summer for p in all_nearby if p.gvi_summer is not None]
    all_autumn = [p.gvi_autumn for p in all_nearby if p.gvi_autumn is not None]
    all_winter = [p.gvi_winter for p in all_nearby if p.gvi_winter is not None]

    def avg(vals):
        return round(sum(vals) / len(vals), 2) if vals else None

    # 找到最佳/最差路段
    best_seg = max(segments, key=lambda s: (s["avg_gvi"]["spring"] or 0)) if segments else None
    worst_seg = min(segments, key=lambda s: (s["avg_gvi"]["spring"] or 999)) if segments else None

    return {
        "total_length_m": round(route_length(coords), 1),
        "total_samples": len(all_nearby),
        "overall_gvi": {
            "spring": avg(all_spring),
            "summer": avg(all_summer),
            "autumn": avg(all_autumn),
            "winter": avg(all_winter),
        },
        "gvi_range": {
            "spring_min": round(min(all_spring), 2) if all_spring else None,
            "spring_max": round(max(all_spring), 2) if all_spring else None,
            "winter_min": round(min(all_winter), 2) if all_winter else None,
            "winter_max": round(max(all_winter), 2) if all_winter else None,
        },
        "segments": segments,
        "best_segment": best_seg,
        "worst_segment": worst_seg,
        "season_verdict": _season_verdict(avg(all_spring), avg(all_summer), avg(all_autumn), avg(all_winter)),
    }


def _season_verdict(spring, summer, autumn, winter):
    """生成一句话季节评价"""
    vals = {
        "春季": spring, "夏季": summer,
        "秋季": autumn, "冬季": winter,
    }
    # 过滤掉 None 值
    valid_vals = {k: v for k, v in vals.items() if v is not None}
    best_season = max(valid_vals, key=valid_vals.get) if valid_vals else None
    worst_season = min(valid_vals, key=valid_vals.get) if valid_vals else None
    gap = round(valid_vals[best_season] - valid_vals[worst_season], 2) if best_season and worst_season else None
    return {
        "best_season": best_season,
        "worst_season": worst_season,
        "gap": gap,
    }


def generate_green_alternative(coords: list, db: Session) -> list:
    """
    基于采样点 GVI 值，生成一条「更绿」的替代路径。
    策略：在起点到终点的范围内，寻找 GVI 高的区域作为绕行点。
    """
    if len(coords) < 2:
        return coords

    start = coords[0]
    end = coords[-1]

    # 在起点到终点之间，寻找 GVI 高的区域
    # 采样中间区域的高GVI点
    min_lat = min(start["lat"], end["lat"])
    max_lat = max(start["lat"], end["lat"])
    min_lng = min(start["lng"], end["lng"])
    max_lng = max(start["lng"], end["lng"])

    # 扩大搜索范围
    pad_lat = (max_lat - min_lat) * 0.3
    pad_lng = (max_lng - min_lng) * 0.3
    min_lat -= pad_lat
    max_lat += pad_lat
    min_lng -= pad_lng
    max_lng += pad_lng

    # 找高GVI点（春季 GVI > 30%）
    high_gvi_points = (
        db.query(SamplingPoint)
        .filter(
            SamplingPoint.lat.between(min_lat, max_lat),
            SamplingPoint.lng.between(min_lng, max_lng),
            SamplingPoint.gvi_spring > 30,
        )
        .order_by(SamplingPoint.gvi_spring.desc())
        .limit(8)
        .all()
    )

    if len(high_gvi_points) < 2:
        return coords  # 找不到足够的高GVI点

    # 从高GVI点中选 2-3 个作为绕行点
    # 策略：选一个靠近起点的，一个靠近终点的，一个中间的
    waypoints = []
    for p in high_gvi_points:
        waypoints.append({"lat": p.lat, "lng": p.lng, "gvi": p.gvi_spring})

    # 按到起点的距离排序
    waypoints.sort(key=lambda p: haversine(start["lat"], start["lng"], p["lat"], p["lng"]))

    # 选第1个（靠近起点）、中间某个、最后1个（靠近终点）
    picks = []
    if len(waypoints) >= 3:
        picks = [waypoints[0], waypoints[len(waypoints) // 2], waypoints[-1]]
    elif len(waypoints) == 2:
        picks = waypoints
    else:
        picks = [waypoints[0]]

    # 构建路径：start → waypoints → end
    result = [{"lat": start["lat"], "lng": start["lng"]}]
    for p in picks:
        result.append({"lat": p["lat"], "lng": p["lng"]})
    result.append({"lat": end["lat"], "lng": end["lng"]})

    return result


# ── API 端点 ────────────────────────────────────────────

class RouteCoordInput:
    """请求体：路线坐标列表"""
    def __init__(self, coords: list):
        self.coords = coords


from pydantic import BaseModel


class Coordinate(BaseModel):
    lat: float
    lng: float


class RouteAnalyzeRequest(BaseModel):
    coords: List[Coordinate]


@router.post("/analyze")
def analyze_route(req: RouteAnalyzeRequest, db: Session = Depends(get_db)):
    """
    分析用户绘制的路线，返回 GVI 统计。
    """
    if len(req.coords) < 2:
        raise HTTPException(400, "至少需要 2 个点")

    coords_dict = [{"lat": c.lat, "lng": c.lng} for c in req.coords]
    result = sample_gvi_along_route(coords_dict, db)
    return result


@router.post("/compare")
def compare_routes(req: RouteAnalyzeRequest, db: Session = Depends(get_db)):
    """
    分析用户路线 + 推荐一条「更绿」的替代路线，返回对比。
    """
    if len(req.coords) < 2:
        raise HTTPException(400, "至少需要 2 个点")

    coords_dict = [{"lat": c.lat, "lng": c.lng} for c in req.coords]

    # 用户路线
    user_route = sample_gvi_along_route(coords_dict, db)

    # 生成更绿路线
    green_coords = generate_green_alternative(coords_dict, db)
    green_route = sample_gvi_along_route(green_coords, db)

    # 计算提升百分比
    user_spring = user_route["overall_gvi"]["spring"] or 0
    green_spring = green_route["overall_gvi"]["spring"] or 0
    improvement = round(((green_spring - user_spring) / user_spring * 100) if user_spring > 0 else 0, 1)

    return {
        "user_route": {
            "coords": coords_dict,
            **user_route,
        },
        "green_route": {
            "coords": green_coords,
            **green_route,
        },
        "comparison": {
            "length_diff_m": round(green_route["total_length_m"] - user_route["total_length_m"], 1),
            "gvi_improvement_pct": improvement,
            "verdict": _generate_verdict(improvement, user_route["total_length_m"], green_route["total_length_m"]),
        },
    }


def _generate_verdict(improvement: float, user_len: float, green_len: float):
    """生成对比结论文本"""
    diff = green_len - user_len
    extra_pct = round(diff / user_len * 100, 1) if user_len > 0 else 0

    if improvement > 20:
        return f"建议选择绿化路线！虽然多走 {extra_pct}% 路程，但沿途绿化提升 {improvement}%，散步体验更好 🌿"
    elif improvement > 10:
        return f"绿化路线平均 GVI 高 {improvement}%，仅多 {extra_pct}% 路程，值得一试 🌱"
    elif improvement > 5:
        return f"绿化路线略优（+{improvement}% GVI），路程多 {extra_pct}%"
    else:
        return f"两条路线绿化水平接近，建议选择更短路线"
