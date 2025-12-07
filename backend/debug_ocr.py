import ocr
import os
import sys

if __name__ == "__main__":
    # Check for API Key
    if not os.environ.get("GEMINI_API_KEY"):
        print("\n⚠️  WARNING: GEMINI_API_KEY is not set!")
        print("Please set it using: export GEMINI_API_KEY='your_key_here'")
        print("Then run this script again.\n")
        exit(1)

    # Get image path from command line argument
    if len(sys.argv) < 2:
        print("\nUsage: python debug_ocr.py <image_path>")
        print("Example: python debug_ocr.py ./test_image.png\n")
        exit(1)

    image_path = sys.argv[1]

    try:
        with open(image_path, "rb") as f:
            image_bytes = f.read()

        print(f"Processing {image_path} using Gemini API...")
        positions = ocr.parse_screenshot(image_bytes)
        print("\nParsed Positions:")
        print(positions)

    except FileNotFoundError:
        print(f"Error: File not found at {image_path}")
    except Exception as e:
        print(f"Error: {e}")
