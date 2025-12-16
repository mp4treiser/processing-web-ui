from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Currency(Base):
    """Справочник валют"""
    __tablename__ = "currencies"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(10), nullable=False, unique=True, index=True)  # EUR, USD, USDT, BTC и т.д.
    name = Column(String, nullable=False)  # Euro, US Dollar, Tether и т.д.
    is_crypto = Column(Boolean, default=False, nullable=False)  # Криптовалюта или фиат
    
    # Аудит
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Даты
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

