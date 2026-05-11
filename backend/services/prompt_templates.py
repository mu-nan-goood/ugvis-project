# -*- coding: utf-8 -*-
"""
Prompt 模板管理 - 预设模板 + 用户自定义模板
"""
import json
import logging
import uuid
from typing import Dict, List, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

# 预设模板
PRESET_TEMPLATES: Dict[str, dict] = {
    "default": {
        "id": "default",
        "name": "默认 — 综合改造建议",
        "description": "生成包含路线规划、实施计划、预算估算的综合绿化改造建议",
        "system_prompt": (
            "你是一位城市绿化规划专家。请根据提供的薄弱区域数据，生成绿化改造建议。\n\n"
            "输出格式要求：\n"
            "1. 首先输出一段 Markdown 格式的总体建议（包含标题、分析、方案）\n"
            "2. 然后在最后输出一个 JSON 代码块，包含以下字段：\n"
            "   - route_plan: 路线规划对象（含 total_distance, stops, estimated_time 等）\n"
            "   - implementation_plan: 实施计划对象（含 phases, duration, milestones 等）\n"
            "   - budget_estimate: 预算估算对象（含 total, unit_cost, breakdown 等）\n"
            "   - priority_areas: 优先区域 ID 列表\n\n"
            "注意：JSON 必须放在代码块中，且是有效的 JSON 格式。"
        ),
        "user_prompt_template": (
            "请根据以下城市绿化薄弱区域数据，生成详细的改造建议。\n\n"
            "薄弱区域数据（共 {area_count} 个）：\n{areas_text}\n"
            "{preferences_text}\n\n"
            "请提供：\n"
            "1. 总体分析和策略建议\n"
            "2. 具体的路线规划\n"
            "3. 实施计划（分阶段）\n"
            "4. 预算估算\n"
            "5. 优先改造区域排序"
        ),
    },
    "quick_diagnosis": {
        "id": "quick_diagnosis",
        "name": "快速诊断 — 问题定位",
        "description": "快速识别薄弱区域的核心问题，给出简洁的优先级排序和关键建议",
        "system_prompt": (
            "你是一位城市绿化数据分析师，擅长快速诊断绿化薄弱区域的根本原因。\n\n"
            "要求：\n"
            "- 简洁精炼，每条建议不超过3行\n"
            "- 用表格呈现优先级排序\n"
            "- 重点回答\"为什么薄弱\"和\"最先改哪里\"\n"
            "- 不需要详细预算和实施计划"
        ),
        "user_prompt_template": (
            "快速诊断以下薄弱区域的核心问题和改造优先级：\n\n"
            "薄弱区域数据（共 {area_count} 个）：\n{areas_text}\n"
            "{preferences_text}\n\n"
            "请给出：\n"
            "1. 薄弱原因分类（如：树种单一、密度不足、冬季落叶等）\n"
            "2. 优先改造 TOP 10 点位（含原因）\n"
            "3. 一句话总结"
        ),
    },
    "cost_optimization": {
        "id": "cost_optimization",
        "name": "成本优化 — 最优投入产出",
        "description": "以预算约束为出发点，找到投入产出比最高的改造方案",
        "system_prompt": (
            "你是一位精通成本控制的绿化工程顾问。\n\n"
            "核心原则：\n"
            "- 每一分钱都要花在刀刃上\n"
            "- 优先选择低成本高收益的改造手段\n"
            "- 区分\"必须做\"和\"可以做\"\n"
            "- 给出3个预算档次方案（经济/标准/豪华）\n"
            "- 所有费用需标注参考单价和依据"
        ),
        "user_prompt_template": (
            "基于预算约束，为以下薄弱区域制定成本最优改造方案：\n\n"
            "薄弱区域数据（共 {area_count} 个）：\n{areas_text}\n"
            "{preferences_text}\n\n"
            "请给出：\n"
            "1. 三档预算方案（经济/标准/豪华），含具体费用明细\n"
            "2. 每档方案的预期 GVI 提升效果\n"
            "3. 性价比最高的 TOP 10 点位\n"
            "4. 常绿树种 vs 落叶树种的成本对比"
        ),
    },
    "seasonal_strategy": {
        "id": "seasonal_strategy",
        "name": "季节策略 — 四季常绿方案",
        "description": "针对冬季GVI薄弱，设计兼顾四季景观的绿化方案",
        "system_prompt": (
            "你是一位园林植物配置专家，专注于四季景观设计和南京地区植物选择。\n\n"
            "要求：\n"
            "- 以冬季GVI提升为核心目标\n"
            "- 必须兼顾春夏秋三季的观赏性\n"
            "- 推荐南京本地适生树种\n"
            "- 给出植物配置的层次结构（乔木/灌木/地被）\n"
            "- 考虑植物生长周期和维护成本"
        ),
        "user_prompt_template": (
            "为以下冬季GVI薄弱区域设计四季常绿方案：\n\n"
            "薄弱区域数据（共 {area_count} 个）：\n{areas_text}\n"
            "{preferences_text}\n\n"
            "请给出：\n"
            "1. 推荐植物清单（常绿乔木/灌木/地被，含南京适生说明）\n"
            "2. 不同道路类型的植物配置模板\n"
            "3. 四季景观效果预测\n"
            "4. 养护难度评级"
        ),
    },
    "community_focused": {
        "id": "community_focused",
        "name": "社区导向 — 民生改善方案",
        "description": "从居民生活体验出发，重点关注社区周边的绿化改善",
        "system_prompt": (
            "你是一位关注民生福祉的城市规划师。\n\n"
            "视角：\n"
            "- 居民日常出行体验为第一优先\n"
            "- 关注学校、医院、社区中心周边的绿化\n"
            "- 考虑老人和儿童的户外活动需求\n"
            "- 绿化不仅要\"看得到\"，还要\"走得进\"\n"
            "- 避免选种有毒或致敏植物"
        ),
        "user_prompt_template": (
            "从居民生活体验角度，为以下薄弱区域制定绿化改善方案：\n\n"
            "薄弱区域数据（共 {area_count} 个）：\n{areas_text}\n"
            "{preferences_text}\n\n"
            "请给出：\n"
            "1. 居民影响最大的 TOP 15 点位（按人流量估算排序）\n"
            "2. 社区口袋花园选址建议\n"
            "3. 安全性考虑（树种选择、视线通透性）\n"
            "4. 居民参与绿化维护的可行方案"
        ),
    },
}

# 自定义模板存储路径
CUSTOM_TEMPLATES_DIR = Path(__file__).parent.parent / "data" / "prompt_templates"


def get_all_templates() -> List[dict]:
    """获取所有模板列表（预设 + 自定义），仅元数据"""
    result = []
    for t in PRESET_TEMPLATES.values():
        result.append({
            "id": t["id"],
            "name": t["name"],
            "description": t["description"],
            "is_preset": True,
        })
    result.extend(list_custom_templates())
    return result


def get_template_by_id(template_id: str) -> Optional[dict]:
    """根据 ID 获取完整模板（优先预设，其次自定义）"""
    if template_id in PRESET_TEMPLATES:
        return PRESET_TEMPLATES[template_id]
    return _load_custom_template(template_id)


def build_user_prompt(
    template_id: str,
    areas: List[dict],
    preferences: Optional[dict] = None,
) -> str:
    """根据模板构建 user prompt"""
    template = get_template_by_id(template_id)
    if not template:
        template = PRESET_TEMPLATES["default"]

    areas_text = json.dumps(areas, ensure_ascii=False, indent=2)
    pref_text = _build_preferences_text(preferences)

    return template["user_prompt_template"].format(
        area_count=len(areas),
        areas_text=areas_text,
        preferences_text=pref_text,
    )


def build_chat_system_prompt(
    template_id: str,
    areas: Optional[List[dict]] = None,
    preferences: Optional[dict] = None,
) -> str:
    """根据模板构建聊天 system prompt"""
    template = get_template_by_id(template_id)
    if not template:
        template = PRESET_TEMPLATES["default"]

    parts = [template["system_prompt"]]

    if areas:
        display_areas = areas[:50]
        areas_text = json.dumps(display_areas, ensure_ascii=False, indent=2)
        parts.append(
            f"\n当前分析的薄弱区域数据（共 {len(areas)} 个，显示前 {len(display_areas)} 个）：\n{areas_text}"
        )

    if preferences:
        parts.append(_build_preferences_text(preferences))

    if not areas:
        parts.append(
            "注意：当前尚未提供薄弱区域数据，如果用户需要具体建议，请提醒他们先获取区域数据。"
        )

    return "\n".join(parts)


def _build_preferences_text(preferences: Optional[dict]) -> str:
    """构建偏好文本"""
    if not preferences:
        return ""

    focus_map = {
        "gvi_improvement": "GVI 提升最大化",
        "cost_efficiency": "成本效益最优",
        "quick_wins": "快速见效",
    }
    budget_map = {"low": "低预算", "medium": "中等预算", "high": "高预算"}
    priority_map = {"all": "全部区域", "high_only": "仅高优先级"}

    return (
        f"\n用户偏好：\n"
        f"- 关注重点：{focus_map.get(preferences.get('focus', ''), preferences.get('focus', '未指定'))}\n"
        f"- 预算范围：{budget_map.get(preferences.get('budget', ''), preferences.get('budget', '未指定'))}\n"
        f"- 优先级：{priority_map.get(preferences.get('priority', ''), preferences.get('priority', '未指定'))}"
    )


# === 自定义模板 CRUD ===

def _ensure_dir():
    CUSTOM_TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)


def _load_custom_template(template_id: str) -> Optional[dict]:
    path = CUSTOM_TEMPLATES_DIR / f"{template_id}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.error(f"加载自定义模板 {template_id} 失败: {e}")
        return None


def list_custom_templates() -> List[dict]:
    """列出所有自定义模板（仅元数据）"""
    _ensure_dir()
    result = []
    for f in CUSTOM_TEMPLATES_DIR.glob("*.json"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            result.append({
                "id": data.get("id", f.stem),
                "name": data.get("name", f.stem),
                "description": data.get("description", ""),
                "is_preset": False,
            })
        except Exception:
            continue
    return result


def save_custom_template(template: dict) -> dict:
    """保存自定义模板"""
    _ensure_dir()
    template_id = template.get("id")
    if not template_id:
        template_id = f"custom_{uuid.uuid4().hex[:8]}"
        template["id"] = template_id

    # 不允许覆盖预设模板
    if template_id in PRESET_TEMPLATES:
        raise ValueError(f"不能覆盖预设模板 '{template_id}'")

    template["is_preset"] = False
    path = CUSTOM_TEMPLATES_DIR / f"{template_id}.json"
    path.write_text(json.dumps(template, ensure_ascii=False, indent=2), encoding="utf-8")
    return template


def delete_custom_template(template_id: str) -> bool:
    """删除自定义模板"""
    if template_id in PRESET_TEMPLATES:
        raise ValueError(f"不能删除预设模板 '{template_id}'")
    path = CUSTOM_TEMPLATES_DIR / f"{template_id}.json"
    if path.exists():
        path.unlink()
        return True
    return False
