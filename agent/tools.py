"""UGVIS API 工具封装"""
import httpx
from typing import Dict, Any, Optional, List
from config import UGVIS_API_URL


class UGVISClient:
    """UGVIS 后端 API 客户端"""
    
    def __init__(self):
        self.base_url = UGVIS_API_URL.rstrip("/")
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def _get(self, endpoint: str, params: Optional[Dict] = None) -> Dict[str, Any]:
        """发送 GET 请求"""
        try:
            response = await self.client.get(
                f"{self.base_url}{endpoint}",
                params=params,
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": True, "message": str(e)}
    
    async def get_stats(self) -> Dict[str, Any]:
        """获取全局统计信息"""
        return await self._get("/api/stats")
    
    async def get_points(
        self,
        season: Optional[str] = None,
        road_type: Optional[str] = None,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """
        查询采样点
        
        Args:
            season: 季节 (spring/summer/autumn/winter)
            road_type: 道路类型 (rc1/rc2/rc3/rc4)
            limit: 返回数量限制
        """
        params = {"limit": limit}
        if season:
            params["season"] = season
        if road_type:
            params["road_type"] = road_type
        return await self._get("/api/points", params)
    
    async def get_map_points(
        self,
        season: str = "spring",
        limit: int = 5000,
    ) -> Dict[str, Any]:
        """
        获取地图采样点
        
        Args:
            season: 季节
            limit: 采样数量
        """
        return await self._get("/api/map/points", {
            "season": season,
            "limit": limit,
        })
    
    async def get_seasonal_analysis(self) -> Dict[str, Any]:
        """获取季节变异分析"""
        return await self._get("/api/seasonal/analysis")
    
    async def get_spatial_analysis(self) -> Dict[str, Any]:
        """获取空间分析（模型对比）"""
        return await self._get("/api/analysis/models")
    
    async def get_planning(self) -> Dict[str, Any]:
        """获取规划决策数据"""
        return await self._get("/api/planning/weak-areas")
    
    async def close(self):
        """关闭 HTTP 客户端"""
        await self.client.aclose()


# 工具定义（用于 Function Calling）
TOOLS_DEFINITION = [
    {
        "type": "function",
        "function": {
            "name": "get_stats",
            "description": "获取 UGVIS 系统的全局统计信息，包括采样点总数、道路段总数、道路类型分布、四季平均 GVI/NDVI",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_points",
            "description": "查询采样点数据，可按季节和道路类型筛选",
            "parameters": {
                "type": "object",
                "properties": {
                    "season": {
                        "type": "string",
                        "enum": ["spring", "summer", "autumn", "winter"],
                        "description": "季节筛选",
                    },
                    "road_type": {
                        "type": "string",
                        "enum": ["rc1", "rc2", "rc3", "rc4"],
                        "description": "道路类型筛选",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "返回数量限制，默认100",
                        "default": 100,
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_seasonal_analysis",
            "description": "获取季节变异分析，包括箱线图、变异系数(CV)、稳定性分区统计",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_spatial_analysis",
            "description": "获取空间分析结果，包括 LR/GWR/MGWR 模型对比和局部 R² 分布",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_planning",
            "description": "获取规划决策数据，包括绿化薄弱区识别和改造建议",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
]


# 全局 UGVIS 客户端实例
ugvis_client = UGVISClient()
