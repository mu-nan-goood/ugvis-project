# UGVIS - 城市绿视率分析系统

基于季节性GVI数据的城市街道绿化品质空间评价与规划辅助系统。

## 项目结构

```
ugvis-project/
├── frontend/          # React + TypeScript 前端
├── backend/           # FastAPI + PostgreSQL 后端
├── data/              # 数据文件
├── docker/            # Docker 配置
└── scripts/           # 工具脚本
```

## 快速开始

### 1. 使用 Docker Compose（推荐）

```bash
cd docker
docker-compose up -d
```

这将启动：
- PostgreSQL + PostGIS (端口 5432)
- FastAPI 后端 (端口 8000)
- React 前端 (端口 5173)

### 2. 手动安装

#### 后端

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 运行
python main.py
```

#### 前端

```bash
cd frontend

# 安装依赖
npm install

# 开发服务器
npm run dev

# 构建
npm run build
```

### 3. 导入数据

```bash
python scripts/import_data.py --csv /path/to/gvi_4seasons.csv
```

## 功能模块

- **总览面板**: 系统关键指标和统计图表
- **地图可视化**: 四季GVI空间分布，支持切换
- **空间分析**: MGWR/GWR/LR模型结果展示
- **季节分析**: 变异系数、稳定性分区
- **规划决策**: 薄弱区识别、改造建议
- **数据管理**: 数据查询、筛选、导出

## 技术栈

### 前端
- React 18 + TypeScript
- Vite (构建工具)
- Tailwind CSS (样式)
- Leaflet (地图)
- ECharts (图表)
- Zustand (状态管理)

### 后端
- FastAPI (Web框架)
- SQLAlchemy (ORM)
- GeoAlchemy2 (空间数据库)
- PostgreSQL + PostGIS
- Pandas (数据处理)

## API 文档

启动后端后访问: http://localhost:8000/docs

## 数据格式

CSV文件应包含以下列：
- `lat`, `lng`: 经纬度坐标
- `gvi_spring`, `gvi_summer`, `gvi_autumn`, `gvi_winter`: 四季GVI值
- `ndvi`: NDVI指数
- `road_type`: 道路类型 (rc1-rc4)

## 开发计划

- [x] 项目基础架构
- [x] 前端页面框架
- [x] 后端API设计
- [ ] 数据库导入脚本
- [ ] MGWR模型集成
- [ ] 用户认证
- [ ] 数据可视化优化
- [ ] 部署文档

## 许可证

MIT
