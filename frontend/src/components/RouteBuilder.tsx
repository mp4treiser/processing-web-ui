import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../lib/api';

interface Currency {
  id: number;
  code: string;
  name: string;
  is_crypto: boolean;
}

interface Company {
  id: number;
  name: string;
}

interface CompanyAccount {
  id: number;
  company_id: number;
  account_name: string;
  account_number: string;
  currency: string;
}

interface InternalCompany {
  id: number;
  name: string;
}

interface InternalCompanyAccount {
  id: number;
  company_id: number;
  account_name: string;
  account_number: string;
  currency: string;
  balance: number;
  is_active: boolean;
}

interface AccountBalance {
  id: number;
  account_name: string;
  currency: string;
  balance: number;
}

interface RouteCommission {
  id: number;
  route_type: string;
  commission_percent: number | null;
  commission_fixed: number | null;
  is_fixed_currency: boolean;
  currency: string | null;
  is_active: boolean;
}

interface Route {
  id?: string; // Временный ID для React key
  route_type: 'direct' | 'exchange' | 'partner' | 'partner_50_50' | '';
  
  // Общие поля для всех маршрутов
  exchange_rate: number; // Курс обмена
  
  // Direct
  internal_company_id?: number;
  internal_company_account_id?: number;
  amount_from_account?: number; // Сумма, которую клиент получит (в Client Receives Currency)
  bank_commission_id?: number;
  
  // Exchange
  crypto_account_id?: number;
  exchange_from_currency?: string; // Валюта, которую меняем на бирже
  exchange_amount?: number; // Сумма для обмена
  crypto_exchange_rate?: number; // Курс обмена на бирже
  agent_commission_id?: number;
  exchange_commission_id?: number;
  exchange_bank_commission_id?: number;
  
  // Partner
  partner_company_id?: number; // ID компании клиента (партнера)
  partner_account_id?: number; // ID счета компании партнера
  amount_to_partner_usdt?: number; // Сумма, которую отправляем партнеру в USDT
  amount_partner_sends?: number; // Сумма, которую партнер отправит клиенту (в Client Receives Currency)
  partner_commission_id?: number;
  
  // Partner 50-50
  partner_50_50_company_id?: number; // ID компании клиента (партнера)
  partner_50_50_account_id?: number; // ID счета компании партнера
  amount_to_partner_50_50_usdt?: number; // Сумма, которую отправляем партнеру в USDT
  amount_partner_50_50_sends?: number; // Сумма, которую партнер отправит клиенту (в Client Receives Currency)
  partner_50_50_commission_id?: number;
  
  // Calculated
  final_income?: number; // Route Income - сумма, которую клиент должен отправить нам
}

interface TransactionRoute {
  id?: number;
  client_company_id: number; // Компания клиента
  amount_for_client: number; // Сумма, которую отправим на компанию клиента (автоматически считается из маршрутов)
  routes: Route[]; // Массив маршрутов для этой транзакции
  
  // Calculated - сумма всех маршрутов
  final_income?: number;
}

interface SelectedAccount {
  account_id: number;
  amount: number; // Отрицательное значение означает списание
  currency: string;
}

interface RouteBuilderProps {
  clientId: number;
  transactions: TransactionRoute[];
  onUpdate: (transactions: TransactionRoute[]) => void;
  dealAmount?: number; // Сумма, которую клиент хочет получить (в Client Receives Currency)
  clientSendsCurrency?: string; // Валюта, которую клиент отправляет
  clientReceivesCurrency?: string; // Валюта, которую клиент получает
  onSelectedAccountsChange?: (accounts: SelectedAccount[]) => void; // Callback для передачи выбранных счетов
}

export function RouteBuilder({ clientId, transactions, onUpdate, dealAmount, clientSendsCurrency, clientReceivesCurrency, onSelectedAccountsChange }: RouteBuilderProps) {
  // Загружаем справочники
  const { data: currencies } = useQuery<Currency[]>({
    queryKey: ['reference-currencies'],
    queryFn: async () => {
      const response = await api.get('/api/reference/currencies');
      return response.data;
    },
  });

  const { data: clientCompanies } = useQuery<Company[]>({
    queryKey: ['reference-companies', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const response = await api.get(`/api/reference/companies?client_id=${clientId}`);
      return response.data;
    },
    enabled: !!clientId,
  });

  // Загружаем компании всех клиентов для выбора партнеров
  const { data: allClientCompanies } = useQuery<Company[]>({
    queryKey: ['reference-all-companies'],
    queryFn: async () => {
      // Получаем все компании всех клиентов
      const clients = await api.get('/api/reference/clients');
      const allCompanies: Company[] = [];
      for (const client of clients.data) {
        try {
          const companies = await api.get(`/api/reference/companies?client_id=${client.id}`);
          allCompanies.push(...companies.data);
        } catch (e) {
          // Игнорируем ошибки
        }
      }
      return allCompanies;
    },
  });

  // Загружаем счета компаний клиентов для выбора счета партнера
  const { data: allCompanyAccounts } = useQuery<CompanyAccount[]>({
    queryKey: ['reference-all-company-accounts'],
    queryFn: async () => {
      const response = await api.get('/api/reference/company-accounts');
      return response.data;
    },
  });

  const { data: internalCompanies } = useQuery<InternalCompany[]>({
    queryKey: ['reference-internal-companies'],
    queryFn: async () => {
      const response = await api.get('/api/reference/internal-companies');
      return response.data;
    },
  });

  const { data: internalAccounts } = useQuery<InternalCompanyAccount[]>({
    queryKey: ['reference-internal-company-accounts'],
    queryFn: async () => {
      const response = await api.get('/api/reference/internal-company-accounts');
      return response.data;
    },
  });

  const { data: cryptoBalances } = useQuery<AccountBalance[]>({
    queryKey: ['account-balances'],
    queryFn: async () => {
      const response = await api.get('/api/account-balances');
      return response.data;
    },
  });

  const { data: routeCommissions } = useQuery<RouteCommission[]>({
    queryKey: ['reference-route-commissions'],
    queryFn: async () => {
      const response = await api.get('/api/reference/route-commissions');
      return response.data;
    },
  });

  // Функция для расчета Route Income для одного маршрута
  const calculateRouteFinalIncome = (route: Route) => {
    if (!route.route_type || !route.exchange_rate) {
      route.final_income = undefined;
      return;
    }

    let income = 0;
    
    // Применяем расчеты в зависимости от типа маршрута
    if (route.route_type === 'direct') {
      // Direct Transfer: (Amount from Account - Amount from Account * Bank Commission%) * Exchange Rate
      // Если комиссия отрицательная (-0.3%), то это (amount - amount*(-0.3%/100)) = (amount + amount*0.3%/100)
      if (!route.amount_from_account) {
        route.final_income = undefined;
        return;
      }
      
      let amount = route.amount_from_account;
      const commission = routeCommissions?.find(c => c.id === route.bank_commission_id);
      if (commission) {
        if (commission.is_fixed_currency && commission.commission_fixed) {
          amount += commission.commission_fixed;
        } else if (commission.commission_percent) {
          // Комиссия применяется как вычитание: amount - amount*commission%/100
          amount = amount - (amount * commission.commission_percent / 100);
        }
      }
      income = amount * route.exchange_rate;
      
    } else if (route.route_type === 'exchange') {
      // Exchange: сложный расчет с несколькими комиссиями
      if (!route.amount_from_account || !route.crypto_exchange_rate || !route.exchange_rate) {
        route.final_income = undefined;
        return;
      }
      
      // Начальная сумма = Amount from Account (сумма, которую клиент получит)
      let amount = route.amount_from_account;
      
      // Применяем Agent Commission (вычитаем комиссию)
      const agentComm = routeCommissions?.find(c => c.id === route.agent_commission_id);
      if (agentComm) {
        if (agentComm.is_fixed_currency && agentComm.commission_fixed) {
          amount -= agentComm.commission_fixed;
        } else if (agentComm.commission_percent) {
          amount = amount - (amount * agentComm.commission_percent / 100);
        }
      }
      
      // Применяем Exchange Commission (вычитаем комиссию)
      const exchangeComm = routeCommissions?.find(c => c.id === route.exchange_commission_id);
      if (exchangeComm) {
        if (exchangeComm.is_fixed_currency && exchangeComm.commission_fixed) {
          amount -= exchangeComm.commission_fixed;
        } else if (exchangeComm.commission_percent) {
          amount = amount - (amount * exchangeComm.commission_percent / 100);
        }
      }
      
      // Применяем Bank Commission (вычитаем комиссию)
      const bankComm = routeCommissions?.find(c => c.id === route.exchange_bank_commission_id);
      if (bankComm) {
        if (bankComm.is_fixed_currency && bankComm.commission_fixed) {
          amount -= bankComm.commission_fixed;
        } else if (bankComm.commission_percent) {
          amount = amount - (amount * bankComm.commission_percent / 100);
        }
      }
      
      // Exchange Amount = (Amount from Account - все комиссии) * Crypto Exchange Rate
      const exchangeAmount = amount * route.crypto_exchange_rate;
      
      // Route Income = Exchange Amount * Exchange Rate
      income = exchangeAmount * route.exchange_rate;
      
    } else if (route.route_type === 'partner') {
      // Partner: Route Income = большая сумма из Amount Partner Sends и Amount to Partner (USDT)
      if (!route.amount_from_account || !route.exchange_rate) {
        route.final_income = undefined;
        return;
      }
      
      // Используем актуальные значения, если они есть, иначе рассчитываем
      const amountPartnerSends = route.amount_partner_sends !== undefined && route.amount_partner_sends !== null
        ? route.amount_partner_sends 
        : (route.amount_from_account * route.exchange_rate);
      const amountToPartner = route.amount_to_partner_usdt !== undefined && route.amount_to_partner_usdt !== null
        ? route.amount_to_partner_usdt 
        : 0;
      
      // Используем большую сумму
      income = Math.max(amountPartnerSends, amountToPartner);
      
    } else if (route.route_type === 'partner_50_50') {
      // Partner 50/50: Route Income = большая сумма из Amount Partner Sends и Amount to Partner (USDT)
      if (!route.amount_from_account || !route.exchange_rate) {
        route.final_income = undefined;
        return;
      }
      
      // Используем актуальные значения, если они есть, иначе рассчитываем
      const amountPartnerSends = route.amount_partner_50_50_sends !== undefined && route.amount_partner_50_50_sends !== null
        ? route.amount_partner_50_50_sends 
        : (route.amount_from_account * route.exchange_rate);
      const amountToPartner = route.amount_to_partner_50_50_usdt !== undefined && route.amount_to_partner_50_50_usdt !== null
        ? route.amount_to_partner_50_50_usdt 
        : 0;
      
      // Используем большую сумму
      income = Math.max(amountPartnerSends, amountToPartner);
    }
    
    route.final_income = income;
  };

  // Функция для расчета суммы транзакции и общего дохода
  const calculateTransactionAmountAndIncome = (trans: TransactionRoute) => {
    if (!trans.routes || trans.routes.length === 0) {
      trans.amount_for_client = 0;
      trans.final_income = undefined;
      return;
    }

    // Пересчитываем доход для каждого маршрута
    trans.routes.forEach(route => {
      calculateRouteFinalIncome(route);
    });

    // Сумма для клиента = сумма всех amount_from_account из маршрутов
    trans.amount_for_client = trans.routes.reduce((sum, route) => {
      if (route.route_type === 'direct' || route.route_type === 'exchange' || route.route_type === 'partner' || route.route_type === 'partner_50_50') {
        return sum + (route.amount_from_account || 0);
      }
      return sum;
    }, 0);

    // Суммируем доходы всех маршрутов (Route Income)
    trans.final_income = trans.routes.reduce((sum, route) => sum + (route.final_income || 0), 0);
  };

    // Автоматически пересчитываем суммы при изменении маршрутов
    useEffect(() => {
      const updated = transactions.map(trans => {
        calculateTransactionAmountAndIncome(trans);
        return trans;
      });
      onUpdate(updated);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transactions.length]);

    // Автоматически рассчитываем Exchange Amount для Exchange маршрутов
    useEffect(() => {
      const updated = transactions.map(trans => {
        const updatedRoutes = trans.routes.map(route => {
          if (route.route_type === 'exchange' && route.amount_from_account && route.crypto_exchange_rate) {
            let amount = route.amount_from_account;
            
            // Применяем комиссии (вычитаем)
            const agentComm = routeCommissions?.find(c => c.id === route.agent_commission_id);
            if (agentComm) {
              if (agentComm.is_fixed_currency && agentComm.commission_fixed) {
                amount -= agentComm.commission_fixed;
              } else if (agentComm.commission_percent) {
                amount = amount - (amount * agentComm.commission_percent / 100);
              }
            }
            
            const exchangeComm = routeCommissions?.find(c => c.id === route.exchange_commission_id);
            if (exchangeComm) {
              if (exchangeComm.is_fixed_currency && exchangeComm.commission_fixed) {
                amount -= exchangeComm.commission_fixed;
              } else if (exchangeComm.commission_percent) {
                amount = amount - (amount * exchangeComm.commission_percent / 100);
              }
            }
            
            const bankComm = routeCommissions?.find(c => c.id === route.exchange_bank_commission_id);
            if (bankComm) {
              if (bankComm.is_fixed_currency && bankComm.commission_fixed) {
                amount -= bankComm.commission_fixed;
              } else if (bankComm.commission_percent) {
                amount = amount - (amount * bankComm.commission_percent / 100);
              }
            }
            
            // Exchange Amount = (Amount from Account - все комиссии) * Crypto Exchange Rate
            route.exchange_amount = amount * route.crypto_exchange_rate;
          }
          return route;
        });
        return { ...trans, routes: updatedRoutes };
      });
      
      // Пересчитываем доходы после обновления Exchange Amount
      updated.forEach(trans => {
        calculateTransactionAmountAndIncome(trans);
      });
      
      if (JSON.stringify(updated) !== JSON.stringify(transactions)) {
        onUpdate(updated);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transactions.map(t => t.routes.map(r => ({
      route_type: r.route_type,
      amount_from_account: r.amount_from_account,
      crypto_exchange_rate: r.crypto_exchange_rate,
      agent_commission_id: r.agent_commission_id,
      exchange_commission_id: r.exchange_commission_id,
      exchange_bank_commission_id: r.exchange_bank_commission_id,
    }))).join(','), routeCommissions]);

  const addTransaction = () => {
    const newTrans: TransactionRoute = {
      client_company_id: 0,
      amount_for_client: 0, // Будет автоматически считаться из маршрутов
      routes: [],
    };
    onUpdate([...transactions, newTrans]);
  };

  const addRoute = (transactionIndex: number) => {
    const updated = [...transactions];
    const newRoute: Route = {
      id: `route-${Date.now()}-${Math.random()}`,
      route_type: '',
      exchange_rate: 0,
    };
    updated[transactionIndex].routes = [...(updated[transactionIndex].routes || []), newRoute];
    calculateTransactionAmountAndIncome(updated[transactionIndex]);
    onUpdate(updated);
  };

  const removeRoute = (transactionIndex: number, routeIndex: number) => {
    const updated = [...transactions];
    updated[transactionIndex].routes = updated[transactionIndex].routes.filter((_, i) => i !== routeIndex);
    calculateTransactionAmountAndIncome(updated[transactionIndex]);
    onUpdate(updated);
  };

  const updateRoute = (transactionIndex: number, routeIndex: number, field: keyof Route, value: any) => {
    const updated = [...transactions];
    updated[transactionIndex].routes[routeIndex] = { 
      ...updated[transactionIndex].routes[routeIndex], 
      [field]: value 
    };
    
    // Сбрасываем зависимые поля при изменении типа маршрута
    if (field === 'route_type') {
      const resetFields: (keyof Route)[] = [
        'internal_company_id', 'internal_company_account_id', 'amount_from_account', 'bank_commission_id',
        'crypto_account_id', 'exchange_from_currency', 'exchange_amount', 'crypto_exchange_rate',
        'agent_commission_id', 'exchange_commission_id', 'exchange_bank_commission_id',
        'partner_company_id', 'partner_account_id', 'amount_to_partner_usdt', 'amount_partner_sends', 'partner_commission_id',
        'partner_50_50_company_id', 'partner_50_50_account_id', 'amount_to_partner_50_50_usdt', 'amount_partner_50_50_sends', 'partner_50_50_commission_id',
      ];
      resetFields.forEach(f => {
        (updated[transactionIndex].routes[routeIndex] as any)[f] = undefined;
      });
    }
    
    // Сбрасываем счет при изменении компании
    if (field === 'internal_company_id') {
      updated[transactionIndex].routes[routeIndex].internal_company_account_id = undefined;
    }
    
    // Сбрасываем счет партнера при изменении компании партнера
    if (field === 'partner_company_id') {
      updated[transactionIndex].routes[routeIndex].partner_account_id = undefined;
    }
    
    if (field === 'partner_50_50_company_id') {
      updated[transactionIndex].routes[routeIndex].partner_50_50_account_id = undefined;
    }

    // Автоматически подставляем комиссию по умолчанию
    if (field === 'route_type' && value && routeCommissions) {
      const defaultCommission = routeCommissions.find(c => c.route_type === value && c.is_active);
      if (defaultCommission) {
        if (value === 'direct') {
          updated[transactionIndex].routes[routeIndex].bank_commission_id = defaultCommission.id;
        } else if (value === 'exchange') {
          const agentComm = routeCommissions.find(c => c.route_type === 'agent' && c.is_active);
          const exchangeComm = routeCommissions.find(c => c.route_type === 'exchange' && c.is_active);
          const bankComm = routeCommissions.find(c => c.route_type === 'direct' && c.is_active);
          if (agentComm) updated[transactionIndex].routes[routeIndex].agent_commission_id = agentComm.id;
          if (exchangeComm) updated[transactionIndex].routes[routeIndex].exchange_commission_id = exchangeComm.id;
          if (bankComm) updated[transactionIndex].routes[routeIndex].exchange_bank_commission_id = bankComm.id;
        } else if (value === 'partner') {
          updated[transactionIndex].routes[routeIndex].partner_commission_id = defaultCommission.id;
        } else if (value === 'partner_50_50') {
          updated[transactionIndex].routes[routeIndex].partner_50_50_commission_id = defaultCommission.id;
        }
      }
    }

    // Автоматический расчет для Partner
    const currentRoute = updated[transactionIndex].routes[routeIndex];
    if (currentRoute.route_type === 'partner') {
      const routeData = updated[transactionIndex].routes[routeIndex];
      if (field === 'amount_from_account' && value && routeData.exchange_rate) {
        // Amount Partner Sends = Amount from Account * Exchange Rate
        let amountPartnerSends = value * routeData.exchange_rate;
        updated[transactionIndex].routes[routeIndex].amount_partner_sends = amountPartnerSends;
        
        // Amount to Partner (USDT) = Amount Partner Sends * (1 - Partner Commission/100)
        const commission = routeCommissions?.find(c => c.id === routeData.partner_commission_id);
        if (commission && commission.commission_percent) {
          let amountToPartner = amountPartnerSends * (1 - commission.commission_percent / 100);
          
          // Если Amount to Partner > Amount Partner Sends, приравниваем Amount Partner Sends к Amount to Partner
          if (amountToPartner > amountPartnerSends) {
            amountPartnerSends = amountToPartner;
            updated[transactionIndex].routes[routeIndex].amount_partner_sends = amountPartnerSends;
          }
          
          updated[transactionIndex].routes[routeIndex].amount_to_partner_usdt = amountToPartner;
        }
      } else if (field === 'exchange_rate' && value && routeData.amount_from_account) {
        let amountPartnerSends = routeData.amount_from_account * value;
        updated[transactionIndex].routes[routeIndex].amount_partner_sends = amountPartnerSends;
        
        const commission = routeCommissions?.find(c => c.id === routeData.partner_commission_id);
        if (commission && commission.commission_percent) {
          let amountToPartner = amountPartnerSends * (1 - commission.commission_percent / 100);
          
          // Если Amount to Partner > Amount Partner Sends, приравниваем Amount Partner Sends к Amount to Partner
          if (amountToPartner > amountPartnerSends) {
            amountPartnerSends = amountToPartner;
            updated[transactionIndex].routes[routeIndex].amount_partner_sends = amountPartnerSends;
          }
          
          updated[transactionIndex].routes[routeIndex].amount_to_partner_usdt = amountToPartner;
        }
      } else if (field === 'partner_commission_id' && value && routeData.amount_partner_sends) {
        const commission = routeCommissions?.find(c => c.id === value);
        if (commission && commission.commission_percent) {
          let amountToPartner = routeData.amount_partner_sends * (1 - commission.commission_percent / 100);
          
          // Если Amount to Partner > Amount Partner Sends, приравниваем Amount Partner Sends к Amount to Partner
          if (amountToPartner > routeData.amount_partner_sends) {
            updated[transactionIndex].routes[routeIndex].amount_partner_sends = amountToPartner;
          }
          
          updated[transactionIndex].routes[routeIndex].amount_to_partner_usdt = amountToPartner;
        }
      }
    }

    if (currentRoute.route_type === 'partner_50_50') {
      const routeData = updated[transactionIndex].routes[routeIndex];
      if (field === 'amount_from_account' && value && routeData.exchange_rate) {
        let amountPartnerSends = value * routeData.exchange_rate;
        updated[transactionIndex].routes[routeIndex].amount_partner_50_50_sends = amountPartnerSends;
        
        const commission = routeCommissions?.find(c => c.id === routeData.partner_50_50_commission_id);
        if (commission && commission.commission_percent) {
          let amountToPartner = amountPartnerSends * (1 - commission.commission_percent / 100);
          
          // Если Amount to Partner > Amount Partner Sends, приравниваем Amount Partner Sends к Amount to Partner
          if (amountToPartner > amountPartnerSends) {
            amountPartnerSends = amountToPartner;
            updated[transactionIndex].routes[routeIndex].amount_partner_50_50_sends = amountPartnerSends;
          }
          
          updated[transactionIndex].routes[routeIndex].amount_to_partner_50_50_usdt = amountToPartner;
        }
      } else if (field === 'exchange_rate' && value && routeData.amount_from_account) {
        let amountPartnerSends = routeData.amount_from_account * value;
        updated[transactionIndex].routes[routeIndex].amount_partner_50_50_sends = amountPartnerSends;
        
        const commission = routeCommissions?.find(c => c.id === routeData.partner_50_50_commission_id);
        if (commission && commission.commission_percent) {
          let amountToPartner = amountPartnerSends * (1 - commission.commission_percent / 100);
          
          // Если Amount to Partner > Amount Partner Sends, приравниваем Amount Partner Sends к Amount to Partner
          if (amountToPartner > amountPartnerSends) {
            amountPartnerSends = amountToPartner;
            updated[transactionIndex].routes[routeIndex].amount_partner_50_50_sends = amountPartnerSends;
          }
          
          updated[transactionIndex].routes[routeIndex].amount_to_partner_50_50_usdt = amountToPartner;
        }
      } else if (field === 'partner_50_50_commission_id' && value && routeData.amount_partner_50_50_sends) {
        const commission = routeCommissions?.find(c => c.id === value);
        if (commission && commission.commission_percent) {
          let amountToPartner = routeData.amount_partner_50_50_sends * (1 - commission.commission_percent / 100);
          
          // Если Amount to Partner > Amount Partner Sends, приравниваем Amount Partner Sends к Amount to Partner
          if (amountToPartner > routeData.amount_partner_50_50_sends) {
            updated[transactionIndex].routes[routeIndex].amount_partner_50_50_sends = amountToPartner;
            // Обновляем routeData для дальнейших расчетов
            routeData.amount_partner_50_50_sends = amountToPartner;
          }
          
          updated[transactionIndex].routes[routeIndex].amount_to_partner_50_50_usdt = amountToPartner;
        }
      }
    }

    // Автоматически рассчитываем Exchange Amount для Exchange маршрутов
    if (currentRoute.route_type === 'exchange' && currentRoute.amount_from_account && currentRoute.crypto_exchange_rate) {
      let amount = currentRoute.amount_from_account;
      
      // Применяем комиссии (вычитаем)
      const agentComm = routeCommissions?.find(c => c.id === currentRoute.agent_commission_id);
      if (agentComm) {
        if (agentComm.is_fixed_currency && agentComm.commission_fixed) {
          amount -= agentComm.commission_fixed;
        } else if (agentComm.commission_percent) {
          amount = amount - (amount * agentComm.commission_percent / 100);
        }
      }
      
      const exchangeComm = routeCommissions?.find(c => c.id === currentRoute.exchange_commission_id);
      if (exchangeComm) {
        if (exchangeComm.is_fixed_currency && exchangeComm.commission_fixed) {
          amount -= exchangeComm.commission_fixed;
        } else if (exchangeComm.commission_percent) {
          amount = amount - (amount * exchangeComm.commission_percent / 100);
        }
      }
      
      const bankComm = routeCommissions?.find(c => c.id === currentRoute.exchange_bank_commission_id);
      if (bankComm) {
        if (bankComm.is_fixed_currency && bankComm.commission_fixed) {
          amount -= bankComm.commission_fixed;
        } else if (bankComm.commission_percent) {
          amount = amount - (amount * bankComm.commission_percent / 100);
        }
      }
      
      // Exchange Amount = (Amount from Account - все комиссии) * Crypto Exchange Rate
      updated[transactionIndex].routes[routeIndex].exchange_amount = amount * currentRoute.crypto_exchange_rate;
    }
    
    // Пересчитываем доход для маршрута и транзакции
    // Важно: пересчитываем после всех обновлений, чтобы использовать актуальные значения
    // Обновляем ссылку на route после всех изменений
    const routeToCalculate = updated[transactionIndex].routes[routeIndex];
    // Убеждаемся, что используем актуальные значения из updated массива
    calculateRouteFinalIncome(routeToCalculate);
    calculateTransactionAmountAndIncome(updated[transactionIndex]);
    
    onUpdate(updated);
  };

  const removeTransaction = (index: number) => {
    onUpdate(transactions.filter((_, i) => i !== index));
  };

  const updateTransaction = (index: number, field: keyof TransactionRoute, value: any) => {
    const updated = [...transactions];
    updated[index] = { ...updated[index], [field]: value };
    
    // Пересчитываем сумму и доход для всех маршрутов в транзакции
    calculateTransactionAmountAndIncome(updated[index]);
    
    onUpdate(updated);
  };

  // Фильтруем счета по выбранной компании
  const getAccountsForCompany = (companyId?: number) => {
    if (!companyId || !internalAccounts) return [];
    return internalAccounts.filter(acc => acc.company_id === companyId && acc.is_active);
  };

  // Фильтруем счета по выбранной компании партнера
  const getAccountsForPartnerCompany = (companyId?: number) => {
    if (!companyId || !allCompanyAccounts) return [];
    return allCompanyAccounts.filter(acc => acc.company_id === companyId);
  };

  // Рассчитываем общую сумму для отправки клиентом
  const totalAmountToSend = transactions.reduce((sum, trans) => sum + (trans.final_income || 0), 0);

    // Собираем информацию о выбранных счетах для динамического расчёта остатков
    useEffect(() => {
      console.log('[RouteBuilder] useEffect triggered, onSelectedAccountsChange:', !!onSelectedAccountsChange);
      if (!onSelectedAccountsChange) {
        console.warn('[RouteBuilder] onSelectedAccountsChange is not provided');
        return;
      }
      
      const selectedAccounts: SelectedAccount[] = [];
      console.log('[RouteBuilder] Processing transactions:', transactions.length);
      
      transactions.forEach(trans => {
        trans.routes.forEach(route => {
          // Direct Transfer - списание с внутреннего счета
          if (route.route_type === 'direct' && route.internal_company_account_id && route.amount_from_account) {
            const account = internalAccounts?.find(acc => acc.id === route.internal_company_account_id);
            if (account) {
              selectedAccounts.push({
                account_id: route.internal_company_account_id,
                amount: -route.amount_from_account, // Отрицательное значение = списание
                currency: account.currency
              });
            }
          }
          
          // Exchange - списание с крипто-счета (используем exchange_amount)
          if (route.route_type === 'exchange' && route.crypto_account_id && route.exchange_amount) {
            const account = cryptoBalances?.find(acc => acc.id === route.crypto_account_id);
            if (account) {
              selectedAccounts.push({
                account_id: route.crypto_account_id,
                amount: -route.exchange_amount, // Отрицательное значение = списание
                currency: account.currency
              });
            }
          }
          
          // Partner - списание с нашего USDT баланса
          // Мы отправляем партнеру amount_to_partner_usdt в USDT
          // Партнер отправляет клиенту amount_partner_sends в валюте партнерского счета (это его деньги, не наши)
          // Поэтому списываем с НАШЕГО USDT баланса сумму, которую МЫ отправляем партнеру
          if (route.route_type === 'partner' && route.amount_to_partner_usdt) {
            // Находим наш USDT crypto account
            const usdtAccount = cryptoBalances?.find(acc => 
              acc.currency && acc.currency.toUpperCase() === 'USDT'
            );
            if (usdtAccount) {
              // Списываем amount_to_partner_usdt - это сумма, которую мы отправляем партнеру в USDT
              selectedAccounts.push({
                account_id: usdtAccount.id,
                amount: -route.amount_to_partner_usdt, // Отрицательное значение = списание
                currency: 'USDT'
              });
            }
          }
          
          // Partner 50-50 - списание с нашего USDT баланса
          // Мы отправляем партнеру amount_to_partner_50_50_usdt в USDT
          // Партнер отправляет клиенту amount_partner_50_50_sends в валюте партнерского счета (это его деньги, не наши)
          // Поэтому списываем с НАШЕГО USDT баланса сумму, которую МЫ отправляем партнеру
          if (route.route_type === 'partner_50_50' && route.amount_to_partner_50_50_usdt) {
            // Находим наш USDT crypto account
            const usdtAccount = cryptoBalances?.find(acc => 
              acc.currency && acc.currency.toUpperCase() === 'USDT'
            );
            if (usdtAccount) {
              // Списываем amount_to_partner_50_50_usdt - это сумма, которую мы отправляем партнеру в USDT
              selectedAccounts.push({
                account_id: usdtAccount.id,
                amount: -route.amount_to_partner_50_50_usdt, // Отрицательное значение = списание
                currency: 'USDT'
              });
            }
          }
        });
      });
      
      // Дедуплицируем записи для одного и того же account_id, суммируя amounts
      const deduplicatedAccounts: Record<number, SelectedAccount> = {};
      selectedAccounts.forEach(acc => {
        const accountId = Number(acc.account_id);
        if (!isNaN(accountId)) {
          if (!deduplicatedAccounts[accountId]) {
            deduplicatedAccounts[accountId] = {
              account_id: accountId,
              amount: 0,
              currency: acc.currency
            };
          }
          deduplicatedAccounts[accountId].amount += Number(acc.amount) || 0;
        }
      });
      
      const finalAccounts = Object.values(deduplicatedAccounts);
      console.log('[RouteBuilder] Final selected accounts to send:', finalAccounts);
      console.log('[RouteBuilder] Crypto balances from API:', cryptoBalances?.map(c => ({ id: c.id, idType: typeof c.id, name: c.account_name, currency: c.currency })));
      onSelectedAccountsChange(finalAccounts);
    }, [
      JSON.stringify(transactions.map(t => t.routes.map(r => ({
        route_type: r.route_type,
        internal_company_account_id: r.internal_company_account_id,
        amount_from_account: r.amount_from_account,
        crypto_account_id: r.crypto_account_id,
        exchange_amount: r.exchange_amount,
        partner_account_id: r.partner_account_id,
        amount_partner_sends: r.amount_partner_sends,
        amount_to_partner_usdt: r.amount_to_partner_usdt,
        partner_50_50_account_id: r.partner_50_50_account_id,
        amount_partner_50_50_sends: r.amount_partner_50_50_sends,
        amount_to_partner_50_50_usdt: r.amount_to_partner_50_50_usdt,
      })))),
      JSON.stringify(internalAccounts),
      JSON.stringify(cryptoBalances),
      JSON.stringify(allCompanyAccounts),
      onSelectedAccountsChange
    ]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {transactions.map((trans, index) => (
          <div key={index} className="border border-gray-200 rounded-md p-2 bg-gray-50 flex-1 min-w-0">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-xs font-semibold">Transaction {index + 1}</h3>
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

          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="block text-xs font-medium mb-0.5">Client Company *</label>
              <select
                value={trans.client_company_id || ''}
                onChange={(e) => updateTransaction(index, 'client_company_id', parseInt(e.target.value) || 0)}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                required
              >
                <option value="">Select company</option>
                {clientCompanies?.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-0.5">Amount for Client (auto)</label>
              <input
                type="number"
                step="0.01"
                value={trans.amount_for_client || ''}
                readOnly
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md bg-gray-100"
              />
            </div>
          </div>

          {/* Маршруты для транзакции */}
          <div className="mt-2">
            <div className="flex justify-between items-center mb-1">
              <h4 className="text-xs font-medium">Routes</h4>
              <button
                type="button"
                onClick={() => addRoute(index)}
                className="px-2 py-0.5 bg-indigo-600 text-white text-xs rounded-md hover:bg-indigo-700"
              >
                + Add Route
              </button>
            </div>

            {(!trans.routes || trans.routes.length === 0) && (
              <div className="text-sm text-gray-500 p-3 bg-gray-100 rounded-md">
                No routes added. Click "+ Add Route" to add a route for this transaction.
              </div>
            )}

            {trans.routes && trans.routes.map((route, routeIndex) => (
              <div key={route.id || routeIndex} className="mb-2 p-2 border border-gray-300 rounded-md bg-white">
                <div className="flex justify-between items-start mb-1">
                  <h5 className="font-medium text-xs">Route {routeIndex + 1}</h5>
                  {trans.routes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRoute(index, routeIndex)}
                      className="text-red-600 hover:text-red-800 text-xs"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="mb-2">
                  <label className="block text-xs font-medium mb-0.5">Route Type *</label>
                  <select
                    value={route.route_type}
                    onChange={(e) => updateRoute(index, routeIndex, 'route_type', e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                    required
                  >
                    <option value="">Select route type</option>
                    <option value="direct">Direct Transfer</option>
                    <option value="exchange">Exchange</option>
                    <option value="partner">Partner</option>
                    <option value="partner_50_50">Partner 50-50</option>
                  </select>
                </div>

                {/* Exchange Rate для всех маршрутов */}
                <div className="mb-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Exchange Rate *</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={route.exchange_rate || ''}
                      onChange={(e) => updateRoute(index, routeIndex, 'exchange_rate', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                      required
                    />
                  </div>
                </div>

                {/* Поля для прямого перевода */}
                {route.route_type === 'direct' && (
                  <div className="mt-2 p-2 bg-blue-50 rounded-md space-y-1">
                    <h4 className="text-xs font-medium text-blue-900">Direct Transfer Settings</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium mb-0.5">Internal Company *</label>
                        <select
                          value={route.internal_company_id || ''}
                          onChange={(e) => updateRoute(index, routeIndex, 'internal_company_id', parseInt(e.target.value) || undefined)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                          required
                        >
                          <option value="">Select company</option>
                          {internalCompanies?.map((comp) => (
                            <option key={comp.id} value={comp.id}>
                              {comp.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-0.5">Company Account *</label>
                        <select
                          value={route.internal_company_account_id || ''}
                          onChange={(e) => updateRoute(index, routeIndex, 'internal_company_account_id', parseInt(e.target.value) || undefined)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                          required
                        >
                          <option value="">Select account</option>
                          {getAccountsForCompany(route.internal_company_id).map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.account_name} ({acc.currency}) - {acc.balance.toLocaleString()}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-0.5">Amount from Account *</label>
                        <input
                          type="number"
                          step="0.01"
                          value={route.amount_from_account || ''}
                          onChange={(e) => updateRoute(index, routeIndex, 'amount_from_account', parseFloat(e.target.value) || undefined)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                          required
                        />
                        <p className="text-xs text-gray-500 mt-0.5">Amount client receives (in {clientReceivesCurrency || 'target currency'})</p>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-0.5">Bank Commission</label>
                        <select
                          value={route.bank_commission_id || ''}
                          onChange={(e) => updateRoute(index, routeIndex, 'bank_commission_id', parseInt(e.target.value) || undefined)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                        >
                          <option value="">Select commission</option>
                          {routeCommissions?.filter(c => c.route_type === 'direct' && c.is_active).map((comm) => (
                            <option key={comm.id} value={comm.id}>
                              {comm.is_fixed_currency
                                ? `${comm.commission_fixed} ${comm.currency}`
                                : `${comm.commission_percent}%`}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Поля для биржи */}
                {route.route_type === 'exchange' && (
                  <div className="mt-2 p-2 bg-green-50 rounded-md space-y-1">
                    <h4 className="text-xs font-medium text-green-900">Exchange Settings</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium mb-0.5">Crypto Account *</label>
                        <select
                          value={route.crypto_account_id || ''}
                          onChange={(e) => updateRoute(index, routeIndex, 'crypto_account_id', parseInt(e.target.value) || undefined)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                          required
                        >
                          <option value="">Select account</option>
                          {cryptoBalances?.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.account_name} ({acc.currency}) - {acc.balance.toLocaleString()}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-0.5">Exchange From Currency *</label>
                        <select
                          value={route.exchange_from_currency || ''}
                          onChange={(e) => updateRoute(index, routeIndex, 'exchange_from_currency', e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                          required
                        >
                          <option value="">Select currency</option>
                          {currencies?.filter(c => c.is_crypto).map((curr) => (
                            <option key={curr.id} value={curr.code}>
                              {curr.code}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-0.5">Exchange Amount (auto-calculated)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={route.exchange_amount || ''}
                          readOnly
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md bg-gray-100"
                        />
                        <p className="text-xs text-gray-500 mt-0.5">Calculated: (Amount from Account - commissions) * Crypto Exchange Rate</p>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-0.5">Crypto Exchange Rate *</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={route.crypto_exchange_rate || ''}
                          onChange={(e) => updateRoute(index, routeIndex, 'crypto_exchange_rate', parseFloat(e.target.value) || undefined)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-0.5">Amount from Account *</label>
                        <input
                          type="number"
                          step="0.01"
                          value={route.amount_from_account || ''}
                          onChange={(e) => updateRoute(index, routeIndex, 'amount_from_account', parseFloat(e.target.value) || undefined)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                          required
                        />
                        <p className="text-xs text-gray-500 mt-0.5">Amount client receives (in {clientReceivesCurrency || 'target currency'})</p>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-0.5">Agent Commission</label>
                        <select
                          value={route.agent_commission_id || ''}
                          onChange={(e) => updateRoute(index, routeIndex, 'agent_commission_id', parseInt(e.target.value) || undefined)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                        >
                          <option value="">Select commission</option>
                          {routeCommissions?.filter(c => c.route_type === 'agent' && c.is_active).map((comm) => (
                            <option key={comm.id} value={comm.id}>
                              {comm.is_fixed_currency
                                ? `${comm.commission_fixed} ${comm.currency}`
                                : `${comm.commission_percent}%`}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-0.5">Exchange Commission</label>
                        <select
                          value={route.exchange_commission_id || ''}
                          onChange={(e) => updateRoute(index, routeIndex, 'exchange_commission_id', parseInt(e.target.value) || undefined)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                        >
                          <option value="">Select commission</option>
                          {routeCommissions?.filter(c => c.route_type === 'exchange' && c.is_active).map((comm) => (
                            <option key={comm.id} value={comm.id}>
                              {comm.is_fixed_currency
                                ? `${comm.commission_fixed} ${comm.currency}`
                                : `${comm.commission_percent}%`}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-0.5">Bank Commission</label>
                        <select
                          value={route.exchange_bank_commission_id || ''}
                          onChange={(e) => updateRoute(index, routeIndex, 'exchange_bank_commission_id', parseInt(e.target.value) || undefined)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                        >
                          <option value="">Select commission</option>
                          {routeCommissions?.filter(c => c.route_type === 'direct' && c.is_active).map((comm) => (
                            <option key={comm.id} value={comm.id}>
                              {comm.is_fixed_currency
                                ? `${comm.commission_fixed} ${comm.currency}`
                                : `${comm.commission_percent}%`}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Поля для партнёра */}
                {route.route_type === 'partner' && (
                  <div className="mt-2 p-2 bg-purple-50 rounded-md space-y-1">
                    <h4 className="text-xs font-medium text-purple-900">Partner Settings</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium mb-0.5">Partner Company *</label>
                        <select
                          value={route.partner_company_id || ''}
                          onChange={(e) => updateRoute(index, routeIndex, 'partner_company_id', parseInt(e.target.value) || undefined)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                          required
                        >
                          <option value="">Select partner company</option>
                          {allClientCompanies?.map((comp) => (
                            <option key={comp.id} value={comp.id}>
                              {comp.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-0.5">Partner Account *</label>
                        <select
                          value={route.partner_account_id || ''}
                          onChange={(e) => updateRoute(index, routeIndex, 'partner_account_id', parseInt(e.target.value) || undefined)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                          required
                          disabled={!route.partner_company_id}
                        >
                          <option value="">Select account</option>
                          {getAccountsForPartnerCompany(route.partner_company_id).map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.account_name} ({acc.currency}) - {acc.account_number}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-0.5">Amount from Account *</label>
                        <input
                          type="number"
                          step="0.01"
                          value={route.amount_from_account || ''}
                          onChange={(e) => updateRoute(index, routeIndex, 'amount_from_account', parseFloat(e.target.value) || undefined)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                          required
                        />
                        <p className="text-xs text-gray-500 mt-0.5">Amount client receives (in {clientReceivesCurrency || 'target currency'})</p>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-0.5">Amount Partner Sends (auto)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={route.amount_partner_sends || ''}
                          readOnly
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-0.5">Amount to Partner (USDT) (auto)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={route.amount_to_partner_usdt || ''}
                          readOnly
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-0.5">Partner Commission</label>
                        <select
                          value={route.partner_commission_id || ''}
                          onChange={(e) => updateRoute(index, routeIndex, 'partner_commission_id', parseInt(e.target.value) || undefined)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                        >
                          <option value="">Select commission</option>
                          {routeCommissions?.filter(c => c.route_type === 'partner' && c.is_active).map((comm) => (
                            <option key={comm.id} value={comm.id}>
                              {comm.is_fixed_currency
                                ? `${comm.commission_fixed} ${comm.currency}`
                                : `${comm.commission_percent}%`}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Поля для партнёра 50-50 */}
                {route.route_type === 'partner_50_50' && (
                  <div className="mt-2 p-2 bg-yellow-50 rounded-md space-y-1">
                    <h4 className="text-xs font-medium text-yellow-900">Partner 50-50 Settings</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium mb-0.5">Partner Company *</label>
                        <select
                          value={route.partner_50_50_company_id || ''}
                          onChange={(e) => updateRoute(index, routeIndex, 'partner_50_50_company_id', parseInt(e.target.value) || undefined)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                          required
                        >
                          <option value="">Select partner company</option>
                          {allClientCompanies?.map((comp) => (
                            <option key={comp.id} value={comp.id}>
                              {comp.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-0.5">Partner Account *</label>
                        <select
                          value={route.partner_50_50_account_id || ''}
                          onChange={(e) => updateRoute(index, routeIndex, 'partner_50_50_account_id', parseInt(e.target.value) || undefined)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                          required
                          disabled={!route.partner_50_50_company_id}
                        >
                          <option value="">Select account</option>
                          {getAccountsForPartnerCompany(route.partner_50_50_company_id).map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.account_name} ({acc.currency}) - {acc.account_number}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-0.5">Amount from Account *</label>
                        <input
                          type="number"
                          step="0.01"
                          value={route.amount_from_account || ''}
                          onChange={(e) => updateRoute(index, routeIndex, 'amount_from_account', parseFloat(e.target.value) || undefined)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                          required
                        />
                        <p className="text-xs text-gray-500 mt-0.5">Amount client receives (in {clientReceivesCurrency || 'target currency'})</p>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-0.5">Amount Partner Sends (auto)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={route.amount_partner_50_50_sends || ''}
                          readOnly
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-0.5">Amount to Partner (USDT) (auto)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={route.amount_to_partner_50_50_usdt || ''}
                          readOnly
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-0.5">Partner 50-50 Commission</label>
                        <select
                          value={route.partner_50_50_commission_id || ''}
                          onChange={(e) => updateRoute(index, routeIndex, 'partner_50_50_commission_id', parseInt(e.target.value) || undefined)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                        >
                          <option value="">Select commission</option>
                          {routeCommissions?.filter(c => c.route_type === 'partner_50_50' && c.is_active).map((comm) => (
                            <option key={comm.id} value={comm.id}>
                              {comm.is_fixed_currency
                                ? `${comm.commission_fixed} ${comm.currency}`
                                : `${comm.commission_percent}%`}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Отображение конечного дохода для маршрута */}
                {route.final_income !== undefined && (
                  <div className="mt-1 p-1 bg-green-100 rounded">
                    <span className="text-xs font-medium text-green-800">
                      Route Income: {route.final_income.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {clientSendsCurrency || 'currency'}
                    </span>
                  </div>
                )}
              </div>
            ))}

            {/* Отображение общего конечного дохода транзакции */}
            {trans.final_income !== undefined && (
              <div className="mt-2 p-1 bg-blue-100 rounded">
                <span className="text-xs font-medium text-blue-800">
                  Total Route Income: {trans.final_income.toLocaleString(undefined, { maximumFractionDigits: 2 })} {clientSendsCurrency || 'currency'}
                </span>
              </div>
            )}
          </div>
        </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addTransaction}
        className="w-full px-2 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
      >
        + Add Transaction
      </button>

      {/* Отображение общей суммы для отправки клиентом */}
      {totalAmountToSend > 0 && (
        <div className="mt-3 p-2 bg-yellow-50 border-2 border-yellow-400 rounded-md">
          <h3 className="text-sm font-bold text-yellow-900 mb-1">
            Total Amount Client Should Send
          </h3>
          <p className="text-lg font-semibold text-yellow-800">
            {totalAmountToSend.toLocaleString(undefined, { maximumFractionDigits: 2 })} {clientSendsCurrency || 'currency'}
          </p>
          <p className="text-xs text-yellow-700 mt-1">
            To receive {dealAmount?.toLocaleString(undefined, { maximumFractionDigits: 2 })} {clientReceivesCurrency || 'currency'}
          </p>
        </div>
      )}
    </div>
  );
}
