"""Add deal history and manager commissions

Revision ID: c_deal_history_commissions
Revises: b1234567890a
Create Date: 2026-01-28 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = 'c_deal_history_commissions'
down_revision = 'b1234567890a'
branch_labels = None
depends_on = None


def table_exists(table_name):
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def column_exists(table_name, column_name):
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [c['name'] for c in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    # Создаём таблицу истории сделок
    if not table_exists('deal_history'):
        op.create_table('deal_history',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('deal_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('action', sa.String(length=50), nullable=False),
            sa.Column('changes', sa.JSON(), nullable=True),
            sa.Column('comment', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
            sa.ForeignKeyConstraint(['deal_id'], ['deals.id'], ),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_deal_history_id'), 'deal_history', ['id'], unique=False)
        op.create_index(op.f('ix_deal_history_deal_id'), 'deal_history', ['deal_id'], unique=False)
    
    # Создаём таблицу комиссий менеджеров
    if not table_exists('manager_commissions'):
        op.create_table('manager_commissions',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('commission_percent', sa.Numeric(precision=5, scale=2), nullable=False, server_default='0'),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('user_id')
        )
        op.create_index(op.f('ix_manager_commissions_id'), 'manager_commissions', ['id'], unique=False)
    
    # Создаём таблицу системных настроек
    if not table_exists('system_settings'):
        op.create_table('system_settings',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('key', sa.String(length=100), nullable=False),
            sa.Column('value', sa.String(length=500), nullable=True),
            sa.Column('description', sa.String(length=500), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_system_settings_id'), 'system_settings', ['id'], unique=False)
        op.create_index(op.f('ix_system_settings_key'), 'system_settings', ['key'], unique=True)
    
    # Добавляем колонку created_by_id в deals
    if not column_exists('deals', 'created_by_id'):
        op.add_column('deals', sa.Column('created_by_id', sa.Integer(), nullable=True))
        op.create_foreign_key('fk_deals_created_by_id', 'deals', 'users', ['created_by_id'], ['id'])
    
    # Добавляем настройку по умолчанию для ставки клиента
    op.execute("""
        INSERT INTO system_settings (key, value, description) 
        VALUES ('default_client_rate', '2.0', 'Ставка клиента по умолчанию (в %)')
        ON CONFLICT (key) DO NOTHING
    """)


def downgrade() -> None:
    if column_exists('deals', 'created_by_id'):
        op.drop_constraint('fk_deals_created_by_id', 'deals', type_='foreignkey')
        op.drop_column('deals', 'created_by_id')
    if table_exists('system_settings'):
        op.drop_index(op.f('ix_system_settings_key'), table_name='system_settings')
        op.drop_index(op.f('ix_system_settings_id'), table_name='system_settings')
        op.drop_table('system_settings')
    if table_exists('manager_commissions'):
        op.drop_index(op.f('ix_manager_commissions_id'), table_name='manager_commissions')
        op.drop_table('manager_commissions')
    if table_exists('deal_history'):
        op.drop_index(op.f('ix_deal_history_deal_id'), table_name='deal_history')
        op.drop_index(op.f('ix_deal_history_id'), table_name='deal_history')
        op.drop_table('deal_history')
