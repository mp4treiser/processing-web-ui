"""fix_balance_change_type_enum

Revision ID: 492e18ae5e30
Revises: e_add_exchange_rates
Create Date: 2026-02-07 13:07:01.959036

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '492e18ae5e30'
down_revision = 'e_add_exchange_rates'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Fix the balancechangetype enum to use lowercase values
    # Step 1: Add a temporary column
    op.execute("""
        ALTER TABLE account_balance_history 
        ADD COLUMN change_type_new VARCHAR(10);
    """)
    
    # Step 2: Copy and convert values to lowercase
    op.execute("""
        UPDATE account_balance_history 
        SET change_type_new = LOWER(change_type::text);
    """)
    
    # Step 3: Drop the old column
    op.execute("""
        ALTER TABLE account_balance_history 
        DROP COLUMN change_type;
    """)
    
    # Step 4: Drop the old enum type
    op.execute("DROP TYPE balancechangetype;")
    
    # Step 5: Create new enum type with lowercase values
    op.execute("CREATE TYPE balancechangetype AS ENUM ('auto', 'manual');")
    
    # Step 6: Convert the temp column to the new enum type
    op.execute("""
        ALTER TABLE account_balance_history 
        ADD COLUMN change_type balancechangetype;
    """)
    
    # Step 7: Copy values from temp column to new enum column
    op.execute("""
        UPDATE account_balance_history 
        SET change_type = change_type_new::balancechangetype;
    """)
    
    # Step 8: Drop the temp column
    op.execute("""
        ALTER TABLE account_balance_history 
        DROP COLUMN change_type_new;
    """)
    
    # Step 9: Make the column NOT NULL
    op.execute("""
        ALTER TABLE account_balance_history 
        ALTER COLUMN change_type SET NOT NULL;
    """)


def downgrade() -> None:
    # Reverse the changes - convert back to uppercase
    op.execute("""
        ALTER TABLE account_balance_history 
        ADD COLUMN change_type_old VARCHAR(10);
    """)
    
    op.execute("""
        UPDATE account_balance_history 
        SET change_type_old = UPPER(change_type::text);
    """)
    
    op.execute("""
        ALTER TABLE account_balance_history 
        DROP COLUMN change_type;
    """)
    
    op.execute("DROP TYPE balancechangetype;")
    
    op.execute("CREATE TYPE balancechangetype AS ENUM ('AUTO', 'MANUAL');")
    
    op.execute("""
        ALTER TABLE account_balance_history 
        ADD COLUMN change_type balancechangetype;
    """)
    
    op.execute("""
        UPDATE account_balance_history 
        SET change_type = change_type_old::balancechangetype;
    """)
    
    op.execute("""
        ALTER TABLE account_balance_history 
        DROP COLUMN change_type_old;
    """)
    
    op.execute("""
        ALTER TABLE account_balance_history 
        ALTER COLUMN change_type SET NOT NULL;
    """)

