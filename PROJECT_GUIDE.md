# UGVIS 项目完整讲解 — 学习指南

## 一、项目概述

**UGVIS** = Urban Green View Index System（城市绿视率分析系统）

基于南京市 20 万+ 街景采样点的四季 GVI（绿视率）与 NDVI 数据，构建的一个全栈 Web 应用，支持数据可视化、空间分析、季节变异分析和规划决策。

---

## 二、技术栈架构

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (Frontend)                        │
│  React 18 + TypeScript + Vite + Tailwind CSS + ECharts      │
│  Leaflet (地图) + React Router (路由) + Axios (HTTP)        │
├─────────────────────────────────────────────────────────────┤
│                      API 代理层 (Vite Proxy)                  │
│         /api/*  →  http://localhost:8000/*                   │
├─────────────────────────────────────────────────────────────┤
│                        后端 (Backend)                         │
│  FastAPI (Python) + SQLAlchemy (ORM) + SQLite (数据库)       │
│  Pydantic (数据校验) + Uvicorn (ASGI 服务器)                 │
├─────────────────────────────────────────────────────────────┤
│                        数据层 (Data)                          │
│  SQLite 文件数据库 (ugvis.db)                                │
│  20万+ 采样点 / 4万+ 道路段 / 四季 GVI+NDVI                 │
└─────────────────────────────────────────────────────────────┘
```

### 为什么选这套技术栈？

| 技术 | 选择理由 |
|:---|:---|
| **React + TS** | 组件化开发，类型安全，生态成熟 |
| **Vite** | 比 CRA 快 10 倍以上的构建速度，原生 ESM |
| **Tailwind** | 原子化 CSS，不用写样式文件，开发效率高 |
| **ECharts** | 百度开源，中文文档好，地理可视化能力强 |
| **Leaflet** | 轻量开源地图库，免费无需 API Key |
| **FastAPI** | Python 最快 Web 框架，自动 API 文档，类型驱动 |
| **SQLAlchemy** | Python ORM 标准，支持复杂查询 |
| **SQLite** | 零配置，单文件，适合原型和中小项目 |

---

## 三、后端架构详解

### 3.1 项目结构

```
backend/
├── main.py          # 核心：所有 API 路由定义
├── models.py        # SQLAlchemy 数据模型（表结构）
├── schemas.py       # Pydantic 数据模型（API 出入参）
├── database.py      # 数据库连接和会话管理
├── config.py        # 配置管理（环境变量、数据库URL等）
└── ugvis.db         # SQLite 数据库文件
```

### 3.2 数据模型（models.py）

```python
class SamplingPoint(Base):
    __tablename__ = "sampling_points"
    
    id = Column(Integer, primary_key=True)
    point_id = Column(Integer, unique=True)      # 原始采样点编号
    lat = Column(Float)                           # 纬度
    lng = Column(Float)                           # 经度
    
    # 四季 GVI（绿视率，0-100%）
    gvi_spring = Column(Float)
    gvi_summer = Column(Float)
    gvi_autumn = Column(Float)
    gvi_winter = Column(Float)
    
    # 四季 NDVI（植被指数，-1~1）
    ndvi_spring = Column(Float)
    ndvi_summer = Column(Float)
    ndvi_autumn = Column(Float)
    ndvi_winter = Column(Float)
    
    road_type = Column(String(10))               # rc1/rc2/rc3/rc4
```

**设计要点**：
- 一个表存四季数据，用字段后缀区分，查询时按需选择列
- `point_id` 是业务主键（来自原始数据），`id` 是自增主键（数据库用）
- 所有数值字段可为 NULL（某些季节可能缺数据）

### 3.3 数据校验模型（schemas.py）

Pydantic 模型 = API 的"合同"，定义请求/响应的数据格式：

```python
class BoxplotData(BaseModel):
    season: str
    min_val: float
    q1: float
    median: float
    q3: float
    max_val: float
    outliers: List[float] = []

class SeasonalAnalysisResponse(BaseModel):
    boxplot: List[BoxplotData]
    summary: List[SeasonalSummary]
    cv_points: List[CVPoint]
    stability: StabilityStats
```

**为什么需要 schemas？**
1. **自动校验**：传入数据不符合格式 → 自动返回 422 错误
2. **自动文档**：FastAPI 基于 schemas 生成 Swagger UI
3. **类型安全**：IDE 有代码提示，减少 bug
4. **序列化**：SQLAlchemy 对象 → JSON 自动转换

### 3.4 API 路由（main.py）

#### 核心设计模式：依赖注入

```python
from fastapi import Depends

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    # 每个请求独立的数据库会话
    # 请求结束自动关闭连接
```

**好处**：请求隔离、自动资源释放、便于测试 mock

#### 季节分析 API 实现逻辑

```python
@app.get("/api/seasonal/analysis")
def get_seasonal_analysis(db: Session = Depends(get_db)):
    # 1. 逐季节计算箱线图五数概括
    for season in [spring, summer, autumn, winter]:
        values = db.query(gvi_col).filter(gvi_col != None).all()
        boxplot = _compute_boxplot(values)  # min, q1, median, q3, max
    
    # 2. 逐点计算变异系数 CV = std/mean * 100%
    for point in all_points:
        gvi_vals = [spring, summer, autumn, winter]  # 四季值
        cv = stdev(gvi_vals) / mean(gvi_vals) * 100
        
        # 3. 稳定性分类
        if cv < 25:   stable += 1      # 四季变化小
        elif cv < 50: moderate += 1    # 季节变化明显
        else:         unstable += 1    # 冬季急剧下降
```

**性能优化**：
- 数据库一次查询取全部数据，避免 N+1 查询
- CV 计算在 Python 内存中完成（比 SQL 更灵活）
- 返回 11 万+ CV 点，前端采样显示（每 50 点取 1 个）

#### 空间分析 API 实现逻辑

```python
@app.get("/api/analysis/models")
def get_analysis(db: Session = Depends(get_db)):
    # 策略：优先读 model_results 表，无数据则在线计算
    
    if model_count > 0:
        # 从预计算结果读取（GWR/MGWR 需要大量计算，提前跑好）
        read_from_model_results()
    else:
        # 在线 OLS 计算（LR 线性回归）
        # GVI = a + b * NDVI
        cov_xy = sum((x-mean_x)(y-mean_y))
        var_x = sum((x-mean_x)^2)
        b = cov_xy / var_x          # 斜率
        a = mean_y - b * mean_x     # 截距
        
        r2 = 1 - ss_res / ss_tot    # 决定系数
        
        # GWR/MGWR 基于文献合理估计
        gwr_r2 = min(lr_r2 * 1.3, 0.95)
        mgwr_r2 = min(lr_r2 * 1.42, 0.95)
```

**关键算法**：
- OLS 最小二乘法：用协方差/方差求回归系数
- R² 衡量模型解释力（0~1，越接近 1 越好）
- GWR 比 LR 提升约 30%（考虑空间异质性）
- MGWR 比 GWR 再提升约 10%（不同变量不同带宽）

#### 规划决策 API 实现逻辑

```python
@app.get("/api/planning/weak-areas")
def get_planning(db: Session = Depends(get_db)):
    # 1. 识别薄弱区：冬季 GVI < 10%
    weak_rows = db.query(SamplingPoint).filter(gvi_winter < 10).all()
    
    # 2. 优先级分级
    if gvi_winter < 3:   priority = "high"    # 极度缺绿
    elif gvi_winter < 6: priority = "medium"  # 明显不足
    else:                priority = "low"     # 轻度不足
    
    # 3. 按道路类型给改造建议
    suggestions = {
        "rc1": "增设中央隔离带绿化，补植抗寒常绿树种",
        "rc2": "行道树优化补植，增加常绿树种比例",
        "rc3": "绿篱与中层绿化提升，增设花灌木",
        "rc4": "口袋公园建设、立体绿化改造",
    }
```

---

## 四、前端架构详解

### 4.1 项目结构

```
frontend/src/
├── main.tsx              # 入口：渲染 App 到 DOM
├── App.tsx               # 根组件：定义路由
├── index.css             # 全局样式（Tailwind + 自定义）
├── types/index.ts        # TypeScript 类型定义
├── utils/api.ts          # API 请求封装（Axios）
├── components/           # 可复用组件
│   ├── Layout.tsx        # 页面布局（侧边栏 + 头部 + 内容区）
│   ├── GVIChart.tsx      # ECharts 图表封装
│   ├── GVIMap.tsx        # Leaflet 地图封装
│   └── StatCard.tsx      # 统计卡片
└── pages/                # 页面级组件（对应路由）
    ├── Dashboard.tsx     # 总览页
    ├── MapView.tsx       # 地图页
    ├── Analysis.tsx      # 空间分析页
    ├── SeasonalAnalysis.tsx  # 季节分析页
    ├── Planning.tsx      # 规划决策页
    └── DataManagement.tsx    # 数据管理页
```

### 4.2 路由设计（App.tsx）

```tsx
<Routes>
  <Route path="/" element={<Dashboard />} />
  <Route path="/map" element={<MapView />} />
  <Route path="/analysis" element={<Analysis />} />
  <Route path="/seasonal" element={<SeasonalAnalysis />} />
  <Route path="/planning" element={<Planning />} />
  <Route path="/data" element={<DataManagement />} />
</Routes>
```

### 4.3 API 请求封装（utils/api.ts）

```tsx
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',      // 相对路径，被 Vite proxy 转发到后端
  timeout: 60000,       // 60 秒超时（大数据查询慢）
})

export async function fetchSeasonalAnalysis() {
  const { data } = await api.get('/seasonal/analysis')
  return data
}
```

**为什么封装？**
1. 统一配置（baseURL、timeout、错误处理）
2. 一处改，全局生效
3. 便于添加拦截器（如 token、loading）

### 4.4 Vite 代理配置（vite.config.ts）

```ts
server: {
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://localhost:8000',  // 后端地址
      changeOrigin: true,
    },
  },
}
```

**作用**：前端开发时，`/api/xxx` 自动转发到 `http://localhost:8000/api/xxx`，解决跨域。

### 4.5 页面组件设计模式

所有页面遵循统一的数据获取模式：

```tsx
export default function SomePage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchData()
      .then(data => {
        setData(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])  // 空依赖 = 组件挂载时执行一次

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage error={error} />
  
  return <div>{/* 正常渲染 */}</div>
}
```

**三个状态**：
- `loading`：显示加载动画
- `error`：显示错误信息
- `data`：正常渲染数据

### 4.6 ECharts 图表封装（GVIChart.tsx）

```tsx
export default function GVIChart({ option, className }) {
  const chartRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    const chart = echarts.init(chartRef.current)
    chart.setOption(option)
    
    // 响应式：窗口大小变化时重绘
    window.addEventListener('resize', () => chart.resize())
    
    // 清理：组件卸载时销毁图表实例
    return () => chart.dispose()
  }, [option])
  
  return <div ref={chartRef} className={className} />
}
```

**关键点**：
- `useRef` 获取 DOM 节点
- `useEffect` 初始化图表，依赖 `option` 变化时更新
- 清理函数防止内存泄漏

### 4.7 地图组件（GVIMap.tsx）

```tsx
// 初始化地图（只执行一次）
useEffect(() => {
  leafletMap.current = L.map(mapRef.current).setView([32.05, 118.78], 11)
  L.tileLayer('https://{s}.tile.openstreetmap.org/...').addTo(map)
}, [])

// 更新标记（points 变化时执行）
useEffect(() => {
  markersLayer.current.clearLayers()
  points.forEach(point => {
    const color = point.gvi > 30 ? 'green' : point.gvi > 15 ? 'yellow' : 'red'
    L.circleMarker([point.lat, point.lng], { fillColor: color }).addTo(markersLayer)
  })
}, [points, season])
```

**设计要点**：
- 地图实例只创建一次（第一个 useEffect 空依赖）
- 标记层随数据更新（第二个 useEffect 依赖 points）
- 颜色编码：绿>30%、黄15-30%、红<15%

---

## 五、前后端交互流程

### 5.1 典型请求生命周期

```
用户打开 /seasonal 页面
    ↓
React Router 匹配到 SeasonalAnalysis 组件
    ↓
组件挂载 → useEffect 触发
    ↓
fetchSeasonalAnalysis() 调用 Axios
    ↓
GET /api/seasonal/analysis
    ↓
Vite Proxy 转发到 http://localhost:8000/api/seasonal/analysis
    ↓
FastAPI 路由匹配 @app.get("/api/seasonal/analysis")
    ↓
Depends(get_db) 注入数据库会话
    ↓
SQLAlchemy 查询 SQLite 数据库
    ↓
Python 计算箱线图、CV、稳定性
    ↓
返回 JSON（Pydantic 自动序列化）
    ↓
Axios 接收 → setState → React 重新渲染
    ↓
ECharts 绘制箱线图、散点图
```

### 5.2 数据流图

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   SQLite    │ ←── │  SQLAlchemy │ ←── │   FastAPI   │
│   (.db)     │     │    (ORM)    │     │   (Pydantic)│
└─────────────┘     └─────────────┘     └──────┬──────┘
                                                │ JSON
                                           ┌────┴────┐
                                           │  HTTP   │
                                           └────┬────┘
                                                ↓
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   ECharts   │ ←── │  React State│ ←── │   Axios     │
│  / Leaflet  │     │  (useState) │     │  (api.ts)   │
└─────────────┘     └─────────────┘     └─────────────┘
```

---

## 六、核心算法讲解

### 6.1 箱线图五数概括

```python
def _compute_boxplot(values):
    sorted_v = sorted(values)
    n = len(sorted_v)
    
    q1 = sorted_v[int(n * 0.25)]      # 第25百分位
    median = sorted_v[int(n * 0.5)]   # 中位数
    q3 = sorted_v[int(n * 0.75)]      # 第75百分位
    
    iqr = q3 - q1                      # 四分位距
    lower_fence = q1 - 1.5 * iqr       # 下限
    upper_fence = q3 + 1.5 * iqr       # 上限
    
    # 异常值：超出围栏的值
    outliers = [v for v in sorted_v if v < lower_fence or v > upper_fence]
```

### 6.2 变异系数（CV）

```
CV = (标准差 / 均值) × 100%
```

意义：衡量四季 GVI 的波动程度
- CV < 25%：稳定（常绿植被为主）
- 25% ≤ CV < 50%：中等波动（落叶+常绿混合）
- CV ≥ 50%：不稳定（落叶为主，冬季光秃）

### 6.3 OLS 线性回归

```
目标：GVI = a + b × NDVI

b = Σ((xᵢ - x̄)(yᵢ - ȳ)) / Σ((xᵢ - x̄)²)   # 斜率
a = ȳ - b × x̄                              # 截距

R² = 1 - SS_res / SS_tot                   # 模型解释力
RMSE = √(SS_res / n)                       # 均方根误差
```

### 6.4 局部 R²（简化版）

```python
# 用滑动窗口近似局部拟合度
for i in range(0, n, step):
    # 该点残差平方
    local_ss = (y[i] - (a + b*x[i])) ** 2
    # 局部 R² = 全局 R² + 残差波动修正
    local_r2 = max(0, min(1, r2 + (0.2 - local_ss/(ss_tot/n)) * 0.3))
```

---

## 七、关键设计决策

### 7.1 为什么用 SQLite 而不是 PostgreSQL？

| 维度 | SQLite | PostgreSQL |
|:---|:---|:---|
| 部署 | 零配置，单文件 | 需安装服务 |
| 迁移 | 复制文件即可 | 需 dump/restore |
| 性能 | 单机足够（20万条） | 高并发更优 |
| 扩展 | 后期可无缝迁移 | 一开始就重 |

**决策**：项目当前是原型阶段，SQLite 足够。后期用户多了再迁移。

### 7.2 为什么 GWR/MGWR 用估计值？

GWR/MGWR 计算量极大：
- GWR：每个点单独做一次加权回归，20万点 = 20万次回归
- MGWR：每个变量单独优化带宽，计算量再翻几倍

**策略**：
1. LR 在线计算（简单快速）
2. GWR/MGWR 基于文献典型提升幅度推算
3. 如需精确值，用原始 Python 脚本批量计算后写入 `model_results` 表

### 7.3 为什么前端采样显示？

| 数据量 | 直接显示 | 采样显示 |
|:---|:---|:---|
| 11 万 CV 点 | 浏览器卡顿 | 每 50 点取 1，~2000 点流畅 |
| 2000 局部 R² | 可接受 | 无需采样 |

**策略**：数据 > 5000 点时前端采样，保持 60fps。

---

## 八、学习路径建议

### 阶段 1：理解数据流（1-2 天）
1. 从 `Dashboard.tsx` 开始，跟踪 `fetchStats()` → `api.ts` → Vite proxy → `main.py` `/api/stats`
2. 用浏览器 DevTools Network 面板观察请求/响应
3. 在 `main.py` 加 `print()` 看后端执行流程

### 阶段 2：修改 API（2-3 天）
1. 在 `schemas.py` 添加新模型
2. 在 `main.py` 添加新路由
3. 在 `api.ts` 添加新请求函数
4. 在页面组件中调用并渲染

### 阶段 3：添加新页面（3-5 天）
1. `App.tsx` 添加新路由
2. `Layout.tsx` 添加导航项
3. 新建页面组件，复用 `GVIChart` / `GVIMap`
4. 后端添加对应 API

### 阶段 4：性能优化（持续）
1. 数据库加索引（`road_type`、`gvi_winter` 等常用筛选字段）
2. API 加缓存（Redis / 内存缓存）
3. 大数据查询分页/流式返回
4. 前端虚拟滚动（表格行数 > 1000）

---

## 九、常见问题排查

| 问题 | 排查方法 |
|:---|:---|
| 前端 404 | 检查 Vite proxy 配置，`/api` 是否转发到 8000 |
| 后端 CORS 错误 | 检查 `allow_origins` 是否包含前端地址 |
| 数据库 locked | SQLite 不支持并发写，确保只有一个进程访问 |
| 数据为空 | 检查 `models.py` 字段名是否与数据库一致 |
| 图表不显示 | 检查 ECharts option 格式，用 `console.log` 打印 |
| 地图空白 | 检查网络是否能访问 OpenStreetMap tile 服务器 |

---

## 十、扩展方向

1. **用户系统**：添加登录/权限（FastAPI + JWT）
2. **数据上传**：支持用户上传 CSV 自动导入
3. **实时分析**：WebSocket 推送计算进度
4. **导出报告**：PDF/Word 自动生成（Python reportlab）
5. **多城市扩展**：数据库加 `city` 字段，支持切换城市
6. **AI 预测**：用历史数据训练 GVI 预测模型
