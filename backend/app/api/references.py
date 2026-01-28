from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from decimal import Decimal
from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.core.permissions import require_permission
from app.models.user import User
from app.models.client import Client
from app.models.company import Company
from app.models.company_account import CompanyAccount
from app.models.agent import Agent
from app.models.route_commission import RouteCommission
from app.models.internal_company import InternalCompany
from app.models.internal_company_account import InternalCompanyAccount
from app.models.currency import Currency
from pydantic import BaseModel

router = APIRouter(prefix="/reference", tags=["reference"])


# ========== Клиенты ==========
class ClientCreate(BaseModel):
    name: str
    contact_info: Optional[str] = None
    notes: Optional[str] = None


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    contact_info: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class ClientResponse(BaseModel):
    id: int
    name: str
    contact_info: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


@router.get("/clients", response_model=List[ClientResponse])
def get_clients(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.read"))
):
    """Получить список клиентов"""
    clients = db.query(Client).filter(Client.is_active == True).all()
    return clients


@router.post("/clients", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
def create_client(
    client_data: ClientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.write"))
):
    """Создать клиента"""
    # Проверяем, не существует ли уже клиент с таким именем
    existing = db.query(Client).filter(Client.name == client_data.name, Client.is_active == True).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Client with this name already exists"
        )
    
    db_client = Client(
        name=client_data.name,
        contact_info=client_data.contact_info,
        notes=client_data.notes,
        created_by=current_user.id,
        is_active=True
    )
    db.add(db_client)
    db.commit()
    db.refresh(db_client)
    return db_client


@router.put("/clients/{client_id}", response_model=ClientResponse)
def update_client(
    client_id: int,
    client_update: ClientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.write"))
):
    """Обновить клиента"""
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    for field, value in client_update.model_dump(exclude_unset=True).items():
        setattr(client, field, value)
    
    db.commit()
    db.refresh(client)
    return client


@router.delete("/clients/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.write"))
):
    """Удалить клиента (мягкое удаление)"""
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    client.is_active = False
    db.commit()
    return None


# ========== Компании ==========
class CompanyCreate(BaseModel):
    client_id: int
    name: str
    contact_info: Optional[str] = None
    notes: Optional[str] = None


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    contact_info: Optional[str] = None
    notes: Optional[str] = None


class CompanyResponse(BaseModel):
    id: int
    client_id: int
    name: str
    contact_info: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


@router.get("/companies", response_model=List[CompanyResponse])
def get_companies(
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.companies.read"))
):
    """Получить список компаний"""
    query = db.query(Company)
    if client_id:
        query = query.filter(Company.client_id == client_id)
    companies = query.all()
    return companies


@router.get("/companies/{company_id}", response_model=CompanyResponse)
def get_company(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.companies.read"))
):
    """Получить компанию по ID"""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@router.post("/companies", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
def create_company(
    company_data: CompanyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.companies.write"))
):
    """Создать компанию"""
    # Проверяем, существует ли клиент
    client = db.query(Client).filter(Client.id == company_data.client_id, Client.is_active == True).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    db_company = Company(
        client_id=company_data.client_id,
        name=company_data.name,
        contact_info=company_data.contact_info,
        notes=company_data.notes,
        created_by=current_user.id
    )
    db.add(db_company)
    db.commit()
    db.refresh(db_company)
    return db_company


@router.put("/companies/{company_id}", response_model=CompanyResponse)
def update_company(
    company_id: int,
    company_update: CompanyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.companies.write"))
):
    """Обновить компанию"""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    for field, value in company_update.model_dump(exclude_unset=True).items():
        setattr(company, field, value)
    
    db.commit()
    db.refresh(company)
    return company


@router.delete("/companies/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_company(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.companies.write"))
):
    """Удалить компанию"""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    db.delete(company)
    db.commit()
    return None


# ========== Счета компаний ==========
class CompanyAccountCreate(BaseModel):
    company_id: int
    account_name: str
    account_number: str
    currency: Optional[str] = None


class CompanyAccountUpdate(BaseModel):
    account_name: Optional[str] = None
    account_number: Optional[str] = None
    currency: Optional[str] = None
    is_active: Optional[bool] = None


class CompanyAccountResponse(BaseModel):
    id: int
    company_id: int
    account_name: str
    account_number: str
    currency: Optional[str] = None
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


@router.get("/company-accounts", response_model=List[CompanyAccountResponse])
def get_company_accounts(
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.accounts.read"))
):
    """Получить список счетов компаний"""
    query = db.query(CompanyAccount).filter(CompanyAccount.is_active == True)
    if company_id:
        query = query.filter(CompanyAccount.company_id == company_id)
    accounts = query.all()
    return accounts


@router.get("/company-accounts/{account_id}", response_model=CompanyAccountResponse)
def get_company_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.accounts.read"))
):
    """Получить счет компании по ID"""
    account = db.query(CompanyAccount).filter(
        CompanyAccount.id == account_id,
        CompanyAccount.is_active == True
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Company account not found")
    return account


@router.post("/company-accounts", response_model=CompanyAccountResponse, status_code=status.HTTP_201_CREATED)
def create_company_account(
    account_data: CompanyAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.accounts.write"))
):
    """Создать счет компании"""
    # Проверяем, существует ли компания
    company = db.query(Company).filter(Company.id == account_data.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    db_account = CompanyAccount(
        company_id=account_data.company_id,
        account_name=account_data.account_name,
        account_number=account_data.account_number,
        currency=account_data.currency,
        is_active=True
    )
    db.add(db_account)
    db.commit()
    db.refresh(db_account)
    return db_account


@router.put("/company-accounts/{account_id}", response_model=CompanyAccountResponse)
def update_company_account(
    account_id: int,
    account_update: CompanyAccountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.accounts.write"))
):
    """Обновить счет компании"""
    account = db.query(CompanyAccount).filter(CompanyAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Company account not found")
    
    for field, value in account_update.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    
    db.commit()
    db.refresh(account)
    return account


@router.delete("/company-accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_company_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.accounts.write"))
):
    """Удалить счет компании (мягкое удаление)"""
    account = db.query(CompanyAccount).filter(CompanyAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Company account not found")
    
    account.is_active = False
    db.commit()
    return None


# ========== Агенты ==========
class AgentCreate(BaseModel):
    name: str
    commission_percent: Decimal

class AgentUpdate(BaseModel):
    name: Optional[str] = None
    commission_percent: Optional[Decimal] = None
    is_active: Optional[bool] = None

class AgentResponse(BaseModel):
    id: int
    name: str
    commission_percent: Decimal
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

@router.get("/agents", response_model=List[AgentResponse])
def get_agents(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.read"))
):
    """Получить список агентов"""
    agents = db.query(Agent).filter(Agent.is_active == True).all()
    return agents

@router.post("/agents", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
def create_agent(
    agent_data: AgentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.write"))
):
    """Создать агента"""
    existing = db.query(Agent).filter(Agent.name == agent_data.name, Agent.is_active == True).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Agent with this name already exists"
        )
    
    db_agent = Agent(
        name=agent_data.name,
        commission_percent=agent_data.commission_percent,
        created_by=current_user.id,
        is_active=True
    )
    db.add(db_agent)
    db.commit()
    db.refresh(db_agent)
    return db_agent

@router.put("/agents/{agent_id}", response_model=AgentResponse)
def update_agent(
    agent_id: int,
    agent_update: AgentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.write"))
):
    """Обновить агента"""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    for field, value in agent_update.model_dump(exclude_unset=True).items():
        setattr(agent, field, value)
    
    db.commit()
    db.refresh(agent)
    return agent

@router.delete("/agents/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(
    agent_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.write"))
):
    """Удалить агента (мягкое удаление)"""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    agent.is_active = False
    db.commit()
    return None


# ========== Комиссии маршрутов ==========
class RouteCommissionCreate(BaseModel):
    route_type: str
    commission_percent: Optional[Decimal] = None
    commission_fixed: Optional[Decimal] = None
    is_fixed_currency: bool = False
    currency: Optional[str] = None

class RouteCommissionUpdate(BaseModel):
    commission_percent: Optional[Decimal] = None
    commission_fixed: Optional[Decimal] = None
    is_fixed_currency: Optional[bool] = None
    currency: Optional[str] = None
    is_active: Optional[bool] = None

class RouteCommissionResponse(BaseModel):
    id: int
    route_type: str
    commission_percent: Optional[Decimal] = None
    commission_fixed: Optional[Decimal] = None
    is_fixed_currency: bool
    currency: Optional[str] = None
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

@router.get("/route-commissions", response_model=List[RouteCommissionResponse])
def get_route_commissions(
    route_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.read"))
):
    """Получить список комиссий маршрутов"""
    query = db.query(RouteCommission).filter(RouteCommission.is_active == True)
    if route_type:
        query = query.filter(RouteCommission.route_type == route_type)
    commissions = query.all()
    return commissions

@router.post("/route-commissions", response_model=RouteCommissionResponse, status_code=status.HTTP_201_CREATED)
def create_route_commission(
    commission_data: RouteCommissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.write"))
):
    """Создать комиссию маршрута"""
    existing = db.query(RouteCommission).filter(
        RouteCommission.route_type == commission_data.route_type,
        RouteCommission.is_active == True
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Route commission for this route type already exists"
        )
    
    db_commission = RouteCommission(
        route_type=commission_data.route_type,
        commission_percent=commission_data.commission_percent,
        commission_fixed=commission_data.commission_fixed,
        is_fixed_currency=commission_data.is_fixed_currency,
        currency=commission_data.currency,
        created_by=current_user.id,
        is_active=True
    )
    db.add(db_commission)
    db.commit()
    db.refresh(db_commission)
    return db_commission

@router.put("/route-commissions/{commission_id}", response_model=RouteCommissionResponse)
def update_route_commission(
    commission_id: int,
    commission_update: RouteCommissionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.write"))
):
    """Обновить комиссию маршрута"""
    commission = db.query(RouteCommission).filter(RouteCommission.id == commission_id).first()
    if not commission:
        raise HTTPException(status_code=404, detail="Route commission not found")
    
    for field, value in commission_update.model_dump(exclude_unset=True).items():
        setattr(commission, field, value)
    
    db.commit()
    db.refresh(commission)
    return commission

@router.delete("/route-commissions/{commission_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_route_commission(
    commission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.write"))
):
    """Удалить комиссию маршрута (мягкое удаление)"""
    commission = db.query(RouteCommission).filter(RouteCommission.id == commission_id).first()
    if not commission:
        raise HTTPException(status_code=404, detail="Route commission not found")
    
    commission.is_active = False
    db.commit()
    return None


# ========== Внутренние компании ==========
class InternalCompanyCreate(BaseModel):
    name: str
    contact_info: Optional[str] = None
    notes: Optional[str] = None

class InternalCompanyUpdate(BaseModel):
    name: Optional[str] = None
    contact_info: Optional[str] = None
    notes: Optional[str] = None

class InternalCompanyResponse(BaseModel):
    id: int
    name: str
    contact_info: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

@router.get("/internal-companies", response_model=List[InternalCompanyResponse])
def get_internal_companies(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.companies.read"))
):
    """Получить список внутренних компаний"""
    companies = db.query(InternalCompany).all()
    return companies

@router.get("/internal-companies/{company_id}", response_model=InternalCompanyResponse)
def get_internal_company(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.companies.read"))
):
    """Получить внутреннюю компанию по ID"""
    company = db.query(InternalCompany).filter(InternalCompany.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Internal company not found")
    return company

@router.post("/internal-companies", response_model=InternalCompanyResponse, status_code=status.HTTP_201_CREATED)
def create_internal_company(
    company_data: InternalCompanyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.companies.write"))
):
    """Создать внутреннюю компанию"""
    db_company = InternalCompany(
        name=company_data.name,
        contact_info=company_data.contact_info,
        notes=company_data.notes,
        created_by=current_user.id
    )
    db.add(db_company)
    db.commit()
    db.refresh(db_company)
    return db_company

@router.put("/internal-companies/{company_id}", response_model=InternalCompanyResponse)
def update_internal_company(
    company_id: int,
    company_update: InternalCompanyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.companies.write"))
):
    """Обновить внутреннюю компанию"""
    company = db.query(InternalCompany).filter(InternalCompany.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Internal company not found")
    
    for field, value in company_update.model_dump(exclude_unset=True).items():
        setattr(company, field, value)
    
    db.commit()
    db.refresh(company)
    return company

@router.delete("/internal-companies/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_internal_company(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.companies.write"))
):
    """Удалить внутреннюю компанию"""
    company = db.query(InternalCompany).filter(InternalCompany.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Internal company not found")
    
    db.delete(company)
    db.commit()
    return None


# ========== Счета внутренних компаний ==========
class InternalCompanyAccountCreate(BaseModel):
    company_id: int
    account_name: str
    account_number: str
    currency: str
    balance: Decimal = 0

class InternalCompanyAccountUpdate(BaseModel):
    account_name: Optional[str] = None
    account_number: Optional[str] = None
    currency: Optional[str] = None
    balance: Optional[Decimal] = None
    is_active: Optional[bool] = None

class InternalCompanyAccountResponse(BaseModel):
    id: int
    company_id: int
    account_name: str
    account_number: str
    currency: str
    balance: Decimal
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

@router.get("/internal-company-accounts", response_model=List[InternalCompanyAccountResponse])
def get_internal_company_accounts(
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.accounts.read"))
):
    """Получить список счетов внутренних компаний"""
    query = db.query(InternalCompanyAccount).filter(InternalCompanyAccount.is_active == True)
    if company_id:
        query = query.filter(InternalCompanyAccount.company_id == company_id)
    accounts = query.all()
    return accounts

@router.post("/internal-company-accounts", response_model=InternalCompanyAccountResponse, status_code=status.HTTP_201_CREATED)
def create_internal_company_account(
    account_data: InternalCompanyAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.accounts.write"))
):
    """Создать счет внутренней компании"""
    company = db.query(InternalCompany).filter(InternalCompany.id == account_data.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Internal company not found")
    
    db_account = InternalCompanyAccount(
        company_id=account_data.company_id,
        account_name=account_data.account_name,
        account_number=account_data.account_number,
        currency=account_data.currency,
        balance=account_data.balance,
        is_active=True
    )
    db.add(db_account)
    db.commit()
    db.refresh(db_account)
    return db_account

@router.put("/internal-company-accounts/{account_id}", response_model=InternalCompanyAccountResponse)
def update_internal_company_account(
    account_id: int,
    account_update: InternalCompanyAccountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.accounts.write"))
):
    """Обновить счет внутренней компании"""
    account = db.query(InternalCompanyAccount).filter(InternalCompanyAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Internal company account not found")
    
    for field, value in account_update.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    
    db.commit()
    db.refresh(account)
    return account

@router.delete("/internal-company-accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_internal_company_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.accounts.write"))
):
    """Удалить счет внутренней компании (мягкое удаление)"""
    account = db.query(InternalCompanyAccount).filter(InternalCompanyAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Internal company account not found")
    
    account.is_active = False
    db.commit()
    return None


class CompanyAccountHistoryResponse(BaseModel):
    id: int
    account_id: int
    previous_balance: float
    new_balance: float
    change_amount: float
    change_type: str
    transaction_id: Optional[int] = None
    deal_id: Optional[int] = None
    comment: Optional[str] = None
    changed_by: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


@router.get("/internal-company-accounts/{account_id}/history", response_model=List[CompanyAccountHistoryResponse])
def get_company_account_history(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получить историю изменений баланса фиатного счёта компании"""
    from app.models.internal_company_account_history import InternalCompanyAccountHistory
    
    account = db.query(InternalCompanyAccount).filter(InternalCompanyAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Internal company account not found")
    
    history = db.query(InternalCompanyAccountHistory).filter(
        InternalCompanyAccountHistory.account_id == account_id
    ).order_by(InternalCompanyAccountHistory.created_at.desc()).all()
    
    return history


# ========== Валюты ==========
class CurrencyCreate(BaseModel):
    code: str
    name: str
    is_crypto: bool = False

class CurrencyUpdate(BaseModel):
    name: Optional[str] = None
    is_crypto: Optional[bool] = None
    is_active: Optional[bool] = None

class CurrencyResponse(BaseModel):
    id: int
    code: str
    name: str
    is_crypto: bool
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

@router.get("/currencies", response_model=List[CurrencyResponse])
def get_currencies(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.read"))
):
    """Получить список валют"""
    currencies = db.query(Currency).filter(Currency.is_active == True).all()
    return currencies

@router.post("/currencies", response_model=CurrencyResponse, status_code=status.HTTP_201_CREATED)
def create_currency(
    currency_data: CurrencyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.write"))
):
    """Создать валюту"""
    existing = db.query(Currency).filter(Currency.code == currency_data.code, Currency.is_active == True).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Currency with this code already exists"
        )
    
    db_currency = Currency(
        code=currency_data.code,
        name=currency_data.name,
        is_crypto=currency_data.is_crypto,
        created_by=current_user.id,
        is_active=True
    )
    db.add(db_currency)
    db.commit()
    db.refresh(db_currency)
    return db_currency

@router.put("/currencies/{currency_id}", response_model=CurrencyResponse)
def update_currency(
    currency_id: int,
    currency_update: CurrencyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.write"))
):
    """Обновить валюту"""
    currency = db.query(Currency).filter(Currency.id == currency_id).first()
    if not currency:
        raise HTTPException(status_code=404, detail="Currency not found")
    
    for field, value in currency_update.model_dump(exclude_unset=True).items():
        setattr(currency, field, value)
    
    db.commit()
    db.refresh(currency)
    return currency

@router.delete("/currencies/{currency_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_currency(
    currency_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.write"))
):
    """Удалить валюту (мягкое удаление)"""
    currency = db.query(Currency).filter(Currency.id == currency_id).first()
    if not currency:
        raise HTTPException(status_code=404, detail="Currency not found")
    
    currency.is_active = False
    db.commit()
    return None


# ========== Комиссии менеджеров ==========
from app.models.manager_commission import ManagerCommission

class ManagerCommissionResponse(BaseModel):
    id: int
    user_id: int
    user_email: str
    user_name: Optional[str] = None
    user_role: str
    commission_percent: Decimal
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ManagerCommissionUpdate(BaseModel):
    commission_percent: Decimal


@router.get("/manager-commissions", response_model=List[ManagerCommissionResponse])
def get_manager_commissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.read"))
):
    """Получить список комиссий менеджеров (с информацией о пользователях)"""
    from app.models.user import User as UserModel
    
    # Получаем всех пользователей
    users = db.query(UserModel).filter(UserModel.is_active == "true").all()
    
    result = []
    for user in users:
        # Ищем комиссию для пользователя
        commission = db.query(ManagerCommission).filter(
            ManagerCommission.user_id == user.id
        ).first()
        
        result.append(ManagerCommissionResponse(
            id=commission.id if commission else 0,
            user_id=user.id,
            user_email=user.email,
            user_name=user.full_name,
            user_role=user.role,
            commission_percent=commission.commission_percent if commission else Decimal("0"),
            is_active=commission.is_active if commission else True,
            created_at=commission.created_at if commission else None,
            updated_at=commission.updated_at if commission else None
        ))
    
    return result


@router.put("/manager-commissions/{user_id}", response_model=ManagerCommissionResponse)
def update_manager_commission(
    user_id: int,
    commission_update: ManagerCommissionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.write"))
):
    """Установить/обновить комиссию менеджера"""
    from app.models.user import User as UserModel
    
    # Проверяем, что пользователь существует
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Ищем существующую запись
    commission = db.query(ManagerCommission).filter(
        ManagerCommission.user_id == user_id
    ).first()
    
    if commission:
        commission.commission_percent = commission_update.commission_percent
    else:
        commission = ManagerCommission(
            user_id=user_id,
            commission_percent=commission_update.commission_percent,
            is_active=True
        )
        db.add(commission)
    
    db.commit()
    db.refresh(commission)
    
    return ManagerCommissionResponse(
        id=commission.id,
        user_id=user.id,
        user_email=user.email,
        user_name=user.full_name,
        user_role=user.role,
        commission_percent=commission.commission_percent,
        is_active=commission.is_active,
        created_at=commission.created_at,
        updated_at=commission.updated_at
    )


# ========== Системные настройки ==========
from app.models.system_settings import SystemSetting

class SystemSettingResponse(BaseModel):
    id: int
    key: str
    value: Optional[str] = None
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SystemSettingUpdate(BaseModel):
    value: str


@router.get("/settings", response_model=List[SystemSettingResponse])
def get_system_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.read"))
):
    """Получить все системные настройки"""
    settings = db.query(SystemSetting).all()
    return settings


@router.get("/settings/{key}", response_model=SystemSettingResponse)
def get_system_setting(
    key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.read"))
):
    """Получить системную настройку по ключу"""
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    return setting


@router.put("/settings/{key}", response_model=SystemSettingResponse)
def update_system_setting(
    key: str,
    setting_update: SystemSettingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("references.clients.write"))
):
    """Обновить или создать системную настройку"""
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    
    if setting:
        setting.value = setting_update.value
    else:
        # Создаём новую настройку
        setting = SystemSetting(
            key=key,
            value=setting_update.value
        )
        db.add(setting)
    
    db.commit()
    db.refresh(setting)
    return setting


@router.get("/default-client-rate")
def get_default_client_rate(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получить ставку клиента по умолчанию"""
    setting = db.query(SystemSetting).filter(SystemSetting.key == "default_client_rate").first()
    return {"default_client_rate": setting.value if setting else "2.0"}

