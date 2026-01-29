import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface Transaction {
  id: number;
  route_type: string | null;
  client_company_id: number | null;
  amount_for_client: string | null;
  amount_from_account: string | null;
  exchange_rate: string | null;
  // Direct
  internal_company_id: number | null;
  internal_company_account_id: number | null;
  bank_commission_id: number | null;
  // Exchange
  crypto_account_id: number | null;
  exchange_from_currency: string | null;
  exchange_amount: string | null;
  crypto_exchange_rate: string | null;
  agent_commission_id: number | null;
  exchange_commission_id: number | null;
  exchange_bank_commission_id: number | null;
  // Partner
  partner_company_id: number | null;
  amount_to_partner_usdt: string | null;
  amount_partner_sends: string | null;
  partner_commission_id: number | null;
  // Partner 50-50
  partner_50_50_company_id: number | null;
  amount_to_partner_50_50_usdt: string | null;
  amount_partner_50_50_sends: string | null;
  partner_50_50_commission_id: number | null;
  // Calculated
  calculated_route_income: string | null;
  final_income: string | null;
  // Status
  status: string;
  paid_at: string | null;
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

interface Deal {
  id: number;
  client_id: number;
  manager_id: number;
  total_eur_request: string;
  total_usdt_calculated: string | null;
  deal_amount: string | null;
  client_sends_currency: string | null;
  client_receives_currency: string | null;
  client_rate_percent: string | null;
  status: string;
  transactions: Transaction[];
  client_debt_amount: string | null;
  client_paid_amount: string | null;
  is_client_debt: boolean;
  senior_manager_comment: string | null;
  created_at: string;
  updated_at: string;
  // Создатель
  created_by_id: number | null;
  created_by_email: string | null;
  created_by_name: string | null;
  // Менеджер
  manager_email: string | null;
  manager_name: string | null;
  // История
  history?: DealHistory[];
}

interface Client {
  id: number;
  name: string;
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

export function DealDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);
  const [editingClientRate, setEditingClientRate] = useState(false);
  const [newClientRate, setNewClientRate] = useState('');

  const { data: deal, isLoading, error } = useQuery<Deal>({
    queryKey: ['deal', id],
    queryFn: async () => {
      const response = await api.get(`/api/deals/${id}?include_history=true`);
      return response.data;
    },
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ['reference-clients'],
    queryFn: async () => {
      const response = await api.get('/api/reference/clients');
      return response.data;
    },
  });

  // Загружаем справочники для отображения названий
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

  const { data: clientCompanies } = useQuery<Company[]>({
    queryKey: ['reference-all-companies'],
    queryFn: async () => {
      // Получаем уникальные компании
      const companies = await api.get('/api/reference/clients');
      const allCompanies: Company[] = [];
      for (const client of companies.data) {
        try {
          const comps = await api.get(`/api/reference/companies?client_id=${client.id}`);
          allCompanies.push(...comps.data);
        } catch { /* ignore */ }
      }
      return allCompanies;
    },
  });

  // Загружаем счета компаний клиента
  const { data: companyAccounts } = useQuery<CompanyAccount[]>({
    queryKey: ['company-accounts-all'],
    queryFn: async () => {
      const response = await api.get('/api/reference/company-accounts');
      return response.data;
    },
  });

  // Загружаем расчёт дохода
  const { data: dealIncome, refetch: refetchIncome } = useQuery<DealIncome>({
    queryKey: ['deal-income', id],
    queryFn: async () => {
      const response = await api.get(`/api/deals/${id}/income`);
      return response.data;
    },
    enabled: !!id,
  });

  // Хелперы для получения названий по ID
  const getInternalCompanyName = (companyId: number | null) => {
    if (!companyId) return null;
    return internalCompanies?.find(c => c.id === companyId)?.name || `ID: ${companyId}`;
  };

  const getInternalAccountInfo = (accountId: number | null) => {
    if (!accountId) return null;
    const acc = internalAccounts?.find(a => a.id === accountId);
    return acc ? { name: acc.account_name, number: acc.account_number, currency: acc.currency } : null;
  };

  const getInternalAccountName = (accountId: number | null) => {
    if (!accountId) return null;
    const acc = internalAccounts?.find(a => a.id === accountId);
    return acc ? `${acc.account_name} (${acc.currency})` : `ID: ${accountId}`;
  };

  const getCryptoAccountName = (accountId: number | null) => {
    if (!accountId) return null;
    const acc = cryptoBalances?.find(a => a.id === accountId);
    return acc ? `${acc.account_name} (${acc.currency})` : `ID: ${accountId}`;
  };

  const getCommissionLabel = (commId: number | null) => {
    if (!commId) return null;
    const comm = routeCommissions?.find(c => c.id === commId);
    if (!comm) return `ID: ${commId}`;
    return comm.is_fixed_currency 
      ? `${comm.commission_fixed} ${comm.currency}`
      : `${comm.commission_percent}%`;
  };

  const getClientCompanyName = (companyId: number | null) => {
    if (!companyId) return null;
    return clientCompanies?.find(c => c.id === companyId)?.name || `ID: ${companyId}`;
  };

  const getClientCompanyAccountInfo = (companyId: number | null) => {
    if (!companyId) return null;
    const accounts = companyAccounts?.filter(a => a.company_id === companyId) || [];
    return accounts.length > 0 ? accounts[0] : null;
  };

  const clientAgreedMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/api/deals/${id}/client-agreed-to-pay`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', id] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: async (data: { client_paid_amount: number; is_partial: boolean }) => {
      await api.post(`/api/deals/${id}/confirm-client-payment`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', id] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
  });

  const payDebtMutation = useMutation({
    mutationFn: async (payment_amount: number) => {
      await api.post(`/api/deals/${id}/pay-debt`, { payment_amount });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', id] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      await api.post(`/api/transactions/${transactionId}/mark-paid`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', id] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
  });

  const updateClientRateMutation = useMutation({
    mutationFn: async (newRate: string) => {
      await api.patch(`/api/deals/${id}/client-rate`, { client_rate_percent: newRate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', id] });
      queryClient.invalidateQueries({ queryKey: ['deal-income', id] });
      setEditingClientRate(false);
      refetchIncome();
    },
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Error loading deal</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!deal) {
    return <div className="text-center py-8">Deal not found</div>;
  }

  const client = clients?.find(c => c.id === deal.client_id);
  const statusInfo = STATUS_LABELS[deal.status] || { label: deal.status, color: 'bg-gray-100 text-gray-800' };
  const canClientAgreed = user?.role === 'manager' && deal.status === 'senior_manager_approved';
  const canConfirmPayment = user?.role === 'manager' && (deal.status === 'client_agreed_to_pay' || deal.status === 'awaiting_client_payment');
  const canMarkPaid = user?.role === 'accountant' && deal.status === 'execution';
  const hasDebt = deal.is_client_debt && parseFloat(deal.client_debt_amount || '0') > 0;
  const canEditClientRate = ['accountant', 'senior_manager', 'director'].includes(user?.role || '');
  
  const progress = deal.transactions
    ? {
        paid: deal.transactions.filter((t) => t.status === 'paid').length,
        total: deal.transactions.length,
      }
    : null;

  // Группируем транзакции по client_company_id для отображения
  const groupedTransactions = deal.transactions.reduce((acc, trans) => {
    const key = trans.client_company_id || 0;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(trans);
    return acc;
  }, {} as Record<number, Transaction[]>);

  const handleCopyDeal = () => {
    navigate(`/deals/new?copy_from=${deal.id}`);
  };

  const handleSaveClientRate = () => {
    if (newClientRate) {
      updateClientRateMutation.mutate(newClientRate);
    }
  };

  return (
    <div className="px-4 py-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex justify-between items-start">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-indigo-600 hover:text-indigo-800 mb-2 text-sm"
          >
            ← Назад
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Сделка #{deal.id}</h1>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>
          <p className="text-gray-600 text-sm mt-1">
            Клиент: <span className="font-medium">{client?.name || `ID ${deal.client_id}`}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {user?.role === 'accountant' && deal.status === 'execution' && (
            <button
              onClick={() => navigate(`/deals/${deal.id}/edit`)}
              className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 text-sm"
            >
              Редактировать
            </button>
          )}
          <button
            onClick={handleCopyDeal}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
          >
            Копировать сделку
          </button>
        </div>
      </div>

      {/* Main Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Financial Summary */}
        <div className="bg-white shadow rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Финансовые показатели</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600 text-sm">Клиент получает:</span>
              <span className="font-semibold">
                {deal.deal_amount 
                  ? parseFloat(deal.deal_amount).toLocaleString('ru-RU', { maximumFractionDigits: 2 })
                  : parseFloat(deal.total_eur_request).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} {deal.client_receives_currency || 'EUR'}
              </span>
            </div>
            
            {/* Ставка клиента с возможностью редактирования */}
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
                  <span className="font-medium">{deal.client_rate_percent || '0'}%</span>
                  {canEditClientRate && (
                    <button
                      onClick={() => {
                        setNewClientRate(deal.client_rate_percent || '0');
                        setEditingClientRate(true);
                      }}
                      className="text-indigo-600 hover:text-indigo-800 text-xs"
                    >
                      ✏️
                    </button>
                  )}
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
              <h3 className="text-xs font-medium text-gray-500 mb-2">Доход и прибыль</h3>
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

        {/* Progress */}
        <div className="bg-white shadow rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Прогресс исполнения</h2>
          {progress && (
            <>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Транзакции:</span>
                <span className="font-medium">{progress.paid} / {progress.total} оплачено</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all"
                  style={{ width: `${progress.total > 0 ? (progress.paid / progress.total) * 100 : 0}%` }}
                />
              </div>
            </>
          )}
          
          {/* Debt Warning */}
          {hasDebt && (
            <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
              <p className="font-medium text-yellow-800">
                ⚠️ Задолженность: {parseFloat(deal.client_debt_amount || '0').toLocaleString('ru-RU')} EUR
              </p>
              <p className="text-xs text-yellow-600 mt-1">
                Оплачено: {parseFloat(deal.client_paid_amount || '0').toLocaleString('ru-RU')} EUR
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Senior Manager Comment */}
      {deal.senior_manager_comment && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-medium text-blue-800">Комментарий главного менеджера:</p>
          <p className="text-sm text-blue-700 mt-1">{deal.senior_manager_comment}</p>
        </div>
      )}

      {/* History Section */}
      {deal.history && deal.history.length > 0 && (
        <div className="mb-6 bg-white shadow rounded-lg p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-gray-700">История сделки</h2>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-indigo-600 hover:text-indigo-800 text-sm"
            >
              {showHistory ? 'Скрыть' : `Показать (${deal.history.length})`}
            </button>
          </div>
          {showHistory && (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {deal.history.map((h) => {
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

      {/* Actions for Manager */}
      {(canClientAgreed || canConfirmPayment || (hasDebt && user?.role === 'manager')) && (
        <div className="mb-6 bg-white shadow rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Действия</h2>
          <div className="space-y-3">
            {canClientAgreed && (
              <button
                onClick={() => clientAgreedMutation.mutate()}
                disabled={clientAgreedMutation.isPending}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {clientAgreedMutation.isPending ? 'Сохранение...' : 'Клиент согласился на оплату'}
              </button>
            )}
            {canConfirmPayment && <PaymentConfirmationForm deal={deal} onConfirm={confirmPaymentMutation} />}
            {hasDebt && user?.role === 'manager' && <DebtPaymentForm deal={deal} onPay={payDebtMutation} />}
          </div>
        </div>
      )}

      {/* Transactions */}
      <div className="bg-white shadow rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Транзакции и маршруты</h2>
        
        {Object.entries(groupedTransactions).map(([companyId, transactions]) => {
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
                  <span className="text-sm text-gray-400 ml-2">
                    — {transactions.length} маршрут(ов)
                  </span>
                </div>
                
                <div className="divide-y divide-gray-100">
                  {transactions.map((trans, index) => {
                    // Получаем информацию о компании-отправителе и счёте
                    const senderCompanyName = getInternalCompanyName(trans.internal_company_id);
                    const senderAccountInfo = getInternalAccountInfo(trans.internal_company_account_id);
                    
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
                            {canMarkPaid && trans.status !== 'paid' && (
                              <button
                                onClick={() => markPaidMutation.mutate(trans.id)}
                                disabled={markPaidMutation.isPending}
                                className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                              >
                                Оплатить
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {/* Информация о переводе: с какой компании на какую */}
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
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-2">
                          {trans.amount_from_account && (
                            <div className="bg-gray-50 p-2 rounded">
                              <span className="text-gray-500 block">Сумма для клиента:</span>
                              <span className="font-semibold text-sm">
                                {parseFloat(trans.amount_from_account).toLocaleString('ru-RU')} {deal.client_receives_currency || 'EUR'}
                              </span>
                            </div>
                          )}
                          {trans.calculated_route_income && (
                            <div className="bg-green-50 p-2 rounded">
                              <span className="text-gray-500 block">Route Income:</span>
                              <span className="font-semibold text-sm text-green-700">
                                {parseFloat(trans.calculated_route_income).toLocaleString('ru-RU')} {deal.client_sends_currency || 'USDT'}
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
                                  <span className="font-medium ml-1">{getInternalAccountName(trans.internal_company_account_id)}</span>
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
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {deal.transactions.length === 0 && (
          <p className="text-center text-gray-500 py-4">Нет транзакций</p>
        )}
      </div>
    </div>
  );
}

// Payment Confirmation Form
function PaymentConfirmationForm({ deal, onConfirm }: { deal: Deal; onConfirm: any }) {
  const [isPartial, setIsPartial] = useState(false);
  const [paidAmount, setPaidAmount] = useState<string>('');

  const handleSubmit = () => {
    const amount = isPartial ? parseFloat(paidAmount) : parseFloat(deal.total_eur_request);
    onConfirm.mutate({
      client_paid_amount: amount,
      is_partial: isPartial,
    });
  };

  return (
    <div className="p-3 border border-gray-300 rounded-md bg-gray-50">
      <h3 className="font-medium mb-2 text-sm">Подтверждение оплаты</h3>
      <div className="space-y-2">
        <label className="flex items-center text-sm">
          <input
            type="checkbox"
            checked={isPartial}
            onChange={(e) => setIsPartial(e.target.checked)}
            className="mr-2"
          />
          Частичная оплата
        </label>
        {isPartial && (
          <div>
            <input
              type="number"
              step="0.01"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="Сумма оплаты (EUR)"
            />
            {paidAmount && (
              <p className="text-xs text-gray-600 mt-1">
                Задолженность: {(parseFloat(deal.total_eur_request) - parseFloat(paidAmount)).toLocaleString('ru-RU')} EUR
              </p>
            )}
          </div>
        )}
        <button
          onClick={handleSubmit}
          disabled={onConfirm.isPending || (isPartial && !paidAmount)}
          className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 text-sm"
        >
          {onConfirm.isPending ? 'Сохранение...' : 'Подтвердить оплату'}
        </button>
      </div>
    </div>
  );
}

// Debt Payment Form
function DebtPaymentForm({ deal, onPay }: { deal: Deal; onPay: any }) {
  const [paymentAmount, setPaymentAmount] = useState<string>('');

  const handleSubmit = () => {
    if (paymentAmount) {
      onPay.mutate(parseFloat(paymentAmount));
      setPaymentAmount('');
    }
  };

  return (
    <div className="p-3 border border-yellow-300 rounded-md bg-yellow-50">
      <h3 className="font-medium mb-2 text-sm">Погашение задолженности</h3>
      <div className="space-y-2">
        <input
          type="number"
          step="0.01"
          value={paymentAmount}
          onChange={(e) => setPaymentAmount(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          placeholder={`Макс: ${parseFloat(deal.client_debt_amount || '0').toLocaleString('ru-RU')} EUR`}
          max={parseFloat(deal.client_debt_amount || '0')}
        />
        <button
          onClick={handleSubmit}
          disabled={onPay.isPending || !paymentAmount || parseFloat(paymentAmount) <= 0}
          className="w-full px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 text-sm"
        >
          {onPay.isPending ? 'Обработка...' : 'Погасить'}
        </button>
      </div>
    </div>
  );
}
