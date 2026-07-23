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

// Calls whose own job is to authenticate — a 401 from these means "wrong credentials",
// not "your session died", so they must not trigger the global logout handler. Without
// this, every failed login attempt fires a spurious extra POST /auth/logout (which then
// itself 401s, since there was never a session to log out of).
const AUTH_ATTEMPT_PATHS = ['/auth/login', '/auth/2fa/verify', '/auth/logout'];

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthAttempt = AUTH_ATTEMPT_PATHS.some((p) => err.config?.url?.includes(p));
    if (err.response?.status === 401 && onUnauthorized && !isAuthAttempt) onUnauthorized();
    return Promise.reject(err);
  }
);

export default api;
