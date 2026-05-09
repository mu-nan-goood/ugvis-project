-- ============================================================
-- UGVIS PostgreSQL 初始化脚本
-- 挂载于 docker-entrypoint-initdb.d， 仅在 PostgreSQL
-- 首次初始化（数据目录为空）时执行一次。
-- ============================================================

-- SamplingPoint：街景采样点（20万+条记录）
CREATE TABLE IF NOT EXISTS sampling_points (
    id              SERIAL PRIMARY KEY,
    point_id        INTEGER NOT NULL UNIQUE,
    lat             FLOAT   NOT NULL,
    lng             FLOAT   NOT NULL,
    gvi_spring      FLOAT,
    gvi_summer      FLOAT,
    gvi_autumn      FLOAT,
    gvi_winter      FLOAT,
    ndvi_spring     FLOAT,
    ndvi_summer     FLOAT,
    ndvi_autumn     FLOAT,
    ndvi_winter     FLOAT,
    road_type       VARCHAR(10),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);

-- 高频过滤字段索引（与 database.py 中的索引定义保持一致）
CREATE INDEX IF NOT EXISTS ix_sampling_points_road_type
    ON sampling_points(road_type);
CREATE INDEX IF NOT EXISTS ix_sampling_points_gvi_spring
    ON sampling_points(gvi_spring);
CREATE INDEX IF NOT EXISTS ix_sampling_points_gvi_summer
    ON sampling_points(gvi_summer);
CREATE INDEX IF NOT EXISTS ix_sampling_points_gvi_autumn
    ON sampling_points(gvi_autumn);
CREATE INDEX IF NOT EXISTS ix_sampling_points_gvi_winter
    ON sampling_points(gvi_winter);
CREATE INDEX IF NOT EXISTS ix_sampling_points_road_type_gvi_winter
    ON sampling_points(road_type, gvi_winter);

-- RoadSegment：道路分段
CREATE TABLE IF NOT EXISTS road_segments (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100),
    road_type       VARCHAR(20),
    geometry        TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ModelResult：空间回归模型结果（MGWR/GWR/OLS）
CREATE TABLE IF NOT EXISTS model_results (
    id              SERIAL PRIMARY KEY,
    point_id        INTEGER,
    model_type      VARCHAR(20),
    pred_spring     FLOAT,
    pred_summer     FLOAT,
    pred_autumn     FLOAT,
    pred_winter     FLOAT,
    coef_ndvi       FLOAT,
    coef_intercept  FLOAT,
    local_r2        FLOAT,
    residual        FLOAT,
    std_residual    FLOAT
);

CREATE INDEX IF NOT EXISTS ix_model_results_point_type
    ON model_results(point_id, model_type);

-- SeasonalMetric：季节统计指标（按道路类型聚合）
CREATE TABLE IF NOT EXISTS seasonal_metrics (
    id              SERIAL PRIMARY KEY,
    road_type       VARCHAR(20),
    season          VARCHAR(10),
    mean_gvi        FLOAT,
    std_gvi         FLOAT,
    mean_ndvi       FLOAT,
    std_ndvi        FLOAT,
    correlation     FLOAT,
    sample_count    INTEGER
);

CREATE INDEX IF NOT EXISTS ix_seasonal_metrics_road_season
    ON seasonal_metrics(road_type, season);
