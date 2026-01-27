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
    # Новые поля для валют
    deal_amount: Decimal | None = None
    client_sends_currency: str | None = None
    client_receives_currency: str | None = None


class DealCreate(DealBase):
    transactions: List[dict]  # Список транзакций для создания


class DealUpdate(BaseModel):
    total_usdt_calculated: Decimal | None = None
    effective_rate: Decimal | None = None
    total_cost_usdt: Decimal | None = None
    gross_margin_usdt: Decimal | None = None
    net_profit_usdt: Decimal | None = None
    partner_share_usdt: Decimal | None = None
    status: str | None = None  # Теперь строка, а не enum
    director_comment: str | None = None


class DealResponse(DealBase):
    id: int
    manager_id: int
    status: str  # Теперь строка, а не enum (хранится как "senior_manager_approved" и т.д.)
    total_usdt_calculated: Decimal | None = None
    effective_rate: Decimal | None = None
    total_cost_usdt: Decimal | None = None
    gross_margin_usdt: Decimal | None = None
    net_profit_usdt: Decimal | None = None
    partner_share_usdt: Decimal | None = None
    director_comment: str | None = None
    approved_at: datetime | None = None
    approved_by: int | None = None
    # Новые поля для главного менеджера и задолженностей
    senior_manager_id: int | None = None
    senior_manager_comment: str | None = None
    approved_by_senior_manager_at: datetime | None = None
    client_debt_amount: Decimal | None = None
    client_paid_amount: Decimal | None = None
    is_client_debt: bool = False
    client_payment_confirmed_at: datetime | None = None
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
    status: str  # Теперь строка, а не enum
    created_at: datetime
    progress: dict | None = None  # {"paid": 2, "total": 4}
    transactions_count: int | None = None
    paid_transactions_count: int | None = None
    client_debt_amount: Decimal | None = None
    client_paid_amount: Decimal | None = None  # Добавлено для отображения оплаченной суммы

    class Config:
        from_attributes = True

