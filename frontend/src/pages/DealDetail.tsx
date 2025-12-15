import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface Transaction {
  id: number;
  target_company: string;
  amount_eur: string;
  recipient_details: string | null;
  route_type: string | null;
  status: string;
  cost_usdt: string | null;
  payment_proof_file: string | null;
}

interface Deal {
  id: number;
  client_id: number;
  total_eur_request: string;
  total_usdt_calculated: string | null;
  status: string;
  transactions: Transaction[];
  client_debt_amount: string | null;
  client_paid_amount: string | null;
  is_client_debt: string | null;
  senior_manager_comment: string | null;
}

export function DealDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: deal, isLoading, error } = useQuery<Deal>({
    queryKey: ['deal', id],
    queryFn: async () => {
      try {
        const response = await api.get(`/api/deals/${id}`);
        console.log('Deal data received:', response.data);
        return response.data;
      } catch (err) {
        console.error('Error fetching deal:', err);
        throw err;
      }
    },
  });

  // Все хуки должны быть вызваны до любых условных возвратов!
  // Кнопка "Submit for Calculation" убрана - сделка автоматически видна главному менеджеру при создании

  const clientAgreedMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/api/deals/${id}/client-agreed-to-pay`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', id] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: async (data: { client_paid_amount: number; is_partial: boolean }) => {
      await api.post(`/api/deals/${id}/confirm-client-payment`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', id] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
  });

  const payDebtMutation = useMutation({
    mutationFn: async (payment_amount: number) => {
      await api.post(`/api/deals/${id}/pay-debt`, { payment_amount });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', id] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      await api.post(`/api/transactions/${transactionId}/mark-paid`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', id] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
  });

  // Теперь можно делать условные возвраты
  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Error loading deal: {error instanceof Error ? error.message : 'Unknown error'}</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!deal) {
    return <div className="text-center py-8">Deal not found</div>;
  }

  // По новой логике: сделка создается со статусом NEW и автоматически видна главному менеджеру
  // Кнопка "Submit for Calculation" больше не нужна
  const canClientAgreed = user?.role === 'manager' && deal.status === 'senior_manager_approved';
  const canConfirmPayment = user?.role === 'manager' && (deal.status === 'client_agreed_to_pay' || deal.status === 'awaiting_client_payment');
  const canMarkPaid = user?.role === 'accountant' && deal.status === 'execution';
  const hasDebt = deal.is_client_debt === 'true' && parseFloat(deal.client_debt_amount || '0') > 0;
  
  const progress = deal.transactions
    ? {
        paid: deal.transactions.filter((t) => t.status === 'paid').length,
        total: deal.transactions.length,
      }
    : null;

  return (
    <div className="px-4 py-6">
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-indigo-600 hover:text-indigo-800 mb-4"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Deal #{deal.id}</h1>
        {user?.role !== 'manager' && (
          <p className="text-gray-600">Status: {deal.status.replace('_', ' ')}</p>
        )}
      </div>

      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Deal Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Total EUR Request</p>
            <p className="text-lg font-semibold">
              {typeof deal.total_eur_request === 'string' 
                ? parseFloat(deal.total_eur_request).toLocaleString() 
                : Number(deal.total_eur_request).toLocaleString()} EUR
            </p>
          </div>
          {deal.total_usdt_calculated && (
            <div>
              <p className="text-sm text-gray-500">Total USDT Calculated</p>
              <p className="text-lg font-semibold text-green-600">
                {typeof deal.total_usdt_calculated === 'string'
                  ? parseFloat(deal.total_usdt_calculated).toLocaleString()
                  : Number(deal.total_usdt_calculated).toLocaleString()} USDT
              </p>
            </div>
          )}
        </div>

        {progress && (
          <div className="mt-4">
            <p className="text-sm text-gray-500 mb-2">
              Progress: {progress.paid}/{progress.total} transactions paid
            </p>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-indigo-600 h-2 rounded-full"
                style={{ width: `${(progress.paid / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Информация о задолженности */}
        {hasDebt && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <p className="text-sm font-medium text-yellow-800">
              ⚠️ Client Debt: {parseFloat(deal.client_debt_amount || '0').toLocaleString()} EUR
            </p>
            <p className="text-xs text-yellow-600 mt-1">
              Paid: {parseFloat(deal.client_paid_amount || '0').toLocaleString()} EUR of {parseFloat(deal.total_eur_request).toLocaleString()} EUR
            </p>
          </div>
        )}

        {/* Комментарий главного менеджера */}
        {deal.senior_manager_comment && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
            <p className="text-sm font-medium text-blue-800">Senior Manager Comment:</p>
            <p className="text-sm text-blue-700 mt-1">{deal.senior_manager_comment}</p>
          </div>
        )}

        <div className="mt-4 flex flex-col space-y-2">
          {/* Информация о статусе для менеджера */}
          {user?.role === 'manager' && deal.status === 'new' && (
            <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                ℹ️ Deal has been sent to senior manager for review. Awaiting approval.
              </p>
            </div>
          )}
          {canClientAgreed && (
            <button
              onClick={() => clientAgreedMutation.mutate()}
              disabled={clientAgreedMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {clientAgreedMutation.isPending ? 'Saving...' : 'Client Agreed to Pay'}
            </button>
          )}
          {canConfirmPayment && <PaymentConfirmationForm deal={deal} onConfirm={confirmPaymentMutation} />}
          {hasDebt && user?.role === 'manager' && <DebtPaymentForm deal={deal} onPay={payDebtMutation} />}
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Transactions</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Company
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  IBAN
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Amount EUR
                </th>
                {user?.role !== 'manager' && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Route
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {deal.transactions && deal.transactions.length > 0 ? (
                deal.transactions.map((trans) => (
                <tr key={trans.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {trans.target_company}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {trans.recipient_details || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {typeof trans.amount_eur === 'string'
                      ? parseFloat(trans.amount_eur).toLocaleString()
                      : Number(trans.amount_eur).toLocaleString()} EUR
                  </td>
                  {user?.role !== 'manager' && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {trans.route_type || 'Not set'}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          trans.status === 'paid'
                            ? 'bg-green-100 text-green-800'
                            : trans.status === 'in_progress'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {trans.status}
                      </span>
                      {canMarkPaid && trans.status !== 'paid' && (
                        <button
                          onClick={() => markPaidMutation.mutate(trans.id)}
                          disabled={markPaidMutation.isPending}
                          className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          Mark Paid
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                    No transactions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Компонент для подтверждения оплаты
function PaymentConfirmationForm({ deal, onConfirm }: { deal: Deal; onConfirm: any }) {
  const [isPartial, setIsPartial] = useState(false);
  const [paidAmount, setPaidAmount] = useState<string>('');

  const handleSubmit = () => {
    const amount = isPartial ? parseFloat(paidAmount) : parseFloat(deal.total_eur_request);
    onConfirm.mutate({
      client_paid_amount: amount,
      is_partial: isPartial,
    });
  };

  return (
    <div className="p-4 border border-gray-300 rounded-md bg-gray-50">
      <h3 className="font-medium mb-3">Confirm Client Payment</h3>
      <div className="space-y-3">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={isPartial}
            onChange={(e) => setIsPartial(e.target.checked)}
            className="mr-2"
          />
          <span className="text-sm">Partial Payment</span>
        </label>
        {isPartial && (
          <div>
            <label className="block text-sm font-medium mb-1">Amount Paid by Client (EUR)</label>
            <input
              type="number"
              step="0.01"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Enter amount"
            />
            {paidAmount && (
              <p className="text-xs text-gray-600 mt-1">
                Debt will be: {(parseFloat(deal.total_eur_request) - parseFloat(paidAmount)).toLocaleString()} EUR
              </p>
            )}
          </div>
        )}
        <button
          onClick={handleSubmit}
          disabled={onConfirm.isPending || (isPartial && !paidAmount)}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
        >
          {onConfirm.isPending ? 'Confirming...' : 'Confirm Payment'}
        </button>
      </div>
    </div>
  );
}

// Компонент для погашения задолженности
function DebtPaymentForm({ deal, onPay }: { deal: Deal; onPay: any }) {
  const [paymentAmount, setPaymentAmount] = useState<string>('');

  const handleSubmit = () => {
    if (paymentAmount) {
      onPay.mutate(parseFloat(paymentAmount));
      setPaymentAmount('');
    }
  };

  return (
    <div className="p-4 border border-yellow-300 rounded-md bg-yellow-50">
      <h3 className="font-medium mb-3">Pay Debt</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Payment Amount (EUR)</label>
          <input
            type="number"
            step="0.01"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder={`Максимум: ${parseFloat(deal.client_debt_amount || '0').toLocaleString()} EUR`}
            max={parseFloat(deal.client_debt_amount || '0')}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={onPay.isPending || !paymentAmount || parseFloat(paymentAmount) <= 0}
          className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50"
        >
          {onPay.isPending ? 'Paying...' : 'Pay Debt'}
        </button>
      </div>
    </div>
  );
}

