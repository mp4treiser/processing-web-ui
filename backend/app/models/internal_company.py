from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class InternalCompany(Base):
    """Внутренние компании (наши компании) со счетами"""
    __tablename__ = "internal_companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    contact_info = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    
    # Аудит
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Даты
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    accounts = relationship("InternalCompanyAccount", back_populates="company", cascade="all, delete-orphan")

