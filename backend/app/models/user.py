from sqlalchemy import Column, Integer, String, Enum as SQLEnum
from sqlalchemy.orm import relationship
import enum
from app.core.database import Base


class UserRole(str, enum.Enum):
    MANAGER = "manager"
    SENIOR_MANAGER = "senior_manager"
    ACCOUNTANT = "accountant"
    DIRECTOR = "director"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    role = Column(String(50), nullable=False, default=UserRole.MANAGER.value)
    is_active = Column(String, default="true")

    # Relationships
    deals_managed = relationship("Deal", back_populates="manager", foreign_keys="Deal.manager_id")

