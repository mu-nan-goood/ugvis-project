# UGVIS - 城市绿视率分析系统

基于季节性 GVI 数据的城市街道绿化品质空间评价与规划辅助系统。

**GitHub**: https://github.com/mu-nan-goood/ugvis-project

---

## 功能特性

| 模块 | 说明 |
|:---|:---|
| 总览面板 | 系统关键指标、四季 GVI 分布统计 |
| 地图可视化 | 采样点空间分布，支持四季 GVI 切换 |
| 空间分析 | 道路类型 + GVI/NDVI 相关性分析 |
| 季节分析 | 变异系数、稳定性分级、五数概括 |
| 规划决策 | 绿化薄弱区识别、改造优先级排序 |
| 数据管理 | 采样点查询、筛选、导出 |

---

## 技术栈

**前端**: Vue 3 + TypeScript + Vite + Tailwind CSS + Leaflet + ECharts

**后端**: FastAPI + SQLAlchemy + SQLite + Pandas

---

## 项目结构

```
ugvis-project/
├── backend/                 # FastAPI 后端
│   ├── main.py             # 应用入口
│   ├── models.py           # SQLAlchemy 数据模型
│   ├── schemas.py          # Pydantic schemas
│   ├── database.py         # 数据库连接
│   ├── config.py           # 配置管理
│   ├── routers/            # API 路由
│   │   ├── statistics.py   # 统计端点
│   │   ├── points.py       # 采样点端点
│   │   ├── roads.py        # 道路端点
│   │   ├── map.py          # 地图端点
│   │   ├── seasonal_analysis.py  # 季节分析端点
│   │   ├── spatial_analysis.py    # 空间分析端点
│   │   └── planning.py     # 规划决策端点
│   ├── ugvis.db            # SQLite 数据库
│   └── requirements.txt
├── frontend/                # Vue 3 前端
│   ├── src/
│   │   ├── pages/          # 页面组件
│   │   ├── components/     # 通用组件
│   │   ├── services/       # API 调用
│   │   └── stores/         # 状态管理
│   └── package.json
├── docker/                  # Docker 配置
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── docker-compose.yml
├── data/                    # 原始数据（不上传 Git）
└── scripts/                 # 工具脚本
```

---

## 快速启动

### 手动启动（推荐）

**后端**:
```powershell
cd E:\ugvis-project\backend
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
python -m uvicorn main:app --reload --port 8000
```

**前端**（新窗口）:
```powershell
cd E:\ugvis-project\frontend
npm install
npm run dev
```

访问 http://localhost:5173

### Docker Compose 启动

```powershell
cd E:\ugvis-project\docker
docker-compose up -d
```

---

## API 文档

后端启动后访问: http://localhost:8000/docs

### 主要端点

| 方法 | 路径 | 说明 |
|:---|:---|:---|
| GET | `/api/stats` | 全局统计摘要 |
| GET | `/api/points` | 采样点列表（分页） |
| GET | `/api/roads` | 道路统计列表 |
| GET | `/api/map/points` | 地图采样点（采样） |
| GET | `/api/seasonal-analysis` | 四季分析统计 |
| GET | `/api/spatial-analysis` | 空间分析（按道路类型） |
| GET | `/api/planning` | 规划决策数据 |

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

### 数据字段说明

| 字段 | 说明 |
|:---|:---|
| `lat`, `lng` | 经纬度坐标 |
| `gvi_spring`, `gvi_summer`, `gvi_autumn`, `gvi_winter` | 四季绿视率 |
| `ndvi_spring`, `ndvi_summer`, `ndvi_autumn`, `ndvi_winter` | 四季 NDVI |
| `road_type` | 道路类型（rc1-rc4） |

---

## 开发计划

- [x] 项目基础架构
- [x] 前端页面框架
- [x] 后端 API 设计
- [x] 数据库导入（201,377 采样点）
- [x] 四季 GVI/NDVI 分析
- [x] 空间分析（道路类型分组）
- [x] 规划决策模块
- [ ] 用户认证
- [ ] 部署文档

---

## 许可证

MIT
