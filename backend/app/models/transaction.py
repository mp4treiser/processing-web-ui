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
    
    # Основные данные транзакции (заполняет бухгалтер)
    from_currency = Column(String, nullable=True)  # Из какой валюты
    to_currency = Column(String, nullable=True)  # В какую валюту
    exchange_rate = Column(Numeric(10, 6), nullable=True)  # Курс операции
    client_company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)  # Компания клиента
    amount_for_client = Column(Numeric(15, 2), nullable=True)  # Сумма на клиента
    route_type = Column(String, nullable=True)  # Тип транзакции: direct, exchange, partner, partner_50_50
    
    # Поля для прямого перевода (DIRECT)
    internal_company_id = Column(Integer, ForeignKey("internal_companies.id"), nullable=True)  # Наша компания
    internal_company_account_id = Column(Integer, ForeignKey("internal_company_accounts.id"), nullable=True)  # Счет компании
    amount_from_account = Column(Numeric(15, 2), nullable=True)  # Сумма перевода с нашего счёта
    bank_commission_id = Column(Integer, ForeignKey("route_commissions.id"), nullable=True)  # Комиссия банка (из справочника)
    
    # Поля для биржи (EXCHANGE)
    crypto_account_id = Column(Integer, ForeignKey("account_balances.id"), nullable=True)  # Наши счета криптовалюты
    exchange_from_currency = Column(String, nullable=True)  # С какой валюты меняем
    exchange_to_currency = Column(String, nullable=True)  # На какую валюту меняем
    crypto_exchange_rate = Column(Numeric(10, 6), nullable=True)  # Курс обмена крипты
    agent_commission_id = Column(Integer, ForeignKey("route_commissions.id"), nullable=True)  # Комиссия агента
    exchange_commission_id = Column(Integer, ForeignKey("route_commissions.id"), nullable=True)  # Комиссия биржи
    exchange_bank_commission_id = Column(Integer, ForeignKey("route_commissions.id"), nullable=True)  # Комиссия банка
    
    # Поля для партнёра (PARTNER)
    partner_company_id = Column(Integer, ForeignKey("internal_companies.id"), nullable=True)  # Компания партнёр
    amount_to_partner_usdt = Column(Numeric(15, 2), nullable=True)  # Сумма на партнёра в USDT
    amount_partner_sends = Column(Numeric(15, 2), nullable=True)  # Сумма которую отправит партнёр клиенту
    partner_commission_id = Column(Integer, ForeignKey("route_commissions.id"), nullable=True)  # Комиссия от партнёра
    
    # Поля для партнёра 50-50 (PARTNER_50_50)
    partner_50_50_company_id = Column(Integer, ForeignKey("internal_companies.id"), nullable=True)  # Компания партнёр
    amount_to_partner_50_50_usdt = Column(Numeric(15, 2), nullable=True)  # Сумма на партнёра в USDT
    amount_partner_50_50_sends = Column(Numeric(15, 2), nullable=True)  # Сумма которую отправит партнёр клиенту
    partner_50_50_commission_id = Column(Integer, ForeignKey("route_commissions.id"), nullable=True)  # Комиссия от партнёра 50-50
    
    # Старые поля для обратной совместимости (можно удалить после миграции)
    target_company = Column(String, nullable=True)  # Название компании получателя
    amount_eur = Column(Numeric(15, 2), nullable=True)
    recipient_details = Column(Text, nullable=True)  # IBAN, реквизиты
    invoice_file = Column(String, nullable=True)  # Путь к файлу инвойса
    partner_id = Column(Integer, ForeignKey("partners.id"), nullable=True)
    source_company = Column(String, nullable=True)  # Наша компания А, Б и т.д.
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
    final_income = Column(Numeric(15, 2), nullable=True)  # Конечный доход по транзакции
    
    # Исполнение
    status = Column(SQLEnum(TransactionStatus), default=TransactionStatus.PENDING)
    payment_proof_file = Column(String, nullable=True)  # Платежка
    paid_at = Column(DateTime, nullable=True)
    
    # Даты
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    deal = relationship("Deal", back_populates="transactions")

