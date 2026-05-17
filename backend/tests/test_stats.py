"""tests/test_stats.py — Statistics endpoints"""
import pytest


class TestStatsEndpoints:
    """Tests for /api/stats/* endpoints."""

    def test_get_stats(self, client):
        """GET /api/stats should return aggregate statistics."""
        response = client.get("/api/stats")
        assert response.status_code == 200
        data = response.json()
        # Response should contain key statistical fields
        assert isinstance(data, dict)

    def test_get_map_stats(self, client):
        """GET /api/map/stats should return map-level statistics."""
        response = client.get("/api/map/stats")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
