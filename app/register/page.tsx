"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { API_BASE } from '../lib/api';
import {
  LocationHierarchy,
  areaNames,
  regionsForArea,
  nopsForRegion,
} from '../lib/locationHierarchy';

/* ─── Mini Toast component ─── */
type ToastType = 'success' | 'error';
interface ToastProps { type: ToastType; message: string; onClose: () => void; }

function Toast({ type, message, onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  const isSuccess = type === 'success';
  return (
    <div
      role="alert"
      style={{
        position: 'fixed', top: '24px', right: '24px', zIndex: 9999,
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '14px 20px',
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        background: isSuccess ? '#1a7f5a' : '#c0392b',
        color: '#fff',
        fontSize: '0.875rem',
        fontWeight: 500,
        maxWidth: '360px',
        animation: 'slideIn 0.25s ease',
      }}
    >
      <span style={{ fontSize: '1.1rem' }}>{isSuccess ? '✓' : '✕'}</span>
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={onClose}
        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
      >×</button>
      <style>{`@keyframes slideIn { from { opacity:0; transform:translateX(40px) } to { opacity:1; transform:translateX(0) } }`}</style>
    </div>
  );
}

// Roles a user may self-assign on registration (admin/superadmin excluded by the backend).
const ROLE_OPTIONS = [
  { value: 'user', label: 'Operational User' },
  { value: 'manager', label: 'Manager' },
  { value: 'executive', label: 'Executive' },
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #47413a',
  borderRadius: '12px',
  padding: '12px 14px',
  fontSize: '0.875rem',
  color: '#e7e1d5',
  background: '#2d2a27',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 600,
  color: '#ece7dc',
  marginBottom: '6px',
  display: 'block',
};

export default function Register() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('user');
  const [area, setArea] = useState('');
  const [region, setRegion] = useState('');
  const [nop, setNop] = useState('');
  const [hierarchy, setHierarchy] = useState<LocationHierarchy | null>(null);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ type: ToastType; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/auth/location-hierarchy`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setHierarchy(data); })
      .catch(() => { /* dropdowns just stay empty; submit still works */ });
    return () => { cancelled = true; };
  }, []);

  const showToast = (type: ToastType, message: string) => setToast({ type, message });

  function validate(): string | null {
    if (!email.trim() || !username.trim() || !password || !confirmPassword) {
      return 'Semua field bertanda wajib harus diisi.';
    }
    if (password.length < 8) return 'Password minimal harus 8 karakter.';
    if (!/[A-Z]/.test(password)) return 'Password harus memiliki minimal satu huruf besar (A-Z).';
    if (!/\d/.test(password)) return 'Password harus memiliki minimal satu angka (0-9).';
    if (password !== confirmPassword) return 'Konfirmasi password tidak sesuai.';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});

    const validationError = validate();
    if (validationError) {
      showToast('error', validationError);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          username: username.trim(),
          password,
          role,
          area: area.trim() || null,
          region: region.trim() || null,
          nop: nop.trim() || null,
        }),
      });

      if (res.ok) {
        showToast('success', 'Registrasi berhasil! Mengarahkan ke halaman Sign In...');
        setTimeout(() => router.replace('/signin'), 1400);
        return;
      }

      // 422 — FastAPI validation errors
      if (res.status === 422) {
        const body = await res.json().catch(() => null);
        const fe: Record<string, string> = {};
        (body?.detail ?? []).forEach((item: unknown) => {
          const detail = item as { loc?: Array<string | number>; msg?: string };
          const loc = Array.isArray(detail.loc) ? detail.loc : [];
          if (loc.length >= 2) fe[String(loc[1])] = detail.msg ?? 'Invalid value';
        });
        setFieldErrors(fe);
        showToast('error', 'Input tidak valid, periksa kembali form anda.');
        return;
      }

      const body = await res.json().catch(() => null);
      const reason = typeof body?.detail === 'string'
        ? body.detail
        : `Registrasi gagal (status ${res.status})`;
      showToast('error', reason);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      showToast('error', message === 'Failed to fetch'
        ? 'Tidak dapat menghubungi server. Pastikan backend berjalan di port 8001.'
        : (message || 'Terjadi kesalahan jaringan.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex w-screen h-screen"
      style={{
        fontFamily: "'Inter', Tahoma, Geneva, Verdana, sans-serif",
        overflow: 'hidden',
        background: 'radial-gradient(120% 90% at 20% 0%, #2a2723 0%, #1f1d1b 48%, #171717 100%)',
      }}
    >
      {/* Toast */}
      {toast && (
        <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
      )}

      {/* ══════════════════ LEFT PANEL ══════════════════ */}
      <aside
        className="hidden md:flex w-1/2 relative overflow-hidden flex-col"
        style={{ background: 'transparent', height: '100vh' }}
      >
        {/* Telkomsel Logo (top-left) */}
        <div className="absolute z-10" style={{ top: '40px', left: '40px' }}>
          <Image
            src="/telkomsel.png"
            alt="Telkomsel"
            width={300}
            height={44}
            style={{
              objectFit: 'contain',
              objectPosition: 'left center',
              opacity: 0.9,
              filter: 'brightness(1.2) contrast(1.95)',
            }}
            priority
          />
        </div>

        {/* Large Tsel mark — centered */}
        <div className="absolute pointer-events-none" style={{ zIndex: 1, top: '80px', left: 0, right: 0 }}>
          <Image
            src="/tsel.svg"
            alt=""
            width={520}
            height={832}
            style={{
              objectFit: 'contain',
              width: '70%',
              height: 'auto',
              opacity: 0.32,
              filter: 'grayscale(1) brightness(1.50)',
              display: 'block',
            }}
            aria-hidden="true"
          />
        </div>

        {/* Bottom text */}
        <div className="absolute bottom-10 left-10 z-10">
          <p
            className="font-semibold leading-snug"
            style={{
              fontSize: '2.5rem',
              fontWeight: 550,
              color: '#e9e4d9',
              maxWidth: '900px',
              paddingTop: '700px',
              paddingLeft: '40px',
            }}
          >
            Empowering Modern Work Through Intelligent Conversations.
          </p>
        </div>
      </aside>

      {/* ══════════════════ RIGHT PANEL ══════════════════ */}
      <main
        className="flex flex-1 items-center justify-center px-10 py-12"
        style={{ background: 'transparent', height: '100vh', overflowY: 'auto' }}
      >
        <div style={{ width: '100%', maxWidth: '460px', background: 'linear-gradient(180deg, #232220 0%, #1e1d1b 100%)', border: '1px solid #3a3530', borderRadius: '18px', padding: '30px 26px', boxShadow: '0 24px 46px rgba(0,0,0,0.42)' }}>

          {/* Title */}
          <h2
            className="text-center font-bold mb-2"
            style={{ fontSize: '2.1rem', color: '#ece7dc', letterSpacing: '0.01em', fontWeight: 650 }}
          >
            Create Account
          </h2>
          <div
            className="mx-auto mb-8"
            style={{ width: '40px', height: '3px', background: '#EC2028', borderRadius: '99px' }}
          />

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

            {/* Email */}
            <div>
              <label style={labelStyle}>Email Address <span style={{ color: '#EC2028' }}>*</span></label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter your email address"
                required
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = '#6a5c4f')}
                onBlur={e => (e.currentTarget.style.borderColor = '#47413a')}
              />
              {fieldErrors.email ? (
                <div style={{ color: '#ff4444', fontSize: '0.8rem', marginTop: 6 }}>{fieldErrors.email}</div>
              ) : null}
            </div>

            {/* Username */}
            <div>
              <label style={labelStyle}>Username <span style={{ color: '#EC2028' }}>*</span></label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                required
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = '#6a5c4f')}
                onBlur={e => (e.currentTarget.style.borderColor = '#47413a')}
              />
            </div>

            {/* Password */}
            <div style={{ position: 'relative' }}>
              <label style={labelStyle}>Password <span style={{ color: '#EC2028' }}>*</span></label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 chars, 1 uppercase, 1 number"
                required
                style={{ ...inputStyle, paddingRight: '40px', color: 'white' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#6a5c4f')}
                onBlur={e => (e.currentTarget.style.borderColor = '#47413a')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: 8, top: '38px',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#8f8f8a" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#8f8f8a" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Confirm Password */}
            <div>
              <label style={labelStyle}>Confirm Password <span style={{ color: '#EC2028' }}>*</span></label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                required
                style={{ ...inputStyle, color: 'white' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#6a5c4f')}
                onBlur={e => (e.currentTarget.style.borderColor = '#47413a')}
              />
            </div>

            {/* Role */}
            <div>
              <label style={labelStyle}>Role</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value)}
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = '#6a5c4f')}
                onBlur={e => (e.currentTarget.style.borderColor = '#47413a')}
              >
                {ROLE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value} style={{ background: '#232220' }}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Location Identity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Area</label>
                <select
                  value={area}
                  onChange={e => { setArea(e.target.value); setRegion(''); setNop(''); }}
                  style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = '#6a5c4f')}
                  onBlur={e => (e.currentTarget.style.borderColor = '#47413a')}
                >
                  <option value="" style={{ background: '#232220' }}>— Pilih Area —</option>
                  {areaNames(hierarchy).map(a => (
                    <option key={a} value={a} style={{ background: '#232220' }}>{a}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Region</label>
                <select
                  value={region}
                  onChange={e => { setRegion(e.target.value); setNop(''); }}
                  disabled={!area}
                  style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = '#6a5c4f')}
                  onBlur={e => (e.currentTarget.style.borderColor = '#47413a')}
                >
                  <option value="" style={{ background: '#232220' }}>— Pilih Region —</option>
                  {regionsForArea(hierarchy, area).map(r => (
                    <option key={r} value={r} style={{ background: '#232220' }}>{r}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label style={labelStyle}>NOP</label>
              <select
                value={nop}
                onChange={e => setNop(e.target.value)}
                disabled={!region}
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = '#6a5c4f')}
                onBlur={e => (e.currentTarget.style.borderColor = '#47413a')}
              >
                <option value="" style={{ background: '#232220' }}>— Pilih NOP —</option>
                {nopsForRegion(hierarchy, area, region).map(n => (
                  <option key={n} value={n} style={{ background: '#232220' }}>{n}</option>
                ))}
              </select>
            </div>

            {/* Submit */}
            <div style={{ paddingTop: '6px' }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #C8102E 0%, #8B0000 100%)',
                  color: '#ffffff',
                  fontWeight: '600',
                  fontSize: '1rem',
                  border: 'none',
                  cursor: loading ? 'default' : 'pointer',
                  letterSpacing: '0.01em',
                  transition: 'opacity 0.2s',
                  opacity: loading ? 0.7 : 1,
                }}
                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.opacity = '0.9' }}
                onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </div>

            {/* Link to Sign In */}
            <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#8f8f8a', marginTop: '4px' }}>
              Sudah punya akun?{' '}
              <a href="/signin" style={{ color: '#EC2028', fontWeight: 600, textDecoration: 'none' }}>
                Sign In
              </a>
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
