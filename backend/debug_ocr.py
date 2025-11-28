import ocr
import os

if __name__ == "__main__":
    # Check for API Key
    if not os.environ.get("GEMINI_API_KEY"):
        print("\n⚠️  WARNING: GEMINI_API_KEY is not set!")
        print("Please set it using: export GEMINI_API_KEY='your_key_here'")
        print("Then run this script again.\n")
        exit(1)

    # Test with the full screenshot (previous upload)
    image_path = "/Users/forrest/.gemini/antigravity/brain/a4e90054-0a94-4fb1-a1c9-e3d1f69f48c2/uploaded_image_1764242919393.png"
    
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
