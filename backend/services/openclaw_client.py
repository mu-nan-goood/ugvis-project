import httpx
import json
import logging
from typing import List, Dict, Any, Optional
from config import settings

logger = logging.getLogger(__name__)

class OpenClawClient:
    """Client for interacting with OpenClaw AI Agent"""
    
    def __init__(self):
        self.base_url = settings.openclaw_url.rstrip('/')
        self.token = settings.openclaw_token
        self.timeout = settings.openclaw_timeout
    
    async def get_renovation_advice(
        self, 
        weak_areas: List[Dict[str, Any]],
        preferences: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Get AI-generated renovation route advice for weak areas.
        """
        prompt = self._build_renovation_prompt(weak_areas, preferences)
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                headers = {"Content-Type": "application/json"}
                if self.token:
                    headers["Authorization"] = f"Bearer {self.token}"
                
                payload = {
                    "message": prompt,
                    "context": {
                        "task": "renovation_planning",
                        "data_count": len(weak_areas),
                        "preferences": preferences or {}
                    }
                }
                
                logger.info(f"Calling OpenClaw API at {self.base_url}/api/agent/turns")
                response = await client.post(
                    f"{self.base_url}/api/agent/turns",
                    headers=headers,
                    json=payload
                )
                response.raise_for_status()
                
                result = response.json()
                logger.info("Successfully received advice from OpenClaw")
                return result
                
        except httpx.HTTPStatusError as e:
            logger.error(f"OpenClaw API HTTP error: {e.response.status_code} - {e.response.text}")
            raise
        except httpx.RequestError as e:
            logger.error(f"OpenClaw API request error: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error calling OpenClaw: {e}")
            raise
    
    def _build_renovation_prompt(
        self, 
        weak_areas: List[Dict[str, Any]],
        preferences: Optional[Dict[str, Any]] = None
    ) -> str:
        """Build a detailed prompt for the AI agent"""
        
        # Limit areas for token efficiency
        max_areas = 50
        selected_areas = weak_areas[:max_areas]
        
        # Format weak areas
        areas_text = []
        for i, area in enumerate(selected_areas, 1):
            areas_text.append(
                f"{i}. 点位ID: {area.get('point_id', 'N/A')}, "
                f"坐标: ({area.get('lat', 0):.4f}, {area.get('lng', 0):.4f}), "
                f"冬季GVI: {area.get('gvi_winter', 'N/A')}%, "
                f"道路类型: {area.get('road_type', '未知')}, "
                f"优先级: {area.get('priority', '未知')}"
            )
        
        # Add preference context
        pref_text = ""
        if preferences:
            pref_text = f"\n## 用户偏好\n{json.dumps(preferences, ensure_ascii=False, indent=2)}\n"
        
        prompt = f"""你是一位资深的城市绿化规划专家。请根据以下绿化薄弱区域数据，生成一份详细的绿化改造路线规划建议。

## 任务背景
我们正在对一个城市的绿化覆盖进行优化改造。以下是需要重点关注的绿化薄弱区域，这些区域冬季GVI（绿化可视指数）较低，急需改造提升。

## 薄弱区域数据（共{len(weak_areas)}个点位，展示前{len(selected_areas)}个）

{chr(10).join(areas_text)}
{pref_text}
## 请提供以下内容（用中文回答）：

### 1. 路线规划建议
- 设计一条高效的巡检/改造路线，优先覆盖高优先级区域
- 考虑地理位置邻近性和道路连通性
- 提供路线的起点、途经点和终点建议
- 估算路线总长度和所需时间

### 2. 分区改造策略
- 按道路类型（快速路rc1、主干路rc2、次干路rc3、支路rc4）分类建议
- 针对不同优先级区域给出差异化改造方案
- 高优先级区域：立即改造，重点投入
- 中优先级区域：计划改造，逐步推进
- 低优先级区域：常规维护，适时提升

### 3. 植物配置建议
- 根据冬季GVI值推荐适合的常绿植物种类
- 考虑当地气候（温带季风气候，冬季寒冷）
- 推荐具体树种：雪松、龙柏、香樟、广玉兰、红叶石楠、海桐等
- 说明每种植物的适宜种植位置和养护要点

### 4. 实施时间表
- 分阶段实施建议（短期1-3个月/中期3-6个月/长期6-12个月）
- 季节性种植时间建议（春季3-5月、秋季9-11月为最佳种植期）
- 各阶段的具体任务和里程碑

### 5. 预期效果评估
- 预估GVI提升幅度（按高优先级提升30%、中优先级提升20%、低优先级提升10%估算）
- 生态效益：碳汇增加、热岛效应缓解、空气质量改善
- 社会效益：居民满意度提升、城市形象改善、房产价值提升

### 6. 预算估算
- 按区域和道路类型给出大致预算范围
- 考虑植物采购、种植施工、后期养护等费用
- 提供性价比最优的方案建议

请用Markdown格式输出，结构清晰，建议具体可操作。在回答末尾简要总结核心建议（3-5条）。"""

        return prompt

# Singleton instance
openclaw_client = OpenClawClient()