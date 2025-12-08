from pydantic import BaseModel, Field, field_validator
from typing import List, Literal

class Position(BaseModel):
    qty: int = Field(..., description="Quantity (positive for long, negative for short)")
    expiration: str = Field(default="N/A", description="Expiration date (e.g., 'Jan 16') - optional for P/L calculation")
    strike: float = Field(..., gt=0, description="Strike price (must be positive)")
    type: Literal["C", "P"] = Field(..., description="Option type: 'C' for Call, 'P' for Put")

    @field_validator('qty')
    @classmethod
    def qty_not_zero(cls, v: int) -> int:
        if v == 0:
            raise ValueError('Quantity cannot be zero')
        return v

class CalculateRequest(BaseModel):
    positions: List[Position] = Field(..., min_length=1, description="List of option positions")
    credit: float = Field(..., description="Net credit/debit received")
