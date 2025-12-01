from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
from typing import List
from app.models.deal import DealStatus
from app.schemas.transaction import TransactionResponse


class DealBase(BaseModel):
    client_id: int
    total_eur_request: Decimal
    client_rate_percent: Decimal = Decimal("1.0")


class DealCreate(DealBase):
    transactions: List[dict]  # Список транзакций для создания


class DealUpdate(BaseModel):
    total_usdt_calculated: Decimal | None = None
    effective_rate: Decimal | None = None
    total_cost_usdt: Decimal | None = None
    gross_margin_usdt: Decimal | None = None
    net_profit_usdt: Decimal | None = None
    partner_share_usdt: Decimal | None = None
    status: DealStatus | None = None
    director_comment: str | None = None


class DealResponse(DealBase):
    id: int
    manager_id: int
    status: DealStatus
    total_usdt_calculated: Decimal | None = None
    effective_rate: Decimal | None = None
    total_cost_usdt: Decimal | None = None
    gross_margin_usdt: Decimal | None = None
    net_profit_usdt: Decimal | None = None
    partner_share_usdt: Decimal | None = None
    director_comment: str | None = None
    approved_at: datetime | None = None
    approved_by: int | None = None
    created_at: datetime
    updated_at: datetime
    transactions: List[TransactionResponse] = []

    class Config:
        from_attributes = True


class DealListResponse(BaseModel):
    id: int
    client_id: int
    client_name: str | None = None
    total_eur_request: Decimal
    total_usdt_calculated: Decimal | None = None
    status: DealStatus
    created_at: datetime
    progress: dict | None = None  # {"paid": 2, "total": 4}

    class Config:
        from_attributes = True

