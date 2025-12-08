import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import image_parser
import calculator
from schemas import Position, CalculateRequest

app = FastAPI()

# CORS origins from environment variable, with sensible defaults for development
default_origins = "http://localhost:5173,http://localhost:3000"
origins = os.environ.get("CORS_ORIGINS", default_origins).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)



if os.path.exists(os.path.join(os.path.dirname(__file__), "static")):
    # In production, let the generic file server below handle the root
    pass
else:
    @app.get("/")
    def read_root():
        return {"message": "Option Visualizer API"}

@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        positions = image_parser.parse_screenshot(contents)
        if not positions:
            positions = []
        return {"positions": positions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/calculate")
def calculate_pl(request: CalculateRequest):
    try:
        # Convert Pydantic models to dicts for the calculator
        positions_dicts = [p.model_dump() for p in request.positions]
        data = calculator.calculate_pl(positions_dicts, request.credit)
        return {"data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Serve static files (Production)
# This assumes the frontend build is copied to 'static' directory
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

static_path = os.path.join(os.path.dirname(__file__), "static")

if os.path.isdir(static_path):
    # Mount assets
    app.mount("/assets", StaticFiles(directory=os.path.join(static_path, "assets")), name="assets")

    # Catch-all for SPA
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Safe-guard: if the path starts with api/ (though generic here), ignore? 
        # Actually API routes match first.
        
        file_path = os.path.join(static_path, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        
        return FileResponse(os.path.join(static_path, "index.html"))
