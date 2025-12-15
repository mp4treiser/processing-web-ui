import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { TransactionForm } from './TransactionForm';

interface Client {
  id: number;
  name: string;
}

interface Company {
  id: number;
  client_id: number;
  name: string;
}

interface CompanyAccount {
  id: number;
  company_id: number;
  account_name: string;
  account_number: string;
}

interface Transaction {
  company_id: number | '';
  account_id: number | '';
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
    { company_id: '', account_id: '', amount_eur: 0, recipient_details: '' },
  ]);

  const { data: clients } = useQuery<Client[]>({
    queryKey: ['reference-clients'],
    queryFn: async () => {
      try {
        const response = await api.get('/api/reference/clients');
        return response.data;
      } catch (error) {
        console.error('Error fetching clients:', error);
        return [];
      }
    },
  });

  // Загружаем компании выбранного клиента
  const { data: companies } = useQuery<Company[]>({
    queryKey: ['reference-companies', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const response = await api.get(`/api/reference/companies?client_id=${clientId}`);
      return response.data;
    },
    enabled: !!clientId,
  });

  // Проверяем задолженности выбранного клиента
  const { data: clientDebts } = useQuery({
    queryKey: ['client-debts', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const response = await api.get('/api/accountant/client-debts');
      // Фильтруем по выбранному клиенту
      return response.data.filter((deal: any) => deal.client_id === clientId);
    },
    enabled: !!clientId,
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
    setTransactions([...transactions, { company_id: '', account_id: '', amount_eur: 0, recipient_details: '' }]);
  };

  const removeTransaction = (index: number) => {
    setTransactions(transactions.filter((_, i) => i !== index));
  };

  const updateTransaction = (index: number, field: keyof Transaction, value: string | number) => {
    const updated = [...transactions];
    updated[index] = { ...updated[index], [field]: value };
    
    // Если изменилась компания, сбрасываем счет
    if (field === 'company_id') {
      updated[index].account_id = '';
    }
    
    setTransactions(updated);
  };

  const calculateTotal = () => {
    return transactions.reduce((sum, t) => sum + (t.amount_eur || 0), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!clientId) {
      alert('Пожалуйста, выберите клиента');
      return;
    }

    const total = calculateTotal();
    if (Math.abs(total - parseFloat(totalEur || '0')) > 0.01) {
      alert(`Сумма транзакций (${total}) не совпадает с общей суммой (${totalEur})`);
      return;
    }

    // Валидация: проверяем, что все счета уникальны
    const accountIds = transactions
      .map(t => t.account_id)
      .filter(id => id !== '') as number[];
    
    const uniqueAccountIds = new Set(accountIds);
    if (accountIds.length !== uniqueAccountIds.size) {
      alert('Ошибка: нельзя использовать один и тот же счет дважды');
      return;
    }

    // Валидация: все транзакции должны иметь компанию и счет
    const invalidTransactions = transactions.filter(t => !t.company_id || !t.account_id);
    if (invalidTransactions.length > 0) {
      alert('Пожалуйста, выберите компанию и счет для всех транзакций');
      return;
    }

    try {
      // Получаем названия компаний и IBAN из выбранных счетов
      const transactionsWithDetails = await Promise.all(
        transactions.map(async (t) => {
          // Загружаем данные счета для получения IBAN
          const accountResponse = await api.get(`/api/reference/company-accounts/${t.account_id}`);
          const account: CompanyAccount = accountResponse.data;
          
          // Загружаем данные компании для получения названия
          const companyResponse = await api.get(`/api/reference/companies/${t.company_id}`);
          const company: Company = companyResponse.data;
          
          return {
            target_company: company.name,
            amount_eur: t.amount_eur,
            recipient_details: account.account_number || t.recipient_details || null,
          };
        })
      );

      createMutation.mutate({
        client_id: clientId,
        total_eur_request: totalEur,
        client_rate_percent: clientRate,
        transactions: transactionsWithDetails,
      });
    } catch (error) {
      console.error('Error preparing transaction data:', error);
      alert('Ошибка при подготовке данных транзакций');
    }
  };

  return (
    <div className="px-4 py-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create New Deal</h1>

      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-6">
        {/* Предупреждение о задолженности */}
        {clientDebts && clientDebts.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm font-medium text-yellow-800 mb-2">
              ⚠️ Client has debt:
            </p>
            <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
              {clientDebts.map((deal: any) => (
                <li key={deal.id}>
                  Deal #{deal.id}: {parseFloat(deal.client_debt_amount || '0').toLocaleString()} EUR
                  {' '}
                  <span className="text-xs">
                    ({Math.ceil((new Date().getTime() - new Date(deal.created_at).getTime()) / (1000 * 60 * 60 * 24))} days)
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-yellow-600 mt-2">
              It is recommended to remind the client about the debt and offer to pay it off as part of this deal.
            </p>
          </div>
        )}

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
                <TransactionForm
                  index={index}
                  transaction={trans}
                  clientId={clientId}
                  companies={companies || []}
                  transactions={transactions}
                  onUpdate={updateTransaction}
                />
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

