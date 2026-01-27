from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.core.permissions import require_permission
from app.models.user import User, UserRole
from app.models.deal import Deal, DealStatus
from app.models.transaction import Transaction, TransactionStatus
from app.schemas.deal import DealCreate, DealResponse, DealUpdate, DealListResponse
from app.schemas.transaction import TransactionCreate

router = APIRouter(prefix="/deals", tags=["deals"])


@router.post("", response_model=DealResponse, status_code=status.HTTP_201_CREATED)
def create_deal(
    deal_data: DealCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.create"))
):
    """Создание новой заявки (Менеджер)"""
    # Проверяем сумму транзакций
    total_transactions = sum(float(t.get("amount_eur", 0)) for t in deal_data.transactions)
    if abs(total_transactions - float(deal_data.total_eur_request)) > 0.01:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Sum of transactions ({total_transactions}) does not match total ({deal_data.total_eur_request})"
        )
    
    # Создаем сделку
    db_deal = Deal(
        client_id=deal_data.client_id,
        manager_id=current_user.id,
        total_eur_request=deal_data.total_eur_request,
        client_rate_percent=deal_data.client_rate_percent,
        status=DealStatus.NEW.value
    )
    db.add(db_deal)
    db.flush()
    
    # Создаем транзакции
    for trans_data in deal_data.transactions:
        db_trans = Transaction(
            deal_id=db_deal.id,
            target_company=trans_data["target_company"],
            amount_eur=trans_data["amount_eur"],
            recipient_details=trans_data.get("recipient_details"),
            status=TransactionStatus.PENDING
        )
        db.add(db_trans)
    
    db.commit()
    db.refresh(db_deal)
    return db_deal


@router.get("", response_model=List[DealListResponse])
def get_deals(
    status_filter: str | None = Query(None, description="Filter by deal status"),
    client_id: int | None = Query(None, description="Filter by client ID"),
    company_name: str | None = Query(None, description="Filter by company name (searches in transaction target_company)"),
    account_number: str | None = Query(None, description="Filter by account number/IBAN (searches in transaction recipient_details)"),
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получить список заявок (с фильтрацией по роли).

    Важно для бухгалтера:
    - без status_filter он видит все сделки со всеми статусами,
      и уже на фронтенде может фильтровать/сортировать по статусу, дате и сумме.
    """
    query = db.query(Deal)
    
    # Row Level Security: Менеджер видит только свои сделки
    if current_user.role == UserRole.MANAGER:
        query = query.filter(Deal.manager_id == current_user.id)
    
    # Применяем фильтр по статусу (если передан)
    if status_filter:
        # Проверяем, что статус валидный
        try:
            # Пытаемся найти статус в enum
            status_enum = DealStatus(status_filter)
            status_value = status_enum.value
        except ValueError:
            # Если не найден в enum, используем строку как есть (для обратной совместимости)
            status_value = status_filter
        
        query = query.filter(Deal.status == status_value)
    
    # Фильтр по клиенту
    if client_id:
        query = query.filter(Deal.client_id == client_id)
    
    # Фильтр по компании (через транзакции)
    if company_name:
        # Находим сделки, у которых есть транзакции с указанной компанией
        deals_with_company_ids = db.query(Transaction.deal_id).filter(
            Transaction.target_company.ilike(f"%{company_name}%")
        ).distinct().all()
        deal_ids = [row[0] for row in deals_with_company_ids]
        if deal_ids:
            query = query.filter(Deal.id.in_(deal_ids))
        else:
            # Если нет сделок с такой компанией, возвращаем пустой результат
            query = query.filter(Deal.id == -1)  # Невозможный ID
    
    # Фильтр по счету/IBAN (через транзакции)
    if account_number:
        # Находим сделки, у которых есть транзакции с указанным IBAN/счетом
        deals_with_account_ids = db.query(Transaction.deal_id).filter(
            Transaction.recipient_details.ilike(f"%{account_number}%")
        ).distinct().all()
        deal_ids = [row[0] for row in deals_with_account_ids]
        if deal_ids:
            query = query.filter(Deal.id.in_(deal_ids))
        else:
            # Если нет сделок с таким счетом, возвращаем пустой результат
            query = query.filter(Deal.id == -1)  # Невозможный ID

    # Пагинация и сортировка: последние сделки первыми
    query = query.order_by(Deal.created_at.desc()).limit(limit).offset(offset)
    deals = query.all()
    
    # Формируем ответ с прогрессом
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
            progress={"paid": paid_count, "total": len(transactions)} if transactions else None,
            transactions_count=len(transactions),
            paid_transactions_count=paid_count,
            client_debt_amount=deal.client_debt_amount,
            client_paid_amount=deal.client_paid_amount
        ))
    
    return result


@router.get("/{deal_id}", response_model=DealResponse)
def get_deal(
    deal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получить детали заявки"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    # Проверка прав доступа
    if current_user.role == UserRole.MANAGER and deal.manager_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    return deal


@router.get("/{deal_id}/copy-data")
def get_deal_copy_data(
    deal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получить данные сделки для копирования"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    # Группируем транзакции по client_company_id
    transactions_grouped = {}
    for trans in deal.transactions:
        key = trans.client_company_id or 0
        if key not in transactions_grouped:
            transactions_grouped[key] = {
                "client_company_id": trans.client_company_id,
                "routes": []
            }
        
        route_data = {
            "route_type": trans.route_type,
            "exchange_rate": float(trans.exchange_rate) if trans.exchange_rate else None,
            "amount_from_account": float(trans.amount_from_account) if trans.amount_from_account else None,
            # Direct
            "internal_company_id": trans.internal_company_id,
            "internal_company_account_id": trans.internal_company_account_id,
            "bank_commission_id": trans.bank_commission_id,
            # Exchange
            "crypto_account_id": trans.crypto_account_id,
            "exchange_from_currency": trans.exchange_from_currency,
            "crypto_exchange_rate": float(trans.crypto_exchange_rate) if trans.crypto_exchange_rate else None,
            "agent_commission_id": trans.agent_commission_id,
            "exchange_commission_id": trans.exchange_commission_id,
            "exchange_bank_commission_id": trans.exchange_bank_commission_id,
            # Partner
            "partner_company_id": trans.partner_company_id,
            "partner_commission_id": trans.partner_commission_id,
            # Partner 50-50
            "partner_50_50_company_id": trans.partner_50_50_company_id,
            "partner_50_50_commission_id": trans.partner_50_50_commission_id,
        }
        transactions_grouped[key]["routes"].append(route_data)
    
    return {
        "client_id": deal.client_id,
        "client_sends_currency": deal.client_sends_currency,
        "client_receives_currency": deal.client_receives_currency,
        "transactions": list(transactions_grouped.values())
    }


@router.put("/{deal_id}", response_model=DealResponse)
def update_deal(
    deal_id: int,
    deal_update: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.update"))
):
    """Полное обновление сделки с транзакциями (Бухгалтер)"""
    from decimal import Decimal
    from app.services.deal_calculator import DealCalculator
    
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    # Проверяем, что сделка в статусе execution
    if deal.status != DealStatus.EXECUTION.value:
        raise HTTPException(status_code=400, detail="Deal can only be edited in execution status")
    
    # Обновляем основные поля сделки
    if "client_id" in deal_update:
        deal.client_id = deal_update["client_id"]
    if "deal_amount" in deal_update:
        deal.deal_amount = Decimal(str(deal_update["deal_amount"]))
        deal.total_eur_request = deal.deal_amount
    if "client_sends_currency" in deal_update:
        deal.client_sends_currency = deal_update["client_sends_currency"]
    if "client_receives_currency" in deal_update:
        deal.client_receives_currency = deal_update["client_receives_currency"]
    
    # Удаляем указанные транзакции
    deleted_ids = deal_update.get("deleted_transaction_ids", [])
    if deleted_ids:
        for trans_id in deleted_ids:
            trans = db.query(Transaction).filter(
                Transaction.id == trans_id,
                Transaction.deal_id == deal_id
            ).first()
            if trans and trans.status != TransactionStatus.PAID:
                db.delete(trans)
    
    # Обрабатываем транзакции
    transactions_data = deal_update.get("transactions", [])
    calculator = DealCalculator(db)
    total_client_should_send = Decimal("0")
    
    for trans_data in transactions_data:
        routes = trans_data.get("routes", [])
        trans_totals = calculator.calculate_transaction_totals(routes)
        
        for route in routes:
            route_calc = calculator.calculate_route_income(route)
            db_id = route.get("db_id")
            
            if db_id:
                # Обновляем существующую транзакцию
                db_trans = db.query(Transaction).filter(
                    Transaction.id == db_id,
                    Transaction.deal_id == deal_id
                ).first()
                
                if db_trans and db_trans.status != TransactionStatus.PAID:
                    # Обновляем поля
                    db_trans.route_type = route.get("route_type")
                    db_trans.exchange_rate = Decimal(str(route.get("exchange_rate", 0))) if route.get("exchange_rate") else None
                    db_trans.client_company_id = trans_data.get("client_company_id")
                    db_trans.amount_for_client = Decimal(str(route.get("amount_from_account", 0))) if route.get("amount_from_account") else None
                    # Direct
                    db_trans.internal_company_id = route.get("internal_company_id")
                    db_trans.internal_company_account_id = route.get("internal_company_account_id")
                    db_trans.amount_from_account = Decimal(str(route.get("amount_from_account", 0))) if route.get("amount_from_account") else None
                    db_trans.bank_commission_id = route.get("bank_commission_id")
                    # Exchange
                    db_trans.crypto_account_id = route.get("crypto_account_id")
                    db_trans.exchange_from_currency = route.get("exchange_from_currency")
                    db_trans.exchange_amount = Decimal(str(route.get("exchange_amount", 0))) if route.get("exchange_amount") else None
                    db_trans.crypto_exchange_rate = Decimal(str(route.get("crypto_exchange_rate", 0))) if route.get("crypto_exchange_rate") else None
                    db_trans.agent_commission_id = route.get("agent_commission_id")
                    db_trans.exchange_commission_id = route.get("exchange_commission_id")
                    db_trans.exchange_bank_commission_id = route.get("exchange_bank_commission_id")
                    # Partner
                    db_trans.partner_company_id = route.get("partner_company_id")
                    db_trans.amount_to_partner_usdt = route_calc.get("amount_to_partner_usdt")
                    db_trans.amount_partner_sends = route_calc.get("amount_partner_sends")
                    db_trans.partner_commission_id = route.get("partner_commission_id")
                    # Partner 50-50
                    db_trans.partner_50_50_company_id = route.get("partner_50_50_company_id")
                    db_trans.amount_to_partner_50_50_usdt = route_calc.get("amount_to_partner_50_50_usdt")
                    db_trans.amount_partner_50_50_sends = route_calc.get("amount_partner_50_50_sends")
                    db_trans.partner_50_50_commission_id = route.get("partner_50_50_commission_id")
                    # Calculated
                    db_trans.calculated_route_income = route_calc.get("calculated_route_income")
                    db_trans.final_income = route_calc.get("calculated_route_income")
            else:
                # Создаём новую транзакцию
                db_trans = Transaction(
                    deal_id=deal_id,
                    route_type=route.get("route_type"),
                    exchange_rate=Decimal(str(route.get("exchange_rate", 0))) if route.get("exchange_rate") else None,
                    client_company_id=trans_data.get("client_company_id"),
                    amount_for_client=Decimal(str(route.get("amount_from_account", 0))) if route.get("amount_from_account") else None,
                    # Direct
                    internal_company_id=route.get("internal_company_id"),
                    internal_company_account_id=route.get("internal_company_account_id"),
                    amount_from_account=Decimal(str(route.get("amount_from_account", 0))) if route.get("amount_from_account") else None,
                    bank_commission_id=route.get("bank_commission_id"),
                    # Exchange
                    crypto_account_id=route.get("crypto_account_id"),
                    exchange_from_currency=route.get("exchange_from_currency"),
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
                    # Calculated
                    calculated_route_income=route_calc.get("calculated_route_income"),
                    final_income=route_calc.get("calculated_route_income"),
                    status=TransactionStatus.PENDING
                )
                db.add(db_trans)
        
        total_client_should_send += trans_totals["final_income"]
    
    # Обновляем итоговую сумму
    deal.total_usdt_calculated = total_client_should_send
    
    db.commit()
    db.refresh(deal)
    return deal


@router.post("/{deal_id}/submit-for-calculation", response_model=DealResponse)
def submit_for_calculation(
    deal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.create"))
):
    """Отправить заявку на расчет (Менеджер)"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.manager_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    if deal.status != DealStatus.NEW.value:
        raise HTTPException(status_code=400, detail="Deal cannot be submitted")
    
    deal.status = DealStatus.CALCULATION_PENDING.value
    db.commit()
    db.refresh(deal)
    return deal


@router.post("/{deal_id}/client-agreed-to-pay", response_model=DealResponse)
def client_agreed_to_pay(
    deal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.confirm_payment"))
):
    """Клиент согласился перевести деньги (Менеджер)"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.manager_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    if deal.status != DealStatus.SENIOR_MANAGER_APPROVED.value:
        raise HTTPException(
            status_code=400,
            detail=f"Deal must be approved by senior manager first (current: {deal.status})"
        )
    
    from datetime import datetime
    deal.status = DealStatus.CLIENT_AGREED_TO_PAY.value
    db.commit()
    db.refresh(deal)
    return deal


@router.post("/{deal_id}/confirm-client-payment", response_model=DealResponse)
def confirm_client_payment(
    deal_id: int,
    payment_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.confirm_payment"))
):
    """Подтвердить перевод от клиента (Менеджер)"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.manager_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    if deal.status not in [DealStatus.CLIENT_AGREED_TO_PAY.value, DealStatus.AWAITING_CLIENT_PAYMENT.value]:
        raise HTTPException(
            status_code=400,
            detail=f"Deal is not in correct status for payment confirmation (current: {deal.status})"
        )
    
    from datetime import datetime
    from decimal import Decimal
    
    client_paid_amount = Decimal(str(payment_data.get("client_paid_amount", 0)))
    is_partial = payment_data.get("is_partial", False)
    
    deal.client_paid_amount = client_paid_amount
    deal.client_payment_confirmed_at = datetime.utcnow()
    
    if is_partial and client_paid_amount < deal.total_eur_request:
        # Частичная оплата - есть задолженность
        deal.client_debt_amount = deal.total_eur_request - client_paid_amount
        deal.is_client_debt = True
        deal.status = DealStatus.CLIENT_PARTIALLY_PAID.value
    else:
        # Полная оплата
        deal.client_debt_amount = Decimal("0")
        deal.is_client_debt = False
        deal.status = DealStatus.EXECUTION.value
    
    db.commit()
    db.refresh(deal)
    return deal


@router.post("/{deal_id}/pay-debt", response_model=DealResponse)
def pay_debt(
    deal_id: int,
    payment_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.pay_debt"))
):
    """Погасить задолженность по сделке"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    # Менеджер может погашать задолженность только по своим сделкам
    if current_user.role == UserRole.MANAGER and deal.manager_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    if not deal.is_client_debt or deal.client_debt_amount <= 0:
        raise HTTPException(
            status_code=400,
            detail="Deal has no debt to pay"
        )
    
    from decimal import Decimal
    payment_amount = Decimal(str(payment_data.get("payment_amount", 0)))
    
    if payment_amount <= 0:
        raise HTTPException(
            status_code=400,
            detail="Payment amount must be greater than 0"
        )
    
    # Обновляем суммы
    deal.client_paid_amount += payment_amount
    deal.client_debt_amount -= payment_amount
    
    # Если задолженность полностью погашена
    if deal.client_debt_amount <= 0:
        deal.client_debt_amount = Decimal("0")
        deal.is_client_debt = False
        # Если сделка была в статусе частичной оплаты и теперь полностью оплачена
        if deal.status == DealStatus.CLIENT_PARTIALLY_PAID.value:
            deal.status = DealStatus.EXECUTION.value
    
    db.commit()
    db.refresh(deal)
    return deal

