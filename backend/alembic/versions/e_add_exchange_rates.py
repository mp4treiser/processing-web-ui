"""Add exchange rate tracking tables

Revision ID: e_add_exchange_rates
Revises: d_enhance_deal_history
Create Date: 2026-02-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e_add_exchange_rates'
down_revision: Union[str, None] = 'd_enhance_deal_history'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create enum type if it doesn't exist
    conn = op.get_bind()
    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE transactiontype AS ENUM ('income', 'expense');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """))
    
    # Create exchange_rate_transactions table
    op.create_table(
        'exchange_rate_transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('internal_company_account_id', sa.Integer(), nullable=True),
        sa.Column('crypto_account_id', sa.Integer(), nullable=True),
        sa.Column('transaction_type', sa.String(), nullable=False),  # Will be cast to transactiontype
        sa.Column('amount', sa.Numeric(precision=15, scale=4), nullable=False),
        sa.Column('currency_from', sa.String(), nullable=False),
        sa.Column('currency_to', sa.String(), nullable=False),
        sa.Column('exchange_rate', sa.Numeric(precision=12, scale=6), nullable=False),
        sa.Column('value_in_target_currency', sa.Numeric(precision=15, scale=4), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['internal_company_account_id'], ['internal_company_accounts.id'], ),
        sa.ForeignKeyConstraint(['crypto_account_id'], ['account_balances.id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Now alter the column to use the enum type
    conn.execute(sa.text("""
        ALTER TABLE exchange_rate_transactions
        ALTER COLUMN transaction_type TYPE transactiontype USING transaction_type::transactiontype;
    """))
    
    op.create_index(op.f('ix_exchange_rate_transactions_id'), 'exchange_rate_transactions', ['id'], unique=False)
    
    # Create exchange_rate_averages table
    op.create_table(
        'exchange_rate_averages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('currency_from', sa.String(), nullable=False),
        sa.Column('currency_to', sa.String(), nullable=False),
        sa.Column('balance', sa.Numeric(precision=15, scale=4), nullable=False, server_default='0'),
        sa.Column('total_value', sa.Numeric(precision=15, scale=4), nullable=False, server_default='0'),
        sa.Column('average_rate', sa.Numeric(precision=12, scale=6), nullable=False, server_default='0'),
        sa.Column('last_updated', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('currency_from', 'currency_to', name='uq_currency_pair')
    )
    op.create_index(op.f('ix_exchange_rate_averages_id'), 'exchange_rate_averages', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_exchange_rate_averages_id'), table_name='exchange_rate_averages')
    op.drop_table('exchange_rate_averages')
    op.drop_index(op.f('ix_exchange_rate_transactions_id'), table_name='exchange_rate_transactions')
    op.drop_table('exchange_rate_transactions')
    op.execute('DROP TYPE transactiontype')

