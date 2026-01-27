from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.core.permissions import require_permission
from app.models.user import User
from app.models.deal_template import DealTemplate

router = APIRouter(prefix="/templates", tags=["templates"])


# Schemas
class TemplateCreate(BaseModel):
    name: str
    description: str | None = None
    client_sends_currency: str | None = None
    client_receives_currency: str | None = None
    routes_config: dict


class TemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    client_sends_currency: str | None = None
    client_receives_currency: str | None = None
    routes_config: dict | None = None
    is_active: bool | None = None


class TemplateResponse(BaseModel):
    id: int
    name: str
    description: str | None = None
    client_sends_currency: str | None = None
    client_receives_currency: str | None = None
    routes_config: dict
    is_active: bool
    created_by: int | None = None

    class Config:
        from_attributes = True


@router.get("", response_model=List[TemplateResponse])
def get_templates(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получить список шаблонов"""
    query = db.query(DealTemplate)
    if active_only:
        query = query.filter(DealTemplate.is_active == True)
    return query.order_by(DealTemplate.name).all()


@router.get("/{template_id}", response_model=TemplateResponse)
def get_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получить шаблон по ID"""
    template = db.query(DealTemplate).filter(DealTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
def create_template(
    template_data: TemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.templates.create"))
):
    """Создать новый шаблон"""
    db_template = DealTemplate(
        name=template_data.name,
        description=template_data.description,
        client_sends_currency=template_data.client_sends_currency,
        client_receives_currency=template_data.client_receives_currency,
        routes_config=template_data.routes_config,
        created_by=current_user.id
    )
    db.add(db_template)
    db.commit()
    db.refresh(db_template)
    return db_template


@router.put("/{template_id}", response_model=TemplateResponse)
def update_template(
    template_id: int,
    template_data: TemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.templates.update"))
):
    """Обновить шаблон"""
    template = db.query(DealTemplate).filter(DealTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    for field, value in template_data.model_dump(exclude_unset=True).items():
        setattr(template, field, value)
    
    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.templates.delete"))
):
    """Удалить шаблон (мягкое удаление - деактивация)"""
    template = db.query(DealTemplate).filter(DealTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    template.is_active = False
    db.commit()
    return None
