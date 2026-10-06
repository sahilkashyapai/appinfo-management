import { createContext, useContext, useEffect, useState } from 'react';
import { warnMissingProvider } from '../utils/missingProvider';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => localStorage.getItem('aii_theme') === 'dark');

  useEffect(() => {
    document.body.classList.toggle('dark', dark);
    localStorage.setItem('aii_theme', dark ? 'dark' : 'light');
  }, [dark]);

  return <ThemeContext.Provider value={{ dark, toggleDark: () => setDark((d) => !d) }}>{children}</ThemeContext.Provider>;
}

const NO_PROVIDER = Object.freeze({ dark: false, toggleDark: () => {} });

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    warnMissingProvider('useTheme');
    return NO_PROVIDER;
  }
  return ctx;
}
