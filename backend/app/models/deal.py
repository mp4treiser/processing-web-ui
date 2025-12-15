from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class DealStatus(str, enum.Enum):
    NEW = "new"
    SENIOR_MANAGER_REVIEW = "senior_manager_review"
    SENIOR_MANAGER_APPROVED = "senior_manager_approved"
    SENIOR_MANAGER_REJECTED = "senior_manager_rejected"
    CLIENT_AGREED_TO_PAY = "client_agreed_to_pay"
    AWAITING_CLIENT_PAYMENT = "awaiting_client_payment"
    CLIENT_PARTIALLY_PAID = "client_partially_paid"
    EXECUTION = "execution"
    COMPLETED = "completed"
    # Старые статусы для обратной совместимости (можно удалить после миграции)
    CALCULATION_PENDING = "calculation_pending"
    DIRECTOR_APPROVAL_PENDING = "director_approval_pending"
    DIRECTOR_REJECTED = "director_rejected"
    CLIENT_APPROVAL = "client_approval"
    AWAITING_PAYMENT = "awaiting_payment"


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
    # Используем String вместо SQLEnum, чтобы избежать проблем с регистром enum в PostgreSQL
    # Значения enum будут храниться как строки (например, "senior_manager_approved")
    status = Column(String(50), default=DealStatus.NEW.value, nullable=False)
    director_comment = Column(Text, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Главный менеджер
    senior_manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    senior_manager_comment = Column(Text, nullable=True)
    approved_by_senior_manager_at = Column(DateTime, nullable=True)
    
    # Задолженности клиента
    client_debt_amount = Column(Numeric(15, 2), default=0, nullable=False)
    client_paid_amount = Column(Numeric(15, 2), default=0, nullable=False)
    is_client_debt = Column(String, default="false")  # Boolean as string for compatibility
    client_payment_confirmed_at = Column(DateTime, nullable=True)
    
    # Даты
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    client = relationship("Client", back_populates="deals")
    manager = relationship("User", foreign_keys=[manager_id], back_populates="deals_managed")
    transactions = relationship("Transaction", back_populates="deal", cascade="all, delete-orphan")

