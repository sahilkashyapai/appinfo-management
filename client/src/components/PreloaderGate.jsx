import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { brandingQuery } from '../context/BrandingContext';

// Removes the #preloader from index.html once the app can show its real first
// screen: every page resource has loaded (window `load`), the stored sign-in
// has been checked, and branding (logo, colors) has arrived - so users never
// see a blank screen or a flash of the default colors. A failed branding or
// sign-in request still counts as "done"; the app handles those itself.
function hidePreloader() {
  const el = document.getElementById('preloader');
  if (!el || el.classList.contains('pl-done')) return;
  el.classList.add('pl-done');
  setTimeout(() => el.remove(), 400); // after the fade-out transition
}

export default function PreloaderGate() {
  const { loading } = useAuth();
  const { isPending: brandingPending } = useQuery(brandingQuery);

  useEffect(() => {
    if (loading || brandingPending) return undefined;
    if (document.readyState === 'complete') {
      hidePreloader();
      return undefined;
    }
    window.addEventListener('load', hidePreloader, { once: true });
    return () => window.removeEventListener('load', hidePreloader);
  }, [loading, brandingPending]);

  return null;
}
