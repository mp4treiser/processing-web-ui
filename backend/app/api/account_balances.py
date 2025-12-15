from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from decimal import Decimal
from datetime import datetime
from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.core.permissions import require_permission
from app.models.user import User, UserRole
from app.models.account_balance import AccountBalance
from app.models.account_balance_history import AccountBalanceHistory, BalanceChangeType
from pydantic import BaseModel

router = APIRouter(prefix="/account-balances", tags=["account-balances"])


class AccountBalanceCreate(BaseModel):
    account_name: str
    balance: Decimal
    currency: Optional[str] = None
    notes: Optional[str] = None


class AccountBalanceUpdate(BaseModel):
    account_name: Optional[str] = None
    balance: Optional[Decimal] = None
    currency: Optional[str] = None
    notes: Optional[str] = None
    comment: Optional[str] = None  # Обязателен при изменении остатка


class AccountBalanceResponse(BaseModel):
    id: int
    account_name: str
    balance: Decimal
    currency: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BalanceHistoryResponse(BaseModel):
    id: int
    account_balance_id: int
    previous_balance: Decimal
    new_balance: Decimal
    change_amount: Decimal
    change_type: str
    transaction_id: Optional[int] = None
    deal_id: Optional[int] = None
    comment: Optional[str] = None
    changed_by: int
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=List[AccountBalanceResponse])
def get_account_balances(
    currency: Optional[str] = Query(None, description="Filter by currency"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("balances.read"))
):
    """Получить список остатков по счетам"""
    query = db.query(AccountBalance)
    if currency:
        query = query.filter(AccountBalance.currency == currency)
    balances = query.order_by(AccountBalance.account_name).all()
    return balances


@router.post("", response_model=AccountBalanceResponse, status_code=status.HTTP_201_CREATED)
def create_account_balance(
    balance_data: AccountBalanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("balances.write"))
):
    """Создать остаток по счету"""
    db_balance = AccountBalance(
        account_name=balance_data.account_name,
        balance=balance_data.balance,
        currency=balance_data.currency,
        notes=balance_data.notes,
        created_by=current_user.id,
        updated_by=current_user.id
    )
    db.add(db_balance)
    db.commit()
    db.refresh(db_balance)
    return db_balance


@router.put("/{balance_id}", response_model=AccountBalanceResponse)
def update_account_balance(
    balance_id: int,
    balance_update: AccountBalanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("balances.write"))
):
    """Обновить остаток по счету"""
    balance = db.query(AccountBalance).filter(AccountBalance.id == balance_id).first()
    if not balance:
        raise HTTPException(status_code=404, detail="Account balance not found")
    
    # Если изменяется остаток, требуется комментарий
    if balance_update.balance is not None and balance_update.balance != balance.balance:
        if not balance_update.comment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Comment is required when updating balance"
            )
        
        # Создаем запись в истории
        change_amount = balance_update.balance - balance.balance
        history = AccountBalanceHistory(
            account_balance_id=balance_id,
            previous_balance=balance.balance,
            new_balance=balance_update.balance,
            change_amount=change_amount,
            change_type=BalanceChangeType.MANUAL,
            comment=balance_update.comment,
            changed_by=current_user.id
        )
        db.add(history)
    
    # Обновляем поля
    if balance_update.account_name is not None:
        balance.account_name = balance_update.account_name
    if balance_update.balance is not None:
        balance.balance = balance_update.balance
    if balance_update.currency is not None:
        balance.currency = balance_update.currency
    if balance_update.notes is not None:
        balance.notes = balance_update.notes
    
    balance.updated_by = current_user.id
    
    db.commit()
    db.refresh(balance)
    return balance


@router.delete("/{balance_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account_balance(
    balance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("balances.write"))
):
    """Удалить остаток по счету"""
    balance = db.query(AccountBalance).filter(AccountBalance.id == balance_id).first()
    if not balance:
        raise HTTPException(status_code=404, detail="Account balance not found")
    
    db.delete(balance)
    db.commit()
    return None


@router.get("/{balance_id}/history", response_model=List[BalanceHistoryResponse])
def get_balance_history(
    balance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("balances.history.read"))
):
    """Получить историю изменений остатка"""
    balance = db.query(AccountBalance).filter(AccountBalance.id == balance_id).first()
    if not balance:
        raise HTTPException(status_code=404, detail="Account balance not found")
    
    history = db.query(AccountBalanceHistory).filter(
        AccountBalanceHistory.account_balance_id == balance_id
    ).order_by(AccountBalanceHistory.created_at.desc()).all()
    
    return history

