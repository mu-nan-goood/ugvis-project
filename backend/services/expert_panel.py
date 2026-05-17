"""
Expert Panel System - Multiple experts answer in parallel, moderator merges.

Architecture:
  1. User question → dispatched to N experts simultaneously
  2. Each expert responds from their professional perspective
  3. Moderator collects all opinions → synthesizes final recommendation
  4. SSE streaming: expert opinions arrive in parallel, then merged result
"""
import json
import logging
from typing import Dict, List, Optional, Any, AsyncGenerator
from dataclasses import dataclass

from services.llm_client import llm_client, LLMConfig

logger = logging.getLogger(__name__)


# ─── Expert Definitions ────────────────────────────────────────────────────

@dataclass
class ExpertProfile:
    id: str
    name: str
    emoji: str
    system_prompt_suffix: str
    # If None, use the user's default LLM config
    provider: Optional[str] = None
    model: Optional[str] = None


EXPERTS: List[ExpertProfile] = [
    ExpertProfile(
        id="planner",
        name="城市规划师",
        emoji="🏙️",
        system_prompt_suffix=(
            "你是城市规划领域的专家。你的视角：\n"
            "- 关注城市空间布局与功能分区\n"
            "- 评估绿化改造对周边用地、交通、公共服务的影响\n"
            "- 提出空间优化策略，考虑城市风貌与居民可达性\n"
            "- 引用城市规划规范和标准作为依据\n"
            "回答时以【城市规划师】身份发言，突出空间与规划视角。"
        ),
    ),
    ExpertProfile(
        id="ecologist",
        name="生态学家",
        emoji="🌿",
        system_prompt_suffix=(
            "你是城市生态领域的专家。你的视角：\n"
            "- 关注植物群落配置、生物多样性、生态连通性\n"
            "- 评估绿化改造对微气候、空气净化、雨洪管理的生态效益\n"
            "- 推荐适生树种和植物组合，考虑季节变化与生态演替\n"
            "- 关注长期生态可持续性而非短期视觉效果\n"
            "回答时以【生态学家】身份发言，突出生态与自然视角。"
        ),
    ),
    ExpertProfile(
        id="analyst",
        name="数据分析师",
        emoji="📊",
        system_prompt_suffix=(
            "你是数据分析领域的专家。你的视角：\n"
            "- 关注数据的量化分析与实证支撑\n"
            "- 基于GVI(绿视率)数据做趋势判断和区域对比\n"
            "- 评估改造方案的预期成效（量化指标提升预测）\n"
            "- 识别数据中的异常值、季节波动和空间分布规律\n"
            "- 提供基于数据的优先级排序和资源配置建议\n"
            "回答时以【数据分析师】身份发言，用数据和指标说话。"
        ),
    ),
    ExpertProfile(
        id="economist",
        name="经济评估师",
        emoji="💰",
        system_prompt_suffix=(
            "你是项目经济评估领域的专家。你的视角：\n"
            "- 关注改造方案的成本效益分析与预算合理性\n"
            "- 评估不同投资方案的ROI、维护成本、生命周期费用\n"
            "- 考虑政府补贴、社会融资等资金来源可行性\n"
            "- 权衡短期投入与长期收益，提出经济最优方案\n"
            "- 关注方案的可实施性和经济可持续性\n"
            "回答时以【经济评估师】身份发言，突出成本与收益视角。"
        ),
    ),
]

MODERATOR_PROMPT = (
    "你是专家小组的主持人（Moderator）。你的任务：\n"
    "- 综合以下各领域专家的意见，形成最终建议\n"
    "- 找出专家间的共识点和分歧点\n"
    "- 对分歧给出你的判断和理由\n"
    "- 输出结构化的最终推荐方案，包含：\n"
    "  1. 🎯 核心共识\n"
    "  2. ⚖️ 分歧与判断\n"
    "  3. ✅ 最终推荐方案\n"
    "  4. 📋 实施要点\n"
    "语言简洁有力，避免重复专家已说的细节，聚焦整合与决策。"
)

# 每位专家意见传给 Moderator 时的最大字符数（防止请求体过大触发 400）
MAX_EXPERT_OPINION_CHARS = 1500


def _build_expert_system_prompt(
    expert: ExpertProfile,
    base_prompt: str,
) -> str:
    """Build system prompt for a specific expert."""
    return base_prompt + "\n\n" + expert.system_prompt_suffix


def _build_moderator_messages(
    question: str,
    expert_opinions: Dict[str, str],
) -> List[Dict[str, str]]:
    """Build messages for the moderator to synthesize."""
    opinions_text = ""
    for expert in EXPERTS:
        opinion = expert_opinions.get(expert.id, "")
        if opinion:
            # 截断过长的专家意见，防止 Moderator 请求体过大导致 400
            if len(opinion) > MAX_EXPERT_OPINION_CHARS:
                opinion = opinion[:MAX_EXPERT_OPINION_CHARS] + "\n...（已截断）"
            opinions_text += f"\n### {expert.emoji} {expert.name}\n{opinion}\n"

    return [
        {"role": "system", "content": MODERATOR_PROMPT},
        {
            "role": "user",
            "content": (
                f"原始问题：{question}\n\n"
                f"以下是各专家的意见：\n{opinions_text}\n\n"
                "请综合以上意见，给出最终推荐方案。"
            ),
        },
    ]


async def expert_panel_stream(
    message: str,
    history: Optional[List[Dict]] = None,
    areas: Optional[List[Dict]] = None,
    preferences: Optional[Dict] = None,
    llm_config: Optional[LLMConfig] = None,
    expert_ids: Optional[List[str]] = None,
) -> AsyncGenerator[str, None]:
    """
    Expert Panel: parallel expert opinions + moderator synthesis.

    SSE event types:
    - expert_start    : Expert begins responding
    - expert_chunk    : Expert streaming chunk
    - expert_done     : Expert finished (full opinion)
    - moderator_chunk : Moderator synthesis streaming chunk
    - panel_done      : All done

    Usage:
        async for event in expert_panel_stream(...):
            yield f"data: {event}\\n\\n"
    """
    import asyncio

    if not llm_config or not llm_config.api_key:
        yield f"data: {json.dumps({'type': 'error', 'content': '未配置 LLM API Key'}, ensure_ascii=False)}\n\n"
        return

    # Select experts
    selected_experts = EXPERTS
    if expert_ids:
        selected_experts = [e for e in EXPERTS if e.id in expert_ids]
        if not selected_experts:
            selected_experts = EXPERTS

    # Build base system prompt (shared context)
    base_prompt = llm_client._build_chat_system_prompt(areas, preferences)

    # ── Phase 1: Parallel Expert Opinions ──────────────────────────────
    yield f"data: {json.dumps({'type': 'panel_start', 'experts': [{'id': e.id, 'name': e.name, 'emoji': e.emoji} for e in selected_experts]}, ensure_ascii=False)}\n\n"

    expert_opinions: Dict[str, str] = {}
    expert_tasks = {}

    async def _run_expert(expert: ExpertProfile) -> str:
        """Run a single expert, return full opinion text."""
        system_prompt = _build_expert_system_prompt(expert, base_prompt)

        try:
            model = llm_config.model or (expert.model or None)
            expert_config = LLMConfig(
                provider=llm_config.provider,
                api_key=llm_config.api_key,
                api_base=llm_config.api_base,
                model=model,
            )
            messages = list(history) if history else []
            messages.append({"role": "user", "content": message})

            # Use llm_client._call_api (handles api_base fallback to API_BASES)
            full_text = await llm_client._call_api(
                prompt="",
                system_prompt=system_prompt,
                llm_config=expert_config,
                messages=messages,
            )
            return full_text

        except Exception as e:
            logger.error(f"Expert {expert.id} failed: {e}")
            return f"[{expert.name}暂时无法回应：{str(e)}]"

    # Run all experts in parallel
    results = await asyncio.gather(
        *[_run_expert(e) for e in selected_experts],
        return_exceptions=True,
    )

    for expert, result in zip(selected_experts, results):
        if isinstance(result, Exception):
            opinion = f"[{expert.name}回应失败：{str(result)}]"
        else:
            opinion = result

        expert_opinions[expert.id] = opinion

        yield f"data: {json.dumps({'type': 'expert_done', 'expert_id': expert.id, 'expert_name': expert.name, 'emoji': expert.emoji, 'opinion': opinion}, ensure_ascii=False)}\n\n"

    # ── Phase 2: Moderator Synthesis ───────────────────────────────────
    yield f"data: {json.dumps({'type': 'moderator_start'}, ensure_ascii=False)}\n\n"

    try:
        moderator_messages = _build_moderator_messages(message, expert_opinions)

        model = llm_config.model or None
        mod_config = LLMConfig(
            provider=llm_config.provider,
            api_key=llm_config.api_key,
            api_base=llm_config.api_base,
            model=model,
        )

        # Split moderator_messages into history + last user message for chat_stream
        # chat_stream adds system_prompt separately, so skip the system message from moderator_messages
        non_system_msgs = [m for m in moderator_messages if m["role"] != "system"]
        if non_system_msgs:
            mod_history = non_system_msgs[:-1]
            mod_user_msg = non_system_msgs[-1]["content"]
        else:
            mod_history = []
            mod_user_msg = "请综合专家意见给出最终方案。"

        moderator_text = ""
        async for chunk in llm_client.chat_stream(
            message=mod_user_msg,
            history=mod_history,
            llm_config=mod_config,
            system_prompt=MODERATOR_PROMPT,
        ):
            moderator_text += chunk
            yield f"data: {json.dumps({'type': 'moderator_chunk', 'content': chunk}, ensure_ascii=False)}\n\n"

        yield f"data: {json.dumps({'type': 'moderator_done', 'content': moderator_text}, ensure_ascii=False)}\n\n"

    except Exception as e:
        logger.error(f"Moderator failed: {e}")
        yield f"data: {json.dumps({'type': 'moderator_error', 'content': f'主持人整合失败：{str(e)}'}, ensure_ascii=False)}\n\n"

    # ── Phase 3: Panel Complete ────────────────────────────────────────
    yield f"data: {json.dumps({'type': 'panel_done', 'experts': list(expert_opinions.keys()), 'opinion_count': len(expert_opinions)}, ensure_ascii=False)}\n\n"
