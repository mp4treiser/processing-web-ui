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
  console.log('[CompanyBalancesDisplay] Received selectedAccounts:', selectedAccounts, 'length:', selectedAccounts?.length);
  if (selectedAccounts && selectedAccounts.length > 0) {
    const accountChanges: Record<number, number> = {};
    selectedAccounts.forEach(acc => {
      const accountId = Number(acc.account_id);
      const amount = Number(acc.amount);
      console.log('[CompanyBalancesDisplay] Processing account:', { accountId, amount, original: acc });
      if (!isNaN(accountId) && !isNaN(amount)) {
        if (!accountChanges[accountId]) {
          accountChanges[accountId] = 0;
        }
        accountChanges[accountId] += amount;
        console.log('[CompanyBalancesDisplay] Account change updated:', { accountId, totalChange: accountChanges[accountId] });
      } else {
        console.warn('[CompanyBalancesDisplay] Invalid account data:', { accountId, amount, acc });
      }
    });
    
    console.log('[CompanyBalancesDisplay] Final accountChanges:', accountChanges);
    console.log('[CompanyBalancesDisplay] AccountChanges keys (as numbers):', Object.keys(accountChanges).map(k => Number(k)));

    // Создаём проекцию с учётом выбранных счетов
    // Применяем изменения к projected балансам (которые уже включают изменения от сохраненных сделок)
    // и добавляем изменения от текущей создаваемой сделки
    const baseProjected = { ...projected };
    
    // Для отладки - логируем изменения
    console.log('[CompanyBalancesDisplay] Selected accounts:', selectedAccounts);
    console.log('[CompanyBalancesDisplay] Account changes:', accountChanges);
    console.log('[CompanyBalancesDisplay] Current crypto balances:', current.crypto_balances.map(c => ({ account_id: c.account_id, account_idType: typeof c.account_id, name: c.account_name, currency: c.currency, balance: c.balance })));
    console.log('[CompanyBalancesDisplay] Base projected crypto balances:', baseProjected.crypto_balances.map(c => ({ account_id: c.account_id, account_idType: typeof c.account_id, name: c.account_name, currency: c.currency, balance: c.balance })));
    
    // Проверяем соответствие ID
    const selectedAccountIds = selectedAccounts.map(a => Number(a.account_id));
    const cryptoAccountIds = current.crypto_balances.map(c => c.account_id);
    console.log('[CompanyBalancesDisplay] ID matching check:', {
      selectedAccountIds,
      cryptoAccountIds,
      matchingIds: selectedAccountIds.filter(id => cryptoAccountIds.includes(id)),
      missingIds: selectedAccountIds.filter(id => !cryptoAccountIds.includes(id))
    });
    
    projected = {
      ...projected,
      companies: baseProjected.companies.map(company => {
        const updatedAccounts = company.accounts.map(account => {
          const change = accountChanges[account.id] || 0;
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
      crypto_balances: current.crypto_balances.map(crypto => {
        // Находим соответствующий баланс в projected (если есть изменения от других сделок)
        const projectedCrypto = baseProjected.crypto_balances.find(c => c.account_id === crypto.account_id);
        
        // Базовый баланс: используем projected если есть (уже включает изменения от других сделок),
        // иначе используем current (текущий баланс без изменений)
        // ВАЖНО: конвертируем в число, так как может прийти строка из API
        const baseBalance = Number(projectedCrypto ? projectedCrypto.balance : crypto.balance);
        
        // Применяем изменения от выбранных счетов (текущая создаваемая сделка)
        // Ищем изменения по account_id (который равен id из AccountBalance)
        const change = Number(accountChanges[crypto.account_id] ?? 0);
        const newBalance = baseBalance + change;
        
        // Для отладки - логируем все crypto accounts и их изменения
        console.log(`[Balance Calc] Crypto account ${crypto.account_id} (${crypto.account_name}):`, {
          account_id: crypto.account_id,
          currentBalance: crypto.balance,
          currentBalanceType: typeof crypto.balance,
          currentBalanceAsNumber: Number(crypto.balance),
          projectedBalance: projectedCrypto?.balance,
          projectedBalanceType: typeof projectedCrypto?.balance,
          projectedBalanceAsNumber: projectedCrypto ? Number(projectedCrypto.balance) : null,
          baseBalance,
          baseBalanceType: typeof baseBalance,
          change,
          changeType: typeof change,
          accountChangesForThisId: accountChanges[crypto.account_id],
          accountChangesForThisIdType: typeof accountChanges[crypto.account_id],
          newBalance,
          newBalanceType: typeof newBalance,
          calculation: `${baseBalance} + ${change} = ${newBalance}`
        });
        
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
          <div className="mt-1 p-1.5 bg-gray-50 rounded text-xs">
            <div className="flex justify-between items-center">
              <span className="font-medium">Total:</span>
              <div className="flex items-center space-x-1">
                <span className="text-gray-700">
                  {formatFiat(current.total_company_balance)}
                </span>
                {showProjected && (
                  <span className={Math.abs(projected.total_company_balance - current.total_company_balance) > 0.01 ? 'text-orange-600 font-semibold' : 'text-blue-600'}>
                    → {formatFiat(projected.total_company_balance)}
                  </span>
                )}
              </div>
            </div>
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
            <div className="mt-1 p-1.5 bg-gray-50 rounded text-xs">
              <div className="flex justify-between items-center">
                <span className="font-medium">Total:</span>
                <div className="flex items-center space-x-1">
                  <span className="text-gray-700">
                    {formatCrypto(current.total_crypto_balance)}
                  </span>
                  {showProjected && (
                    <span className={Math.abs(projected.total_crypto_balance - current.total_crypto_balance) > 0.0001 ? 'text-orange-600 font-semibold' : 'text-blue-600'}>
                      → {formatCrypto(projected.total_crypto_balance)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
