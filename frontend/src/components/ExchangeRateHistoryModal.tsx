import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface ExchangeRateHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currencyFrom: string;
  currencyTo: string;
}

interface HistoryItem {
  id: number;
  transaction_type: 'income' | 'expense';
  amount: number;
  exchange_rate: number;
  value_in_target_currency: number;
  balance_after: number;
  total_value_after: number;
  average_rate_after: number;
  comment: string | null;
  created_at: string;
  created_by: number;
}

export function ExchangeRateHistoryModal({
  isOpen,
  onClose,
  currencyFrom,
  currencyTo,
}: ExchangeRateHistoryModalProps) {
  const { data: history, isLoading } = useQuery<HistoryItem[]>({
    queryKey: ['exchange-rate-history', currencyFrom, currencyTo],
    queryFn: async () => {
      const response = await api.get('/api/exchange-rates/history', {
        params: { currency_from: currencyFrom, currency_to: currencyTo },
      });
      return response.data;
    },
    enabled: isOpen,
  });

  const formatNumber = (value: number, decimals: number = 4) => {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            Exchange Rate History: {currencyFrom} → {currencyTo}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading history...</div>
          ) : !history || history.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No transaction history found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border-collapse">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 border-b">Date</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-700 border-b">Type</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700 border-b">Amount</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700 border-b">Rate</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700 border-b">Value</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700 border-b">Balance After</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700 border-b">Total Value</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700 border-b">Avg Rate</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 border-b">Comment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {history.map((item, index) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                    >
                      <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                        {formatDate(item.created_at)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                            item.transaction_type === 'income'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {item.transaction_type === 'income' ? '↓ Income' : '↑ Expense'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {formatNumber(item.amount, 2)} {currencyFrom}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {formatNumber(item.exchange_rate, 6)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {formatNumber(item.value_in_target_currency, 2)} {currencyTo}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-blue-600">
                        {formatNumber(item.balance_after, 2)} {currencyFrom}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {formatNumber(item.total_value_after, 2)} {currencyTo}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-900">
                        {formatNumber(item.average_rate_after, 6)}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 max-w-xs truncate">
                        {item.comment || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t">
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm">
            <div className="font-semibold text-blue-900 mb-1">How it works:</div>
            <ul className="text-blue-700 space-y-1 text-xs">
              <li>
                <strong>Income (↓):</strong> Adds to balance and total value, recalculates average rate
              </li>
              <li>
                <strong>Expense (↑):</strong> Reduces balance and value proportionally, keeps average rate unchanged
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

