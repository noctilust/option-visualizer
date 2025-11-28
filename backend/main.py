from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import ocr
import calculator

app = FastAPI()

origins = [
    "http://localhost:5173",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Position(BaseModel):
    qty: int
    expiration: str
    strike: float
    type: str # "C" or "P"

class CalculateRequest(BaseModel):
    positions: List[Position]
    credit: float

@app.get("/")
def read_root():
    return {"message": "Option Visualizer API"}

@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        positions = ocr.parse_screenshot(contents)
        if not positions:
            # Fallback to mock if OCR returns empty (for testing or bad image)
            # In production, we might return an error or empty list
            # For this demo, let's return the mock if it fails to find anything
            # positions = ocr.mock_parse_screenshot()
            pass
        return {"positions": positions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/calculate")
def calculate_pl(request: CalculateRequest):
    try:
        # Convert Pydantic models to dicts for the calculator
        positions_dicts = [p.dict() for p in request.positions]
        data = calculator.calculate_pl(positions_dicts, request.credit)
        return {"data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
