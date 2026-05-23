"""backend/routers/routing.py — 绿波路线规划 API"""
import math
from typing import List, Optional
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


def sample_gvi_along_route(coords: list, db: Session, buffer_m: float = 50, limit_per_segment: int = 30, season: str = "spring") -> dict:
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

        # 在中点附近找采样点：矩形粗筛 + Haversine 精确过滤
        # 粗筛：扩大 1.5 倍范围确保不遗漏（经度方向 1° ≈ 111320*cos(lat) m）
        cos_lat = math.cos(math.radians(mid_lat))
        deg_lat = buffer_m * 1.5 / 111320.0
        deg_lng = buffer_m * 1.5 / (111320.0 * cos_lat) if cos_lat > 0.01 else deg_lat
        rough = (
            db.query(SamplingPoint)
            .filter(
                SamplingPoint.lat.between(mid_lat - deg_lat, mid_lat + deg_lat),
                SamplingPoint.lng.between(mid_lng - deg_lng, mid_lng + deg_lng),
            )
            .all()
        )
        # 精确过滤：Haversine 球面距离 ≤ buffer_m
        nearby = [p for p in rough if haversine(mid_lat, mid_lng, p.lat, p.lng) <= buffer_m]
        # 限制每段返回数量（按距离排序取最近的）
        nearby.sort(key=lambda p: haversine(mid_lat, mid_lng, p.lat, p.lng))
        nearby = nearby[:limit_per_segment]

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

    # 找到最佳/最差路段（基于当前季节）
    best_seg = max(segments, key=lambda s: (s["avg_gvi"].get(season, 0) or 0)) if segments else None
    worst_seg = min(segments, key=lambda s: (s["avg_gvi"].get(season, 999) or 999)) if segments else None

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
        "spring": spring, "summer": summer,
        "autumn": autumn, "winter": winter,
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


def generate_green_alternative(coords: list, db: Session, season: str = "spring", gvi_threshold: float = 30) -> list:
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

    # 找高GVI点（当前季节 GVI > 阈值）
    gvi_col = getattr(SamplingPoint, f"gvi_{season}", SamplingPoint.gvi_spring)
    high_gvi_points = (
        db.query(SamplingPoint)
        .filter(
            SamplingPoint.lat.between(min_lat, max_lat),
            SamplingPoint.lng.between(min_lng, max_lng),
            gvi_col > gvi_threshold,
        )
        .order_by(gvi_col.desc())
        .limit(8)
        .all()
    )

    if len(high_gvi_points) < 2:
        return coords  # 找不到足够的高GVI点

    # 从高GVI点中选 2-3 个作为绕行点
    # R7 fix: sort by GVI-projected score (higher GVI + closer to route corridor)
    # instead of pure distance to start
    waypoints = []
    for p in high_gvi_points:
        gvi_val = getattr(p, f"gvi_{season}", None) or 0
        # Score: normalize GVI (0-100→0-1) + distance penalty (prefer mid-route)
        dist_to_start = haversine(start["lat"], start["lng"], p.lat, p.lng)
        dist_to_end = haversine(end["lat"], end["lng"], p.lat, p.lng)
        route_length_est = haversine(start["lat"], start["lng"], end["lat"], end["lng"])
        # Prefer points that are between start and end (not too far off-route)
        detour_ratio = (dist_to_start + dist_to_end) / max(route_length_est, 1)
        gvi_score = gvi_val / 100.0  # 0~1
        route_score = max(0, 1.0 - (detour_ratio - 1.0) * 0.5)  # Penalize detours
        score = gvi_score * 0.6 + route_score * 0.4
        waypoints.append({"lat": p.lat, "lng": p.lng, "gvi": gvi_val, "score": score})

    # Sort by projected score (best first)
    waypoints.sort(key=lambda p: p["score"], reverse=True)

    # Pick top 2-3 waypoints spread along the route
    # Sort the top candidates by distance to start for path ordering
    picks = waypoints[:6]  # Pre-select top 6 by score
    picks.sort(key=lambda p: haversine(start["lat"], start["lng"], p["lat"], p["lng"]))
    # From score-sorted candidates, pick spread-out waypoints
    if len(picks) >= 3:
        picks = [picks[0], picks[len(picks) // 2], picks[-1]]
    elif len(picks) == 2:
        picks = picks[:2]
    else:
        picks = picks[:1]

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
    season: Optional[str] = "spring"


@router.post("/analyze", summary="Analyze GVI along a route with season")
def analyze_route(req: RouteAnalyzeRequest, db: Session = Depends(get_db)):
    """
    分析用户绘制的路线，返回 GVI 统计。
    """
    if len(req.coords) < 2:
        raise HTTPException(400, "至少需要 2 个点")
    # R8 fix: validate season parameter
    season = req.season or "spring"
    if season not in ("spring", "summer", "autumn", "winter"):
        raise HTTPException(400, f"Invalid season: {season}. Must be one of: spring, summer, autumn, winter")

    coords_dict = [{"lat": c.lat, "lng": c.lng} for c in req.coords]
    result = sample_gvi_along_route(coords_dict, db, season=season)
    return result


@router.post("/compare", summary="Compare GVI between two routes")
def compare_routes(req: RouteAnalyzeRequest, db: Session = Depends(get_db)):
    """
    分析用户路线 + 推荐一条「更绿」的替代路线，返回对比。
    """
    season = req.season or "spring"
    if len(req.coords) < 2:
        raise HTTPException(400, "至少需要 2 个点")

    if season not in ("spring", "summer", "autumn", "winter"):
        raise HTTPException(400, f"Invalid season: {season}")

    coords_dict = [{"lat": c.lat, "lng": c.lng} for c in req.coords]

    # 用户路线
    user_route = sample_gvi_along_route(coords_dict, db, season=season)

    # 生成更绿路线
    green_coords = generate_green_alternative(coords_dict, db, season=season)
    green_route = sample_gvi_along_route(green_coords, db, season=season)

    # 计算提升百分比（使用指定季节的GVI）
    user_season_gvi = user_route["overall_gvi"].get(season, 0) or 0
    green_season_gvi = green_route["overall_gvi"].get(season, 0) or 0
    improvement = round(((green_season_gvi - user_season_gvi) / user_season_gvi * 100) if user_season_gvi > 0 else 0, 1)

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
