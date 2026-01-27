"""
Сервис расчёта финансовых показателей сделки.
Переносит логику расчётов с фронтенда на бэкенд.
"""
from decimal import Decimal
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from app.models.route_commission import RouteCommission


class DealCalculator:
    """Сервис расчёта финансовых показателей сделки"""
    
    def __init__(self, db: Session):
        self.db = db
        self._commissions_cache: Dict[int, RouteCommission] = {}
    
    def _get_commission(self, commission_id: Optional[int]) -> Optional[RouteCommission]:
        """Получить комиссию по ID с кэшированием"""
        if not commission_id:
            return None
        
        if commission_id not in self._commissions_cache:
            commission = self.db.query(RouteCommission).filter(
                RouteCommission.id == commission_id
            ).first()
            if commission:
                self._commissions_cache[commission_id] = commission
        
        return self._commissions_cache.get(commission_id)
    
    def _apply_commission(self, amount: Decimal, commission: Optional[RouteCommission]) -> Decimal:
        """Применить комиссию к сумме"""
        if not commission:
            return amount
        
        if commission.is_fixed_currency and commission.commission_fixed:
            return amount + Decimal(str(commission.commission_fixed))
        elif commission.commission_percent:
            return amount - (amount * Decimal(str(commission.commission_percent)) / Decimal("100"))
        
        return amount
    
    def calculate_direct_route_income(
        self,
        amount_from_account: Decimal,
        exchange_rate: Decimal,
        bank_commission_id: Optional[int] = None
    ) -> Decimal:
        """
        Расчёт дохода для Direct Transfer маршрута.
        
        Formula: (Amount from Account - Amount from Account * Bank Commission%) * Exchange Rate
        """
        if not amount_from_account or not exchange_rate:
            return Decimal("0")
        
        amount = amount_from_account
        commission = self._get_commission(bank_commission_id)
        amount = self._apply_commission(amount, commission)
        
        return amount * exchange_rate
    
    def calculate_exchange_route_income(
        self,
        amount_from_account: Decimal,
        exchange_rate: Decimal,
        crypto_exchange_rate: Decimal,
        agent_commission_id: Optional[int] = None,
        exchange_commission_id: Optional[int] = None,
        bank_commission_id: Optional[int] = None
    ) -> Dict[str, Decimal]:
        """
        Расчёт дохода для Exchange маршрута.
        
        Returns:
            dict с exchange_amount и route_income
        """
        if not amount_from_account or not exchange_rate or not crypto_exchange_rate:
            return {"exchange_amount": Decimal("0"), "route_income": Decimal("0")}
        
        amount = amount_from_account
        
        # Применяем комиссии последовательно
        agent_comm = self._get_commission(agent_commission_id)
        amount = self._apply_commission(amount, agent_comm)
        
        exchange_comm = self._get_commission(exchange_commission_id)
        amount = self._apply_commission(amount, exchange_comm)
        
        bank_comm = self._get_commission(bank_commission_id)
        amount = self._apply_commission(amount, bank_comm)
        
        # Exchange Amount = (Amount from Account - все комиссии) * Crypto Exchange Rate
        exchange_amount = amount * crypto_exchange_rate
        
        # Route Income = Exchange Amount * Exchange Rate
        route_income = exchange_amount * exchange_rate
        
        return {
            "exchange_amount": exchange_amount,
            "route_income": route_income
        }
    
    def calculate_partner_route_income(
        self,
        amount_from_account: Decimal,
        exchange_rate: Decimal,
        partner_commission_id: Optional[int] = None
    ) -> Dict[str, Decimal]:
        """
        Расчёт дохода для Partner маршрута.
        
        Returns:
            dict с amount_partner_sends, amount_to_partner_usdt и route_income
        """
        if not amount_from_account or not exchange_rate:
            return {
                "amount_partner_sends": Decimal("0"),
                "amount_to_partner_usdt": Decimal("0"),
                "route_income": Decimal("0")
            }
        
        # Amount Partner Sends = Amount from Account * Exchange Rate
        amount_partner_sends = amount_from_account * exchange_rate
        
        # Amount to Partner (USDT) = Amount Partner Sends * (1 - Partner Commission/100)
        amount_to_partner_usdt = amount_partner_sends
        commission = self._get_commission(partner_commission_id)
        if commission and commission.commission_percent:
            amount_to_partner_usdt = amount_partner_sends * (
                Decimal("1") - Decimal(str(commission.commission_percent)) / Decimal("100")
            )
        
        # Route Income = max(Amount Partner Sends, Amount to Partner)
        route_income = max(amount_partner_sends, amount_to_partner_usdt)
        
        return {
            "amount_partner_sends": amount_partner_sends,
            "amount_to_partner_usdt": amount_to_partner_usdt,
            "route_income": route_income
        }
    
    def calculate_route_income(self, route_data: dict) -> dict:
        """
        Расчёт дохода для маршрута любого типа.
        
        Args:
            route_data: dict с данными маршрута
        
        Returns:
            dict с рассчитанными полями (calculated_route_income, и др.)
        """
        route_type = route_data.get("route_type")
        exchange_rate = Decimal(str(route_data.get("exchange_rate", 0) or 0))
        amount_from_account = Decimal(str(route_data.get("amount_from_account", 0) or 0))
        
        result = {"calculated_route_income": Decimal("0")}
        
        if route_type == "direct":
            income = self.calculate_direct_route_income(
                amount_from_account=amount_from_account,
                exchange_rate=exchange_rate,
                bank_commission_id=route_data.get("bank_commission_id")
            )
            result["calculated_route_income"] = income
            
        elif route_type == "exchange":
            crypto_rate = Decimal(str(route_data.get("crypto_exchange_rate", 0) or 0))
            exchange_result = self.calculate_exchange_route_income(
                amount_from_account=amount_from_account,
                exchange_rate=exchange_rate,
                crypto_exchange_rate=crypto_rate,
                agent_commission_id=route_data.get("agent_commission_id"),
                exchange_commission_id=route_data.get("exchange_commission_id"),
                bank_commission_id=route_data.get("exchange_bank_commission_id")
            )
            result["exchange_amount"] = exchange_result["exchange_amount"]
            result["calculated_route_income"] = exchange_result["route_income"]
            
        elif route_type == "partner":
            partner_result = self.calculate_partner_route_income(
                amount_from_account=amount_from_account,
                exchange_rate=exchange_rate,
                partner_commission_id=route_data.get("partner_commission_id")
            )
            result["amount_partner_sends"] = partner_result["amount_partner_sends"]
            result["amount_to_partner_usdt"] = partner_result["amount_to_partner_usdt"]
            result["calculated_route_income"] = partner_result["route_income"]
            
        elif route_type == "partner_50_50":
            partner_result = self.calculate_partner_route_income(
                amount_from_account=amount_from_account,
                exchange_rate=exchange_rate,
                partner_commission_id=route_data.get("partner_50_50_commission_id")
            )
            result["amount_partner_50_50_sends"] = partner_result["amount_partner_sends"]
            result["amount_to_partner_50_50_usdt"] = partner_result["amount_to_partner_usdt"]
            result["calculated_route_income"] = partner_result["route_income"]
        
        return result
    
    def calculate_transaction_totals(self, routes: List[dict]) -> dict:
        """
        Расчёт итогов транзакции (суммирование маршрутов).
        
        Args:
            routes: список маршрутов транзакции
        
        Returns:
            dict с amount_for_client и final_income
        """
        amount_for_client = Decimal("0")
        final_income = Decimal("0")
        
        for route in routes:
            route_result = self.calculate_route_income(route)
            
            # Сумма для клиента = сумма amount_from_account из всех маршрутов
            amount_for_client += Decimal(str(route.get("amount_from_account", 0) or 0))
            
            # Итоговый доход = сумма calculated_route_income из всех маршрутов
            final_income += route_result.get("calculated_route_income", Decimal("0"))
        
        return {
            "amount_for_client": amount_for_client,
            "final_income": final_income
        }
    
    def calculate_deal_totals(self, transactions: List[dict]) -> dict:
        """
        Расчёт итогов всей сделки.
        
        Args:
            transactions: список транзакций с маршрутами
        
        Returns:
            dict с total_amount_for_client и total_client_should_send
        """
        total_amount_for_client = Decimal("0")
        total_client_should_send = Decimal("0")
        
        for trans in transactions:
            routes = trans.get("routes", [])
            trans_totals = self.calculate_transaction_totals(routes)
            
            total_amount_for_client += trans_totals["amount_for_client"]
            total_client_should_send += trans_totals["final_income"]
        
        return {
            "total_amount_for_client": total_amount_for_client,
            "total_client_should_send": total_client_should_send
        }
    
    def preview_calculation(self, deal_data: dict) -> dict:
        """
        Предварительный расчёт сделки (для превью перед сохранением).
        
        Args:
            deal_data: данные сделки с транзакциями
        
        Returns:
            dict с полными расчётами для каждой транзакции и маршрута
        """
        transactions = deal_data.get("transactions", [])
        calculated_transactions = []
        
        for trans in transactions:
            routes = trans.get("routes", [])
            calculated_routes = []
            
            for route in routes:
                route_calc = self.calculate_route_income(route)
                calculated_routes.append({
                    **route,
                    **route_calc
                })
            
            trans_totals = self.calculate_transaction_totals(routes)
            calculated_transactions.append({
                **trans,
                "routes": calculated_routes,
                "amount_for_client": trans_totals["amount_for_client"],
                "final_income": trans_totals["final_income"]
            })
        
        deal_totals = self.calculate_deal_totals(transactions)
        
        return {
            "transactions": calculated_transactions,
            **deal_totals
        }
