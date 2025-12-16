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

export function CompanyBalancesDisplay({ showProjected = false }: { showProjected?: boolean }) {
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
  const projected = balancesData.projected;

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
  const formatCrypto = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });

  return (
    <div className="bg-white shadow rounded-lg p-4 mb-6">
      <h2 className="text-xs font-semibold mb-3">Company Balances</h2>
      
      <div className="grid grid-cols-2 gap-4">
        {/* Левая колонка: Company Accounts */}
        <div>
          <h3 className="text-xs font-medium mb-2 text-gray-700">Company Accounts</h3>
          <div className="space-y-2">
            {Object.entries(companiesByCurrency).map(([currency, companies]) => {
              return (
                <div key={currency} className="space-y-1">
                  {companies.map((company) => {
                    const projectedCompany = showProjected
                      ? projected.companies.find((c) => c.company_id === company.company_id && c.currency === currency)
                      : null;

                    return (
                      <div key={company.company_id} className="border border-gray-200 rounded p-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-medium">{company.company_name}</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-600">
                              {formatFiat(company.total_balance)}
                            </span>
                            {showProjected && projectedCompany && (
                              <span className="text-xs text-blue-600">
                                → {formatFiat(projectedCompany.total_balance)}
                              </span>
                            )}
                          </div>
                        </div>
                        {company.accounts.length > 0 && (
                          <div className="pl-2 mt-0.5">
                            {company.accounts.map((account) => (
                              <div key={account.id} className="text-xs text-gray-500">
                                {account.account_name}: {formatFiat(account.balance)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
            <div className="flex justify-between items-center">
              <span className="font-medium">Total:</span>
              <div className="flex items-center space-x-2">
                <span className="text-gray-700">
                  {formatFiat(current.total_company_balance)}
                </span>
                {showProjected && (
                  <span className="text-blue-600">
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
            <h3 className="text-xs font-medium mb-2 text-gray-700">Crypto Balances</h3>
            <div className="space-y-2">
              {current.crypto_balances.map((crypto) => {
                const projectedCrypto = showProjected
                  ? projected.crypto_balances.find((c) => c.account_id === crypto.account_id)
                  : null;

                return (
                  <div key={crypto.account_id} className="flex justify-between items-center p-2 bg-gray-50 rounded border border-gray-200">
                    <span className="text-xs font-medium">{crypto.account_name}</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-600">
                        {formatCrypto(crypto.balance)} {crypto.currency}
                      </span>
                      {showProjected && projectedCrypto && (
                        <span className="text-xs text-blue-600">
                          → {formatCrypto(projectedCrypto.balance)} {projectedCrypto.currency}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
              <div className="flex justify-between items-center">
                <span className="font-medium">Total:</span>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-700">
                    {formatCrypto(current.total_crypto_balance)}
                  </span>
                  {showProjected && (
                    <span className="text-blue-600">
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
