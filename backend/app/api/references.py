from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.core.permissions import require_permission
from app.models.user import User
from app.models.client import Client
from app.models.company import Company
from app.models.company_account import CompanyAccount
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

