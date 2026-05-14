# UGVIS 生产部署指南

本文档描述如何在生产环境部署 UGVIS 系统。

---

## 环境要求

| 组件 | 版本要求 |
|:---|:---|
| Docker | 20.10+ |
| Docker Compose | 2.0+ |
| PostgreSQL | 14+（如不使用 Docker） |
| Python | 3.10+（如不使用 Docker） |
| Node.js | 18+（如手动构建前端） |

---

## 快速启动（Docker Compose）

### 1. 准备环境变量

在项目根目录创建 `.env` 文件（参考 `.env.example`）：

```bash
# 数据库（Docker Compose 自动注入，无需手动配置）
# DATABASE_URL=postgresql+psycopg2://ugvis:ugvis123@db:5432/ugvis_db

# CORS 白名单（逗号分隔，允许的前端域名）
CORS_ORIGINS=https://your-domain.com

# LLM API Keys（至少配置一个）
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
# OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
# KIMI_API_KEY=sk-xxxxxxxxxxxxxxxx
# CLAUDE_API_KEY=sk-xxxxxxxxxxxxxxxx

# 默认 LLM
LLM_DEFAULT_PROVIDER=deepseek
LLM_DEFAULT_MODEL=deepseek-chat

# Embedding API（用于 RAG 知识库）
# EMBEDDING_API_BASE=https://api.deepseek.com/v1
```

### 2. 启动服务

```bash
cd E:\ugvis-project
docker-compose up -d
```

**重要**：`docker-compose.yml` 中的 `cors_origins` 环境变量引用根目录 `.env`。
如果 `CORS_ORIGINS` 未配置，后端将使用默认值 `http://localhost:5173,http://localhost:3000`（仅限开发）。

### 3. 初始化数据库

首次启动时，数据库会自动初始化（`docker/init/0init.sql`）。

如需手动初始化：
```bash
docker exec -it ugvis_db psql -U ugvis -d ugvis_db -f /docker-entrypoint-initdb.d/0init.sql
```

### 4. 验证部署

```bash
# 检查服务状态
docker-compose ps

# 检查后端健康
curl http://localhost:8000/api/health

# 检查前端（构建后）
curl http://localhost:3000
```

访问 http://localhost:3000

---

## 手动部署（不使用 Docker）

### 后端

```bash
cd E:\ugvis-project\backend

# 安装依赖
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 配置环境变量
cp ../.env.example .env
# 编辑 .env，填入真实 API Keys 和 CORS_ORIGINS

# 初始化数据库（SQLite 零配置，ugvis.db 自动创建）
# 如需 PostgreSQL：
# pip install psycopg2-binary
# DATABASE_URL=postgresql+psycopg2://user:pass@localhost:5432/ugvis_db

# 启动
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### 前端

```bash
cd E:\ugvis-project\frontend

# 安装依赖
npm install

# 开发模式
npm run dev -- --host

# 生产构建
npm run build
# 产物在 dist/ 目录，可配 nginx 托管
```

### Nginx 配置（生产前端）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /path/to/ugvis-project/frontend/dist;
    index index.html;

    # 前端静态文件
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### HTTPS（推荐使用 Let's Encrypt）

```bash
# 安装 certbot
apt install certbot python3-certbot-nginx

# 获取证书（需域名已解析）
certbot --nginx -d your-domain.com

# 自动续期
certbot renew --dry-run
```

---

## 数据管理

### 数据库备份（PostgreSQL）

```bash
# 备份
docker exec ugvis_db pg_dump -U ugvis ugvis_db > backup_$(date +%Y%m%d).sql

# 恢复
docker exec -i ugvis_db psql -U ugvis ugvis_db < backup_20260101.sql
```

### 数据库备份（SQLite）

```bash
# 备份
cp backend/ugvis.db backend/ugvis.db.bak.$(date +%Y%m%d)

# 恢复
cp backend/ugvis.db.bak.20260101 backend/ugvis.db
```

### 数据迁移（SQLite → PostgreSQL）

如需将开发环境数据迁移到生产 PostgreSQL：

1. 导出 CSV：
   ```bash
   curl http://localhost:8000/api/points/export
   ```

2. 导入 PostgreSQL（使用数据管理页面）

---

## 生产环境检查清单

### 🔒 安全

- [ ] `CORS_ORIGINS` 配置为真实前端域名（不使用 `*`）
- [ ] LLM API Keys 存储在后端 `.env`，不硬编码
- [ ] 数据库（PostgreSQL）设置强密码
- [ ] Nginx 配置 HTTPS（使用 Let's Encrypt）
- [ ] 生产环境删除或保护 `backend/ugvis.db` 调试文件
- [ ] API 限流配置（建议 Nginx 层 `limit_req_zone`）
- [ ] 考虑添加认证（见下方"未来升级"）

### ⚡ 性能

- [ ] PostgreSQL 配置连接池（建议 `pool_size=20, max_overflow=10`）
- [ ] 为高频查询字段加索引：`road_type`、`gvi_winter`、`gvi_spring`
- [ ] 前端构建产物使用 CDN 加速（配置 Nginx `gzip_static`）
- [ ] 地图底图使用国内可访问来源（如 GeoQ.cn / 百度地图）
- [ ] 大数据查询（>10万点）考虑加 Redis 缓存

### 🖥️ 监控

- [ ] 配置日志聚合（建议 ELK Stack 或 Loki）
- [ ] API 错误率监控（建议 Sentry）
- [ ] 服务器资源监控（CPU / 内存 / 磁盘）
- [ ] 设置告警规则（磁盘满、API 5xx 率 > 5%）

### 🔄 运维

- [ ] 设置数据库定时备份（每日 1 次）
- [ ] 设置日志轮转（`logrotate` 配置）
- [ ] 制定升级流程（先测试环境验证）
- [ ] 记录当前版本（`git tag v0.2.0`）

---

## 未来升级路线

以下功能尚未包含在当前部署中，建议后续按需集成：

| 优先级 | 功能 | 说明 |
|:---:|:---|:---|
| 🔴 高 | 用户认证（JWT） | 保护 AI 规划接口，防止 API Key 滥用 |
| 🔴 高 | API 限流 | 防止恶意调用消耗 LLM 额度 |
| 🟡 中 | Redis 缓存 | 缓存高频查询（统计、季节分析） |
| 🟡 中 | GWR/MGWR 预计算 | 后台异步任务，结果写入 `model_results` 表 |
| 🟢 低 | 多城市扩展 | 数据库加 `city` 字段，切换城市数据集 |
| 🟢 低 | 报告导出 | PDF/Word 自动生成改造建议报告 |

---

## 目录结构参考

```
ugvis-project/
├── .env                        # 环境变量（不上 Git）
├── .env.example                # 环境变量模板
├── docker-compose.yml          # 生产编排
├── DEPLOYMENT.md               # 本文档
│
├── backend/
│   ├── .env                    # 后端环境变量（不上 Git）
│   ├── main.py                 # FastAPI 入口
│   ├── config.py               # 配置管理
│   ├── routers/                # API 路由
│   ├── services/               # 业务逻辑
│   └── ugvis.db               # SQLite 数据（不上 Git）
│
├── frontend/
│   ├── dist/                  # 生产构建产物（不上 Git）
│   ├── nginx.conf              # Nginx 配置
│   └── Dockerfile
│
└── docker/
    ├── Dockerfile.backend
    ├── Dockerfile.frontend
    ├── docker-compose.yml
    └── init/0init.sql          # PostgreSQL 初始化 SQL
```

---

## 常见问题

| 问题 | 排查/解决 |
|:---|:---|
| CORS 报错 | 检查 `CORS_ORIGINS` 是否包含前端域名；检查 Nginx 是否正确转发 |
| LLM 返回 401 | 确认 `.env` 中 API Key 正确且有效 |
| 数据库连接失败 | Docker 环境检查 `docker-compose ps`；手动环境检查 PostgreSQL 服务 |
| 前端 404 | 检查 Nginx `root` 路径；检查 `dist/` 是否已构建 |
| 内存不足 | Docker 限制容器内存；SQLite 改为 PostgreSQL |
