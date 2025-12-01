from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from app.core.database import Base


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    contact_info = Column(String, nullable=True)
    notes = Column(String, nullable=True)

    # Relationships
    deals = relationship("Deal", back_populates="client")

