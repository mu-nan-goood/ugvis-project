"""tests/test_health.py — Health check endpoints"""
import pytest


class TestHealthEndpoints:
    """Tests for /api/health endpoint."""

    def test_health_check(self, client):
        """GET /api/health should return 200 with service status."""
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["message"] in ("healthy", "degraded")
        assert "version" in data
        assert "database" in data

    def test_health_returns_sample_count(self, client):
        """GET /api/health should include sample count."""
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert "sample_count" in data
        assert isinstance(data["sample_count"], int)
