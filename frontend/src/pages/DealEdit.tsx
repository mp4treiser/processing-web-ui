import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { RouteBuilder } from '../components/RouteBuilder';
import { useAuth } from '../contexts/AuthContext';

interface Transaction {
  id: number;
  route_type: string | null;
  client_company_id: number | null;
  amount_for_client: string | null;
  amount_from_account: string | null;
  exchange_rate: string | null;
  internal_company_id: number | null;
  internal_company_account_id: number | null;
  bank_commission_id: number | null;
  crypto_account_id: number | null;
  exchange_from_currency: string | null;
  exchange_amount: string | null;
  crypto_exchange_rate: string | null;
  agent_commission_id: number | null;
  exchange_commission_id: number | null;
  exchange_bank_commission_id: number | null;
  partner_company_id: number | null;
  amount_to_partner_usdt: string | null;
  amount_partner_sends: string | null;
  partner_commission_id: number | null;
  partner_50_50_company_id: number | null;
  amount_to_partner_50_50_usdt: string | null;
  amount_partner_50_50_sends: string | null;
  partner_50_50_commission_id: number | null;
  status: string;
}

interface Deal {
  id: number;
  client_id: number;
  total_eur_request: string;
  deal_amount: string | null;
  client_sends_currency: string | null;
  client_receives_currency: string | null;
  client_rate_percent: string | null;
  status: string;
  transactions: Transaction[];
}

interface Client {
  id: number;
  name: string;
}

interface TransactionRoute {
  client_company_id: number;
  amount_for_client: number;
  routes: Route[];
  final_income?: number;
}

interface Route {
  id?: string;
  route_type: 'direct' | 'exchange' | 'partner' | 'partner_50_50' | '';
  exchange_rate: number;
  internal_company_id?: number;
  internal_company_account_id?: number;
  amount_from_account?: number;
  bank_commission_id?: number;
  crypto_account_id?: number;
  exchange_from_currency?: string;
  exchange_amount?: number;
  crypto_exchange_rate?: number;
  agent_commission_id?: number;
  exchange_commission_id?: number;
  exchange_bank_commission_id?: number;
  partner_company_id?: number;
  amount_to_partner_usdt?: number;
  amount_partner_sends?: number;
  partner_commission_id?: number;
  partner_50_50_company_id?: number;
  amount_to_partner_50_50_usdt?: number;
  amount_partner_50_50_sends?: number;
  partner_50_50_commission_id?: number;
  final_income?: number;
  // DB ID for existing routes
  db_id?: number;
}

export function DealEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [clientId, setClientId] = useState<number | ''>('');
  const [dealAmount, setDealAmount] = useState<string>('');
  const [clientSendsCurrency, setClientSendsCurrency] = useState<string>('');
  const [clientReceivesCurrency, setClientReceivesCurrency] = useState<string>('');
  const [routeTransactions, setRouteTransactions] = useState<TransactionRoute[]>([]);
  const [deletedTransactionIds, setDeletedTransactionIds] = useState<number[]>([]);

  const { data: deal, isLoading } = useQuery<Deal>({
    queryKey: ['deal', id],
    queryFn: async () => {
      const response = await api.get(`/api/deals/${id}`);
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

  const { data: currencies } = useQuery({
    queryKey: ['reference-currencies'],
    queryFn: async () => {
      const response = await api.get('/api/reference/currencies');
      return response.data;
    },
  });

  // Конвертируем транзакции из БД в формат RouteBuilder
  useEffect(() => {
    if (deal) {
      setClientId(deal.client_id);
      setDealAmount(deal.deal_amount || deal.total_eur_request || '');
      setClientSendsCurrency(deal.client_sends_currency || '');
      setClientReceivesCurrency(deal.client_receives_currency || '');

      // Группируем транзакции по client_company_id
      const grouped: Record<number, Transaction[]> = {};
      deal.transactions.forEach(t => {
        const key = t.client_company_id || 0;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(t);
      });

      // Конвертируем в формат RouteBuilder
      const converted: TransactionRoute[] = Object.entries(grouped).map(([companyId, transactions]) => ({
        client_company_id: parseInt(companyId),
        amount_for_client: transactions.reduce((sum, t) => sum + parseFloat(t.amount_from_account || '0'), 0),
        routes: transactions.map(t => ({
          id: `route-${t.id}`,
          db_id: t.id,
          route_type: (t.route_type as Route['route_type']) || '',
          exchange_rate: parseFloat(t.exchange_rate || '0'),
          internal_company_id: t.internal_company_id || undefined,
          internal_company_account_id: t.internal_company_account_id || undefined,
          amount_from_account: parseFloat(t.amount_from_account || '0') || undefined,
          bank_commission_id: t.bank_commission_id || undefined,
          crypto_account_id: t.crypto_account_id || undefined,
          exchange_from_currency: t.exchange_from_currency || undefined,
          exchange_amount: parseFloat(t.exchange_amount || '0') || undefined,
          crypto_exchange_rate: parseFloat(t.crypto_exchange_rate || '0') || undefined,
          agent_commission_id: t.agent_commission_id || undefined,
          exchange_commission_id: t.exchange_commission_id || undefined,
          exchange_bank_commission_id: t.exchange_bank_commission_id || undefined,
          partner_company_id: t.partner_company_id || undefined,
          amount_to_partner_usdt: parseFloat(t.amount_to_partner_usdt || '0') || undefined,
          amount_partner_sends: parseFloat(t.amount_partner_sends || '0') || undefined,
          partner_commission_id: t.partner_commission_id || undefined,
          partner_50_50_company_id: t.partner_50_50_company_id || undefined,
          amount_to_partner_50_50_usdt: parseFloat(t.amount_to_partner_50_50_usdt || '0') || undefined,
          amount_partner_50_50_sends: parseFloat(t.amount_partner_50_50_sends || '0') || undefined,
          partner_50_50_commission_id: t.partner_50_50_commission_id || undefined,
        })),
      }));

      setRouteTransactions(converted);
    }
  }, [deal]);

  const updateDealMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.put(`/api/deals/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', id] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      navigate(`/deals/${id}`);
    },
    onError: (error: any) => {
      alert(error.response?.data?.detail || 'Ошибка при обновлении сделки');
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!clientId || !dealAmount || routeTransactions.length === 0) {
      alert('Заполните все обязательные поля');
      return;
    }

    const data = {
      client_id: clientId,
      deal_amount: dealAmount,
      client_sends_currency: clientSendsCurrency,
      client_receives_currency: clientReceivesCurrency,
      deleted_transaction_ids: deletedTransactionIds,
      transactions: routeTransactions.map(t => ({
        client_company_id: t.client_company_id,
        amount_for_client: t.amount_for_client,
        routes: t.routes.map(r => ({
          db_id: r.db_id, // ID существующей транзакции для обновления
          route_type: r.route_type,
          exchange_rate: r.exchange_rate,
          internal_company_id: r.internal_company_id,
          internal_company_account_id: r.internal_company_account_id,
          amount_from_account: r.amount_from_account,
          bank_commission_id: r.bank_commission_id,
          crypto_account_id: r.crypto_account_id,
          exchange_from_currency: r.exchange_from_currency,
          exchange_amount: r.exchange_amount,
          crypto_exchange_rate: r.crypto_exchange_rate,
          agent_commission_id: r.agent_commission_id,
          exchange_commission_id: r.exchange_commission_id,
          exchange_bank_commission_id: r.exchange_bank_commission_id,
          partner_company_id: r.partner_company_id,
          amount_to_partner_usdt: r.amount_to_partner_usdt,
          amount_partner_sends: r.amount_partner_sends,
          partner_commission_id: r.partner_commission_id,
          partner_50_50_company_id: r.partner_50_50_company_id,
          amount_to_partner_50_50_usdt: r.amount_to_partner_50_50_usdt,
          amount_partner_50_50_sends: r.amount_partner_50_50_sends,
          partner_50_50_commission_id: r.partner_50_50_commission_id,
        })),
      })),
    };

    updateDealMutation.mutate(data);
  };

  // Обработчик обновления транзакций - отслеживаем удалённые
  const handleTransactionsUpdate = (updated: TransactionRoute[]) => {
    // Находим удалённые маршруты
    const currentDbIds = updated.flatMap(t => t.routes.filter(r => r.db_id).map(r => r.db_id!));
    const originalDbIds = routeTransactions.flatMap(t => t.routes.filter(r => r.db_id).map(r => r.db_id!));
    
    const newlyDeleted = originalDbIds.filter(id => !currentDbIds.includes(id));
    if (newlyDeleted.length > 0) {
      setDeletedTransactionIds(prev => [...new Set([...prev, ...newlyDeleted])]);
    }
    
    setRouteTransactions(updated);
  };

  if (isLoading) {
    return <div className="text-center py-8">Загрузка...</div>;
  }

  if (!deal) {
    return <div className="text-center py-8">Сделка не найдена</div>;
  }

  if (user?.role !== 'accountant') {
    return <div className="text-center py-8 text-red-600">Нет доступа</div>;
  }

  return (
    <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] px-3 py-2">
      <div className="max-w-full">
        <div className="flex justify-between items-center mb-4">
          <div>
            <button
              onClick={() => navigate(`/deals/${id}`)}
              className="text-indigo-600 hover:text-indigo-800 mb-2 text-sm"
            >
              ← Назад к сделке
            </button>
            <h1 className="text-lg font-bold text-gray-900">
              Редактирование сделки #{deal.id}
            </h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="w-full bg-white shadow rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-12 gap-4">
            {/* Левая колонка */}
            <div className="col-span-3 space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                  Клиент *
                </label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(Number(e.target.value) || '')}
                  required
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                >
                  <option value="">Выберите клиента</option>
                  {clients?.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                  Сумма для клиента *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={dealAmount}
                  onChange={(e) => setDealAmount(e.target.value)}
                  required
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                  Клиент отправляет *
                </label>
                <select
                  value={clientSendsCurrency}
                  onChange={(e) => setClientSendsCurrency(e.target.value)}
                  required
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                >
                  <option value="">Выберите валюту</option>
                  {currencies?.map((curr: any) => (
                    <option key={curr.id} value={curr.code}>
                      {curr.code} - {curr.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                  Клиент получает *
                </label>
                <select
                  value={clientReceivesCurrency}
                  onChange={(e) => setClientReceivesCurrency(e.target.value)}
                  required
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                >
                  <option value="">Выберите валюту</option>
                  {currencies?.map((curr: any) => (
                    <option key={curr.id} value={curr.code}>
                      {curr.code} - {curr.name}
                    </option>
                  ))}
                </select>
              </div>

              {deletedTransactionIds.length > 0 && (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-xs">
                  <span className="text-red-700">
                    Будет удалено маршрутов: {deletedTransactionIds.length}
                  </span>
                </div>
              )}
            </div>

            {/* Правая колонка - RouteBuilder */}
            <div className="col-span-9">
              {routeTransactions.length === 0 ? (
                <div className="text-center py-2">
                  <button
                    type="button"
                    onClick={() => setRouteTransactions([{
                      client_company_id: 0,
                      amount_for_client: 0,
                      routes: [],
                    }])}
                    className="px-3 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                  >
                    + Добавить транзакцию
                  </button>
                </div>
              ) : (
                <RouteBuilder
                  clientId={clientId as number}
                  transactions={routeTransactions}
                  onUpdate={handleTransactionsUpdate}
                  dealAmount={parseFloat(dealAmount) || undefined}
                  clientSendsCurrency={clientSendsCurrency}
                  clientReceivesCurrency={clientReceivesCurrency}
                />
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <button
              type="button"
              onClick={() => navigate(`/deals/${id}`)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={updateDealMutation.isPending}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {updateDealMutation.isPending ? 'Сохранение...' : 'Сохранить изменения'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
