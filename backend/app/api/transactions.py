from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from decimal import Decimal
from datetime import datetime
from typing import Optional
from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.core.permissions import require_permission
from app.models.user import User, UserRole
from app.models.deal import Deal, DealStatus
from app.models.transaction import Transaction, TransactionStatus
from app.models.account_balance import AccountBalance
from app.models.account_balance_history import AccountBalanceHistory, BalanceChangeType
from app.schemas.transaction import TransactionUpdate, TransactionResponse
from app.services.calculation import calculate_transaction_cost, calculate_deal_totals

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.put("/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int,
    transaction_update: TransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.transactions.update"))
):
    """Обновление транзакции (выбор маршрута, параметры) - Бухгалтер"""
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    deal = db.query(Deal).filter(Deal.id == transaction.deal_id).first()
    if deal.status not in [DealStatus.CALCULATION_PENDING.value, DealStatus.DIRECTOR_REJECTED.value]:
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
    current_user: User = Depends(require_permission("exchanges.transactions.calculate"))
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
    current_user: User = Depends(require_permission("exchanges.transactions.calculate"))
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
    current_user: User = Depends(require_permission("exchanges.transactions.execute"))
):
    """Отметить транзакцию как оплаченную (Бухгалтер) и списать баланс с записью истории"""
    from datetime import datetime
    from decimal import Decimal
    from app.models.internal_company_account import InternalCompanyAccount
    from app.models.account_balance import AccountBalance
    from app.models.internal_company_account_history import InternalCompanyAccountHistory, CompanyBalanceChangeType
    from app.models.account_balance_history import AccountBalanceHistory, BalanceChangeType
    
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Предотвращаем повторную оплату
    if transaction.status == TransactionStatus.PAID:
        raise HTTPException(status_code=400, detail="Transaction already paid")
    
    # Получаем сделку для записи в историю
    deal = db.query(Deal).filter(Deal.id == transaction.deal_id).first()
    
    # Списываем баланс в зависимости от типа маршрута
    if transaction.route_type == "direct" and transaction.internal_company_account_id:
        # Прямой перевод - списываем с фиатного счёта компании
        account = db.query(InternalCompanyAccount).filter(
            InternalCompanyAccount.id == transaction.internal_company_account_id
        ).first()
        if account and transaction.amount_from_account:
            previous_balance = account.balance
            amount_to_deduct = Decimal(str(transaction.amount_from_account))
            account.balance = previous_balance - amount_to_deduct
            
            # Записываем историю
            history = InternalCompanyAccountHistory(
                account_id=account.id,
                previous_balance=previous_balance,
                new_balance=account.balance,
                change_amount=-amount_to_deduct,
                change_type=CompanyBalanceChangeType.AUTO,
                transaction_id=transaction.id,
                deal_id=deal.id if deal else None,
                changed_by=current_user.id,
                comment=f"Оплата маршрута (Direct) по сделке #{deal.id if deal else 'N/A'}"
            )
            db.add(history)
    
    elif transaction.route_type == "exchange" and transaction.crypto_account_id:
        # Биржа - списываем с крипто-счёта
        crypto_account = db.query(AccountBalance).filter(
            AccountBalance.id == transaction.crypto_account_id
        ).first()
        if crypto_account:
            # Используем exchange_amount если есть, иначе рассчитываем
            amount_to_deduct = transaction.exchange_amount
            if not amount_to_deduct and transaction.amount_from_account and transaction.crypto_exchange_rate:
                amount_to_deduct = Decimal(str(transaction.amount_from_account)) * Decimal(str(transaction.crypto_exchange_rate))
            if amount_to_deduct:
                previous_balance = crypto_account.balance
                crypto_account.balance = previous_balance - Decimal(str(amount_to_deduct))
                
                # Записываем историю
                history = AccountBalanceHistory(
                    account_balance_id=crypto_account.id,
                    previous_balance=previous_balance,
                    new_balance=crypto_account.balance,
                    change_amount=-Decimal(str(amount_to_deduct)),
                    change_type=BalanceChangeType.AUTO,
                    transaction_id=transaction.id,
                    deal_id=deal.id if deal else None,
                    changed_by=current_user.id,
                    comment=f"Оплата маршрута (Exchange) по сделке #{deal.id if deal else 'N/A'}"
                )
                db.add(history)
    
    elif transaction.route_type == "partner" and transaction.amount_to_partner_usdt:
        # Партнёр - списываем USDT с крипто-счёта (ищем USDT счёт)
        usdt_account = db.query(AccountBalance).filter(
            AccountBalance.currency == "USDT"
        ).first()
        if usdt_account:
            previous_balance = usdt_account.balance
            amount_to_deduct = Decimal(str(transaction.amount_to_partner_usdt))
            usdt_account.balance = previous_balance - amount_to_deduct
            
            # Записываем историю
            history = AccountBalanceHistory(
                account_balance_id=usdt_account.id,
                previous_balance=previous_balance,
                new_balance=usdt_account.balance,
                change_amount=-amount_to_deduct,
                change_type=BalanceChangeType.AUTO,
                transaction_id=transaction.id,
                deal_id=deal.id if deal else None,
                changed_by=current_user.id,
                comment=f"Оплата партнёру (Partner) по сделке #{deal.id if deal else 'N/A'}"
            )
            db.add(history)
    
    elif transaction.route_type == "partner_50_50" and transaction.amount_to_partner_50_50_usdt:
        # Партнёр 50-50 - списываем USDT с крипто-счёта
        usdt_account = db.query(AccountBalance).filter(
            AccountBalance.currency == "USDT"
        ).first()
        if usdt_account:
            previous_balance = usdt_account.balance
            amount_to_deduct = Decimal(str(transaction.amount_to_partner_50_50_usdt))
            usdt_account.balance = previous_balance - amount_to_deduct
            
            # Записываем историю
            history = AccountBalanceHistory(
                account_balance_id=usdt_account.id,
                previous_balance=previous_balance,
                new_balance=usdt_account.balance,
                change_amount=-amount_to_deduct,
                change_type=BalanceChangeType.AUTO,
                transaction_id=transaction.id,
                deal_id=deal.id if deal else None,
                changed_by=current_user.id,
                comment=f"Оплата партнёру 50-50 по сделке #{deal.id if deal else 'N/A'}"
            )
            db.add(history)
    
    # Обновляем статус транзакции
    transaction.status = TransactionStatus.PAID
    if payment_proof_file:
        transaction.payment_proof_file = payment_proof_file
    transaction.paid_at = datetime.utcnow()
    
    # Проверяем, все ли транзакции оплачены
    all_transactions = db.query(Transaction).filter(Transaction.deal_id == deal.id).all()
    if all(t.status == TransactionStatus.PAID for t in all_transactions):
        deal.status = DealStatus.COMPLETED.value
    
    db.commit()
    db.refresh(transaction)
    return transaction


@router.post("/{transaction_id}/execute", response_model=TransactionResponse)
def execute_transaction(
    transaction_id: int,
    account_balance_id: int = Query(..., description="ID остатка по счету для списания"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.transactions.execute"))
):
    """Выполнить транзакцию с автоматическим списанием остатка по счету"""
    
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Проверяем, что транзакция еще не выполнена
    if transaction.status == TransactionStatus.PAID:
        raise HTTPException(status_code=400, detail="Transaction already executed")
    
    # Получаем остаток по счету
    account_balance = db.query(AccountBalance).filter(AccountBalance.id == account_balance_id).first()
    if not account_balance:
        raise HTTPException(status_code=404, detail="Account balance not found")
    
    # Получаем сделку для проверки статуса
    deal = db.query(Deal).filter(Deal.id == transaction.deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    # Проверяем, что сделка в статусе для выполнения транзакций
    # Транзакции можно выполнять только после того, как менеджер подтвердил оплату от клиента
    # Разрешаем выполнение транзакций даже при наличии задолженности клиента
    # (сделка должна быть в статусе EXECUTION или CLIENT_PARTIALLY_PAID - т.е. менеджер подтвердил оплату)
    allowed_statuses = [
        DealStatus.EXECUTION.value,
        DealStatus.CLIENT_PARTIALLY_PAID.value
    ]
    if deal.status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Deal must be in EXECUTION or CLIENT_PARTIALLY_PAID status (manager must confirm client payment first). Current status: {deal.status}"
        )
    
    # Вычисляем сумму для списания (cost_usdt или amount_eur, если cost_usdt не установлен)
    # Для простоты используем amount_eur, конвертированный в валюту остатка
    # В реальности нужно учитывать валюту транзакции и остатка
    amount_to_debit = transaction.cost_usdt if transaction.cost_usdt else Decimal(str(transaction.amount_eur))
    
    # Проверяем достаточность средств
    if account_balance.balance < amount_to_debit:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient balance. Available: {account_balance.balance}, Required: {amount_to_debit}"
        )
    
    # Сохраняем предыдущий остаток для истории
    previous_balance = account_balance.balance
    
    # Списываем средства
    account_balance.balance -= amount_to_debit
    new_balance = account_balance.balance
    
    # Создаем запись в истории изменений остатка
    balance_history = AccountBalanceHistory(
        account_balance_id=account_balance_id,
        previous_balance=previous_balance,
        new_balance=new_balance,
        change_amount=-amount_to_debit,  # Отрицательное значение для списания
        change_type=BalanceChangeType.AUTO,  # Автоматическое списание при проведении транзакции
        transaction_id=transaction_id,
        deal_id=deal.id,
        changed_by=current_user.id,
        comment=f"Transaction execution for deal #{deal.id}"
    )
    db.add(balance_history)
    
    # Отмечаем транзакцию как выполненную
    transaction.status = TransactionStatus.PAID
    transaction.paid_at = datetime.utcnow()
    
    # Проверяем, все ли транзакции в сделке выполнены
    all_transactions = db.query(Transaction).filter(Transaction.deal_id == deal.id).all()
    if all(t.status == TransactionStatus.PAID for t in all_transactions):
        deal.status = DealStatus.COMPLETED.value
    
    db.commit()
    db.refresh(transaction)
    return transaction

