# UGVIS — 城市绿视率智能规划系统

> 基于 20 万+ 采样点季节性 GVI 数据的城市街道绿化品质空间评价与 AI 改造规划辅助系统

**GitHub**: https://github.com/mu-nan-goood/ugvis-project

---

## 🖼 系统截图

| 总览面板 | 地图可视化 |
|:---:|:---:|
| ![Dashboard](docs/dashboard.png) | ![Map](docs/map.png) |

| 空间分析 | AI 改造建议 |
|:---:|:---:|
| ![Analysis](docs/analysis.png) | ![Planning](docs/planning.png) |

---

## ✨ 核心功能

| 模块 | 说明 |
|:---|:---|
| 📊 总览面板 | 系统关键指标（CountUp 动画）、四季 GVI 分布统计、道路类型分布 |
| 🗺 地图可视化 | 采样点空间分布 + 热力图，四季 GVI 切换、高亮点位、路线规划、街景浏览、高德步行导航 |
| 🏙 3D 可视化 | Cesium 3D 城市模型，GVI 热力柱体、2D/3D 模式切换、地形 + 建筑渲染 |
| 📈 空间分析 | 道路类型 + GVI/NDVI 相关性分析 + OLS/GWR/MGWR 三模型对比 + 残差分析 + 雷达图 |
| 🍃 季节分析 | CV 变异系数热力图、稳定性分级地图、夏冬差值空间分布、五数概括 |
| 🤖 AI 改造建议 | 多 LLM 支持、SSE 流式输出、多轮对话、Function Calling 5 工具 |
| 👥 专家面板 | 4 专家（城市规划/生态学/数据分析/经济评估）并行 + Moderator 投票融合 |
| 📚 RAG 知识库 | ChromaDB + Nomic Embedding (768维)，正向反馈自动索引，50+ 条南京绿化精选种子 |
| 🔗 地图交互闭环 | 薄弱区域 ↔ 地图双向跳转、紫色虚线路线可视化、GVI 剖面图、高优先级路线预览 |
| 👍 建议质量反馈 | 评分 + 文字评论 + 统计 + RAG 自动索引 |
| 📋 数据管理 | 采样点查询/筛选、CSV/GeoJSON 导入导出、地图联动高亮、sticky 定位 |
| 🔐 用户认证 | JWT(HS256) + bcrypt，角色控制(admin/analyst/guest)，速率限制，自动刷新队列 |
| 🎨 UI 设计系统 | Design Token、深色/浅色模式、Skeleton 加载态、EmptyState 空态、framer-motion 动画 |

---

## 🛠 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| **前端** | React 18 + TypeScript + Vite | SPA 架构，7 页面懒加载 |
| **样式** | Tailwind CSS + Design Token | 深/浅色主题，framer-motion 动画 |
| **地图 2D** | Leaflet (SVG 渲染器) | 热力图 + 散点双模式，3 种底图，比例尺 |
| **地图 3D** | Cesium | World Terrain + OSM Buildings，2D/3D 切换 |
| **图表** | ECharts (按需引入) | 折线/柱状/箱线/雷达/散点图，工具栏导出 |
| **导航** | 高德路线规划 API | 步行导航，GCJ-02/WGS-84 坐标转换，超时回退直线 |
| **街景** | 高德/百度 JS API | iframe 嵌入式全景，双引擎切换 |
| **后端** | FastAPI + Uvicorn | 37 端点，SSE 流式，CORS + 速率限制 |
| **ORM** | SQLAlchemy + Alembic | 7 表，201K 采样点 / 40K 道路段 / 472K 模型结果 |
| **数据库** | SQLite | WGS-84 坐标系，Python UDF 注册 stddev |
| **AI** | DeepSeek / Kimi / Claude / OpenAI | SSE 流式 + FC + 多轮对话 + Expert Panel |
| **嵌入** | LM Studio / Ollama | nomic-embed-text-v2-moe 768 维 |
| **RAG** | ChromaDB | 50+ 南京绿化精选种子数据 |
| **认证** | JWT (HS256) + bcrypt | 3 角色，速率限制，sessionStorage + 401 自动刷新 |

---

## 📁 项目结构

```
ugvis-project/
├── backend/                    # FastAPI 后端
│   ├── main.py                # 应用入口 + CORS + 速率限制
│   ├── models.py              # SQLAlchemy 数据模型 (7表)
│   ├── schemas.py             # Pydantic schemas（含密码复杂度校验）
│   ├── database.py            # 数据库连接 + 索引
│   ├── config.py              # 配置管理 + JWT 安全检查
│   ├── routers/               # API 路由 (37端点)
│   │   ├── auth.py            # 认证 (登录/注册/刷新/角色管理)
│   │   ├── planning.py        # AI 建议 + SSE + 专家面板
│   │   ├── feedback.py        # 建议反馈 + 统计
│   │   ├── routing.py         # 路线分析 + 替代路线 (Haversine)
│   │   ├── analysis.py        # 空间分析 + 三模型回归线/残差
│   │   ├── points.py          # 采样点 CRUD + CSV/GeoJSON 导入导出
│   │   ├── seasonal.py        # 四季分析 (async + 采样策略)
│   │   ├── map.py             # 地图数据端点 (含 point_id)
│   │   └── stats.py           # 全局统计
│   ├── services/              # 业务逻辑层
│   │   ├── llm_client.py      # 多厂商 LLM 客户端 (SSE流式+FC+中文身份)
│   │   ├── expert_panel.py    # 4专家并行 + asyncio.Queue + Moderator
│   │   ├── knowledge_base.py  # ChromaDB RAG 管理 (uuid4 ID)
│   │   ├── embedding.py       # 向量嵌入 (requests+asyncio.to_thread)
│   │   ├── auth.py            # JWT + bcrypt + 竞态处理
│   │   └── tools/             # Function Calling 工具注册
│   │       └── registry.py    # 5工具 + inspect.signature 参数过滤
│   ├── alembic/               # 数据库迁移
│   ├── scripts/               # 数据填充脚本 (种子知识库)
│   ├── tests/                 # pytest 测试 (27 用例)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # React 前端
│   ├── src/
│   │   ├── pages/             # 7 页面 (Overview/MapView/Analysis/Planning/Seasonal/DataManagement/Auth)
│   │   ├── components/        # 通用组件
│   │   │   ├── GVIMap.tsx     # Leaflet 地图核心 (SVG渲染, 热力图+散点, 3底图, 高亮+路线)
│   │   │   ├── GVI3DMap.tsx   # Cesium 3D 热力柱体
│   │   │   ├── StreetViewPanel.tsx  # 双引擎街景 (高德/百度)
│   │   │   ├── RouteAnalysisPanel.tsx # 路线分析 + GVI 剖面图
│   │   │   ├── GVIChart.tsx   # ECharts 按需引入 (含雷达图)
│   │   │   ├── Layout.tsx     # 全局布局 + 侧边栏
│   │   │   ├── StatCard.tsx   # 统计卡片 + CountUp
│   │   │   ├── Skeleton.tsx   # 骨架屏加载态
│   │   │   ├── EmptyState.tsx # 空状态占位
│   │   │   ├── AnimatedCard.tsx # framer-motion 卡片
│   │   │   └── CountUp.tsx    # 数字滚动动画
│   │   ├── hooks/             # 认证 Hook (useAuth)
│   │   ├── utils/             # API 调用 + 坐标转换 + 路线规划
│   │   │   ├── api.ts         # Axios 实例 + 401 刷新队列
│   │   │   ├── coordTransform.ts # WGS84↔GCJ02↔BD09 三坐标系转换
│   │   │   └── routePlanner.ts # 高德步行路线规划 (分段+超时回退)
│   │   └── types/             # TypeScript 类型
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── docker-compose.yml          # Docker 编排
├── .env.example               # 后端环境变量模板
├── frontend/.env.example      # 前端环境变量模板
└── data/                      # 研究数据（不上传 Git）
```

---

## 🚀 快速启动

### 1. 配置环境变量

```powershell
# 后端
cd backend
Copy-Item .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY 和 JWT_SECRET_KEY

# 前端
cd ..\frontend
Copy-Item .env.example .env
# 编辑 .env，填入 VITE_AMAP_KEY 和 VITE_BAIDU_AK（可选，街景功能需要）
```

### 2. 启动后端

```powershell
cd E:\ugvis-project\backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000 --host 127.0.0.1
```

### 3. 启动前端

```powershell
cd E:\ugvis-project\frontend
npm install
npx vite
```

访问 http://localhost:5173，默认账号 `admin` / `Admin@1234`

> ⚠️ Windows 下前端启动必须使用 `npx vite` 或 `node node_modules/vite/bin/vite.js`。

### Docker Compose 启动

```powershell
cd E:\ugvis-project
docker-compose up -d
```

---

## 🤖 AI 功能

### 支持的 LLM 厂商

| 厂商 | 默认模型 | 接口 |
|------|---------|------|
| DeepSeek | deepseek-chat | OpenAI 兼容 |
| Kimi (Moonshot) | moonshot-v1-128k | OpenAI 兼容 |
| Claude | claude-3-5-sonnet | Anthropic 原生 |
| OpenAI | gpt-4o | OpenAI 兼容 |
| 自定义 | 用户指定 | OpenAI 兼容 |

### 功能特性

- **SSE 流式输出**：实时逐字显示建议，50ms/20字符缓冲批量推送
- **多轮对话**：追问、方案调整、预算协商
- **Function Calling**：AI 可调用 5 个工具获取真实数据
  - `get_weak_areas` — 绿化薄弱区域列表
  - `get_statistics` — 全局统计摘要
  - `get_seasonal_gvi` — 四季 GVI 分布
  - `get_point_detail` — 点位详细信息
  - `get_prompt_templates` — Prompt 模板列表
- **参数幻觉过滤**：`inspect.signature` 过滤 LLM 编造的未知参数
- **Expert Panel**：4 专家并行分析 + Moderator 投票融合，SSE 实时推送
- **RAG 知识库**：ChromaDB + 正向反馈自动索引 + 50+ 条南京绿化精选
- **地图交互闭环**：AI 建议点位直接在地图高亮 + 路线规划 + GVI 剖面图
- **中文身份**：系统提示词为中文，命名"UGVIS 绿视助手"，避免模型信息泄漏

---

## 🔐 认证系统

| 特性 | 说明 |
|------|------|
| 算法 | JWT (HS256) + bcrypt |
| 角色 | admin / analyst / guest |
| 速率限制 | login 5/min, refresh 10/min, password-change 3/min, AI 10/min |
| 密码策略 | ≥8字符 + 大写 + 小写 + 数字 + 特殊字符 |
| Token 管理 | sessionStorage 存储 + 401 自动刷新队列 |
| MVP 限制 | JWT 无吊销（无状态设计），logout 不设黑名单 |

---

## 🗄 数据库

| 表 | 行数 | 说明 |
|----|------|------|
| sampling_points | 201,377 | 四季 GVI/NDVI + road_type + point_id |
| road_segments | 40,006 | 道路段几何 |
| model_results | 472,599 | OLS/GWR/MGWR 模型结果 + 残差 |
| seasonal_metrics | 16 | 4 道路类型 × 4 季节 |
| advice_feedback | 11 | AI 建议反馈 |
| users | 4 | 用户账户 |
| knowledge_items | 50+ | RAG 种子知识 |

---

## 🛡 安全审计

项目已完成 **7 维度安全审计** + **17 项运行时逻辑缺陷审查** + **12 项已知限制全部修复**：

| 维度 | 状态 | 关键修复 |
|------|------|---------|
| 1. 安全防护 | ✅ | 速率限制 / JWT 弱密钥检查 / 密码复杂度 / XSS / CORS / CSV 大小限制 |
| 2. 数据一致性 | ✅ | FK ondelete SET NULL / IntegrityError 处理 / 导出行数上限 |
| 3. API 契约 | ✅ | Token expires_in / season 参数 / 英文 key 映射 |
| 4. 前端安全 | ✅ | Popup XSS 转义 / postMessage origin / 密码校验 / 移除 rehype-raw |
| 5. 依赖安全 | ✅ | 41 CVE 均为间接依赖，无可直接利用项 |
| 6. 配置部署 | ✅ | 绑定 127.0.0.1 / SSE 固定错误提示 |
| 7. 认证授权 | ✅ | JWT 无状态设计 / role 从 DB 验证 |

---

## 📊 项目规模

| 指标 | 数值 |
|------|------|
| 后端代码 | ~6,315 行 Python |
| 前端代码 | ~7,424 行 TypeScript/TSX |
| 总代码 | ~13,739 行 |
| API 端点 | 37 个 |
| 数据库表 | 7 张 |
| 测试用例 | 72 个 (pytest 27 + vitest 45) |
| Function Calling 工具 | 5 个 |
| React 页面 | 7 个 |

---

## 📝 API 文档

后端启动后访问: http://localhost:8000/docs (Swagger UI)

---

## 💻 环境要求

- Python 3.10+
- Node.js 18+
- npm 9+
- (可选) LM Studio + nomic-embed-text-v2-moe — RAG 知识库
- (可选) 高德 API Key — 步行导航 + 街景
- (可选) 百度地图 AK — 街景备用
- (可选) Cesium ion Token — 3D 地形 + 建筑（无 Token 自动降级 OSM 瓦片）
- (可选) Docker Desktop — 容器化部署

---

## 🏗 升级路线（8/8 已完成）

| # | 改进项 | 状态 |
|:--|:---|:---|
| 1 | SSE 流式输出 | ✅ |
| 2 | 多轮对话 | ✅ |
| 3 | Prompt 动态化 | ✅ |
| 4 | Function Calling | ✅ |
| 5 | 地图交互闭环 | ✅ |
| 6 | 建议质量反馈 | ✅ |
| 7 | RAG（检索增强生成） | ✅ |
| 8 | Expert Panel（多专家） | ✅ |

---

## 📅 更新日志

### 2026-06-04 — ID 体系统一 & 高优先级路线 & UI 增强

- **ID 体系统一**：全系统从自增主键 `id` 切换为业务 ID `point_id`，修复跨页面高亮/路线/跳转断裂
- **高优先级路线预览**：Planning → MapView 跳转，蓝色脉冲高亮 + 紫色虚线路线 + 编号标记
- **Leaflet fitBounds 崩溃修复**：禁用缩放动画消除 `_leaflet_pos` 竞态
- **AI 身份泄漏修复**：system prompt 改中文，命名"UGVIS 绿视助手"，防止模型信息泄漏
- **FC 参数幻觉过滤**：`inspect.signature` 过滤 LLM 编造的未知工具参数
- **async generator 修复**：消除 `chat_stream` 重复 `done` 事件
- **UI 设计系统**：Design Token、Skeleton/EmptyState/CountUp/AnimatedCard 组件、framer-motion 动画
- **数据管理地图修复**：容器高度 0 修复、sticky 定位、地图与表格筛选联动
- **高德步行导航集成**：分段路线规划、15s 超时回退直线、GCJ-02 坐标转换

### 2026-06-02 — 散点图修复 & 三模型回归线 & 高德导航

- **散点图 GVI 列动态化**：支持按季节参数正确查询
- **三模型回归线 + 残差分析**：OLS/GWR/MGWR 后端端点完成
- **高德路线规划 API 集成**：步行导航、GCJ-02/WGS-84 转换
- **SeasonalAnalysis Hooks 顺序修复**：useMemo 移至 early return 前
- **GVIMap 底图管理统一**：单一 base-map switch Effect

### 2026-05-30 — 后端增强 & 3D 稳定化

- **Cesium 3D 模式锁定**: 消除 2D/3D 切换崩溃
- **GVI3DMap 清理增强**: destroy() 前预清理 primitives + entities
- **AI 端点速率限制**: 10次/分钟
- **数据库索引增强**: advice_feedback.user_id + seasonal_metrics 复合索引
- **API Key 日志脱敏**

### 2026-05-28 — 坐标系偏移 & clearRect 崩溃

- **坐标系偏移修复**: GCJ-02→WGS-84 逆转换，误差从 300-500m 降至 <1m
- **Leaflet clearRect 崩溃**: SVG renderer 统一方案
- **路线撤销**: ↩ 按钮 + 200m 等间隔多点采样
- **CSV 坐标系标注**: `# 坐标系: WGS-84 (EPSG:4326)`

### 2026-05-26 — Cesium 3D 集成

- **Cesium 3D 落地**: 热力柱体 + World Terrain + 2D/3D 切换
- **热力图参数优化**: radius 35 / blur 30 / minOpacity 0.2
- **local_r2 模型联动**: 按模型类型过滤热力图

### 2026-05-23 — 12 项已知限制全部修复

- **R18 FC 原生化**: XML 标签 → OpenAI `tool_calls` API
- **R5 季节分析异步化**: `async` + `asyncio.to_thread`
- **R6 local_r2 估算升级**: NDVI 方差局部加权
- **R7 替代路线排序**: GVI 投影得分 (0.6×GVI + 0.4×路线适配度)
- **R16 SSE 解析重构**: `parseSSEResponse<T>()` 通用解析器
- **R2 线程安全**: `asyncio.run_coroutine_threadsafe`
- **R2-tech SQLite UDF**: `stddev`/`stddev_samp` 聚合函数
- **R3-tech 知识库扩充**: 50+ 南京绿化精选 + `/seed` 管理端点

---

## 📄 许可证

MIT
