import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('aii_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Exclude the logout call itself — otherwise a 401 there (e.g. an already-expired
    // token) re-triggers logout(), which fires another logout call, forever.
    const isLogoutCall = err.config?.url?.includes('/auth/logout');
    if (err.response?.status === 401 && onUnauthorized && !isLogoutCall) onUnauthorized();
    return Promise.reject(err);
  }
);

export default api;
