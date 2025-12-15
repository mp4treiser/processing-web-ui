from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.permissions import require_permission
from app.models.user import User, UserRole
from app.models.deal import Deal, DealStatus
from app.schemas.deal import DealResponse, DealListResponse

router = APIRouter(prefix="/director", tags=["director"])


@router.get("/pending", response_model=List[DealListResponse])
def get_pending_approvals(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.read_all"))
):
    """Список заявок на утверждение (ФинДиректор)"""
    deals = db.query(Deal).filter(
        Deal.status == DealStatus.DIRECTOR_APPROVAL_PENDING.value
    ).order_by(Deal.created_at.desc()).all()
    
    result = []
    for deal in deals:
        from app.models.transaction import Transaction, TransactionStatus
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
            progress={"paid": paid_count, "total": len(transactions)} if transactions else None,
            client_debt_amount=deal.client_debt_amount,
            client_paid_amount=deal.client_paid_amount
        ))
    
    return result


@router.post("/{deal_id}/approve", response_model=DealResponse)
def approve_deal(
    deal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.update"))
):
    """Утвердить сделку (ФинДиректор)"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.status != DealStatus.DIRECTOR_APPROVAL_PENDING.value:
        raise HTTPException(status_code=400, detail="Deal is not pending approval")
    
    from datetime import datetime
    deal.status = DealStatus.CLIENT_APPROVAL.value
    deal.approved_at = datetime.utcnow()
    deal.approved_by = current_user.id
    
    db.commit()
    db.refresh(deal)
    return deal


@router.post("/{deal_id}/reject", response_model=DealResponse)
def reject_deal(
    deal_id: int,
    comment: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.update"))
):
    """Отклонить сделку (ФинДиректор)"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.status != DealStatus.DIRECTOR_APPROVAL_PENDING.value:
        raise HTTPException(status_code=400, detail="Deal is not pending approval")
    
    deal.status = DealStatus.DIRECTOR_REJECTED.value
    deal.director_comment = comment
    
    db.commit()
    db.refresh(deal)
    return deal

