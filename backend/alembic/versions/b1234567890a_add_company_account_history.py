"""add internal_company_account_history table

Revision ID: b1234567890a
Revises: 0fffceaca569
Create Date: 2026-01-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1234567890a'
down_revision: Union[str, None] = '0fffceaca569'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Создаём enum тип только если его ещё нет
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE companybalancechangetype AS ENUM ('auto', 'manual');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    
    # Создаём таблицу через сырой SQL
    op.execute("""
        CREATE TABLE internal_company_account_history (
            id SERIAL PRIMARY KEY,
            account_id INTEGER NOT NULL REFERENCES internal_company_accounts(id),
            previous_balance NUMERIC(30, 10) NOT NULL,
            new_balance NUMERIC(30, 10) NOT NULL,
            change_amount NUMERIC(30, 10) NOT NULL,
            change_type companybalancechangetype NOT NULL,
            transaction_id INTEGER REFERENCES transactions(id),
            deal_id INTEGER REFERENCES deals(id),
            comment TEXT,
            changed_by INTEGER NOT NULL REFERENCES users(id),
            created_at TIMESTAMP DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_internal_company_account_history_id ON internal_company_account_history(id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_internal_company_account_history_id")
    op.execute("DROP TABLE IF EXISTS internal_company_account_history")
