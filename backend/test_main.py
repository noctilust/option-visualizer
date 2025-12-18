import pytest
from fastapi.testclient import TestClient
from main import app


client = TestClient(app)


class TestCORSConfiguration:
    """Tests for CORS configuration (Fix #3)"""

    def test_cors_allows_valid_origin(self):
        """CORS should allow configured origins"""
        response = client.options(
            "/",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            }
        )
        assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"

    def test_cors_allows_post_method(self):
        """CORS should allow POST method"""
        response = client.options(
            "/upload",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
            }
        )
        allowed_methods = response.headers.get("access-control-allow-methods", "")
        assert "POST" in allowed_methods

    def test_cors_allows_get_method(self):
        """CORS should allow GET method"""
        response = client.options(
            "/",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            }
        )
        allowed_methods = response.headers.get("access-control-allow-methods", "")
        assert "GET" in allowed_methods

    def test_cors_allows_content_type_header(self):
        """CORS should allow Content-Type header"""
        response = client.options(
            "/calculate",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type",
            }
        )
        allowed_headers = response.headers.get("access-control-allow-headers", "")
        assert "content-type" in allowed_headers.lower()


class TestCalculateEndpoint:
    """Tests for /calculate endpoint with validation (Fix #4)"""

    def test_calculate_valid_request(self):
        """Valid calculate request should return data"""
        response = client.post(
            "/calculate",
            json={
                "positions": [
                    {"qty": -1, "expiration": "Jan 16", "strike": 100.0, "type": "P"},
                    {"qty": -1, "expiration": "Jan 16", "strike": 110.0, "type": "C"},
                ],
                "credit": 500.0
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert len(data["data"]) > 0

    def test_calculate_invalid_option_type(self):
        """Invalid option type should return 422"""
        response = client.post(
            "/calculate",
            json={
                "positions": [
                    {"qty": 1, "expiration": "Jan 16", "strike": 100.0, "type": "X"},
                ],
                "credit": 100.0
            }
        )
        assert response.status_code == 422

    def test_calculate_negative_strike(self):
        """Negative strike price should return 422"""
        response = client.post(
            "/calculate",
            json={
                "positions": [
                    {"qty": 1, "expiration": "Jan 16", "strike": -50.0, "type": "C"},
                ],
                "credit": 100.0
            }
        )
        assert response.status_code == 422

    def test_calculate_zero_quantity(self):
        """Zero quantity should return 422"""
        response = client.post(
            "/calculate",
            json={
                "positions": [
                    {"qty": 0, "expiration": "Jan 16", "strike": 100.0, "type": "C"},
                ],
                "credit": 100.0
            }
        )
        assert response.status_code == 422

    def test_calculate_empty_positions(self):
        """Empty positions list should return 422"""
        response = client.post(
            "/calculate",
            json={
                "positions": [],
                "credit": 100.0
            }
        )
        assert response.status_code == 422

    def test_calculate_empty_expiration(self):
        """Empty expiration should be accepted (optional for manual entry)"""
        response = client.post(
            "/calculate",
            json={
                "positions": [
                    {"qty": 1, "expiration": "", "strike": 100.0, "type": "C"},
                ],
                "credit": 100.0
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert len(data["data"]) > 0


class TestRootEndpoint:
    """Tests for root endpoint"""

    def test_root_returns_message(self):
        """Root endpoint should return welcome message"""
        response = client.get("/")
        assert response.status_code == 200
        assert response.json() == {"message": "Option Visualizer API"}
