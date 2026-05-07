# UGVIS AI Agent 架构设计

## 项目定位
基于 UGVIS 后端 API，构建一个 AI Agent 服务层，让大模型（MiMo/Claude/GPT）能够：
1. 理解自然语言查询意图
2. 调用 UGVIS API 获取空间数据
3. 生成专业级绿化规划分析报告

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                     用户交互层                               │
│  Web Chat / CLI / API                                       │
├─────────────────────────────────────────────────────────────┤
│                     Agent 核心层                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ 意图理解     │  │ 工具调用     │  │ 报告生成             │ │
│  │ (LLM)       │→ │ (Function   │→ │ (LLM + 模板)        │ │
│  │             │  │  Calling)   │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                     工具层 (Tools)                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ get_stats │ │ query_   │ │ spatial_ │ │ generate_    │  │
│  │           │ │ points   │ │ analysis │ │ report       │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                     UGVIS 后端 API                           │
│  FastAPI + SQLite + SQLAlchemy                              │
└─────────────────────────────────────────────────────────────┘
```

## 核心组件

### 1. Agent Core (`agent/core.py`)
- 接收用户自然语言输入
- 调用 LLM 进行意图理解和工具选择
- 管理对话上下文
- 协调工具调用链

### 2. Tools 模块 (`agent/tools/`)
- `stats_tool.py` — 全局统计查询
- `spatial_tool.py` — 空间分析查询
- `planning_tool.py` — 规划决策查询
- `report_tool.py` — 报告生成

### 3. LLM 接口 (`agent/llm.py`)
- 统一封装 MiMo / Claude / GPT 调用
- 支持 Function Calling
- 自动重试和错误处理

### 4. 提示词工程 (`agent/prompts/`)
- `system_prompt.md` — Agent 角色定义
- `intent_prompt.md` — 意图理解提示词
- `report_prompt.md` — 报告生成提示词

## 技术栈

- Python 3.10+
- FastAPI (Agent 服务)
- OpenAI-compatible API (MiMo/Claude/GPT)
- Pydantic (数据校验)
- Uvicorn (ASGI 服务器)

## 快速启动

```bash
cd E:\ugvis-project\agent
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8001
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/agent/chat` | 自然语言对话 |
| POST | `/api/agent/query` | 结构化查询 |
| GET | `/api/agent/tools` | 可用工具列表 |
