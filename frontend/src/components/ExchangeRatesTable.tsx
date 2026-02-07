import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ExchangeRateHistoryModal } from './ExchangeRateHistoryModal';

interface ExchangeRateAverage {
  id: number;
  currency_from: string;
  currency_to: string;
  balance: number;
  total_value: number;
  average_rate: number;
  last_updated: string;
}

interface ExchangeRatesTableProps {
  openModal: (
    transactionType: 'income' | 'expense',
    accountId: number,
    accountType: 'company' | 'crypto',
    accountName: string,
    accountCurrency: string
  ) => void;
}

export function ExchangeRatesTable({ openModal }: ExchangeRatesTableProps) {
  const [selectedPair, setSelectedPair] = useState<{ from: string; to: string } | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const { data: averages, isLoading } = useQuery<ExchangeRateAverage[]>({
    queryKey: ['exchange-rates-averages'],
    queryFn: async () => {
      const response = await api.get('/api/exchange-rates/averages');
      return response.data;
    },
  });

  const formatNumber = (value: number, decimals: number = 6) => {
    return value.toLocaleString(undefined, { 
      minimumFractionDigits: decimals, 
      maximumFractionDigits: decimals 
    });
  };

  const handleRowClick = (currencyFrom: string, currencyTo: string) => {
    setSelectedPair({ from: currencyFrom, to: currencyTo });
    setIsHistoryOpen(true);
  };

  if (isLoading) {
    return (
      <div>
        <h3 className="text-xs font-semibold mb-2 text-gray-700">Exchange Rates</h3>
        <div className="text-center py-4 text-xs text-gray-500">Loading rates...</div>
      </div>
    );
  }

  if (!averages || averages.length === 0) {
    return (
      <div>
        <h3 className="text-xs font-semibold mb-2 text-gray-700">Exchange Rates</h3>
        
        {/* Income/Expense Buttons */}
        <div className="flex space-x-2 mb-3">
          <button
            onClick={() => openModal('income', 0, 'company', 'Select Account', 'EUR')}
            className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium"
          >
            ↓ Income
          </button>
          <button
            onClick={() => openModal('expense', 0, 'company', 'Select Account', 'EUR')}
            className="flex-1 px-3 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors font-medium"
          >
            ↑ Expense
          </button>
        </div>
        
        <div className="text-center py-4 text-xs text-gray-500 border border-gray-200 rounded">
          No exchange rates yet. Add income/expense transactions to see rates.
        </div>
      </div>
    );
  }

  return (
    <>
      <div>
        <h3 className="text-xs font-semibold mb-2 text-gray-700">Exchange Rates</h3>
        
        {/* Income/Expense Buttons */}
        <div className="flex space-x-2 mb-3">
          <button
            onClick={() => openModal('income', 0, 'company', 'Select Account', 'EUR')}
            className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium"
          >
            ↓ Income
          </button>
          <button
            onClick={() => openModal('expense', 0, 'company', 'Select Account', 'EUR')}
            className="flex-1 px-3 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors font-medium"
          >
            ↑ Expense
          </button>
        </div>
        
        <div className="border border-gray-200 rounded overflow-hidden">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold text-gray-700">Currency Pair</th>
                <th className="px-2 py-1.5 text-right font-semibold text-gray-700">Average Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {averages.map((avg) => (
                <tr
                  key={avg.id}
                  onClick={() => handleRowClick(avg.currency_from, avg.currency_to)}
                  className="hover:bg-blue-50 cursor-pointer transition-colors"
                >
                  <td className="px-2 py-2 font-medium text-blue-600">
                    {avg.currency_from} → {avg.currency_to}
                  </td>
                  <td className="px-2 py-2 text-right font-semibold text-gray-900">
                    {formatNumber(avg.average_rate, 6)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="mt-2 text-xs text-gray-500 italic">
          Click on a pair to view history
        </div>
      </div>

      {selectedPair && (
        <ExchangeRateHistoryModal
          isOpen={isHistoryOpen}
          onClose={() => {
            setIsHistoryOpen(false);
            setSelectedPair(null);
          }}
          currencyFrom={selectedPair.from}
          currencyTo={selectedPair.to}
        />
      )}
    </>
  );
}

