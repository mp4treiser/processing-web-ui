"""Add senior manager role, new deal statuses, companies, accounts, and balance tracking

Revision ID: 001_add_senior_manager
Revises: 
Create Date: 2025-01-03

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001_add_senior_manager'
down_revision = '9f5bd5440705'  # Связываем с существующей миграцией
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Обновить enum UserRole - добавить SENIOR_MANAGER
    # В PostgreSQL нельзя добавлять значения в enum внутри транзакции
    # Используем DO блок для безопасного добавления с проверкой существования
    conn = op.get_bind()
    
    # Добавляем значения enum через DO блок с обработкой ошибок
    enum_additions = [
        ("userrole", "senior_manager"),
        ("dealstatus", "senior_manager_review"),
        ("dealstatus", "senior_manager_approved"),
        ("dealstatus", "senior_manager_rejected"),
        ("dealstatus", "client_agreed_to_pay"),
        ("dealstatus", "awaiting_client_payment"),
        ("dealstatus", "client_partially_paid"),
    ]
    
    for enum_name, enum_value in enum_additions:
        # Проверяем существование через DO блок
        conn.execute(sa.text(f"""
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_enum 
                    WHERE enumlabel = '{enum_value}' 
                    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = '{enum_name}')
                ) THEN
                    EXECUTE format('ALTER TYPE %I ADD VALUE %L', '{enum_name}', '{enum_value}');
                END IF;
            EXCEPTION
                WHEN OTHERS THEN NULL;
            END $$;
        """))
    
    # Функция для проверки существования колонки
    def column_exists(table_name, column_name):
        result = conn.execute(sa.text(f"""
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = '{table_name}' AND column_name = '{column_name}'
        """))
        return result.fetchone() is not None
    
    # Функция для проверки существования таблицы
    def table_exists(table_name):
        result = conn.execute(sa.text(f"""
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = '{table_name}'
        """))
        return result.fetchone() is not None
    
    # Функция для проверки существования foreign key
    def fk_exists(fk_name, table_name):
        result = conn.execute(sa.text(f"""
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = '{fk_name}' AND table_name = '{table_name}'
        """))
        return result.fetchone() is not None
    
    # Добавить поля в таблицу deals (с проверкой существования таблицы и колонок)
    if table_exists('deals'):
        if not column_exists('deals', 'senior_manager_id'):
            op.add_column('deals', sa.Column('senior_manager_id', sa.Integer(), nullable=True))
        if not column_exists('deals', 'senior_manager_comment'):
            op.add_column('deals', sa.Column('senior_manager_comment', sa.Text(), nullable=True))
        if not column_exists('deals', 'approved_by_senior_manager_at'):
            op.add_column('deals', sa.Column('approved_by_senior_manager_at', sa.DateTime(), nullable=True))
        if not column_exists('deals', 'client_debt_amount'):
            op.add_column('deals', sa.Column('client_debt_amount', sa.Numeric(15, 2), server_default='0', nullable=False))
        if not column_exists('deals', 'client_paid_amount'):
            op.add_column('deals', sa.Column('client_paid_amount', sa.Numeric(15, 2), server_default='0', nullable=False))
        if not column_exists('deals', 'is_client_debt'):
            op.add_column('deals', sa.Column('is_client_debt', sa.String(), server_default='false', nullable=True))
        if not column_exists('deals', 'client_payment_confirmed_at'):
            op.add_column('deals', sa.Column('client_payment_confirmed_at', sa.DateTime(), nullable=True))
        
        if table_exists('users') and not fk_exists('fk_deals_senior_manager', 'deals'):
            op.create_foreign_key('fk_deals_senior_manager', 'deals', 'users', ['senior_manager_id'], ['id'])
    
    # Обновить таблицу clients (с проверкой существования таблицы и колонок)
    if table_exists('clients'):
        if not column_exists('clients', 'created_by'):
            op.add_column('clients', sa.Column('created_by', sa.Integer(), nullable=True))
        if not column_exists('clients', 'is_active'):
            op.add_column('clients', sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False))
        if not column_exists('clients', 'created_at'):
            op.add_column('clients', sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=True))
        if not column_exists('clients', 'updated_at'):
            op.add_column('clients', sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=True))
        
        if table_exists('users') and not fk_exists('fk_clients_created_by', 'clients'):
            op.create_foreign_key('fk_clients_created_by', 'clients', 'users', ['created_by'], ['id'])
    
    # Создать таблицу companies (с проверкой существования)
    if not table_exists('companies'):
        op.create_table('companies',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('client_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('contact_info', sa.String(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_companies_name'), 'companies', ['name'], unique=False)
        if table_exists('clients') and not fk_exists('fk_companies_client', 'companies'):
            op.create_foreign_key('fk_companies_client', 'companies', 'clients', ['client_id'], ['id'])
        if table_exists('users') and not fk_exists('fk_companies_created_by', 'companies'):
            op.create_foreign_key('fk_companies_created_by', 'companies', 'users', ['created_by'], ['id'])
    
    # Создать таблицу company_accounts (с проверкой существования)
    if not table_exists('company_accounts'):
        op.create_table('company_accounts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('account_name', sa.String(), nullable=False),
        sa.Column('account_number', sa.String(), nullable=False),
        sa.Column('currency', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('id')
        )
        if table_exists('companies') and not fk_exists('fk_company_accounts_company', 'company_accounts'):
            op.create_foreign_key('fk_company_accounts_company', 'company_accounts', 'companies', ['company_id'], ['id'])
    
    # Создать enum для BalanceChangeType
    balance_change_type_enum = postgresql.ENUM('auto', 'manual', name='balancechangetype', create_type=False)
    balance_change_type_enum.create(op.get_bind(), checkfirst=True)
    
    # Создать таблицу account_balances (с проверкой существования)
    if not table_exists('account_balances'):
        op.create_table('account_balances',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('account_name', sa.String(), nullable=False),
        sa.Column('balance', sa.Numeric(30, 10), server_default='0', nullable=False),
        sa.Column('currency', sa.String(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('updated_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_account_balances_account_name'), 'account_balances', ['account_name'], unique=False)
        if table_exists('users') and not fk_exists('fk_account_balances_created_by', 'account_balances'):
            op.create_foreign_key('fk_account_balances_created_by', 'account_balances', 'users', ['created_by'], ['id'])
        if table_exists('users') and not fk_exists('fk_account_balances_updated_by', 'account_balances'):
            op.create_foreign_key('fk_account_balances_updated_by', 'account_balances', 'users', ['updated_by'], ['id'])
    
    # Создать таблицу account_balance_history (с проверкой существования)
    if not table_exists('account_balance_history'):
        op.create_table('account_balance_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('account_balance_id', sa.Integer(), nullable=False),
        sa.Column('previous_balance', sa.Numeric(30, 10), nullable=False),
        sa.Column('new_balance', sa.Numeric(30, 10), nullable=False),
        sa.Column('change_amount', sa.Numeric(30, 10), nullable=False),
        sa.Column('change_type', postgresql.ENUM('auto', 'manual', name='balancechangetype'), nullable=False),
        sa.Column('transaction_id', sa.Integer(), nullable=True),
        sa.Column('deal_id', sa.Integer(), nullable=True),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('changed_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('id')
        )
        if not fk_exists('fk_account_balance_history_account', 'account_balance_history'):
            op.create_foreign_key('fk_account_balance_history_account', 'account_balance_history', 'account_balances', ['account_balance_id'], ['id'])
        if table_exists('transactions') and not fk_exists('fk_account_balance_history_transaction', 'account_balance_history'):
            op.create_foreign_key('fk_account_balance_history_transaction', 'account_balance_history', 'transactions', ['transaction_id'], ['id'])
        if table_exists('deals') and not fk_exists('fk_account_balance_history_deal', 'account_balance_history'):
            op.create_foreign_key('fk_account_balance_history_deal', 'account_balance_history', 'deals', ['deal_id'], ['id'])
        if table_exists('users') and not fk_exists('fk_account_balance_history_changed_by', 'account_balance_history'):
            op.create_foreign_key('fk_account_balance_history_changed_by', 'account_balance_history', 'users', ['changed_by'], ['id'])


def downgrade() -> None:
    # Удалить таблицы в обратном порядке
    op.drop_table('account_balance_history')
    op.drop_table('account_balances')
    op.drop_table('company_accounts')
    op.drop_table('companies')
    
    # Удалить enum
    op.execute("DROP TYPE IF EXISTS balancechangetype")
    
    # Удалить поля из deals
    op.drop_constraint('fk_deals_senior_manager', 'deals', type_='foreignkey')
    op.drop_column('deals', 'client_payment_confirmed_at')
    op.drop_column('deals', 'is_client_debt')
    op.drop_column('deals', 'client_paid_amount')
    op.drop_column('deals', 'client_debt_amount')
    op.drop_column('deals', 'approved_by_senior_manager_at')
    op.drop_column('deals', 'senior_manager_comment')
    op.drop_column('deals', 'senior_manager_id')
    
    # Удалить поля из clients
    op.drop_constraint('fk_clients_created_by', 'clients', type_='foreignkey')
    op.drop_column('clients', 'updated_at')
    op.drop_column('clients', 'created_at')
    op.drop_column('clients', 'is_active')
    op.drop_column('clients', 'created_by')
    
    # Примечание: удаление значений из enum в PostgreSQL сложно, поэтому оставляем их

