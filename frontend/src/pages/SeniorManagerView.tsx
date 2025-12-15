import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Deal {
  id: number;
  client_id: number;
  client_name: string | null;
  total_eur_request: string;
  client_rate_percent: string | null;
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
  exchange_rate: string | null;
  partner_bonus_rate: string | null;
  partner_cost_rate: string | null;
  exchange_fee_percent: string | null;
  intermediary_fee_percent: string | null;
  bank_fee_fix_eur: string | null;
  bank_fee_percent: string | null;
}

export function SeniorManagerView() {
  const queryClient = useQueryClient();
  const [selectedDealId, setSelectedDealId] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [totalEurRequest, setTotalEurRequest] = useState<string>('');
  const [clientRatePercent, setClientRatePercent] = useState<string>('');
  const [transactionRoutes, setTransactionRoutes] = useState<Record<number, Partial<Transaction>>>({});

  // Получаем список сделок на проверку
  const { data: pendingDeals, isLoading } = useQuery<Deal[]>({
    queryKey: ['senior-manager-pending'],
    queryFn: async () => {
      const response = await api.get('/api/senior-manager/pending');
      return response.data;
    },
  });

  // Получаем детали выбранной сделки
  const { data: dealDetail } = useQuery<Deal>({
    queryKey: ['senior-manager-deal', selectedDealId],
    queryFn: async () => {
      if (!selectedDealId) return null;
      const response = await api.get(`/api/senior-manager/${selectedDealId}`);
      return response.data;
    },
    enabled: !!selectedDealId,
  });

  // Инициализация значений при загрузке сделки
  useEffect(() => {
    if (dealDetail) {
      setTotalEurRequest(dealDetail.total_eur_request || '');
      setClientRatePercent(dealDetail.client_rate_percent || '1.0');
      
      // Инициализируем маршруты транзакций
      const routes: Record<number, Partial<Transaction>> = {};
      dealDetail.transactions?.forEach((trans) => {
        routes[trans.id] = {
          route_type: trans.route_type || '',
          exchange_rate: trans.exchange_rate || '',
          partner_bonus_rate: trans.partner_bonus_rate || '',
          partner_cost_rate: trans.partner_cost_rate || '',
          exchange_fee_percent: trans.exchange_fee_percent || '',
          intermediary_fee_percent: trans.intermediary_fee_percent || '',
          bank_fee_fix_eur: trans.bank_fee_fix_eur || '',
          bank_fee_percent: trans.bank_fee_percent || '',
        };
      });
      setTransactionRoutes(routes);
    }
  }, [dealDetail]);

  // Функция для преобразования пустых строк в null для Decimal полей
  const parseDecimalField = (value: string | null | undefined): number | null | undefined => {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  };


  // Апрув сделки
  const approveMutation = useMutation({
    mutationFn: async (dealId: number) => {
      const response = await api.post(`/api/senior-manager/${dealId}/approve`, {
        comment: comment || undefined,
        total_eur_request: parseDecimalField(totalEurRequest),
        client_rate_percent: parseDecimalField(clientRatePercent),
        transaction_routes: Object.entries(transactionRoutes).map(([transId, route]) => ({
          transaction_id: parseInt(transId),
          route_type: route.route_type || null,
          exchange_rate: parseDecimalField(route.exchange_rate as string),
          partner_bonus_rate: parseDecimalField(route.partner_bonus_rate as string),
          partner_cost_rate: parseDecimalField(route.partner_cost_rate as string),
          exchange_fee_percent: parseDecimalField(route.exchange_fee_percent as string),
          intermediary_fee_percent: parseDecimalField(route.intermediary_fee_percent as string),
          bank_fee_fix_eur: parseDecimalField(route.bank_fee_fix_eur as string),
          bank_fee_percent: parseDecimalField(route.bank_fee_percent as string),
        })),
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['senior-manager-pending'] });
      setSelectedDealId(null);
      setComment('');
    },
  });

  // Отклонение сделки
  const rejectMutation = useMutation({
    mutationFn: async (dealId: number) => {
      const response = await api.post(`/api/senior-manager/${dealId}/reject`, {
        comment: comment,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['senior-manager-pending'] });
      setSelectedDealId(null);
      setComment('');
    },
  });

  const handleTransactionRouteChange = (transId: number, field: string, value: string) => {
    setTransactionRoutes((prev) => ({
      ...prev,
      [transId]: {
        ...prev[transId],
        [field]: value,
      },
    }));
  };

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Deal Review</h1>

      <div className="grid grid-cols-2 gap-6">
        {/* Список сделок */}
        <div className="bg-white shadow rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Pending Deals</h2>
          {pendingDeals && pendingDeals.length > 0 ? (
            <div className="space-y-2">
              {pendingDeals.map((deal) => (
                <div
                  key={deal.id}
                  onClick={() => setSelectedDealId(deal.id)}
                  className={`p-3 border rounded cursor-pointer hover:bg-gray-50 ${
                    selectedDealId === deal.id ? 'border-indigo-500 bg-indigo-50' : ''
                  }`}
                >
                  <div className="font-medium">Deal #{deal.id}</div>
                  <div className="text-sm text-gray-600">
                    Client: {deal.client_name || 'N/A'}
                  </div>
                  <div className="text-sm text-gray-600">
                    Amount: {parseFloat(deal.total_eur_request).toLocaleString()} EUR
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(deal.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No pending deals</p>
          )}
        </div>

        {/* Детали сделки */}
        {selectedDealId && dealDetail && (
          <div className="bg-white shadow rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">Deal Details #{dealDetail.id}</h2>

            <div className="space-y-4">
              {/* Основные параметры */}
              <div>
                <label className="block text-sm font-medium mb-1">Total Amount (EUR)</label>
                <input
                  type="number"
                  step="0.01"
                  value={totalEurRequest}
                  onChange={(e) => setTotalEurRequest(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Client Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={clientRatePercent}
                  onChange={(e) => setClientRatePercent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              {/* Транзакции */}
              <div>
                <h3 className="font-medium mb-2">Transactions</h3>
                <div className="space-y-3">
                  {dealDetail.transactions?.map((trans) => (
                    <div key={trans.id} className="border rounded p-3">
                      <div className="font-medium mb-2">
                        {trans.target_company} - {parseFloat(trans.amount_eur).toLocaleString()} EUR
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs mb-1">Route</label>
                          <select
                            value={transactionRoutes[trans.id]?.route_type || ''}
                            onChange={(e) =>
                              handleTransactionRouteChange(trans.id, 'route_type', e.target.value)
                            }
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          >
                            <option value="">Select...</option>
                            <option value="exchange">Exchange</option>
                            <option value="supply_partner">Supply Partner</option>
                            <option value="direct_payment">Direct Payment</option>
                            <option value="split_50_50">Split 50/50</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs mb-1">Exchange Rate</label>
                          <input
                            type="number"
                            step="0.000001"
                            value={transactionRoutes[trans.id]?.exchange_rate || ''}
                            onChange={(e) =>
                              handleTransactionRouteChange(trans.id, 'exchange_rate', e.target.value)
                            }
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        </div>
                        {/* Дополнительные поля в зависимости от маршрута */}
                        {transactionRoutes[trans.id]?.route_type === 'supply_partner' && (
                          <>
                            <div>
                              <label className="block text-xs mb-1">Partner Bonus Rate (%)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={transactionRoutes[trans.id]?.partner_bonus_rate || ''}
                                onChange={(e) =>
                                  handleTransactionRouteChange(trans.id, 'partner_bonus_rate', e.target.value)
                                }
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs mb-1">Partner Cost Rate (%)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={transactionRoutes[trans.id]?.partner_cost_rate || ''}
                                onChange={(e) =>
                                  handleTransactionRouteChange(trans.id, 'partner_cost_rate', e.target.value)
                                }
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            </div>
                          </>
                        )}
                        {transactionRoutes[trans.id]?.route_type === 'exchange' && (
                          <>
                            <div>
                              <label className="block text-xs mb-1">Exchange Fee (%)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={transactionRoutes[trans.id]?.exchange_fee_percent || ''}
                                onChange={(e) =>
                                  handleTransactionRouteChange(trans.id, 'exchange_fee_percent', e.target.value)
                                }
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs mb-1">Intermediary Fee (%)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={transactionRoutes[trans.id]?.intermediary_fee_percent || ''}
                                onChange={(e) =>
                                  handleTransactionRouteChange(trans.id, 'intermediary_fee_percent', e.target.value)
                                }
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            </div>
                          </>
                        )}
                        {transactionRoutes[trans.id]?.route_type === 'direct_payment' && (
                          <>
                            <div>
                              <label className="block text-xs mb-1">Bank Fee Fix (EUR)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={transactionRoutes[trans.id]?.bank_fee_fix_eur || ''}
                                onChange={(e) =>
                                  handleTransactionRouteChange(trans.id, 'bank_fee_fix_eur', e.target.value)
                                }
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs mb-1">Bank Fee (%)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={transactionRoutes[trans.id]?.bank_fee_percent || ''}
                                onChange={(e) =>
                                  handleTransactionRouteChange(trans.id, 'bank_fee_percent', e.target.value)
                                }
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Комментарий */}
              <div>
                <label className="block text-sm font-medium mb-1">Comment</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  rows={3}
                />
              </div>

              {/* Кнопки действий */}
              <div className="flex gap-2">
                <button
                  onClick={() => approveMutation.mutate(selectedDealId)}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  disabled={approveMutation.isPending}
                >
                  Approve
                </button>
                <button
                  onClick={() => rejectMutation.mutate(selectedDealId)}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  disabled={rejectMutation.isPending || !comment}
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

