from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, case
from datetime import datetime, timedelta
from typing import Optional
from decimal import Decimal

from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.core.permissions import require_permission
from app.models.user import User
from app.models.deal import Deal, DealStatus
from app.models.transaction import Transaction, TransactionStatus
from app.models.client import Client

router = APIRouter(prefix="/statistics", tags=["statistics"])


@router.get("/dashboard")
def get_dashboard_statistics(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("exchanges.statistics.read"))
):
    """Получить статистику для финансового дашборда."""
    
    # Парсим даты
    start = None
    end = None
    if start_date:
        start = datetime.strptime(start_date, "%Y-%m-%d")
    if end_date:
        end = datetime.strptime(end_date, "%Y-%m-%d")
        # Добавляем конец дня
        end = end.replace(hour=23, minute=59, second=59)
    
    # Базовый запрос
    query = db.query(Deal)
    if start:
        query = query.filter(Deal.created_at >= start)
    if end:
        query = query.filter(Deal.created_at <= end)
    
    # Общая статистика по сделкам
    total_deals = query.count()
    completed_deals = query.filter(Deal.status == DealStatus.COMPLETED.value).count()
    
    # Суммы по завершенным сделкам с учетом фильтров по датам
    completed_filters = [Deal.status == DealStatus.COMPLETED.value]
    if start:
        completed_filters.append(Deal.created_at >= start)
    if end:
        completed_filters.append(Deal.created_at <= end)
    
    total_eur = db.query(func.sum(Deal.total_eur_request)).filter(
        and_(*completed_filters)
    ).scalar() or Decimal('0')
    
    total_usdt = db.query(func.sum(Deal.total_usdt_calculated)).filter(
        and_(*completed_filters)
    ).scalar() or Decimal('0')
    
    total_cost = db.query(func.sum(Deal.total_cost_usdt)).filter(
        and_(*completed_filters)
    ).scalar() or Decimal('0')
    
    total_profit = db.query(func.sum(Deal.net_profit_usdt)).filter(
        and_(*completed_filters)
    ).scalar() or Decimal('0')
    
    # Вычисляем ROI
    roi = Decimal('0')
    if total_cost > 0:
        roi = ((total_profit / total_cost) * 100)
    
    # Средняя маржа
    avg_margin = Decimal('0')
    if completed_deals > 0:
        avg_margin = total_profit / completed_deals
    
    # Статистика по статусам
    status_stats = db.query(
        Deal.status,
        func.count(Deal.id).label('count')
    ).group_by(Deal.status).all()
    
    # status уже является строкой, так как колонка имеет тип String(50)
    status_breakdown = {str(status): count for status, count in status_stats}
    
    # Статистика по роутам транзакций
    route_filters = [Deal.status == DealStatus.COMPLETED.value]
    if start:
        route_filters.append(Deal.created_at >= start)
    if end:
        route_filters.append(Deal.created_at <= end)
    
    route_stats = db.query(
        Transaction.route_type,
        func.count(Transaction.id).label('count'),
        func.sum(Transaction.cost_usdt).label('total_cost')
    ).join(Deal).filter(
        and_(*route_filters)
    ).group_by(Transaction.route_type).all()
    
    route_breakdown = []
    for route, count, cost in route_stats:
        if route:
            route_breakdown.append({
                'route': route,
                'count': count,
                'total_cost': float(cost or 0)
            })
    
    # Топ клиенты по объему
    client_filters = [Deal.status == DealStatus.COMPLETED.value]
    if start:
        client_filters.append(Deal.created_at >= start)
    if end:
        client_filters.append(Deal.created_at <= end)
    
    top_clients = db.query(
        Client.name,
        func.sum(Deal.total_eur_request).label('total_volume'),
        func.count(Deal.id).label('deal_count')
    ).join(Deal).filter(
        and_(*client_filters)
    ).group_by(Client.id, Client.name).order_by(
        func.sum(Deal.total_eur_request).desc()
    ).limit(5).all()
    
    top_clients_list = [
        {
            'name': name,
            'total_volume': float(total_volume or 0),
            'deal_count': deal_count
        }
        for name, total_volume, deal_count in top_clients
    ]
    
    # Статистика по дням (для графика)
    daily_stats = []
    if start and end:
        current = start.date()
        end_date_only = end.date()
        while current <= end_date_only:
            day_start = datetime.combine(current, datetime.min.time())
            day_end = datetime.combine(current, datetime.max.time())
            
            day_profit = db.query(func.sum(Deal.net_profit_usdt)).filter(
                and_(
                    Deal.status == DealStatus.COMPLETED.value,
                    Deal.created_at >= day_start,
                    Deal.created_at <= day_end
                )
            ).scalar() or Decimal('0')
            
            day_deals = db.query(func.count(Deal.id)).filter(
                and_(
                    Deal.status == DealStatus.COMPLETED.value,
                    Deal.created_at >= day_start,
                    Deal.created_at <= day_end
                )
            ).scalar() or 0
            
            daily_stats.append({
                'date': current.isoformat(),
                'profit': float(day_profit),
                'deals': day_deals
            })
            
            current += timedelta(days=1)
    
    # Статистика по задолженностям клиентов
    debt_filters = [Deal.is_client_debt == "true", Deal.client_debt_amount > 0]
    if start:
        debt_filters.append(Deal.created_at >= start)
    if end:
        debt_filters.append(Deal.created_at <= end)
    
    # Общая сумма задолженностей
    total_debt = db.query(func.sum(Deal.client_debt_amount)).filter(
        and_(*debt_filters)
    ).scalar() or Decimal('0')
    
    # Количество сделок с задолженностями
    deals_with_debt = db.query(func.count(Deal.id)).filter(
        and_(*debt_filters)
    ).scalar() or 0
    
    # Детализация по клиентам с задолженностями
    client_debts = db.query(
        Client.id,
        Client.name,
        func.sum(Deal.client_debt_amount).label('total_debt'),
        func.count(Deal.id).label('deals_count'),
        func.min(Deal.created_at).label('oldest_debt_date')
    ).join(Deal).filter(
        and_(*debt_filters)
    ).group_by(Client.id, Client.name).order_by(
        func.sum(Deal.client_debt_amount).desc()
    ).all()
    
    client_debts_list = [
        {
            'client_id': client_id,
            'client_name': name,
            'total_debt': float(total_debt or 0),
            'deals_count': deals_count,
            'oldest_debt_date': oldest_debt_date.isoformat() if oldest_debt_date else None,
            'days_since_oldest': (datetime.utcnow().date() - oldest_debt_date.date()).days if oldest_debt_date else 0
        }
        for client_id, name, total_debt, deals_count, oldest_debt_date in client_debts
    ]
    
    return {
        'summary': {
            'total_deals': total_deals,
            'completed_deals': completed_deals,
            'total_eur': float(total_eur),
            'total_usdt': float(total_usdt),
            'total_cost_usdt': float(total_cost),
            'total_profit_usdt': float(total_profit),
            'roi_percent': float(roi),
            'avg_profit_per_deal': float(avg_margin),
            'total_debt_eur': float(total_debt),
            'deals_with_debt': deals_with_debt,
        },
        'status_breakdown': status_breakdown,
        'route_breakdown': route_breakdown,
        'top_clients': top_clients_list,
        'daily_stats': daily_stats,
        'client_debts': client_debts_list
    }

