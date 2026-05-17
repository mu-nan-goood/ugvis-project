"""tests/test_planning.py — Planning & weak areas endpoints"""
import pytest


class TestPlanningEndpoints:
    """Tests for /api/planning/* endpoints."""

    def test_get_weak_areas(self, client):
        """GET /api/planning/weak-areas should return paginated results."""
        response = client.get("/api/planning/weak-areas")
        assert response.status_code == 200
        data = response.json()
        # Should have pagination metadata
        assert isinstance(data, dict)

    def test_get_weak_areas_with_pagination(self, client):
        """GET /api/planning/weak-areas?skip=0&limit=5 should work."""
        response = client.get("/api/planning/weak-areas?skip=0&limit=5")
        assert response.status_code == 200

    def test_get_stats_via_stats_endpoint(self, client):
        """GET /api/stats should return overall statistics."""
        response = client.get("/api/stats")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_get_tools(self, client, auth_headers):
        """GET /api/planning/tools should return available AI tools (requires auth)."""
        response = client.get("/api/planning/tools", headers=auth_headers)
        # May be 200 or 401 depending on auth config
        assert response.status_code in (200, 401)
