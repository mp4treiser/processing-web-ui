from pydantic import BaseModel, Field
from decimal import Decimal
from datetime import datetime
from app.models.exchange_rate_transaction import TransactionType


class ExchangeRateTransactionCreate(BaseModel):
    """Request to create an income or expense transaction"""
    transaction_type: TransactionType
    amount: Decimal = Field(gt=0, description="Amount in source currency")
    currency_from: str = Field(min_length=1, max_length=10)
    currency_to: str = Field(min_length=1, max_length=10)
    exchange_rate: Decimal = Field(gt=0, description="Exchange rate")
    comment: str | None = None
    
    # Account identification
    internal_company_account_id: int | None = None
    crypto_account_id: int | None = None


class ExchangeRateTransactionResponse(BaseModel):
    id: int
    transaction_type: TransactionType
    amount: Decimal
    currency_from: str
    currency_to: str
    exchange_rate: Decimal
    value_in_target_currency: Decimal
    comment: str | None
    internal_company_account_id: int | None
    crypto_account_id: int | None
    created_by: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class ExchangeRateAverageResponse(BaseModel):
    id: int
    currency_from: str
    currency_to: str
    balance: Decimal
    total_value: Decimal
    average_rate: Decimal
    last_updated: datetime
    
    class Config:
        from_attributes = True


class ExchangeRateHistoryItem(BaseModel):
    """Historical transaction showing how rate changed"""
    id: int
    transaction_type: TransactionType
    amount: Decimal
    exchange_rate: Decimal
    value_in_target_currency: Decimal
    balance_after: Decimal
    total_value_after: Decimal
    average_rate_after: Decimal
    comment: str | None
    created_at: datetime
    created_by: int
    
    class Config:
        from_attributes = True

