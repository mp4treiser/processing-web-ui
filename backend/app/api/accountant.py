from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from decimal import Decimal
from datetime import datetime
from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.core.permissions import require_permission
from app.models.user import User, UserRole
from app.models.deal import Deal, DealStatus
from app.models.transaction import Transaction, TransactionStatus
from app.models.account_balance import AccountBalance
from app.models.account_balance_history import AccountBalanceHistory, BalanceChangeType
from app.schemas.deal import DealResponse, DealCreate, DealListResponse

router = APIRouter(prefix="/accountant", tags=["accountant"])


@router.post("/{deal_id}/submit-for-approval", response_model=DealResponse)
def submit_for_director_approval(
    deal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.update"))
):
    """Отправить расчет на согласование ФинДиректору (Бухгалтер)"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.status not in [DealStatus.CALCULATION_PENDING.value, DealStatus.DIRECTOR_REJECTED.value]:
        raise HTTPException(status_code=400, detail="Deal cannot be submitted for approval")
    
    # Проверяем, что все транзакции имеют маршруты
    from app.models.transaction import Transaction
    transactions = db.query(Transaction).filter(Transaction.deal_id == deal_id).all()
    if not transactions:
        raise HTTPException(status_code=400, detail="No transactions found")
    
    for trans in transactions:
        if not trans.route_type:
            raise HTTPException(
                status_code=400,
                detail=f"Transaction {trans.id} does not have a route selected"
            )
    
    # Проверяем, что расчеты выполнены
    if not deal.total_usdt_calculated:
        raise HTTPException(status_code=400, detail="Deal calculations not completed")
    
    deal.status = DealStatus.DIRECTOR_APPROVAL_PENDING.value
    db.commit()
    db.refresh(deal)
    return deal


@router.post("/deals", response_model=DealResponse, status_code=status.HTTP_201_CREATED)
def create_deal_as_accountant(
    deal_data: DealCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.create"))
):
    """Создать сделку бухгалтером с новым конструктором маршрутов"""
    # Создаем сделку - сразу в статусе EXECUTION (без апрувов)
    db_deal = Deal(
        client_id=deal_data.client_id,
        manager_id=current_user.id,  # Бухгалтер становится менеджером сделки
        total_eur_request=deal_data.total_eur_request if deal_data.total_eur_request else (deal_data.deal_amount or Decimal("0")),
        client_rate_percent=deal_data.client_rate_percent,
        deal_amount=deal_data.deal_amount,
        client_sends_currency=deal_data.client_sends_currency,
        client_receives_currency=deal_data.client_receives_currency,
        status=DealStatus.EXECUTION.value  # Сразу в исполнение
    )
    db.add(db_deal)
    db.flush()
    
    # Создаем транзакции с новыми полями
    for trans_data in deal_data.transactions:
        # Проверяем, это новая структура транзакции или старая
        if "route_type" in trans_data:
            # Новая структура с конструктором маршрутов
            db_trans = Transaction(
                deal_id=db_deal.id,
                from_currency=trans_data.get("from_currency"),
                to_currency=trans_data.get("to_currency"),
                exchange_rate=Decimal(str(trans_data.get("exchange_rate", 0))),
                client_company_id=trans_data.get("client_company_id"),
                amount_for_client=Decimal(str(trans_data.get("amount_for_client", 0))),
                route_type=trans_data.get("route_type"),
                # Direct
                internal_company_id=trans_data.get("internal_company_id"),
                internal_company_account_id=trans_data.get("internal_company_account_id"),
                amount_from_account=Decimal(str(trans_data.get("amount_from_account", 0))) if trans_data.get("amount_from_account") else None,
                bank_commission_id=trans_data.get("bank_commission_id"),
                # Exchange
                crypto_account_id=trans_data.get("crypto_account_id"),
                exchange_from_currency=trans_data.get("exchange_from_currency"),
                exchange_to_currency=trans_data.get("exchange_to_currency"),
                crypto_exchange_rate=Decimal(str(trans_data.get("crypto_exchange_rate", 0))) if trans_data.get("crypto_exchange_rate") else None,
                agent_commission_id=trans_data.get("agent_commission_id"),
                exchange_commission_id=trans_data.get("exchange_commission_id"),
                exchange_bank_commission_id=trans_data.get("exchange_bank_commission_id"),
                # Partner
                partner_company_id=trans_data.get("partner_company_id"),
                amount_to_partner_usdt=Decimal(str(trans_data.get("amount_to_partner_usdt", 0))) if trans_data.get("amount_to_partner_usdt") else None,
                amount_partner_sends=Decimal(str(trans_data.get("amount_partner_sends", 0))) if trans_data.get("amount_partner_sends") else None,
                partner_commission_id=trans_data.get("partner_commission_id"),
                # Partner 50-50
                partner_50_50_company_id=trans_data.get("partner_50_50_company_id"),
                amount_to_partner_50_50_usdt=Decimal(str(trans_data.get("amount_to_partner_50_50_usdt", 0))) if trans_data.get("amount_to_partner_50_50_usdt") else None,
                amount_partner_50_50_sends=Decimal(str(trans_data.get("amount_partner_50_50_sends", 0))) if trans_data.get("amount_partner_50_50_sends") else None,
                partner_50_50_commission_id=trans_data.get("partner_50_50_commission_id"),
                final_income=Decimal(str(trans_data.get("final_income", 0))) if trans_data.get("final_income") else None,
                status=TransactionStatus.PENDING
            )
        else:
            # Старая структура для обратной совместимости
            db_trans = Transaction(
                deal_id=db_deal.id,
                target_company=trans_data.get("target_company", ""),
                amount_eur=Decimal(str(trans_data.get("amount_eur", 0))),
                recipient_details=trans_data.get("recipient_details"),
                status=TransactionStatus.PENDING
            )
        db.add(db_trans)
    
    db.commit()
    db.refresh(db_deal)
    return db_deal


@router.get("/client-debts", response_model=List[DealListResponse])
def get_client_debts(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.debts.read"))
):
    """Получить список сделок с задолженностями"""
    deals = db.query(Deal).filter(
        Deal.is_client_debt == "true",
        Deal.client_debt_amount > 0
    ).order_by(Deal.created_at.desc()).all()
    
    result = []
    for deal in deals:
        transactions = db.query(Transaction).filter(Transaction.deal_id == deal.id).all()
        paid_count = sum(1 for t in transactions if (t.status.value if hasattr(t.status, 'value') else str(t.status)) == "paid")
        
        result.append(DealListResponse(
            id=deal.id,
            client_id=deal.client_id,
            client_name=deal.client.name if deal.client else None,
            total_eur_request=deal.total_eur_request,
            total_usdt_calculated=deal.total_usdt_calculated,
            status=deal.status,
            created_at=deal.created_at,
            transactions_count=len(transactions),
            paid_transactions_count=paid_count,
            client_debt_amount=deal.client_debt_amount,
            client_paid_amount=deal.client_paid_amount
        ))
    
    return result

