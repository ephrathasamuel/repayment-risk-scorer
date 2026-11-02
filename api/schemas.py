from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ml.features import MONTHS


class LoginIn(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(max_length=200)


class UserOut(BaseModel):
    email: str
    role: Literal["admin", "analyst"]


class ApplicationIn(BaseModel):
    """One borrower. Month lists run from the latest month to six months ago."""
    model_config = ConfigDict(json_schema_extra={"example": {
        "reference": "ACME Traders",
        "credit_limit": 200000, "age": 38, "education": 1,
        "pay_status": [0, 0, 0, 0, 0, 0],
        "bill_amounts": [52000, 49000, 51000, 47000, 45000, 43000],
        "paid_amounts": [3000, 2500, 2600, 2400, 2200, 2000],
    }})

    reference: str = Field(min_length=1, max_length=100, description="Business or customer name / ID")
    credit_limit: int = Field(gt=0, le=10_000_000, description="Current credit limit (NT$)")
    age: int = Field(ge=18, le=100, description="Age of the owner / borrower")
    education: Literal[1, 2, 3, 4] = Field(description="1 graduate school, 2 university, 3 high school, 4 other")
    sex: Literal[1, 2] | None = Field(None, description="Fairness monitoring only, not used by the model")
    marital_status: Literal[1, 2, 3] | None = Field(None, description="Fairness monitoring only, not used by the model")
    pay_status: list[int] = Field(min_length=MONTHS, max_length=MONTHS,
                                  description="-2 no balance, -1 paid in full, 0 paid minimum, 1-9 months late")
    bill_amounts: list[int] = Field(min_length=MONTHS, max_length=MONTHS, description="Statement balance (NT$)")
    paid_amounts: list[int] = Field(min_length=MONTHS, max_length=MONTHS, description="Amount paid (NT$)")

    @field_validator("pay_status")
    @classmethod
    def _status_range(cls, v):
        if any(s < -2 or s > 9 for s in v):
            raise ValueError("each repayment status must be between -2 and 9")
        return v

    @field_validator("bill_amounts")
    @classmethod
    def _bill_range(cls, v):
        if any(abs(b) > 50_000_000 for b in v):
            raise ValueError("bill amounts look too large")
        return v

    @field_validator("paid_amounts")
    @classmethod
    def _paid_range(cls, v):
        if any(p < 0 or p > 50_000_000 for p in v):
            raise ValueError("paid amounts must be between 0 and 50,000,000")
        return v

    def to_row(self):
        row = {
            "credit_limit": self.credit_limit, "age": self.age, "education": self.education,
            "sex": self.sex, "marital_status": self.marital_status,
        }
        for m in range(MONTHS):
            row[f"pay_status_{m + 1}"] = self.pay_status[m]
            row[f"bill_amount_{m + 1}"] = self.bill_amounts[m]
            row[f"paid_amount_{m + 1}"] = self.paid_amounts[m]
        return row


class Factor(BaseModel):
    feature: str
    label: str
    value: float | int | None
    typical: float | int | None
    contribution: float


class Offer(BaseModel):
    illustrative: bool
    suggested_limit: int
    limit_factor: float
    annual_rate_pct: float | None
    pricing_band: str
    note: str


class DecisionOut(BaseModel):
    id: int
    application_id: int
    reference: str
    source: str
    created_at: datetime
    created_by: str
    model_version: str
    probability: float
    score: int
    band: str
    recommendation: str
    threshold: float
    contributions: list[Factor]
    offer: Offer
    inputs: dict
    ai_summary: str | None


class DecisionRow(BaseModel):
    id: int
    reference: str
    source: str
    created_at: datetime
    model_version: str
    probability: float
    score: int
    band: str
    recommendation: str


class BatchOut(BaseModel):
    scored: int
    rejected: list[dict]
    model_version: str
    decisions: list[DecisionRow]


class SummaryIn(BaseModel):
    language: Literal["en", "am"] = "en"


class SummaryOut(BaseModel):
    text: str
    model: str
    language: str


class ModelOut(BaseModel):
    version: str
    algorithm: str
    is_active: bool
    registered_at: datetime
    activated_at: datetime | None
    auc: float
    baseline_auc: float
    brier: float
    threshold: float
    recall: float
    precision: float
    rows: int


class ModelDetail(ModelOut):
    metrics: dict


class AuditOut(BaseModel):
    at: datetime
    user_email: str
    action: str
    model_version: str | None
    details: dict
