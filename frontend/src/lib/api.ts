import axios from 'axios';

// В проде URL приходит из VITE_API_URL, который задаётся в docker-compose (build-arg + env).
// Если VITE_API_URL пустой или не задан, используем относительный путь (nginx проксирует /api на backend).
// Фолбек на localhost оставим только как удобство для локальной разработки без docker.
const envApiUrl = import.meta.env.VITE_API_URL;
const API_URL = envApiUrl && envApiUrl.trim() !== '' ? envApiUrl : '';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Добавляем токен к каждому запросу
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Обработка ошибок
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

