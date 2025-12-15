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

type TabType = 'clients' | 'companies' | 'balances';

export function ReferencesPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('clients');

  // Определяем доступные вкладки в зависимости от роли
  const availableTabs: TabType[] = ['clients', 'companies'];
  // Остатки по счетам доступны только для бухгалтера и директора
  if (user?.role === 'accountant' || user?.role === 'director') {
    availableTabs.push('balances');
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">References</h1>

      {/* Вкладки */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {availableTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab === 'clients' && 'Clients'}
              {tab === 'companies' && 'Companies'}
              {tab === 'balances' && 'Account Balances'}
            </button>
          ))}
        </nav>
      </div>

      {/* Контент вкладок */}
      {activeTab === 'clients' && <ClientsTab />}
      {activeTab === 'companies' && <CompaniesTab />}
      {activeTab === 'balances' && <AccountBalancesTab />}
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

