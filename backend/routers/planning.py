"""backend/routers/planning.py - Planning with AI integration"""
import json
import logging
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models import SamplingPoint
from schemas import (
    PlanningResponse, PlanningStats, WeakArea,
    ChatRequest, RenovationAdviceRequest, RenovationAdviceResponse,
)
from services.auth import get_current_user
from schemas import UserResponse

try:
    from backend.services.llm_client import llm_client
    from backend.services.tools.registry import get_tool_schemas
except ImportError:
    from services.llm_client import llm_client
    from services.tools.registry import get_tool_schemas

try:
    from backend.config import settings
except ImportError:
    from config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/planning", tags=["Planning"])


def _resolve_llm_config(llm_config: Optional[Any]) -> Any:
    """
    解析 LLM 配置：
    - custom provider: 使用前端传入的 api_key（用户自建服务，风险自担）
    - 其他 provider: 仅使用服务端 .env 中存储的 Key，拒绝前端传来的 Key

    安全策略：非 custom provider 不接受前端 api_key，防止 Key 泄露风险。
    """
    from schemas import LLMConfigRequest

    # 1. custom provider + 前端传了 api_key → 直接用（用户自建服务）
    if llm_config and llm_config.provider == "custom" and llm_config.api_key:
        return llm_config

    # ⚠️ 安全检查：非 custom provider 禁止使用前端传来的 api_key
    if llm_config and llm_config.api_key and llm_config.provider != "custom":
        logger.warning(
            f"[SECURITY] Non-custom provider '{llm_config.provider}' received api_key from frontend. "
            f"Ignoring it. Configure the key in backend .env instead."
        )
        # 不使用前端 Key，继续走服务端 Key 流程

    # 2. 其他 provider → 强制使用服务端 .env 存储的 Key
    provider = (llm_config.provider if llm_config else settings.llm_default_provider)
    server_key = settings.get_api_key_for_provider(provider)

    if server_key:
        return LLMConfigRequest(
            provider=provider,
            api_key=server_key,
            model=llm_config.model if llm_config else settings.llm_default_model,
            api_base=llm_config.api_base if llm_config else None,
        )

    # 3. 服务端未配置 Key → 报错
    return None

_ROAD_SUGGESTIONS = {
    "rc1": "增设中央隔离带绿化，补植抗寒常绿树种（雪松、龙柏）",
    "rc2": "行道树优化补植，增加常绿树种比例（香樟、广玉兰）",
    "rc3": "绿篱与中层绿化提升，增设花灌木（红叶石楠、海桐）",
    "rc4": "口袋公园建设、立体绿化改造、藤本植物覆盖墙面",
}


def _get_weak_areas_from_db(db: Session, limit: int = 500) -> List[Dict[str, Any]]:
    """Fetch weak areas from database."""
    weak_rows = db.query(SamplingPoint).filter(
        SamplingPoint.gvi_winter != None,
        SamplingPoint.gvi_winter < 10,
    ).all()

    areas = []
    for idx, p in enumerate(weak_rows[:limit]):
        winter_gvi = p.gvi_winter if p.gvi_winter else 0

        if winter_gvi < 5:
            priority = "high"
        elif winter_gvi < 8:
            priority = "medium"
        else:
            priority = "low"

        areas.append({
            "id": idx + 1,
            "point_id": p.point_id,
            "lat": p.lat,
            "lng": p.lng,
            "gvi_winter": p.gvi_winter,
            "gvi_spring": p.gvi_spring,
            "gvi_summer": p.gvi_summer,
            "gvi_autumn": p.gvi_autumn,
            "road_type": p.road_type,
            "priority": priority,
        })
    return areas


@router.get("/weak-areas", response_model=PlanningResponse)
def get_planning(db: Session = Depends(get_db)):
    """规划决策：识别绿化薄弱区并给出改造建议"""
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

        if winter_gvi < 5:
            priority = "high"
            high_count += 1
        elif winter_gvi < 8:
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

    # Single query for all priority counts
    all_weak = db.query(SamplingPoint).filter(
        SamplingPoint.gvi_winter != None,
        SamplingPoint.gvi_winter < 10,
    ).all()

    high_total = sum(1 for p in all_weak if p.gvi_winter < 5)
    med_total = sum(1 for p in all_weak if 5 <= p.gvi_winter < 8)
    low_total = sum(1 for p in all_weak if 8 <= p.gvi_winter < 10)

    stats = PlanningStats(
        high_priority=high_total,
        medium_priority=med_total,
        low_priority=low_total,
        estimated_trees=high_total * 3 + med_total * 2,
        estimated_gvi_improvement=round(min(15.0, high_total * 0.02 + med_total * 0.01), 1),
    )

    return PlanningResponse(stats=stats, weak_areas=weak_areas)


@router.post("/advice", response_model=RenovationAdviceResponse)
async def generate_advice(
    request: RenovationAdviceRequest,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Generate AI renovation advice (non-streaming)."""
    try:
        # Get areas from DB if not provided
        areas = request.areas
        if not areas:
            areas = _get_weak_areas_from_db(db, limit=50)

        if not areas:
            return RenovationAdviceResponse(
                advice="未找到薄弱区域数据，请确保数据库中有冬季 GVI < 10% 的采样点。"
            )

        # Resolve LLM config (server-side keys or frontend custom key)
        llm_config = _resolve_llm_config(request.llm_config)
        if not llm_config:
            raise HTTPException(
                status_code=400,
                detail="未配置 LLM API Key。请在后端 .env 文件中配置（如 DEEPSEEK_API_KEY），或使用 custom provider 传入。"
            )

        result = await llm_client.generate_renovation_advice(
            areas=areas,
            preferences=request.preferences,
            llm_config=llm_config,
            system_prompt=request.system_prompt,
            retrieve_knowledge=request.retrieve_knowledge,
            embedding_api_key=llm_config.api_key if llm_config else None,
            embedding_base_url=llm_config.api_base if llm_config else None,
        )

        return RenovationAdviceResponse(
            advice=result.get("advice", ""),
            route_plan=result.get("route_plan"),
            implementation_plan=result.get("implementation_plan"),
            budget_estimate=result.get("budget_estimate"),
            priority_areas=result.get("priority_areas"),
            raw_response=result.get("raw_response"),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating advice: {e}")
        raise HTTPException(status_code=500, detail=f"生成建议时出错: {str(e)}")


@router.post("/stream")
async def stream_advice(
    request: RenovationAdviceRequest,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Stream AI renovation advice (SSE)."""
    async def event_generator():
        try:
            areas = request.areas
            if not areas:
                areas = _get_weak_areas_from_db(db, limit=50)

            if not areas:
                yield f"data: {json.dumps({'type': 'error', 'content': '未找到薄弱区域数据'}, ensure_ascii=False)}\n\n"
                return

            # Resolve LLM config
            llm_config = _resolve_llm_config(request.llm_config)
            if not llm_config:
                yield f"data: {json.dumps({'type': 'error', 'content': '未配置 LLM API Key，请在后端 .env 中配置或使用 custom provider'}, ensure_ascii=False)}\n\n"
                return

            yield f"data: {json.dumps({'type': 'start'}, ensure_ascii=False)}\n\n"

            async for chunk in llm_client.stream_renovation_advice(
                areas=areas,
                preferences=request.preferences,
                llm_config=llm_config,
                system_prompt=request.system_prompt,
                retrieve_knowledge=request.retrieve_knowledge,
                embedding_api_key=llm_config.api_key if llm_config else None,
                embedding_base_url=llm_config.api_base if llm_config else None,
            ):
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk}, ensure_ascii=False)}\n\n"

            yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"

        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat")
async def chat(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Multi-turn chat with AI (non-streaming)."""
    try:
        # Resolve LLM config
        llm_config = _resolve_llm_config(request.llm_config)
        if not llm_config:
            raise HTTPException(
                status_code=400,
                detail="未配置 LLM API Key。请在后端 .env 文件中配置，或使用 custom provider 传入。"
            )

        # Get context data
        areas = _get_weak_areas_from_db(db, limit=50)

        history = [{"role": m.role, "content": m.content} for m in request.history]

        response_text = ""
        async for chunk in llm_client.chat_stream(
            message=request.message,
            history=history,
            areas=areas,
            preferences=request.preferences,
            llm_config=llm_config,
        ):
            response_text += chunk

        return {"response": response_text}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=f"对话出错: {str(e)}")


@router.post("/chat-stream")
async def chat_stream(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Multi-turn chat with AI (SSE streaming + Function Calling)."""
    async def event_generator():
        try:
            # Resolve LLM config
            llm_config = _resolve_llm_config(request.llm_config)
            if not llm_config:
                yield f"data: {json.dumps({'type': 'error', 'content': '未配置 LLM API Key'}, ensure_ascii=False)}\n\n"
                return

            # Get context data
            areas = _get_weak_areas_from_db(db, limit=50)

            history = [{"role": m.role, "content": m.content} for m in request.history]

            # Get tool schemas for Function Calling
            tools = get_tool_schemas()

            yield f"data: {json.dumps({'type': 'start'}, ensure_ascii=False)}\n\n"

            # Use Function Calling enabled stream
            async for event_str in llm_client.chat_stream_with_function_call(
                message=request.message,
                history=history,
                areas=areas,
                preferences=request.preferences,
                llm_config=llm_config,
                tools=tools,
                db=db,
            ):
                # chat_stream_with_function_call yields JSON strings with "\n\n" suffix
                # We need to re-wrap them into SSE format
                event_str = event_str.strip()
                if not event_str:
                    continue
                try:
                    event_data = json.loads(event_str)
                    yield f"data: {json.dumps(event_data, ensure_ascii=False)}\n\n"
                except json.JSONDecodeError:
                    # Already formatted, pass through
                    if not event_str.startswith("data: "):
                        yield f"data: {event_str}\n\n"
                    else:
                        yield event_str + "\n\n"

            yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"

        except Exception as e:
            logger.error(f"Chat stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/tools")
def get_tools(current_user: UserResponse = Depends(get_current_user)):
    """Get available tool schemas for Function Calling."""
    return {"tools": get_tool_schemas()}


# ─── Expert Panel ──────────────────────────────────────────────────────────

@router.post("/expert-panel")
async def expert_panel(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Expert Panel: multiple experts answer in parallel, moderator synthesizes."""
    from services.expert_panel import expert_panel_stream, EXPERTS

    async def event_generator():
        try:
            llm_config = _resolve_llm_config(request.llm_config)
            if not llm_config:
                yield f"data: {json.dumps({'type': 'error', 'content': '未配置 LLM API Key'}, ensure_ascii=False)}\n\n"
                return

            areas = _get_weak_areas_from_db(db, limit=50)
            history = [{"role": m.role, "content": m.content} for m in request.history]

            async for event_str in expert_panel_stream(
                message=request.message,
                history=history,
                areas=areas,
                preferences=request.preferences,
                llm_config=llm_config,
                expert_ids=getattr(request, 'expert_ids', None),
            ):
                yield event_str

        except Exception as e:
            logger.error(f"Expert panel error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/expert-panel/experts")
def list_experts():
    """List available expert profiles."""
    from services.expert_panel import EXPERTS
    return {
        "experts": [
            {"id": e.id, "name": e.name, "emoji": e.emoji}
            for e in EXPERTS
        ]
    }