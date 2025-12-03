import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { useState } from 'react';

interface Deal {
  id: number;
  client_id: number;
  client_name: string | null;
  total_eur_request: string;
  total_usdt_calculated: string | null;
  status: string;
  created_at: string;
  progress: { paid: number; total: number } | null;
}

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  calculation_pending: 'bg-yellow-100 text-yellow-800',
  director_approval_pending: 'bg-purple-100 text-purple-800',
  director_rejected: 'bg-red-100 text-red-800',
  client_approval: 'bg-green-100 text-green-800',
  awaiting_payment: 'bg-orange-100 text-orange-800',
  execution: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-gray-100 text-gray-800',
};

export function Dashboard() {
  const { user } = useAuth();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const { data: deals, isLoading } = useQuery<Deal[]>({
    queryKey: ['deals'],
    queryFn: async () => {
      // Бэкенд уже сортирует по дате (последние сверху) и ограничивает выборку.
      const response = await api.get('/api/deals', {
        params: {
          limit: 100,
          offset: 0,
        },
      });
      return response.data;
    },
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  const filteredDeals = (deals || [])
    .filter((deal) => {
      if (statusFilter !== 'all') {
        if (user?.role === 'manager') {
          // Для менеджера оставляем текущую логику статусов (упрощённо)
          return true;
        }
        return deal.status === statusFilter;
      }
      return true;
    })
    .filter((deal) => {
      if (!dateFrom && !dateTo) return true;
      const created = new Date(deal.created_at).getTime();
      if (dateFrom) {
        const from = new Date(dateFrom).getTime();
        if (created < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1;
        if (created > to) return false;
      }
      return true;
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
    });

  return (
    <div className="px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Welcome, {user?.full_name || user?.email}</p>
      </div>

      {user?.role === 'manager' && (
        <div className="mb-6">
          <Link
            to="/deals/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
          >
            + New Deal
          </Link>
        </div>
      )}

      {user && (user.role === 'accountant' || user.role === 'director') && (
        <div className="mb-4 bg-white shadow rounded-md p-4">
          <h2 className="text-md font-semibold mb-3">Filters</h2>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded-md text-sm"
              >
                <option value="all">All</option>
                <option value="new">New</option>
                <option value="calculation_pending">Calculation pending</option>
                <option value="director_approval_pending">Director approval</option>
                <option value="director_rejected">Director rejected</option>
                <option value="client_approval">Client approval</option>
                <option value="awaiting_payment">Awaiting payment</option>
                <option value="execution">Execution</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date from</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date to</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Sort</label>
              <div className="flex space-x-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'date' | 'amount')}
                  className="px-2 py-1 border border-gray-300 rounded-md text-sm"
                >
                  <option value="date">By date</option>
                  <option value="amount">By amount</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))
                  }
                  className="px-2 py-1 border border-gray-300 rounded-md text-sm"
                >
                  {sortDirection === 'desc' ? '↓' : '↑'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {filteredDeals.map((deal) => (
            <li key={deal.id}>
              <Link
                to={`/deals/${deal.id}`}
                className="block hover:bg-gray-50 px-4 py-4 sm:px-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div>
                      <p className="text-sm font-medium text-indigo-600 truncate">
                        Deal #{deal.id} - {deal.client_name || 'Unknown Client'}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {parseFloat(deal.total_eur_request).toLocaleString()} EUR
                        {deal.total_usdt_calculated && (
                          <span className="ml-2">
                            → {parseFloat(deal.total_usdt_calculated).toLocaleString()} USDT
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    {deal.progress && (
                      <div className="text-sm text-gray-500">
                        {deal.progress.paid}/{deal.progress.total} paid
                      </div>
                    )}
                    {user?.role === 'manager' ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {deal.status === 'new' ? 'New' : 
                         deal.status === 'client_approval' ? 'Awaiting Client' :
                         deal.status === 'awaiting_payment' ? 'Awaiting Payment' :
                         deal.status === 'execution' ? 'In Progress' :
                         deal.status === 'completed' ? 'Completed' : 'Active'}
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          statusColors[deal.status] || 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {deal.status.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        {(!deals || deals.length === 0) && (
          <div className="text-center py-8 text-gray-500">No deals found</div>
        )}
      </div>
    </div>
  );
}

