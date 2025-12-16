from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class RouteType(str, enum.Enum):
    DIRECT = "direct"  # Прямой перевод
    EXCHANGE = "exchange"  # Биржа
    AGENT = "agent"  # Агент
    PARTNER = "partner"  # Партнёр
    PARTNER_50_50 = "partner_50_50"  # Партнёр 50-50


class RouteCommission(Base):
    __tablename__ = "route_commissions"

    id = Column(Integer, primary_key=True, index=True)
    route_type = Column(String, nullable=False)  # DIRECT, EXCHANGE, AGENT, PARTNER, PARTNER_50_50
    commission_percent = Column(Numeric(5, 2), nullable=False)  # Комиссия в процентах
    commission_fixed = Column(Numeric(15, 2), nullable=True)  # Комиссия в твёрдой валюте (если используется)
    is_fixed_currency = Column(Boolean, default=False, nullable=False)  # Чекбокс: в твёрдой валюте или в процентах
    currency = Column(String, nullable=True)  # Валюта для фиксированной комиссии (EUR, USD и т.д.)
    
    # Аудит
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Даты
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

