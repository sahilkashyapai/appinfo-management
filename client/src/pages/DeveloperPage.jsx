import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import { useBranding } from '../context/BrandingContext';
import { hexToRgbTriplet } from '../utils/color';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const THEME_PRESETS = [
  { name: 'Ocean Blue', primary: '#2E86AB', secondary: '#1E3A5F' },
  { name: 'Emerald', primary: '#27AE60', secondary: '#145A32' },
  { name: 'Crimson', primary: '#E74C3C', secondary: '#922B21' },
  { name: 'Violet', primary: '#8E44AD', secondary: '#4A235A' },
  { name: 'Amber', primary: '#F39C12', secondary: '#7E5109' },
  { name: 'Teal', primary: '#14B8A6', secondary: '#134E4A' },
  { name: 'Indigo', primary: '#6366F1', secondary: '#312E81' },
  { name: 'Rose', primary: '#EC4899', secondary: '#831843' },
  { name: 'Sky', primary: '#4FC3F7', secondary: '#0D1B2A' },
  { name: 'Graphite', primary: '#64748B', secondary: '#1E293B' },
];

function samePalette(a, b, preset) {
  return a?.toLowerCase() === preset.primary.toLowerCase() && b?.toLowerCase() === preset.secondary.toLowerCase();
}

function PalettePicker({ primary, secondary, onPick }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10, marginBottom: 18 }}>
      {THEME_PRESETS.map((preset) => {
        const active = samePalette(primary, secondary, preset);
        return (
          <button
            type="button"
            key={preset.name}
            onClick={() => onPick(preset)}
            title={preset.name}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '8px 6px',
              borderRadius: 8,
              border: active ? `2px solid ${preset.primary}` : '1px solid var(--bd)',
              background: 'var(--bg2)',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: '100%',
                height: 28,
                borderRadius: 6,
                background: `linear-gradient(135deg, ${preset.primary}, ${preset.secondary})`,
                boxShadow: active ? `0 0 0 2px var(--bg2), 0 0 0 4px ${preset.primary}` : 'none',
              }}
            />
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--t2)' }}>{preset.name}</div>
            {active && <i className="fa-solid fa-circle-check" style={{ fontSize: 11, color: preset.primary, marginTop: -4 }} />}
          </button>
        );
      })}
    </div>
  );
}

function ColorField({ label, hint, value, onChange }) {
  return (
    <div className="fg">
      <label className="fl">{label}</label>
      {hint && <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>{hint}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 44, height: 34, padding: 2, border: '1px solid var(--bd)', borderRadius: 6, background: 'var(--bg2)', cursor: 'pointer' }}
        />
        <input className="fc" value={value} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 120, textTransform: 'uppercase' }} maxLength={7} />
      </div>
    </div>
  );
}

function ImageField({ label, hint, value, fallback, onPick, onClear, aspect }) {
  const inputRef = useRef(null);
  return (
    <div className="fg">
      <label className="fl">{label}</label>
      {hint && <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>{hint}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: aspect === 'wide' ? 140 : 64,
            height: 64,
            borderRadius: 8,
            border: '1px solid var(--bd)',
            background: 'var(--bg1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <img src={value || fallback} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          <button type="button" className="btn bs bsm" onClick={() => inputRef.current?.click()}>
            <i className="fa-solid fa-upload" /> Upload
          </button>
          {value && (
            <button type="button" className="btn brd bsm" onClick={onClear}>
              <i className="fa-solid fa-rotate-left" /> Reset
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onPick(file);
          }}
        />
      </div>
    </div>
  );
}

export default function DeveloperPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const branding = useBranding();
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings').then((r) => r.data.settings) });
  const [form, setForm] = useState(null);

  const b = form || (data ? data.branding : null);

  const save = useMutation({
    mutationFn: (body) => api.put('/settings/branding', body),
    onSuccess: () => {
      toast('Branding updated', 'success');
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['branding'] });
      setForm(null);
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not update branding.', 'error'),
  });

  function readAsImage(file, field) {
    if (!file.type.startsWith('image/')) {
      toast('Please choose an image file.', 'error');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast('Image must be under 2 MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm({ ...b, [field]: reader.result });
    reader.readAsDataURL(file);
  }

  const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
  const colorsValid = !!b && HEX_COLOR_REGEX.test(b.primaryColor) && HEX_COLOR_REGEX.test(b.secondaryColor);

  // Live preview: push every color edit straight into the same style tag
  // BrandingContext writes to (see BrandingContext.jsx), so picking a preset or
  // dragging the custom picker repaints the whole app instantly - no Save needed
  // to see it. Falls back to the persisted colors once `form` is cleared
  // (Discard, or after Save invalidates the query), so it never gets stuck
  // showing an unsaved preview.
  // Runs unconditionally (b may be null on first render, before Save
  // Changes/branding data loads) - Hooks can't follow an early return.
  useEffect(() => {
    if (!colorsValid) return;
    let style = document.getElementById('branding-theme-vars');
    if (!style) {
      style = document.createElement('style');
      style.id = 'branding-theme-vars';
      document.head.appendChild(style);
    }
    style.textContent = `:root { --accent: ${b.primaryColor}; --blue: ${b.secondaryColor}; --accent-rgb: ${hexToRgbTriplet(b.primaryColor)}; --blue-rgb: ${hexToRgbTriplet(b.secondaryColor)}; }`;
  }, [b?.primaryColor, b?.secondaryColor, colorsValid]);

  if (!b) return null;

  const dirty = !!form;

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Developer Panel</div>
          <div className="pgs">Manage company branding and the webapp's color theme</div>
        </div>
      </div>
      <div className="g2">
        <div className="card">
          <div className="chd"><div className="cht"><i className="fa-solid fa-palette" /> Color Theme</div></div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 14 }}>
            Applies instantly for every signed-in user, in both light and dark mode - not just your own browser.
          </div>

          <label className="fl" style={{ display: 'block', marginBottom: 8 }}>Presets</label>
          <PalettePicker
            primary={b.primaryColor}
            secondary={b.secondaryColor}
            onPick={(preset) => setForm({ ...b, primaryColor: preset.primary, secondaryColor: preset.secondary })}
          />

          <label className="fl" style={{ display: 'block', marginBottom: 8 }}>Custom</label>
          <div className="fg2">
            <ColorField label="Primary Color" hint="Buttons, links, active states" value={b.primaryColor} onChange={(v) => setForm({ ...b, primaryColor: v })} />
            <ColorField label="Secondary Color" hint="Gradients, headers" value={b.secondaryColor} onChange={(v) => setForm({ ...b, secondaryColor: v })} />
          </div>
        </div>
        <div className="card">
          <div className="chd"><div className="cht"><i className="fa-solid fa-code" /> Company Branding</div></div>

          <div className="fg" style={{ marginBottom: 16 }}>
            <label className="fl">Company Name</label>
            <input className="fc" value={b.companyName} onChange={(e) => setForm({ ...b, companyName: e.target.value })} placeholder="Company name" />
          </div>

          <ImageField
            label="Logo"
            hint="Shown in the sidebar, login, signup, and careers pages."
            value={b.logoUrl}
            fallback="/images/AI-horizontal-logo-R-gray-454x116-1.png"
            aspect="wide"
            onPick={(f) => readAsImage(f, 'logoUrl')}
            onClear={() => setForm({ ...b, logoUrl: '' })}
          />
          <div style={{ height: 16 }} />
          <ImageField
            label="Favicon"
            hint="Browser tab icon and the small icon on login/signup/careers pages."
            value={b.faviconUrl}
            fallback="/images/ai-icon.png"
            onPick={(f) => readAsImage(f, 'faviconUrl')}
            onClear={() => setForm({ ...b, faviconUrl: '' })}
          />
          <div style={{ height: 16 }} />
          <ImageField
            label="Banner"
            hint="Background image behind the logo on employee and profile pages. Reset to use the default gradient."
            value={b.bannerUrl}
            fallback={branding.logoUrl}
            aspect="wide"
            onPick={(f) => readAsImage(f, 'bannerUrl')}
            onClear={() => setForm({ ...b, bannerUrl: '' })}
          />

          <div style={{ display: 'flex', gap: 7, marginTop: 20 }}>
            <button className="btn bp bsm" disabled={!dirty || !colorsValid || save.isPending} onClick={() => save.mutate(b)}>
              <i className="fa-solid fa-check" /> Save Changes
            </button>
            {dirty && (
              <button className="btn bs bsm" onClick={() => setForm(null)}>
                Discard
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
