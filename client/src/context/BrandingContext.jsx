import { createContext, useContext, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { hexToRgbTriplet } from '../utils/color';

// Ships as the visual identity before any admin ever touches the Developer
// Panel - and remains the fallback whenever a branding field is cleared.
const DEFAULT_BRANDING = {
  companyName: 'Applied Information India',
  logoUrl: '/images/AI-horizontal-logo-R-gray-454x116-1.png',
  faviconUrl: '/images/ai-icon.png',
  bannerUrl: '',
  primaryColor: '#2E86AB',
  secondaryColor: '#1E3A5F',
};

const BrandingContext = createContext(DEFAULT_BRANDING);

// Public endpoint (see settingsRoutes.js) - must resolve before login, so it
// can't sit behind requireAuth like the rest of /settings. Shared with
// PreloaderGate, which waits for it.
export const brandingQuery = {
  queryKey: ['branding'],
  queryFn: () => api.get('/settings/branding').then((r) => r.data.branding),
  staleTime: 60000,
};

export function BrandingProvider({ children }) {
  const { data } = useQuery(brandingQuery);

  const branding = {
    companyName: data?.companyName || DEFAULT_BRANDING.companyName,
    logoUrl: data?.logoUrl || DEFAULT_BRANDING.logoUrl,
    faviconUrl: data?.faviconUrl || DEFAULT_BRANDING.faviconUrl,
    bannerUrl: data?.bannerUrl || '',
    primaryColor: data?.primaryColor || DEFAULT_BRANDING.primaryColor,
    secondaryColor: data?.secondaryColor || DEFAULT_BRANDING.secondaryColor,
  };

  useEffect(() => {
    document.title = `AI Connect - ${branding.companyName}`;
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = branding.faviconUrl;
  }, [branding.companyName, branding.faviconUrl]);

  // --accent/--blue aren't redefined by body.dark (see global.css), so overriding
  // them once at :root applies the same theme color in both light and dark mode,
  // for every signed-in user - not just a local per-browser preference. The
  // *-rgb companions let chart/graph code do rgba(var(--accent-rgb), .3) for a
  // translucent tint, since raw hex can't be alpha-blended in CSS.
  useEffect(() => {
    let style = document.getElementById('branding-theme-vars');
    if (!style) {
      style = document.createElement('style');
      style.id = 'branding-theme-vars';
      document.head.appendChild(style);
    }
    style.textContent = `:root { --accent: ${branding.primaryColor}; --blue: ${branding.secondaryColor}; --accent-rgb: ${hexToRgbTriplet(branding.primaryColor)}; --blue-rgb: ${hexToRgbTriplet(branding.secondaryColor)}; }`;
  }, [branding.primaryColor, branding.secondaryColor]);

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
