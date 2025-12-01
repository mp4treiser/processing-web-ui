from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from app.core.database import Base


class Partner(Base):
    __tablename__ = "partners"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    partner_type = Column(String, nullable=True)  # "supply", "exchange", "direct"
    contact_info = Column(String, nullable=True)

