import google.generativeai as genai
import PIL.Image
import io
import json
import os
import typing
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure Gemini API
# You need to set GEMINI_API_KEY in your environment variables
api_key = os.environ.get("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)

def parse_screenshot(image_bytes):
    if not api_key:
        print("Error: GEMINI_API_KEY not found in environment variables.")
        return []

    try:
        image = PIL.Image.open(io.BytesIO(image_bytes))
        
        model = genai.GenerativeModel('gemini-flash-latest')
        
        prompt = """
        Extract the option positions from this screenshot.
        Return a JSON list where each item has the following keys:
        - qty (integer): The quantity (e.g., -1, 1).
        - expiration (string): The expiration date (e.g., "Jan 16"). Format as "Mon Day".
        - strike (float): The strike price.
        - type (string): "C" for Call, "P" for Put.
        
        Rules:
        1. Ignore "Days" (e.g. 22d).
        2. Fix common OCR errors (e.g. "Janié" -> "Jan 16", "©" -> "C").
        3. Return ONLY the JSON list. No markdown formatting.
        """
        
        response = model.generate_content([prompt, image])
        
        # Clean up response text (remove markdown code blocks if present)
        text = response.text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
            
        positions = json.loads(text)
        return positions
        
    except Exception as e:
        print(f"Gemini OCR Error: {e}")
        return []

def mock_parse_screenshot():
    # Fallback if OCR fails or for testing
    return [
        {"qty": -1, "expiration": "Dec 19", "strike": 135, "type": "P"},
        {"qty": -1, "expiration": "Dec 19", "strike": 150, "type": "P"},
        {"qty": -2, "expiration": "Dec 19", "strike": 230, "type": "C"},
    ]
