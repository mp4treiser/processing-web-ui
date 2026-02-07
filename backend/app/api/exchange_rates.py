from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List
from decimal import Decimal
from datetime import datetime
from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.core.permissions import require_permission
from app.models.user import User
from app.models.exchange_rate_transaction import ExchangeRateTransaction, TransactionType
from app.models.exchange_rate_average import ExchangeRateAverage
from app.models.internal_company_account import InternalCompanyAccount
from app.models.account_balance import AccountBalance
from app.schemas.exchange_rate import (
    ExchangeRateTransactionCreate,
    ExchangeRateTransactionResponse,
    ExchangeRateAverageResponse,
    ExchangeRateHistoryItem
)

router = APIRouter(prefix="/exchange-rates", tags=["exchange-rates"])


def update_exchange_rate_average(
    db: Session,
    currency_from: str,
    currency_to: str,
    transaction_type: TransactionType,
    amount: Decimal,
    exchange_rate: Decimal
) -> ExchangeRateAverage:
    """
    Update the average exchange rate for a currency pair based on a new transaction.
    
    Logic:
    - INCOME: Add to balance and total_value, recalculate average_rate
    - EXPENSE: Reduce balance and total_value proportionally, keep average_rate unchanged
    """
    # Get or create the average record
    avg_record = db.query(ExchangeRateAverage).filter(
        ExchangeRateAverage.currency_from == currency_from,
        ExchangeRateAverage.currency_to == currency_to
    ).first()
    
    if not avg_record:
        avg_record = ExchangeRateAverage(
            currency_from=currency_from,
            currency_to=currency_to,
            balance=Decimal(0),
            total_value=Decimal(0),
            average_rate=Decimal(0)
        )
        db.add(avg_record)
    
    if transaction_type == TransactionType.INCOME:
        # Income: Add to balance, add to total value, recalculate average
        value_added = amount * exchange_rate
        avg_record.balance += amount
        avg_record.total_value += value_added
        
        # Recalculate average rate
        if avg_record.balance > 0:
            avg_record.average_rate = avg_record.total_value / avg_record.balance
        else:
            avg_record.average_rate = Decimal(0)
    
    elif transaction_type == TransactionType.EXPENSE:
        # Expense: Reduce balance and total value proportionally, keep average rate
        if avg_record.balance <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot process expense: No balance available for {currency_from}→{currency_to}"
            )
        
        if amount > avg_record.balance:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance: Available {avg_record.balance} {currency_from}, requested {amount}"
            )
        
        # Calculate proportional value to reduce
        if avg_record.average_rate > 0:
            value_reduced = amount * avg_record.average_rate
        else:
            value_reduced = Decimal(0)
        
        avg_record.balance -= amount
        avg_record.total_value -= value_reduced
        
        # Average rate stays the same (not recalculated)
    
    avg_record.last_updated = datetime.utcnow()
    db.commit()
    db.refresh(avg_record)
    
    return avg_record


@router.post("/income", response_model=ExchangeRateTransactionResponse)
def create_income_transaction(
    transaction_data: ExchangeRateTransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("balances.write"))
):
    """Record an income transaction and update average exchange rate"""
    
    if transaction_data.transaction_type != TransactionType.INCOME:
        raise HTTPException(status_code=400, detail="Transaction type must be INCOME")
    
    # Validate that exactly one account is specified
    if not (transaction_data.internal_company_account_id or transaction_data.crypto_account_id):
        raise HTTPException(status_code=400, detail="Account ID is required")
    
    if transaction_data.internal_company_account_id and transaction_data.crypto_account_id:
        raise HTTPException(status_code=400, detail="Specify only one account type")
    
    # Validate account exists and get it
    account = None
    if transaction_data.internal_company_account_id:
        account = db.query(InternalCompanyAccount).filter(
            InternalCompanyAccount.id == transaction_data.internal_company_account_id
        ).first()
        if not account:
            raise HTTPException(status_code=404, detail="Company account not found")
    
    if transaction_data.crypto_account_id:
        account = db.query(AccountBalance).filter(
            AccountBalance.id == transaction_data.crypto_account_id
        ).first()
        if not account:
            raise HTTPException(status_code=404, detail="Crypto account not found")
    
    # Calculate value in target currency
    value_in_target = transaction_data.amount * transaction_data.exchange_rate
    
    # Update account balance (add income)
    previous_balance = account.balance
    account.balance += value_in_target
    
    # Create history record for the balance change
    if transaction_data.internal_company_account_id:
        from app.models.internal_company_account_history import InternalCompanyAccountHistory, CompanyBalanceChangeType
        history = InternalCompanyAccountHistory(
            account_id=account.id,
            previous_balance=previous_balance,
            new_balance=account.balance,
            change_amount=value_in_target,
            change_type=CompanyBalanceChangeType.AUTO,
            changed_by=current_user.id,
            comment=f"Income: {transaction_data.amount} {transaction_data.currency_from} → {value_in_target} {transaction_data.currency_to} @ {transaction_data.exchange_rate}"
        )
        db.add(history)
    else:
        from app.models.account_balance_history import AccountBalanceHistory, BalanceChangeType
        history = AccountBalanceHistory(
            account_balance_id=account.id,
            previous_balance=previous_balance,
            new_balance=account.balance,
            change_amount=value_in_target,
            change_type=BalanceChangeType.AUTO,
            changed_by=current_user.id,
            comment=f"Income: {transaction_data.amount} {transaction_data.currency_from} → {value_in_target} {transaction_data.currency_to} @ {transaction_data.exchange_rate}"
        )
        db.add(history)
    
    # Create transaction record
    transaction = ExchangeRateTransaction(
        internal_company_account_id=transaction_data.internal_company_account_id,
        crypto_account_id=transaction_data.crypto_account_id,
        transaction_type=TransactionType.INCOME,
        amount=transaction_data.amount,
        currency_from=transaction_data.currency_from,
        currency_to=transaction_data.currency_to,
        exchange_rate=transaction_data.exchange_rate,
        value_in_target_currency=value_in_target,
        comment=transaction_data.comment,
        created_by=current_user.id
    )
    db.add(transaction)
    
    # Update average exchange rate
    update_exchange_rate_average(
        db=db,
        currency_from=transaction_data.currency_from,
        currency_to=transaction_data.currency_to,
        transaction_type=TransactionType.INCOME,
        amount=transaction_data.amount,
        exchange_rate=transaction_data.exchange_rate
    )
    
    db.commit()
    db.refresh(transaction)
    
    return transaction


@router.post("/expense", response_model=ExchangeRateTransactionResponse)
def create_expense_transaction(
    transaction_data: ExchangeRateTransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("balances.write"))
):
    """Record an expense transaction and update balances (keeping average rate unchanged)"""
    
    if transaction_data.transaction_type != TransactionType.EXPENSE:
        raise HTTPException(status_code=400, detail="Transaction type must be EXPENSE")
    
    # Validate that exactly one account is specified
    if not (transaction_data.internal_company_account_id or transaction_data.crypto_account_id):
        raise HTTPException(status_code=400, detail="Account ID is required")
    
    if transaction_data.internal_company_account_id and transaction_data.crypto_account_id:
        raise HTTPException(status_code=400, detail="Specify only one account type")
    
    # Validate account exists and get it
    account = None
    if transaction_data.internal_company_account_id:
        account = db.query(InternalCompanyAccount).filter(
            InternalCompanyAccount.id == transaction_data.internal_company_account_id
        ).first()
        if not account:
            raise HTTPException(status_code=404, detail="Company account not found")
    
    if transaction_data.crypto_account_id:
        account = db.query(AccountBalance).filter(
            AccountBalance.id == transaction_data.crypto_account_id
        ).first()
        if not account:
            raise HTTPException(status_code=404, detail="Crypto account not found")
    
    # Calculate value in target currency (using the rate from the transaction)
    value_in_target = transaction_data.amount * transaction_data.exchange_rate
    
    # Check sufficient balance
    if account.balance < value_in_target:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient balance. Available: {account.balance}, Required: {value_in_target}"
        )
    
    # Update account balance (subtract expense)
    previous_balance = account.balance
    account.balance -= value_in_target
    
    # Create history record for the balance change
    if transaction_data.internal_company_account_id:
        from app.models.internal_company_account_history import InternalCompanyAccountHistory, CompanyBalanceChangeType
        history = InternalCompanyAccountHistory(
            account_id=account.id,
            previous_balance=previous_balance,
            new_balance=account.balance,
            change_amount=-value_in_target,
            change_type=CompanyBalanceChangeType.AUTO,
            changed_by=current_user.id,
            comment=f"Expense: {transaction_data.amount} {transaction_data.currency_from} → {value_in_target} {transaction_data.currency_to} @ {transaction_data.exchange_rate}"
        )
        db.add(history)
    else:
        from app.models.account_balance_history import AccountBalanceHistory, BalanceChangeType
        history = AccountBalanceHistory(
            account_balance_id=account.id,
            previous_balance=previous_balance,
            new_balance=account.balance,
            change_amount=-value_in_target,
            change_type=BalanceChangeType.AUTO,
            changed_by=current_user.id,
            comment=f"Expense: {transaction_data.amount} {transaction_data.currency_from} → {value_in_target} {transaction_data.currency_to} @ {transaction_data.exchange_rate}"
        )
        db.add(history)
    
    # Create transaction record
    transaction = ExchangeRateTransaction(
        internal_company_account_id=transaction_data.internal_company_account_id,
        crypto_account_id=transaction_data.crypto_account_id,
        transaction_type=TransactionType.EXPENSE,
        amount=transaction_data.amount,
        currency_from=transaction_data.currency_from,
        currency_to=transaction_data.currency_to,
        exchange_rate=transaction_data.exchange_rate,
        value_in_target_currency=value_in_target,
        comment=transaction_data.comment,
        created_by=current_user.id
    )
    db.add(transaction)
    
    # Update average exchange rate (balance reduces, average stays same)
    update_exchange_rate_average(
        db=db,
        currency_from=transaction_data.currency_from,
        currency_to=transaction_data.currency_to,
        transaction_type=TransactionType.EXPENSE,
        amount=transaction_data.amount,
        exchange_rate=transaction_data.exchange_rate
    )
    
    db.commit()
    db.refresh(transaction)
    
    return transaction


@router.get("/averages", response_model=List[ExchangeRateAverageResponse])
def get_exchange_rate_averages(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("balances.read"))
):
    """Get all currency pair average exchange rates"""
    
    averages = db.query(ExchangeRateAverage).order_by(
        ExchangeRateAverage.currency_from,
        ExchangeRateAverage.currency_to
    ).all()
    
    return averages


@router.get("/history", response_model=List[ExchangeRateHistoryItem])
def get_exchange_rate_history(
    currency_from: str = Query(..., description="Source currency (e.g., EUR)"),
    currency_to: str = Query(..., description="Target currency (e.g., USD)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("balances.read"))
):
    """Get transaction history for a specific currency pair with running calculations"""
    
    # Get all transactions for this currency pair, ordered by date
    transactions = db.query(ExchangeRateTransaction).filter(
        ExchangeRateTransaction.currency_from == currency_from,
        ExchangeRateTransaction.currency_to == currency_to
    ).order_by(ExchangeRateTransaction.created_at).all()
    
    # Calculate running balance and average rate
    history_items = []
    running_balance = Decimal(0)
    running_total_value = Decimal(0)
    
    for trans in transactions:
        if trans.transaction_type == TransactionType.INCOME:
            # Income: Add to balance and total value
            running_balance += trans.amount
            running_total_value += trans.value_in_target_currency
        elif trans.transaction_type == TransactionType.EXPENSE:
            # Expense: Reduce balance proportionally
            if running_balance > 0 and running_total_value > 0:
                current_avg = running_total_value / running_balance
                value_reduced = trans.amount * current_avg
            else:
                value_reduced = Decimal(0)
            
            running_balance -= trans.amount
            running_total_value -= value_reduced
        
        # Calculate average rate after this transaction
        if running_balance > 0:
            avg_rate_after = running_total_value / running_balance
        else:
            avg_rate_after = Decimal(0)
        
        history_items.append(ExchangeRateHistoryItem(
            id=trans.id,
            transaction_type=trans.transaction_type,
            amount=trans.amount,
            exchange_rate=trans.exchange_rate,
            value_in_target_currency=trans.value_in_target_currency,
            balance_after=running_balance,
            total_value_after=running_total_value,
            average_rate_after=avg_rate_after,
            comment=trans.comment,
            created_at=trans.created_at,
            created_by=trans.created_by
        ))
    
    return history_items

