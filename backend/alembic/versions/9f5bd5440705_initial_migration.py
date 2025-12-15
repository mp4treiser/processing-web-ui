"""Initial migration

Revision ID: 9f5bd5440705
Revises: 
Create Date: 2025-11-29 22:44:40.093973

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '9f5bd5440705'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Эта миграция уже применена, поэтому оставляем пустой
    # Все таблицы уже созданы
    pass


def downgrade() -> None:
    # Откат не требуется
    pass

