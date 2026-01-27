"""add exchange_amount to transactions

Revision ID: 0fffceaca569
Revises: a4229c25081e
Create Date: 2026-01-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0fffceaca569'
down_revision: Union[str, None] = 'a4229c25081e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Добавляем поле exchange_amount в таблицу transactions
    op.add_column('transactions', sa.Column('exchange_amount', sa.Numeric(15, 4), nullable=True))


def downgrade() -> None:
    op.drop_column('transactions', 'exchange_amount')
