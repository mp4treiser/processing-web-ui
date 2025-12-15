"""change deal status to string

Revision ID: 1a159481d2c3
Revises: 001_add_senior_manager
Create Date: 2025-12-14 13:50:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '1a159481d2c3'
down_revision = '001_add_senior_manager'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Изменяем тип колонки status с enum на VARCHAR(50)
    # Сначала создаем новую колонку с типом VARCHAR
    op.add_column('deals', sa.Column('status_new', sa.String(50), nullable=True))
    
    # Копируем данные из старой колонки в новую, преобразуя enum в строку
    # PostgreSQL enum хранит значения как строки, поэтому просто копируем
    op.execute("""
        UPDATE deals 
        SET status_new = status::text
    """)
    
    # Делаем новую колонку NOT NULL
    op.alter_column('deals', 'status_new', nullable=False)
    
    # Удаляем старую колонку
    op.drop_column('deals', 'status')
    
    # Переименовываем новую колонку в status
    op.alter_column('deals', 'status_new', new_column_name='status')


def downgrade() -> None:
    # Возвращаем enum тип (но это сложно, так как нужно знать все значения)
    # Для простоты оставляем как VARCHAR
    pass
