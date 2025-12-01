import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Client {
  id: number;
  name: string;
}

interface Transaction {
  target_company: string;
  amount_eur: number;
  recipient_details?: string;
}

export function NewDeal() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState<number | ''>('');
  const [totalEur, setTotalEur] = useState<string>('');
  const [clientRate, setClientRate] = useState<string>('1.0');
  const [transactions, setTransactions] = useState<Transaction[]>([
    { target_company: '', amount_eur: 0, recipient_details: '' },
  ]);

  const { data: clients } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: async () => {
      const response = await api.get('/api/clients');
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/api/deals', data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      navigate(`/deals/${data.id}`);
    },
  });

  const addTransaction = () => {
    setTransactions([...transactions, { target_company: '', amount_eur: 0, recipient_details: '' }]);
  };

  const removeTransaction = (index: number) => {
    setTransactions(transactions.filter((_, i) => i !== index));
  };

  const updateTransaction = (index: number, field: keyof Transaction, value: string | number) => {
    const updated = [...transactions];
    updated[index] = { ...updated[index], [field]: value };
    setTransactions(updated);
  };

  const calculateTotal = () => {
    return transactions.reduce((sum, t) => sum + (t.amount_eur || 0), 0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!clientId) {
      alert('Please select a client');
      return;
    }

    const total = calculateTotal();
    if (Math.abs(total - parseFloat(totalEur || '0')) > 0.01) {
      alert(`Sum of transactions (${total}) does not match total (${totalEur})`);
      return;
    }

    createMutation.mutate({
      client_id: clientId,
      total_eur_request: totalEur,
      client_rate_percent: clientRate,
      transactions: transactions.map((t) => ({
        target_company: t.target_company,
        amount_eur: t.amount_eur,
        recipient_details: t.recipient_details || null,
      })),
    });
  };

  return (
    <div className="px-4 py-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create New Deal</h1>

      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Client *
          </label>
          <select
            value={clientId}
            onChange={(e) => setClientId(Number(e.target.value) || '')}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">Select a client</option>
            {clients?.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Total EUR Request *
            </label>
            <input
              type="number"
              step="0.01"
              value={totalEur}
              onChange={(e) => setTotalEur(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Client Rate % *
            </label>
            <input
              type="number"
              step="0.01"
              value={clientRate}
              onChange={(e) => setClientRate(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Beneficiaries (Transactions)</h2>
            <button
              type="button"
              onClick={addTransaction}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              + Add Transaction
            </button>
          </div>

          <div className="space-y-4">
            {transactions.map((trans, index) => (
              <div key={index} className="border border-gray-200 rounded-md p-4">
                <div className="flex justify-between items-start mb-3">
                  <span className="text-sm font-medium text-gray-700">Transaction {index + 1}</span>
                  {transactions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTransaction(index)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Company Name *</label>
                    <input
                      type="text"
                      value={trans.target_company}
                      onChange={(e) => updateTransaction(index, 'target_company', e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Amount EUR *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={trans.amount_eur || ''}
                      onChange={(e) => updateTransaction(index, 'amount_eur', parseFloat(e.target.value) || 0)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Recipient Details (IBAN)</label>
                  <textarea
                    value={trans.recipient_details || ''}
                    onChange={(e) => updateTransaction(index, 'recipient_details', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    rows={2}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 bg-gray-50 rounded-md">
            <p className="text-sm text-gray-700">
              <strong>Total Transactions:</strong> {calculateTotal().toLocaleString()} EUR
            </p>
            <p className="text-sm text-gray-700">
              <strong>Deal Total:</strong> {parseFloat(totalEur || '0').toLocaleString()} EUR
            </p>
            {Math.abs(calculateTotal() - parseFloat(totalEur || '0')) > 0.01 && (
              <p className="text-sm text-red-600 mt-1">
                ⚠️ Sums do not match!
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Deal'}
          </button>
        </div>
      </form>
    </div>
  );
}

