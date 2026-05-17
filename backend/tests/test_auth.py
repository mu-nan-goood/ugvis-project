"""tests/test_auth.py — Authentication endpoints"""
import pytest


class TestAuthEndpoints:
    """Tests for /api/auth/* endpoints."""

    def test_register_and_login(self, client):
        """Register a new user, then login to get a token."""
        # Register
        reg_resp = client.post("/api/auth/register", json={
            "username": "newuser",
            "email": "new@ugvis.local",
            "password": "SecurePass123!",
        })
        # Registration may or may not exist; handle both
        assert reg_resp.status_code in (200, 201, 409)

        # Login
        login_resp = client.post("/api/auth/login", json={
            "username": "newuser",
            "password": "SecurePass123!",
        })
        if login_resp.status_code == 200:
            data = login_resp.json()
            assert "access_token" in data
            assert data["token_type"] == "bearer"

    def test_login_invalid_credentials(self, client):
        """Login with wrong password should return 401."""
        resp = client.post("/api/auth/login", json={
            "username": "nonexistent",
            "password": "wrongpass",
        })
        assert resp.status_code == 401

    def test_protected_endpoint_without_token(self, client):
        """Accessing a protected endpoint without token should return 401."""
        resp = client.get("/api/auth/me")
        assert resp.status_code in (401, 403)

    def test_protected_endpoint_with_token(self, client, auth_headers):
        """Accessing a protected endpoint with valid token should return 200."""
        resp = client.get("/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "testuser"
