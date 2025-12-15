from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional, Union
from decimal import Decimal, InvalidOperation
from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.core.permissions import require_permission
from app.models.user import User, UserRole
from app.models.deal import Deal, DealStatus
from app.models.transaction import Transaction, RouteType
from app.schemas.deal import DealResponse, DealListResponse
from pydantic import BaseModel, field_validator

router = APIRouter(prefix="/senior-manager", tags=["senior-manager"])


class TransactionRouteUpdate(BaseModel):
    transaction_id: int
    route_type: Optional[RouteType] = None
    exchange_rate: Optional[Decimal] = None
    partner_bonus_rate: Optional[Decimal] = None
    partner_cost_rate: Optional[Decimal] = None
    exchange_fee_percent: Optional[Decimal] = None
    intermediary_fee_percent: Optional[Decimal] = None
    bank_fee_fix_eur: Optional[Decimal] = None
    bank_fee_percent: Optional[Decimal] = None

    @field_validator('exchange_rate', 'partner_bonus_rate', 'partner_cost_rate', 
                     'exchange_fee_percent', 'intermediary_fee_percent', 
                     'bank_fee_fix_eur', 'bank_fee_percent', mode='before')
    @classmethod
    def parse_decimal(cls, v):
        """Преобразует пустые строки и невалидные значения в None для Decimal полей"""
        if v is None or v == '' or v == 'null':
            return None
        if isinstance(v, str):
            try:
                return Decimal(v)
            except (ValueError, InvalidOperation):
                return None
        if isinstance(v, (int, float)):
            return Decimal(str(v))
        return v


class DealApproveRequest(BaseModel):
    comment: Optional[str] = None
    total_eur_request: Optional[Decimal] = None
    client_rate_percent: Optional[Decimal] = None
    transaction_routes: Optional[List[TransactionRouteUpdate]] = None


class DealRejectRequest(BaseModel):
    comment: str


@router.get("/pending", response_model=List[DealListResponse])
def get_pending_deals(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.review"))
):
    """Список сделок на проверку главным менеджером"""
    deals = db.query(Deal).filter(
        Deal.status == DealStatus.NEW.value
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


@router.get("/{deal_id}", response_model=DealResponse)
def get_deal_for_review(
    deal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.review"))
):
    """Получить детали сделки для проверки"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.status != DealStatus.NEW.value:
        raise HTTPException(
            status_code=400,
            detail=f"Deal is not in NEW status (current: {deal.status})"
        )
    
    return deal


@router.put("/{deal_id}", response_model=DealResponse)
def update_deal_before_approval(
    deal_id: int,
    deal_update: DealApproveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.approve"))
):
    """Обновить сделку перед апрувом (корректировка сумм, маршрутов)"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.status != DealStatus.NEW.value:
        raise HTTPException(
            status_code=400,
            detail=f"Deal is not in NEW status (current: {deal.status})"
        )
    
    # Обновляем основные параметры
    if deal_update.total_eur_request is not None:
        deal.total_eur_request = deal_update.total_eur_request
    if deal_update.client_rate_percent is not None:
        deal.client_rate_percent = deal_update.client_rate_percent
    
    # Обновляем маршруты транзакций
    if deal_update.transaction_routes:
        for route_update in deal_update.transaction_routes:
            transaction = db.query(Transaction).filter(
                Transaction.id == route_update.transaction_id,
                Transaction.deal_id == deal_id
            ).first()
            
            if not transaction:
                raise HTTPException(
                    status_code=404,
                    detail=f"Transaction {route_update.transaction_id} not found"
                )
            
            if route_update.route_type is not None:
                transaction.route_type = route_update.route_type
            if route_update.exchange_rate is not None:
                transaction.exchange_rate = route_update.exchange_rate
            if route_update.partner_bonus_rate is not None:
                transaction.partner_bonus_rate = route_update.partner_bonus_rate
            if route_update.partner_cost_rate is not None:
                transaction.partner_cost_rate = route_update.partner_cost_rate
            if route_update.exchange_fee_percent is not None:
                transaction.exchange_fee_percent = route_update.exchange_fee_percent
            if route_update.intermediary_fee_percent is not None:
                transaction.intermediary_fee_percent = route_update.intermediary_fee_percent
            if route_update.bank_fee_fix_eur is not None:
                transaction.bank_fee_fix_eur = route_update.bank_fee_fix_eur
            if route_update.bank_fee_percent is not None:
                transaction.bank_fee_percent = route_update.bank_fee_percent
    
    db.commit()
    db.refresh(deal)
    return deal


@router.post("/{deal_id}/approve", response_model=DealResponse)
def approve_deal(
    deal_id: int,
    approve_data: DealApproveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.approve"))
):
    """Одобрить сделку главным менеджером"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.status != DealStatus.NEW.value:
        raise HTTPException(
            status_code=400,
            detail=f"Deal is not in NEW status (current: {deal.status})"
        )
    
    # Обновляем параметры, если указаны
    if approve_data.total_eur_request is not None:
        deal.total_eur_request = approve_data.total_eur_request
    if approve_data.client_rate_percent is not None:
        deal.client_rate_percent = approve_data.client_rate_percent
    
    # Обновляем маршруты транзакций, если указаны
    if approve_data.transaction_routes:
        for route_update in approve_data.transaction_routes:
            transaction = db.query(Transaction).filter(
                Transaction.id == route_update.transaction_id,
                Transaction.deal_id == deal_id
            ).first()
            
            if transaction:
                if route_update.route_type is not None:
                    transaction.route_type = route_update.route_type
                if route_update.exchange_rate is not None:
                    transaction.exchange_rate = route_update.exchange_rate
                if route_update.partner_bonus_rate is not None:
                    transaction.partner_bonus_rate = route_update.partner_bonus_rate
                if route_update.partner_cost_rate is not None:
                    transaction.partner_cost_rate = route_update.partner_cost_rate
                if route_update.exchange_fee_percent is not None:
                    transaction.exchange_fee_percent = route_update.exchange_fee_percent
                if route_update.intermediary_fee_percent is not None:
                    transaction.intermediary_fee_percent = route_update.intermediary_fee_percent
                if route_update.bank_fee_fix_eur is not None:
                    transaction.bank_fee_fix_eur = route_update.bank_fee_fix_eur
                if route_update.bank_fee_percent is not None:
                    transaction.bank_fee_percent = route_update.bank_fee_percent
    
    # Обновляем статус и информацию о проверке
    from datetime import datetime
    # Используем .value, чтобы SQLAlchemy использовал строковое значение, а не имя enum
    deal.status = DealStatus.SENIOR_MANAGER_APPROVED.value
    deal.senior_manager_id = current_user.id
    deal.senior_manager_comment = approve_data.comment
    deal.approved_by_senior_manager_at = datetime.utcnow()
    
    db.commit()
    db.refresh(deal)
    return deal


@router.post("/{deal_id}/reject", response_model=DealResponse)
def reject_deal(
    deal_id: int,
    reject_data: DealRejectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.approve"))
):
    """Отклонить сделку главным менеджером"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.status != DealStatus.NEW.value:
        raise HTTPException(
            status_code=400,
            detail=f"Deal is not in NEW status (current: {deal.status})"
        )
    
    # Обновляем статус и информацию об отклонении
    from datetime import datetime
    # Используем .value, чтобы SQLAlchemy использовал строковое значение, а не имя enum
    deal.status = DealStatus.SENIOR_MANAGER_REJECTED.value
    deal.senior_manager_id = current_user.id
    deal.senior_manager_comment = reject_data.comment
    deal.approved_by_senior_manager_at = datetime.utcnow()
    
    db.commit()
    db.refresh(deal)
    return deal

