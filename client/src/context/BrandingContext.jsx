import { createContext, useContext, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';

// Ships as the visual identity before any admin ever touches the Developer
// Panel — and remains the fallback whenever a branding field is cleared.
const DEFAULT_BRANDING = {
  companyName: 'Applied Information India',
  logoUrl: '/images/AI-horizontal-logo-R-gray-454x116-1.png',
  faviconUrl: '/images/ai-icon.png',
  bannerUrl: '',
};

const BrandingContext = createContext(DEFAULT_BRANDING);

export function BrandingProvider({ children }) {
  // Public endpoint (see settingsRoutes.js) — must resolve before login, so it
  // can't sit behind requireAuth like the rest of /settings.
  const { data } = useQuery({
    queryKey: ['branding'],
    queryFn: () => api.get('/settings/branding').then((r) => r.data.branding),
    staleTime: 60000,
  });

  const branding = {
    companyName: data?.companyName || DEFAULT_BRANDING.companyName,
    logoUrl: data?.logoUrl || DEFAULT_BRANDING.logoUrl,
    faviconUrl: data?.faviconUrl || DEFAULT_BRANDING.faviconUrl,
    bannerUrl: data?.bannerUrl || '',
  };

  useEffect(() => {
    document.title = `${branding.companyName} – Employee Celebrations Platform`;
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = branding.faviconUrl;
  }, [branding.companyName, branding.faviconUrl]);

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
