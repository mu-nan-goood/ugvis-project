from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config import settings

# PostgreSQL 不需要 check_same_thread，SQLite 需要
_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(
    settings.database_url,
    connect_args=_connect_args
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ========================
# 确保高频查询字段索引存在
# 仅在索引不存在时创建（CREATE INDEX IF NOT EXISTS 为幂等操作）
# 适用场景：已有数据库首次启动时自动创建，原有索引不受影响
# ========================
_INDEXES = [
    # SamplingPoint 高频过滤字段索引
    "CREATE INDEX IF NOT EXISTS ix_sampling_points_road_type ON sampling_points(road_type)",
    "CREATE INDEX IF NOT EXISTS ix_sampling_points_gvi_spring ON sampling_points(gvi_spring)",
    "CREATE INDEX IF NOT EXISTS ix_sampling_points_gvi_summer ON sampling_points(gvi_summer)",
    "CREATE INDEX IF NOT EXISTS ix_sampling_points_gvi_autumn ON sampling_points(gvi_autumn)",
    "CREATE INDEX IF NOT EXISTS ix_sampling_points_gvi_winter ON sampling_points(gvi_winter)",
    # 复合索引：规划接口联合过滤 (road_type + gvi_winter)
    "CREATE INDEX IF NOT EXISTS ix_sampling_points_road_type_gvi_winter ON sampling_points(road_type, gvi_winter)",
    # ModelResult 按 point_id + model_type 查找
    "CREATE INDEX IF NOT EXISTS ix_model_results_point_type ON model_results(point_id, model_type)",
]

# SQLite 的 CREATE INDEX IF NOT EXISTS 本身是幂等的，但用事务包裹确保兼容
# PostgreSQL 下这些语句不会匹配任何索引名（pg 会报异常被忽略）
with engine.begin() as conn:
    for idx_sql in _INDEXES:
        try:
            conn.execute(text(idx_sql))
        except Exception:
            # 忽略已知兼容性问题，索引创建失败不影响服务启动
            pass


# ── R2-tech fix: Register Python UDFs for SQLite ─────────────────────────────
# SQLite lacks built-in stddev/standard deviation aggregate.
# We register Python-based aggregate functions so SQL queries can use them.
import math as _math
import statistics as _statistics

if settings.database_url.startswith("sqlite"):
    class _StddevAggregate:
        """SQLite aggregate function: stddev (population standard deviation)."""
        def __init__(self):
            self.values: list[float] = []

        def step(self, value):
            if value is not None:
                self.values.append(float(value))

        def finalize(self):
            if len(self.values) < 2:
                return 0.0
            return _statistics.pstdev(self.values)

    class _StddevSampleAggregate:
        """SQLite aggregate function: stddev_samp (sample standard deviation)."""
        def __init__(self):
            self.values: list[float] = []

        def step(self, value):
            if value is not None:
                self.values.append(float(value))

        def finalize(self):
            if len(self.values) < 2:
                return 0.0
            return _statistics.stdev(self.values)

    # Register UDFs on the underlying raw connection via SQLAlchemy event
    from sqlalchemy import event as _sa_event

    @_sa_event.listens_for(engine, "connect")
    def _register_sqlite_udfs(dbapi_connection, connection_record):
        """Register custom aggregate functions on each new SQLite connection."""
        dbapi_connection.create_aggregate("stddev", 1, _StddevAggregate)
        dbapi_connection.create_aggregate("stddev_samp", 1, _StddevSampleAggregate)
