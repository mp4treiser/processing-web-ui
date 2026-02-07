import { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface IncomeExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactionType: 'income' | 'expense';
  accountId: number;
  accountType: 'company' | 'crypto'; // InternalCompanyAccount or AccountBalance
  accountName: string;
  accountCurrency: string;
}

interface ExchangeRateTransactionData {
  transaction_type: 'income' | 'expense';
  amount: number;
  currency_from: string;
  currency_to: string;
  exchange_rate: number;
  comment?: string;
  internal_company_account_id?: number;
  crypto_account_id?: number;
}

interface Account {
  id: number;
  account_name: string;
  currency: string;
  type: 'company' | 'crypto';
}

interface Currency {
  id: number;
  code: string;
  name: string;
  is_crypto: boolean;
  is_active: boolean;
}

export function IncomeExpenseModal({
  isOpen,
  onClose,
  transactionType,
  accountId,
  accountType,
  accountName,
  accountCurrency,
}: IncomeExpenseModalProps) {
  const queryClient = useQueryClient();
  
  // Fetch currencies from references
  const { data: currencies } = useQuery<Currency[]>({
    queryKey: ['currencies'],
    queryFn: async () => {
      const response = await api.get('/api/reference/currencies');
      return response.data;
    },
  });

  // Fetch all accounts for selection
  const { data: balancesData } = useQuery({
    queryKey: ['company-balances', 'summary'],
    queryFn: async () => {
      const response = await api.get('/api/company-balances/summary');
      return response.data;
    },
    enabled: accountId === 0, // Only fetch if no account is pre-selected
  });

  // Build account list
  const allAccounts: Account[] = [];
  if (balancesData && accountId === 0) {
    // Add company accounts
    balancesData.companies?.forEach((company: any) => {
      company.accounts?.forEach((account: any) => {
        allAccounts.push({
          id: account.id,
          account_name: `${company.company_name} - ${account.account_name}`,
          currency: account.currency,
          type: 'company',
        });
      });
    });
    
    // Add crypto accounts
    balancesData.crypto_balances?.forEach((crypto: any) => {
      allAccounts.push({
        id: crypto.account_id,
        account_name: crypto.account_name,
        currency: crypto.currency,
        type: 'crypto',
      });
    });
  }
  
  const [formData, setFormData] = useState({
    selectedAccountId: accountId,
    selectedAccountType: accountType,
    amount: '',
    currencyFrom: accountCurrency,
    currencyTo: 'USD',
    exchangeRate: '',
    comment: '',
  });

  // Update form when props change
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      selectedAccountId: accountId,
      selectedAccountType: accountType,
      currencyFrom: accountCurrency,
    }));
  }, [accountId, accountType, accountCurrency]);

  const createTransactionMutation = useMutation({
    mutationFn: async (data: ExchangeRateTransactionData) => {
      const endpoint = transactionType === 'income' 
        ? '/api/exchange-rates/income' 
        : '/api/exchange-rates/expense';
      const response = await api.post(endpoint, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-balances'] });
      queryClient.invalidateQueries({ queryKey: ['exchange-rates-averages'] });
      onClose();
      resetForm();
    },
  });

  const resetForm = () => {
    setFormData({
      selectedAccountId: accountId,
      selectedAccountType: accountType,
      amount: '',
      currencyFrom: accountCurrency,
      currencyTo: 'USD',
      exchangeRate: '',
      comment: '',
    });
  };

  const handleAccountChange = (selectedId: number) => {
    const account = allAccounts.find(acc => acc.id === selectedId);
    if (account) {
      setFormData({
        ...formData,
        selectedAccountId: account.id,
        selectedAccountType: account.type,
        currencyFrom: account.currency,
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (formData.selectedAccountId === 0) {
      alert('Please select an account');
      return;
    }
    
    const transactionData: ExchangeRateTransactionData = {
      transaction_type: transactionType,
      amount: parseFloat(formData.amount),
      currency_from: formData.currencyFrom,
      currency_to: formData.currencyTo,
      exchange_rate: parseFloat(formData.exchangeRate),
      comment: formData.comment || undefined,
    };

    // Set the correct account ID based on account type
    if (formData.selectedAccountType === 'company') {
      transactionData.internal_company_account_id = formData.selectedAccountId;
    } else {
      transactionData.crypto_account_id = formData.selectedAccountId;
    }

    createTransactionMutation.mutate(transactionData);
  };

  const calculatedValue = formData.amount && formData.exchangeRate
    ? (parseFloat(formData.amount) * parseFloat(formData.exchangeRate)).toFixed(4)
    : '0.00';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            {transactionType === 'income' ? 'Add Income' : 'Add Expense'}
            {accountId !== 0 && ` - ${accountName}`}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Account Selection - only show if no account pre-selected */}
          {accountId === 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formData.selectedAccountId}
                onChange={(e) => handleAccountChange(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={0}>Select an account...</option>
                {allAccounts.map((account) => (
                  <option key={`${account.type}-${account.id}`} value={account.id}>
                    {account.account_name} ({account.currency})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.0001"
              required
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter amount"
            />
          </div>

          {/* Currency From */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Currency From <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={formData.currencyFrom}
              onChange={(e) => setFormData({ ...formData, currencyFrom: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {currencies && currencies.length > 0 ? (
                currencies.map((currency) => (
                  <option key={currency.id} value={currency.code}>
                    {currency.code} - {currency.name}
                  </option>
                ))
              ) : (
                <>
                  <option value="EUR">EUR - Euro</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="GBP">GBP - British Pound</option>
                  <option value="USDT">USDT - Tether</option>
                </>
              )}
            </select>
          </div>

          {/* Currency To */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Currency To <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={formData.currencyTo}
              onChange={(e) => setFormData({ ...formData, currencyTo: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {currencies && currencies.length > 0 ? (
                currencies.map((currency) => (
                  <option key={currency.id} value={currency.code}>
                    {currency.code} - {currency.name}
                  </option>
                ))
              ) : (
                <>
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - British Pound</option>
                  <option value="USDT">USDT - Tether</option>
                </>
              )}
            </select>
          </div>

          {/* Exchange Rate */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Exchange Rate <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.000001"
              required
              value={formData.exchangeRate}
              onChange={(e) => setFormData({ ...formData, exchangeRate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., 1.175"
            />
          </div>

          {/* Calculated Value */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <div className="text-sm text-gray-600">Calculated Value:</div>
            <div className="text-lg font-semibold text-blue-700">
              {calculatedValue} {formData.currencyTo}
            </div>
          </div>

          {/* Comment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Comment (Optional)
            </label>
            <textarea
              value={formData.comment}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Optional note about this transaction"
            />
          </div>

          {/* Error Message */}
          {createTransactionMutation.isError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {(createTransactionMutation.error as any)?.response?.data?.detail || 'Failed to create transaction'}
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-3 pt-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                resetForm();
              }}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTransactionMutation.isPending}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              {createTransactionMutation.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

