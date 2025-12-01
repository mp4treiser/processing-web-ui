from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.dependencies import get_current_active_user, require_role
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
    current_user: User = Depends(require_role([UserRole.MANAGER]))
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
        status=DealStatus.NEW
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
    status_filter: DealStatus | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получить список заявок (с фильтрацией по роли)"""
    query = db.query(Deal)
    
    # Row Level Security: Менеджер видит только свои сделки
    if current_user.role == UserRole.MANAGER:
        query = query.filter(Deal.manager_id == current_user.id)
    
    # Бухгалтер видит заявки на расчет и в исполнении
    elif current_user.role == UserRole.ACCOUNTANT:
        # Если указан фильтр execution, показываем только execution
        if status_filter == DealStatus.EXECUTION:
            query = query.filter(Deal.status == DealStatus.EXECUTION)
        # Если указан фильтр calculation_pending, показываем только calculation_pending и rejected
        elif status_filter == DealStatus.CALCULATION_PENDING:
            query = query.filter(
                Deal.status.in_([DealStatus.CALCULATION_PENDING, DealStatus.DIRECTOR_REJECTED])
            )
        # Если фильтр не указан, показываем все доступные статусы
        else:
            query = query.filter(
                Deal.status.in_([DealStatus.CALCULATION_PENDING, DealStatus.EXECUTION, DealStatus.DIRECTOR_REJECTED])
            )
    
    # Директор видит заявки на утверждение
    elif current_user.role == UserRole.DIRECTOR:
        query = query.filter(Deal.status == DealStatus.DIRECTOR_APPROVAL_PENDING)
    
    # Применяем фильтр только если он не был применен выше (для других ролей)
    if status_filter and current_user.role != UserRole.ACCOUNTANT:
        query = query.filter(Deal.status == status_filter)
    
    deals = query.order_by(Deal.created_at.desc()).all()
    
    # Формируем ответ с прогрессом
    result = []
    for deal in deals:
        transactions = db.query(Transaction).filter(Transaction.deal_id == deal.id).all()
        paid_count = sum(1 for t in transactions if t.status == TransactionStatus.PAID)
        
        result.append(DealListResponse(
            id=deal.id,
            client_id=deal.client_id,
            client_name=deal.client.name if deal.client else None,
            total_eur_request=deal.total_eur_request,
            total_usdt_calculated=deal.total_usdt_calculated,
            status=deal.status,
            created_at=deal.created_at,
            progress={"paid": paid_count, "total": len(transactions)} if transactions else None
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
    current_user: User = Depends(require_role([UserRole.ACCOUNTANT, UserRole.DIRECTOR]))
):
    """Обновление заявки (Бухгалтер или Директор)"""
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
    current_user: User = Depends(require_role([UserRole.MANAGER]))
):
    """Отправить заявку на расчет (Менеджер)"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.manager_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    if deal.status != DealStatus.NEW:
        raise HTTPException(status_code=400, detail="Deal cannot be submitted")
    
    deal.status = DealStatus.CALCULATION_PENDING
    db.commit()
    db.refresh(deal)
    return deal


@router.post("/{deal_id}/approve-client", response_model=DealResponse)
def approve_by_client(
    deal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.MANAGER]))
):
    """Клиент подтвердил сделку (Менеджер)"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.manager_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    if deal.status != DealStatus.CLIENT_APPROVAL:
        raise HTTPException(status_code=400, detail="Deal is not in client approval status")
    
    # После подтверждения клиентом -> переходим в execution (бухгалтеру на исполнение)
    deal.status = DealStatus.EXECUTION
    db.commit()
    db.refresh(deal)
    return deal

