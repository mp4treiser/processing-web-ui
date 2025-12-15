import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Link } from 'react-router-dom';

interface Deal {
  id: number;
  client_id: number;
  client_name: string | null;
  total_eur_request: string;
  client_debt_amount: string | null;
  client_paid_amount: string | null;
  status: string;
  created_at: string;
}

export function DebtsList() {
  const { data: debts, isLoading } = useQuery<Deal[]>({
    queryKey: ['client-debts'],
    queryFn: async () => {
      const response = await api.get('/api/accountant/client-debts');
      return response.data;
    },
  });

  const calculateDaysSince = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Client Debts</h1>

      {debts && debts.length > 0 ? (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deal ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Debt</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days Since Creation</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {debts.map((deal) => {
                const debtAmount = parseFloat(deal.client_debt_amount || '0');
                const paidAmount = parseFloat(deal.client_paid_amount || '0');
                const totalAmount = parseFloat(deal.total_eur_request);
                const daysSince = calculateDaysSince(deal.created_at);
                const isLongDebt = daysSince > 30;

                return (
                  <tr
                    key={deal.id}
                    className={isLongDebt ? 'bg-red-50' : debtAmount > 0 ? 'bg-yellow-50' : ''}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <Link to={`/deals/${deal.id}`} className="text-indigo-600 hover:text-indigo-900">
                        #{deal.id}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{deal.client_name || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {totalAmount.toLocaleString()} EUR
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                      {paidAmount.toLocaleString()} EUR
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-red-600">
                      {debtAmount.toLocaleString()} EUR
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={isLongDebt ? 'text-red-600 font-semibold' : ''}>
                        {daysSince} {daysSince === 1 ? 'day' : 'days'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                        {deal.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <Link
                        to={`/deals/${deal.id}`}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <p className="text-gray-500">No debts</p>
        </div>
      )}
    </div>
  );
}

