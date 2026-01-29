import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { TransactionForm } from './TransactionForm';
import { CompanyBalancesDisplay } from '../components/CompanyBalancesDisplay';
import { RouteBuilder } from '../components/RouteBuilder';
import { useAuth } from '../contexts/AuthContext';

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

interface DealTemplate {
  id: number;
  name: string;
  description: string | null;
  client_sends_currency: string | null;
  client_receives_currency: string | null;
  routes_config: {
    transactions: Array<{
      client_company_id?: number;
      routes: Route[];
    }>;
  };
}

// Интерфейсы Route и TransactionRoute определены в RouteBuilder.tsx
// Используем их через импорт или определяем здесь для совместимости
interface Route {
  id?: string;
  route_type: 'direct' | 'exchange' | 'partner' | 'partner_50_50' | '';
  exchange_rate: number;
  [key: string]: any;
}

interface TransactionRoute {
  client_company_id: number;
  amount_for_client: number;
  routes: Route[];
  final_income?: number;
  [key: string]: any;
}

export function NewDeal() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const copyFromId = searchParams.get('copy_from');
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [clientId, setClientId] = useState<number | ''>('');
  const [totalEur, setTotalEur] = useState<string>('');
  const [clientRate, setClientRate] = useState<string>('');
  const [transactions, setTransactions] = useState<Transaction[]>([
    { company_id: '', account_id: '', amount_eur: 0, recipient_details: '' },
  ]);
  
  // Новые поля для бухгалтера
  const [dealAmount, setDealAmount] = useState<string>('');
  const [clientSendsCurrency, setClientSendsCurrency] = useState<string>('');
  const [clientReceivesCurrency, setClientReceivesCurrency] = useState<string>('');
  const [routeTransactions, setRouteTransactions] = useState<TransactionRoute[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<Array<{account_id: number; amount: number; currency: string}>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | ''>('');
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // Загружаем ставку клиента по умолчанию
  const { data: defaultClientRate } = useQuery({
    queryKey: ['default-client-rate'],
    queryFn: async () => {
      const response = await api.get('/api/reference/default-client-rate');
      return response.data.default_client_rate;
    },
  });

  // Устанавливаем ставку по умолчанию при загрузке
  useEffect(() => {
    if (defaultClientRate && !clientRate) {
      setClientRate(defaultClientRate);
    }
  }, [defaultClientRate]);

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

  // Загружаем шаблоны
  const { data: templates } = useQuery<DealTemplate[]>({
    queryKey: ['templates'],
    queryFn: async () => {
      const response = await api.get('/api/templates');
      return response.data;
    },
  });

  // Загружаем данные для копирования
  const { data: copyData } = useQuery({
    queryKey: ['deal-copy-data', copyFromId],
    queryFn: async () => {
      if (!copyFromId) return null;
      const response = await api.get(`/api/deals/${copyFromId}/copy-data`);
      return response.data;
    },
    enabled: !!copyFromId,
  });

  // Применяем данные копирования
  useEffect(() => {
    if (copyData) {
      setClientId(copyData.client_id || '');
      setClientSendsCurrency(copyData.client_sends_currency || '');
      setClientReceivesCurrency(copyData.client_receives_currency || '');
      if (copyData.transactions && copyData.transactions.length > 0) {
        const converted = copyData.transactions.map((t: any) => ({
          client_company_id: t.client_company_id || 0,
          amount_for_client: 0,
          routes: t.routes.map((r: any) => ({
            ...r,
            id: `route-${Date.now()}-${Math.random()}`,
          })),
        }));
        setRouteTransactions(converted);
      }
    }
  }, [copyData]);

  // Применяем шаблон
  const handleApplyTemplate = (templateId: number) => {
    const template = templates?.find(t => t.id === templateId);
    if (!template) return;
    
    setClientSendsCurrency(template.client_sends_currency || '');
    setClientReceivesCurrency(template.client_receives_currency || '');
    
    if (template.routes_config?.transactions) {
      const converted = template.routes_config.transactions.map((t: any) => ({
        client_company_id: t.client_company_id || 0,
        amount_for_client: 0,
        routes: t.routes.map((r: any) => ({
          ...r,
          id: `route-${Date.now()}-${Math.random()}`,
        })),
      }));
      setRouteTransactions(converted);
    }
  };

  // Сохранение как шаблон
  const saveTemplateMutation = useMutation({
    mutationFn: async (data: { name: string; routes_config: any }) => {
      const response = await api.post('/api/templates', {
        name: data.name,
        client_sends_currency: clientSendsCurrency,
        client_receives_currency: clientReceivesCurrency,
        routes_config: data.routes_config,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setShowSaveTemplateModal(false);
      setTemplateName('');
      alert('Шаблон сохранён!');
    },
  });

  const handleSaveAsTemplate = () => {
    if (!templateName.trim()) {
      alert('Введите название шаблона');
      return;
    }
    
    const routesConfig = {
      transactions: routeTransactions.map(t => ({
        client_company_id: t.client_company_id,
        routes: t.routes.map(r => ({
          route_type: r.route_type,
          exchange_rate: r.exchange_rate,
          internal_company_id: r.internal_company_id,
          internal_company_account_id: r.internal_company_account_id,
          bank_commission_id: r.bank_commission_id,
          crypto_account_id: r.crypto_account_id,
          exchange_from_currency: r.exchange_from_currency,
          agent_commission_id: r.agent_commission_id,
          exchange_commission_id: r.exchange_commission_id,
          exchange_bank_commission_id: r.exchange_bank_commission_id,
          partner_company_id: r.partner_company_id,
          partner_commission_id: r.partner_commission_id,
          partner_50_50_company_id: r.partner_50_50_company_id,
          partner_50_50_commission_id: r.partner_50_50_commission_id,
        })),
      })),
    };
    
    saveTemplateMutation.mutate({ name: templateName, routes_config: routesConfig });
  };

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

  // Загружаем валюты для бухгалтера
  const { data: currencies } = useQuery({
    queryKey: ['reference-currencies'],
    queryFn: async () => {
      const response = await api.get('/api/reference/currencies');
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

    if (user?.role === 'accountant') {
      // Валидация для бухгалтера
      if (!dealAmount || !clientSendsCurrency || !clientReceivesCurrency) {
        alert('Пожалуйста, заполните все поля сделки');
        return;
      }

      if (routeTransactions.length === 0) {
        alert('Пожалуйста, добавьте хотя бы одну транзакцию');
        return;
      }

      // Проверяем, что все транзакции заполнены
      const invalidTransactions = routeTransactions.filter(t => 
        !t.client_company_id || 
        !t.amount_for_client || !t.routes || t.routes.length === 0 || 
        t.routes.some(r => !r.route_type || !r.exchange_rate)
      );
      if (invalidTransactions.length > 0) {
        alert('Пожалуйста, заполните все обязательные поля для всех транзакций');
        return;
      }

      // Проверяем специфичные поля для каждого типа маршрута
      for (const trans of routeTransactions) {
        for (const route of trans.routes) {
          if (route.route_type === 'direct') {
            if (!route.internal_company_id || !route.internal_company_account_id || !route.amount_from_account) {
              alert('Пожалуйста, заполните все поля для прямого перевода');
              return;
            }
          } else if (route.route_type === 'exchange') {
            if (!route.crypto_account_id || !route.exchange_from_currency || !route.crypto_exchange_rate || !route.amount_from_account) {
              alert('Пожалуйста, заполните все поля для биржи');
              return;
            }
          } else if (route.route_type === 'partner') {
            if (!route.partner_company_id || !route.amount_to_partner_usdt || !route.amount_partner_sends) {
              alert('Пожалуйста, заполните все поля для партнёра');
              return;
            }
          } else if (route.route_type === 'partner_50_50') {
            if (!route.partner_50_50_company_id || !route.amount_to_partner_50_50_usdt || !route.amount_partner_50_50_sends) {
              alert('Пожалуйста, заполните все поля для партнёра 50-50');
              return;
            }
          }
        }
      }

      try {
        // Используем специальный endpoint для бухгалтера
        const response = await api.post('/api/accountant/deals', {
          client_id: clientId,
          total_eur_request: dealAmount, // Для совместимости, но можно использовать deal_amount
          deal_amount: dealAmount,
          client_sends_currency: clientSendsCurrency,
          client_receives_currency: clientReceivesCurrency,
          client_rate_percent: clientRate,
          copy_from_deal_id: copyFromId ? parseInt(copyFromId) : null,
          transactions: routeTransactions.map(t => ({
            client_company_id: t.client_company_id,
            amount_for_client: t.amount_for_client,
            routes: t.routes.map(r => ({
              route_type: r.route_type,
              exchange_rate: r.exchange_rate,
              // Direct
              internal_company_id: r.internal_company_id,
              internal_company_account_id: r.internal_company_account_id,
              amount_from_account: r.amount_from_account,
              bank_commission_id: r.bank_commission_id,
              // Exchange
              crypto_account_id: r.crypto_account_id,
              exchange_from_currency: r.exchange_from_currency,
              exchange_amount: r.exchange_amount,
              crypto_exchange_rate: r.crypto_exchange_rate,
              agent_commission_id: r.agent_commission_id,
              exchange_commission_id: r.exchange_commission_id,
              exchange_bank_commission_id: r.exchange_bank_commission_id,
              // Partner
              partner_company_id: r.partner_company_id,
              partner_account_id: r.partner_account_id,
              amount_to_partner_usdt: r.amount_to_partner_usdt,
              amount_partner_sends: r.amount_partner_sends,
              partner_commission_id: r.partner_commission_id,
              // Partner 50-50
              partner_50_50_company_id: r.partner_50_50_company_id,
              partner_50_50_account_id: r.partner_50_50_account_id,
              amount_to_partner_50_50_usdt: r.amount_to_partner_50_50_usdt,
              amount_partner_50_50_sends: r.amount_partner_50_50_sends,
              partner_50_50_commission_id: r.partner_50_50_commission_id,
              final_income: r.final_income,
            })),
            final_income: t.final_income,
          })),
        });
        queryClient.invalidateQueries({ queryKey: ['deals'] });
        navigate(`/deals/${response.data.id}`);
      } catch (error: any) {
        console.error('Error creating deal:', error);
        alert(error.response?.data?.detail || 'Ошибка при создании сделки');
      }
    } else {
      // Старая логика для менеджера
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
    }
  };

  return (
    <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] px-3 py-2">
      <div className="max-w-full">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-lg font-bold text-gray-900">
            {copyFromId ? `Копирование сделки #${copyFromId}` : 'Создание новой сделки'}
          </h1>
        </div>
        
        {/* Блок остатков компаний для бухгалтера */}
        {user?.role === 'accountant' && <CompanyBalancesDisplay showProjected={true} selectedAccounts={selectedAccounts} />}

        {/* Выбор шаблона для бухгалтера - МЕЖДУ балансами и формой */}
        {user?.role === 'accountant' && templates && templates.length > 0 && !copyFromId && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-3">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-indigo-800 whitespace-nowrap">📋 Шаблон:</label>
              <select
                value={selectedTemplateId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setSelectedTemplateId(id || '');
                  if (id) handleApplyTemplate(id);
                }}
                className="flex-1 px-3 py-2 text-sm border border-indigo-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">— Выберите шаблон или настройте вручную —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.description ? `(${t.description})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full bg-white shadow rounded-lg p-3 space-y-2">
        {/* Предупреждение о задолженности */}
        {user?.role === 'accountant' && clientDebts && clientDebts.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-2">
            <p className="text-xs font-medium text-yellow-800 mb-1">
              ⚠️ У клиента есть задолженность:
            </p>
            <ul className="list-disc list-inside text-xs text-yellow-700 space-y-0.5">
              {clientDebts.map((deal: any) => (
                <li key={deal.id}>
                  Сделка #{deal.id}: {parseFloat(deal.client_debt_amount || '0').toLocaleString()} EUR
                  {' '}
                  <span className="text-xs">
                    ({Math.ceil((new Date().getTime() - new Date(deal.created_at).getTime()) / (1000 * 60 * 60 * 24))} дней)
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-yellow-600 mt-1">
              Рекомендуется напомнить клиенту о долге и предложить погасить его в рамках этой сделки.
            </p>
          </div>
        )}
        
        {user?.role === 'accountant' ? (
          // Новый интерфейс для бухгалтера - две колонки
          <div className="grid grid-cols-12 gap-4">
            {/* Левая колонка - выбор клиента, валют и ставки */}
            <div className="col-span-3 space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                  Клиент *
                </label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(Number(e.target.value) || '')}
                  required
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">Выберите клиента</option>
                  {clients?.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                  Сумма, которую клиент хочет получить *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={dealAmount}
                  onChange={(e) => setDealAmount(e.target.value)}
                  required
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-0.5">Общая сумма в {clientReceivesCurrency || 'целевой валюте'}</p>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                  Клиент отправляет валюту *
                </label>
                <select
                  value={clientSendsCurrency}
                  onChange={(e) => setClientSendsCurrency(e.target.value)}
                  required
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">Выберите валюту</option>
                  {currencies?.map((curr: any) => (
                    <option key={curr.id} value={curr.code}>
                      {curr.code} - {curr.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                  Клиент получает валюту *
                </label>
                <select
                  value={clientReceivesCurrency}
                  onChange={(e) => setClientReceivesCurrency(e.target.value)}
                  required
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">Выберите валюту</option>
                  {currencies?.map((curr: any) => (
                    <option key={curr.id} value={curr.code}>
                      {curr.code} - {curr.name}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Ставка клиента */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                  Ставка клиента (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={clientRate}
                  onChange={(e) => setClientRate(e.target.value)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder={`По умолчанию: ${defaultClientRate || '2.0'}%`}
                />
                <p className="text-xs text-gray-500 mt-0.5">
                  По умолчанию из справочника: {defaultClientRate || '2.0'}%
                </p>
              </div>
            </div>
            
            {/* Правая колонка - Route Builder */}
            <div className="col-span-9">
              {routeTransactions.length === 0 ? (
                <div className="text-center py-2">
                  <button
                    type="button"
                    onClick={() => setRouteTransactions([{
                      client_company_id: 0,
                      amount_for_client: 0,
                      routes: [],
                    }])}
                    className="px-3 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                  >
                    + Добавить первую транзакцию
                  </button>
                </div>
              ) : (
                <RouteBuilder
                  clientId={clientId as number}
                  transactions={routeTransactions}
                  onUpdate={setRouteTransactions}
                  dealAmount={parseFloat(dealAmount) || undefined}
                  clientSendsCurrency={clientSendsCurrency}
                  clientReceivesCurrency={clientReceivesCurrency}
                  onSelectedAccountsChange={setSelectedAccounts}
                />
              )}
            </div>
          </div>
        ) : (
          // Старый интерфейс для менеджера
          <>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Клиент *
              </label>
              <select
                value={clientId}
                onChange={(e) => setClientId(Number(e.target.value) || '')}
                required
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Выберите клиента</option>
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
                  Сумма запроса (EUR) *
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
                  Ставка клиента (%) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={clientRate}
                  onChange={(e) => setClientRate(e.target.value)}
                  required
                  placeholder={`По умолчанию: ${defaultClientRate || '2.0'}%`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
            
            <div>
              <div className="flex justify-end mb-4">
                <button
                  type="button"
                  onClick={addTransaction}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                >
                  + Добавить транзакцию
                </button>
              </div>

              <div className="space-y-4">
                {transactions.map((trans, index) => (
                  <div key={index} className="border border-gray-200 rounded-md p-4">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-sm font-medium text-gray-700">Транзакция {index + 1}</span>
                      {transactions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTransaction(index)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Удалить
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
                  <strong>Всего транзакций:</strong> {calculateTotal().toLocaleString()} EUR
                </p>
                <p className="text-sm text-gray-700">
                  <strong>Сумма сделки:</strong> {parseFloat(totalEur || '0').toLocaleString()} EUR
                </p>
                {Math.abs(calculateTotal() - parseFloat(totalEur || '0')) > 0.01 && (
                  <p className="text-sm text-red-600 mt-1">
                    ⚠️ Суммы не совпадают!
                  </p>
                )}
              </div>
            </div>
          </>
        )}


        {/* Кнопки - сохранить шаблон рядом с созданием сделки */}
        <div className="flex justify-end space-x-2 pt-3 border-t border-gray-200">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Отмена
          </button>
          {user?.role === 'accountant' && routeTransactions.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSaveTemplateModal(true)}
              className="px-3 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              💾 Сохранить как шаблон
            </button>
          )}
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Создание...' : '✓ Создать сделку'}
          </button>
        </div>
      </form>
      </div>

      {/* Модальное окно сохранения шаблона */}
      {showSaveTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-bold mb-4">Сохранить как шаблон</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Название шаблона *</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Например: Стандартный обмен EUR->USDT"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowSaveTemplateModal(false);
                    setTemplateName('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleSaveAsTemplate}
                  disabled={!templateName.trim() || saveTemplateMutation.isPending}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saveTemplateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
