"""Tool registry for function calling."""
import json
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional

try:
    from backend.models import SamplingPoint
    from backend.services.prompt_templates import get_all_templates
except ImportError:
    from models import SamplingPoint
    from services.prompt_templates import get_all_templates


# ─── Dataclasses ────────────────────────────────────────────────────────────────

@dataclass
class ToolResult:
    """Result of a tool execution."""
    success: bool
    data: Any = None
    error: str = None

    def to_dict(self) -> Dict:
        return {"success": self.success, "data": self.data, "error": self.error}


@dataclass
class Tool:
    """A callable tool for the LLM."""
    name: str
    description: str
    parameters: Dict[str, Any]  # JSON Schema
    execute_fn: callable

    def to_spec(self) -> Dict[str, Any]:
        """Return OpenAI-compatible function specification."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


# ─── Tool Execute Functions ────────────────────────────────────────────────────

def execute_get_weak_areas(db, season: str = None, priority: str = None,
                            min_gvi: float = None, limit: int = 20) -> ToolResult:
    """Get weak green areas from DB."""
    try:
        query = db.query(SamplingPoint)

        if season == "winter" or not season:
            col = SamplingPoint.gvi_winter
        elif season == "spring":
            col = SamplingPoint.gvi_spring
        elif season == "summer":
            col = SamplingPoint.gvi_summer
        elif season == "autumn":
            col = SamplingPoint.gvi_autumn
        else:
            col = SamplingPoint.gvi_winter

        query = query.filter(col < 10.0)  # B19 fix: filter at DB level (was < 80.0 + Python filter < 10)
        if min_gvi is not None:
            query = query.filter(col >= min_gvi)
        query = query.filter(col.isnot(None))
        points = query.order_by(col.asc()).limit(limit).all()

        areas = []
        for p in points:
            gvi_val = getattr(p, f"gvi_{season}" if season else "gvi_winter")
            if gvi_val is None:
                continue
            # DB already filters gvi < 10.0, no need to re-check here

            if gvi_val < 5.0:
                p_priority = "high"
            elif gvi_val < 8.0:
                p_priority = "medium"
            else:
                p_priority = "low"

            if priority and priority != p_priority:
                continue

            areas.append({
                "id": p.id,
                "point_id": p.point_id,
                "lat": round(p.lat, 6),
                "lng": round(p.lng, 6),
                "gvi": round(gvi_val, 2),
                "season": season or "winter",
                "priority": p_priority,
                "road_type": p.road_type or "unknown",
            })

        return ToolResult(success=True, data={"areas": areas, "count": len(areas)})

    except Exception as e:
        return ToolResult(success=False, error=str(e))


def execute_get_stats(db) -> ToolResult:
    """Get overall statistics."""
    try:
        from sqlalchemy import func
        total_points = db.query(SamplingPoint).count()
        total_roads = db.query(SamplingPoint.point_id).distinct().count()

        seasons = ["spring", "summer", "autumn", "winter"]
        seasonal_avgs = {}
        for s in seasons:
            gvi_col = getattr(SamplingPoint, f"gvi_{s}")
            avg = db.query(func.avg(gvi_col)).scalar() or 0
            seasonal_avgs[s] = round(float(avg), 2)

        weak_count = db.query(SamplingPoint).filter(
            SamplingPoint.gvi_winter < 10.0,
            SamplingPoint.gvi_winter.isnot(None)
        ).count()

        return ToolResult(success=True, data={
            "total_points": total_points,
            "total_roads": total_roads,
            "seasonal_gvi_avg": seasonal_avgs,
            "weak_areas_count": weak_count,
        })
    except Exception as e:
        return ToolResult(success=False, error=str(e))


def execute_get_seasonal_gvi(db, lat: float, lng: float, radius: float = 0.001) -> ToolResult:
    """Get seasonal GVI/NDVI for points near coordinates."""
    try:
        points = db.query(SamplingPoint).filter(
            SamplingPoint.lat.between(lat - radius, lat + radius),
            SamplingPoint.lng.between(lng - radius, lng + radius),
        ).limit(5).all()

        if not points:
            return ToolResult(success=True, data={"message": "No points found near this location"})

        results = []
        for p in points:
            results.append({
                "point_id": p.point_id,
                "lat": round(p.lat, 6),
                "lng": round(p.lng, 6),
                "gvi_spring": p.gvi_spring,
                "gvi_summer": p.gvi_summer,
                "gvi_autumn": p.gvi_autumn,
                "gvi_winter": p.gvi_winter,
                "ndvi_spring": p.ndvi_spring,
                "ndvi_summer": p.ndvi_summer,
                "ndvi_autumn": p.ndvi_autumn,
                "ndvi_winter": p.ndvi_winter,
            })

        return ToolResult(success=True, data={"points": results, "count": len(results)})
    except Exception as e:
        return ToolResult(success=False, error=str(e))


def execute_get_point_detail(db, point_id: int) -> ToolResult:
    """Get detailed info for a specific sampling point."""
    try:
        p = db.query(SamplingPoint).filter(SamplingPoint.id == point_id).first()
        if not p:
            return ToolResult(success=False, error=f"Point {point_id} not found")

        return ToolResult(success=True, data={
            "id": p.id,
            "point_id": p.point_id,
            "lat": round(p.lat, 6),
            "lng": round(p.lng, 6),
            "road_type": p.road_type,
            "gvi_spring": p.gvi_spring,
            "gvi_summer": p.gvi_summer,
            "gvi_autumn": p.gvi_autumn,
            "gvi_winter": p.gvi_winter,
            "ndvi_spring": p.ndvi_spring,
            "ndvi_summer": p.ndvi_summer,
            "ndvi_autumn": p.ndvi_autumn,
            "ndvi_winter": p.ndvi_winter,
        })
    except Exception as e:
        return ToolResult(success=False, error=str(e))


def execute_get_prompt_templates(db) -> ToolResult:
    """Get available prompt templates."""
    try:
        templates = get_all_templates()
        return ToolResult(success=True, data={"templates": templates, "count": len(templates)})
    except Exception as e:
        return ToolResult(success=False, error=str(e))


# ─── Tool Registry ─────────────────────────────────────────────────────────────

TOOL_REGISTRY: Dict[str, Tool] = {}


def _reg(name: str, desc: str, params: Dict, fn: callable):
    TOOL_REGISTRY[name] = Tool(name=name, description=desc, parameters=params, execute_fn=fn)


_reg(
    "get_weak_areas",
    "Get weak green areas (GVI < 10%) from the database. Use this when the user asks about weak areas, "
    "low green coverage zones, areas needing improvement, or wants to list specific locations with low GVI. "
    "Supports filtering by season, priority level, and minimum GVI threshold. "
    "Do NOT pass any parameters not listed below (e.g. no max_gvi parameter exists).",
    {
        "type": "object",
        "properties": {
            "season": {
                "type": "string",
                "enum": ["spring", "summer", "autumn", "winter"],
                "description": "Season for GVI analysis (default: winter)"
            },
            "priority": {
                "type": "string",
                "enum": ["high", "medium", "low"],
                "description": "Priority level: high (<5%), medium (5-8%), low (8-10%)"
            },
            "min_gvi": {
                "type": "number",
                "minimum": 0,
                "maximum": 100,
                "description": "Minimum GVI value to include (lower bound filter)"
            },
            "limit": {
                "type": "integer",
                "minimum": 1,
                "maximum": 100,
                "default": 20,
                "description": "Maximum number of areas to return"
            },
        },
        "required": [],
    },
    execute_get_weak_areas,
)

_reg(
    "get_statistics",
    "Get overall statistics: total sampling points, total road segments, seasonal GVI averages, "
    "and count of weak areas. Use this when the user asks about statistics, overall analysis, "
    "or summary data.",
    {"type": "object", "properties": {}, "required": []},
    execute_get_stats,
)

_reg(
    "get_seasonal_gvi",
    "Get seasonal GVI and NDVI data for sampling points near a specific geographic location. "
    "Use this when the user asks about seasonal variation at a specific location.",
    {
        "type": "object",
        "properties": {
            "lat": {"type": "number", "minimum": -90, "maximum": 90, "description": "Latitude"},
            "lng": {"type": "number", "minimum": -180, "maximum": 180, "description": "Longitude"},
            "radius": {"type": "number", "minimum": 0.0001, "maximum": 0.1, "default": 0.001, "description": "Search radius in degrees"},
        },
        "required": ["lat", "lng"],
    },
    execute_get_seasonal_gvi,
)

_reg(
    "get_point_detail",
    "Get detailed information for a specific sampling point by its ID.",
    {
        "type": "object",
        "properties": {"point_id": {"type": "integer", "description": "Internal ID of the sampling point"}},
        "required": ["point_id"],
    },
    execute_get_point_detail,
)

_reg(
    "get_prompt_templates",
    "Get the list of available prompt templates for generating renovation advice.",
    {"type": "object", "properties": {}, "required": []},
    execute_get_prompt_templates,
)


def get_tool_schemas() -> List[Dict[str, Any]]:
    """Return list of OpenAI-compatible function specs."""
    return [tool.to_spec() for tool in TOOL_REGISTRY.values()]


def execute_tool(name: str, arguments: Dict, db) -> ToolResult:
    """Execute a tool by name with given arguments.

    Filters out unknown parameters that LLM may hallucinate (e.g. max_gvi)
    to avoid TypeError on function call.
    """
    import inspect

    if name not in TOOL_REGISTRY:
        return ToolResult(success=False, error=f"Unknown tool: {name}")
    try:
        tool = TOOL_REGISTRY[name]
        # Filter out arguments not in the function signature
        sig = inspect.signature(tool.execute_fn)
        valid_params = set(sig.parameters.keys())
        filtered_args = {k: v for k, v in arguments.items() if k in valid_params}
        if set(arguments.keys()) - valid_params:
            import logging
            logging.getLogger(__name__).debug(
                f"[FC] Tool '{name}' received unknown args: {set(arguments.keys()) - valid_params}, filtered out"
            )
        result = tool.execute_fn(db, **filtered_args)
        return result
    except Exception as e:
        return ToolResult(success=False, error=str(e))
