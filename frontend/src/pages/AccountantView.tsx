import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState, useRef, useMemo } from 'react';

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
  partner_bonus_rate: string | null;
  partner_cost_rate: string | null;
  exchange_fee_percent: string | null;
  intermediary_fee_percent: string | null;
  bank_fee_fix_eur: string | null;
  bank_fee_percent: string | null;
}

export function AccountantView() {
  const queryClient = useQueryClient();
  const [selectedDeal, setSelectedDeal] = useState<number | null>(null);
  const [marketRate, setMarketRate] = useState<string>('1.1655');
  const [transactionValues, setTransactionValues] = useState<Record<number, any>>({});
  const initializedDealId = useRef<number | null>(null);
  const [viewMode, setViewMode] = useState<'calculation' | 'execution'>('calculation');

  // Фильтры/сортировка для общего списка сделок
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');

  // Очереди (расчет / исполнение) — как раньше
  const { data: dealsQueue, isLoading } = useQuery<Deal[]>({
    queryKey: ['deals', 'accountant', viewMode],
    queryFn: async () => {
      const statusFilter = viewMode === 'calculation' ? 'calculation_pending' : 'execution';
      const response = await api.get(`/api/deals?status_filter=${statusFilter}`);
      return response.data;
    },
  });

  // Общий список всех сделок бухгалтера (все статусы)
  const { data: allDeals } = useQuery<Deal[]>({
    queryKey: ['deals', 'accountant', 'all'],
    queryFn: async () => {
      const response = await api.get('/api/deals');
      return response.data;
    },
  });

  const { data: dealDetail } = useQuery<Deal>({
    queryKey: ['deal', selectedDeal],
    queryFn: async () => {
      const response = await api.get(`/api/deals/${selectedDeal}`);
      return response.data;
    },
    enabled: !!selectedDeal,
  });

  // Инициализируем значения транзакций через useMemo, чтобы избежать циклов
  useMemo(() => {
    const currentDealId = dealDetail?.id;
    
    if (currentDealId && viewMode === 'calculation' && initializedDealId.current !== currentDealId && dealDetail?.transactions) {
      const values: Record<number, any> = {};
      dealDetail.transactions.forEach((trans) => {
        values[trans.id] = {
          route_type: trans.route_type || '',
          exchange_rate: trans.exchange_rate || marketRate,
          partner_bonus_rate: trans.partner_bonus_rate || '0.6',
          partner_cost_rate: trans.partner_cost_rate || '0.3',
          exchange_fee_percent: trans.exchange_fee_percent || '0.3',
          intermediary_fee_percent: trans.intermediary_fee_percent || '0.1',
          bank_fee_fix_eur: trans.bank_fee_fix_eur || '30',
          bank_fee_percent: trans.bank_fee_percent || '0.3',
        };
      });
      initializedDealId.current = currentDealId;
      // Используем setTimeout, чтобы отложить setState до следующего тика
      setTimeout(() => setTransactionValues(values), 0);
    } else if ((!currentDealId || viewMode !== 'calculation') && initializedDealId.current !== null) {
      initializedDealId.current = null;
      setTimeout(() => setTransactionValues({}), 0);
    }
  }, [dealDetail?.id, dealDetail?.transactions, viewMode, marketRate]);


  const updateTransactionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await api.put(`/api/transactions/${id}`, data);
    },
    onSuccess: () => {
      // Не инвалидируем сразу, чтобы избежать циклов
      // Инвалидация произойдет после calculateAllMutation
    },
  });

  const calculateAllMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDeal) return;
      await api.post(`/api/transactions/deal/${selectedDeal}/calculate-all?market_rate=${marketRate}`);
    },
    onSuccess: () => {
      // Инвалидируем только после успешного расчета
      if (selectedDeal) {
        queryClient.invalidateQueries({ queryKey: ['deal', selectedDeal] });
        queryClient.invalidateQueries({ queryKey: ['deals'] });
      }
    },
  });

  const submitForApprovalMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/api/accountant/${selectedDeal}/submit-for-approval`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      setSelectedDeal(null);
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      await api.post(`/api/transactions/${transactionId}/mark-paid`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', selectedDeal] });
      queryClient.invalidateQueries({ queryKey: ['deals', 'accountant'] });
    },
  });

  const handleTransactionChange = (transId: number, field: string, value: any) => {
    // Обновляем локальное состояние
    const newValues = { ...transactionValues };
    if (!newValues[transId]) {
      newValues[transId] = {};
    }
    newValues[transId][field] = value;
    setTransactionValues(newValues);

    // Обновляем транзакцию на сервере
    updateTransactionMutation.mutate({
      id: transId,
      data: { [field]: value },
    });

    // Автоматически пересчитываем после небольшой задержки (debounce)
    if (selectedDeal && (field === 'route_type' || field.includes('fee') || field.includes('rate'))) {
      setTimeout(() => {
        if (selectedDeal) {
          calculateAllMutation.mutate();
        }
      }, 800);
    }
  };

  const handleMarketRateChange = (value: string) => {
    setMarketRate(value);
    // Обновляем exchange_rate для всех транзакций
    if (dealDetail?.transactions) {
      dealDetail.transactions.forEach((trans) => {
        if (trans.route_type) {
          updateTransactionMutation.mutate({
            id: trans.id,
            data: { exchange_rate: value },
          });
        }
      });
      // Пересчитываем после обновления курса
      setTimeout(() => {
        if (selectedDeal) {
          calculateAllMutation.mutate();
        }
      }, 500);
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Accountant</h1>
        <div className="flex space-x-2">
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
            Calculation Queue
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
            Execution Queue
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          {/* Очереди расчета / исполнения */}
          <div className="bg-white shadow rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">
              {viewMode === 'calculation' ? 'Pending Calculations' : 'Pending Execution'}
            </h2>
            <div className="space-y-2">
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
                  <p className="font-medium">Deal #{deal.id}</p>
                  <p className="text-sm text-gray-600">{deal.client_name}</p>
                  <p className="text-sm text-gray-500">
                    {parseFloat(deal.total_eur_request).toLocaleString()} EUR
                  </p>
                </button>
              ))}
              {(!dealsQueue || dealsQueue.length === 0) && (
                <p className="text-sm text-gray-500">
                  {viewMode === 'calculation' ? 'No pending calculations' : 'No pending executions'}
                </p>
              )}
            </div>
          </div>

          {/* Общий список всех сделок с фильтрами */}
          <div className="bg-white shadow rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">All Deals</h2>

            {/* Фильтры */}
            <div className="flex flex-col space-y-3 mb  -4">
              <div className="flex space-x-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-1/2 px-2 py-1 border border-gray-300 rounded-md text-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="new">New</option>
                  <option value="calculation_pending">Calculation pending</option>
                  <option value="director_approval_pending">Director approval</option>
                  <option value="director_rejected">Director rejected</option>
                  <option value="client_approval">Client approval</option>
                  <option value="awaiting_payment">Awaiting payment</option>
                  <option value="execution">Execution</option>
                  <option value="completed">Completed</option>
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'date' | 'amount')}
                  className="w-1/4 px-2 py-1 border border-gray-300 rounded-md text-sm"
                >
                  <option value="date">Sort by date</option>
                  <option value="amount">Sort by amount</option>
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
                          <p className="font-medium">Deal #{deal.id}</p>
                          <p className="text-sm text-gray-600">{deal.client_name}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(deal.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-500">
                            {parseFloat(deal.total_eur_request).toLocaleString()} EUR
                          </p>
                          <span className="inline-flex mt-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 capitalize">
                            {deal.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}

              {(!allDeals || allDeals.length === 0) && (
                <p className="text-sm text-gray-500">No deals found</p>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedDeal && dealDetail ? (
            <div className="space-y-6">
              {viewMode === 'calculation' ? (
                <>
                  <div className="bg-white shadow rounded-lg p-6">
                    <div className="mb-6">
                      <h2 className="text-xl font-bold">Deal #{dealDetail.id}</h2>
                      <p className="text-gray-600">{dealDetail.client_name}</p>
                      <p className="text-gray-600">
                        Total: {parseFloat(dealDetail.total_eur_request).toLocaleString()} EUR
                      </p>
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Market Rate (USDT/EUR) *
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        value={marketRate}
                        onChange={(e) => handleMarketRateChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>

                    <div className="space-y-4">
                      {dealDetail.transactions?.map((trans) => {
                        const values = transactionValues[trans.id] || {};
                        return (
                          <div key={trans.id} className="border border-gray-200 rounded-md p-4">
                            <div className="mb-3">
                              <p className="font-medium">{trans.target_company}</p>
                              <p className="text-sm text-gray-600">
                                {parseFloat(trans.amount_eur).toLocaleString()} EUR
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                IBAN: {trans.recipient_details || 'Not provided'}
                              </p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 mb-3">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Route Type *</label>
                                <select
                                  value={values.route_type || ''}
                                  onChange={(e) => handleTransactionChange(trans.id, 'route_type', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                >
                                  <option value="">Select route</option>
                                  <option value="exchange">Exchange</option>
                                  <option value="supply_partner">Supply Partner</option>
                                  <option value="direct_payment">Direct Payment</option>
                                  <option value="split_50_50">Split 50/50</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Cost USDT</label>
                                <input
                                  type="text"
                                  value={trans.cost_usdt ? parseFloat(trans.cost_usdt).toFixed(2) : ''}
                                  disabled
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-50"
                                />
                              </div>
                            </div>

                            {/* Поля в зависимости от типа роута */}
                            {values.route_type === 'exchange' && (
                              <div className="grid grid-cols-3 gap-3 mt-3">
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Exchange Fee %</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={values.exchange_fee_percent || ''}
                                    onChange={(e) => handleTransactionChange(trans.id, 'exchange_fee_percent', e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Intermediary Fee %</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={values.intermediary_fee_percent || ''}
                                    onChange={(e) => handleTransactionChange(trans.id, 'intermediary_fee_percent', e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Bank Fee (EUR)</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={values.bank_fee_fix_eur || ''}
                                    onChange={(e) => handleTransactionChange(trans.id, 'bank_fee_fix_eur', e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                  />
                                </div>
                              </div>
                            )}

                            {values.route_type === 'supply_partner' && (
                              <div className="grid grid-cols-2 gap-3 mt-3">
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Partner Bonus %</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={values.partner_bonus_rate || ''}
                                    onChange={(e) => handleTransactionChange(trans.id, 'partner_bonus_rate', e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Bank Fee %</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={values.bank_fee_percent || ''}
                                    onChange={(e) => handleTransactionChange(trans.id, 'bank_fee_percent', e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                  />
                                </div>
                              </div>
                            )}

                            {values.route_type === 'direct_payment' && (
                              <div className="mt-3">
                                <label className="block text-xs text-gray-500 mb-1">Partner Bonus %</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={values.partner_bonus_rate || ''}
                                  onChange={(e) => handleTransactionChange(trans.id, 'partner_bonus_rate', e.target.value)}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                />
                              </div>
                            )}

                            {values.route_type === 'split_50_50' && (
                              <div className="mt-3">
                                <label className="block text-xs text-gray-500 mb-1">Partner Cost %</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={values.partner_cost_rate || ''}
                                  onChange={(e) => handleTransactionChange(trans.id, 'partner_cost_rate', e.target.value)}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Итоговая панель */}
                  {dealDetail.total_usdt_calculated && (
                    <div className="bg-white shadow rounded-lg p-6">
                      <h3 className="text-lg font-semibold mb-4">Calculation Results</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-4 rounded-md">
                          <p className="text-sm text-gray-500">Total USDT (Client)</p>
                          <p className="text-xl font-bold text-green-600">
                            {typeof dealDetail.total_usdt_calculated === 'string'
                              ? parseFloat(dealDetail.total_usdt_calculated).toLocaleString()
                              : Number(dealDetail.total_usdt_calculated).toLocaleString()} USDT
                          </p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-md">
                          <p className="text-sm text-gray-500">Total Cost</p>
                          <p className="text-xl font-bold">
                            {dealDetail.total_cost_usdt
                              ? (typeof dealDetail.total_cost_usdt === 'string'
                                  ? parseFloat(dealDetail.total_cost_usdt).toLocaleString()
                                  : Number(dealDetail.total_cost_usdt).toLocaleString())
                              : 'N/A'} USDT
                          </p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-md">
                          <p className="text-sm text-gray-500">Gross Margin</p>
                          <p className="text-xl font-bold">
                            {dealDetail.gross_margin_usdt
                              ? (typeof dealDetail.gross_margin_usdt === 'string'
                                  ? parseFloat(dealDetail.gross_margin_usdt).toLocaleString()
                                  : Number(dealDetail.gross_margin_usdt).toLocaleString())
                              : 'N/A'} USDT
                          </p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-md">
                          <p className="text-sm text-gray-500">Net Profit</p>
                          <p className="text-xl font-bold text-green-600">
                            {dealDetail.net_profit_usdt
                              ? (typeof dealDetail.net_profit_usdt === 'string'
                                  ? parseFloat(dealDetail.net_profit_usdt).toLocaleString()
                                  : Number(dealDetail.net_profit_usdt).toLocaleString())
                              : 'N/A'} USDT
                          </p>
                        </div>
                        {dealDetail.partner_share_usdt && parseFloat(dealDetail.partner_share_usdt) > 0 && (
                          <div className="bg-gray-50 p-4 rounded-md">
                            <p className="text-sm text-gray-500">Partner Share</p>
                            <p className="text-xl font-bold text-orange-600">
                              {typeof dealDetail.partner_share_usdt === 'string'
                                ? parseFloat(dealDetail.partner_share_usdt).toLocaleString()
                                : Number(dealDetail.partner_share_usdt).toLocaleString()} USDT
                            </p>
                          </div>
                        )}
                        {dealDetail.effective_rate && (
                          <div className="bg-gray-50 p-4 rounded-md">
                            <p className="text-sm text-gray-500">Effective Rate</p>
                            <p className="text-xl font-bold">
                              {typeof dealDetail.effective_rate === 'string'
                                ? parseFloat(dealDetail.effective_rate).toFixed(6)
                                : Number(dealDetail.effective_rate).toFixed(6)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={() => submitForApprovalMutation.mutate()}
                      disabled={submitForApprovalMutation.isPending || !dealDetail.total_usdt_calculated}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                      {submitForApprovalMutation.isPending ? 'Submitting...' : 'Submit for Director Approval'}
                    </button>
                  </div>
                </>
              ) : (
                /* Execution mode - подтверждение транзакций */
                <div className="bg-white shadow rounded-lg p-6">
                  <div className="mb-6">
                    <h2 className="text-xl font-bold">Deal #{dealDetail.id}</h2>
                    <p className="text-gray-600">{dealDetail.client_name}</p>
                    <p className="text-gray-600">
                      Total: {parseFloat(dealDetail.total_eur_request).toLocaleString()} EUR
                    </p>
                  </div>

                  <div className="space-y-4">
                    {dealDetail.transactions?.map((trans) => (
                      <div
                        key={trans.id}
                        className={`border rounded-md p-4 ${
                          trans.status === 'paid'
                            ? 'border-green-500 bg-green-50'
                            : 'border-gray-200'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-medium">{trans.target_company}</p>
                            <p className="text-sm text-gray-600">
                              {parseFloat(trans.amount_eur).toLocaleString()} EUR
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              IBAN: {trans.recipient_details || 'Not provided'}
                            </p>
                            <p className="text-xs text-gray-500">
                              Route: {trans.route_type || 'Not set'}
                            </p>
                            <p className="text-xs text-gray-500">
                              Cost: {trans.cost_usdt ? parseFloat(trans.cost_usdt).toFixed(2) : 'N/A'} USDT
                            </p>
                          </div>
                          <div className="ml-4">
                            {trans.status === 'paid' ? (
                              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                                Paid
                              </span>
                            ) : (
                              <button
                                onClick={() => markPaidMutation.mutate(trans.id)}
                                disabled={markPaidMutation.isPending}
                                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                              >
                                {markPaidMutation.isPending ? 'Confirming...' : 'Mark as Paid'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white shadow rounded-lg p-6 text-center text-gray-500">
              Select a deal to start calculation
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
