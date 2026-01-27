from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, Text, Boolean, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class RouteType(str, enum.Enum):
    DIRECT = "direct"  # Прямой перевод (с нашей компании)
    EXCHANGE = "exchange"  # Биржа (наша компания)
    PARTNER = "partner"  # Партнёр
    PARTNER_50_50 = "partner_50_50"  # Партнёр 50-50


class TransactionStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    PAID = "paid"
    ERROR = "error"


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    
    # Основные данные транзакции
    from_currency = Column(String, nullable=True)
    to_currency = Column(String, nullable=True)
    exchange_rate = Column(Numeric(10, 6), nullable=True)
    client_company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    amount_for_client = Column(Numeric(15, 2), nullable=True)
    route_type = Column(String, nullable=True)  # direct, exchange, partner, partner_50_50
    
    # Поля для прямого перевода (DIRECT)
    internal_company_id = Column(Integer, ForeignKey("internal_companies.id"), nullable=True)
    internal_company_account_id = Column(Integer, ForeignKey("internal_company_accounts.id"), nullable=True)
    amount_from_account = Column(Numeric(15, 2), nullable=True)
    bank_commission_id = Column(Integer, ForeignKey("route_commissions.id"), nullable=True)
    
    # Поля для биржи (EXCHANGE)
    crypto_account_id = Column(Integer, ForeignKey("account_balances.id"), nullable=True)
    exchange_from_currency = Column(String, nullable=True)
    exchange_to_currency = Column(String, nullable=True)
    exchange_amount = Column(Numeric(15, 4), nullable=True)  # Рассчитанная сумма крипты для списания
    crypto_exchange_rate = Column(Numeric(10, 6), nullable=True)
    agent_commission_id = Column(Integer, ForeignKey("route_commissions.id"), nullable=True)
    exchange_commission_id = Column(Integer, ForeignKey("route_commissions.id"), nullable=True)
    exchange_bank_commission_id = Column(Integer, ForeignKey("route_commissions.id"), nullable=True)
    
    # Поля для партнёра (PARTNER)
    partner_company_id = Column(Integer, ForeignKey("internal_companies.id"), nullable=True)
    amount_to_partner_usdt = Column(Numeric(15, 2), nullable=True)
    amount_partner_sends = Column(Numeric(15, 2), nullable=True)
    partner_commission_id = Column(Integer, ForeignKey("route_commissions.id"), nullable=True)
    
    # Поля для партнёра 50-50 (PARTNER_50_50)
    partner_50_50_company_id = Column(Integer, ForeignKey("internal_companies.id"), nullable=True)
    amount_to_partner_50_50_usdt = Column(Numeric(15, 2), nullable=True)
    amount_partner_50_50_sends = Column(Numeric(15, 2), nullable=True)
    partner_50_50_commission_id = Column(Integer, ForeignKey("route_commissions.id"), nullable=True)
    
    # Расчетные поля (заполняются бэкендом)
    calculated_route_income = Column(Numeric(15, 2), nullable=True)  # Рассчитанный доход маршрута
    calculated_commission_total = Column(Numeric(15, 2), nullable=True)  # Сумма всех комиссий
    cost_usdt = Column(Numeric(15, 2), nullable=True)
    client_price_usdt = Column(Numeric(15, 2), nullable=True)
    profit_usdt = Column(Numeric(15, 2), nullable=True)
    partner_profit_usdt = Column(Numeric(15, 2), nullable=True)
    final_income = Column(Numeric(15, 2), nullable=True)
    
    # Исполнение
    status = Column(SQLEnum(TransactionStatus), default=TransactionStatus.PENDING)
    payment_proof_file = Column(String, nullable=True)
    paid_at = Column(DateTime, nullable=True)
    
    # Даты
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    deal = relationship("Deal", back_populates="transactions")

