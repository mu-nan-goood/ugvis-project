"""tests/test_feedback.py — Feedback endpoints"""
import pytest


class TestFeedbackEndpoints:
    """Tests for /api/feedback/* endpoints."""

    def test_get_feedback_stats(self, client):
        """GET /api/feedback/stats should return feedback statistics."""
        response = client.get("/api/feedback/stats")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_submit_feedback_unauthenticated(self, client):
        """POST /api/feedback without auth should return 401."""
        response = client.post("/api/feedback", json={
            "vote": "up",
            "comment": "Test feedback",
        })
        assert response.status_code == 401

    def test_submit_feedback_authenticated(self, client, auth_headers):
        """POST /api/feedback with auth should accept valid feedback."""
        response = client.post("/api/feedback", json={
            "vote": "up",
            "comment": "Test feedback from pytest",
            "season": "spring",
        }, headers=auth_headers)
        assert response.status_code in (200, 201)
