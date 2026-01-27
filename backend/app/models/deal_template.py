from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean, JSON
from sqlalchemy.sql import func
from app.core.database import Base


class DealTemplate(Base):
    """Шаблоны сделок для быстрого создания"""
    __tablename__ = "deal_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)  # "Стандартный обмен EUR->USDT"
    description = Column(Text, nullable=True)
    
    # Настройки по умолчанию
    client_sends_currency = Column(String, nullable=True)
    client_receives_currency = Column(String, nullable=True)
    
    # Структура маршрутов (JSON)
    # Пример: {"transactions": [{"routes": [{"route_type": "direct", ...}]}]}
    routes_config = Column(JSON, nullable=False)
    
    # Метаданные
    is_active = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Даты
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
