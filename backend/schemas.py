from pydantic import BaseModel
from typing import List

class Position(BaseModel):
    qty: int
    expiration: str
    strike: float
    type: str # "C" or "P"

class CalculateRequest(BaseModel):
    positions: List[Position]
    credit: float
