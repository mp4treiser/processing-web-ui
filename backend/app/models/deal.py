from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class DealStatus(str, enum.Enum):
    NEW = "new"
    CALCULATION_PENDING = "calculation_pending"
    DIRECTOR_APPROVAL_PENDING = "director_approval_pending"
    DIRECTOR_REJECTED = "director_rejected"
    CLIENT_APPROVAL = "client_approval"
    AWAITING_PAYMENT = "awaiting_payment"
    EXECUTION = "execution"
    COMPLETED = "completed"


class Deal(Base):
    __tablename__ = "deals"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Основные параметры
    total_eur_request = Column(Numeric(15, 2), nullable=False)
    client_rate_percent = Column(Numeric(5, 2), default=1.0)  # Ставка на клиента %
    
    # Расчетные поля (заполняет бухгалтер)
    total_usdt_calculated = Column(Numeric(15, 2), nullable=True)
    effective_rate = Column(Numeric(10, 6), nullable=True)
    total_cost_usdt = Column(Numeric(15, 2), nullable=True)
    gross_margin_usdt = Column(Numeric(15, 2), nullable=True)
    net_profit_usdt = Column(Numeric(15, 2), nullable=True)
    partner_share_usdt = Column(Numeric(15, 2), nullable=True)
    
    # Статус и аудит
    status = Column(SQLEnum(DealStatus), default=DealStatus.NEW, nullable=False)
    director_comment = Column(Text, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Даты
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    client = relationship("Client", back_populates="deals")
    manager = relationship("User", foreign_keys=[manager_id], back_populates="deals_managed")
    transactions = relationship("Transaction", back_populates="deal", cascade="all, delete-orphan")

