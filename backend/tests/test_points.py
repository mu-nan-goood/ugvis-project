"""tests/test_points.py — Point data endpoints"""
import pytest


class TestPointsEndpoints:
    """Tests for /api/points/* endpoints."""

    def test_get_points_default(self, client):
        """GET /api/points should return point data."""
        response = client.get("/api/points")
        assert response.status_code == 200

    def test_get_points_with_limit(self, client):
        """GET /api/points?limit=10 should limit results."""
        response = client.get("/api/points?limit=10")
        assert response.status_code == 200
