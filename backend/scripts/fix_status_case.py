"""Скрипт для исправления регистра статусов в таблице deals"""
from app.core.database import engine
from sqlalchemy import text

# Маппинг старых значений (верхний регистр) в новые (нижний регистр)
status_mapping = {
    'NEW': 'new',
    'CALCULATION_PENDING': 'calculation_pending',
    'DIRECTOR_APPROVAL_PENDING': 'director_approval_pending',
    'DIRECTOR_REJECTED': 'director_rejected',
    'CLIENT_APPROVAL': 'client_approval',
    'AWAITING_PAYMENT': 'awaiting_payment',
    'EXECUTION': 'execution',
    'COMPLETED': 'completed',
    'SENIOR_MANAGER_REVIEW': 'senior_manager_review',
    'SENIOR_MANAGER_APPROVED': 'senior_manager_approved',
    'SENIOR_MANAGER_REJECTED': 'senior_manager_rejected',
    'CLIENT_AGREED_TO_PAY': 'client_agreed_to_pay',
    'AWAITING_CLIENT_PAYMENT': 'awaiting_client_payment',
    'CLIENT_PARTIALLY_PAID': 'client_partially_paid',
}

def fix_statuses():
    conn = engine.connect()
    try:
        for old_status, new_status in status_mapping.items():
            result = conn.execute(
                text(f"UPDATE deals SET status = :new_status WHERE status = :old_status"),
                {"old_status": old_status, "new_status": new_status}
            )
            if result.rowcount > 0:
                print(f"Updated {result.rowcount} deals from '{old_status}' to '{new_status}'")
        conn.commit()
        print("✅ Status case fix completed!")
    except Exception as e:
        conn.rollback()
        print(f"❌ Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    fix_statuses()

