from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class CompanyAccount(Base):
    __tablename__ = "company_accounts"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    account_name = Column(String, nullable=False)  # "IBAN EUR", "BTC Wallet" и т.д.
    account_number = Column(String, nullable=False)  # IBAN, адрес кошелька и т.д.
    currency = Column(String, nullable=True)  # "EUR", "USD", "BTC", "USDT" и т.д.
    
    # Аудит
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Даты
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    company = relationship("Company", back_populates="accounts")

