"""backend/utils.py — 各路由共享的纯函数"""
import statistics
from typing import Dict, Any


def compute_boxplot(values: list) -> dict:
    """箱线图五数概括 + 异常值（tuker fence 法）"""
    if not values:
        return {"min_val": 0, "q1": 0, "median": 0, "q3": 0, "max_val": 0, "outliers": []}
    sorted_v = sorted(values)
    n = len(sorted_v)
    q1 = sorted_v[int(n * 0.25)]
    median = sorted_v[int(n * 0.5)]
    q3 = sorted_v[int(n * 0.75)]
    iqr = q3 - q1
    lower_fence = q1 - 1.5 * iqr
    upper_fence = q3 + 1.5 * iqr
    # whisker caps
    min_val = sorted_v[0] if sorted_v[0] >= lower_fence else lower_fence
    max_val = sorted_v[-1] if sorted_v[-1] <= upper_fence else upper_fence
    # actual whisker data points
    for v in sorted_v:
        if v >= lower_fence:
            min_val = v
            break
    for v in reversed(sorted_v):
        if v <= upper_fence:
            max_val = v
            break
    # outliers (limit to 20 for performance)
    outliers = [v for v in sorted_v if v < lower_fence or v > upper_fence][:20]
    return {
        "min_val": round(min_val, 2),
        "q1": round(q1, 2),
        "median": round(median, 2),
        "q3": round(q3, 2),
        "max_val": round(max_val, 2),
        "outliers": [round(o, 2) for o in outliers],
    }


def get_gvi_ndvi_cols(season: str, SamplingPoint):
    """根据季节返回 (gvi_col, ndvi_col) 列对象，供 query() 使用"""
    mapping: Dict[str, tuple] = {
        "spring": (SamplingPoint.gvi_spring, SamplingPoint.ndvi_spring),
        "summer": (SamplingPoint.gvi_summer, SamplingPoint.ndvi_summer),
        "autumn": (SamplingPoint.gvi_autumn, SamplingPoint.ndvi_autumn),
        "winter": (SamplingPoint.gvi_winter, SamplingPoint.ndvi_winter),
    }
    return mapping.get(season, (SamplingPoint.gvi_spring, SamplingPoint.ndvi_spring))


def get_gvi_col(season: str, SamplingPoint):
    """根据季节返回 gvi 列对象"""
    return get_gvi_ndvi_cols(season, SamplingPoint)[0]
