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


@router.put("/{deal_id}", response_model=DealResponse)
def update_deal(
    deal_id: int,
    deal_update: DealUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.update"))
):
    """Обновление заявки (Бухгалтер или Директор)"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    # Обновляем поля
    for field, value in deal_update.model_dump(exclude_unset=True).items():
        setattr(deal, field, value)
    
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
        deal.is_client_debt = "true"
        deal.status = DealStatus.CLIENT_PARTIALLY_PAID.value
    else:
        # Полная оплата
        deal.client_debt_amount = Decimal("0")
        deal.is_client_debt = "false"
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
    
    if deal.is_client_debt != "true" or deal.client_debt_amount <= 0:
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
        deal.is_client_debt = "false"
        # Если сделка была в статусе частичной оплаты и теперь полностью оплачена
        if deal.status == DealStatus.CLIENT_PARTIALLY_PAID.value:
            deal.status = DealStatus.EXECUTION.value
    
    db.commit()
    db.refresh(deal)
    return deal

