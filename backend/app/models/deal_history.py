from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class DealHistoryAction(str, enum.Enum):
    CREATED = "created"
    UPDATED = "updated"
    STATUS_CHANGED = "status_changed"
    TRANSACTION_ADDED = "transaction_added"
    TRANSACTION_REMOVED = "transaction_removed"
    CLIENT_RATE_CHANGED = "client_rate_changed"
    APPROVED = "approved"
    REJECTED = "rejected"
    PAYMENT_CONFIRMED = "payment_confirmed"


class DealHistory(Base):
    __tablename__ = "deal_history"

    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    action = Column(String(50), nullable=False)  # created, updated, status_changed, etc.
    
    # Детали изменения в JSON формате
    # Формат: {"field_name": {"old": old_value, "new": new_value}, ...}
    changes = Column(JSON, nullable=True)
    
    # Комментарий к изменению (опционально)
    comment = Column(Text, nullable=True)
    
    # Дата изменения
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    deal = relationship("Deal", back_populates="history")
    user = relationship("User")

