from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class AccountBalance(Base):
    __tablename__ = "account_balances"

    id = Column(Integer, primary_key=True, index=True)
    account_name = Column(String, nullable=False, index=True)  # "EUR", "IBAN EUR", "BTC Wallet", "USDT Binance" и т.д.
    balance = Column(Numeric(30, 10), nullable=False, default=0)  # поддержка больших чисел и много знаков после запятой
    currency = Column(String, nullable=True)  # опционально для группировки
    notes = Column(Text, nullable=True)
    
    # Аудит
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Даты
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    history = relationship("AccountBalanceHistory", back_populates="account_balance", cascade="all, delete-orphan")

