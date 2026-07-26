import io
import json

import PIL.Image
from fastapi.testclient import TestClient
from google.genai import _api_client, types

import image_parser
from main import app


EXPECTED_POSITIONS = [
    {"qty": 1, "expiration": "Jul 27", "strike": 7410.0, "type": "C"},
    {"qty": -2, "expiration": "Jul 27", "strike": 7435.0, "type": "C"},
    {"qty": 1, "expiration": "Jul 27", "strike": 7460.0, "type": "C"},
    {"qty": 1, "expiration": "Jul 27", "strike": 7450.0, "type": "C"},
    {"qty": -2, "expiration": "Jul 27", "strike": 7470.0, "type": "C"},
    {"qty": 1, "expiration": "Jul 27", "strike": 7485.0, "type": "C"},
    {"qty": 1, "expiration": "Jul 27", "strike": 7365.0, "type": "C"},
    {"qty": -2, "expiration": "Jul 27", "strike": 7390.0, "type": "C"},
    {"qty": 1, "expiration": "Jul 27", "strike": 7415.0, "type": "C"},
    {"qty": 1, "expiration": "Jul 27", "strike": 7375.0, "type": "P"},
    {"qty": -2, "expiration": "Jul 27", "strike": 7350.0, "type": "P"},
    {"qty": 1, "expiration": "Jul 27", "strike": 7330.0, "type": "P"},
]


def _wide_png() -> bytes:
    """Match the reported thinkorswim capture's 3192x702 image boundary."""
    image = PIL.Image.new("RGBA", (3192, 702), color=(8, 24, 34, 255))
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def test_upload_accepts_schema_before_gemini_inference(monkeypatch):
    """
    Exercise the real /upload and google-genai request transformation boundaries.

    The transport is stubbed only after request construction, so an SDK-incompatible
    response schema reproduces as the user-facing empty positions result without
    making a network request.
    """
    model_response = json.dumps(
        {
            "candidates": [
                {
                    "content": {
                        "role": "model",
                        "parts": [
                            {
                                "text": json.dumps(
                                    {"positions": EXPECTED_POSITIONS}
                                )
                            }
                        ],
                    },
                    "finishReason": "STOP",
                }
            ]
        }
    )
    transport_requests = []

    def fake_request(self, http_method, path, request_dict, http_options=None):
        transport_requests.append((http_method, path, request_dict))
        return types.HttpResponse(headers={}, body=model_response)

    monkeypatch.setattr(image_parser, "api_key", "test-key")
    monkeypatch.setattr(_api_client.BaseApiClient, "request", fake_request)

    response = TestClient(app).post(
        "/upload",
        files={"file": ("thinkorswim.png", _wide_png(), "image/png")},
    )

    assert response.status_code == 200
    assert response.json() == {"positions": EXPECTED_POSITIONS}
    assert len(transport_requests) == 1
