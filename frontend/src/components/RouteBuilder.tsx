import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../lib/api';

interface Currency {
  id: number;
  code: string;
  name: string;
  is_crypto: boolean;
}

interface Company {
  id: number;
  name: string;
}

interface InternalCompany {
  id: number;
  name: string;
}

interface InternalCompanyAccount {
  id: number;
  company_id: number;
  account_name: string;
  account_number: string;
  currency: string;
  balance: number;
  is_active: boolean;
}

interface AccountBalance {
  id: number;
  account_name: string;
  currency: string;
  balance: number;
}

interface RouteCommission {
  id: number;
  route_type: string;
  commission_percent: number | null;
  commission_fixed: number | null;
  is_fixed_currency: boolean;
  currency: string | null;
  is_active: boolean;
}

interface Route {
  id?: string; // Временный ID для React key
  route_type: 'direct' | 'exchange' | 'partner' | 'partner_50_50' | '';
  
  // Direct
  internal_company_id?: number;
  internal_company_account_id?: number;
  amount_from_account?: number;
  bank_commission_id?: number;
  
  // Exchange
  crypto_account_id?: number;
  exchange_from_currency?: string;
  exchange_to_currency?: string;
  crypto_exchange_rate?: number;
  agent_commission_id?: number;
  exchange_commission_id?: number;
  exchange_bank_commission_id?: number;
  
  // Partner
  partner_company_id?: number;
  amount_to_partner_usdt?: number;
  amount_partner_sends?: number;
  partner_commission_id?: number;
  
  // Partner 50-50
  partner_50_50_company_id?: number;
  amount_to_partner_50_50_usdt?: number;
  amount_partner_50_50_sends?: number;
  partner_50_50_commission_id?: number;
  
  // Calculated
  final_income?: number;
}

interface TransactionRoute {
  id?: number;
  from_currency: string;
  to_currency: string;
  exchange_rate: number;
  client_company_id: number;
  amount_for_client: number;
  routes: Route[]; // Массив маршрутов для этой транзакции
  
  // Calculated - сумма всех маршрутов
  final_income?: number;
}

interface RouteBuilderProps {
  clientId: number;
  transactions: TransactionRoute[];
  onUpdate: (transactions: TransactionRoute[]) => void;
  dealAmount?: number; // Сумма, которую клиент хочет получить
  clientSendsCurrency?: string; // Валюта, которую клиент отправляет
  clientReceivesCurrency?: string; // Валюта, которую клиент получает
}

export function RouteBuilder({ clientId, transactions, onUpdate, dealAmount, clientSendsCurrency, clientReceivesCurrency }: RouteBuilderProps) {
  // Загружаем справочники
  const { data: currencies } = useQuery<Currency[]>({
    queryKey: ['reference-currencies'],
    queryFn: async () => {
      const response = await api.get('/api/reference/currencies');
      return response.data;
    },
  });

  const { data: clientCompanies } = useQuery<Company[]>({
    queryKey: ['reference-companies', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const response = await api.get(`/api/reference/companies?client_id=${clientId}`);
      return response.data;
    },
    enabled: !!clientId,
  });

  const { data: internalCompanies } = useQuery<InternalCompany[]>({
    queryKey: ['reference-internal-companies'],
    queryFn: async () => {
      const response = await api.get('/api/reference/internal-companies');
      return response.data;
    },
  });

  const { data: internalAccounts } = useQuery<InternalCompanyAccount[]>({
    queryKey: ['reference-internal-company-accounts'],
    queryFn: async () => {
      const response = await api.get('/api/reference/internal-company-accounts');
      return response.data;
    },
  });

  const { data: cryptoBalances } = useQuery<AccountBalance[]>({
    queryKey: ['account-balances'],
    queryFn: async () => {
      const response = await api.get('/api/account-balances');
      return response.data;
    },
  });

  const { data: routeCommissions } = useQuery<RouteCommission[]>({
    queryKey: ['reference-route-commissions'],
    queryFn: async () => {
      const response = await api.get('/api/reference/route-commissions');
      return response.data;
    },
  });

  // Функция для расчета конечного дохода для одного маршрута
  const calculateRouteFinalIncome = (route: Route, transaction: TransactionRoute) => {
    if (!transaction.amount_for_client || !transaction.exchange_rate || !route.route_type) {
      route.final_income = undefined;
      return;
    }

    let income = transaction.amount_for_client * transaction.exchange_rate;
    
    // Применяем комиссии в зависимости от типа маршрута
    if (route.route_type === 'direct') {
      const commission = routeCommissions?.find(c => c.id === route.bank_commission_id);
      if (commission) {
        if (commission.is_fixed_currency && commission.commission_fixed) {
          income += commission.commission_fixed;
        } else if (commission.commission_percent) {
          income = income * (1 + commission.commission_percent / 100);
        }
      }
    } else if (route.route_type === 'exchange') {
      // Для биржи суммируем все комиссии
      const commissions = routeCommissions?.filter(c => 
        (c.id === route.agent_commission_id || 
         c.id === route.exchange_commission_id || 
         c.id === route.exchange_bank_commission_id) && 
        c.is_active
      ) || [];
      
      commissions.forEach(commission => {
        if (commission.is_fixed_currency && commission.commission_fixed) {
          income += commission.commission_fixed;
        } else if (commission.commission_percent) {
          income = income * (1 + commission.commission_percent / 100);
        }
      });
    } else if (route.route_type === 'partner') {
      // Для партнёра доход = сумма которую отправит партнёр клиенту
      income = route.amount_partner_sends || 0;
    } else if (route.route_type === 'partner_50_50') {
      const commission = routeCommissions?.find(c => c.id === route.partner_50_50_commission_id);
      income = route.amount_partner_50_50_sends || 0;
      if (commission) {
        if (commission.is_fixed_currency && commission.commission_fixed) {
          income += commission.commission_fixed;
        } else if (commission.commission_percent) {
          income = income * (1 + commission.commission_percent / 100);
        }
      }
    }
    
    route.final_income = income;
  };

  // Функция для расчета общего дохода транзакции (сумма всех маршрутов)
  const calculateTransactionFinalIncome = (trans: TransactionRoute) => {
    if (!trans.routes || trans.routes.length === 0) {
      trans.final_income = undefined;
      return;
    }

    // Пересчитываем доход для каждого маршрута
    trans.routes.forEach(route => {
      calculateRouteFinalIncome(route, trans);
    });

    // Суммируем доходы всех маршрутов
    trans.final_income = trans.routes.reduce((sum, route) => sum + (route.final_income || 0), 0);
  };

  // Автоматически пересчитываем amount_for_client при изменении dealAmount
  useEffect(() => {
    if (dealAmount && clientSendsCurrency && clientReceivesCurrency && transactions.length > 0) {
      const updated = transactions.map(trans => {
        // Пересчитываем только для транзакций, где валюты совпадают и есть курс
        if (trans.from_currency === clientSendsCurrency &&
            trans.to_currency === clientReceivesCurrency &&
            trans.exchange_rate > 0) {
          const newAmount = dealAmount / trans.exchange_rate;
          // Пересчитываем только если значение изменилось (чтобы избежать бесконечных циклов)
          if (Math.abs(newAmount - (trans.amount_for_client || 0)) > 0.01) {
            const updatedTrans = {
              ...trans,
              amount_for_client: newAmount
            };
            calculateTransactionFinalIncome(updatedTrans);
            return updatedTrans;
          }
        }
        return trans;
      });
      
      // Проверяем, изменились ли транзакции
      const hasChanges = updated.some((trans, index) => 
        trans.amount_for_client !== transactions[index]?.amount_for_client
      );
      
      if (hasChanges) {
        onUpdate(updated);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealAmount, clientSendsCurrency, clientReceivesCurrency]);

  const addTransaction = () => {
    const newTrans: TransactionRoute = {
      from_currency: '',
      to_currency: '',
      exchange_rate: 0,
      client_company_id: 0,
      amount_for_client: 0,
      routes: [],
    };
    onUpdate([...transactions, newTrans]);
  };

  const addRoute = (transactionIndex: number) => {
    const updated = [...transactions];
    const newRoute: Route = {
      id: `route-${Date.now()}-${Math.random()}`,
      route_type: '',
    };
    updated[transactionIndex].routes = [...(updated[transactionIndex].routes || []), newRoute];
    calculateTransactionFinalIncome(updated[transactionIndex]);
    onUpdate(updated);
  };

  const removeRoute = (transactionIndex: number, routeIndex: number) => {
    const updated = [...transactions];
    updated[transactionIndex].routes = updated[transactionIndex].routes.filter((_, i) => i !== routeIndex);
    calculateTransactionFinalIncome(updated[transactionIndex]);
    onUpdate(updated);
  };

  const updateRoute = (transactionIndex: number, routeIndex: number, field: keyof Route, value: any) => {
    const updated = [...transactions];
    updated[transactionIndex].routes[routeIndex] = { 
      ...updated[transactionIndex].routes[routeIndex], 
      [field]: value 
    };
    
    // Сбрасываем зависимые поля при изменении типа маршрута
    if (field === 'route_type') {
      const resetFields: (keyof Route)[] = [
        'internal_company_id', 'internal_company_account_id', 'amount_from_account', 'bank_commission_id',
        'crypto_account_id', 'exchange_from_currency', 'exchange_to_currency', 'crypto_exchange_rate',
        'agent_commission_id', 'exchange_commission_id', 'exchange_bank_commission_id',
        'partner_company_id', 'amount_to_partner_usdt', 'amount_partner_sends', 'partner_commission_id',
        'partner_50_50_company_id', 'amount_to_partner_50_50_usdt', 'amount_partner_50_50_sends', 'partner_50_50_commission_id',
      ];
      resetFields.forEach(f => {
        (updated[transactionIndex].routes[routeIndex] as any)[f] = undefined;
      });
    }
    
    // Сбрасываем счет при изменении компании
    if (field === 'internal_company_id') {
      updated[transactionIndex].routes[routeIndex].internal_company_account_id = undefined;
    }
    
    // Автоматически подставляем комиссию по умолчанию
    if (field === 'route_type' && value && routeCommissions) {
      const defaultCommission = routeCommissions.find(c => c.route_type === value && c.is_active);
      if (defaultCommission) {
        if (value === 'direct') {
          updated[transactionIndex].routes[routeIndex].bank_commission_id = defaultCommission.id;
        } else if (value === 'exchange') {
          const agentComm = routeCommissions.find(c => c.route_type === 'agent' && c.is_active);
          const exchangeComm = routeCommissions.find(c => c.route_type === 'exchange' && c.is_active);
          const bankComm = routeCommissions.find(c => c.route_type === 'direct' && c.is_active);
          if (agentComm) updated[transactionIndex].routes[routeIndex].agent_commission_id = agentComm.id;
          if (exchangeComm) updated[transactionIndex].routes[routeIndex].exchange_commission_id = exchangeComm.id;
          if (bankComm) updated[transactionIndex].routes[routeIndex].exchange_bank_commission_id = bankComm.id;
        } else if (value === 'partner') {
          updated[transactionIndex].routes[routeIndex].partner_commission_id = defaultCommission.id;
        } else if (value === 'partner_50_50') {
          updated[transactionIndex].routes[routeIndex].partner_50_50_commission_id = defaultCommission.id;
        }
      }
    }
    
    // Пересчитываем доход для маршрута и транзакции
    calculateRouteFinalIncome(updated[transactionIndex].routes[routeIndex], updated[transactionIndex]);
    calculateTransactionFinalIncome(updated[transactionIndex]);
    
    onUpdate(updated);
  };

  const removeTransaction = (index: number) => {
    onUpdate(transactions.filter((_, i) => i !== index));
  };

  const updateTransaction = (index: number, field: keyof TransactionRoute, value: any) => {
    const updated = [...transactions];
    updated[index] = { ...updated[index], [field]: value };
    
    // Автоматически рассчитываем amount_for_client на основе Deal Amount и курса
    if ((field === 'exchange_rate' || field === 'from_currency' || field === 'to_currency') && 
        dealAmount && 
        updated[index].exchange_rate > 0 &&
        updated[index].from_currency === clientSendsCurrency &&
        updated[index].to_currency === clientReceivesCurrency) {
      // amount_for_client = dealAmount / exchange_rate
      // Если клиент хочет получить 10000 EUR, а курс 0.85, то нужно получить 10000/0.85 = 11764.71 USDT
      updated[index].amount_for_client = dealAmount / updated[index].exchange_rate;
    }
    
    // Пересчитываем доход для всех маршрутов в транзакции
    calculateTransactionFinalIncome(updated[index]);
    
    onUpdate(updated);
  };

  // Фильтруем счета по выбранной компании
  const getAccountsForCompany = (companyId?: number) => {
    if (!companyId || !internalAccounts) return [];
    return internalAccounts.filter(acc => acc.company_id === companyId && acc.is_active);
  };


  return (
    <div className="space-y-4">
      {transactions.map((trans, index) => (
        <div key={index} className="border border-gray-200 rounded-md p-4 bg-gray-50">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-md font-semibold">Transaction {index + 1}</h3>
            {transactions.length > 1 && (
              <button
                type="button"
                onClick={() => removeTransaction(index)}
                className="text-red-600 hover:text-red-800 text-sm"
              >
                Remove
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">From Currency *</label>
              <select
                value={trans.from_currency}
                onChange={(e) => updateTransaction(index, 'from_currency', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              >
                <option value="">Select currency</option>
                {currencies?.map((curr) => (
                  <option key={curr.id} value={curr.code}>
                    {curr.code} - {curr.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">To Currency *</label>
              <select
                value={trans.to_currency}
                onChange={(e) => updateTransaction(index, 'to_currency', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              >
                <option value="">Select currency</option>
                {currencies?.map((curr) => (
                  <option key={curr.id} value={curr.code}>
                    {curr.code} - {curr.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Exchange Rate *</label>
              <input
                type="number"
                step="0.000001"
                value={trans.exchange_rate || ''}
                onChange={(e) => updateTransaction(index, 'exchange_rate', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Client Company *</label>
              <select
                value={trans.client_company_id || ''}
                onChange={(e) => updateTransaction(index, 'client_company_id', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              >
                <option value="">Select company</option>
                {clientCompanies?.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Amount for Client *</label>
              <input
                type="number"
                step="0.01"
                value={trans.amount_for_client || ''}
                onChange={(e) => updateTransaction(index, 'amount_for_client', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
            </div>

          </div>

          {/* Маршруты для транзакции */}
          <div className="mt-4">
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-medium">Routes</h4>
              <button
                type="button"
                onClick={() => addRoute(index)}
                className="px-3 py-1 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700"
              >
                + Add Route
              </button>
            </div>

            {(!trans.routes || trans.routes.length === 0) && (
              <div className="text-sm text-gray-500 p-3 bg-gray-100 rounded-md">
                No routes added. Click "+ Add Route" to add a route for this transaction.
              </div>
            )}

            {trans.routes && trans.routes.map((route, routeIndex) => (
              <div key={route.id || routeIndex} className="mb-4 p-3 border border-gray-300 rounded-md bg-white">
                <div className="flex justify-between items-start mb-3">
                  <h5 className="font-medium text-sm">Route {routeIndex + 1}</h5>
                  {trans.routes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRoute(index, routeIndex)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Route Type *</label>
                  <select
                    value={route.route_type}
                    onChange={(e) => updateRoute(index, routeIndex, 'route_type', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  >
                    <option value="">Select route type</option>
                    <option value="direct">Direct Transfer</option>
                    <option value="exchange">Exchange</option>
                    <option value="partner">Partner</option>
                    <option value="partner_50_50">Partner 50-50</option>
                  </select>
                </div>

                {/* Поля для прямого перевода */}
                {route.route_type === 'direct' && (
            <div className="mt-4 p-3 bg-blue-50 rounded-md space-y-3">
                  <h4 className="font-medium text-blue-900">Direct Transfer Settings</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Internal Company *</label>
                      <select
                        value={route.internal_company_id || ''}
                        onChange={(e) => updateRoute(index, routeIndex, 'internal_company_id', parseInt(e.target.value) || undefined)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        required
                      >
                        <option value="">Select company</option>
                        {internalCompanies?.map((comp) => (
                          <option key={comp.id} value={comp.id}>
                            {comp.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Company Account *</label>
                      <select
                        value={route.internal_company_account_id || ''}
                        onChange={(e) => updateRoute(index, routeIndex, 'internal_company_account_id', parseInt(e.target.value) || undefined)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        required
                      >
                        <option value="">Select account</option>
                        {getAccountsForCompany(route.internal_company_id).map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.account_name} ({acc.currency}) - Balance: {acc.balance.toLocaleString()}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Amount from Account *</label>
                      <input
                        type="number"
                        step="0.01"
                        value={route.amount_from_account || ''}
                        onChange={(e) => updateRoute(index, routeIndex, 'amount_from_account', parseFloat(e.target.value) || undefined)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Bank Commission</label>
                      <select
                        value={route.bank_commission_id || ''}
                        onChange={(e) => updateRoute(index, routeIndex, 'bank_commission_id', parseInt(e.target.value) || undefined)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      >
                        <option value="">Select commission</option>
                        {routeCommissions?.filter(c => c.route_type === 'direct' && c.is_active).map((comm) => (
                          <option key={comm.id} value={comm.id}>
                            {comm.is_fixed_currency
                              ? `${comm.commission_fixed} ${comm.currency}`
                              : `${comm.commission_percent}%`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Поля для биржи */}
              {route.route_type === 'exchange' && (
                <div className="mt-4 p-3 bg-green-50 rounded-md space-y-3">
                  <h4 className="font-medium text-green-900">Exchange Settings</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Crypto Account *</label>
                      <select
                        value={route.crypto_account_id || ''}
                        onChange={(e) => updateRoute(index, routeIndex, 'crypto_account_id', parseInt(e.target.value) || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  >
                    <option value="">Select account</option>
                    {cryptoBalances?.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.account_name} ({acc.currency}) - Balance: {acc.balance.toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Exchange From Currency *</label>
                  <select
                        value={route.exchange_from_currency || ''}
                        onChange={(e) => updateRoute(index, routeIndex, 'exchange_from_currency', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  >
                    <option value="">Select currency</option>
                    {currencies?.filter(c => c.is_crypto).map((curr) => (
                      <option key={curr.id} value={curr.code}>
                        {curr.code}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Exchange To Currency *</label>
                  <select
                        value={route.exchange_to_currency || ''}
                        onChange={(e) => updateRoute(index, routeIndex, 'exchange_to_currency', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  >
                    <option value="">Select currency</option>
                    {currencies?.map((curr) => (
                      <option key={curr.id} value={curr.code}>
                        {curr.code}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Crypto Exchange Rate *</label>
                  <input
                    type="number"
                    step="0.000001"
                        value={route.crypto_exchange_rate || ''}
                        onChange={(e) => updateRoute(index, routeIndex, 'crypto_exchange_rate', parseFloat(e.target.value) || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Agent Commission</label>
                  <select
                        value={route.agent_commission_id || ''}
                        onChange={(e) => updateRoute(index, routeIndex, 'agent_commission_id', parseInt(e.target.value) || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select commission</option>
                    {routeCommissions?.filter(c => c.route_type === 'agent' && c.is_active).map((comm) => (
                      <option key={comm.id} value={comm.id}>
                        {comm.is_fixed_currency
                          ? `${comm.commission_fixed} ${comm.currency}`
                          : `${comm.commission_percent}%`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Exchange Commission</label>
                  <select
                        value={route.exchange_commission_id || ''}
                        onChange={(e) => updateRoute(index, routeIndex, 'exchange_commission_id', parseInt(e.target.value) || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select commission</option>
                    {routeCommissions?.filter(c => c.route_type === 'exchange' && c.is_active).map((comm) => (
                      <option key={comm.id} value={comm.id}>
                        {comm.is_fixed_currency
                          ? `${comm.commission_fixed} ${comm.currency}`
                          : `${comm.commission_percent}%`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Bank Commission</label>
                  <select
                        value={route.exchange_bank_commission_id || ''}
                        onChange={(e) => updateRoute(index, routeIndex, 'exchange_bank_commission_id', parseInt(e.target.value) || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select commission</option>
                    {routeCommissions?.filter(c => c.route_type === 'direct' && c.is_active).map((comm) => (
                      <option key={comm.id} value={comm.id}>
                        {comm.is_fixed_currency
                          ? `${comm.commission_fixed} ${comm.currency}`
                          : `${comm.commission_percent}%`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

              {/* Поля для партнёра */}
              {route.route_type === 'partner' && (
            <div className="mt-4 p-3 bg-purple-50 rounded-md space-y-3">
              <h4 className="font-medium text-purple-900">Partner Settings</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Partner Company *</label>
                  <select
                        value={route.partner_company_id || ''}
                        onChange={(e) => updateRoute(index, routeIndex, 'partner_company_id', parseInt(e.target.value) || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  >
                    <option value="">Select partner company</option>
                    {internalCompanies?.map((comp) => (
                      <option key={comp.id} value={comp.id}>
                        {comp.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Amount to Partner (USDT) *</label>
                  <input
                    type="number"
                    step="0.01"
                        value={route.amount_to_partner_usdt || ''}
                        onChange={(e) => updateRoute(index, routeIndex, 'amount_to_partner_usdt', parseFloat(e.target.value) || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Amount Partner Sends *</label>
                  <input
                    type="number"
                    step="0.01"
                        value={route.amount_partner_sends || ''}
                        onChange={(e) => updateRoute(index, routeIndex, 'amount_partner_sends', parseFloat(e.target.value) || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Partner Commission</label>
                  <select
                        value={route.partner_commission_id || ''}
                        onChange={(e) => updateRoute(index, routeIndex, 'partner_commission_id', parseInt(e.target.value) || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select commission</option>
                    {routeCommissions?.filter(c => c.route_type === 'partner' && c.is_active).map((comm) => (
                      <option key={comm.id} value={comm.id}>
                        {comm.is_fixed_currency
                          ? `${comm.commission_fixed} ${comm.currency}`
                          : `${comm.commission_percent}%`}
                      </option>
                    ))}
                  </select>
                </div>
                  </div>
                </div>
              )}

              {/* Поля для партнёра 50-50 */}
              {route.route_type === 'partner_50_50' && (
            <div className="mt-4 p-3 bg-yellow-50 rounded-md space-y-3">
              <h4 className="font-medium text-yellow-900">Partner 50-50 Settings</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Partner Company *</label>
                  <select
                        value={route.partner_50_50_company_id || ''}
                        onChange={(e) => updateRoute(index, routeIndex, 'partner_50_50_company_id', parseInt(e.target.value) || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  >
                    <option value="">Select partner company</option>
                    {internalCompanies?.map((comp) => (
                      <option key={comp.id} value={comp.id}>
                        {comp.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Amount to Partner (USDT) *</label>
                  <input
                    type="number"
                    step="0.01"
                        value={route.amount_to_partner_50_50_usdt || ''}
                        onChange={(e) => updateRoute(index, routeIndex, 'amount_to_partner_50_50_usdt', parseFloat(e.target.value) || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Amount Partner Sends *</label>
                  <input
                    type="number"
                    step="0.01"
                        value={route.amount_partner_50_50_sends || ''}
                        onChange={(e) => updateRoute(index, routeIndex, 'amount_partner_50_50_sends', parseFloat(e.target.value) || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Partner 50-50 Commission</label>
                  <select
                        value={route.partner_50_50_commission_id || ''}
                        onChange={(e) => updateRoute(index, routeIndex, 'partner_50_50_commission_id', parseInt(e.target.value) || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select commission</option>
                    {routeCommissions?.filter(c => c.route_type === 'partner_50_50' && c.is_active).map((comm) => (
                      <option key={comm.id} value={comm.id}>
                        {comm.is_fixed_currency
                          ? `${comm.commission_fixed} ${comm.currency}`
                          : `${comm.commission_percent}%`}
                      </option>
                    ))}
                  </select>
                </div>
                  </div>
                </div>
              )}

              {/* Отображение конечного дохода для маршрута */}
              {route.final_income !== undefined && (
                <div className="mt-2 p-2 bg-green-100 rounded">
                  <span className="text-xs font-medium text-green-800">
                    Route Income: {route.final_income.toLocaleString(undefined, { maximumFractionDigits: 2 })} {trans.to_currency}
                  </span>
                </div>
              )}
              </div>
            ))}

            {/* Отображение общего конечного дохода транзакции */}
            {trans.final_income !== undefined && (
              <div className="mt-4 p-2 bg-blue-100 rounded">
                <span className="text-sm font-medium text-blue-800">
                  Total Final Income: {trans.final_income.toLocaleString(undefined, { maximumFractionDigits: 2 })} {trans.to_currency}
                </span>
              </div>
            )}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addTransaction}
        className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
      >
        + Add Transaction
      </button>
    </div>
  );
}


