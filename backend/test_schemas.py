import pytest
from pydantic import ValidationError
from schemas import Position, CalculateRequest


class TestPosition:
    """Tests for Position schema validation (Fix #4)"""

    def test_valid_call_position(self):
        """Valid call position should pass validation"""
        pos = Position(qty=1, expiration="Jan 16", strike=100.0, type="C")
        assert pos.qty == 1
        assert pos.expiration == "Jan 16"
        assert pos.strike == 100.0
        assert pos.type == "C"

    def test_valid_put_position(self):
        """Valid put position should pass validation"""
        pos = Position(qty=-2, expiration="Dec 19", strike=150.5, type="P")
        assert pos.qty == -2
        assert pos.type == "P"

    def test_invalid_option_type(self):
        """Invalid option type should raise ValidationError"""
        with pytest.raises(ValidationError) as exc_info:
            Position(qty=1, expiration="Jan 16", strike=100.0, type="X")
        assert "type" in str(exc_info.value)

    def test_negative_strike_price(self):
        """Negative strike price should raise ValidationError"""
        with pytest.raises(ValidationError) as exc_info:
            Position(qty=1, expiration="Jan 16", strike=-100.0, type="C")
        assert "strike" in str(exc_info.value)

    def test_zero_strike_price(self):
        """Zero strike price should raise ValidationError"""
        with pytest.raises(ValidationError) as exc_info:
            Position(qty=1, expiration="Jan 16", strike=0, type="C")
        assert "strike" in str(exc_info.value)

    def test_zero_quantity(self):
        """Zero quantity should raise ValidationError"""
        with pytest.raises(ValidationError) as exc_info:
            Position(qty=0, expiration="Jan 16", strike=100.0, type="C")
        assert "Quantity cannot be zero" in str(exc_info.value)

    def test_empty_expiration(self):
        """Empty expiration should raise ValidationError"""
        with pytest.raises(ValidationError) as exc_info:
            Position(qty=1, expiration="", strike=100.0, type="C")
        assert "expiration" in str(exc_info.value)


class TestCalculateRequest:
    """Tests for CalculateRequest schema validation (Fix #4)"""

    def test_valid_request(self):
        """Valid request with positions should pass"""
        req = CalculateRequest(
            positions=[
                Position(qty=-1, expiration="Jan 16", strike=100.0, type="P"),
                Position(qty=1, expiration="Jan 16", strike=110.0, type="C"),
            ],
            credit=500.0
        )
        assert len(req.positions) == 2
        assert req.credit == 500.0

    def test_empty_positions_list(self):
        """Empty positions list should raise ValidationError"""
        with pytest.raises(ValidationError) as exc_info:
            CalculateRequest(positions=[], credit=100.0)
        assert "positions" in str(exc_info.value)

    def test_negative_credit(self):
        """Negative credit (debit) should be allowed"""
        req = CalculateRequest(
            positions=[Position(qty=1, expiration="Jan 16", strike=100.0, type="C")],
            credit=-200.0
        )
        assert req.credit == -200.0
