from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
from app.models.transaction import RouteType, TransactionStatus


class TransactionBase(BaseModel):
    target_company: str
    amount_eur: Decimal
    recipient_details: str | None = None


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    route_type: RouteType | None = None
    partner_id: int | None = None
    source_company: str | None = None
    exchange_rate: Decimal | None = None
    partner_bonus_rate: Decimal | None = None
    partner_cost_rate: Decimal | None = None
    exchange_fee_percent: Decimal | None = None
    intermediary_fee_percent: Decimal | None = None
    bank_fee_fix_eur: Decimal | None = None
    bank_fee_percent: Decimal | None = None
    profit_split_enabled: bool | None = None


class TransactionResponse(TransactionBase):
    id: int
    deal_id: int
    route_type: RouteType | None = None
    partner_id: int | None = None
    source_company: str | None = None
    status: TransactionStatus
    cost_usdt: Decimal | None = None
    client_price_usdt: Decimal | None = None
    profit_usdt: Decimal | None = None
    partner_profit_usdt: Decimal | None = None
    payment_proof_file: str | None = None
    paid_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True

