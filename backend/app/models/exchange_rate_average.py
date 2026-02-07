from sqlalchemy import Column, Integer, String, Numeric, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class ExchangeRateAverage(Base):
    __tablename__ = "exchange_rate_averages"

    id = Column(Integer, primary_key=True, index=True)
    
    # Currency pair
    currency_from = Column(String, nullable=False)  # e.g., EUR
    currency_to = Column(String, nullable=False)    # e.g., USD
    
    # Current state
    balance = Column(Numeric(15, 4), nullable=False, default=0)  # Current balance in source currency
    total_value = Column(Numeric(15, 4), nullable=False, default=0)  # Total value in target currency
    average_rate = Column(Numeric(12, 6), nullable=False, default=0)  # Calculated: total_value / balance
    
    # Metadata
    last_updated = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Ensure one record per currency pair
    __table_args__ = (
        UniqueConstraint('currency_from', 'currency_to', name='uq_currency_pair'),
    )

