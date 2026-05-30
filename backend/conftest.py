"""backend/conftest.py — pytest fixtures for UGVIS API testing"""
import os
import pytest
import tempfile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

# Ensure test environment
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_ugvis.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest")

from database import Base, get_db
from main import app


# ── Test Database ──────────────────────────────────────────
_db_fd, _db_path = tempfile.mkstemp(suffix=".db", prefix="ugvis_test_")
os.close(_db_fd)

_engine = None
_SessionLocal = None

def _make_engine():
    return create_engine(
        f"sqlite:///{_db_path}",
        connect_args={"check_same_thread": False},
    )

_engine = _make_engine()
_SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def override_get_db():
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def setup_database():
    """Recreate tables from scratch before each test."""
    global _engine, _SessionLocal
    _engine.dispose()
    if os.path.exists(_db_path):
        os.remove(_db_path)
    _engine = _make_engine()
    _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=_engine)
    yield
    _engine.dispose()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_token(client):
    from services.auth import get_password_hash
    from models import User

    db = _SessionLocal()
    user = User(
        username="testuser",
        email="test@ugvis.local",
        hashed_password=get_password_hash("testpass123"),
        role="user",
        is_active=1,
    )
    db.add(user)
    db.commit()
    db.close()

    response = client.post("/api/auth/login", json={
        "username": "testuser",
        "password": "testpass123",
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}
