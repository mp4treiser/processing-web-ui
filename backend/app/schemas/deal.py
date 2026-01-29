from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
from typing import List, Optional
from app.models.deal import DealStatus
from app.schemas.transaction import TransactionResponse


class DealBase(BaseModel):
    client_id: int
    total_eur_request: Decimal
    client_rate_percent: Decimal = Decimal("1.0")
    # Новые поля для валют
    deal_amount: Decimal | None = None
    client_sends_currency: str | None = None
    client_receives_currency: str | None = None


class DealCreate(DealBase):
    transactions: List[dict]  # Список транзакций для создания
    copy_from_deal_id: int | None = None  # ID сделки для копирования (если копируем)


class DealUpdate(BaseModel):
    total_usdt_calculated: Decimal | None = None
    effective_rate: Decimal | None = None
    total_cost_usdt: Decimal | None = None
    gross_margin_usdt: Decimal | None = None
    net_profit_usdt: Decimal | None = None
    partner_share_usdt: Decimal | None = None
    status: str | None = None  # Теперь строка, а не enum
    director_comment: str | None = None
    client_rate_percent: Decimal | None = None  # Ставка клиента


class DealHistoryResponse(BaseModel):
    """Ответ для истории изменений сделки"""
    id: int
    deal_id: int
    user_id: int
    user_email: str | None = None
    user_name: str | None = None
    user_role: str | None = None
    action: str
    changes: dict | None = None
    comment: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class DealResponse(DealBase):
    id: int
    manager_id: int
    status: str  # Теперь строка, а не enum (хранится как "senior_manager_approved" и т.д.)
    total_usdt_calculated: Decimal | None = None
    effective_rate: Decimal | None = None
    total_cost_usdt: Decimal | None = None
    gross_margin_usdt: Decimal | None = None
    net_profit_usdt: Decimal | None = None
    partner_share_usdt: Decimal | None = None
    director_comment: str | None = None
    approved_at: datetime | None = None
    approved_by: int | None = None
    # Новые поля для главного менеджера и задолженностей
    senior_manager_id: int | None = None
    senior_manager_comment: str | None = None
    approved_by_senior_manager_at: datetime | None = None
    client_debt_amount: Decimal | None = None
    client_paid_amount: Decimal | None = None
    is_client_debt: bool = False
    client_payment_confirmed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    transactions: List[TransactionResponse] = []
    # Кто создал сделку
    created_by_id: int | None = None
    created_by_email: str | None = None
    created_by_name: str | None = None
    # Менеджер
    manager_email: str | None = None
    manager_name: str | None = None
    # История изменений (опционально, для детального просмотра)
    history: List[DealHistoryResponse] | None = None

    class Config:
        from_attributes = True


class DealListResponse(BaseModel):
    id: int
    client_id: int
    client_name: str | None = None
    total_eur_request: Decimal
    total_usdt_calculated: Decimal | None = None
    status: str  # Теперь строка, а не enum
    created_at: datetime
    progress: dict | None = None  # {"paid": 2, "total": 4}
    transactions_count: int | None = None
    paid_transactions_count: int | None = None
    client_debt_amount: Decimal | None = None
    client_paid_amount: Decimal | None = None  # Добавлено для отображения оплаченной суммы

    class Config:
        from_attributes = True


class DealIncomeResponse(BaseModel):
    """Расчёт дохода и прибыли по сделке"""
    # Клиент отправляет и затраты
    client_should_send: Decimal  # Клиент отправляет (в валюте отправки)
    deal_costs: Decimal  # Затраты на сделку = сумма Route Income
    # Доход и маржа
    income_amount: Decimal  # Доход в сумме
    income_percent: Decimal  # Доход в %
    is_profitable: bool  # Положительный ли доход
    # Комиссия менеджера
    manager_commission_percent: Decimal  # % комиссии менеджера
    manager_commission_amount: Decimal  # Комиссия менеджера в твёрдом эквиваленте
    # Чистая прибыль = доход - комиссия менеджера
    net_profit: Decimal
    # Валюта расчёта
    currency: str

