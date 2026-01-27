from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from decimal import Decimal
from datetime import datetime
from pydantic import BaseModel
from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.core.permissions import require_permission
from app.models.user import User, UserRole
from app.models.deal import Deal, DealStatus
from app.models.transaction import Transaction, TransactionStatus
from app.models.account_balance import AccountBalance
from app.models.account_balance_history import AccountBalanceHistory, BalanceChangeType
from app.schemas.deal import DealResponse, DealCreate, DealListResponse
from app.services.deal_calculator import DealCalculator

router = APIRouter(prefix="/accountant", tags=["accountant"])


class CalculationPreviewRequest(BaseModel):
    transactions: list


@router.post("/calculate-preview")
def calculate_preview(
    data: CalculationPreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Предварительный расчёт сделки (preview)"""
    calculator = DealCalculator(db)
    result = calculator.preview_calculation({"transactions": data.transactions})
    
    # Конвертируем Decimal в float для JSON
    def convert_decimals(obj):
        if isinstance(obj, Decimal):
            return float(obj)
        elif isinstance(obj, dict):
            return {k: convert_decimals(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [convert_decimals(i) for i in obj]
        return obj
    
    return convert_decimals(result)


@router.post("/deals", response_model=DealResponse, status_code=status.HTTP_201_CREATED)
def create_deal_as_accountant(
    deal_data: DealCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.create"))
):
    """Создать сделку бухгалтером с автоматическим расчётом"""
    # Инициализируем калькулятор
    calculator = DealCalculator(db)
    
    # Создаем сделку - сразу в статусе EXECUTION (без апрувов)
    db_deal = Deal(
        client_id=deal_data.client_id,
        manager_id=current_user.id,
        total_eur_request=deal_data.total_eur_request if deal_data.total_eur_request else (deal_data.deal_amount or Decimal("0")),
        client_rate_percent=deal_data.client_rate_percent,
        deal_amount=deal_data.deal_amount,
        client_sends_currency=deal_data.client_sends_currency,
        client_receives_currency=deal_data.client_receives_currency,
        status=DealStatus.EXECUTION.value
    )
    db.add(db_deal)
    db.flush()
    
    total_client_should_send = Decimal("0")
    
    # Создаем транзакции
    for trans_data in deal_data.transactions:
        # Рассчитываем показатели транзакции
        routes = trans_data.get("routes", [])
        trans_totals = calculator.calculate_transaction_totals(routes)
        
        # Для каждого маршрута в транзакции создаём отдельную запись Transaction
        for route in routes:
            route_calc = calculator.calculate_route_income(route)
            
            db_trans = Transaction(
                deal_id=db_deal.id,
                from_currency=route.get("from_currency"),
                to_currency=route.get("to_currency"),
                exchange_rate=Decimal(str(route.get("exchange_rate", 0))) if route.get("exchange_rate") else None,
                client_company_id=trans_data.get("client_company_id"),
                amount_for_client=Decimal(str(route.get("amount_from_account", 0))) if route.get("amount_from_account") else None,
                route_type=route.get("route_type"),
                # Direct
                internal_company_id=route.get("internal_company_id"),
                internal_company_account_id=route.get("internal_company_account_id"),
                amount_from_account=Decimal(str(route.get("amount_from_account", 0))) if route.get("amount_from_account") else None,
                bank_commission_id=route.get("bank_commission_id"),
                # Exchange
                crypto_account_id=route.get("crypto_account_id"),
                exchange_from_currency=route.get("exchange_from_currency"),
                exchange_to_currency=route.get("exchange_to_currency"),
                exchange_amount=Decimal(str(route.get("exchange_amount", 0))) if route.get("exchange_amount") else None,
                crypto_exchange_rate=Decimal(str(route.get("crypto_exchange_rate", 0))) if route.get("crypto_exchange_rate") else None,
                agent_commission_id=route.get("agent_commission_id"),
                exchange_commission_id=route.get("exchange_commission_id"),
                exchange_bank_commission_id=route.get("exchange_bank_commission_id"),
                # Partner
                partner_company_id=route.get("partner_company_id"),
                amount_to_partner_usdt=route_calc.get("amount_to_partner_usdt"),
                amount_partner_sends=route_calc.get("amount_partner_sends"),
                partner_commission_id=route.get("partner_commission_id"),
                # Partner 50-50
                partner_50_50_company_id=route.get("partner_50_50_company_id"),
                amount_to_partner_50_50_usdt=route_calc.get("amount_to_partner_50_50_usdt"),
                amount_partner_50_50_sends=route_calc.get("amount_partner_50_50_sends"),
                partner_50_50_commission_id=route.get("partner_50_50_commission_id"),
                # Расчётные поля
                calculated_route_income=route_calc.get("calculated_route_income"),
                final_income=route_calc.get("calculated_route_income"),
                status=TransactionStatus.PENDING
            )
            db.add(db_trans)
        
        total_client_should_send += trans_totals["final_income"]
    
    # Обновляем итоговую сумму сделки
    db_deal.total_usdt_calculated = total_client_should_send
    
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
        Deal.is_client_debt == True,
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

