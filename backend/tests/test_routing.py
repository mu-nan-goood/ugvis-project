"""tests/test_routing.py — Routing endpoint tests (Haversine precision)"""
import math
import pytest


class TestHaversineFunction:
    """Test the haversine distance calculation."""

    def test_haversine_same_point(self):
        """Same point should return 0 distance."""
        from routers.routing import haversine
        assert haversine(32.05, 118.78, 32.05, 118.78) == 0.0

    def test_haversine_known_distance(self):
        """Known distance: ~111.32 km per degree of latitude."""
        from routers.routing import haversine
        dist = haversine(32.0, 118.0, 33.0, 118.0)
        assert 111000 < dist < 112000  # ~111.32 km

    def test_haversine_nanjing_shanghai(self):
        """Nanjing to Shanghai approximate distance ~270 km."""
        from routers.routing import haversine
        dist = haversine(32.06, 118.79, 31.23, 121.47)
        assert 260000 < dist < 290000

    def test_haversine_short_distance(self):
        """50m buffer distance should be correctly calculated."""
        from routers.routing import haversine
        # 0.0005 degrees latitude ≈ 55.6m at 32°N
        dist = haversine(32.0, 118.0, 32.0005, 118.0)
        assert 50 < dist < 60


class TestRoutingEndpoints:
    """Tests for /api/routing/* endpoints."""

    def test_analyze_route_requires_two_points(self, client):
        """POST /api/routing/analyze should reject < 2 points."""
        response = client.post("/api/routing/analyze", json={
            "coords": [{"lat": 32.05, "lng": 118.78}]
        })
        assert response.status_code == 400

    def test_analyze_route_basic(self, client):
        """POST /api/routing/analyze should return route stats."""
        response = client.post("/api/routing/analyze", json={
            "coords": [
                {"lat": 32.05, "lng": 118.78},
                {"lat": 32.06, "lng": 118.79},
            ]
        })
        assert response.status_code == 200
        data = response.json()
        assert "total_length_m" in data
        assert "overall_gvi" in data
        assert "segments" in data

    def test_compare_routes_basic(self, client):
        """POST /api/routing/compare should return comparison."""
        response = client.post("/api/routing/compare?season=spring", json={
            "coords": [
                {"lat": 32.05, "lng": 118.78},
                {"lat": 32.06, "lng": 118.79},
            ]
        })
        assert response.status_code == 200
        data = response.json()
        assert "user_route" in data
        assert "green_route" in data
        assert "comparison" in data

    def test_compare_routes_invalid_season(self, client):
        """POST /api/routing/compare should reject invalid season."""
        response = client.post("/api/routing/compare", json={
            "coords": [
                {"lat": 32.05, "lng": 118.78},
                {"lat": 32.06, "lng": 118.79},
            ],
            "season": "invalid"
        })
        assert response.status_code == 400


class TestBufferQueryPrecision:
    """Test that buffer queries use Haversine precision, not just rectangular approximation."""

    def test_buffer_excludes_distant_points(self):
        """
        Points within the rectangular bbox but outside the Haversine circle
        should be excluded by the new filter.
        """
        from routers.routing import haversine

        mid_lat, mid_lng = 32.06, 118.78
        buffer_m = 50

        # A point that is inside a square but outside a circle:
        # diagonal of 50m square ≈ 70.7m from center
        # This point is at ~50m latitude offset but 50m longitude offset
        # In a square, it would be included; in a circle, excluded.
        cos_lat = math.cos(math.radians(mid_lat))
        deg_50m_lat = 50.0 / 111320.0
        deg_50m_lng = 50.0 / (111320.0 * cos_lat)

        # Point at the corner of the 50m square
        corner_lat = mid_lat + deg_50m_lat
        corner_lng = mid_lng + deg_50m_lng
        dist = haversine(mid_lat, mid_lng, corner_lat, corner_lng)

        # This corner point should be ~70.7m away (square diagonal)
        # and thus OUTSIDE a 50m buffer circle
        assert dist > buffer_m, f"Corner point at {dist:.1f}m should be > {buffer_m}m buffer"
        assert dist < buffer_m * 2, f"Corner point at {dist:.1f}m should still be within rough bbox"

    def test_buffer_includes_close_points(self):
        """Points well within the buffer should always be included."""
        from routers.routing import haversine

        mid_lat, mid_lng = 32.06, 118.78
        buffer_m = 50

        # Point 30m due north
        close_lat = mid_lat + 30.0 / 111320.0
        dist = haversine(mid_lat, mid_lng, close_lat, mid_lng)
        assert dist <= buffer_m, f"Close point at {dist:.1f}m should be within {buffer_m}m buffer"
