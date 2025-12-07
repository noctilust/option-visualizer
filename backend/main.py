import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import ocr
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



@app.get("/")
def read_root():
    return {"message": "Option Visualizer API"}

@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        positions = ocr.parse_screenshot(contents)
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
