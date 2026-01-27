import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface CompanyBalance {
  company_id: number;
  company_name: string;
  total_balance: number;
  currency: string;
  accounts: Array<{
    id: number;
    account_name: string;
    account_number: string;
    balance: number;
    currency: string;
  }>;
}

interface CryptoBalance {
  account_id: number;
  account_name: string;
  balance: number;
  currency: string;
}

interface CompanyBalancesSummary {
  companies: CompanyBalance[];
  crypto_balances: CryptoBalance[];
  total_company_balance: number;
  total_crypto_balance: number;
}

interface ProjectedBalances {
  current: CompanyBalancesSummary;
  projected: CompanyBalancesSummary;
}

interface SelectedAccount {
  account_id: number;
  amount: number; // Отрицательное значение означает списание
  currency: string;
}

interface CompanyBalancesDisplayProps {
  showProjected?: boolean;
  selectedAccounts?: SelectedAccount[]; // Выбранные счета из RouteBuilder
}

export function CompanyBalancesDisplay({ showProjected = false, selectedAccounts = [] }: CompanyBalancesDisplayProps) {
  const { data: balancesData, isLoading } = useQuery<ProjectedBalances>({
    queryKey: ['company-balances', showProjected ? 'projected' : 'summary'],
    queryFn: async () => {
      const endpoint = showProjected ? '/api/company-balances/projected' : '/api/company-balances/summary';
      const response = await api.get(endpoint);
      return showProjected ? response.data : { current: response.data, projected: response.data };
    },
  });

  if (isLoading) {
    return <div className="text-center py-2 text-xs">Loading balances...</div>;
  }

  if (!balancesData) {
    return null;
  }

  const current = balancesData.current;
  let projected = balancesData.projected;

  // Рассчитываем изменения балансов на основе выбранных счетов
  // ВАЖНО: разделяем изменения для фиатных счетов компаний и крипто, чтобы ID не смешивались
  if (selectedAccounts && selectedAccounts.length > 0) {
    // Определяем криптовалюты
    const cryptoCurrencies = ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL', 'ADA', 'DOT', 'MATIC', 'AVAX', 'LINK', 'UNI', 'ATOM', 'XRP', 'DOGE', 'LTC', 'BCH', 'XLM', 'ALGO', 'VET', 'TRX', 'EOS', 'AAVE', 'MKR', 'COMP', 'SNX', 'SUSHI', 'CRV', 'YFI', '1INCH'];
    
    // Разделяем изменения на фиатные и крипто
    const companyAccountChanges: Record<number, number> = {};  // Для InternalCompanyAccount
    const cryptoAccountChanges: Record<number, number> = {};   // Для AccountBalance (крипто)
    
    selectedAccounts.forEach(acc => {
      const accountId = Number(acc.account_id);
      const amount = Number(acc.amount);
      
      if (!isNaN(accountId) && !isNaN(amount)) {
        const isCrypto = cryptoCurrencies.includes(acc.currency?.toUpperCase() || '');
        
        if (isCrypto) {
          // Крипто счёт (AccountBalance)
          if (!cryptoAccountChanges[accountId]) {
            cryptoAccountChanges[accountId] = 0;
          }
          cryptoAccountChanges[accountId] += amount;
        } else {
          // Фиатный счёт (InternalCompanyAccount)
          if (!companyAccountChanges[accountId]) {
            companyAccountChanges[accountId] = 0;
          }
          companyAccountChanges[accountId] += amount;
        }
      }
    });

    // Создаём проекцию с учётом выбранных счетов
    const baseProjected = { ...projected };
    
    projected = {
      ...projected,
      // Применяем изменения к фиатным счетам компаний
      companies: baseProjected.companies.map(company => {
        const updatedAccounts = company.accounts.map(account => {
          // Используем companyAccountChanges для фиатных счетов
          const change = companyAccountChanges[account.id] || 0;
          const newBalance = account.balance + change;
          return {
            ...account,
            balance: newBalance
          };
        });
        
        const newTotal = updatedAccounts.reduce((sum, acc) => sum + acc.balance, 0);
        
        return {
          ...company,
          accounts: updatedAccounts,
          total_balance: newTotal
        };
      }),
      // Применяем изменения к крипто счетам
      crypto_balances: baseProjected.crypto_balances.map(crypto => {
        // Используем cryptoAccountChanges для крипто счетов
        const baseBalance = Number(crypto.balance);
        const change = Number(cryptoAccountChanges[crypto.account_id] ?? 0);
        const newBalance = baseBalance + change;
        
        return {
          ...crypto,
          balance: Math.max(0, newBalance) // Защита от отрицательных балансов
        };
      })
    };

    // Пересчитываем общие суммы
    projected.total_company_balance = projected.companies.reduce((sum, c) => sum + (Number(c.total_balance) || 0), 0);
    projected.total_crypto_balance = projected.crypto_balances.reduce((sum, c) => sum + (Number(c.balance) || 0), 0);
    
    // Нормализуем общие суммы
    projected.total_company_balance = Math.round(projected.total_company_balance * 100) / 100;
    projected.total_crypto_balance = Math.round(projected.total_crypto_balance * 10000) / 10000;
  }

  // Группируем компании по валютам
  const companiesByCurrency: Record<string, CompanyBalance[]> = {};
  current.companies.forEach((company) => {
    if (!companiesByCurrency[company.currency]) {
      companiesByCurrency[company.currency] = [];
    }
    companiesByCurrency[company.currency].push(company);
  });

  // Функция для форматирования чисел: 2 знака для фиата, 4 для крипты
  const formatFiat = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatCrypto = (value: number) => {
    const numValue = Number(value);
    if (isNaN(numValue)) return '0';
    return numValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  };

  return (
    <div className="bg-white shadow rounded-lg p-2 mb-2">
      <h2 className="text-xs font-semibold mb-1">Company Balances</h2>
      
      <div className="grid grid-cols-2 gap-2">
        {/* Левая колонка: Company Accounts */}
        <div>
          <h3 className="text-xs font-medium mb-1 text-gray-700">Company Accounts</h3>
          <div className="space-y-1">
            {Object.entries(companiesByCurrency).map(([currency, companies]) => {
              return (
                <div key={currency} className="space-y-1">
                  {companies.map((company) => {
                    const projectedCompany = showProjected
                      ? projected.companies.find((c) => c.company_id === company.company_id && c.currency === currency)
                      : null;

                    const hasChanges = showProjected && projectedCompany && 
                      Math.abs(projectedCompany.total_balance - company.total_balance) > 0.01;
                    
                    return (
                      <div key={company.company_id} className={`border rounded p-1.5 ${hasChanges ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}>
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-medium">{company.company_name}</span>
                          <div className="flex items-center space-x-1">
                            <span className="text-xs text-gray-600">
                              {formatFiat(company.total_balance)}
                            </span>
                            {showProjected && projectedCompany && (
                              <span className={`text-xs ${hasChanges ? 'text-orange-600 font-semibold' : 'text-blue-600'}`}>
                                → {formatFiat(projectedCompany.total_balance)}
                              </span>
                            )}
                          </div>
                        </div>
                        {company.accounts.length > 0 && (
                          <div className="pl-1 mt-0.5">
                            {company.accounts.map((account) => {
                              const projectedAccount = showProjected && projectedCompany
                                ? projectedCompany.accounts.find(a => a.id === account.id)
                                : null;
                              const accountHasChanges = projectedAccount && 
                                Math.abs(projectedAccount.balance - account.balance) > 0.01;
                              
                              return (
                                <div key={account.id} className={`text-xs ${accountHasChanges ? 'text-orange-600 font-medium' : 'text-gray-500'}`}>
                                  {account.account_name}: {formatFiat(account.balance)}
                                  {accountHasChanges && projectedAccount && (
                                    <span className="ml-1">→ {formatFiat(projectedAccount.balance)}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Правая колонка: Crypto Balances */}
        {current.crypto_balances.length > 0 && (
          <div>
            <h3 className="text-xs font-medium mb-1 text-gray-700">Crypto Balances</h3>
            <div className="space-y-1">
              {current.crypto_balances.map((crypto) => {
                const projectedCrypto = showProjected
                  ? projected.crypto_balances.find((c) => c.account_id === crypto.account_id)
                  : null;

                const cryptoHasChanges = showProjected && projectedCrypto && 
                  Math.abs(projectedCrypto.balance - crypto.balance) > 0.01;
                
                return (
                  <div key={crypto.account_id} className={`flex justify-between items-center p-1.5 rounded border ${cryptoHasChanges ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}>
                    <span className="text-xs font-medium">{crypto.account_name}</span>
                    <div className="flex items-center space-x-1">
                      <span className="text-xs text-gray-600">
                        {formatCrypto(crypto.balance)} {crypto.currency}
                      </span>
                      {showProjected && projectedCrypto && (
                        <span className={`text-xs ${cryptoHasChanges ? 'text-orange-600 font-semibold' : 'text-blue-600'}`}>
                          → {formatCrypto(projectedCrypto.balance)} {projectedCrypto.currency}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
