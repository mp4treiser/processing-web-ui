"""Russian localization for Deal History entries"""

from enum import Enum
from typing import Dict, Any
from decimal import Decimal


class RoleDisplay(str, Enum):
    """Display names for user roles"""
    MANAGER = "Manager"
    ACCOUNTANT = "Accountant"
    SENIOR_MANAGER = "Senior Manager"
    DIRECTOR = "Director"
    ADMIN = "Admin"


class DealHistoryActionRU(str, Enum):
    """Russian names for deal history actions"""
    CREATED = "Создано"
    COPIED = "Скопировано"
    UPDATED = "Обновлено"
    STATUS_CHANGED = "Статус изменён"
    TRANSACTION_ADDED = "Транзакция добавлена"
    TRANSACTION_REMOVED = "Транзакция удалена"
    CLIENT_RATE_CHANGED = "Изменена ставка клиента"
    APPROVED = "Одобрено"
    REJECTED = "Отклонено"
    PAYMENT_CONFIRMED = "Оплата подтверждена"
    ROUTE_EDITED = "Маршрут изменён"
    ROUTE_DELETED = "Маршрут удалён"
    DEAL_EDITED = "Сделка отредактирована"


class FieldNameRU(str, Enum):
    """Russian names for deal fields"""
    CLIENT_RATE = "Ставка клиента"
    CLIENT_SENDS = "Клиент отправляет"
    CLIENT_RECEIVES = "Клиент получает"
    REVENUE = "Доход"
    DEAL_COSTS = "Затраты на сделку"
    MANAGER_COMMISSION = "Комиссия менеджера"
    NET_PROFIT = "Чистая прибыль"
    EXCHANGE_RATE = "Курс обмена"
    BANK_COMMISSION = "Комиссия банка"
    AMOUNT_FROM_ACCOUNT = "Сумма со счёта"
    INTERNAL_COMPANY = "Внутренняя компания"
    COMPANY_ACCOUNT = "Счёт компании"
    CRYPTO_ACCOUNT = "Крипто счёт"
    EXCHANGE_FROM_CURRENCY = "Валюта обмена"
    CRYPTO_EXCHANGE_RATE = "Крипто курс"
    AGENT_COMMISSION = "Комиссия агента"
    EXCHANGE_COMMISSION = "Комиссия биржи"
    PARTNER_COMPANY = "Компания партнёра"
    PARTNER_ACCOUNT = "Счёт партнёра"
    PARTNER_COMMISSION = "Комиссия партнёра"
    AMOUNT_TO_PARTNER = "Сумма партнёру (USDT)"
    AMOUNT_PARTNER_SENDS = "Партнёр отправит"


def capitalize_role(role: str) -> str:
    """Convert role to display name: 'accountant' -> 'Accountant'"""
    role_map = {
        "manager": "Manager",
        "accountant": "Accountant",
        "senior_manager": "Senior Manager",
        "director": "Director",
        "admin": "Admin",
    }
    return role_map.get(role.lower(), role)


def format_decimal(value: Any, decimals: int = 2) -> str:
    """Format decimal to string with N decimal places"""
    if value is None:
        return "—"
    try:
        d = Decimal(str(value))
        format_str = f"{{:,.{decimals}f}}"
        return format_str.format(float(d))
    except:
        return str(value)


def format_change_entry(field_ru: str, old_value: Any, new_value: Any, decimals: int = 2) -> str:
    """Format a single field change: 'Field: old → new'"""
    old_formatted = format_decimal(old_value, decimals)
    new_formatted = format_decimal(new_value, decimals)
    return f"{field_ru}: {old_formatted} → {new_formatted}"


def format_history_comment(
    action: str,
    user_name: str | None,
    user_role: str | None,
    timestamp: str,
    changes_text: str | None = None
) -> tuple[str, str]:
    """
    Format history entry for display.
    
    Returns tuple: (main_line, details_text)
    main_line: "Action – User Name – Role" with timestamp
    details_text: formatted changes or comment
    """
    role_display = capitalize_role(user_role) if user_role else "Unknown"
    user_display = f"{user_name} – {role_display}" if user_name else f"User #{user_role or 'Unknown'}"
    
    # Main line format: "Action – User Name – Role                 Timestamp"
    main_line = f"{action} – {user_display}"
    
    return main_line, changes_text or ""


def format_client_rate_history(
    old_rate: Decimal,
    new_rate: Decimal,
    old_sends: Decimal,
    new_sends: Decimal,
    old_revenue: Decimal,
    new_revenue: Decimal,
    old_commission: Decimal,
    new_commission: Decimal,
    old_profit: Decimal,
    new_profit: Decimal,
    currency: str = "USDT"
) -> str:
    """Format client rate change with all recalculated values"""
    lines = [
        f"{FieldNameRU.CLIENT_RATE.value}: {format_decimal(old_rate, 2)} → {format_decimal(new_rate, 2)}",
        f"{FieldNameRU.CLIENT_SENDS.value}: {format_decimal(old_sends, 2)} → {format_decimal(new_sends, 2)} {currency}",
        f"{FieldNameRU.REVENUE.value}: {format_decimal(old_revenue, 2)} → {format_decimal(new_revenue, 2)} {currency}",
        f"{FieldNameRU.MANAGER_COMMISSION.value}: {format_decimal(old_commission, 2)} → {format_decimal(new_commission, 2)} {currency}",
        f"{FieldNameRU.NET_PROFIT.value}: {format_decimal(old_profit, 2)} → {format_decimal(new_profit, 2)} {currency}",
    ]
    return "\n".join(lines)


def format_route_change_history(
    route_type: str,
    changes_dict: Dict[str, Dict[str, Any]],
    recalc_values: Dict[str, Decimal] | None = None,
    currency: str = "USDT"
) -> str:
    """
    Format route field changes with recalculated values.
    
    changes_dict: {"field_name": {"old": value, "new": value}, ...}
    """
    lines = [
        f"Маршрут: {route_type}"
    ]
    
    # Format individual field changes
    for field_key, values in changes_dict.items():
        field_ru = FieldNameRU[field_key.upper()].value if field_key.upper() in FieldNameRU.__members__ else field_key
        old_val = format_decimal(values.get("old"), 2)
        new_val = format_decimal(values.get("new"), 2)
        lines.append(f"{field_ru}: {old_val} → {new_val}")
    
    # Add recalculated summary
    if recalc_values:
        lines.append("")
        lines.append("Пересчитано:")
        recalc_fields = [
            ("client_sends", FieldNameRU.CLIENT_SENDS, 2),
            ("deal_costs", FieldNameRU.DEAL_COSTS, 2),
            ("revenue", FieldNameRU.REVENUE, 2),
            ("manager_commission", FieldNameRU.MANAGER_COMMISSION, 2),
            ("net_profit", FieldNameRU.NET_PROFIT, 2),
        ]
        
        for key, field_ru, decimals in recalc_fields:
            if key in recalc_values:
                value = format_decimal(recalc_values[key], decimals)
                lines.append(f"• {field_ru.value}: {value} {currency}")
    
    return "\n".join(lines)


def format_route_deletion_history(
    route_type: str,
    recalc_values: Dict[str, Decimal],
    currency: str = "USDT"
) -> str:
    """Format route deletion with final recalculated values"""
    route_type_ru = {
        "direct": "Прямой перевод",
        "exchange": "Биржа",
        "partner": "Партнёр",
        "partner_50_50": "Партнёр 50-50",
    }.get(route_type, route_type)
    
    lines = [f"Маршрут удалён: {route_type_ru}", ""]
    
    recalc_fields = [
        ("client_receives", FieldNameRU.CLIENT_RECEIVES, 2),
        ("client_sends", FieldNameRU.CLIENT_SENDS, 2),
        ("deal_costs", FieldNameRU.DEAL_COSTS, 2),
        ("revenue", FieldNameRU.REVENUE, 2),
        ("manager_commission", FieldNameRU.MANAGER_COMMISSION, 2),
        ("net_profit", FieldNameRU.NET_PROFIT, 2),
    ]
    
    for key, field_ru, decimals in recalc_fields:
        if key in recalc_values:
            value = format_decimal(recalc_values[key], decimals)
            lines.append(f"• {field_ru.value}: {value} {currency}")
    
    return "\n".join(lines)


ROUTE_TYPE_RU = {
    "direct": "Прямой перевод",
    "exchange": "Биржа",
    "partner": "Партнёр",
    "partner_50_50": "Партнёр 50-50",
}

ROUTE_TYPE_COLOR = {
    "direct": "blue",
    "exchange": "green",
    "partner": "purple",
    "partner_50_50": "yellow",
}


def format_consolidated_deal_edit(
    route_changes: list,
    old_income: Dict[str, Any],
    new_income: Dict[str, Any],
    client_rate_changed: bool = False,
    old_client_rate: Decimal = None,
    new_client_rate: Decimal = None,
    currency: str = "USDT"
) -> Dict[str, Any]:
    """
    Format a consolidated deal edit history entry as structured JSON data.
    
    route_changes: list of {
        "route_type": str,
        "changes": {"field_name": {"old": value, "new": value}, ...}
    }
    old_income/new_income: {"client_should_send": ..., "deal_costs": ..., etc.}
    
    Returns structured data for frontend rendering.
    """
    result = {
        "type": "consolidated_edit",
        "routes": [],
        "totals": {
            "has_changes": False,
            "fields": []
        }
    }
    
    # Process route changes
    for route_data in route_changes:
        route_type = route_data.get("route_type", "unknown")
        changes = route_data.get("changes", {})
        
        if not changes:
            continue
            
        route_entry = {
            "route_type": route_type,
            "route_type_ru": ROUTE_TYPE_RU.get(route_type, route_type),
            "route_color": ROUTE_TYPE_COLOR.get(route_type, "gray"),
            "fields": []
        }
        
        for field_key, values in changes.items():
            # Get Russian field name
            field_ru = field_key
            if field_key.upper() in FieldNameRU.__members__:
                field_ru = FieldNameRU[field_key.upper()].value
            
            old_val = values.get("old")
            new_val = values.get("new")
            
            # Skip if values are equal (string comparison)
            old_str = format_decimal(old_val, 2) if old_val is not None else "—"
            new_str = format_decimal(new_val, 2) if new_val is not None else "—"
            
            if old_str == new_str:
                continue
                
            route_entry["fields"].append({
                "name": field_ru,
                "old": old_str,
                "new": new_str
            })
        
        if route_entry["fields"]:
            result["routes"].append(route_entry)
    
    # Process totals changes (only show fields that changed)
    totals_fields = [
        ("client_should_send", FieldNameRU.CLIENT_SENDS.value),
        ("deal_costs", FieldNameRU.DEAL_COSTS.value),
        ("income_amount", FieldNameRU.REVENUE.value),
        ("manager_commission_amount", FieldNameRU.MANAGER_COMMISSION.value),
        ("net_profit", FieldNameRU.NET_PROFIT.value),
    ]
    
    for key, label in totals_fields:
        old_val = old_income.get(key, 0)
        new_val = new_income.get(key, 0)
        
        old_str = format_decimal(old_val, 2)
        new_str = format_decimal(new_val, 2)
        
        if old_str != new_str:
            result["totals"]["has_changes"] = True
            result["totals"]["fields"].append({
                "name": label,
                "old": old_str,
                "new": new_str,
                "currency": currency
            })
    
    # Add client rate change if applicable
    if client_rate_changed and old_client_rate is not None and new_client_rate is not None:
        old_rate_str = format_decimal(old_client_rate, 2)
        new_rate_str = format_decimal(new_client_rate, 2)
        if old_rate_str != new_rate_str:
            result["client_rate"] = {
                "old": old_rate_str,
                "new": new_rate_str
            }
    
    return result


def format_consolidated_deal_edit_text(
    route_changes: list,
    old_income: Dict[str, Any],
    new_income: Dict[str, Any],
    client_rate_changed: bool = False,
    old_client_rate: Decimal = None,
    new_client_rate: Decimal = None,
    currency: str = "USDT"
) -> str:
    """
    Format a consolidated deal edit history as plain text (fallback).
    """
    lines = []
    
    # Client rate change
    if client_rate_changed and old_client_rate is not None and new_client_rate is not None:
        old_rate_str = format_decimal(old_client_rate, 2)
        new_rate_str = format_decimal(new_client_rate, 2)
        if old_rate_str != new_rate_str:
            lines.append(f"{FieldNameRU.CLIENT_RATE.value}: {old_rate_str}% → {new_rate_str}%")
            lines.append("")
    
    # Route changes
    for route_data in route_changes:
        route_type = route_data.get("route_type", "unknown")
        changes = route_data.get("changes", {})
        
        if not changes:
            continue
        
        route_type_ru = ROUTE_TYPE_RU.get(route_type, route_type)
        lines.append(f"Маршрут: {route_type_ru}")
        
        for field_key, values in changes.items():
            field_ru = field_key
            if field_key.upper() in FieldNameRU.__members__:
                field_ru = FieldNameRU[field_key.upper()].value
            
            old_val = values.get("old")
            new_val = values.get("new")
            
            old_str = format_decimal(old_val, 2) if old_val is not None else "—"
            new_str = format_decimal(new_val, 2) if new_val is not None else "—"
            
            if old_str != new_str:
                lines.append(f"{field_ru}: {old_str} → {new_str}")
        
        lines.append("")
    
    # Totals recalculated
    totals_lines = []
    totals_fields = [
        ("client_should_send", FieldNameRU.CLIENT_SENDS.value),
        ("deal_costs", FieldNameRU.DEAL_COSTS.value),
        ("income_amount", FieldNameRU.REVENUE.value),
        ("manager_commission_amount", FieldNameRU.MANAGER_COMMISSION.value),
        ("net_profit", FieldNameRU.NET_PROFIT.value),
    ]
    
    for key, label in totals_fields:
        old_val = old_income.get(key, 0)
        new_val = new_income.get(key, 0)
        
        old_str = format_decimal(old_val, 2)
        new_str = format_decimal(new_val, 2)
        
        if old_str != new_str:
            totals_lines.append(f"• {label}: {old_str} → {new_str} {currency}")
    
    if totals_lines:
        lines.append("Итого пересчитано:")
        lines.extend(totals_lines)
    
    return "\n".join(lines)
