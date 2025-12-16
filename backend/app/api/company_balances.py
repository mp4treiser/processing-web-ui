from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Dict
from decimal import Decimal
from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.core.permissions import require_permission
from app.models.user import User
from app.models.internal_company import InternalCompany
from app.models.internal_company_account import InternalCompanyAccount
from app.models.account_balance import AccountBalance
from app.models.deal import Deal, DealStatus
from app.models.transaction import Transaction, TransactionStatus
from pydantic import BaseModel

router = APIRouter(prefix="/company-balances", tags=["company-balances"])


class CompanyBalanceResponse(BaseModel):
    company_id: int
    company_name: str
    total_balance: Decimal
    currency: str
    accounts: List[Dict]

class CryptoBalanceResponse(BaseModel):
    account_id: int
    account_name: str
    balance: Decimal
    currency: str

class CompanyBalancesSummaryResponse(BaseModel):
    companies: List[CompanyBalanceResponse]
    crypto_balances: List[CryptoBalanceResponse]
    total_company_balance: Decimal
    total_crypto_balance: Decimal

class ProjectedCompanyBalancesResponse(BaseModel):
    current: CompanyBalancesSummaryResponse
    projected: CompanyBalancesSummaryResponse


@router.get("/summary", response_model=CompanyBalancesSummaryResponse)
def get_company_balances_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("balances.read"))
):
    """Получить сводку остатков компаний и криптовалют"""
    
    # Получаем все внутренние компании со счетами
    companies = db.query(InternalCompany).all()
    company_balances = []
    total_company_balance = Decimal(0)
    
    for company in companies:
        accounts = db.query(InternalCompanyAccount).filter(
            InternalCompanyAccount.company_id == company.id,
            InternalCompanyAccount.is_active == True
        ).all()
        
        # Группируем по валютам
        currency_totals = {}
        account_details = []
        
        for account in accounts:
            currency = account.currency
            if currency not in currency_totals:
                currency_totals[currency] = Decimal(0)
            currency_totals[currency] += account.balance
            
            # Нормализуем баланс счета - 2 знака для фиата, 4 для крипты
            is_crypto = currency in ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL', 'ADA', 'DOT', 'MATIC', 'AVAX', 'LINK', 'UNI', 'ATOM', 'XRP', 'DOGE', 'LTC', 'BCH', 'XLM', 'ALGO', 'VET', 'TRX', 'EOS', 'AAVE', 'MKR', 'COMP', 'SNX', 'SUSHI', 'CRV', 'YFI', '1INCH']
            normalized_account_balance = account.balance.quantize(Decimal('0.0001') if is_crypto else Decimal('0.01'))
            account_details.append({
                "id": account.id,
                "account_name": account.account_name,
                "account_number": account.account_number,
                "balance": float(normalized_account_balance),
                "currency": currency
            })
        
        # Создаем ответ для каждой валюты компании
        for currency, balance in currency_totals.items():
            # Нормализуем Decimal - 2 знака для фиата (счета компаний всегда фиат)
            normalized_balance = balance.quantize(Decimal('0.01'))
            company_balances.append(CompanyBalanceResponse(
                company_id=company.id,
                company_name=company.name,
                total_balance=normalized_balance,
                currency=currency,
                accounts=[acc for acc in account_details if acc["currency"] == currency]
            ))
            total_company_balance += balance
    
    # Получаем остатки в криптовалютах (из AccountBalance)
    crypto_balances = db.query(AccountBalance).all()
    crypto_list = []
    total_crypto_balance = Decimal(0)
    
    for balance in crypto_balances:
        # Нормализуем Decimal для крипты - до 4 знаков после запятой
        normalized_balance = balance.balance.quantize(Decimal('0.0001'))
        crypto_list.append(CryptoBalanceResponse(
            account_id=balance.id,
            account_name=balance.account_name,
            balance=normalized_balance,
            currency=balance.currency or "UNKNOWN"
        ))
        total_crypto_balance += balance.balance
    
    # Нормализуем итоговые балансы
    normalized_total_company = total_company_balance.quantize(Decimal('0.01'))
    normalized_total_crypto = total_crypto_balance.quantize(Decimal('0.0001'))
    
    return CompanyBalancesSummaryResponse(
        companies=company_balances,
        crypto_balances=crypto_list,
        total_company_balance=normalized_total_company,
        total_crypto_balance=normalized_total_crypto
    )


@router.get("/projected", response_model=ProjectedCompanyBalancesResponse)
def get_projected_company_balances(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("balances.read"))
):
    """Получить текущие и предполагаемые остатки с учетом неисполненных сделок"""
    
    # Получаем текущие остатки
    current = get_company_balances_summary(db=db, current_user=current_user)
    
    # Получаем неисполненные сделки (сохраненные, рассчитанные, отправленные на выполнение)
    pending_deals = db.query(Deal).filter(
        Deal.status.in_([
            DealStatus.SENIOR_MANAGER_APPROVED.value,
            DealStatus.CLIENT_AGREED_TO_PAY.value,
            DealStatus.AWAITING_CLIENT_PAYMENT.value,
            DealStatus.CLIENT_PARTIALLY_PAID.value,
            DealStatus.EXECUTION.value
        ])
    ).all()
    
    # Рассчитываем изменения балансов на основе транзакций неисполненных сделок
    projected_changes = {}  # {account_id: change_amount}
    
    for deal in pending_deals:
        transactions = db.query(Transaction).filter(
            Transaction.deal_id == deal.id,
            Transaction.status != TransactionStatus.PAID.value
        ).all()
        
        for transaction in transactions:
            # Для прямого перевода - списание с нашего счета
            if transaction.route_type == "direct" and transaction.internal_company_account_id:
                account_id = transaction.internal_company_account_id
                if account_id not in projected_changes:
                    projected_changes[account_id] = Decimal(0)
                # Списываем сумму перевода
                if transaction.amount_from_account:
                    projected_changes[account_id] -= transaction.amount_from_account
            
            # Для биржи - изменения в криптовалютных балансах
            elif transaction.route_type == "exchange" and transaction.crypto_account_id:
                account_id = transaction.crypto_account_id
                if account_id not in projected_changes:
                    projected_changes[account_id] = Decimal(0)
                # Здесь нужно рассчитать изменения на основе курса и сумм
                # Упрощенная версия - можно доработать
                if transaction.amount_for_client:
                    projected_changes[account_id] -= transaction.amount_for_client
    
    # Создаем проекцию остатков
    # Для компаний
    projected_companies = []
    for company_balance in current.companies:
        # Находим изменения для счетов этой компании
        company = db.query(InternalCompany).filter(InternalCompany.id == company_balance.company_id).first()
        if company:
            accounts = db.query(InternalCompanyAccount).filter(
                InternalCompanyAccount.company_id == company.id,
                InternalCompanyAccount.is_active == True
            ).all()
            
            projected_accounts = []
            projected_total = Decimal(0)
            
            for account in accounts:
                change = projected_changes.get(account.id, Decimal(0))
                projected_balance = account.balance + change
                projected_total += projected_balance
                
                projected_accounts.append({
                    "id": account.id,
                    "account_name": account.account_name,
                    "account_number": account.account_number,
                    "balance": float(projected_balance),
                    "currency": account.currency
                })
            
            # Нормализуем projected_total
            normalized_projected_total = projected_total.quantize(Decimal('0.01'))
            if normalized_projected_total != company_balance.total_balance:
                projected_companies.append(CompanyBalanceResponse(
                    company_id=company_balance.company_id,
                    company_name=company_balance.company_name,
                    total_balance=normalized_projected_total,
                    currency=company_balance.currency,
                    accounts=projected_accounts
                ))
            else:
                projected_companies.append(company_balance)
    
    # Для криптовалют
    projected_crypto = []
    for crypto_balance in current.crypto_balances:
        change = projected_changes.get(crypto_balance.account_id, Decimal(0))
        projected_balance = crypto_balance.balance + change
        # Нормализуем до 4 знаков для крипты
        normalized_projected_crypto = projected_balance.quantize(Decimal('0.0001'))
        
        projected_crypto.append(CryptoBalanceResponse(
            account_id=crypto_balance.account_id,
            account_name=crypto_balance.account_name,
            balance=normalized_projected_crypto,
            currency=crypto_balance.currency
        ))
    
    projected_total_company = sum(cb.total_balance for cb in projected_companies)
    projected_total_crypto = sum(cb.balance for cb in projected_crypto)
    
    # Нормализуем итоговые projected балансы
    normalized_projected_total_company = projected_total_company.quantize(Decimal('0.01'))
    normalized_projected_total_crypto = projected_total_crypto.quantize(Decimal('0.0001'))
    
    projected = CompanyBalancesSummaryResponse(
        companies=projected_companies,
        crypto_balances=projected_crypto,
        total_company_balance=normalized_projected_total_company,
        total_crypto_balance=normalized_projected_total_crypto
    )
    
    return ProjectedCompanyBalancesResponse(
        current=current,
        projected=projected
    )

