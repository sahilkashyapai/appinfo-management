import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import api, { setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);
const IDLE_LOGOUT_MS = 30 * 60 * 1000; // mirrors default Settings.security.sessionTimeoutMins

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pending2fa, setPending2fa] = useState(null); // { tempToken }
  const idleTimer = useRef(null);

  const logout = useCallback(() => {
    localStorage.removeItem('aii_token');
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  useEffect(() => {
    const token = localStorage.getItem('aii_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => localStorage.removeItem('aii_token'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const resetIdleTimer = () => {
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(logout, IDLE_LOGOUT_MS);
    };
    ['mousemove', 'keydown', 'click', 'scroll'].forEach((evt) => window.addEventListener(evt, resetIdleTimer));
    resetIdleTimer();
    return () => {
      clearTimeout(idleTimer.current);
      ['mousemove', 'keydown', 'click', 'scroll'].forEach((evt) => window.removeEventListener(evt, resetIdleTimer));
    };
  }, [user, logout]);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    if (res.data.requires2fa) {
      setPending2fa({ tempToken: res.data.tempToken });
      return { requires2fa: true };
    }
    localStorage.setItem('aii_token', res.data.token);
    setUser(res.data.user);
    return { requires2fa: false };
  }, []);

  const verify2fa = useCallback(
    async (code) => {
      if (!pending2fa) throw new Error('No pending 2FA challenge.');
      const res = await api.post('/auth/2fa/verify', { tempToken: pending2fa.tempToken, code });
      localStorage.setItem('aii_token', res.data.token);
      setUser(res.data.user);
      setPending2fa(null);
    },
    [pending2fa]
  );

  const refreshUser = useCallback(async () => {
    const res = await api.get('/auth/me');
    setUser(res.data.user);
    return res.data.user;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, verify2fa, pending2fa, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
