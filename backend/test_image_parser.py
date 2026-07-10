import io
from types import SimpleNamespace
from unittest.mock import MagicMock

import PIL.Image
import pytest
from pydantic import ValidationError

import image_parser


def make_png(size=(320, 180)) -> bytes:
    image = PIL.Image.new("RGB", size, color="white")
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def test_parse_screenshot_uses_schema_without_overriding_temperature(monkeypatch):
    fake_client = MagicMock()
    fake_client.__enter__.return_value = fake_client
    fake_client.models.generate_content.return_value = SimpleNamespace(
        text='{"positions":[{"qty":-1,"expiration":"Jan 16","strike":150,"type":"C"}]}'
    )
    monkeypatch.setattr(image_parser, "api_key", "test-key")
    monkeypatch.setattr(image_parser.genai, "Client", lambda api_key: fake_client)

    positions = image_parser.parse_screenshot(make_png())

    assert positions == [{"qty": -1, "expiration": "Jan 16", "strike": 150.0, "type": "C"}]
    fake_client.__exit__.assert_called_once()
    request = fake_client.models.generate_content.call_args.kwargs
    assert request["model"] == image_parser.ocr_model
    assert request["config"].temperature is None
    assert request["config"].response_schema is image_parser.OCRPositions
    assert "qty (integer)" not in request["contents"][0]


def test_prepare_image_resizes_longest_side(monkeypatch):
    monkeypatch.setattr(image_parser, "max_dimension", 1024)

    optimized, mime_type = image_parser._prepare_image(make_png((2048, 1024)))

    with PIL.Image.open(io.BytesIO(optimized)) as image:
        assert image.size == (1024, 512)
    assert mime_type == "image/png"


@pytest.mark.parametrize("field,value", [("qty", 0), ("type", "X")])
def test_ocr_position_rejects_invalid_domain_values(field, value):
    data = {"qty": 1, "expiration": "Jan 16", "strike": 150, "type": "C"}
    data[field] = value

    with pytest.raises(ValidationError):
        image_parser.OCRPosition.model_validate(data)
