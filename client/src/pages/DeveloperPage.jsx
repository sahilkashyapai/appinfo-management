import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import { useBranding } from '../context/BrandingContext';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

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

  if (!b) return null;

  const dirty = !!form;

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Developer Panel</div>
          <div className="pgs">Manage company branding — logo, name, favicon, and banner</div>
        </div>
      </div>
      <div className="card" style={{ maxWidth: 640 }}>
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
          <button className="btn bp bsm" disabled={!dirty || save.isPending} onClick={() => save.mutate(b)}>
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
  );
}
