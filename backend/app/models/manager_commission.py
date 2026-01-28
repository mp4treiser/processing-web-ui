from sqlalchemy import Column, Integer, Numeric, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class ManagerCommission(Base):
    """Комиссии менеджеров - справочник с процентом комиссии для каждого пользователя"""
    __tablename__ = "manager_commissions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    
    # Процент комиссии менеджера (например, 10%)
    commission_percent = Column(Numeric(5, 2), nullable=False, default=0)
    
    # Активность записи
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Аудит
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", backref="manager_commission")

