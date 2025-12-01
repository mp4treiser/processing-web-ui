from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from decimal import Decimal
from app.core.database import get_db
from app.core.dependencies import require_role
from app.models.user import User, UserRole
from app.models.deal import Deal, DealStatus
from app.schemas.deal import DealResponse

router = APIRouter(prefix="/accountant", tags=["accountant"])


@router.post("/{deal_id}/submit-for-approval", response_model=DealResponse)
def submit_for_director_approval(
    deal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ACCOUNTANT]))
):
    """Отправить расчет на согласование ФинДиректору (Бухгалтер)"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.status not in [DealStatus.CALCULATION_PENDING, DealStatus.DIRECTOR_REJECTED]:
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
    
    deal.status = DealStatus.DIRECTOR_APPROVAL_PENDING
    db.commit()
    db.refresh(deal)
    return deal

