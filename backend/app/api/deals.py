from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List
from decimal import Decimal
from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.core.permissions import require_permission
from app.core.deal_history_localization import (
    format_client_rate_history,
    DealHistoryActionRU,
    capitalize_role
)
from app.models.user import User, UserRole
from app.models.deal import Deal, DealStatus
from app.models.transaction import Transaction, TransactionStatus
from app.models.deal_history import DealHistory, DealHistoryAction
from app.models.manager_commission import ManagerCommission
from app.schemas.deal import DealCreate, DealResponse, DealUpdate, DealListResponse, DealHistoryResponse, DealIncomeResponse
from app.schemas.transaction import TransactionCreate

router = APIRouter(prefix="/deals", tags=["deals"])


def add_deal_history(
    db: Session,
    deal_id: int,
    user_id: int,
    action: str,
    changes: dict = None,
    comment: str = None,
    user: User = None
):
    """Добавить запись в историю сделки с информацией о пользователе"""
    # Если пользователь не передан, загружаем его из БД
    if user is None:
        user = db.query(User).filter(User.id == user_id).first()
    
    history = DealHistory(
        deal_id=deal_id,
        user_id=user_id,
        user_email=user.email if user else None,
        user_name=user.full_name if user else None,
        user_role=user.role if user else None,
        action=action,
        changes=changes,
        comment=comment
    )
    db.add(history)
    return history


def calculate_deal_income(deal: Deal, db: Session) -> dict:
    """Рассчитать доход и прибыль по сделке
    
    Формулы:
    - Клиент отправляет = Σ(сумма_для_клиента × курс) × (1 + Ставка_клиента%)
    - Затраты на сделку = Σ Route Income
    - Доход = Клиент отправляет − Затраты на сделку
    - Комиссия менеджера = Доход × %комиссии
    - Чистая прибыль = Доход − Комиссия менеджера
    """
    # Считаем суммы по транзакциям
    total_route_income = Decimal("0")  # Затраты на сделку (сумма Route Income)
    total_amount_times_rate = Decimal("0")  # Σ(сумма_для_клиента × курс)
    
    for trans in deal.transactions:
        # Route Income (затраты)
        if trans.calculated_route_income:
            total_route_income += Decimal(str(trans.calculated_route_income))
        
        # Сумма для клиента × курс
        amount_for_client = Decimal(str(trans.amount_from_account or trans.amount_eur or 0))
        exchange_rate = Decimal(str(trans.exchange_rate or 1))
        total_amount_times_rate += amount_for_client * exchange_rate
    
    # Ставка клиента
    client_rate = Decimal(str(deal.client_rate_percent or 0))
    
    # Клиент отправляет = Σ(сумма × курс) × (1 + ставка%)
    client_should_send = total_amount_times_rate * (1 + client_rate / 100)
    
    # Затраты на сделку = Σ Route Income
    deal_costs = total_route_income
    
    # Доход = Клиент отправляет − Затраты на сделку
    income_amount = client_should_send - deal_costs
    
    # Доход в процентах от затрат
    income_percent = Decimal("0")
    if deal_costs > 0:
        income_percent = (income_amount / deal_costs) * 100
    
    is_profitable = income_amount >= 0
    
    # Получаем комиссию менеджера
    manager_commission = db.query(ManagerCommission).filter(
        ManagerCommission.user_id == deal.manager_id,
        ManagerCommission.is_active == True
    ).first()
    
    manager_commission_percent = Decimal(str(manager_commission.commission_percent)) if manager_commission else Decimal("0")
    
    # Комиссия менеджера = Доход × %комиссии (только если прибыльно)
    manager_commission_amount = income_amount * (manager_commission_percent / 100) if is_profitable else Decimal("0")
    
    # Чистая прибыль = Доход − Комиссия менеджера
    net_profit = income_amount - manager_commission_amount
    
    return {
        "client_should_send": float(round(client_should_send, 2)),  # Клиент отправляет
        "deal_costs": float(round(deal_costs, 2)),  # Затраты на сделку (Route Income)
        "income_amount": float(round(income_amount, 2)),  # Доход
        "income_percent": float(round(income_percent, 2)),  # Доход в %
        "is_profitable": is_profitable,
        "manager_commission_percent": float(round(manager_commission_percent, 2)),
        "manager_commission_amount": float(round(manager_commission_amount, 2)),
        "net_profit": float(round(net_profit, 2)),
        "currency": deal.client_sends_currency or "USDT"
    }


@router.post("", response_model=DealResponse, status_code=status.HTTP_201_CREATED)
def create_deal(
    deal_data: DealCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.create"))
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
        created_by_id=current_user.id,  # Кто создал
        total_eur_request=deal_data.total_eur_request,
        client_rate_percent=deal_data.client_rate_percent,
        status=DealStatus.NEW.value
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
    
    # Добавляем запись в историю: Создано
    add_deal_history(
        db, db_deal.id, current_user.id,
        DealHistoryActionRU.CREATED.value,
        user=current_user
    )
    
    db.commit()
    db.refresh(db_deal)
    return db_deal


@router.get("", response_model=List[DealListResponse])
def get_deals(
    status_filter: str | None = Query(None, description="Filter by deal status"),
    client_id: int | None = Query(None, description="Filter by client ID"),
    company_name: str | None = Query(None, description="Filter by company name (searches in transaction target_company)"),
    account_number: str | None = Query(None, description="Filter by account number/IBAN (searches in transaction recipient_details)"),
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получить список заявок (с фильтрацией по роли).

    Важно для бухгалтера:
    - без status_filter он видит все сделки со всеми статусами,
      и уже на фронтенде может фильтровать/сортировать по статусу, дате и сумме.
    """
    query = db.query(Deal)
    
    # Row Level Security: Менеджер видит только свои сделки
    if current_user.role == UserRole.MANAGER:
        query = query.filter(Deal.manager_id == current_user.id)
    
    # Применяем фильтр по статусу (если передан)
    if status_filter:
        # Проверяем, что статус валидный
        try:
            # Пытаемся найти статус в enum
            status_enum = DealStatus(status_filter)
            status_value = status_enum.value
        except ValueError:
            # Если не найден в enum, используем строку как есть (для обратной совместимости)
            status_value = status_filter
        
        query = query.filter(Deal.status == status_value)
    
    # Фильтр по клиенту
    if client_id:
        query = query.filter(Deal.client_id == client_id)
    
    # Фильтр по компании (через транзакции)
    if company_name:
        # Находим сделки, у которых есть транзакции с указанной компанией
        deals_with_company_ids = db.query(Transaction.deal_id).filter(
            Transaction.target_company.ilike(f"%{company_name}%")
        ).distinct().all()
        deal_ids = [row[0] for row in deals_with_company_ids]
        if deal_ids:
            query = query.filter(Deal.id.in_(deal_ids))
        else:
            # Если нет сделок с такой компанией, возвращаем пустой результат
            query = query.filter(Deal.id == -1)  # Невозможный ID
    
    # Фильтр по счету/IBAN (через транзакции)
    if account_number:
        # Находим сделки, у которых есть транзакции с указанным IBAN/счетом
        deals_with_account_ids = db.query(Transaction.deal_id).filter(
            Transaction.recipient_details.ilike(f"%{account_number}%")
        ).distinct().all()
        deal_ids = [row[0] for row in deals_with_account_ids]
        if deal_ids:
            query = query.filter(Deal.id.in_(deal_ids))
        else:
            # Если нет сделок с таким счетом, возвращаем пустой результат
            query = query.filter(Deal.id == -1)  # Невозможный ID

    # Пагинация и сортировка: последние сделки первыми
    query = query.order_by(Deal.created_at.desc()).limit(limit).offset(offset)
    deals = query.all()
    
    # Формируем ответ с прогрессом
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
            progress={"paid": paid_count, "total": len(transactions)} if transactions else None,
            transactions_count=len(transactions),
            paid_transactions_count=paid_count,
            client_debt_amount=deal.client_debt_amount,
            client_paid_amount=deal.client_paid_amount
        ))
    
    return result


@router.get("/{deal_id}", response_model=DealResponse)
def get_deal(
    deal_id: int,
    include_history: bool = Query(False, description="Включать ли историю изменений"),
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
    
    # Формируем ответ с дополнительными данными
    response = DealResponse.model_validate(deal)
    
    # Добавляем информацию о создателе
    if deal.created_by_id:
        created_by = db.query(User).filter(User.id == deal.created_by_id).first()
        if created_by:
            response.created_by_email = created_by.email
            response.created_by_name = created_by.full_name
    
    # Добавляем информацию о менеджере
    if deal.manager_id:
        manager = db.query(User).filter(User.id == deal.manager_id).first()
        if manager:
            response.manager_email = manager.email
            response.manager_name = manager.full_name
    
    # Добавляем историю, если запрошена
    if include_history:
        history_records = db.query(DealHistory).filter(
            DealHistory.deal_id == deal_id
        ).order_by(DealHistory.created_at.desc()).all()
        
        history_list = []
        for h in history_records:
            # Используем денормализованные данные или загружаем из БД
            user_email = h.user_email
            user_name = h.user_name
            user_role = h.user_role
            
            if not user_name or not user_email or not user_role:
                user = db.query(User).filter(User.id == h.user_id).first()
                if user:
                    user_email = user_email or user.email
                    user_name = user_name or user.full_name
                    user_role = user_role or user.role
            
            history_list.append(DealHistoryResponse(
                id=h.id,
                deal_id=h.deal_id,
                user_id=h.user_id,
                user_email=user_email,
                user_name=user_name,
                user_role=user_role,
                action=h.action,
                changes=h.changes,
                comment=h.comment,
                created_at=h.created_at
            ))
        response.history = history_list
    
    return response


@router.get("/{deal_id}/history", response_model=List[DealHistoryResponse])
def get_deal_history(
    deal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получить историю изменений сделки"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    # Проверка прав доступа
    if current_user.role == UserRole.MANAGER and deal.manager_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    history_records = db.query(DealHistory).filter(
        DealHistory.deal_id == deal_id
    ).order_by(DealHistory.created_at.desc()).all()
    
    result = []
    for h in history_records:
        # Используем денормализованные данные или загружаем из БД
        user_email = h.user_email
        user_name = h.user_name
        user_role = h.user_role
        
        if not user_name or not user_email or not user_role:
            user = db.query(User).filter(User.id == h.user_id).first()
            if user:
                user_email = user_email or user.email
                user_name = user_name or user.full_name
                user_role = user_role or user.role
        
        result.append(DealHistoryResponse(
            id=h.id,
            deal_id=h.deal_id,
            user_id=h.user_id,
            user_email=user_email,
            user_name=user_name,
            user_role=user_role,
            action=h.action,
            changes=h.changes,
            comment=h.comment,
            created_at=h.created_at
        ))
    
    return result


@router.get("/{deal_id}/income", response_model=DealIncomeResponse)
def get_deal_income(
    deal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получить расчёт дохода и прибыли по сделке"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    # Проверка прав доступа
    if current_user.role == UserRole.MANAGER and deal.manager_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    income_data = calculate_deal_income(deal, db)
    return DealIncomeResponse(**income_data)


@router.patch("/{deal_id}/client-rate")
def update_client_rate(
    deal_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Обновить ставку клиента с пересчётом всех значений"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    # Проверка прав: бухгалтер или главный менеджер
    allowed_roles = [UserRole.ACCOUNTANT, UserRole.SENIOR_MANAGER, UserRole.DIRECTOR]
    if current_user.role not in [r.value for r in allowed_roles] and current_user.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="Not enough permissions to edit client rate")
    
    new_rate = Decimal(str(data.get("client_rate_percent", deal.client_rate_percent)))
    old_rate = deal.client_rate_percent
    
    # Пропускаем запись в историю если значение не изменилось
    if old_rate != new_rate:
        # Получаем старые и новые значения дохода для истории
        old_income = calculate_deal_income(deal, db)
        
        # Обновляем ставку
        deal.client_rate_percent = new_rate
        
        # Пересчитываем доход с новой ставкой
        new_income = calculate_deal_income(deal, db)
        
        # Форматируем историю на русском
        history_comment = format_client_rate_history(
            old_rate=old_rate,
            new_rate=new_rate,
            old_sends=Decimal(str(old_income["client_should_send"])),
            new_sends=Decimal(str(new_income["client_should_send"])),
            old_revenue=Decimal(str(old_income["income_amount"])),
            new_revenue=Decimal(str(new_income["income_amount"])),
            old_commission=Decimal(str(old_income["manager_commission_amount"])),
            new_commission=Decimal(str(new_income["manager_commission_amount"])),
            old_profit=Decimal(str(old_income["net_profit"])),
            new_profit=Decimal(str(new_income["net_profit"])),
            currency=old_income.get("currency", "USDT")
        )
        
        # Добавляем в историю с форматированным комментарием
        add_deal_history(
            db,
            deal_id,
            current_user.id,
            DealHistoryActionRU.CLIENT_RATE_CHANGED.value,
            comment=history_comment,
            user=current_user
        )
    
    db.commit()
    db.refresh(deal)
    
    # Возвращаем обновлённые данные дохода
    income_data = calculate_deal_income(deal, db)
    return {
        "deal_id": deal.id,
        "client_rate_percent": str(deal.client_rate_percent),
        "total_usdt_calculated": str(deal.total_usdt_calculated) if deal.total_usdt_calculated else None,
        "income": income_data
    }


@router.get("/{deal_id}/copy-data")
def get_deal_copy_data(
    deal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получить данные сделки для копирования"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    # Группируем транзакции по client_company_id
    transactions_grouped = {}
    for trans in deal.transactions:
        key = trans.client_company_id or 0
        if key not in transactions_grouped:
            transactions_grouped[key] = {
                "client_company_id": trans.client_company_id,
                "routes": []
            }
        
        route_data = {
            "route_type": trans.route_type,
            "exchange_rate": float(trans.exchange_rate) if trans.exchange_rate else None,
            "amount_from_account": float(trans.amount_from_account) if trans.amount_from_account else None,
            # Direct
            "internal_company_id": trans.internal_company_id,
            "internal_company_account_id": trans.internal_company_account_id,
            "bank_commission_id": trans.bank_commission_id,
            # Exchange
            "crypto_account_id": trans.crypto_account_id,
            "exchange_from_currency": trans.exchange_from_currency,
            "crypto_exchange_rate": float(trans.crypto_exchange_rate) if trans.crypto_exchange_rate else None,
            "agent_commission_id": trans.agent_commission_id,
            "exchange_commission_id": trans.exchange_commission_id,
            "exchange_bank_commission_id": trans.exchange_bank_commission_id,
            # Partner
            "partner_company_id": trans.partner_company_id,
            "partner_commission_id": trans.partner_commission_id,
            # Partner 50-50
            "partner_50_50_company_id": trans.partner_50_50_company_id,
            "partner_50_50_commission_id": trans.partner_50_50_commission_id,
        }
        transactions_grouped[key]["routes"].append(route_data)
    
    return {
        "client_id": deal.client_id,
        "client_sends_currency": deal.client_sends_currency,
        "client_receives_currency": deal.client_receives_currency,
        "transactions": list(transactions_grouped.values())
    }


@router.put("/{deal_id}", response_model=DealResponse)
def update_deal(
    deal_id: int,
    deal_update: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.update"))
):
    """Полное обновление сделки с транзакциями (Бухгалтер)"""
    from decimal import Decimal
    from app.services.deal_calculator import DealCalculator
    from app.core.deal_history_localization import (
        FieldNameRU,
        DealHistoryActionRU,
        format_consolidated_deal_edit,
        format_consolidated_deal_edit_text
    )
    
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    # Проверяем, что сделка в статусе execution
    if deal.status != DealStatus.EXECUTION.value:
        raise HTTPException(status_code=400, detail="Deal can only be edited in execution status")
    
    # Сохраняем старые значения для отслеживания изменений
    old_client_rate = deal.client_rate_percent
    old_income = calculate_deal_income(deal, db)
    
    # Список для сбора всех изменений маршрутов (для консолидированной истории)
    all_route_changes = []
    new_routes_added = []
    deleted_routes = []
    
    # Обновляем основные поля сделки
    if "client_id" in deal_update:
        deal.client_id = deal_update["client_id"]
    if "deal_amount" in deal_update:
        deal.deal_amount = Decimal(str(deal_update["deal_amount"]))
        deal.total_eur_request = deal.deal_amount
    if "client_sends_currency" in deal_update:
        deal.client_sends_currency = deal_update["client_sends_currency"]
    if "client_receives_currency" in deal_update:
        deal.client_receives_currency = deal_update["client_receives_currency"]
    
    # Обновляем ставку клиента если передана
    new_client_rate = deal.client_rate_percent
    if "client_rate_percent" in deal_update:
        new_client_rate = Decimal(str(deal_update["client_rate_percent"]))
        deal.client_rate_percent = new_client_rate
    
    # Удаляем указанные транзакции (собираем инфо для истории)
    deleted_ids = deal_update.get("deleted_transaction_ids", [])
    if deleted_ids:
        for trans_id in deleted_ids:
            trans = db.query(Transaction).filter(
                Transaction.id == trans_id,
                Transaction.deal_id == deal_id
            ).first()
            if trans and trans.status != TransactionStatus.PAID:
                route_type = trans.route_type or "unknown"
                deleted_routes.append(route_type)
                db.delete(trans)
        db.flush()
    
    # Обрабатываем транзакции
    transactions_data = deal_update.get("transactions", [])
    calculator = DealCalculator(db)
    total_client_should_send = Decimal("0")
    
    for trans_data in transactions_data:
        routes = trans_data.get("routes", [])
        trans_totals = calculator.calculate_transaction_totals(routes)
        
        for route in routes:
            route_calc = calculator.calculate_route_income(route)
            db_id = route.get("db_id")
            
            if db_id:
                # Обновляем существующую транзакцию - собираем изменения
                db_trans = db.query(Transaction).filter(
                    Transaction.id == db_id,
                    Transaction.deal_id == deal_id
                ).first()
                
                if db_trans and db_trans.status != TransactionStatus.PAID:
                    # Сохраняем старые значения для сравнения
                    changes_dict = {}
                    
                    # Вспомогательная функция для отслеживания изменений
                    def track_change(field_name, old_val, new_val):
                        # Convert to comparable format
                        old_str = str(old_val) if old_val is not None else None
                        new_str = str(new_val) if new_val is not None else None
                        
                        # Handle decimal comparison
                        try:
                            if old_val is not None and new_val is not None:
                                old_dec = Decimal(str(old_val))
                                new_dec = Decimal(str(new_val))
                                if old_dec == new_dec:
                                    return
                        except:
                            pass
                        
                        if old_str != new_str and new_val is not None:
                            changes_dict[field_name] = {
                                "old": old_str if old_str is not None else "—",
                                "new": new_str
                            }
                    
                    # Отслеживаем изменения
                    route_type = route.get("route_type") or db_trans.route_type
                    
                    # General fields
                    track_change("exchange_rate", db_trans.exchange_rate, route.get("exchange_rate"))
                    
                    # Direct Transfer fields
                    if route_type == "direct":
                        track_change("amount_from_account", db_trans.amount_from_account, route.get("amount_from_account"))
                        track_change("internal_company_id", db_trans.internal_company_id, route.get("internal_company_id"))
                        track_change("internal_company_account_id", db_trans.internal_company_account_id, route.get("internal_company_account_id"))
                        track_change("bank_commission_id", db_trans.bank_commission_id, route.get("bank_commission_id"))
                    
                    # Exchange fields
                    if route_type == "exchange":
                        track_change("amount_from_account", db_trans.amount_from_account, route.get("amount_from_account"))
                        track_change("crypto_account_id", db_trans.crypto_account_id, route.get("crypto_account_id"))
                        track_change("exchange_from_currency", db_trans.exchange_from_currency, route.get("exchange_from_currency"))
                        track_change("exchange_amount", db_trans.exchange_amount, route.get("exchange_amount"))
                        track_change("crypto_exchange_rate", db_trans.crypto_exchange_rate, route.get("crypto_exchange_rate"))
                        track_change("agent_commission_id", db_trans.agent_commission_id, route.get("agent_commission_id"))
                        track_change("exchange_commission_id", db_trans.exchange_commission_id, route.get("exchange_commission_id"))
                        track_change("exchange_bank_commission_id", db_trans.exchange_bank_commission_id, route.get("exchange_bank_commission_id"))
                    
                    # Partner fields
                    if route_type == "partner":
                        track_change("amount_from_account", db_trans.amount_from_account, route.get("amount_from_account"))
                        track_change("partner_company_id", db_trans.partner_company_id, route.get("partner_company_id"))
                        track_change("partner_commission_id", db_trans.partner_commission_id, route.get("partner_commission_id"))
                    
                    # Partner 50-50 fields
                    if route_type == "partner_50_50":
                        track_change("amount_from_account", db_trans.amount_from_account, route.get("amount_from_account"))
                        track_change("partner_50_50_company_id", db_trans.partner_50_50_company_id, route.get("partner_50_50_company_id"))
                        track_change("partner_50_50_commission_id", db_trans.partner_50_50_commission_id, route.get("partner_50_50_commission_id"))
                    
                    # Применяем изменения
                    db_trans.route_type = route.get("route_type")
                    db_trans.exchange_rate = Decimal(str(route.get("exchange_rate", 0))) if route.get("exchange_rate") else None
                    db_trans.client_company_id = trans_data.get("client_company_id")
                    db_trans.amount_for_client = Decimal(str(route.get("amount_from_account", 0))) if route.get("amount_from_account") else None
                    # Direct
                    db_trans.internal_company_id = route.get("internal_company_id")
                    db_trans.internal_company_account_id = route.get("internal_company_account_id")
                    db_trans.amount_from_account = Decimal(str(route.get("amount_from_account", 0))) if route.get("amount_from_account") else None
                    db_trans.bank_commission_id = route.get("bank_commission_id")
                    # Exchange
                    db_trans.crypto_account_id = route.get("crypto_account_id")
                    db_trans.exchange_from_currency = route.get("exchange_from_currency")
                    db_trans.exchange_amount = Decimal(str(route.get("exchange_amount", 0))) if route.get("exchange_amount") else None
                    db_trans.crypto_exchange_rate = Decimal(str(route.get("crypto_exchange_rate", 0))) if route.get("crypto_exchange_rate") else None
                    db_trans.agent_commission_id = route.get("agent_commission_id")
                    db_trans.exchange_commission_id = route.get("exchange_commission_id")
                    db_trans.exchange_bank_commission_id = route.get("exchange_bank_commission_id")
                    # Partner
                    db_trans.partner_company_id = route.get("partner_company_id")
                    db_trans.amount_to_partner_usdt = route_calc.get("amount_to_partner_usdt")
                    db_trans.amount_partner_sends = route_calc.get("amount_partner_sends")
                    db_trans.partner_commission_id = route.get("partner_commission_id")
                    # Partner 50-50
                    db_trans.partner_50_50_company_id = route.get("partner_50_50_company_id")
                    db_trans.amount_to_partner_50_50_usdt = route_calc.get("amount_to_partner_50_50_usdt")
                    db_trans.amount_partner_50_50_sends = route_calc.get("amount_partner_50_50_sends")
                    db_trans.partner_50_50_commission_id = route.get("partner_50_50_commission_id")
                    # Calculated
                    db_trans.calculated_route_income = route_calc.get("calculated_route_income")
                    db_trans.final_income = route_calc.get("calculated_route_income")
                    
                    # Если есть изменения, добавляем их в общий список
                    if changes_dict:
                        all_route_changes.append({
                            "route_type": route_type,
                            "changes": changes_dict
                        })
            else:
                # Создаём новую транзакцию
                db_trans = Transaction(
                    deal_id=deal_id,
                    route_type=route.get("route_type"),
                    exchange_rate=Decimal(str(route.get("exchange_rate", 0))) if route.get("exchange_rate") else None,
                    client_company_id=trans_data.get("client_company_id"),
                    amount_for_client=Decimal(str(route.get("amount_from_account", 0))) if route.get("amount_from_account") else None,
                    # Direct
                    internal_company_id=route.get("internal_company_id"),
                    internal_company_account_id=route.get("internal_company_account_id"),
                    amount_from_account=Decimal(str(route.get("amount_from_account", 0))) if route.get("amount_from_account") else None,
                    bank_commission_id=route.get("bank_commission_id"),
                    # Exchange
                    crypto_account_id=route.get("crypto_account_id"),
                    exchange_from_currency=route.get("exchange_from_currency"),
                    exchange_amount=Decimal(str(route.get("exchange_amount", 0))) if route.get("exchange_amount") else None,
                    crypto_exchange_rate=Decimal(str(route.get("crypto_exchange_rate", 0))) if route.get("crypto_exchange_rate") else None,
                    agent_commission_id=route.get("agent_commission_id"),
                    exchange_commission_id=route.get("exchange_commission_id"),
                    exchange_bank_commission_id=route.get("exchange_bank_commission_id"),
                    # Partner
                    partner_company_id=route.get("partner_company_id"),
                    amount_to_partner_usdt=route_calc.get("amount_to_partner_usdt"),
                    amount_partner_sends=route_calc.get("amount_partner_sends"),
                    partner_commission_id=route.get("partner_commission_id"),
                    # Partner 50-50
                    partner_50_50_company_id=route.get("partner_50_50_company_id"),
                    amount_to_partner_50_50_usdt=route_calc.get("amount_to_partner_50_50_usdt"),
                    amount_partner_50_50_sends=route_calc.get("amount_partner_50_50_sends"),
                    partner_50_50_commission_id=route.get("partner_50_50_commission_id"),
                    # Calculated
                    calculated_route_income=route_calc.get("calculated_route_income"),
                    final_income=route_calc.get("calculated_route_income"),
                    status=TransactionStatus.PENDING
                )
                db.add(db_trans)
                new_routes_added.append(route.get("route_type", "unknown"))
        
        total_client_should_send += trans_totals["final_income"]
    
    # Обновляем итоговую сумму
    deal.total_usdt_calculated = total_client_should_send
    
    # Flush to calculate new income
    db.flush()
    
    # Получаем новые значения дохода после всех изменений
    new_income = calculate_deal_income(deal, db)
    
    # Определяем, изменилась ли ставка клиента
    client_rate_changed = old_client_rate != new_client_rate
    
    # Проверяем, есть ли вообще какие-либо изменения
    has_any_changes = (
        bool(all_route_changes) or 
        bool(new_routes_added) or 
        bool(deleted_routes) or 
        client_rate_changed
    )
    
    # Создаём ОДНУ консолидированную запись в историю, только если есть изменения
    if has_any_changes:
        # Формируем структурированные данные изменений
        consolidated_data = format_consolidated_deal_edit(
            route_changes=all_route_changes,
            old_income=old_income,
            new_income=new_income,
            client_rate_changed=client_rate_changed,
            old_client_rate=old_client_rate,
            new_client_rate=new_client_rate,
            currency=old_income.get("currency", "USDT")
        )
        
        # Добавляем информацию о новых и удаленных маршрутах
        if new_routes_added:
            consolidated_data["new_routes"] = new_routes_added
        if deleted_routes:
            consolidated_data["deleted_routes"] = deleted_routes
        
        # Формируем текстовый комментарий (для совместимости и fallback)
        comment_text = format_consolidated_deal_edit_text(
            route_changes=all_route_changes,
            old_income=old_income,
            new_income=new_income,
            client_rate_changed=client_rate_changed,
            old_client_rate=old_client_rate,
            new_client_rate=new_client_rate,
            currency=old_income.get("currency", "USDT")
        )
        
        # Добавляем инфо о новых/удаленных маршрутах в текст
        extra_lines = []
        if deleted_routes:
            route_type_ru = {
                "direct": "Прямой перевод",
                "exchange": "Биржа",
                "partner": "Партнёр",
                "partner_50_50": "Партнёр 50-50",
            }
            for rt in deleted_routes:
                extra_lines.append(f"Удалён маршрут: {route_type_ru.get(rt, rt)}")
        if new_routes_added:
            route_type_ru = {
                "direct": "Прямой перевод",
                "exchange": "Биржа",
                "partner": "Партнёр",
                "partner_50_50": "Партнёр 50-50",
            }
            for rt in new_routes_added:
                extra_lines.append(f"Добавлен маршрут: {route_type_ru.get(rt, rt)}")
        
        if extra_lines:
            if comment_text:
                comment_text = "\n".join(extra_lines) + "\n\n" + comment_text
            else:
                comment_text = "\n".join(extra_lines)
        
        add_deal_history(
            db, deal_id, current_user.id,
            DealHistoryActionRU.DEAL_EDITED.value,
            changes=consolidated_data,
            comment=comment_text,
            user=current_user
        )
    
    db.commit()
    db.refresh(deal)
    return deal


@router.post("/{deal_id}/submit-for-calculation", response_model=DealResponse)
def submit_for_calculation(
    deal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.create"))
):
    """Отправить заявку на расчет (Менеджер)"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.manager_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    if deal.status != DealStatus.NEW.value:
        raise HTTPException(status_code=400, detail="Deal cannot be submitted")
    
    deal.status = DealStatus.CALCULATION_PENDING.value
    db.commit()
    db.refresh(deal)
    return deal


@router.post("/{deal_id}/client-agreed-to-pay", response_model=DealResponse)
def client_agreed_to_pay(
    deal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.confirm_payment"))
):
    """Клиент согласился перевести деньги (Менеджер)"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.manager_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    if deal.status != DealStatus.SENIOR_MANAGER_APPROVED.value:
        raise HTTPException(
            status_code=400,
            detail=f"Deal must be approved by senior manager first (current: {deal.status})"
        )
    
    from datetime import datetime
    deal.status = DealStatus.CLIENT_AGREED_TO_PAY.value
    db.commit()
    db.refresh(deal)
    return deal


@router.post("/{deal_id}/confirm-client-payment", response_model=DealResponse)
def confirm_client_payment(
    deal_id: int,
    payment_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.confirm_payment"))
):
    """Подтвердить перевод от клиента (Менеджер)"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.manager_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    if deal.status not in [DealStatus.CLIENT_AGREED_TO_PAY.value, DealStatus.AWAITING_CLIENT_PAYMENT.value]:
        raise HTTPException(
            status_code=400,
            detail=f"Deal is not in correct status for payment confirmation (current: {deal.status})"
        )
    
    from datetime import datetime
    from decimal import Decimal
    
    client_paid_amount = Decimal(str(payment_data.get("client_paid_amount", 0)))
    is_partial = payment_data.get("is_partial", False)
    
    deal.client_paid_amount = client_paid_amount
    deal.client_payment_confirmed_at = datetime.utcnow()
    
    if is_partial and client_paid_amount < deal.total_eur_request:
        # Частичная оплата - есть задолженность
        deal.client_debt_amount = deal.total_eur_request - client_paid_amount
        deal.is_client_debt = True
        deal.status = DealStatus.CLIENT_PARTIALLY_PAID.value
    else:
        # Полная оплата
        deal.client_debt_amount = Decimal("0")
        deal.is_client_debt = False
        deal.status = DealStatus.EXECUTION.value
    
    db.commit()
    db.refresh(deal)
    return deal


@router.post("/{deal_id}/pay-debt", response_model=DealResponse)
def pay_debt(
    deal_id: int,
    payment_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.deals.pay_debt"))
):
    """Погасить задолженность по сделке"""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    # Менеджер может погашать задолженность только по своим сделкам
    if current_user.role == UserRole.MANAGER and deal.manager_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    if not deal.is_client_debt or deal.client_debt_amount <= 0:
        raise HTTPException(
            status_code=400,
            detail="Deal has no debt to pay"
        )
    
    from decimal import Decimal
    payment_amount = Decimal(str(payment_data.get("payment_amount", 0)))
    
    if payment_amount <= 0:
        raise HTTPException(
            status_code=400,
            detail="Payment amount must be greater than 0"
        )
    
    # Обновляем суммы
    deal.client_paid_amount += payment_amount
    deal.client_debt_amount -= payment_amount
    
    # Если задолженность полностью погашена
    if deal.client_debt_amount <= 0:
        deal.client_debt_amount = Decimal("0")
        deal.is_client_debt = False
        # Если сделка была в статусе частичной оплаты и теперь полностью оплачена
        if deal.status == DealStatus.CLIENT_PARTIALLY_PAID.value:
            deal.status = DealStatus.EXECUTION.value
    
    db.commit()
    db.refresh(deal)
    return deal

