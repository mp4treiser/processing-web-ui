"""Initial migration

Revision ID: 9f5bd5440705
Revises: 
Create Date: 2025-11-29 22:44:40.093973

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import sys
import os

# Добавляем путь к приложению для импорта моделей
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.core.database import Base
from app.models import *  # Импортируем все модели

# revision identifiers, used by Alembic.
revision = '9f5bd5440705'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Создаем все базовые таблицы, если их нет
    # Это безопасно для новых установок
    conn = op.get_bind()
    
    # Проверяем, существует ли таблица deals
    result = conn.execute(sa.text("""
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'deals'
    """))
    
    if result.fetchone() is None:
        # Если таблиц нет, создаем их все через Base.metadata
        # Используем существующее соединение
        Base.metadata.create_all(bind=conn)
    # Если таблицы уже существуют, ничего не делаем (миграция уже была применена)


def downgrade() -> None:
    # Откат не требуется для базовой миграции
    pass

