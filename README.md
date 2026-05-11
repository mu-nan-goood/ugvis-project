# UGVIS - 城市绿视率智能规划系统

基于季节性 GVI 数据的城市街道绿化品质空间评价与 AI 改造规划辅助系统。

**GitHub**: https://github.com/mu-nan-goood/ugvis-project

---

## 核心功能

| 模块 | 说明 |
|:---|:---|
| 总览面板 | 系统关键指标、四季 GVI 分布统计 |
| 地图可视化 | 采样点空间分布，支持四季 GVI 切换、高亮点位、路线规划 |
| 空间分析 | 道路类型 + GVI/NDVI 相关性分析 |
| 季节分析 | 变异系数、稳定性分级、五数概括 |
| AI 改造建议 | **多 LLM 支持**、流式输出、多轮对话、Function Calling |
| 地图交互闭环 | 薄弱区域 ↔ 地图双向跳转、路线可视化 |
| 数据管理 | 采样点查询、筛选、CSV 导入导出 |

---

## 技术栈

**前端**: React 18 + TypeScript + Vite + Tailwind CSS + Leaflet + ECharts

**后端**: FastAPI + SQLAlchemy + SQLite + Pandas

**AI**: DeepSeek / Kimi / Claude / OpenAI / 自定义 LLM

---

## 项目结构

```
ugvis-project/
├── backend/                 # FastAPI 后端
│   ├── main.py             # 应用入口
│   ├── models.py           # SQLAlchemy 数据模型
│   ├── schemas.py          # Pydantic schemas（含 LLM 请求/响应模型）
│   ├── database.py         # 数据库连接
│   ├── config.py           # 配置管理
│   ├── routers/            # API 路由
│   │   ├── statistics.py   # 统计端点
│   │   ├── points.py       # 采样点端点（含 CSV 导入）
│   │   ├── roads.py        # 道路端点
│   │   └── planning.py     # AI 改造建议端点
│   ├── services/           # 业务逻辑层
│   │   ├── llm_client.py   # 多厂商 LLM 客户端（DeepSeek/Kimi/Claude/OpenAI）
│   │   ├── openclaw_client.py  # OpenClaw agent 调用
│   │   ├── prompt_templates.py # AI Prompt 模板管理
│   │   └── tools/          # Function Calling 工具注册
│   │       └── registry.py # get_weak_areas / get_statistics / get_seasonal_gvi 等
│   ├── ugvis.db            # SQLite 数据库
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                # React 前端
│   ├── src/
│   │   ├── pages/          # 页面组件（Overview / MapView / Analysis / Planning 等）
│   │   ├── components/     # 通用组件（GVIMap / StatCard / DataTable 等）
│   │   └── utils/          # API 调用、类型定义
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── docker-compose.yml        # Docker 编排（后端 + 前端 + nginx）
└── data/                    # 研究数据（不上传 Git）
```

---

## 快速启动

### 手动启动

**后端**（需在 `backend/` 目录运行，使 SQLite 相对路径解析正确）:
```powershell
cd E:\ugvis-project\backend
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
python -m uvicorn main:app --reload --port 8000 --host 127.0.0.1
```

**前端**（新窗口，需 --host 监听 IPv4）：
```powershell
cd E:\ugvis-project\frontend
npm install
npm run dev -- --host
```

访问 http://localhost:5173

### Docker Compose 启动

```powershell
cd E:\ugvis-project
docker-compose up -d
```

访问 http://localhost:3000

---

## AI 改造建议功能

### 支持的 LLM 厂商

| 厂商 | 默认模型 | 接口 |
|------|---------|------|
| DeepSeek | deepseek-chat | OpenAI 兼容 |
| Kimi (Moonshot) | moonshot-v1-128k | OpenAI 兼容 |
| Claude | claude-3-5-sonnet | Anthropic 原生 |
| OpenAI | gpt-4o | OpenAI 兼容 |
| 自定义 | 用户指定 | OpenAI 兼容 |

### AI 功能特性

- **流式输出（SSE）**：实时逐字显示建议内容
- **多轮对话**：支持追问、方案调整、预算协商
- **Function Calling**：AI 可调用5个工具获取真实数据
  - `get_weak_areas` — 获取绿化薄弱区域列表
  - `get_statistics` — 获取全局统计摘要
  - `get_seasonal_gvi` — 获取四季 GVI 分布
  - `get_point_detail` — 获取点位详细信息
  - `get_prompt_templates` — 获取 Prompt 模板列表
- **地图交互闭环**：AI 建议点位可直接在地图上高亮显示和规划路线

### 配置 LLM

1. 打开 Planning 页面
2. 点击"⚙️ LLM 配置"展开配置面板
3. 选择厂商、输入 API Key、选择/自定义模型
4. 配置自动保存到浏览器 localStorage

---

## API 文档

后端启动后访问: http://localhost:8000/docs

### 主要端点

| 方法 | 路径 | 说明 |
|:---|:---|:---|
| GET | `/api/stats` | 全局统计摘要 |
| GET | `/api/points` | 采样点列表（分页） |
| POST | `/api/points/import` | CSV 批量导入采样点 |
| GET | `/api/roads` | 道路统计列表 |
| GET | `/api/map/points` | 地图采样点（采样） |
| GET | `/api/seasonal-analysis` | 四季分析统计 |
| GET | `/api/spatial-analysis` | 空间分析（按道路类型） |
| GET | `/api/planning/weak-areas` | 绿化薄弱区域列表 |
| GET | `/api/planning/statistics` | 薄弱区域统计 |
| POST | `/api/planning/renovation-advice` | 生成 AI 改造建议 |
| POST | `/api/planning/chat-stream` | AI 多轮对话（流式） |

---

## 数据库

- **类型**: SQLite (`backend/ugvis.db`)
- **采样点**: 201,377 条（含四季 GVI/NDVI 值）
- **道路段**: 40,006 条
- **字段**: `rc1-rc4` 四类道路类型

---

## 开发说明

### 环境要求

- Python 3.10+
- Node.js 18+
- npm 9+

### 关键配置文件

| 文件 | 说明 |
|------|------|
| `backend/config.py` | 数据库路径、CORS 配置 |
| `.env`（可选） | LLM API Key 环境变量 |
| `docker-compose.yml` | Docker 编排配置 |

### AI 开发（Function Calling）

工具定义在 `backend/services/tools/registry.py`，schema 格式为 OpenAI 嵌套格式。

添加新工具：
1. 在 `registry.py` 中定义工具函数
2. 在 `TOOL_REGISTRY` 中注册
3. 工具自动暴露给 LLM

---

## 已完成开发计划

- [x] 项目基础架构
- [x] 前端页面框架（React + TypeScript）
- [x] 后端 API 设计（FastAPI + 路由模块化）
- [x] 数据库导入（201,377 采样点 + 40,006 道路段）
- [x] 四季 GVI/NDVI 分析
- [x] 空间分析（道路类型分组）
- [x] 规划决策模块
- [x] **AI 改造建议**（流式输出、多轮对话、Function Calling）
- [x] **地图交互闭环**（双向跳转、高亮显示、路线可视化）
- [ ] 用户认证
- [ ] 部署文档

---

## 升级路线（8 项，已完成 5 项）

| # | 改进项 | 状态 |
|:--|:---|:---|
| 1 | SSE 流式输出 | ✅ 已完成 |
| 2 | 多轮对话 | ✅ 已完成 |
| 3 | Prompt 动态化 | ✅ 已完成 |
| 4 | Function Calling | ✅ 已完成 |
| 5 | 地图交互闭环 | ✅ 已完成 |
| 6 | 建议质量反馈 | ⬜ 未开始 |
| 7 | RAG（检索增强生成） | ⬜ 未开始 |
| 8 | 多 Agent | ⬜ 未开始 |

---

## 许可证

MIT