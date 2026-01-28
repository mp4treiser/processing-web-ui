import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface Client {
  id: number;
  name: string;
  contact_info: string | null;
  notes: string | null;
  is_active: boolean;
}

interface Company {
  id: number;
  client_id: number;
  name: string;
  contact_info: string | null;
  notes: string | null;
}

interface CompanyAccount {
  id: number;
  company_id: number;
  account_name: string;
  account_number: string;
  currency: string | null;
  is_active: boolean;
}

type TabType = 'clients' | 'companies' | 'balances' | 'agents' | 'route-commissions' | 'internal-companies' | 'currencies' | 'templates' | 'manager-commissions' | 'settings';

export function ReferencesPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('clients');

  // Определяем доступные вкладки в зависимости от роли
  const availableTabs: TabType[] = ['clients', 'companies'];
  // Остатки по счетам доступны только для бухгалтера и директора
  if (user?.role === 'accountant' || user?.role === 'director') {
    availableTabs.push('balances');
  }
  // Агенты и комиссии доступны для senior_manager, accountant, director
  if (user?.role === 'senior_manager' || user?.role === 'accountant' || user?.role === 'director') {
    availableTabs.push('agents', 'route-commissions', 'internal-companies', 'currencies', 'templates', 'manager-commissions', 'settings');
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Справочники</h1>

      {/* Вкладки */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          {availableTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === tab
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab === 'clients' && 'Клиенты'}
              {tab === 'companies' && 'Компании'}
              {tab === 'balances' && 'Остатки по счетам'}
              {tab === 'agents' && 'Агенты'}
              {tab === 'route-commissions' && 'Комиссии маршрутов'}
              {tab === 'internal-companies' && 'Внутренние компании'}
              {tab === 'currencies' && 'Валюты'}
              {tab === 'templates' && 'Шаблоны'}
              {tab === 'manager-commissions' && 'Комиссии менеджеров'}
              {tab === 'settings' && 'Настройки'}
            </button>
          ))}
        </nav>
      </div>

      {/* Контент вкладок */}
      {activeTab === 'clients' && <ClientsTab />}
      {activeTab === 'companies' && <CompaniesTab />}
      {activeTab === 'balances' && <AccountBalancesTab />}
      {activeTab === 'agents' && <AgentsTab />}
      {activeTab === 'route-commissions' && <RouteCommissionsTab />}
      {activeTab === 'internal-companies' && <InternalCompaniesTab />}
      {activeTab === 'currencies' && <CurrenciesTab />}
      {activeTab === 'templates' && <TemplatesTab />}
      {activeTab === 'manager-commissions' && <ManagerCommissionsTab />}
      {activeTab === 'settings' && <SystemSettingsTab />}
    </div>
  );
}

// Вкладка клиентов
function ClientsTab() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState({ name: '', contact_info: '', notes: '' });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);

  const { data: clients } = useQuery<Client[]>({
    queryKey: ['reference-clients'],
    queryFn: async () => {
      const response = await api.get('/api/reference/clients');
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/api/reference/clients', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-clients'] });
      setIsModalOpen(false);
      setFormData({ name: '', contact_info: '', notes: '' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await api.put(`/api/reference/clients/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-clients'] });
      setIsModalOpen(false);
      setEditingClient(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/reference/clients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-clients'] });
      setDeleteConfirmOpen(false);
      setClientToDelete(null);
    },
  });

  const handleDelete = (client: Client) => {
    setClientToDelete(client);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (clientToDelete) {
      deleteMutation.mutate(clientToDelete.id);
    }
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      contact_info: client.contact_info || '',
      notes: client.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = () => {
    if (editingClient) {
      updateMutation.mutate({ id: editingClient.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h2 className="text-lg font-semibold">Clients</h2>
        <button
          onClick={() => {
            setEditingClient(null);
            setFormData({ name: '', contact_info: '', notes: '' });
            setIsModalOpen(true);
          }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          + Add Client
        </button>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact Info</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {clients?.map((client) => (
              <tr key={client.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm">{client.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{client.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{client.contact_info || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    onClick={() => handleEdit(client)}
                    className="text-indigo-600 hover:text-indigo-900 mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(client)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <Modal
          title={editingClient ? 'Edit Client' : 'Add Client'}
          onClose={() => {
            setIsModalOpen(false);
            setEditingClient(null);
          }}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Contact Info</label>
              <input
                type="text"
                value={formData.contact_info}
                onChange={(e) => setFormData({ ...formData, contact_info: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={3}
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingClient(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!formData.name || createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {editingClient ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteConfirmOpen && clientToDelete && (
        <ConfirmDeleteModal
          title="Delete Client"
          message={`Are you sure you want to delete client "${clientToDelete.name}"? This action cannot be undone.`}
          onConfirm={confirmDelete}
          onCancel={() => {
            setDeleteConfirmOpen(false);
            setClientToDelete(null);
          }}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

// Вкладка компаний
function CompaniesTab() {
  const [companyAccountsModalOpen, setCompanyAccountsModalOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [formData, setFormData] = useState({ client_id: '', name: '', contact_info: '', notes: '' });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);

  const { data: clients } = useQuery<Client[]>({
    queryKey: ['reference-clients'],
    queryFn: async () => {
      const response = await api.get('/api/reference/clients');
      return response.data;
    },
  });

  const { data: companies } = useQuery<Company[]>({
    queryKey: ['reference-companies'],
    queryFn: async () => {
      const response = await api.get('/api/reference/companies');
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/api/reference/companies', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-companies'] });
      setIsModalOpen(false);
      setFormData({ client_id: '', name: '', contact_info: '', notes: '' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await api.put(`/api/reference/companies/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-companies'] });
      setIsModalOpen(false);
      setEditingCompany(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/reference/companies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-companies'] });
      setDeleteConfirmOpen(false);
      setCompanyToDelete(null);
    },
  });

  const handleDelete = (company: Company) => {
    setCompanyToDelete(company);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (companyToDelete) {
      deleteMutation.mutate(companyToDelete.id);
    }
  };

  const handleEdit = (company: Company) => {
    setEditingCompany(company);
    setFormData({
      client_id: company.client_id.toString(),
      name: company.name,
      contact_info: company.contact_info || '',
      notes: company.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = () => {
    if (editingCompany) {
      updateMutation.mutate({ id: editingCompany.id, data: formData });
    } else {
      createMutation.mutate({ ...formData, client_id: parseInt(formData.client_id) });
    }
  };

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h2 className="text-lg font-semibold">Companies</h2>
        <button
          onClick={() => {
            setEditingCompany(null);
            setFormData({ client_id: '', name: '', contact_info: '', notes: '' });
            setIsModalOpen(true);
          }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          + Add Company
        </button>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {companies?.map((company) => {
              const client = clients?.find((c) => c.id === company.client_id);
              return (
                <tr key={company.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">{company.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">{client?.name || company.client_id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{company.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => {
                        setSelectedCompanyId(company.id);
                        setCompanyAccountsModalOpen(true);
                      }}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      Company Accounts
                    </button>
                    <button
                      onClick={() => handleEdit(company)}
                      className="text-indigo-600 hover:text-indigo-900 mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(company)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <Modal
          title={editingCompany ? 'Edit Company' : 'Add Company'}
          onClose={() => {
            setIsModalOpen(false);
            setEditingCompany(null);
          }}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Client *</label>
              <select
                value={formData.client_id}
                onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              >
                <option value="">Select Client</option>
                {clients?.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Contact Info</label>
              <input
                type="text"
                value={formData.contact_info}
                onChange={(e) => setFormData({ ...formData, contact_info: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={3}
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingCompany(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!formData.name || !formData.client_id || createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {editingCompany ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Модальное окно для управления счетами компании */}
      {companyAccountsModalOpen && selectedCompanyId && (
        <CompanyAccountsModal
          companyId={selectedCompanyId}
          onClose={() => {
            setCompanyAccountsModalOpen(false);
            setSelectedCompanyId(null);
          }}
        />
      )}

      {deleteConfirmOpen && companyToDelete && (
        <ConfirmDeleteModal
          title="Delete Company"
          message={`Are you sure you want to delete company "${companyToDelete.name}"? This action cannot be undone.`}
          onConfirm={confirmDelete}
          onCancel={() => {
            setDeleteConfirmOpen(false);
            setCompanyToDelete(null);
          }}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

// Модальное окно для управления счетами компании
function CompanyAccountsModal({ companyId, onClose }: { companyId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<CompanyAccount | null>(null);
  const [formData, setFormData] = useState({ account_name: '', account_number: '', currency: '' });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<CompanyAccount | null>(null);

  const { data: company } = useQuery<Company>({
    queryKey: ['reference-company', companyId],
    queryFn: async () => {
      const response = await api.get(`/api/reference/companies/${companyId}`);
      return response.data;
    },
  });

  const { data: accounts } = useQuery<CompanyAccount[]>({
    queryKey: ['reference-company-accounts', companyId],
    queryFn: async () => {
      const response = await api.get('/api/reference/company-accounts');
      return response.data;
    },
  });

  // Фильтруем счета только для выбранной компании
  const companyAccounts = accounts?.filter(account => account.company_id === companyId) || [];

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/api/reference/company-accounts', { ...data, company_id: companyId });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-company-accounts'] });
      setIsModalOpen(false);
      setFormData({ account_name: '', account_number: '', currency: '' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await api.put(`/api/reference/company-accounts/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-company-accounts'] });
      setIsModalOpen(false);
      setEditingAccount(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/reference/company-accounts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-company-accounts'] });
      setDeleteConfirmOpen(false);
      setAccountToDelete(null);
    },
  });

  const handleDelete = (account: CompanyAccount) => {
    setAccountToDelete(account);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (accountToDelete) {
      deleteMutation.mutate(accountToDelete.id);
    }
  };

  const handleEdit = (account: CompanyAccount) => {
    setEditingAccount(account);
    setFormData({
      account_name: account.account_name,
      account_number: account.account_number,
      currency: account.currency || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = () => {
    if (editingAccount) {
      updateMutation.mutate({ id: editingAccount.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Modal
      title={`Company Accounts - ${company?.name || 'Company'}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="flex justify-between mb-4">
          <h3 className="text-lg font-semibold">Accounts</h3>
          <button
            onClick={() => {
              setEditingAccount(null);
              setFormData({ account_name: '', account_number: '', currency: '' });
              setIsModalOpen(true);
            }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            + Add Account
          </button>
        </div>

        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account Number</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {companyAccounts.length > 0 ? (
                companyAccounts.map((account) => (
                  <tr key={account.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{account.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{account.account_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{account.account_number}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{account.currency || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleEdit(account)}
                        className="text-indigo-600 hover:text-indigo-900 mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(account)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                    No accounts found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {isModalOpen && (
          <Modal
            title={editingAccount ? 'Edit Account' : 'Add Account'}
            onClose={() => {
              setIsModalOpen(false);
              setEditingAccount(null);
            }}
            zIndex={60}
          >
            <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Account Name *</label>
              <input
                type="text"
                value={formData.account_name}
                onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="e.g., IBAN EUR"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Account Number *</label>
              <input
                type="text"
                value={formData.account_number}
                onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="IBAN or wallet address"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Currency</label>
              <input
                type="text"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="EUR, USD, BTC, USDT, etc."
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingAccount(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!formData.account_name || !formData.account_number || createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {editingAccount ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </Modal>
        )}

        {deleteConfirmOpen && accountToDelete && (
          <ConfirmDeleteModal
            title="Delete Account"
            message={`Are you sure you want to delete account "${accountToDelete.account_name}"? This action cannot be undone.`}
            onConfirm={confirmDelete}
            onCancel={() => {
              setDeleteConfirmOpen(false);
              setAccountToDelete(null);
            }}
            isDeleting={deleteMutation.isPending}
            zIndex={70}
          />
        )}
      </div>
    </Modal>
  );
}

// Вкладка остатков
function AccountBalancesTab() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedBalanceId, setSelectedBalanceId] = useState<number | null>(null);
  const [editingBalance, setEditingBalance] = useState<any>(null);
  const [formData, setFormData] = useState({ account_name: '', balance: '', currency: '', notes: '', comment: '' });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [balanceToDelete, setBalanceToDelete] = useState<any>(null);

  const { data: balances } = useQuery({
    queryKey: ['account-balances'],
    queryFn: async () => {
      const response = await api.get('/api/account-balances');
      return response.data;
    },
  });

  const { data: history } = useQuery({
    queryKey: ['account-balance-history', selectedBalanceId],
    queryFn: async () => {
      if (!selectedBalanceId) return [];
      const response = await api.get(`/api/account-balances/${selectedBalanceId}/history`);
      return response.data;
    },
    enabled: !!selectedBalanceId && historyModalOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/api/account-balances', {
        account_name: data.account_name,
        balance: parseFloat(data.balance),
        currency: data.currency || null,
        notes: data.notes || null,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-balances'] });
      setIsModalOpen(false);
      setFormData({ account_name: '', balance: '', currency: '', notes: '', comment: '' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await api.put(`/api/account-balances/${id}`, {
        account_name: data.account_name,
        balance: data.balance ? parseFloat(data.balance) : undefined,
        currency: data.currency || null,
        notes: data.notes || null,
        comment: data.comment || null,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-balances'] });
      setIsModalOpen(false);
      setEditingBalance(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/account-balances/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-balances'] });
      setDeleteConfirmOpen(false);
      setBalanceToDelete(null);
    },
  });

  const handleDelete = (balance: any) => {
    setBalanceToDelete(balance);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (balanceToDelete) {
      deleteMutation.mutate(balanceToDelete.id);
    }
  };

  const handleEdit = (balance: any) => {
    setEditingBalance(balance);
    setFormData({
      account_name: balance.account_name,
      balance: balance.balance.toString(),
      currency: balance.currency || '',
      notes: balance.notes || '',
      comment: '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = () => {
    if (editingBalance) {
      // При изменении остатка требуется комментарий
      if (parseFloat(formData.balance) !== parseFloat(editingBalance.balance) && !formData.comment) {
        alert('При изменении остатка требуется указать комментарий');
        return;
      }
      updateMutation.mutate({ id: editingBalance.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h2 className="text-lg font-semibold">Account Balances</h2>
        <button
          onClick={() => {
            setEditingBalance(null);
            setFormData({ account_name: '', balance: '', currency: '', notes: '', comment: '' });
            setIsModalOpen(true);
          }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          + Add Balance
        </button>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {balances?.map((balance: any) => (
              <tr key={balance.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm">{balance.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{balance.account_name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {parseFloat(balance.balance).toLocaleString(undefined, { maximumFractionDigits: 10 })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">{balance.currency || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    onClick={() => {
                      setSelectedBalanceId(balance.id);
                      setHistoryModalOpen(true);
                    }}
                    className="text-blue-600 hover:text-blue-900 mr-3"
                  >
                    History
                  </button>
                  <button
                    onClick={() => handleEdit(balance)}
                    className="text-indigo-600 hover:text-indigo-900 mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(balance)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <Modal
          title={editingBalance ? 'Edit Balance' : 'Add Balance'}
          onClose={() => {
            setIsModalOpen(false);
            setEditingBalance(null);
          }}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                type="text"
                value={formData.account_name}
                onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="EUR, IBAN EUR, BTC Wallet, etc."
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Balance *</label>
              <input
                type="number"
                step="0.0000000001"
                value={formData.balance}
                onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Currency</label>
              <input
                type="text"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="EUR, USD, BTC, USDT, etc."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={3}
              />
            </div>
            {editingBalance && parseFloat(formData.balance) !== parseFloat(editingBalance.balance) && (
              <div>
                <label className="block text-sm font-medium mb-1">Comment (required when changing balance) *</label>
                <textarea
                  value={formData.comment}
                  onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  rows={3}
                  required
                />
              </div>
            )}
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingBalance(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!formData.account_name || !formData.balance || createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {editingBalance ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {historyModalOpen && selectedBalanceId && (
        <Modal
          title="Balance Change History"
          onClose={() => {
            setHistoryModalOpen(false);
            setSelectedBalanceId(null);
          }}
        >
          <div className="max-h-96 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Previous</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">New</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Change</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Comment</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {history?.map((h: any) => (
                  <tr key={h.id}>
                    <td className="px-4 py-2 text-sm">{new Date(h.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2 text-sm">{parseFloat(h.previous_balance).toLocaleString(undefined, { maximumFractionDigits: 10 })}</td>
                    <td className="px-4 py-2 text-sm">{parseFloat(h.new_balance).toLocaleString(undefined, { maximumFractionDigits: 10 })}</td>
                    <td className={`px-4 py-2 text-sm ${parseFloat(h.change_amount) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {parseFloat(h.change_amount) > 0 ? '+' : ''}{parseFloat(h.change_amount).toLocaleString(undefined, { maximumFractionDigits: 10 })}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${h.change_type === 'auto' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                        {h.change_type === 'auto' ? 'Automatic' : 'Manual'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">{h.comment || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {deleteConfirmOpen && balanceToDelete && (
        <ConfirmDeleteModal
          title="Delete Account Balance"
          message={`Are you sure you want to delete account balance "${balanceToDelete.account_name}"? This action cannot be undone.`}
          onConfirm={confirmDelete}
          onCancel={() => {
            setDeleteConfirmOpen(false);
            setBalanceToDelete(null);
          }}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

// Модальное окно
function Modal({ title, children, onClose, zIndex = 50 }: { title: string; children: React.ReactNode; onClose: () => void; zIndex?: number }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style={{ zIndex }}>
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Модальное окно подтверждения удаления
function ConfirmDeleteModal({ 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  isDeleting,
  zIndex = 60 
}: { 
  title: string; 
  message: string; 
  onConfirm: () => void; 
  onCancel: () => void; 
  isDeleting: boolean;
  zIndex?: number;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style={{ zIndex }}>
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4 text-red-600">{title}</h2>
        <p className="text-gray-700 mb-6">{message}</p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Вкладка агентов
function AgentsTab() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', commission_percent: '' });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<any>(null);

  const { data: agents } = useQuery({
    queryKey: ['reference-agents'],
    queryFn: async () => {
      const response = await api.get('/api/reference/agents');
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/api/reference/agents', {
        name: data.name,
        commission_percent: parseFloat(data.commission_percent),
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-agents'] });
      setIsModalOpen(false);
      setFormData({ name: '', commission_percent: '' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await api.put(`/api/reference/agents/${id}`, {
        name: data.name,
        commission_percent: parseFloat(data.commission_percent),
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-agents'] });
      setIsModalOpen(false);
      setEditingAgent(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/reference/agents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-agents'] });
      setDeleteConfirmOpen(false);
      setAgentToDelete(null);
    },
  });

  const handleDelete = (agent: any) => {
    setAgentToDelete(agent);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (agentToDelete) {
      deleteMutation.mutate(agentToDelete.id);
    }
  };

  const handleEdit = (agent: any) => {
    setEditingAgent(agent);
    setFormData({
      name: agent.name,
      commission_percent: agent.commission_percent.toString(),
    });
    setIsModalOpen(true);
  };

  const handleSubmit = () => {
    if (editingAgent) {
      updateMutation.mutate({ id: editingAgent.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h2 className="text-lg font-semibold">Agents</h2>
        <button
          onClick={() => {
            setEditingAgent(null);
            setFormData({ name: '', commission_percent: '' });
            setIsModalOpen(true);
          }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          + Add Agent
        </button>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Commission %</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {agents?.map((agent: any) => (
              <tr key={agent.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm">{agent.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{agent.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">{agent.commission_percent}%</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    onClick={() => handleEdit(agent)}
                    className="text-indigo-600 hover:text-indigo-900 mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(agent)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <Modal
          title={editingAgent ? 'Edit Agent' : 'Add Agent'}
          onClose={() => {
            setIsModalOpen(false);
            setEditingAgent(null);
          }}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Commission % *</label>
              <input
                type="number"
                step="0.01"
                value={formData.commission_percent}
                onChange={(e) => setFormData({ ...formData, commission_percent: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="-0.5 or 0.5"
                required
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingAgent(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!formData.name || !formData.commission_percent || createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {editingAgent ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteConfirmOpen && agentToDelete && (
        <ConfirmDeleteModal
          title="Delete Agent"
          message={`Are you sure you want to delete agent "${agentToDelete.name}"?`}
          onConfirm={confirmDelete}
          onCancel={() => {
            setDeleteConfirmOpen(false);
            setAgentToDelete(null);
          }}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

// Вкладка комиссий маршрутов
function RouteCommissionsTab() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCommission, setEditingCommission] = useState<any>(null);
  const [formData, setFormData] = useState({
    route_type: '',
    commission_percent: '',
    commission_fixed: '',
    is_fixed_currency: false,
    currency: '',
  });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [commissionToDelete, setCommissionToDelete] = useState<any>(null);

  const routeTypes = [
    { value: 'direct', label: 'Direct Transfer' },
    { value: 'exchange', label: 'Exchange' },
    { value: 'agent', label: 'Agent' },
    { value: 'partner', label: 'Partner' },
    { value: 'partner_50_50', label: 'Partner 50-50' },
  ];

  const { data: commissions } = useQuery({
    queryKey: ['reference-route-commissions'],
    queryFn: async () => {
      const response = await api.get('/api/reference/route-commissions');
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/api/reference/route-commissions', {
        route_type: data.route_type,
        commission_percent: data.commission_percent ? parseFloat(data.commission_percent) : null,
        commission_fixed: data.commission_fixed ? parseFloat(data.commission_fixed) : null,
        is_fixed_currency: data.is_fixed_currency,
        currency: data.currency || null,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-route-commissions'] });
      setIsModalOpen(false);
      setFormData({
        route_type: '',
        commission_percent: '',
        commission_fixed: '',
        is_fixed_currency: false,
        currency: '',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await api.put(`/api/reference/route-commissions/${id}`, {
        commission_percent: data.commission_percent ? parseFloat(data.commission_percent) : null,
        commission_fixed: data.commission_fixed ? parseFloat(data.commission_fixed) : null,
        is_fixed_currency: data.is_fixed_currency,
        currency: data.currency || null,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-route-commissions'] });
      setIsModalOpen(false);
      setEditingCommission(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/reference/route-commissions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-route-commissions'] });
      setDeleteConfirmOpen(false);
      setCommissionToDelete(null);
    },
  });

  const handleDelete = (commission: any) => {
    setCommissionToDelete(commission);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (commissionToDelete) {
      deleteMutation.mutate(commissionToDelete.id);
    }
  };

  const handleEdit = (commission: any) => {
    setEditingCommission(commission);
    setFormData({
      route_type: commission.route_type,
      commission_percent: commission.commission_percent?.toString() || '',
      commission_fixed: commission.commission_fixed?.toString() || '',
      is_fixed_currency: commission.is_fixed_currency,
      currency: commission.currency || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = () => {
    if (editingCommission) {
      updateMutation.mutate({ id: editingCommission.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h2 className="text-lg font-semibold">Route Commissions</h2>
        <button
          onClick={() => {
            setEditingCommission(null);
            setFormData({
              route_type: '',
              commission_percent: '',
              commission_fixed: '',
              is_fixed_currency: false,
              currency: '',
            });
            setIsModalOpen(true);
          }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          + Add Route Commission
        </button>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Route Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Commission</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {commissions?.map((commission: any) => (
              <tr key={commission.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm">{commission.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{commission.route_type}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {commission.is_fixed_currency
                    ? `${commission.commission_fixed} ${commission.currency || ''}`
                    : `${commission.commission_percent}%`}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {commission.is_fixed_currency ? 'Fixed' : 'Percent'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    onClick={() => handleEdit(commission)}
                    className="text-indigo-600 hover:text-indigo-900 mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(commission)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <Modal
          title={editingCommission ? 'Edit Route Commission' : 'Add Route Commission'}
          onClose={() => {
            setIsModalOpen(false);
            setEditingCommission(null);
          }}
        >
          <div className="space-y-4">
            {!editingCommission && (
              <div>
                <label className="block text-sm font-medium mb-1">Route Type *</label>
                <select
                  value={formData.route_type}
                  onChange={(e) => setFormData({ ...formData, route_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                >
                  <option value="">Select Route Type</option>
                  {routeTypes.map((rt) => (
                    <option key={rt.value} value={rt.value}>
                      {rt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">
                <input
                  type="checkbox"
                  checked={formData.is_fixed_currency}
                  onChange={(e) => setFormData({ ...formData, is_fixed_currency: e.target.checked })}
                  className="mr-2"
                />
                Fixed Currency
              </label>
            </div>
            {formData.is_fixed_currency ? (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Commission (Fixed) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.commission_fixed}
                    onChange={(e) => setFormData({ ...formData, commission_fixed: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Currency *</label>
                  <input
                    type="text"
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="EUR, USD, etc."
                    required
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium mb-1">Commission % *</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.commission_percent}
                  onChange={(e) => setFormData({ ...formData, commission_percent: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="-0.3 or 0.6"
                  required
                />
              </div>
            )}
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingCommission(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={
                  (!formData.route_type && !editingCommission) ||
                  (!formData.commission_percent && !formData.is_fixed_currency) ||
                  (formData.is_fixed_currency && (!formData.commission_fixed || !formData.currency)) ||
                  createMutation.isPending ||
                  updateMutation.isPending
                }
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {editingCommission ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteConfirmOpen && commissionToDelete && (
        <ConfirmDeleteModal
          title="Delete Route Commission"
          message={`Are you sure you want to delete route commission for "${commissionToDelete.route_type}"?`}
          onConfirm={confirmDelete}
          onCancel={() => {
            setDeleteConfirmOpen(false);
            setCommissionToDelete(null);
          }}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

// Вкладка внутренних компаний (похожа на CompaniesTab, но для внутренних компаний)
function InternalCompaniesTab() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', contact_info: '', notes: '' });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<any>(null);
  const [companyAccountsModalOpen, setCompanyAccountsModalOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  const { data: companies } = useQuery({
    queryKey: ['reference-internal-companies'],
    queryFn: async () => {
      const response = await api.get('/api/reference/internal-companies');
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/api/reference/internal-companies', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-internal-companies'] });
      setIsModalOpen(false);
      setFormData({ name: '', contact_info: '', notes: '' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await api.put(`/api/reference/internal-companies/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-internal-companies'] });
      setIsModalOpen(false);
      setEditingCompany(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/reference/internal-companies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-internal-companies'] });
      setDeleteConfirmOpen(false);
      setCompanyToDelete(null);
    },
  });

  const handleDelete = (company: any) => {
    setCompanyToDelete(company);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (companyToDelete) {
      deleteMutation.mutate(companyToDelete.id);
    }
  };

  const handleEdit = (company: any) => {
    setEditingCompany(company);
    setFormData({
      name: company.name,
      contact_info: company.contact_info || '',
      notes: company.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = () => {
    if (editingCompany) {
      updateMutation.mutate({ id: editingCompany.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h2 className="text-lg font-semibold">Internal Companies</h2>
        <button
          onClick={() => {
            setEditingCompany(null);
            setFormData({ name: '', contact_info: '', notes: '' });
            setIsModalOpen(true);
          }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          + Add Internal Company
        </button>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact Info</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {companies?.map((company: any) => (
              <tr key={company.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm">{company.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{company.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{company.contact_info || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    onClick={() => {
                      setSelectedCompanyId(company.id);
                      setCompanyAccountsModalOpen(true);
                    }}
                    className="text-blue-600 hover:text-blue-900 mr-3"
                  >
                    Accounts
                  </button>
                  <button
                    onClick={() => handleEdit(company)}
                    className="text-indigo-600 hover:text-indigo-900 mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(company)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <Modal
          title={editingCompany ? 'Edit Internal Company' : 'Add Internal Company'}
          onClose={() => {
            setIsModalOpen(false);
            setEditingCompany(null);
          }}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Contact Info</label>
              <input
                type="text"
                value={formData.contact_info}
                onChange={(e) => setFormData({ ...formData, contact_info: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={3}
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingCompany(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!formData.name || createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {editingCompany ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {companyAccountsModalOpen && selectedCompanyId && (
        <InternalCompanyAccountsModal
          companyId={selectedCompanyId}
          onClose={() => {
            setCompanyAccountsModalOpen(false);
            setSelectedCompanyId(null);
          }}
        />
      )}

      {deleteConfirmOpen && companyToDelete && (
        <ConfirmDeleteModal
          title="Delete Internal Company"
          message={`Are you sure you want to delete internal company "${companyToDelete.name}"?`}
          onConfirm={confirmDelete}
          onCancel={() => {
            setDeleteConfirmOpen(false);
            setCompanyToDelete(null);
          }}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

// Модальное окно для управления счетами внутренней компании
function InternalCompanyAccountsModal({ companyId, onClose }: { companyId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [formData, setFormData] = useState({ account_name: '', account_number: '', currency: '', balance: '0' });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<any>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);

  const { data: company } = useQuery({
    queryKey: ['reference-internal-company', companyId],
    queryFn: async () => {
      const response = await api.get(`/api/reference/internal-companies/${companyId}`);
      return response.data;
    },
  });

  const { data: accounts } = useQuery({
    queryKey: ['reference-internal-company-accounts', companyId],
    queryFn: async () => {
      const response = await api.get('/api/reference/internal-company-accounts');
      return response.data;
    },
  });

  const companyAccounts = accounts?.filter((account: any) => account.company_id === companyId) || [];

  const { data: history } = useQuery({
    queryKey: ['internal-company-account-history', selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const response = await api.get(`/api/reference/internal-company-accounts/${selectedAccountId}/history`);
      return response.data;
    },
    enabled: !!selectedAccountId && historyModalOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/api/reference/internal-company-accounts', {
        ...data,
        company_id: companyId,
        balance: parseFloat(data.balance),
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-internal-company-accounts'] });
      setIsModalOpen(false);
      setFormData({ account_name: '', account_number: '', currency: '', balance: '0' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await api.put(`/api/reference/internal-company-accounts/${id}`, {
        ...data,
        balance: data.balance ? parseFloat(data.balance) : undefined,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-internal-company-accounts'] });
      setIsModalOpen(false);
      setEditingAccount(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/reference/internal-company-accounts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-internal-company-accounts'] });
      setDeleteConfirmOpen(false);
      setAccountToDelete(null);
    },
  });

  const handleDelete = (account: any) => {
    setAccountToDelete(account);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (accountToDelete) {
      deleteMutation.mutate(accountToDelete.id);
    }
  };

  const handleEdit = (account: any) => {
    setEditingAccount(account);
    setFormData({
      account_name: account.account_name,
      account_number: account.account_number,
      currency: account.currency,
      balance: account.balance.toString(),
    });
    setIsModalOpen(true);
  };

  const handleSubmit = () => {
    if (editingAccount) {
      updateMutation.mutate({ id: editingAccount.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style={{ zIndex: 50 }}>
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Internal Company Accounts - {company?.name || 'Company'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
      <div className="space-y-4">
        <div className="flex justify-between mb-4">
          <h3 className="text-lg font-semibold">Accounts</h3>
          <button
            onClick={() => {
              setEditingAccount(null);
              setFormData({ account_name: '', account_number: '', currency: '', balance: '0' });
              setIsModalOpen(true);
            }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            + Add Account
          </button>
        </div>

        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account Number</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {companyAccounts.length > 0 ? (
                companyAccounts.map((account: any) => (
                  <tr key={account.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{account.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{account.account_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{account.account_number}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{account.currency}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{parseFloat(account.balance).toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => {
                          setSelectedAccountId(account.id);
                          setHistoryModalOpen(true);
                        }}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        History
                      </button>
                      <button
                        onClick={() => handleEdit(account)}
                        className="text-indigo-600 hover:text-indigo-900 mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(account)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                    No accounts found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {isModalOpen && (
          <Modal
            title={editingAccount ? 'Edit Account' : 'Add Account'}
            onClose={() => {
              setIsModalOpen(false);
              setEditingAccount(null);
            }}
            zIndex={60}
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Account Name *</label>
                <input
                  type="text"
                  value={formData.account_name}
                  onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="e.g., IBAN EUR"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Account Number *</label>
                <input
                  type="text"
                  value={formData.account_number}
                  onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="IBAN or wallet address"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Currency *</label>
                <input
                  type="text"
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="EUR, USD, BTC, USDT, etc."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Balance *</label>
                <input
                  type="number"
                  step="0.0000000001"
                  value={formData.balance}
                  onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingAccount(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={
                    !formData.account_name ||
                    !formData.account_number ||
                    !formData.currency ||
                    createMutation.isPending ||
                    updateMutation.isPending
                  }
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {editingAccount ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {deleteConfirmOpen && accountToDelete && (
          <ConfirmDeleteModal
            title="Delete Account"
            message={`Are you sure you want to delete account "${accountToDelete.account_name}"?`}
            onConfirm={confirmDelete}
            onCancel={() => {
              setDeleteConfirmOpen(false);
              setAccountToDelete(null);
            }}
            isDeleting={deleteMutation.isPending}
            zIndex={70}
          />
        )}

        {historyModalOpen && selectedAccountId && (
          <Modal
            title="Balance Change History"
            onClose={() => {
              setHistoryModalOpen(false);
              setSelectedAccountId(null);
            }}
            zIndex={60}
          >
            <div className="max-h-96 overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Previous</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">New</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Change</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Comment</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {history && history.length > 0 ? (
                    history.map((h: any) => (
                      <tr key={h.id}>
                        <td className="px-4 py-2 text-sm">{new Date(h.created_at).toLocaleString()}</td>
                        <td className="px-4 py-2 text-sm">{parseFloat(h.previous_balance).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td className="px-4 py-2 text-sm">{parseFloat(h.new_balance).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td className={`px-4 py-2 text-sm ${parseFloat(h.change_amount) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {parseFloat(h.change_amount) > 0 ? '+' : ''}{parseFloat(h.change_amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          <span className={`px-2 py-1 rounded text-xs ${h.change_type === 'auto' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                            {h.change_type === 'auto' ? 'Automatic' : 'Manual'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600">{h.comment || '-'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-4 text-center text-sm text-gray-500">
                        No history records found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Modal>
        )}
      </div>
      </div>
    </div>
  );
}

// Вкладка валют
function CurrenciesTab() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<any>(null);
  const [formData, setFormData] = useState({ code: '', name: '', is_crypto: false });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [currencyToDelete, setCurrencyToDelete] = useState<any>(null);

  const { data: currencies } = useQuery({
    queryKey: ['reference-currencies'],
    queryFn: async () => {
      const response = await api.get('/api/reference/currencies');
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/api/reference/currencies', {
        code: data.code.toUpperCase(),
        name: data.name,
        is_crypto: data.is_crypto,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-currencies'] });
      setIsModalOpen(false);
      setFormData({ code: '', name: '', is_crypto: false });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await api.put(`/api/reference/currencies/${id}`, {
        name: data.name,
        is_crypto: data.is_crypto,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-currencies'] });
      setIsModalOpen(false);
      setEditingCurrency(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/reference/currencies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-currencies'] });
      setDeleteConfirmOpen(false);
      setCurrencyToDelete(null);
    },
  });

  const handleDelete = (currency: any) => {
    setCurrencyToDelete(currency);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (currencyToDelete) {
      deleteMutation.mutate(currencyToDelete.id);
    }
  };

  const handleEdit = (currency: any) => {
    setEditingCurrency(currency);
    setFormData({
      code: currency.code,
      name: currency.name,
      is_crypto: currency.is_crypto,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = () => {
    if (editingCurrency) {
      updateMutation.mutate({ id: editingCurrency.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h2 className="text-lg font-semibold">Currencies</h2>
        <button
          onClick={() => {
            setEditingCurrency(null);
            setFormData({ code: '', name: '', is_crypto: false });
            setIsModalOpen(true);
          }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          + Add Currency
        </button>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {currencies?.map((currency: any) => (
              <tr key={currency.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm">{currency.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{currency.code}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">{currency.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    currency.is_crypto 
                      ? 'bg-purple-100 text-purple-800' 
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {currency.is_crypto ? 'Crypto' : 'Fiat'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    onClick={() => handleEdit(currency)}
                    className="text-indigo-600 hover:text-indigo-900 mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(currency)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <Modal
          title={editingCurrency ? 'Edit Currency' : 'Add Currency'}
          onClose={() => {
            setIsModalOpen(false);
            setEditingCurrency(null);
          }}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Code *</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="EUR, USD, USDT, BTC, etc."
                required
                disabled={!!editingCurrency}
              />
              {editingCurrency && (
                <p className="text-xs text-gray-400 mt-1">Currency code cannot be changed</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Euro, US Dollar, Tether, Bitcoin, etc."
                required
              />
            </div>
            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.is_crypto}
                  onChange={(e) => setFormData({ ...formData, is_crypto: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium">Cryptocurrency</span>
              </label>
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingCurrency(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!formData.code || !formData.name || createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {editingCurrency ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteConfirmOpen && currencyToDelete && (
        <ConfirmDeleteModal
          title="Delete Currency"
          message={`Are you sure you want to delete currency "${currencyToDelete.code} - ${currencyToDelete.name}"?`}
          onConfirm={confirmDelete}
          onCancel={() => {
            setDeleteConfirmOpen(false);
            setCurrencyToDelete(null);
          }}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

// Вкладка шаблонов
function TemplatesTab() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    client_sends_currency: '',
    client_receives_currency: '',
  });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<any>(null);

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const response = await api.get('/api/templates?active_only=false');
      return response.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setDeleteConfirmOpen(false);
      setTemplateToDelete(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await api.put(`/api/templates/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setIsModalOpen(false);
      setEditingTemplate(null);
    },
  });

  const handleDelete = (template: any) => {
    setTemplateToDelete(template);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (templateToDelete) {
      deleteMutation.mutate(templateToDelete.id);
    }
  };

  const handleEdit = (template: any) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || '',
      client_sends_currency: template.client_sends_currency || '',
      client_receives_currency: template.client_receives_currency || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = () => {
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: formData });
    }
  };

  const toggleActive = async (template: any) => {
    try {
      await api.put(`/api/templates/${template.id}`, {
        is_active: !template.is_active,
      });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    } catch (error) {
      console.error('Error toggling template:', error);
    }
  };

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h2 className="text-lg font-semibold">Deal Templates</h2>
        <p className="text-sm text-gray-500">
          Шаблоны создаются на странице создания сделки
        </p>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currencies</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {templates?.map((template: any) => (
              <tr key={template.id} className={!template.is_active ? 'bg-gray-50 opacity-60' : ''}>
                <td className="px-6 py-4 whitespace-nowrap text-sm">{template.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <div className="font-medium">{template.name}</div>
                  {template.description && (
                    <div className="text-xs text-gray-500">{template.description}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {template.client_sends_currency || '—'} → {template.client_receives_currency || '—'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`px-2 py-1 rounded text-xs ${
                    template.is_active 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {template.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    onClick={() => toggleActive(template)}
                    className="text-blue-600 hover:text-blue-900 mr-3"
                  >
                    {template.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => handleEdit(template)}
                    className="text-indigo-600 hover:text-indigo-900 mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(template)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {(!templates || templates.length === 0) && (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                  No templates found. Create templates from the New Deal page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <Modal
          title="Edit Template"
          onClose={() => {
            setIsModalOpen(false);
            setEditingTemplate(null);
          }}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Client Sends Currency</label>
                <input
                  type="text"
                  value={formData.client_sends_currency}
                  onChange={(e) => setFormData({ ...formData, client_sends_currency: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="USDT"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Client Receives Currency</label>
                <input
                  type="text"
                  value={formData.client_receives_currency}
                  onChange={(e) => setFormData({ ...formData, client_receives_currency: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="EUR"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingTemplate(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!formData.name || updateMutation.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteConfirmOpen && templateToDelete && (
        <ConfirmDeleteModal
          title="Delete Template"
          message={`Are you sure you want to delete template "${templateToDelete.name}"?`}
          onConfirm={confirmDelete}
          onCancel={() => {
            setDeleteConfirmOpen(false);
            setTemplateToDelete(null);
          }}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

// Вкладка комиссий менеджеров
interface ManagerCommission {
  id: number;
  user_id: number;
  user_email: string;
  user_name: string | null;
  user_role: string;
  commission_percent: string;
  is_active: boolean;
}

function ManagerCommissionsTab() {
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState<number | null>(null);
  const [newCommission, setNewCommission] = useState<string>('');

  const { data: commissions, isLoading } = useQuery<ManagerCommission[]>({
    queryKey: ['manager-commissions'],
    queryFn: async () => {
      const response = await api.get('/api/reference/manager-commissions');
      return response.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ userId, commission }: { userId: number; commission: string }) => {
      const response = await api.put(`/api/reference/manager-commissions/${userId}`, {
        commission_percent: parseFloat(commission)
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-commissions'] });
      setEditingUser(null);
      setNewCommission('');
    },
  });

  const handleEdit = (comm: ManagerCommission) => {
    setEditingUser(comm.user_id);
    setNewCommission(comm.commission_percent);
  };

  const handleSave = (userId: number) => {
    updateMutation.mutate({ userId, commission: newCommission });
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      'manager': 'Менеджер',
      'senior_manager': 'Главный менеджер',
      'accountant': 'Бухгалтер',
      'director': 'Директор',
    };
    return labels[role] || role;
  };

  if (isLoading) {
    return <div className="text-center py-8">Загрузка...</div>;
  }

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h2 className="text-lg font-semibold">Комиссии менеджеров</h2>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Имя</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Роль</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Комиссия %</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Действия</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {commissions?.map((comm) => (
              <tr key={comm.user_id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm">{comm.user_id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">{comm.user_email}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">{comm.user_name || '—'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className="px-2 py-1 rounded text-xs bg-gray-100">
                    {getRoleLabel(comm.user_role)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {editingUser === comm.user_id ? (
                    <input
                      type="number"
                      step="0.01"
                      value={newCommission}
                      onChange={(e) => setNewCommission(e.target.value)}
                      className="w-24 px-2 py-1 border border-gray-300 rounded-md text-sm"
                      placeholder="%"
                    />
                  ) : (
                    <span className="font-medium">{parseFloat(comm.commission_percent).toFixed(2)}%</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {editingUser === comm.user_id ? (
                    <>
                      <button
                        onClick={() => handleSave(comm.user_id)}
                        disabled={updateMutation.isPending}
                        className="text-green-600 hover:text-green-900 mr-3"
                      >
                        ✓ Сохранить
                      </button>
                      <button
                        onClick={() => {
                          setEditingUser(null);
                          setNewCommission('');
                        }}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        ✗ Отмена
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleEdit(comm)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      Редактировать
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {(!commissions || commissions.length === 0) && (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                  Нет пользователей
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 p-4 bg-blue-50 rounded-lg">
        <h3 className="text-sm font-medium text-blue-800 mb-2">Пояснение</h3>
        <p className="text-xs text-blue-700">
          Комиссия менеджера — это процент от дохода по сделке, который выплачивается менеджеру.
          Например, если доход по сделке 200 USDT и комиссия менеджера 10%, то менеджер получает 20 USDT.
          Чистая прибыль = Доход - Комиссия менеджера.
        </p>
      </div>
    </div>
  );
}

// Вкладка системных настроек
interface SystemSetting {
  id: number;
  key: string;
  value: string | null;
  description: string | null;
}

function SystemSettingsTab() {
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [newValue, setNewValue] = useState<string>('');

  const { data: settings, isLoading } = useQuery<SystemSetting[]>({
    queryKey: ['system-settings'],
    queryFn: async () => {
      const response = await api.get('/api/reference/settings');
      return response.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const response = await api.put(`/api/reference/settings/${key}`, { value });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      queryClient.invalidateQueries({ queryKey: ['default-client-rate'] });
      setEditingKey(null);
      setNewValue('');
    },
  });

  const handleEdit = (setting: SystemSetting) => {
    setEditingKey(setting.key);
    setNewValue(setting.value || '');
  };

  const handleSave = (key: string) => {
    updateMutation.mutate({ key, value: newValue });
  };

  const getSettingLabel = (key: string) => {
    const labels: Record<string, string> = {
      'default_client_rate': 'Ставка клиента по умолчанию (%)',
    };
    return labels[key] || key;
  };

  if (isLoading) {
    return <div className="text-center py-8">Загрузка...</div>;
  }

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h2 className="text-lg font-semibold">Системные настройки</h2>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Параметр</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Значение</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Описание</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Действия</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {settings?.map((setting) => (
              <tr key={setting.key}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {getSettingLabel(setting.key)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {editingKey === setting.key ? (
                    <input
                      type="text"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      className="w-32 px-2 py-1 border border-gray-300 rounded-md text-sm"
                    />
                  ) : (
                    <span className="font-medium">{setting.value || '—'}</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {setting.description || '—'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {editingKey === setting.key ? (
                    <>
                      <button
                        onClick={() => handleSave(setting.key)}
                        disabled={updateMutation.isPending}
                        className="text-green-600 hover:text-green-900 mr-3"
                      >
                        ✓ Сохранить
                      </button>
                      <button
                        onClick={() => {
                          setEditingKey(null);
                          setNewValue('');
                        }}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        ✗ Отмена
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleEdit(setting)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      Редактировать
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {(!settings || settings.length === 0) && (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                  Нет настроек. Выполните миграцию базы данных для создания настроек по умолчанию.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

