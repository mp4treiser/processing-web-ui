import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CompanyBalancesDisplay } from '../components/CompanyBalancesDisplay';

interface Deal {
  id: number;
  client_id: number;
  client_name: string | null;
  total_eur_request: string;
  total_usdt_calculated: string | null;
  total_cost_usdt: string | null;
  gross_margin_usdt: string | null;
  net_profit_usdt: string | null;
  partner_share_usdt: string | null;
  effective_rate: string | null;
  status: string;
  created_at: string;
  transactions: Transaction[];
  client_debt_amount: string | null;
  client_rate_percent: string | null;
  deal_amount: string | null;
  client_sends_currency: string | null;
  client_receives_currency: string | null;
  created_by_id: number | null;
  created_by_email: string | null;
  created_by_name: string | null;
  manager_email: string | null;
  manager_name: string | null;
}

interface Transaction {
  id: number;
  target_company: string;
  amount_eur: string;
  recipient_details: string | null;
  route_type: string | null;
  status: string;
  cost_usdt: string | null;
  exchange_rate: string | null;
  client_company_id: number | null;
  internal_company_id: number | null;
  internal_company_account_id: number | null;
  amount_from_account: string | null;
  calculated_route_income: string | null;
  crypto_account_id: number | null;
  exchange_from_currency: string | null;
  exchange_amount: string | null;
  crypto_exchange_rate: string | null;
  partner_company_id: number | null;
  amount_to_partner_usdt: string | null;
  amount_partner_sends: string | null;
  partner_50_50_company_id: number | null;
  amount_to_partner_50_50_usdt: string | null;
  amount_partner_50_50_sends: string | null;
  // Commissions
  bank_commission_id: number | null;
  agent_commission_id: number | null;
  exchange_commission_id: number | null;
  exchange_bank_commission_id: number | null;
  partner_commission_id: number | null;
  partner_50_50_commission_id: number | null;
}

interface RouteCommission {
  id: number;
  name: string;
  commission_percent: string;
  commission_type: string;
}

interface DealIncome {
  client_should_send: number;  // Клиент отправляет
  deal_costs: number;  // Затраты на сделку
  income_amount: number;  // Доход
  income_percent: number;  // Доход в %
  is_profitable: boolean;
  manager_commission_percent: number;
  manager_commission_amount: number;
  net_profit: number;
  currency: string;
}

// History interfaces
interface RouteChange {
  route_type: string;
  route_type_ru: string;
  route_color: string;
  fields: Array<{ name: string; old: string; new: string }>;
}

interface TotalField {
  name: string;
  old: string;
  new: string;
  currency: string;
}

interface ConsolidatedChanges {
  type?: string;
  routes?: RouteChange[];
  totals?: {
    has_changes: boolean;
    fields: TotalField[];
  };
  client_rate?: {
    old: string;
    new: string;
  };
  new_routes?: string[];
  deleted_routes?: string[];
}

interface DealHistory {
  id: number;
  deal_id: number;
  user_id: number;
  user_email: string | null;
  user_name: string | null;
  user_role: string | null;
  action: string;
  changes: ConsolidatedChanges | Record<string, { old: string; new: string }> | null;
  comment: string | null;
  created_at: string;
}

interface DealWithHistory extends Deal {
  history?: DealHistory[];
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
}

interface Company {
  id: number;
  name: string;
}

interface CompanyAccount {
  id: number;
  company_id: number;
  account_name: string;
  account_number: string;
  currency: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  'new': { label: 'Новая', color: 'bg-blue-100 text-blue-800' },
  'senior_manager_review': { label: 'На проверке', color: 'bg-yellow-100 text-yellow-800' },
  'senior_manager_approved': { label: 'Одобрена', color: 'bg-green-100 text-green-800' },
  'senior_manager_rejected': { label: 'Отклонена', color: 'bg-red-100 text-red-800' },
  'client_agreed_to_pay': { label: 'Клиент согласен', color: 'bg-indigo-100 text-indigo-800' },
  'awaiting_client_payment': { label: 'Ожидание оплаты', color: 'bg-orange-100 text-orange-800' },
  'client_partially_paid': { label: 'Частичная оплата', color: 'bg-amber-100 text-amber-800' },
  'execution': { label: 'В исполнении', color: 'bg-purple-100 text-purple-800' },
  'completed': { label: 'Завершена', color: 'bg-emerald-100 text-emerald-800' },
};

const ROUTE_TYPE_LABELS: Record<string, string> = {
  'direct': 'Прямой перевод',
  'exchange': 'Биржа',
  'partner': 'Партнёр',
  'partner_50_50': 'Партнёр 50-50',
};

const ACTION_LABELS: Record<string, string> = {
  'Создано': 'Создано',
  'Скопировано': 'Скопировано',
  'Обновлено': 'Обновлено',
  'Статус изменён': 'Статус изменён',
  'Транзакция добавлена': 'Транзакция добавлена',
  'Транзакция удалена': 'Транзакция удалена',
  'Изменена ставка клиента': 'Изменена ставка клиента',
  'Одобрено': 'Одобрено',
  'Отклонено': 'Отклонено',
  'Оплата подтверждена': 'Оплата подтверждена',
  'Маршрут изменён': 'Маршрут изменён',
  'Маршрут удалён': 'Маршрут удалён',
  'Сделка отредактирована': 'Сделка отредактирована',
  'created': 'Создано',
  'updated': 'Обновлено',
  'status_changed': 'Статус изменён',
  'transaction_added': 'Транзакция добавлена',
  'transaction_removed': 'Транзакция удалена',
  'client_rate_changed': 'Изменена ставка клиента',
  'approved': 'Одобрено',
  'rejected': 'Отклонено',
  'payment_confirmed': 'Оплата подтверждена',
};

export function AccountantView() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedDeal, setSelectedDeal] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'calculation' | 'execution'>('calculation');

  // Фильтры/сортировка для общего списка сделок
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('');
  const [accountFilter, setAccountFilter] = useState<string>('');
  
  // Для редактирования ставки клиента
  const [editingClientRate, setEditingClientRate] = useState(false);
  const [newClientRate, setNewClientRate] = useState('');
  
  // Для показа/скрытия истории
  const [showHistory, setShowHistory] = useState(false);

  // Загружаем клиентов для фильтра
  const { data: clients } = useQuery({
    queryKey: ['reference-clients'],
    queryFn: async () => {
      const response = await api.get('/api/reference/clients');
      return response.data;
    },
  });

  const { data: allDealsForFiltering } = useQuery<Deal[]>({
    queryKey: ['deals', 'accountant', 'all-for-filtering', clientFilter, companyFilter, accountFilter],
    queryFn: async () => {
      const params: any = {};
      if (clientFilter !== 'all') {
        params.client_id = parseInt(clientFilter);
      }
      if (companyFilter) {
        params.company_name = companyFilter;
      }
      if (accountFilter) {
        params.account_number = accountFilter;
      }
      const response = await api.get('/api/deals', { params });
      return response.data;
    },
  });

  const dealsQueue = allDealsForFiltering?.filter((deal) => {
    if (viewMode === 'calculation') {
      return deal.status === 'senior_manager_approved' || 
             deal.status === 'client_agreed_to_pay' ||
             deal.status === 'awaiting_client_payment';
    } else {
      return deal.status === 'execution' || 
             deal.status === 'client_partially_paid';
    }
  });

  const isLoading = !allDealsForFiltering;

  // Получаем остатки по счетам для проведения транзакций
  const { data: accountBalances } = useQuery({
    queryKey: ['account-balances'],
    queryFn: async () => {
      const response = await api.get('/api/account-balances');
      return response.data;
    },
  });

  // Получаем задолженности клиентов
  const { data: clientDebts } = useQuery<Deal[]>({
    queryKey: ['client-debts'],
    queryFn: async () => {
      const response = await api.get('/api/accountant/client-debts');
      return response.data;
    },
  });

  const allDeals = allDealsForFiltering;

  const { data: dealDetail } = useQuery<DealWithHistory>({
    queryKey: ['deal', selectedDeal],
    queryFn: async () => {
      const response = await api.get(`/api/deals/${selectedDeal}?include_history=true`);
      return response.data;
    },
    enabled: !!selectedDeal,
  });

  // Загружаем расчёт дохода
  const { data: dealIncome, refetch: refetchIncome } = useQuery<DealIncome>({
    queryKey: ['deal-income', selectedDeal],
    queryFn: async () => {
      const response = await api.get(`/api/deals/${selectedDeal}/income`);
      return response.data;
    },
    enabled: !!selectedDeal,
  });

  // Справочники
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

  const { data: clientCompanies } = useQuery<Company[]>({
    queryKey: ['reference-all-companies'],
    queryFn: async () => {
      const companiesResponse = await api.get('/api/reference/clients');
      const allCompanies: Company[] = [];
      for (const client of companiesResponse.data) {
        try {
          const comps = await api.get(`/api/reference/companies?client_id=${client.id}`);
          allCompanies.push(...comps.data);
        } catch { /* ignore */ }
      }
      return allCompanies;
    },
  });

  const { data: companyAccounts } = useQuery<CompanyAccount[]>({
    queryKey: ['company-accounts-all'],
    queryFn: async () => {
      const response = await api.get('/api/reference/company-accounts');
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

  const { data: cryptoBalances } = useQuery({
    queryKey: ['crypto-balances'],
    queryFn: async () => {
      const response = await api.get('/api/account-balances');
      return response.data;
    },
  });

  // Хелперы
  const getInternalCompanyName = (id: number | null) => {
    if (!id) return null;
    return internalCompanies?.find(c => c.id === id)?.name || `ID: ${id}`;
  };

  const getInternalAccountInfo = (id: number | null) => {
    if (!id) return null;
    const acc = internalAccounts?.find(a => a.id === id);
    return acc ? { name: acc.account_name, number: acc.account_number, currency: acc.currency } : null;
  };

  const getClientCompanyName = (id: number | null) => {
    if (!id) return null;
    return clientCompanies?.find(c => c.id === id)?.name || `ID: ${id}`;
  };

  const getClientCompanyAccountInfo = (companyId: number | null) => {
    if (!companyId) return null;
    const accounts = companyAccounts?.filter(a => a.company_id === companyId) || [];
    return accounts.length > 0 ? accounts[0] : null;
  };

  const getCommissionLabel = (id: number | null) => {
    if (!id) return null;
    const comm = routeCommissions?.find(c => c.id === id);
    if (!comm) return `ID: ${id}`;
    return `${comm.commission_percent}%`;
  };

  const getCryptoAccountName = (id: number | null) => {
    if (!id) return null;
    const acc = cryptoBalances?.find((a: { id: number; account_name: string }) => a.id === id);
    return acc?.account_name || `ID: ${id}`;
  };

  const executeTransactionMutation = useMutation({
    mutationFn: async ({ transactionId, accountBalanceId }: { transactionId: number; accountBalanceId: number }) => {
      const response = await api.post(`/api/transactions/${transactionId}/execute?account_balance_id=${accountBalanceId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', selectedDeal] });
      queryClient.invalidateQueries({ queryKey: ['deals', 'accountant'] });
      queryClient.invalidateQueries({ queryKey: ['account-balances'] });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      await api.post(`/api/transactions/${transactionId}/mark-paid`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', selectedDeal] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
  });

  // Можно добавить endpoint для отклонения сделки если нужно
  // const rejectDealMutation = useMutation({...});

  const updateClientRateMutation = useMutation({
    mutationFn: async ({ dealId, newRate }: { dealId: number; newRate: string }) => {
      await api.patch(`/api/deals/${dealId}/client-rate`, { client_rate_percent: newRate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', selectedDeal] });
      queryClient.invalidateQueries({ queryKey: ['deal-income', selectedDeal] });
      setEditingClientRate(false);
      refetchIncome();
    },
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  const handleSaveClientRate = () => {
    if (newClientRate && selectedDeal) {
      updateClientRateMutation.mutate({ dealId: selectedDeal, newRate: newClientRate });
    }
  };

  return (
    <div className="px-4 py-6">
      {/* Блок остатков компаний */}
      <CompanyBalancesDisplay showProjected={true} />
      
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Бухгалтер</h1>
        <div className="flex space-x-2">
          <Link
            to="/deals/new"
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            + Создать сделку
          </Link>
          <Link
            to="/debts"
            className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
          >
            Долги ({clientDebts?.length || 0})
          </Link>
          <button
            onClick={() => {
              setViewMode('calculation');
              setSelectedDeal(null);
            }}
            className={`px-4 py-2 rounded-md ${
              viewMode === 'calculation'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Одобренные сделки
          </button>
          <button
            onClick={() => {
              setViewMode('execution');
              setSelectedDeal(null);
            }}
            className={`px-4 py-2 rounded-md ${
              viewMode === 'execution'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Очередь исполнения
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          {/* Очереди расчета / исполнения */}
          <div className="bg-white shadow rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">
              {viewMode === 'calculation' ? 'Одобренные сделки' : 'Очередь исполнения'}
            </h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {dealsQueue?.map((deal) => (
                <button
                  key={deal.id}
                  onClick={() => setSelectedDeal(deal.id)}
                  className={`w-full text-left p-3 rounded-md border ${
                    selectedDeal === deal.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <p className="font-medium">Сделка #{deal.id}</p>
                  <p className="text-sm text-gray-600">{deal.client_name}</p>
                  <p className="text-sm text-gray-500">
                    {parseFloat(deal.total_eur_request).toLocaleString()} EUR
                  </p>
                </button>
              ))}
              {(!dealsQueue || dealsQueue.length === 0) && (
                <p className="text-sm text-gray-500">
                  {viewMode === 'calculation' ? 'Нет одобренных сделок' : 'Нет сделок в исполнении'}
                </p>
              )}
            </div>
          </div>

          {/* Общий список всех сделок с фильтрами */}
          <div className="bg-white shadow rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">Все сделки</h2>

            {/* Фильтры */}
            <div className="flex flex-col space-y-3 mb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded-md text-sm"
                >
                  <option value="all">Все статусы</option>
                  <option value="new">Новая</option>
                  <option value="senior_manager_review">На проверке</option>
                  <option value="senior_manager_approved">Одобрена</option>
                  <option value="senior_manager_rejected">Отклонена</option>
                  <option value="client_agreed_to_pay">Клиент согласен</option>
                  <option value="awaiting_client_payment">Ожидание оплаты</option>
                  <option value="client_partially_paid">Частичная оплата</option>
                  <option value="execution">В исполнении</option>
                  <option value="completed">Завершена</option>
                </select>

                <select
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded-md text-sm"
                >
                  <option value="all">Все клиенты</option>
                  {clients?.map((client: any) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                  placeholder="Поиск по компании..."
                  className="px-2 py-1 border border-gray-300 rounded-md text-sm"
                />

                <input
                  type="text"
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                  placeholder="Поиск по IBAN..."
                  className="px-2 py-1 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div className="flex space-x-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'date' | 'amount')}
                  className="w-1/4 px-2 py-1 border border-gray-300 rounded-md text-sm"
                >
                  <option value="date">По дате</option>
                  <option value="amount">По сумме</option>
                </select>

                <button
                  type="button"
                  onClick={() =>
                    setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))
                  }
                  className="w-1/4 px-2 py-1 border border-gray-300 rounded-md text-sm"
                >
                  {sortDirection === 'desc' ? '↓' : '↑'}
                </button>
              </div>
            </div>

            {/* Список сделок */}
            <div className="mt-4 max-h-72 overflow-y-auto space-y-2">
              {allDeals &&
                allDeals
                  .filter((deal) => {
                    if (statusFilter === 'all') return true;
                    return deal.status === statusFilter;
                  })
                  .sort((a, b) => {
                    if (sortBy === 'date') {
                      const da = new Date(a.created_at).getTime();
                      const db = new Date(b.created_at).getTime();
                      return sortDirection === 'desc' ? db - da : da - db;
                    }
                    const aa = parseFloat(a.total_eur_request);
                    const ab = parseFloat(b.total_eur_request);
                    return sortDirection === 'desc' ? ab - aa : aa - ab;
                  })
                  .map((deal) => (
                    <button
                      key={`all-${deal.id}`}
                      onClick={() => {
                        setSelectedDeal(deal.id);
                        setViewMode(
                          deal.status === 'execution' ? 'execution' : 'calculation',
                        );
                      }}
                      className={`w-full text-left p-3 rounded-md border ${
                        selectedDeal === deal.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">Сделка #{deal.id}</p>
                          <p className="text-sm text-gray-600">{deal.client_name}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(deal.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-500">
                            {parseFloat(deal.total_eur_request).toLocaleString()} EUR
                          </p>
                          <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-xs ${STATUS_LABELS[deal.status]?.color || 'bg-gray-100 text-gray-700'}`}>
                            {STATUS_LABELS[deal.status]?.label || deal.status}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}

              {(!allDeals || allDeals.length === 0) && (
                <p className="text-sm text-gray-500">Сделки не найдены</p>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedDeal && dealDetail ? (
            <div className="bg-white shadow rounded-lg p-6">
              {/* Заголовок сделки - как в DealDetail */}
              <div className="mb-6 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold">Сделка #{dealDetail.id}</h2>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_LABELS[dealDetail.status]?.color || 'bg-gray-100'}`}>
                      {STATUS_LABELS[dealDetail.status]?.label || dealDetail.status}
                    </span>
                  </div>
                  <p className="text-gray-600 text-sm mt-1">
                    Клиент: <span className="font-medium">{dealDetail.client_name}</span>
                    {' | '}
                    Создана: {new Date(dealDetail.created_at).toLocaleString('ru-RU')}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    Создал: <span className="font-medium">{dealDetail.created_by_name || dealDetail.created_by_email || `ID ${dealDetail.created_by_id}`}</span>
                    {dealDetail.manager_name && (
                      <> | Менеджер: <span className="font-medium">{dealDetail.manager_name || dealDetail.manager_email}</span></>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/deals/${dealDetail.id}`)}
                    className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                  >
                    Полный просмотр
                  </button>
                  <button
                    onClick={() => navigate(`/deals/${dealDetail.id}/edit`)}
                    className="px-3 py-1 text-sm bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
                  >
                    Редактировать
                  </button>
                </div>
              </div>

              {/* Финансовые показатели */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Финансовые показатели</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600 text-sm">Клиент получает:</span>
                      <span className="font-semibold">
                        {dealDetail.deal_amount 
                          ? parseFloat(dealDetail.deal_amount).toLocaleString('ru-RU', { maximumFractionDigits: 2 })
                          : parseFloat(dealDetail.total_eur_request).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} {dealDetail.client_receives_currency || 'EUR'}
                      </span>
                    </div>
                    
                    {/* Ставка клиента с редактированием */}
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm">Ставка клиента:</span>
                      {editingClientRate ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={newClientRate}
                            onChange={(e) => setNewClientRate(e.target.value)}
                            className="w-20 px-2 py-1 text-sm border border-gray-300 rounded"
                            placeholder="%"
                          />
                          <button
                            onClick={handleSaveClientRate}
                            disabled={updateClientRateMutation.isPending}
                            className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => setEditingClientRate(false)}
                            className="px-2 py-1 text-xs bg-gray-400 text-white rounded hover:bg-gray-500"
                          >
                            ✗
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{dealDetail.client_rate_percent || '0'}%</span>
                          <button
                            onClick={() => {
                              setNewClientRate(dealDetail.client_rate_percent || '0');
                              setEditingClientRate(true);
                            }}
                            className="text-indigo-600 hover:text-indigo-800 text-xs"
                          >
                            ✏️
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {/* Клиент отправляет и Затраты */}
                    {dealIncome && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600 text-sm">Клиент отправляет:</span>
                          <span className="font-semibold">
                            {Number(dealIncome.client_should_send).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} {dealIncome.currency}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 text-sm">Затраты на сделку:</span>
                          <span className="font-semibold text-orange-600">
                            {Number(dealIncome.deal_costs).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} {dealIncome.currency}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                  
                  {/* Доход и прибыль */}
                  {dealIncome && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <h4 className="text-xs font-medium text-gray-500 mb-2">Доход и прибыль</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600 text-sm">Доход:</span>
                          <span className={`font-semibold ${dealIncome.is_profitable ? 'text-green-600' : 'text-red-600'}`}>
                            {Number(dealIncome.income_amount).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} {dealIncome.currency}
                            {' '}({Number(dealIncome.income_percent).toFixed(2)}%)
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 text-sm">Комиссия менеджера ({dealIncome.manager_commission_percent}%):</span>
                          <span className="font-medium">
                            {dealIncome.manager_commission_amount.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} {dealIncome.currency}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 text-sm font-medium">Чистая прибыль:</span>
                          <span className={`font-bold ${dealIncome.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {dealIncome.net_profit.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} {dealIncome.currency}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Прогресс и задолженность */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Прогресс исполнения</h3>
                  {dealDetail.transactions && (
                    <>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-600">Транзакции:</span>
                        <span className="font-medium">
                          {dealDetail.transactions.filter(t => t.status === 'paid').length} / {dealDetail.transactions.length} оплачено
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                        <div
                          className="bg-indigo-600 h-2 rounded-full transition-all"
                          style={{ 
                            width: `${dealDetail.transactions.length > 0 
                              ? (dealDetail.transactions.filter(t => t.status === 'paid').length / dealDetail.transactions.length) * 100 
                              : 0}%` 
                          }}
                        />
                      </div>
                    </>
                  )}
                  
                  {dealDetail.client_debt_amount && parseFloat(dealDetail.client_debt_amount) > 0 && (
                    <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
                      <p className="font-medium text-yellow-800">
                        ⚠️ Задолженность: {parseFloat(dealDetail.client_debt_amount).toLocaleString('ru-RU')} EUR
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* История сделки */}
              {dealDetail.history && dealDetail.history.length > 0 && (
                <div className="mb-6 bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">История сделки</h3>
                    <button
                      onClick={() => setShowHistory(!showHistory)}
                      className="text-indigo-600 hover:text-indigo-800 text-sm"
                    >
                      {showHistory ? 'Скрыть' : `Показать (${dealDetail.history.length})`}
                    </button>
                  </div>
                  {showHistory && (
                    <div className="space-y-4 max-h-80 overflow-y-auto">
                      {dealDetail.history.map((h) => {
                        // Format role capitalization: manager -> Manager, senior_manager -> Senior Manager
                        const roleDisplay = h.user_role
                          ? h.user_role
                              .split('_')
                              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                              .join(' ')
                          : 'Unknown';
                        
                        const userDisplay = h.user_name ? `${h.user_name} – ${roleDisplay}` : `User #${h.user_id}`;
                        
                        // Check if this is a consolidated edit with structured data
                        const isConsolidatedEdit = h.changes && 'type' in h.changes && h.changes.type === 'consolidated_edit';
                        const consolidatedChanges = isConsolidatedEdit ? (h.changes as ConsolidatedChanges) : null;
                        
                        // Route color mapping
                        const getRouteColorClasses = (color: string) => {
                          const colorMap: Record<string, string> = {
                            blue: 'text-blue-700',
                            green: 'text-green-700',
                            purple: 'text-purple-700',
                            yellow: 'text-yellow-700',
                            gray: 'text-gray-700'
                          };
                          return colorMap[color] || 'text-gray-700';
                        };
                        
                        const routeTypeRu: Record<string, string> = {
                          direct: 'Прямой перевод',
                          exchange: 'Биржа',
                          partner: 'Партнёр',
                          partner_50_50: 'Партнёр 50-50'
                        };
                        
                        return (
                          <div key={h.id} className="border-l-2 border-indigo-200 pl-3 py-2">
                            {/* Header: Action + User + Time */}
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <span className="text-sm font-medium text-gray-800">
                                  {ACTION_LABELS[h.action] || h.action}:
                                </span>
                                <span className="text-xs text-gray-600 ml-2">
                                  {userDisplay}
                                </span>
                              </div>
                              <span className="text-xs text-gray-400">
                                {new Date(h.created_at).toLocaleString('ru-RU')}
                              </span>
                            </div>
                            
                            {/* Consolidated Edit Display */}
                            {consolidatedChanges && (
                              <div className="space-y-3 text-xs">
                                {/* Client Rate Change */}
                                {consolidatedChanges.client_rate && (
                                  <div>
                                    <span className="text-gray-700">Ставка клиента: </span>
                                    <span className="text-red-600">{consolidatedChanges.client_rate.old}%</span>
                                    <span className="text-gray-500"> → </span>
                                    <span className="text-green-600">{consolidatedChanges.client_rate.new}%</span>
                                  </div>
                                )}
                                
                                {/* Deleted Routes */}
                                {consolidatedChanges.deleted_routes && consolidatedChanges.deleted_routes.length > 0 && (
                                  <div className="text-gray-700">
                                    {consolidatedChanges.deleted_routes.map((rt, idx) => (
                                      <div key={idx}>
                                        <span className="text-red-600">✕ Удалён маршрут: </span>
                                        <span className="font-semibold">{routeTypeRu[rt] || rt}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                {/* New Routes */}
                                {consolidatedChanges.new_routes && consolidatedChanges.new_routes.length > 0 && (
                                  <div className="text-gray-700">
                                    {consolidatedChanges.new_routes.map((rt, idx) => (
                                      <div key={idx}>
                                        <span className="text-green-600">✓ Добавлен маршрут: </span>
                                        <span className="font-semibold">{routeTypeRu[rt] || rt}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                {/* Route Changes */}
                                {consolidatedChanges.routes && consolidatedChanges.routes.length > 0 && (
                                  <div className="space-y-2">
                                    {consolidatedChanges.routes.map((route, routeIdx) => (
                                      <div key={routeIdx}>
                                        <div className={`font-bold ${getRouteColorClasses(route.route_color)}`}>
                                          Маршрут: {route.route_type_ru}
                                        </div>
                                        <div className="pl-3 space-y-0.5">
                                          {route.fields.map((field, fieldIdx) => (
                                            <div key={fieldIdx}>
                                              <span className="text-gray-700">{field.name}: </span>
                                              <span className="text-red-600">{field.old}</span>
                                              <span className="text-gray-500"> → </span>
                                              <span className="text-green-600">{field.new}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                {/* Totals Recalculated */}
                                {consolidatedChanges.totals?.has_changes && (
                                  <div className="mt-2 pt-2 border-t border-gray-200">
                                    <div className="font-medium text-gray-700 mb-1">Итого пересчитано:</div>
                                    <div className="pl-2 space-y-0.5">
                                      {consolidatedChanges.totals.fields.map((field, idx) => (
                                        <div key={idx}>
                                          <span className="text-gray-600">• {field.name}: </span>
                                          <span className="text-red-600">{field.old}</span>
                                          <span className="text-gray-500"> → </span>
                                          <span className="text-green-600">{field.new}</span>
                                          <span className="text-gray-500 ml-1">{field.currency}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* Fallback: Plain text comment (for old history entries or non-consolidated) */}
                            {!consolidatedChanges && h.comment && (
                              <div className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">
                                {h.comment.split('\n').map((line, idx) => {
                                  // Check if line contains arrow for old → new format
                                  if (line.includes(' → ')) {
                                    const colonIdx = line.indexOf(':');
                                    if (colonIdx > 0) {
                                      const fieldName = line.substring(0, colonIdx);
                                      const rest = line.substring(colonIdx + 1).trim();
                                      const [oldVal, newVal] = rest.split(' → ');
                                      return (
                                        <div key={idx}>
                                          <span className="text-gray-700">{fieldName}: </span>
                                          <span className="text-red-600">{oldVal}</span>
                                          <span className="text-gray-500"> → </span>
                                          <span className="text-green-600">{newVal}</span>
                                        </div>
                                      );
                                    }
                                    const parts = line.split(' → ');
                                    return (
                                      <div key={idx}>
                                        <span className="text-red-600">{parts[0]}</span>
                                        <span className="text-gray-500"> → </span>
                                        <span className="text-green-600">{parts[1]}</span>
                                      </div>
                                    );
                                  }
                                  // Check if it's a route header
                                  if (line.startsWith('Маршрут:')) {
                                    return <div key={idx} className="font-semibold text-gray-800 mt-1">{line}</div>;
                                  }
                                  // Check if it's a totals header
                                  if (line === 'Итого пересчитано:') {
                                    return <div key={idx} className="font-medium text-gray-700 mt-2 border-t border-gray-200 pt-1">{line}</div>;
                                  }
                                  return <div key={idx}>{line}</div>;
                                })}
                              </div>
                            )}
                            
                            {/* Legacy changes display (for old-style history entries without structured data) */}
                            {!consolidatedChanges && h.changes && !('type' in h.changes) && Object.keys(h.changes).length > 0 && (
                              <div className="mt-1 text-xs">
                                {Object.entries(h.changes as Record<string, { old: string; new: string }>).map(([field, values]) => (
                                  <div key={field}>
                                    <span className="text-gray-700">{field}: </span>
                                    <span className="text-red-600">{values.old || '—'}</span>
                                    <span className="text-gray-500"> → </span>
                                    <span className="text-green-600">{values.new || '—'}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Транзакции */}
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Транзакции и маршруты</h3>
                
                {/* Группируем транзакции по client_company_id */}
                {(() => {
                  const grouped = dealDetail.transactions.reduce((acc, trans) => {
                    const key = trans.client_company_id || 0;
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(trans);
                    return acc;
                  }, {} as Record<number, Transaction[]>);

                  return Object.entries(grouped).map(([companyId, transactions]) => {
                    const companyName = getClientCompanyName(parseInt(companyId));
                    const companyAccount = getClientCompanyAccountInfo(parseInt(companyId));
                    
                    return (
                      <div key={companyId} className="mb-4 last:mb-0">
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                            <span className="text-sm font-medium">
                              Компания: {companyName || 'Не указана'}
                            </span>
                            {companyAccount && (
                              <span className="text-sm text-gray-500 ml-2">
                                — Счёт: {companyAccount.account_name} ({companyAccount.account_number})
                              </span>
                            )}
                          </div>
                          
                          <div className="divide-y divide-gray-100">
                            {transactions.map((trans, index) => {
                              const senderCompanyName = getInternalCompanyName(trans.internal_company_id);
                              const senderAccountInfo = getInternalAccountInfo(trans.internal_company_account_id);
                              const canExecute = dealDetail.status === 'execution' || dealDetail.status === 'client_partially_paid';
                              
                              return (
                                <div key={trans.id} className="p-4">
                                  <div className="flex justify-between items-start mb-3">
                                    <div>
                                      <span className="text-sm font-medium">
                                        Маршрут {index + 1}: {ROUTE_TYPE_LABELS[trans.route_type || ''] || trans.route_type || 'Не указан'}
                                      </span>
                                      {trans.exchange_rate && (
                                        <span className="text-xs text-gray-500 ml-2">
                                          (курс: {parseFloat(trans.exchange_rate).toFixed(4)})
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`px-2 py-1 rounded text-xs font-medium ${
                                          trans.status === 'paid'
                                            ? 'bg-green-100 text-green-800'
                                            : trans.status === 'in_progress'
                                            ? 'bg-yellow-100 text-yellow-800'
                                            : 'bg-gray-100 text-gray-800'
                                        }`}
                                      >
                                        {trans.status === 'paid' ? 'Оплачено' : trans.status === 'in_progress' ? 'В процессе' : 'Ожидание'}
                                      </span>
                                    </div>
                                  </div>
                                  
                                  {/* Информация о переводе */}
                                  {trans.route_type === 'direct' && senderCompanyName && (
                                    <div className="mb-2 p-2 bg-indigo-50 rounded text-xs">
                                      <div className="flex items-center gap-2">
                                        <div className="flex-1">
                                          <span className="text-gray-500">С компании:</span>
                                          <span className="font-medium ml-1">{senderCompanyName}</span>
                                          {senderAccountInfo && (
                                            <span className="text-gray-500 ml-1">
                                              (Счёт: {senderAccountInfo.name}, {senderAccountInfo.number})
                                            </span>
                                          )}
                                        </div>
                                        <span className="text-indigo-500">→</span>
                                        <div className="flex-1">
                                          <span className="text-gray-500">На компанию:</span>
                                          <span className="font-medium ml-1">{companyName || 'Клиент'}</span>
                                          {companyAccount && (
                                            <span className="text-gray-500 ml-1">
                                              (Счёт: {companyAccount.account_name}, {companyAccount.account_number})
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Основные данные */}
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                                    {trans.amount_from_account && (
                                      <div className="bg-gray-50 p-2 rounded">
                                        <span className="text-gray-500 block">Сумма для клиента:</span>
                                        <span className="font-semibold text-sm">
                                          {parseFloat(trans.amount_from_account).toLocaleString('ru-RU')} {dealDetail.client_receives_currency || 'EUR'}
                                        </span>
                                      </div>
                                    )}
                                    {trans.calculated_route_income && (
                                      <div className="bg-green-50 p-2 rounded">
                                        <span className="text-gray-500 block">Route Income:</span>
                                        <span className="font-semibold text-sm text-green-700">
                                          {parseFloat(trans.calculated_route_income).toLocaleString('ru-RU')} {dealDetail.client_sends_currency || 'USDT'}
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Direct Transfer Details */}
                                  {trans.route_type === 'direct' && (
                                    <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                                      <div className="font-medium text-blue-800 mb-1">Прямой перевод</div>
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        {trans.internal_company_id && (
                                          <div>
                                            <span className="text-gray-500">Компания:</span>
                                            <span className="font-medium ml-1">{getInternalCompanyName(trans.internal_company_id)}</span>
                                          </div>
                                        )}
                                        {trans.internal_company_account_id && (
                                          <div>
                                            <span className="text-gray-500">Счёт:</span>
                                            <span className="font-medium ml-1">{getInternalAccountInfo(trans.internal_company_account_id)?.name} ({getInternalAccountInfo(trans.internal_company_account_id)?.currency})</span>
                                          </div>
                                        )}
                                        {trans.bank_commission_id && (
                                          <div>
                                            <span className="text-gray-500">Комиссия банка:</span>
                                            <span className="font-medium ml-1">{getCommissionLabel(trans.bank_commission_id)}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Exchange Details */}
                                  {trans.route_type === 'exchange' && (
                                    <div className="mt-2 p-2 bg-green-50 rounded text-xs">
                                      <div className="font-medium text-green-800 mb-1">Биржа</div>
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        {trans.crypto_account_id && (
                                          <div>
                                            <span className="text-gray-500">Крипто счёт:</span>
                                            <span className="font-medium ml-1">{getCryptoAccountName(trans.crypto_account_id)}</span>
                                          </div>
                                        )}
                                        {trans.exchange_from_currency && (
                                          <div>
                                            <span className="text-gray-500">Валюта:</span>
                                            <span className="font-medium ml-1">{trans.exchange_from_currency}</span>
                                          </div>
                                        )}
                                        {trans.exchange_amount && (
                                          <div>
                                            <span className="text-gray-500">Exchange Amount:</span>
                                            <span className="font-medium ml-1">{parseFloat(trans.exchange_amount).toLocaleString('ru-RU')}</span>
                                          </div>
                                        )}
                                        {trans.crypto_exchange_rate && (
                                          <div>
                                            <span className="text-gray-500">Крипто курс:</span>
                                            <span className="font-medium ml-1">{parseFloat(trans.crypto_exchange_rate).toFixed(4)}</span>
                                          </div>
                                        )}
                                      </div>
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                                        {trans.agent_commission_id && (
                                          <div>
                                            <span className="text-gray-500">Agent:</span>
                                            <span className="font-medium ml-1">{getCommissionLabel(trans.agent_commission_id)}</span>
                                          </div>
                                        )}
                                        {trans.exchange_commission_id && (
                                          <div>
                                            <span className="text-gray-500">Exchange:</span>
                                            <span className="font-medium ml-1">{getCommissionLabel(trans.exchange_commission_id)}</span>
                                          </div>
                                        )}
                                        {trans.exchange_bank_commission_id && (
                                          <div>
                                            <span className="text-gray-500">Bank:</span>
                                            <span className="font-medium ml-1">{getCommissionLabel(trans.exchange_bank_commission_id)}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Partner Details */}
                                  {trans.route_type === 'partner' && (
                                    <div className="mt-2 p-2 bg-purple-50 rounded text-xs">
                                      <div className="font-medium text-purple-800 mb-1">Партнёр</div>
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        {trans.partner_company_id && (
                                          <div>
                                            <span className="text-gray-500">Партнёр:</span>
                                            <span className="font-medium ml-1">{getInternalCompanyName(trans.partner_company_id)}</span>
                                          </div>
                                        )}
                                        {trans.amount_to_partner_usdt && (
                                          <div>
                                            <span className="text-gray-500">Партнёру (USDT):</span>
                                            <span className="font-medium ml-1">{parseFloat(trans.amount_to_partner_usdt).toLocaleString('ru-RU')}</span>
                                          </div>
                                        )}
                                        {trans.amount_partner_sends && (
                                          <div>
                                            <span className="text-gray-500">Партнёр отправит:</span>
                                            <span className="font-medium ml-1">{parseFloat(trans.amount_partner_sends).toLocaleString('ru-RU')}</span>
                                          </div>
                                        )}
                                        {trans.partner_commission_id && (
                                          <div>
                                            <span className="text-gray-500">Комиссия:</span>
                                            <span className="font-medium ml-1">{getCommissionLabel(trans.partner_commission_id)}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Partner 50-50 Details */}
                                  {trans.route_type === 'partner_50_50' && (
                                    <div className="mt-2 p-2 bg-yellow-50 rounded text-xs">
                                      <div className="font-medium text-yellow-800 mb-1">Партнёр 50-50</div>
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        {trans.partner_50_50_company_id && (
                                          <div>
                                            <span className="text-gray-500">Партнёр:</span>
                                            <span className="font-medium ml-1">{getInternalCompanyName(trans.partner_50_50_company_id)}</span>
                                          </div>
                                        )}
                                        {trans.amount_to_partner_50_50_usdt && (
                                          <div>
                                            <span className="text-gray-500">Партнёру (USDT):</span>
                                            <span className="font-medium ml-1">{parseFloat(trans.amount_to_partner_50_50_usdt).toLocaleString('ru-RU')}</span>
                                          </div>
                                        )}
                                        {trans.amount_partner_50_50_sends && (
                                          <div>
                                            <span className="text-gray-500">Партнёр отправит:</span>
                                            <span className="font-medium ml-1">{parseFloat(trans.amount_partner_50_50_sends).toLocaleString('ru-RU')}</span>
                                          </div>
                                        )}
                                        {trans.partner_50_50_commission_id && (
                                          <div>
                                            <span className="text-gray-500">Комиссия:</span>
                                            <span className="font-medium ml-1">{getCommissionLabel(trans.partner_50_50_commission_id)}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* Кнопки проведения/оплаты */}
                                  {trans.status !== 'paid' && (
                                    <div className="mt-3 pt-3 border-t border-gray-100">
                                      {canExecute ? (
                                        <TransactionExecutionControls
                                          transaction={trans}
                                          accountBalances={accountBalances}
                                          onExecute={executeTransactionMutation}
                                          onMarkPaid={markPaidMutation}
                                        />
                                      ) : (
                                        <div className="px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800">
                                          ⚠️ Ожидание подтверждения оплаты от менеджера
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}

                {dealDetail.transactions.length === 0 && (
                  <p className="text-center text-gray-500 py-4">Нет транзакций</p>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white shadow rounded-lg p-6 text-center text-gray-500">
              Выберите сделку для просмотра деталей
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Компонент управления выполнением транзакции
function TransactionExecutionControls({ 
  transaction, 
  accountBalances, 
  onExecute, 
  onMarkPaid 
}: {
  transaction: Transaction;
  accountBalances: any[];
  onExecute: any;
  onMarkPaid: any;
}) {
  const [selectedBalanceId, setSelectedBalanceId] = useState<number | null>(null);

  return (
    <div className="flex items-center gap-3">
      <select
        value={selectedBalanceId || ''}
        onChange={(e) => setSelectedBalanceId(parseInt(e.target.value))}
        className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
      >
        <option value="">Выберите счёт для списания</option>
        {accountBalances?.map((balance: any) => (
          <option key={balance.id} value={balance.id}>
            {balance.account_name} - {parseFloat(balance.balance).toLocaleString(undefined, { maximumFractionDigits: 10 })} {balance.currency || ''}
          </option>
        ))}
      </select>
      <button
        onClick={() => {
          if (selectedBalanceId) {
            onExecute.mutate({
              transactionId: transaction.id,
              accountBalanceId: selectedBalanceId,
            });
          }
        }}
        disabled={onExecute.isPending || !selectedBalanceId}
        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 text-sm whitespace-nowrap"
      >
        {onExecute.isPending ? 'Проведение...' : '✓ Оплатить'}
      </button>
      <button
        onClick={() => onMarkPaid.mutate(transaction.id)}
        disabled={onMarkPaid.isPending}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm whitespace-nowrap"
      >
        Пометить оплаченным
      </button>
    </div>
  );
}
