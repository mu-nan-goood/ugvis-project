# UGVIS - 城市绿视率智能规划系统

基于季节性 GVI 数据的城市街道绿化品质空间评价与 AI 改造规划辅助系统。

**GitHub**: https://github.com/mu-nan-goood/ugvis-project

---

## 核心功能

| 模块 | 说明 |
|:---|:---|
| 总览面板 | 系统关键指标、四季 GVI 分布统计 |
| 地图可视化 | 采样点空间分布 + 热力图，支持四季 GVI 切换、高亮点位、路线规划、街景浏览 |
| 空间分析 | 道路类型 + GVI/NDVI 相关性分析 + LR/GWR/MGWR 模型对比 |
| 季节分析 | 变异系数(CV)热力图、稳定性分级、五数概括 |
| AI 改造建议 | 多 LLM 支持、SSE 流式输出、多轮对话、Function Calling |
| 专家面板 | 4 专家（城市规划/生态学/数据分析/经济评估）并行 + Moderator 投票融合 |
| RAG 知识库 | ChromaDB + Nomic Embedding，正向反馈自动索引，50+ 条种子建议（含南京绿化精选） |
| 地图交互闭环 | 薄弱区域 ↔ 地图双向跳转、路线可视化、GVI 剖面图 |
| 建议质量反馈 | 👍👎 评分 + 文字评论 + 统计 + RAG 自动索引 |
| 数据管理 | 采样点查询、筛选、CSV/GeoJSON 导入导出、热力图联动 |
| 用户认证 | JWT + bcrypt，角色控制(admin/analyst/guest)，速率限制 |

---

## 技术栈

**前端**: React 18 + TypeScript + Vite + Tailwind CSS + Leaflet(preferCanvas+Canvas renderer) + ECharts(按需引入)

**后端**: FastAPI + SQLAlchemy + SQLite(201K点/40K道路/472K模型结果) + Alembic

**AI**: DeepSeek / Kimi / Claude / OpenAI / 自定义 LLM + Expert Panel + RAG

**嵌入模型**: LM Studio (nomic-embed-text-v2-moe, 768维) / Ollama (nomic-embed-text)

---

## 项目结构

```
ugvis-project/
├── backend/                 # FastAPI 后端
│   ├── main.py             # 应用入口 + CORS + 速率限制
│   ├── models.py           # SQLAlchemy 数据模型 (6表)
│   ├── schemas.py          # Pydantic schemas（含密码复杂度校验）
│   ├── database.py         # 数据库连接 + 索引
│   ├── config.py           # 配置管理 + JWT 安全检查
│   ├── routers/            # API 路由 (40端点)
│   │   ├── auth.py         # 认证 (登录/注册/刷新/角色管理)
│   │   ├── planning.py     # AI 建议 + SSE + 专家面板
│   │   ├── feedback.py     # 建议反馈 + 统计
│   │   ├── routing.py      # 路线分析 + 替代路线 (Haversine)
│   │   ├── analysis.py     # 空间分析 + 模型对比
│   │   ├── points.py       # 采样点 CRUD + CSV/GeoJSON 导入导出
│   │   ├── seasonal.py     # 四季分析
│   │   └── stats.py        # 全局统计
│   ├── services/           # 业务逻辑层
│   │   ├── llm_client.py   # 多厂商 LLM 客户端 (SSE流式+FC+连接池重建)
│   │   ├── expert_panel.py # 4专家并行 + asyncio.Queue + Moderator
│   │   ├── knowledge_base.py # ChromaDB RAG 管理
│   │   ├── embedding.py    # 向量嵌入 (requests+asyncio.to_thread)
│   │   ├── auth.py         # JWT + bcrypt + 竞态处理
│   │   └── tools/          # Function Calling 工具注册
│   │       └── registry.py # 5 工具: weak_areas/statistics/seasonal_gvi/point_detail/templates
│   ├── alembic/            # 数据库迁移 (2 迁移文件)
│   ├── scripts/            # 数据填充脚本 (种子知识库)
│   ├── tests/              # pytest 测试 (27 用例)
│   ├── ugvis.db            # SQLite 数据库
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                # React 前端
│   ├── src/
│   │   ├── pages/          # 页面组件 (Overview/MapView/Analysis/Planning/Seasonal/DataManagement/Auth)
│   │   ├── components/     # 通用组件 (GVIMap/RouteProfileChart/StreetViewPanel)
│   │   ├── hooks/          # 认证 Hook (useAuth)
│   │   ├── utils/          # API 调用 + 坐标转换 + 类型定义
│   │   └── types/          # TypeScript 类型 (WeakArea 联合类型)
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── docker-compose.yml       # Docker 编排 (后端 + 前端)
├── .env.example            # 后端环境变量模板
├── frontend/.env.example   # 前端环境变量模板
└── data/                   # 研究数据（不上传 Git）
```

---

## 快速启动

### 1. 配置环境变量

```powershell
# 后端
cd backend
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY 和 JWT_SECRET_KEY

# 前端
cd ../frontend
cp .env.example .env
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
npm run dev -- --host
```

访问 http://localhost:5173

> ⚠️ Windows 下前端启动必须使用 `npx vite` 或 `node_modules\.bin\vite.cmd`，不能直接运行 shell 脚本。

### Docker Compose 启动

```powershell
cd E:\ugvis-project
docker-compose up -d
```

---

## AI 功能

### 支持的 LLM 厂商

| 厂商 | 默认模型 | 接口 |
|------|---------|------|
| DeepSeek | deepseek-chat | OpenAI 兼容 |
| Kimi (Moonshot) | moonshot-v1-128k | OpenAI 兼容 |
| Claude | claude-3-5-sonnet | Anthropic 原生 |
| OpenAI | gpt-4o | OpenAI 兼容 |
| 自定义 | 用户指定 | OpenAI 兼容 |

### 功能特性

- **SSE 流式输出**：实时逐字显示建议内容，50ms/20字符缓冲批量推送
- **多轮对话**：支持追问、方案调整、预算协商
- **Function Calling**：AI 可调用 5 个工具获取真实数据
  - `get_weak_areas` — 获取绿化薄弱区域列表
  - `get_statistics` — 获取全局统计摘要
  - `get_seasonal_gvi` — 获取四季 GVI 分布
  - `get_point_detail` — 获取点位详细信息
  - `get_prompt_templates` — 获取 Prompt 模板列表
- **Expert Panel**：4 专家并行分析 + Moderator 投票融合，SSE 实时推送
- **RAG 知识库**：ChromaDB 存储历史正向建议，50+ 条南京绿化精选种子数据，检索增强新建议质量
- **地图交互闭环**：AI 建议点位直接在地图高亮 + 路线规划 + GVI 剖面图
- **建议质量反馈**：👍👎 评分 + 文字评论，正向反馈自动索引到 RAG 知识库
- **5 种 Prompt 模板**：按场景动态切换（薄弱区域/路线规划/季节分析/预算约束/综合规划）

---

## 认证系统

| 特性 | 说明 |
|------|------|
| 算法 | JWT (HS256) + bcrypt |
| 角色 | admin / analyst / guest |
| 速率限制 | login 5/min, refresh 10/min, password-change 3/min |
| 密码策略 | ≥8字符 + 大写 + 小写 + 数字 + 特殊字符 |
| Token 管理 | sessionStorage 存储 + 401 自动刷新队列 |

---

## 数据库

| 表 | 行数 | 说明 |
|----|------|------|
| sampling_points | 201,377 | 四季 GVI/NDVI + road_type |
| road_segments | 40,006 | 道路段几何 |
| model_results | 472,599 | LR/GWR/MGWR 模型结果 |
| seasonal_metrics | 16 | 4 道路类型 × 4 季节 |
| advice_feedback | 11 | AI 建议反馈 |
| users | 4 | 用户账户 |

---

## 安全审计

项目已完成 7 维度安全审计 + 运行时逻辑缺陷审查：

| 维度 | 状态 | 关键修复 |
|------|------|---------|
| 1. 安全防护 | ✅ | 速率限制 / JWT 弱密钥检查 / 密码复杂度 / XSS / CORS / CSV 大小限制 |
| 2. 数据一致性 | ✅ | FK ondelete SET NULL / IntegrityError 处理 / 导出行数上限 |
| 3. API 契约 | ✅ | Token expires_in / season 参数 / 英文 key 映射 |
| 4. 前端安全 | ✅ | Popup XSS 转义 / postMessage origin / 密码校验对齐 / 移除 rehype-raw |
| 5. 依赖安全 | ✅ | 41 CVE 均为间接依赖，无可直接利用项 |
| 6. 配置部署 | ✅ | 绑定 127.0.0.1 / SSE 固定错误提示 |
| 7. 认证授权 | ✅ | JWT 无状态设计 / role 从 DB 验证 |

---

## API 文档

后端启动后访问: http://localhost:8000/docs (Swagger UI)

---

## 环境要求

- Python 3.10+
- Node.js 18+
- npm 9+
- (可选) LM Studio + nomic-embed-text-v2-moe（RAG 知识库）
- (可选) Docker Desktop（容器化部署）

---

## 升级路线（8/8 已完成）

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

## 最近更新

### 2026-05-23 — 12项已知限制全部修复

- **R18 Function Calling 原生化**: 从 XML 标签解析重写为 OpenAI 原生 `tool_calls` API（Claude 保留 XML 回退），消除二次解析
- **R5 季节分析异步化**: 201K 点全量计算从同步阻塞改为 `async` + `asyncio.to_thread` 后台计算
- **R6 local_r2 估算升级**: 从文献硬系数改为 NDVI 方差局部加权估算
- **R7 替代路线排序优化**: 从按距离排序改为 GVI 投影得分排序（0.6×GVI + 0.4×路线适配度）
- **R16 SSE 解析重构**: 提取 `parseSSEResponse<T>()` 通用解析器，消除三处重复代码
- **R2 线程安全修复**: feedback.py daemon 线程改为 `asyncio.run_coroutine_threadsafe` 调度到主循环
- **R4 FC 流式化**: 首轮调用改为流式输出 + `start` SSE 事件提供 UI 反馈
- **R12 自定义事件统一**: AIChatDrawer 改为监听 `CustomEvent('ugvis-ask-ai')`
- **R15 地图动画修复**: `setView` 禁用动画消除与拖拽冲突
- **R2-tech SQLite UDF**: 注册 Python 端 `stddev`/`stddev_samp` 聚合函数
- **R3-tech 知识库扩充**: 20 条南京城市绿化精选建议 + `/seed` 管理端点，ChromaDB 从 33 条扩至 50+
- **类型补全**: `ChatStreamEvent` 增加 `start` / `done` 变体

### 2026-05-22 — 前端渲染优化 & API 修复

- **季节分析 API 响应优化**: 从 10.3MB 压缩至 158KB（cv_limit 采样）
- **箱线图渲染修复**: GVI=0 拉低 y 轴问题，增加五数概括 tooltip
- **数据管理地图修复**: Leaflet 容器高度链修复，改用热力图模式
- **地图 API 422 修复**: limit 上限从 20000 提至 50000
- **React Hooks 顺序修复**: SeasonalAnalysis useMemo 移至 early return 前

---

## 许可证

MIT