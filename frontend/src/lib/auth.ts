export interface User {
  id: number;
  email: string;
  full_name: string | null;
  role: 'manager' | 'senior_manager' | 'accountant' | 'director';
  is_active: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export const authService = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const formData = new FormData();
    formData.append('username', email);
    formData.append('password', password);
    
    const envApiUrl = import.meta.env.VITE_API_URL;
    const baseUrl = envApiUrl && envApiUrl.trim() !== '' ? envApiUrl : '';
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error('Invalid credentials');
    }
    
    return response.json();
  },
  
  getCurrentUser: async (): Promise<User> => {
    try {
      const { api } = await import('./api');
      const response = await api.get('/api/auth/me');
      return response.data;
    } catch (error) {
      console.error('Error in getCurrentUser:', error);
      throw error;
    }
  },
  
  logout: () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  },
};

