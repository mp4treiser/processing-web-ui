import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState } from 'react';

interface DashboardStats {
  summary: {
    total_deals: number;
    completed_deals: number;
    total_eur: number;
    total_usdt: number;
    total_cost_usdt: number;
    total_profit_usdt: number;
    roi_percent: number;
    avg_profit_per_deal: number;
    total_debt_eur?: number;
    deals_with_debt?: number;
  };
  status_breakdown: Record<string, number>;
  route_breakdown: Array<{
    route: string;
    count: number;
    total_cost: number;
  }>;
  top_clients: Array<{
    name: string;
    total_volume: number;
    deal_count: number;
  }>;
  daily_stats: Array<{
    date: string;
    profit: number;
    deals: number;
  }>;
  client_debts: Array<{
    client_id: number;
    client_name: string;
    total_debt: number;
    deals_count: number;
    oldest_debt_date: string | null;
    days_since_oldest: number;
  }>;
}

export function DirectorDashboard() {
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['statistics', 'dashboard', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      const response = await api.get(`/api/statistics/dashboard?${params.toString()}`);
      return response.data;
    },
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading statistics...</div>;
  }

  if (!stats) {
    return <div className="text-center py-8">No data available</div>;
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Financial Dashboard</h1>
        
        {/* Фильтры по датам */}
        <div className="bg-white shadow rounded-lg p-4 mb-6">
          <div className="flex items-center space-x-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  const today = new Date();
                  const lastMonth = new Date();
                  lastMonth.setMonth(lastMonth.getMonth() - 1);
                  setStartDate(lastMonth.toISOString().split('T')[0]);
                  setEndDate(today.toISOString().split('T')[0]);
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Last Month
              </button>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  const today = new Date();
                  const lastWeek = new Date();
                  lastWeek.setDate(lastWeek.getDate() - 7);
                  setStartDate(lastWeek.toISOString().split('T')[0]);
                  setEndDate(today.toISOString().split('T')[0]);
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Last Week
              </button>
            </div>
          </div>
        </div>

        {/* Основные метрики */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Deals</p>
                <p className="text-2xl font-bold text-gray-900">{stats.summary.total_deals}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {stats.summary.completed_deals} completed
                </p>
              </div>
              <div className="text-3xl">📊</div>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Volume</p>
                <p className="text-2xl font-bold text-green-600">
                  {stats.summary.total_eur.toLocaleString()} EUR
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {stats.summary.total_usdt.toLocaleString()} USDT
                </p>
              </div>
              <div className="text-3xl">💰</div>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Profit</p>
                <p className="text-2xl font-bold text-green-600">
                  {stats.summary.total_profit_usdt.toLocaleString()} USDT
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Avg: {stats.summary.avg_profit_per_deal.toLocaleString()} USDT/deal
                </p>
              </div>
              <div className="text-3xl">📈</div>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">ROI</p>
                <p className={`text-2xl font-bold ${
                  stats.summary.roi_percent >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {stats.summary.roi_percent.toFixed(2)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Cost: {stats.summary.total_cost_usdt.toLocaleString()} USDT
                </p>
              </div>
              <div className="text-3xl">🎯</div>
            </div>
          </div>
        </div>

        {/* Метрика задолженностей */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white shadow rounded-lg p-6 border-l-4 border-red-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Client Debt</p>
                <p className="text-2xl font-bold text-red-600">
                  {stats.summary.total_debt_eur?.toLocaleString() || '0'} EUR
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {stats.summary.deals_with_debt || 0} deals with debt
                </p>
              </div>
              <div className="text-3xl">⚠️</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Статистика по статусам */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Deals by Status</h2>
            <div className="space-y-3">
              {Object.entries(stats.status_breakdown).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 capitalize">
                    {status.replace('_', ' ')}
                  </span>
                  <div className="flex items-center space-x-2">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-indigo-600 h-2 rounded-full"
                        style={{
                          width: `${(count / stats.summary.total_deals) * 100}%`
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium w-12 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Статистика по роутам */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Transactions by Route</h2>
            <div className="space-y-3">
              {stats.route_breakdown.map((route) => (
                <div key={route.route} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 capitalize">
                    {route.route.replace('_', ' ')}
                  </span>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-500">{route.count} transactions</span>
                    <span className="text-sm font-medium">
                      {route.total_cost.toLocaleString()} USDT
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Задолженности клиентов */}
        {stats.client_debts && stats.client_debts.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 text-red-600">Client Debts</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Client
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Total Debt (EUR)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Deals Count
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Oldest Debt
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Days Since
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {stats.client_debts.map((debt) => (
                    <tr key={debt.client_id} className={debt.days_since_oldest > 30 ? 'bg-red-50' : debt.days_since_oldest > 14 ? 'bg-yellow-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {debt.client_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-red-600">
                        {debt.total_debt.toLocaleString()} EUR
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {debt.deals_count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {debt.oldest_debt_date ? new Date(debt.oldest_debt_date).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={debt.days_since_oldest > 30 ? 'text-red-600 font-semibold' : debt.days_since_oldest > 14 ? 'text-yellow-600' : 'text-gray-500'}>
                          {debt.days_since_oldest} days
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Топ клиенты */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Top Clients</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Total Volume (EUR)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Deals Count
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Avg per Deal
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stats.top_clients.map((client, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {client.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {client.total_volume.toLocaleString()} EUR
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {client.deal_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {(client.total_volume / client.deal_count).toLocaleString()} EUR
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* График прибыли по дням */}
        {stats.daily_stats.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Daily Profit Trend</h2>
            <div className="h-64 flex items-end justify-between space-x-1">
              {stats.daily_stats.map((day) => {
                const maxProfit = Math.max(...stats.daily_stats.map(d => d.profit), 1);
                const height = (day.profit / maxProfit) * 100;
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-green-500 rounded-t hover:bg-green-600 transition-colors relative group"
                      style={{ height: `${Math.max(height, 5)}%` }}
                      title={`${new Date(day.date).toLocaleDateString()}: ${day.profit.toLocaleString()} USDT`}
                    >
                      <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                        {day.profit.toLocaleString()} USDT
                        <br />
                        {day.deals} deals
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 mt-2 transform -rotate-45 origin-top-left">
                      {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

