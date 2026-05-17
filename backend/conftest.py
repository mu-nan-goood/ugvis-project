"""backend/conftest.py — pytest fixtures for UGVIS API testing"""
import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

# Ensure test environment
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_ugvis.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest")

from database import Base, get_db
from main import app


# ── Test Database ──────────────────────────────────────────
TEST_DB_URL = "sqlite:///./test_ugvis.db"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def setup_database():
    """Create tables before each test, drop after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    """FastAPI test client with test database."""
    return TestClient(app)


@pytest.fixture
def auth_token(client):
    """Get a valid JWT token by creating a user and logging in."""
    # Register / create user directly in DB
    from services.auth import get_password_hash
    from models import User

    db = TestSessionLocal()
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

    # Login to get token
    response = client.post("/api/auth/login", json={
        "username": "testuser",
        "password": "testpass123",
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    return data["access_token"]


@pytest.fixture
def auth_headers(auth_token):
    """Authorization headers for authenticated requests."""
    return {"Authorization": f"Bearer {auth_token}"}
