from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, Text, Boolean, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class RouteType(str, enum.Enum):
    EXCHANGE = "exchange"  # Биржа
    SUPPLY_PARTNER = "supply_partner"  # Supply / Партнер (Внутренний)
    DIRECT_PAYMENT = "direct_payment"  # Прямой платеж
    SPLIT_50_50 = "split_50_50"  # Сплит 50/50


class TransactionStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    PAID = "paid"
    ERROR = "error"


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    
    # Основные данные (заполняет менеджер)
    target_company = Column(String, nullable=False)  # Название компании получателя
    amount_eur = Column(Numeric(15, 2), nullable=False)
    recipient_details = Column(Text, nullable=True)  # IBAN, реквизиты
    invoice_file = Column(String, nullable=True)  # Путь к файлу инвойса
    
    # Маршрут (заполняет бухгалтер)
    route_type = Column(SQLEnum(RouteType), nullable=True)
    partner_id = Column(Integer, ForeignKey("partners.id"), nullable=True)
    source_company = Column(String, nullable=True)  # Наша компания А, Б и т.д.
    
    # Параметры маршрута (зависят от типа)
    exchange_rate = Column(Numeric(10, 6), nullable=True)
    partner_bonus_rate = Column(Numeric(5, 2), nullable=True)  # +0.6% для supply
    partner_cost_rate = Column(Numeric(5, 2), nullable=True)  # -0.3% для split
    exchange_fee_percent = Column(Numeric(5, 2), nullable=True)  # -0.3%
    intermediary_fee_percent = Column(Numeric(5, 2), nullable=True)  # -0.1%
    bank_fee_fix_eur = Column(Numeric(10, 2), nullable=True)  # -30 EUR
    bank_fee_percent = Column(Numeric(5, 2), nullable=True)  # -0.3%
    profit_split_enabled = Column(Boolean, default=False)
    
    # Расчетные поля
    cost_usdt = Column(Numeric(15, 2), nullable=True)
    client_price_usdt = Column(Numeric(15, 2), nullable=True)
    profit_usdt = Column(Numeric(15, 2), nullable=True)
    partner_profit_usdt = Column(Numeric(15, 2), nullable=True)
    
    # Исполнение
    status = Column(SQLEnum(TransactionStatus), default=TransactionStatus.PENDING)
    payment_proof_file = Column(String, nullable=True)  # Платежка
    paid_at = Column(DateTime, nullable=True)
    
    # Даты
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    deal = relationship("Deal", back_populates="transactions")

