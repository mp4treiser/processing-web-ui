import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState } from 'react';
import { Link } from 'react-router-dom';

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
  created_at: string;
  transactions: Transaction[];
  client_debt_amount: string | null;
}

interface Transaction {
  id: number;
  target_company: string;
  amount_eur: string;
  recipient_details: string | null;
  route_type: string | null;
  status: string;
  cost_usdt: string | null;
  exchange_rate: string | null;
  partner_bonus_rate: string | null;
  partner_cost_rate: string | null;
  exchange_fee_percent: string | null;
  intermediary_fee_percent: string | null;
  bank_fee_fix_eur: string | null;
  bank_fee_percent: string | null;
}

export function AccountantView() {
  const queryClient = useQueryClient();
  const [selectedDeal, setSelectedDeal] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'calculation' | 'execution'>('calculation');

  // Фильтры/сортировка для общего списка сделок
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('');
  const [accountFilter, setAccountFilter] = useState<string>('');

  // Загружаем клиентов для фильтра
  const { data: clients } = useQuery({
    queryKey: ['reference-clients'],
    queryFn: async () => {
      const response = await api.get('/api/reference/clients');
      return response.data;
    },
  });

  // Очереди (расчет / исполнение) — как раньше
  // В новом workflow бухгалтер не выбирает маршруты (это делает главный менеджер)
  // Поэтому calculation_pending больше не используется, только execution
  // Для "Approved Deals" показываем сделки, одобренные главным менеджером (включая частично оплаченные)
  const { data: allDealsForFiltering } = useQuery<Deal[]>({
    queryKey: ['deals', 'accountant', 'all-for-filtering', clientFilter, companyFilter, accountFilter],
    queryFn: async () => {
      const params: any = {};
      if (clientFilter !== 'all') {
        params.client_id = parseInt(clientFilter);
      }
      if (companyFilter) {
        params.company_name = companyFilter;
      }
      if (accountFilter) {
        params.account_number = accountFilter;
      }
      const response = await api.get('/api/deals', { params });
      return response.data;
    },
  });

  const dealsQueue = allDealsForFiltering?.filter((deal) => {
    if (viewMode === 'calculation') {
      // Approved Deals - сделки, одобренные главным менеджером, но клиент еще НЕ оплатил
      // Показываем одобренные сделки, которые еще не оплачены (не в execution и не частично оплачены)
      return deal.status === 'senior_manager_approved' || 
             deal.status === 'client_agreed_to_pay' ||
             deal.status === 'awaiting_client_payment';
    } else {
      // Execution Queue - сделки, которые оплачены (полностью или частично) и их нужно провести
      return deal.status === 'execution' || 
             deal.status === 'client_partially_paid'; // Частично оплачено, можно проводить транзакции
    }
  });

  const isLoading = !allDealsForFiltering; // Используем данные из allDealsForFiltering

  // Получаем остатки по счетам для проведения транзакций
  const { data: accountBalances } = useQuery({
    queryKey: ['account-balances'],
    queryFn: async () => {
      const response = await api.get('/api/account-balances');
      return response.data;
    },
  });

  // Получаем задолженности клиентов
  const { data: clientDebts } = useQuery<Deal[]>({
    queryKey: ['client-debts'],
    queryFn: async () => {
      const response = await api.get('/api/accountant/client-debts');
      return response.data;
    },
  });

  // Общий список всех сделок бухгалтера (все статусы) - используем те же данные
  const allDeals = allDealsForFiltering;

  const { data: dealDetail } = useQuery<Deal>({
    queryKey: ['deal', selectedDeal],
    queryFn: async () => {
      const response = await api.get(`/api/deals/${selectedDeal}`);
      return response.data;
    },
    enabled: !!selectedDeal,
  });


  const executeTransactionMutation = useMutation({
    mutationFn: async ({ transactionId, accountBalanceId }: { transactionId: number; accountBalanceId: number }) => {
      const response = await api.post(`/api/transactions/${transactionId}/execute?account_balance_id=${accountBalanceId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', selectedDeal] });
      queryClient.invalidateQueries({ queryKey: ['deals', 'accountant'] });
      queryClient.invalidateQueries({ queryKey: ['account-balances'] });
    },
  });


  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
      <div className="px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Accountant</h1>
        <div className="flex space-x-2">
          <Link
            to="/deals/new"
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            + Create Deal
          </Link>
          <Link
            to="/debts"
            className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
          >
            Debts ({clientDebts?.length || 0})
          </Link>
          <button
            onClick={() => {
              setViewMode('calculation');
              setSelectedDeal(null);
            }}
            className={`px-4 py-2 rounded-md ${
              viewMode === 'calculation'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Approved Deals
          </button>
          <button
            onClick={() => {
              setViewMode('execution');
              setSelectedDeal(null);
            }}
            className={`px-4 py-2 rounded-md ${
              viewMode === 'execution'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Execution Queue
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          {/* Очереди расчета / исполнения */}
          <div className="bg-white shadow rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">
              {viewMode === 'calculation' ? 'Approved Deals' : 'Execution Queue'}
            </h2>
            <div className="space-y-2">
              {dealsQueue?.map((deal) => (
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
              {(!dealsQueue || dealsQueue.length === 0) && (
                <p className="text-sm text-gray-500">
                  {viewMode === 'calculation' ? 'No approved deals' : 'No deals in execution'}
                </p>
              )}
            </div>
          </div>

          {/* Общий список всех сделок с фильтрами */}
          <div className="bg-white shadow rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">All Deals</h2>

            {/* Фильтры */}
            <div className="flex flex-col space-y-3 mb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded-md text-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="new">New</option>
                  <option value="senior_manager_review">Senior Manager Review</option>
                  <option value="senior_manager_approved">Senior Manager Approved</option>
                  <option value="senior_manager_rejected">Senior Manager Rejected</option>
                  <option value="client_agreed_to_pay">Client Agreed to Pay</option>
                  <option value="awaiting_client_payment">Awaiting Client Payment</option>
                  <option value="client_partially_paid">Client Partially Paid</option>
                  <option value="execution">Execution</option>
                  <option value="completed">Completed</option>
                  {/* Legacy statuses for backward compatibility */}
                  <option value="calculation_pending">Calculation Pending (Legacy)</option>
                  <option value="director_approval_pending">Director Approval Pending (Legacy)</option>
                  <option value="director_rejected">Director Rejected (Legacy)</option>
                  <option value="client_approval">Client Approval (Legacy)</option>
                  <option value="awaiting_payment">Awaiting Payment (Legacy)</option>
                </select>

                <select
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded-md text-sm"
                >
                  <option value="all">All Clients</option>
                  {clients?.map((client: any) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                  placeholder="Search by company..."
                  className="px-2 py-1 border border-gray-300 rounded-md text-sm"
                />

                <input
                  type="text"
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                  placeholder="Search by IBAN..."
                  className="px-2 py-1 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div className="flex space-x-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'date' | 'amount')}
                  className="w-1/4 px-2 py-1 border border-gray-300 rounded-md text-sm"
                >
                  <option value="date">Sort by date</option>
                  <option value="amount">Sort by amount</option>
                </select>

                <button
                  type="button"
                  onClick={() =>
                    setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))
                  }
                  className="w-1/4 px-2 py-1 border border-gray-300 rounded-md text-sm"
                >
                  {sortDirection === 'desc' ? '↓' : '↑'}
                </button>
              </div>
            </div>

            {/* Список сделок */}
            <div className="mt-4 max-h-72 overflow-y-auto space-y-2">
              {allDeals &&
                allDeals
                  .filter((deal) => {
                    if (statusFilter === 'all') return true;
                    return deal.status === statusFilter;
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
                  })
                  .map((deal) => (
                    <button
                      key={`all-${deal.id}`}
                      onClick={() => {
                        setSelectedDeal(deal.id);
                        setViewMode(
                          deal.status === 'execution' ? 'execution' : 'calculation',
                        );
                      }}
                      className={`w-full text-left p-3 rounded-md border ${
                        selectedDeal === deal.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">Deal #{deal.id}</p>
                          <p className="text-sm text-gray-600">{deal.client_name}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(deal.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-500">
                            {parseFloat(deal.total_eur_request).toLocaleString()} EUR
                          </p>
                          <span className="inline-flex mt-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 capitalize">
                            {deal.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}

              {(!allDeals || allDeals.length === 0) && (
                <p className="text-sm text-gray-500">No deals found</p>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedDeal && dealDetail ? (
            <div className="space-y-6">
              {viewMode === 'calculation' ? (
                /* Просмотр сделок, одобренных главным менеджером (маршруты уже выбраны) */
                <div className="bg-white shadow rounded-lg p-6">
                  <div className="mb-6">
                    <h2 className="text-xl font-bold">Deal #{dealDetail.id}</h2>
                    <p className="text-gray-600">{dealDetail.client_name}</p>
                    <p className="text-gray-600">
                      Total: {parseFloat(dealDetail.total_eur_request).toLocaleString()} EUR
                    </p>
                    {dealDetail.client_debt_amount && parseFloat(dealDetail.client_debt_amount) > 0 && (
                      <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                        <p className="text-sm text-yellow-800">
                          ⚠️ Client Debt: {parseFloat(dealDetail.client_debt_amount).toLocaleString()} EUR
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 mb-4">
                      Routes have been selected by the senior manager. You can execute transactions even if client has debt.
                    </p>
                    {dealDetail.transactions?.map((trans) => (
                      <TransactionExecutionItem
                        key={trans.id}
                        transaction={trans}
                        accountBalances={accountBalances}
                        onExecute={executeTransactionMutation.mutate}
                        isExecuting={executeTransactionMutation.isPending}
                        dealStatus={dealDetail.status}
                      />
                    ))}
                  </div>

                  {/* Итоговая панель */}
                  {dealDetail.total_usdt_calculated && (
                    <div className="mt-6 bg-gray-50 rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-4">Calculation Results</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-500">Total USDT (Client)</p>
                          <p className="text-xl font-bold text-green-600">
                            {parseFloat(dealDetail.total_usdt_calculated).toLocaleString()} USDT
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Total Cost</p>
                          <p className="text-xl font-bold">
                            {dealDetail.total_cost_usdt
                              ? parseFloat(dealDetail.total_cost_usdt).toLocaleString()
                              : 'N/A'} USDT
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Gross Margin</p>
                          <p className="text-xl font-bold">
                            {dealDetail.gross_margin_usdt
                              ? parseFloat(dealDetail.gross_margin_usdt).toLocaleString()
                              : 'N/A'} USDT
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Net Profit</p>
                          <p className="text-xl font-bold text-green-600">
                            {dealDetail.net_profit_usdt
                              ? parseFloat(dealDetail.net_profit_usdt).toLocaleString()
                              : 'N/A'} USDT
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Execution mode - проведение транзакций с остатками */
                <div className="bg-white shadow rounded-lg p-6">
                  <div className="mb-6">
                    <h2 className="text-xl font-bold">Deal #{dealDetail.id}</h2>
                    <p className="text-gray-600">{dealDetail.client_name}</p>
                    <p className="text-gray-600">
                      Total: {parseFloat(dealDetail.total_eur_request).toLocaleString()} EUR
                    </p>
                    {dealDetail.client_debt_amount && parseFloat(dealDetail.client_debt_amount) > 0 && (
                      <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                        <p className="text-sm text-yellow-800">
                          ⚠️ Client Debt: {parseFloat(dealDetail.client_debt_amount).toLocaleString()} EUR
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    {dealDetail.transactions?.map((trans) => (
                      <TransactionExecutionItem
                        key={trans.id}
                        transaction={trans}
                        accountBalances={accountBalances}
                        onExecute={executeTransactionMutation.mutate}
                        isExecuting={executeTransactionMutation.isPending}
                        dealStatus={dealDetail.status}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white shadow rounded-lg p-6 text-center text-gray-500">
              Select a deal to start calculation
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Компонент для проведения транзакции
function TransactionExecutionItem({ transaction, accountBalances, onExecute, isExecuting, dealStatus }: {
  transaction: Transaction;
  accountBalances: any[];
  onExecute: (data: { transactionId: number; accountBalanceId: number }) => void;
  isExecuting: boolean;
  dealStatus: string;
}) {
  const [selectedBalanceId, setSelectedBalanceId] = useState<number | null>(null);

  // Проверяем, можно ли выполнить транзакцию
  // Транзакции можно выполнять только если менеджер подтвердил оплату от клиента
  // Разрешенные статусы: execution (полная оплата) или client_partially_paid (частичная оплата)
  const canExecute = dealStatus === 'execution' || dealStatus === 'client_partially_paid';
  
  return (
    <div
      className={`border rounded-md p-4 ${
        transaction.status === 'paid'
          ? 'border-green-500 bg-green-50'
          : 'border-gray-200'
      }`}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <p className="font-medium">{transaction.target_company}</p>
          <p className="text-sm text-gray-600">
            {parseFloat(transaction.amount_eur).toLocaleString()} EUR
          </p>
          <p className="text-xs text-gray-500 mt-1">
            IBAN: {transaction.recipient_details || 'Not provided'}
          </p>
          <p className="text-xs text-gray-500">
            Route: {transaction.route_type || 'Not set'}
          </p>
          <p className="text-xs text-gray-500">
            Cost: {transaction.cost_usdt ? parseFloat(transaction.cost_usdt).toFixed(2) : 'N/A'} USDT
          </p>
        </div>
        <div className="ml-4">
          {transaction.status === 'paid' ? (
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
              Paid
            </span>
          ) : !canExecute ? (
            <div className="space-y-2 min-w-[200px]">
              <div className="px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800">
                ⚠️ Waiting for manager to confirm client payment
              </div>
            </div>
          ) : (
            <div className="space-y-2 min-w-[200px]">
              <select
                value={selectedBalanceId || ''}
                onChange={(e) => setSelectedBalanceId(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">Select Balance</option>
                {accountBalances?.map((balance: any) => (
                  <option key={balance.id} value={balance.id}>
                    {balance.account_name} - {parseFloat(balance.balance).toLocaleString(undefined, { maximumFractionDigits: 10 })} {balance.currency || ''}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (selectedBalanceId) {
                    onExecute({
                      transactionId: transaction.id,
                      accountBalanceId: selectedBalanceId,
                    });
                  }
                }}
                disabled={isExecuting || !selectedBalanceId}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {isExecuting ? 'Executing...' : 'Execute Transaction'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
