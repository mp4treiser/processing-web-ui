import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import * as XLSX from 'xlsx';

interface Deal {
  id: number;
  client_id: number;
  client_name: string | null;
  total_eur_request: string;
  total_usdt_calculated: string | null;
  client_rate_percent: string | null;
  status: string;
  created_at: string;
}

interface DealIncome {
  income_amount: string;
  income_percent: string;
  is_profitable: boolean;
  manager_commission_percent: string;
  manager_commission_amount: string;
  net_profit: string;
  currency: string;
}

interface ClientStats {
  client_id: number;
  client_name: string;
  deals: DealWithIncome[];
  total_client_rate: number;
  total_margin: number;
  total_profit: number;
  total_amount: number;
}

interface DealWithIncome extends Deal {
  income?: DealIncome;
}

export function AnalyticsDashboard() {
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('completed');

  // Клиенты загружаются через сделки (client_name)
  // const { data: clients } = useQuery<Client[]>({...});

  // Загружаем все сделки
  const { data: deals, isLoading: dealsLoading } = useQuery<Deal[]>({
    queryKey: ['deals', 'analytics', statusFilter],
    queryFn: async () => {
      const params: any = {};
      if (statusFilter !== 'all') {
        params.status_filter = statusFilter;
      }
      const response = await api.get('/api/deals', { params });
      return response.data;
    },
  });

  // Загружаем доход для каждой сделки
  const { data: dealsWithIncome, isLoading: incomeLoading } = useQuery<DealWithIncome[]>({
    queryKey: ['deals-with-income', deals?.map(d => d.id)],
    queryFn: async () => {
      if (!deals) return [];
      
      const dealsWithIncomeData = await Promise.all(
        deals.map(async (deal) => {
          try {
            const incomeResponse = await api.get(`/api/deals/${deal.id}/income`);
            return { ...deal, income: incomeResponse.data };
          } catch {
            return deal;
          }
        })
      );
      return dealsWithIncomeData;
    },
    enabled: !!deals && deals.length > 0,
  });

  // Фильтрация по датам
  const filteredDeals = dealsWithIncome?.filter(deal => {
    const dealDate = new Date(deal.created_at);
    if (dateFrom && dealDate < new Date(dateFrom)) return false;
    if (dateTo && dealDate > new Date(dateTo)) return false;
    return true;
  }) || [];

  // Группировка по клиентам
  const clientStats: ClientStats[] = [];
  const clientsMap = new Map<number, ClientStats>();

  filteredDeals.forEach(deal => {
    const clientId = deal.client_id;
    if (!clientsMap.has(clientId)) {
      clientsMap.set(clientId, {
        client_id: clientId,
        client_name: deal.client_name || `Client #${clientId}`,
        deals: [],
        total_client_rate: 0,
        total_margin: 0,
        total_profit: 0,
        total_amount: 0,
      });
    }
    const stats = clientsMap.get(clientId)!;
    stats.deals.push(deal);
    
    // Суммируем показатели
    const clientRate = parseFloat(deal.client_rate_percent || '0');
    const incomePercent = deal.income ? parseFloat(deal.income.income_percent) : 0;
    const netProfit = deal.income ? parseFloat(deal.income.net_profit) : 0;
    const amount = parseFloat(deal.total_eur_request);
    
    stats.total_client_rate += clientRate * amount;
    stats.total_margin += incomePercent * amount;
    stats.total_profit += netProfit;
    stats.total_amount += amount;
  });

  clientsMap.forEach((stats, _) => {
    // Вычисляем средневзвешенные показатели
    if (stats.total_amount > 0) {
      stats.total_client_rate = stats.total_client_rate / stats.total_amount;
      stats.total_margin = stats.total_margin / stats.total_amount;
    }
    clientStats.push(stats);
  });

  // Сортируем по общей прибыли
  clientStats.sort((a, b) => b.total_profit - a.total_profit);

  // Считаем итого
  const grandTotal = {
    total_client_rate: clientStats.reduce((sum, c) => sum + c.total_client_rate * c.total_amount, 0) / 
                       (clientStats.reduce((sum, c) => sum + c.total_amount, 0) || 1),
    total_margin: clientStats.reduce((sum, c) => sum + c.total_margin * c.total_amount, 0) / 
                  (clientStats.reduce((sum, c) => sum + c.total_amount, 0) || 1),
    total_profit: clientStats.reduce((sum, c) => sum + c.total_profit, 0),
    total_amount: clientStats.reduce((sum, c) => sum + c.total_amount, 0),
    total_deals: filteredDeals.length,
  };

  // Определяем максимальное количество сделок у одного клиента для колонок
  const maxDeals = Math.max(...clientStats.map(c => c.deals.length), 0);

  const isLoading = dealsLoading || incomeLoading;

  const exportToExcel = () => {
    // Создаём workbook
    const wb = XLSX.utils.book_new();

    // Создаём таблицу в том же формате, что и на странице
    const headers = [
      'Клиент',
      '% ставки клиента',
      '%-маржа',
      '% нашей прибыли',
    ];

    // Добавляем динамические колонки для сделок
    const numDealColumns = Math.min(maxDeals, 10);
    for (let i = 1; i <= numDealColumns; i++) {
      headers.push(`Сделка ${i}`);
    }
    if (maxDeals > 10) {
      headers.push('...');
    }
    headers.push('Итого по клиенту');

    // Формируем данные для каждого клиента
    const tableData: any[][] = [];
    
    clientStats.forEach((client) => {
      const row: any[] = [
        client.client_name,
        client.total_client_rate.toFixed(2) + '%',
        client.total_margin.toFixed(2) + '%',
        ((client.total_profit / (client.total_amount || 1)) * 100).toFixed(2) + '%',
      ];

      // Добавляем данные по каждой сделке
      for (let i = 0; i < numDealColumns; i++) {
        const deal = client.deals[i];
        if (deal) {
          const profit = deal.income ? parseFloat(deal.income.net_profit).toFixed(2) : '—';
          row.push(`#${deal.id}: ${profit}`);
        } else {
          row.push('—');
        }
      }

      if (maxDeals > 10) {
        row.push(`+${client.deals.length - 10}`);
      }

      // Итого по клиенту
      row.push(client.total_profit.toFixed(2));

      tableData.push(row);
    });

    // Добавляем итоговую строку
    const totalRow: any[] = [
      'ИТОГО',
      grandTotal.total_client_rate.toFixed(2) + '%',
      grandTotal.total_margin.toFixed(2) + '%',
      ((grandTotal.total_profit / (grandTotal.total_amount || 1)) * 100).toFixed(2) + '%',
    ];

    // Пустые ячейки для сделок
    for (let i = 0; i < numDealColumns; i++) {
      totalRow.push('');
    }
    if (maxDeals > 10) {
      totalRow.push('');
    }

    // Итоговая прибыль
    totalRow.push(grandTotal.total_profit.toFixed(2) + ' USDT');

    tableData.push(totalRow);

    // Создаём лист с таблицей
    const ws = XLSX.utils.aoa_to_sheet([headers, ...tableData]);

    // Настраиваем ширину колонок
    const colWidths = [
      { wch: 20 }, // Клиент
      { wch: 18 }, // % ставки клиента
      { wch: 12 }, // %-маржа
      { wch: 18 }, // % нашей прибыли
    ];
    
    for (let i = 0; i < numDealColumns; i++) {
      colWidths.push({ wch: 15 }); // Сделки
    }
    if (maxDeals > 10) {
      colWidths.push({ wch: 10 }); // ...
    }
    colWidths.push({ wch: 18 }); // Итого по клиенту

    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Аналитика');

    // Генерируем имя файла с датой
    const fileName = `analytics_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    // Скачиваем файл
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Аналитический дашборд</h1>
        
        {/* Фильтры */}
        <div className="bg-white shadow rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Дата с</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Дата по</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Статус</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="all">Все</option>
                <option value="completed">Завершённые</option>
                <option value="execution">В исполнении</option>
                <option value="senior_manager_approved">Одобренные</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setStatusFilter('completed');
                }}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Сбросить фильтры
              </button>
            </div>
          </div>
        </div>

        {/* Кнопка экспорта */}
        <div className="flex justify-end mb-6">
          <button
            onClick={exportToExcel}
            disabled={isLoading || filteredDeals.length === 0}
            className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            title="Экспорт в Excel"
          >
            <span>📊</span>
            <span>Экспорт в Excel</span>
          </button>
        </div>

        {/* Общая статистика */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white shadow rounded-lg p-4">
            <p className="text-sm text-gray-500">Всего сделок</p>
            <p className="text-2xl font-bold text-gray-900">{grandTotal.total_deals}</p>
          </div>
          <div className="bg-white shadow rounded-lg p-4">
            <p className="text-sm text-gray-500">Общий объём</p>
            <p className="text-2xl font-bold text-gray-900">
              {grandTotal.total_amount.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} EUR
            </p>
          </div>
          <div className="bg-white shadow rounded-lg p-4">
            <p className="text-sm text-gray-500">Средняя маржа</p>
            <p className="text-2xl font-bold text-gray-900">
              {grandTotal.total_margin.toFixed(2)}%
            </p>
          </div>
          <div className="bg-white shadow rounded-lg p-4">
            <p className="text-sm text-gray-500">Общая прибыль</p>
            <p className={`text-2xl font-bold ${grandTotal.total_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {grandTotal.total_profit.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} USDT
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Загрузка данных...</div>
      ) : (
        /* Таблица по клиентам */
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                    Клиент
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    % ставки клиента
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    %-маржа
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    % нашей прибыли
                  </th>
                  {/* Динамические колонки для сделок */}
                  {Array.from({ length: Math.min(maxDeals, 10) }, (_, i) => (
                    <th key={i} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Сделка {i + 1}
                    </th>
                  ))}
                  {maxDeals > 10 && (
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ...
                    </th>
                  )}
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-indigo-50">
                    Итого по клиенту
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {clientStats.map((client) => (
                  <tr key={client.client_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white z-10">
                      {client.client_name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-600">
                      {client.total_client_rate.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                      <span className={client.total_margin >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {client.total_margin.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                      <span className={client.total_profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {((client.total_profit / (client.total_amount || 1)) * 100).toFixed(2)}%
                      </span>
                    </td>
                    {/* Сделки клиента */}
                    {Array.from({ length: Math.min(maxDeals, 10) }, (_, i) => {
                      const deal = client.deals[i];
                      return (
                        <td key={i} className="px-4 py-3 whitespace-nowrap text-sm text-center">
                          {deal ? (
                            <div className="flex flex-col items-center">
                              <span className="text-xs text-gray-500">#{deal.id}</span>
                              <span className={deal.income?.is_profitable ? 'text-green-600' : 'text-red-600'}>
                                {deal.income 
                                  ? parseFloat(deal.income.net_profit).toLocaleString('ru-RU', { maximumFractionDigits: 0 })
                                  : '—'
                                }
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    {maxDeals > 10 && (
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-500">
                        +{client.deals.length - 10}
                      </td>
                    )}
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-bold bg-indigo-50">
                      <span className={client.total_profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {client.total_profit.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
                      </span>
                    </td>
                  </tr>
                ))}
                
                {/* Итого */}
                <tr className="bg-gray-100 font-bold">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 sticky left-0 bg-gray-100 z-10">
                    ИТОГО
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900">
                    {grandTotal.total_client_rate.toFixed(2)}%
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                    <span className={grandTotal.total_margin >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {grandTotal.total_margin.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                    <span className={grandTotal.total_profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {((grandTotal.total_profit / (grandTotal.total_amount || 1)) * 100).toFixed(2)}%
                    </span>
                  </td>
                  {/* Пустые ячейки для сделок */}
                  {Array.from({ length: Math.min(maxDeals, 10) }, (_, i) => (
                    <td key={i} className="px-4 py-3"></td>
                  ))}
                  {maxDeals > 10 && <td className="px-4 py-3"></td>}
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-center bg-indigo-100">
                    <span className={grandTotal.total_profit >= 0 ? 'text-green-700' : 'text-red-700'}>
                      {grandTotal.total_profit.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} USDT
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Легенда */}
      <div className="mt-6 bg-white shadow rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Пояснения:</h3>
        <ul className="text-xs text-gray-600 space-y-1">
          <li>• <strong>% ставки клиента</strong> — средневзвешенный процент ставки клиента по всем сделкам</li>
          <li>• <strong>%-маржа</strong> — разница между тем, что клиент отправляет и нашими затратами (положительно = прибыль)</li>
          <li>• <strong>% нашей прибыли</strong> — чистая прибыль как процент от объёма сделок</li>
          <li>• <strong>Сделка N</strong> — чистая прибыль по конкретной сделке</li>
          <li>• <strong>Итого по клиенту</strong> — суммарная чистая прибыль по всем сделкам клиента</li>
          <li className="text-green-600">• Зелёный цвет — положительные значения (прибыль)</li>
          <li className="text-red-600">• Красный цвет — отрицательные значения (убыток)</li>
        </ul>
      </div>
    </div>
  );
}

