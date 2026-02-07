from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class TransactionType(str, enum.Enum):
    INCOME = "income"
    EXPENSE = "expense"


class ExchangeRateTransaction(Base):
    __tablename__ = "exchange_rate_transactions"

    id = Column(Integer, primary_key=True, index=True)
    
    # Account reference (can be either InternalCompanyAccount or AccountBalance)
    # We'll store both to identify which type
    internal_company_account_id = Column(Integer, ForeignKey("internal_company_accounts.id"), nullable=True)
    crypto_account_id = Column(Integer, ForeignKey("account_balances.id"), nullable=True)
    
    # Transaction details
    transaction_type = Column(SQLEnum(TransactionType), nullable=False)  # INCOME or EXPENSE
    amount = Column(Numeric(15, 4), nullable=False)  # Amount in source currency
    currency_from = Column(String, nullable=False)  # Source currency (e.g., EUR)
    currency_to = Column(String, nullable=False)    # Target currency (e.g., USD)
    exchange_rate = Column(Numeric(12, 6), nullable=False)  # Exchange rate at time of transaction
    value_in_target_currency = Column(Numeric(15, 4), nullable=False)  # Calculated: amount × rate
    
    # Metadata
    comment = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    creator = relationship("User", foreign_keys=[created_by])

