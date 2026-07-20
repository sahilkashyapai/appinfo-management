import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

const ICONS = {
  success: 'fa-solid fa-circle-check',
  warning: 'fa-solid fa-triangle-exclamation',
  birthday: 'fa-solid fa-cake-candles',
  anniversary: 'fa-solid fa-trophy',
  info: 'fa-solid fa-circle-info',
  error: 'fa-solid fa-circle-xmark',
};
const COLORS = { success: '#27AE60', warning: '#E67E22', birthday: '#E67E22', anniversary: '#2980B9', info: '#2E86AB', error: '#E74C3C' };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const toast = useCallback((msg, type = 'info') => {
    const id = idRef.current++;
    setToasts((t) => [...t, { id, msg, type, show: false }]);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, show: true } : x)));
    }));
    setTimeout(() => {
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, show: false } : x)));
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 280);
    }, 3800);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div id="tc">
        {toasts.map((t) => (
          <div key={t.id} className={`tmsg${t.show ? ' show' : ''}`} style={{ borderLeft: `3px solid ${COLORS[t.type] || COLORS.info}` }}>
            <i className={ICONS[t.type] || ICONS.info} /> {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
