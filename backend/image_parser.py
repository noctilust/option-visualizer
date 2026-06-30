import PIL.Image
import io
import json
import os
from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel, Field, ValidationError

# Load environment variables
load_dotenv()

api_key = os.environ.get("GEMINI_API_KEY")
ocr_model = os.environ.get("GEMINI_OCR_MODEL", "gemini-3.1-flash-lite")
max_dimension = int(os.environ.get("GEMINI_OCR_MAX_DIMENSION", "1024"))


class OCRPosition(BaseModel):
    qty: int = Field(description="Quantity. Positive for long, negative for short.")
    expiration: str = Field(description='Expiration date formatted as "Mon Day", for example "Jan 16".')
    strike: float = Field(gt=0, description="Option strike price.")
    type: str = Field(pattern="^[CP]$", description='Option type: "C" for call or "P" for put.')


class OCRPositions(BaseModel):
    positions: list[OCRPosition]


def _prepare_image(image_bytes):
    image = PIL.Image.open(io.BytesIO(image_bytes))
    width, height = image.size

    if width > max_dimension or height > max_dimension:
        scale = max_dimension / max(width, height)
        new_width = int(width * scale)
        new_height = int(height * scale)
        image = image.resize((new_width, new_height), PIL.Image.Resampling.LANCZOS)
        print(f"Image resized from {width}x{height} to {new_width}x{new_height}")

    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGB")

    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue(), "image/png"

def parse_screenshot(image_bytes):
    if not api_key:
        print("Error: GEMINI_API_KEY not found in environment variables.")
        return []

    try:
        optimized_image, mime_type = _prepare_image(image_bytes)
        client = genai.Client(api_key=api_key)

        prompt = """
        Extract the option positions from this screenshot.
        Return JSON with a single key, "positions", containing a list where each item has:
        - qty (integer): The quantity (e.g., -1, 1).
        - expiration (string): The expiration date (e.g., "Jan 16"). Format as "Mon Day".
        - strike (float): The strike price.
        - type (string): "C" for Call, "P" for Put.
        
        Rules:
        1. Ignore "Days" (e.g. 22d).
        2. Fix common OCR errors (e.g. "Janié" -> "Jan 16", "©" -> "C").
        3. Return only positions visible in the screenshot.
        """

        response = client.models.generate_content(
            model=ocr_model,
            contents=[
                prompt,
                types.Part.from_bytes(data=optimized_image, mime_type=mime_type),
            ],
            config=types.GenerateContentConfig(
                temperature=0,
                response_mime_type="application/json",
                response_schema=OCRPositions,
            ),
        )

        text = response.text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]

        try:
            parsed = OCRPositions.model_validate_json(text)
        except ValidationError:
            parsed = OCRPositions.model_validate(json.loads(text))

        return [position.model_dump() for position in parsed.positions]

    except (json.JSONDecodeError, ValidationError) as e:
        print(f"Gemini OCR JSON validation error: {e}")
        return []
    except Exception as e:
        print(f"Gemini OCR Error: {e}")
        return []
