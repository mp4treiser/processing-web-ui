from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
from app.models.transaction import TransactionStatus


class TransactionBase(BaseModel):
    client_company_id: int | None = None
    amount_for_client: Decimal | None = None
    route_type: str | None = None
    
    # Direct route fields
    internal_company_id: int | None = None
    internal_company_account_id: int | None = None
    amount_from_account: Decimal | None = None
    bank_commission_id: int | None = None
    
    # Exchange route fields
    crypto_account_id: int | None = None
    exchange_from_currency: str | None = None
    exchange_to_currency: str | None = None
    exchange_amount: Decimal | None = None  # Рассчитанная сумма крипты для списания
    exchange_rate: Decimal | None = None
    crypto_exchange_rate: Decimal | None = None
    agent_commission_id: int | None = None
    exchange_commission_id: int | None = None
    exchange_bank_commission_id: int | None = None
    
    # Partner route fields
    partner_company_id: int | None = None
    amount_to_partner_usdt: Decimal | None = None
    amount_partner_sends: Decimal | None = None
    partner_commission_id: int | None = None
    
    # Partner 50-50 route fields
    partner_50_50_company_id: int | None = None
    amount_to_partner_50_50_usdt: Decimal | None = None
    amount_partner_50_50_sends: Decimal | None = None
    partner_50_50_commission_id: int | None = None


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    route_type: str | None = None
    status: TransactionStatus | None = None
    exchange_rate: Decimal | None = None
    crypto_exchange_rate: Decimal | None = None
    amount_from_account: Decimal | None = None
    amount_for_client: Decimal | None = None


class TransactionResponse(TransactionBase):
    id: int
    deal_id: int
    from_currency: str | None = None
    to_currency: str | None = None
    
    # Calculated fields
    calculated_route_income: Decimal | None = None
    calculated_commission_total: Decimal | None = None
    cost_usdt: Decimal | None = None
    client_price_usdt: Decimal | None = None
    profit_usdt: Decimal | None = None
    partner_profit_usdt: Decimal | None = None
    final_income: Decimal | None = None
    
    status: TransactionStatus | None = None
    payment_proof_file: str | None = None
    paid_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True
