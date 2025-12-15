import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

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

interface TransactionFormProps {
  index: number;
  transaction: Transaction;
  clientId: number | '';
  companies: Company[];
  transactions: Transaction[];
  onUpdate: (index: number, field: keyof Transaction, value: string | number) => void;
}

export function TransactionForm({
  index,
  transaction,
  clientId,
  companies,
  transactions,
  onUpdate,
}: TransactionFormProps) {
  // Загружаем счета для выбранной компании
  const { data: accounts } = useQuery<CompanyAccount[]>({
    queryKey: ['reference-company-accounts', transaction.company_id],
    queryFn: async () => {
      if (!transaction.company_id) return [];
      const response = await api.get(`/api/reference/company-accounts?company_id=${transaction.company_id}`);
      return response.data;
    },
    enabled: !!transaction.company_id,
  });

  // Получаем выбранные счета в других транзакциях (для валидации)
  const selectedAccountIds = transactions
    .map((t, i) => i !== index && t.account_id ? t.account_id : null)
    .filter((id): id is number => id !== null);
  
  // Получаем выбранный счет для отображения IBAN
  const selectedAccount = accounts?.find(a => a.id === transaction.account_id);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Компания *</label>
          <select
            value={transaction.company_id || ''}
            onChange={(e) => onUpdate(index, 'company_id', e.target.value ? parseInt(e.target.value) : '')}
            required
            disabled={!clientId}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-100"
          >
            <option value="">Выберите компанию</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          {!clientId && (
            <p className="text-xs text-gray-400 mt-1">Сначала выберите клиента</p>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Сумма EUR *</label>
          <input
            type="number"
            step="0.01"
            value={transaction.amount_eur || ''}
            onChange={(e) => onUpdate(index, 'amount_eur', parseFloat(e.target.value) || 0)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
      </div>

      {transaction.company_id && (
        <div className="mb-3">
          <label className="block text-xs text-gray-500 mb-1">Счет *</label>
          <select
            value={transaction.account_id || ''}
            onChange={(e) => onUpdate(index, 'account_id', e.target.value ? parseInt(e.target.value) : '')}
            required
            className={`w-full px-3 py-2 border rounded-md text-sm ${
              transaction.account_id && selectedAccountIds.includes(transaction.account_id as number)
                ? 'border-red-500 bg-red-50'
                : 'border-gray-300'
            }`}
          >
            <option value="">Выберите счет</option>
            {accounts?.map((account) => {
              const isSelected = selectedAccountIds.includes(account.id);
              return (
                <option
                  key={account.id}
                  value={account.id}
                  disabled={isSelected}
                >
                  {account.account_name} - {account.account_number}
                  {isSelected ? ' (уже выбран)' : ''}
                </option>
              );
            })}
          </select>
          {transaction.account_id && selectedAccountIds.includes(transaction.account_id as number) && (
            <p className="text-xs text-red-600 mt-1">
              ⚠️ Этот счет уже используется в другой транзакции
            </p>
          )}
          {selectedAccount && (
            <p className="text-xs text-gray-500 mt-1">
              IBAN: {selectedAccount.account_number}
            </p>
          )}
        </div>
      )}

      {transaction.company_id && !accounts?.length && (
        <p className="text-xs text-yellow-600 mb-3">
          ⚠️ У выбранной компании нет активных счетов
        </p>
      )}

      <div>
        <label className="block text-xs text-gray-500 mb-1">Дополнительные реквизиты (опционально)</label>
        <textarea
          value={transaction.recipient_details || ''}
          onChange={(e) => onUpdate(index, 'recipient_details', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          rows={2}
          placeholder="Дополнительная информация, если требуется"
        />
      </div>
    </>
  );
}

