import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState, useEffect } from 'react';

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
  transactions: Transaction[];
}

interface Transaction {
  id: number;
  target_company: string;
  amount_eur: string;
  route_type: string | null;
  profit_split_enabled: boolean;
  partner_profit_usdt: string | null;
}

export function DirectorView() {
  const queryClient = useQueryClient();
  const [selectedDeal, setSelectedDeal] = useState<number | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [editValues, setEditValues] = useState<{
    total_usdt_calculated?: string;
    total_cost_usdt?: string;
    net_profit_usdt?: string;
    gross_margin_usdt?: string;
    partner_share_usdt?: string;
  }>({});
  const [marketRate, setMarketRate] = useState<string>('1.1655');

  const { data: deals, isLoading } = useQuery<Deal[]>({
    queryKey: ['deals', 'director'],
    queryFn: async () => {
      const response = await api.get('/api/director/pending');
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

  // Инициализация значений для редактирования
  useEffect(() => {
    if (dealDetail) {
      setEditValues({
        total_usdt_calculated: dealDetail.total_usdt_calculated || '',
        total_cost_usdt: dealDetail.total_cost_usdt || '',
        net_profit_usdt: dealDetail.net_profit_usdt || '',
        gross_margin_usdt: dealDetail.gross_margin_usdt || '',
        partner_share_usdt: dealDetail.partner_share_usdt || '',
      });
      // Вычисляем market rate из effective_rate
      if (dealDetail.effective_rate && dealDetail.total_eur_request) {
        const rate = parseFloat(dealDetail.effective_rate);
        setMarketRate(rate.toFixed(4));
      }
    }
  }, [dealDetail]);

  const updateDealMutation = useMutation({
    mutationFn: async (data: any) => {
      await api.put(`/api/deals/${selectedDeal}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', selectedDeal] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/api/director/${selectedDeal}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals', 'director'] });
      setSelectedDeal(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (comment: string) => {
      await api.post(`/api/director/${selectedDeal}/reject?comment=${encodeURIComponent(comment)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals', 'director'] });
      setSelectedDeal(null);
      setRejectComment('');
    },
  });

  // Реалтайм пересчет при изменении значений
  const handleValueChange = (field: string, value: string) => {
    const newValues = { ...editValues, [field]: value };
    setEditValues(newValues);

    // Автоматический пересчет
    if (field === 'total_usdt_calculated' || field === 'total_cost_usdt') {
      const total = parseFloat(newValues.total_usdt_calculated || '0');
      const cost = parseFloat(newValues.total_cost_usdt || '0');
      const margin = total - cost;
      const partnerShare = parseFloat(newValues.partner_share_usdt || '0');
      const netProfit = margin - partnerShare;

      newValues.gross_margin_usdt = margin.toFixed(2);
      newValues.net_profit_usdt = netProfit.toFixed(2);
      setEditValues(newValues);
    }

    // Сохраняем изменения
    updateDealMutation.mutate({ [field]: value });
  };

  const calculateMargin = () => {
    const total = parseFloat(editValues.total_usdt_calculated || dealDetail?.total_usdt_calculated || '0');
    const cost = parseFloat(editValues.total_cost_usdt || dealDetail?.total_cost_usdt || '0');
    if (total === 0) return null;
    return ((total - cost) / total) * 100;
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  const margin = calculateMargin();
  const marginColor = margin !== null && margin < 0.5 ? 'text-red-600' : 'text-green-600';

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Director - Pending Approvals</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white shadow rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">Pending Approvals</h2>
            <div className="space-y-2">
              {deals?.map((deal) => (
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
              {(!deals || deals.length === 0) && (
                <p className="text-sm text-gray-500">No pending approvals</p>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedDeal && dealDetail ? (
            <div className="bg-white shadow rounded-lg p-6">
              <div className="mb-6">
                <h2 className="text-xl font-bold">Deal #{dealDetail.id}</h2>
                <p className="text-gray-600">{dealDetail.client_name}</p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Market Rate (USDT/EUR)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={marketRate}
                  onChange={(e) => setMarketRate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 p-4 rounded-md">
                  <p className="text-sm text-gray-500 mb-1">Total EUR</p>
                  <p className="text-xl font-bold">
                    {parseFloat(dealDetail.total_eur_request).toLocaleString()} EUR
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-md">
                  <p className="text-sm text-gray-500 mb-1">Total USDT (Client)</p>
                  <input
                    type="number"
                    step="0.01"
                    value={editValues.total_usdt_calculated || ''}
                    onChange={(e) => handleValueChange('total_usdt_calculated', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-lg font-bold text-green-600"
                  />
                </div>
                <div className="bg-gray-50 p-4 rounded-md">
                  <p className="text-sm text-gray-500 mb-1">Total Cost</p>
                  <input
                    type="number"
                    step="0.01"
                    value={editValues.total_cost_usdt || ''}
                    onChange={(e) => handleValueChange('total_cost_usdt', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-lg font-bold"
                  />
                </div>
                <div className="bg-gray-50 p-4 rounded-md">
                  <p className="text-sm text-gray-500 mb-1">Gross Margin</p>
                  <input
                    type="number"
                    step="0.01"
                    value={editValues.gross_margin_usdt || ''}
                    onChange={(e) => handleValueChange('gross_margin_usdt', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-lg font-bold"
                  />
                </div>
                <div className="bg-gray-50 p-4 rounded-md">
                  <p className="text-sm text-gray-500 mb-1">Net Profit</p>
                  <input
                    type="number"
                    step="0.01"
                    value={editValues.net_profit_usdt || ''}
                    onChange={(e) => handleValueChange('net_profit_usdt', e.target.value)}
                    className={`w-full px-2 py-1 border border-gray-300 rounded text-lg font-bold ${marginColor}`}
                  />
                </div>
                {parseFloat(editValues.partner_share_usdt || '0') > 0 && (
                  <div className="bg-gray-50 p-4 rounded-md">
                    <p className="text-sm text-gray-500 mb-1">Partner Share</p>
                    <input
                      type="number"
                      step="0.01"
                      value={editValues.partner_share_usdt || ''}
                      onChange={(e) => handleValueChange('partner_share_usdt', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-lg font-bold text-orange-600"
                    />
                  </div>
                )}
              </div>

              {margin !== null && (
                <div className="mb-6">
                  <p className="text-sm text-gray-500 mb-1">Margin</p>
                  <p className={`text-2xl font-bold ${marginColor}`}>
                    {margin.toFixed(2)}%
                  </p>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">Transactions</h3>
                <div className="space-y-2">
                  {dealDetail.transactions?.map((trans) => (
                    <div key={trans.id} className="border border-gray-200 rounded-md p-3">
                      <div className="flex justify-between">
                        <div>
                          <p className="font-medium">{trans.target_company}</p>
                          <p className="text-sm text-gray-600">
                            {parseFloat(trans.amount_eur).toLocaleString()} EUR - {trans.route_type}
                          </p>
                        </div>
                        {trans.profit_split_enabled && trans.partner_profit_usdt && (
                          <div className="text-sm text-orange-600">
                            Partner Share: {parseFloat(trans.partner_profit_usdt).toFixed(2)} USDT
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rejection Comment (if rejecting)
                  </label>
                  <textarea
                    value={rejectComment}
                    onChange={(e) => setRejectComment(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    rows={3}
                    placeholder="Enter reason for rejection..."
                  />
                </div>
                <div className="flex space-x-4">
                  <button
                    onClick={() => approveMutation.mutate()}
                    disabled={approveMutation.isPending}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {approveMutation.isPending ? 'Approving...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => rejectMutation.mutate(rejectComment)}
                    disabled={rejectMutation.isPending || !rejectComment}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white shadow rounded-lg p-6 text-center text-gray-500">
              Select a deal to review
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
