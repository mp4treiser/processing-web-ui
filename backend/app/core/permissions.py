"""
Система разрешений (Permissions) для управления доступом.

Используется гибридный подход: разрешения определяются в конфигурации,
группируются по модулям и привязываются к ролям.

Структура разрешений: "module.action" (например, "exchanges.deals.create")
"""
from app.models.user import UserRole
from typing import Dict, List, Set

# Конфигурация разрешений: разрешение -> список ролей, которым оно доступно
PERMISSIONS: Dict[str, List[UserRole]] = {
    # ========== Модуль "Обмены" (Exchanges) ==========
    
    # Сделки
    "exchanges.deals.create": [UserRole.MANAGER, UserRole.ACCOUNTANT],
    "exchanges.deals.read_own": [UserRole.MANAGER],
    "exchanges.deals.read_all": [UserRole.SENIOR_MANAGER, UserRole.ACCOUNTANT, UserRole.DIRECTOR],
    "exchanges.deals.update": [UserRole.ACCOUNTANT, UserRole.DIRECTOR],
    "exchanges.deals.review": [UserRole.SENIOR_MANAGER],  # Просмотр для ревью
    "exchanges.deals.approve": [UserRole.SENIOR_MANAGER],  # Одобрение/отклонение
    "exchanges.deals.confirm_payment": [UserRole.MANAGER],  # Подтверждение оплаты клиента
    "exchanges.deals.pay_debt": [UserRole.MANAGER],  # Погашение задолженности
    
    # Транзакции
    "exchanges.transactions.read": [UserRole.ACCOUNTANT, UserRole.DIRECTOR],
    "exchanges.transactions.update": [UserRole.ACCOUNTANT],  # Обновление транзакции (выбор маршрута, параметры)
    "exchanges.transactions.calculate": [UserRole.ACCOUNTANT],  # Расчет транзакций
    "exchanges.transactions.execute": [UserRole.ACCOUNTANT],  # Выполнение транзакции (списание баланса)
    "exchanges.transactions.update_route": [UserRole.SENIOR_MANAGER],  # Обновление маршрута старшим менеджером
    
    # Статистика
    "exchanges.statistics.read": [UserRole.ACCOUNTANT, UserRole.DIRECTOR],
    
    # Задолженности
    "exchanges.debts.read": [UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.DIRECTOR],
    
    # ========== Справочники (References) ==========
    
    # Клиенты
    "references.clients.read": [UserRole.MANAGER, UserRole.SENIOR_MANAGER, UserRole.ACCOUNTANT, UserRole.DIRECTOR],
    "references.clients.write": [UserRole.SENIOR_MANAGER, UserRole.ACCOUNTANT, UserRole.DIRECTOR],
    
    # Компании
    "references.companies.read": [UserRole.MANAGER, UserRole.SENIOR_MANAGER, UserRole.ACCOUNTANT, UserRole.DIRECTOR],
    "references.companies.write": [UserRole.SENIOR_MANAGER, UserRole.ACCOUNTANT, UserRole.DIRECTOR],
    
    # Счета компаний
    "references.accounts.read": [UserRole.MANAGER, UserRole.SENIOR_MANAGER, UserRole.ACCOUNTANT, UserRole.DIRECTOR],
    "references.accounts.write": [UserRole.SENIOR_MANAGER, UserRole.ACCOUNTANT, UserRole.DIRECTOR],
    
    # ========== Остатки по счетам (Account Balances) ==========
    
    "balances.read": [UserRole.ACCOUNTANT, UserRole.DIRECTOR],
    "balances.write": [UserRole.ACCOUNTANT, UserRole.DIRECTOR],
    "balances.history.read": [UserRole.ACCOUNTANT, UserRole.DIRECTOR],
}

# Директор имеет все права по умолчанию
DIRECTOR_HAS_ALL = True


def has_permission(user_role: UserRole, permission: str) -> bool:
    """
    Проверяет, есть ли у роли указанное разрешение.
    
    Args:
        user_role: Роль пользователя
        permission: Название разрешения (например, "exchanges.deals.create")
    
    Returns:
        True, если у роли есть разрешение, False иначе
    """
    # Директор имеет все права
    if DIRECTOR_HAS_ALL and user_role == UserRole.DIRECTOR:
        return True
    
    # Проверяем разрешение в конфигурации
    allowed_roles = PERMISSIONS.get(permission, [])
    return user_role in allowed_roles


def get_user_permissions(user_role: UserRole) -> Set[str]:
    """
    Возвращает все разрешения для указанной роли.
    
    Args:
        user_role: Роль пользователя
    
    Returns:
        Множество разрешений для роли
    """
    permissions = set()
    
    # Директор имеет все права
    if DIRECTOR_HAS_ALL and user_role == UserRole.DIRECTOR:
        permissions.update(PERMISSIONS.keys())
        return permissions
    
    # Собираем все разрешения для роли
    for perm, roles in PERMISSIONS.items():
        if user_role in roles:
            permissions.add(perm)
    
    return permissions


def require_permission(permission: str):
    """
    Декоратор для проверки разрешения у текущего пользователя.
    Используется как зависимость FastAPI.
    
    Пример:
        @router.get("/deals")
        @require_permission("exchanges.deals.read_all")
        def get_deals(...):
            ...
    """
    from fastapi import Depends, HTTPException, status
    from app.core.dependencies import get_current_active_user
    from app.models.user import User
    
    def permission_checker(current_user: User = Depends(get_current_active_user)) -> User:
        # Преобразуем строковую роль в enum, если нужно
        user_role = current_user.role
        if isinstance(user_role, str):
            try:
                user_role = UserRole(user_role)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Invalid user role"
                )
        
        if not has_permission(user_role, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Not enough permissions. Required: {permission}"
            )
        return current_user
    
    return permission_checker

