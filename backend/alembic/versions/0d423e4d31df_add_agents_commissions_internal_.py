"""add agents commissions internal companies currencies

Revision ID: 0d423e4d31df
Revises: 1a159481d2c3
Create Date: 2025-01-15 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0d423e4d31df'
down_revision = '1a159481d2c3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Проверяем существование таблиц перед созданием
    conn = op.get_bind()
    
    # Создаем таблицу агентов (если не существует)
    if not conn.dialect.has_table(conn, 'agents'):
        op.create_table(
            'agents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('commission_percent', sa.Numeric(5, 2), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
        op.create_index(op.f('ix_agents_name'), 'agents', ['name'], unique=False)

    # Создаем таблицу комиссий маршрутов (если не существует)
    if not conn.dialect.has_table(conn, 'route_commissions'):
        op.create_table(
            'route_commissions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('route_type', sa.String(), nullable=False),
        sa.Column('commission_percent', sa.Numeric(5, 2), nullable=False),
        sa.Column('commission_fixed', sa.Numeric(15, 2), nullable=True),
        sa.Column('is_fixed_currency', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('currency', sa.String(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
        )

    # Создаем таблицу внутренних компаний (если не существует)
    if not conn.dialect.has_table(conn, 'internal_companies'):
        op.create_table(
            'internal_companies',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('contact_info', sa.String(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
        op.create_index(op.f('ix_internal_companies_name'), 'internal_companies', ['name'], unique=False)

    # Создаем таблицу счетов внутренних компаний (если не существует)
    if not conn.dialect.has_table(conn, 'internal_company_accounts'):
        op.create_table(
            'internal_company_accounts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('account_name', sa.String(), nullable=False),
        sa.Column('account_number', sa.String(), nullable=False),
        sa.Column('currency', sa.String(), nullable=False),
        sa.Column('balance', sa.Numeric(30, 10), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['company_id'], ['internal_companies.id'], ),
        sa.PrimaryKeyConstraint('id')
        )

    # Создаем таблицу валют (если не существует)
    if not conn.dialect.has_table(conn, 'currencies'):
        op.create_table(
            'currencies',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(10), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('is_crypto', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code')
        )
        op.create_index(op.f('ix_currencies_code'), 'currencies', ['code'], unique=True)

    # Добавляем новые поля в таблицу deals (если их еще нет)
    try:
        op.add_column('deals', sa.Column('client_sends_currency', sa.String(), nullable=True))
    except Exception:
        pass  # Колонка уже существует
    try:
        op.add_column('deals', sa.Column('client_receives_currency', sa.String(), nullable=True))
    except Exception:
        pass  # Колонка уже существует
    try:
        op.add_column('deals', sa.Column('deal_amount', sa.Numeric(15, 2), nullable=True))
    except Exception:
        pass  # Колонка уже существует

    # Добавляем новые поля в таблицу transactions (если их еще нет)
    transaction_columns = [
        ('from_currency', sa.String()),
        ('to_currency', sa.String()),
        ('client_company_id', sa.Integer()),
        ('amount_for_client', sa.Numeric(15, 2)),
        ('internal_company_id', sa.Integer()),
        ('internal_company_account_id', sa.Integer()),
        ('amount_from_account', sa.Numeric(15, 2)),
        ('bank_commission_id', sa.Integer()),
        ('crypto_account_id', sa.Integer()),
        ('exchange_from_currency', sa.String()),
        ('exchange_to_currency', sa.String()),
        ('crypto_exchange_rate', sa.Numeric(10, 6)),
        ('agent_commission_id', sa.Integer()),
        ('exchange_commission_id', sa.Integer()),
        ('exchange_bank_commission_id', sa.Integer()),
        ('partner_company_id', sa.Integer()),
        ('amount_to_partner_usdt', sa.Numeric(15, 2)),
        ('amount_partner_sends', sa.Numeric(15, 2)),
        ('partner_commission_id', sa.Integer()),
        ('partner_50_50_company_id', sa.Integer()),
        ('amount_to_partner_50_50_usdt', sa.Numeric(15, 2)),
        ('amount_partner_50_50_sends', sa.Numeric(15, 2)),
        ('partner_50_50_commission_id', sa.Integer()),
        ('final_income', sa.Numeric(15, 2)),
    ]
    
    for col_name, col_type in transaction_columns:
        try:
            op.add_column('transactions', sa.Column(col_name, col_type, nullable=True))
        except Exception:
            pass  # Колонка уже существует

    # Добавляем внешние ключи (если их еще нет)
    foreign_keys = [
        ('fk_transactions_client_company', 'companies', ['client_company_id']),
        ('fk_transactions_internal_company', 'internal_companies', ['internal_company_id']),
        ('fk_transactions_internal_account', 'internal_company_accounts', ['internal_company_account_id']),
        ('fk_transactions_crypto_account', 'account_balances', ['crypto_account_id']),
        ('fk_transactions_bank_commission', 'route_commissions', ['bank_commission_id']),
        ('fk_transactions_agent_commission', 'route_commissions', ['agent_commission_id']),
        ('fk_transactions_exchange_commission', 'route_commissions', ['exchange_commission_id']),
        ('fk_transactions_exchange_bank_commission', 'route_commissions', ['exchange_bank_commission_id']),
        ('fk_transactions_partner_commission', 'route_commissions', ['partner_commission_id']),
        ('fk_transactions_partner_50_50_commission', 'route_commissions', ['partner_50_50_commission_id']),
    ]
    
    for fk_name, ref_table, columns in foreign_keys:
        try:
            op.create_foreign_key(fk_name, 'transactions', ref_table, columns, ['id'])
        except Exception:
            pass  # Внешний ключ уже существует

    # Изменяем route_type на String вместо enum (если еще не изменен)
    try:
        op.alter_column('transactions', 'route_type', type_=sa.String(), nullable=True)
    except Exception:
        pass  # Уже изменен


def downgrade() -> None:
    # Удаляем внешние ключи
    op.drop_constraint('fk_transactions_partner_50_50_commission', 'transactions', type_='foreignkey')
    op.drop_constraint('fk_transactions_partner_commission', 'transactions', type_='foreignkey')
    op.drop_constraint('fk_transactions_exchange_bank_commission', 'transactions', type_='foreignkey')
    op.drop_constraint('fk_transactions_exchange_commission', 'transactions', type_='foreignkey')
    op.drop_constraint('fk_transactions_agent_commission', 'transactions', type_='foreignkey')
    op.drop_constraint('fk_transactions_bank_commission', 'transactions', type_='foreignkey')
    op.drop_constraint('fk_transactions_crypto_account', 'transactions', type_='foreignkey')
    op.drop_constraint('fk_transactions_internal_account', 'transactions', type_='foreignkey')
    op.drop_constraint('fk_transactions_internal_company', 'transactions', type_='foreignkey')
    op.drop_constraint('fk_transactions_client_company', 'transactions', type_='foreignkey')

    # Удаляем новые колонки из transactions
    op.drop_column('transactions', 'final_income')
    op.drop_column('transactions', 'partner_50_50_commission_id')
    op.drop_column('transactions', 'amount_partner_50_50_sends')
    op.drop_column('transactions', 'amount_to_partner_50_50_usdt')
    op.drop_column('transactions', 'partner_50_50_company_id')
    op.drop_column('transactions', 'partner_commission_id')
    op.drop_column('transactions', 'amount_partner_sends')
    op.drop_column('transactions', 'amount_to_partner_usdt')
    op.drop_column('transactions', 'partner_company_id')
    op.drop_column('transactions', 'exchange_bank_commission_id')
    op.drop_column('transactions', 'exchange_commission_id')
    op.drop_column('transactions', 'agent_commission_id')
    op.drop_column('transactions', 'crypto_exchange_rate')
    op.drop_column('transactions', 'exchange_to_currency')
    op.drop_column('transactions', 'exchange_from_currency')
    op.drop_column('transactions', 'crypto_account_id')
    op.drop_column('transactions', 'bank_commission_id')
    op.drop_column('transactions', 'amount_from_account')
    op.drop_column('transactions', 'internal_company_account_id')
    op.drop_column('transactions', 'internal_company_id')
    op.drop_column('transactions', 'amount_for_client')
    op.drop_column('transactions', 'client_company_id')
    op.drop_column('transactions', 'to_currency')
    op.drop_column('transactions', 'from_currency')

    # Удаляем новые колонки из deals
    op.drop_column('deals', 'deal_amount')
    op.drop_column('deals', 'client_receives_currency')
    op.drop_column('deals', 'client_sends_currency')

    # Удаляем таблицы
    op.drop_index(op.f('ix_currencies_code'), table_name='currencies')
    op.drop_table('currencies')
    op.drop_table('internal_company_accounts')
    op.drop_index(op.f('ix_internal_companies_name'), table_name='internal_companies')
    op.drop_table('internal_companies')
    op.drop_table('route_commissions')
    op.drop_index(op.f('ix_agents_name'), table_name='agents')
    op.drop_table('agents')
