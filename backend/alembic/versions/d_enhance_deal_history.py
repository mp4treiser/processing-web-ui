"""Enhance deal_history with user denormalization

Revision ID: d_enhance_deal_history
Revises: c_deal_history_commissions
Create Date: 2026-01-29

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd_enhance_deal_history'
down_revision: Union[str, None] = 'c_deal_history_commissions'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Добавляем поля для денормализации информации о пользователе
    op.add_column('deal_history', sa.Column('user_email', sa.String, nullable=True))
    op.add_column('deal_history', sa.Column('user_name', sa.String, nullable=True))
    op.add_column('deal_history', sa.Column('user_role', sa.String, nullable=True))


def downgrade() -> None:
    op.drop_column('deal_history', 'user_role')
    op.drop_column('deal_history', 'user_name')
    op.drop_column('deal_history', 'user_email')




