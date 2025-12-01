from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from decimal import Decimal
from app.core.database import get_db
from app.core.dependencies import get_current_active_user, require_role
from app.models.user import User, UserRole
from app.models.deal import Deal, DealStatus
from app.models.transaction import Transaction, TransactionStatus
from app.schemas.transaction import TransactionUpdate, TransactionResponse
from app.services.calculation import calculate_transaction_cost, calculate_deal_totals

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.put("/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int,
    transaction_update: TransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ACCOUNTANT]))
):
    """Обновление транзакции (выбор маршрута, параметры) - Бухгалтер"""
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    deal = db.query(Deal).filter(Deal.id == transaction.deal_id).first()
    if deal.status not in [DealStatus.CALCULATION_PENDING, DealStatus.DIRECTOR_REJECTED]:
        raise HTTPException(status_code=400, detail="Deal is not in calculation status")
    
    # Обновляем поля
    for field, value in transaction_update.model_dump(exclude_unset=True).items():
        setattr(transaction, field, value)
    
    # Пересчитываем стоимость транзакции
    if transaction.route_type:
        # Используем курс из транзакции или дефолтный
        market_rate = transaction.exchange_rate or Decimal("1.1655")
        calc_result = calculate_transaction_cost(transaction, market_rate)
        transaction.cost_usdt = Decimal(str(calc_result["cost_usdt"]))
    
    db.commit()
    db.refresh(transaction)
    return transaction


@router.post("/{transaction_id}/calculate", response_model=TransactionResponse)
def calculate_transaction(
    transaction_id: int,
    market_rate: Decimal,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ACCOUNTANT]))
):
    """Пересчет транзакции с указанным курсом"""
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if not transaction.route_type:
        raise HTTPException(status_code=400, detail="Route type not set")
    
    calc_result = calculate_transaction_cost(transaction, market_rate)
    transaction.cost_usdt = Decimal(str(calc_result["cost_usdt"]))
    
    db.commit()
    db.refresh(transaction)
    return transaction


@router.post("/deal/{deal_id}/calculate-all", response_model=dict)
def calculate_all_transactions(
    deal_id: int,
    market_rate: Decimal,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ACCOUNTANT]))
):
    """Рассчитать все транзакции сделки и итоговые суммы"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    transactions = db.query(Transaction).filter(Transaction.deal_id == deal_id).all()
    
    # Пересчитываем каждую транзакцию
    for trans in transactions:
        if trans.route_type:
            calc_result = calculate_transaction_cost(trans, market_rate)
            trans.cost_usdt = Decimal(str(calc_result["cost_usdt"]))
    
    # Рассчитываем итоги по сделке
    totals = calculate_deal_totals(deal, transactions, market_rate)
    
    # Обновляем сделку
    deal.total_usdt_calculated = Decimal(str(totals["total_usdt_calculated"]))
    deal.total_cost_usdt = Decimal(str(totals["total_cost_usdt"]))
    deal.gross_margin_usdt = Decimal(str(totals["gross_margin_usdt"]))
    deal.net_profit_usdt = Decimal(str(totals["net_profit_usdt"]))
    deal.partner_share_usdt = Decimal(str(totals["partner_share_usdt"]))
    deal.effective_rate = Decimal(str(totals["effective_rate"]))
    
    # Для сплита 50/50 обновляем partner_profit в транзакциях
    for trans in transactions:
        if trans.route_type and trans.route_type.value == "split_50_50" and trans.profit_split_enabled:
            trans_client_price = (Decimal(str(trans.amount_eur)) / (1 - Decimal(str(deal.client_rate_percent)) / 100)) * market_rate
            trans_cost = trans.cost_usdt or Decimal(0)
            delta = trans_client_price - trans_cost
            trans.partner_profit_usdt = delta / 2
            trans.profit_usdt = delta / 2
    
    db.commit()
    
    return {
        "deal_id": deal_id,
        "totals": totals,
        "transactions_calculated": len([t for t in transactions if t.route_type])
    }


@router.post("/{transaction_id}/mark-paid", response_model=TransactionResponse)
def mark_transaction_paid(
    transaction_id: int,
    payment_proof_file: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ACCOUNTANT]))
):
    """Отметить транзакцию как оплаченную (Бухгалтер)"""
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    transaction.status = TransactionStatus.PAID
    if payment_proof_file:
        transaction.payment_proof_file = payment_proof_file
    from datetime import datetime
    transaction.paid_at = datetime.utcnow()
    
    # Проверяем, все ли транзакции оплачены
    deal = db.query(Deal).filter(Deal.id == transaction.deal_id).first()
    all_transactions = db.query(Transaction).filter(Transaction.deal_id == deal.id).all()
    if all(t.status == TransactionStatus.PAID for t in all_transactions):
        deal.status = DealStatus.COMPLETED
    
    db.commit()
    db.refresh(transaction)
    return transaction

