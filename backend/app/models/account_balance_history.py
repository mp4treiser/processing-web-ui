from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class BalanceChangeType(str, enum.Enum):
    AUTO = "auto"  # автоматическое списание при проведении транзакции
    MANUAL = "manual"  # ручная корректировка


class AccountBalanceHistory(Base):
    __tablename__ = "account_balance_history"

    id = Column(Integer, primary_key=True, index=True)
    account_balance_id = Column(Integer, ForeignKey("account_balances.id"), nullable=False)
    
    # Балансы
    previous_balance = Column(Numeric(30, 10), nullable=False)
    new_balance = Column(Numeric(30, 10), nullable=False)
    change_amount = Column(Numeric(30, 10), nullable=False)  # положительное или отрицательное
    
    # Тип изменения
    change_type = Column(SQLEnum(BalanceChangeType, values_callable=lambda x: [e.value for e in x]), nullable=False)
    
    # Связь с транзакцией/сделкой (если изменение связано с ними)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=True)
    
    # Комментарий (обязателен при ручной корректировке)
    comment = Column(Text, nullable=True)
    
    # Кто изменил
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Дата
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    account_balance = relationship("AccountBalance", back_populates="history")

