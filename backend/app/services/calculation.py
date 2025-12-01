from decimal import Decimal
from typing import Optional
from app.models.transaction import Transaction, RouteType
from app.models.deal import Deal


def calculate_transaction_cost(transaction: Transaction, market_rate: Decimal) -> dict:
    """
    Рассчитывает стоимость транзакции в зависимости от типа маршрута.
    Возвращает: cost_usdt, client_price_usdt, profit_usdt, partner_profit_usdt
    """
    amount_eur = Decimal(str(transaction.amount_eur))
    
    if transaction.route_type == RouteType.EXCHANGE:
        # Сценарий: Биржа (пример: 30 000 EUR)
        # Себестоимость = Amount / (1 - exchange_fee - intermediary_fee) * rate + bank_fee_fix
        exchange_fee = Decimal(str(transaction.exchange_fee_percent or 0)) / 100
        intermediary_fee = Decimal(str(transaction.intermediary_fee_percent or 0)) / 100
        bank_fee_fix = Decimal(str(transaction.bank_fee_fix_eur or 0))
        
        # USDT для покупки на бирже
        cost_usdt = (amount_eur / (1 - exchange_fee - intermediary_fee)) * market_rate
        # Банковская комиссия в USDT (примерно)
        bank_fee_usdt = (bank_fee_fix * market_rate) if bank_fee_fix > 0 else Decimal(0)
        cost_usdt += bank_fee_usdt
        
        return {
            "cost_usdt": float(cost_usdt),
            "client_price_usdt": None,  # Будет рассчитано на уровне Deal
            "profit_usdt": None,
            "partner_profit_usdt": None
        }
    
    elif transaction.route_type == RouteType.SUPPLY_PARTNER:
        # Сценарий: Supply / Партнер (пример: 20 000 EUR)
        # Партнер доплачивает нам +0.6%, банк берет -0.3%
        partner_bonus = Decimal(str(transaction.partner_bonus_rate or 0)) / 100
        bank_fee = Decimal(str(transaction.bank_fee_percent or 0)) / 100
        
        # Себестоимость: Amount / (1 - bank_fee) * rate, но партнер доплачивает bonus
        # Фактически: Amount * (1 + partner_bonus) / (1 - bank_fee) * rate
        cost_usdt = (amount_eur * (1 - partner_bonus) / (1 - bank_fee)) * market_rate
        
        return {
            "cost_usdt": float(cost_usdt),
            "client_price_usdt": None,
            "profit_usdt": None,
            "partner_profit_usdt": None
        }
    
    elif transaction.route_type == RouteType.DIRECT_PAYMENT:
        # Сценарий: Прямой платеж (пример: 50 000 EUR)
        # Партнер платит напрямую, мы отдаем USDT, партнер доплачивает +0.6%
        partner_bonus = Decimal(str(transaction.partner_bonus_rate or 0)) / 100
        
        cost_usdt = amount_eur * (1 - partner_bonus) * market_rate
        
        return {
            "cost_usdt": float(cost_usdt),
            "client_price_usdt": None,
            "profit_usdt": None,
            "partner_profit_usdt": None
        }
    
    elif transaction.route_type == RouteType.SPLIT_50_50:
        # Сценарий: Сплит 50/50 (пример: 10 000 EUR)
        # Базовая стоимость: Amount / (1 - partner_cost_rate) * rate
        partner_cost_rate = Decimal(str(transaction.partner_cost_rate or 0)) / 100
        
        base_cost_usdt = (amount_eur / (1 - partner_cost_rate)) * market_rate
        
        # Цена клиенту будет рассчитана на уровне Deal
        # Но здесь можем посчитать дельту для сплита
        return {
            "cost_usdt": float(base_cost_usdt),
            "client_price_usdt": None,
            "profit_usdt": None,
            "partner_profit_usdt": None
        }
    
    return {
        "cost_usdt": 0.0,
        "client_price_usdt": None,
        "profit_usdt": None,
        "partner_profit_usdt": None
    }


def calculate_deal_totals(deal: Deal, transactions: list[Transaction], market_rate: Decimal) -> dict:
    """
    Рассчитывает итоговые суммы по сделке.
    Формула для клиента: Total_EUR / (1 - Client_Rate) * Market_Rate
    """
    total_eur = Decimal(str(deal.total_eur_request))
    client_rate = Decimal(str(deal.client_rate_percent or 1.0)) / 100
    
    # Цена для клиента (глобальная формула)
    total_usdt_client = (total_eur / (1 - client_rate)) * market_rate
    
    # Суммируем себестоимость по всем транзакциям
    total_cost_usdt = Decimal(0)
    total_partner_profit = Decimal(0)
    
    for trans in transactions:
        if trans.route_type:
            calc = calculate_transaction_cost(trans, market_rate)
            total_cost_usdt += Decimal(str(calc["cost_usdt"]))
            
            # Для сплита 50/50 считаем долю партнера
            if trans.route_type == RouteType.SPLIT_50_50 and trans.profit_split_enabled:
                # Client price для этого транша
                trans_client_price = (Decimal(str(trans.amount_eur)) / (1 - client_rate)) * market_rate
                trans_cost = Decimal(str(calc["cost_usdt"]))
                delta = trans_client_price - trans_cost
                partner_share = delta / 2
                total_partner_profit += partner_share
    
    # Gross margin
    gross_margin = total_usdt_client - total_cost_usdt
    
    # Net profit (за вычетом доли партнера)
    net_profit = gross_margin - total_partner_profit
    
    # Эффективный курс
    effective_rate = total_usdt_client / total_eur if total_eur > 0 else market_rate
    
    return {
        "total_usdt_calculated": float(total_usdt_client),
        "total_cost_usdt": float(total_cost_usdt),
        "gross_margin_usdt": float(gross_margin),
        "net_profit_usdt": float(net_profit),
        "partner_share_usdt": float(total_partner_profit),
        "effective_rate": float(effective_rate)
    }


def calculate_split_50_50_profit(
    amount_eur: Decimal,
    market_rate: Decimal,
    partner_cost_rate: Decimal,
    client_rate: Decimal
) -> dict:
    """
    Специальный расчет для сплита 50/50.
    Возвращает base_cost, client_price, delta, our_profit, partner_profit
    """
    # Базовая стоимость (сколько это стоит нам/партнеру)
    base_cost = (amount_eur / (1 - partner_cost_rate)) * market_rate
    
    # Цена клиенту (за сколько продали этот кусок клиенту)
    client_price = (amount_eur / (1 - client_rate)) * market_rate
    
    # Дельта
    delta = client_price - base_cost
    
    # Сплит пополам
    our_profit = delta / 2
    partner_profit = delta / 2
    
    return {
        "base_cost_usdt": float(base_cost),
        "client_price_usdt": float(client_price),
        "delta_usdt": float(delta),
        "our_profit_usdt": float(our_profit),
        "partner_profit_usdt": float(partner_profit)
    }

