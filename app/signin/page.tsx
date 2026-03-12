"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8001/v1';

export default function SignIn() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ type: ToastType; message: string } | null>(null);
  const router = useRouter();

  const showToast = (type: ToastType, message: string) => setToast({ type, message });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        const data = await res.json();
        const token: string = data?.access_token ?? '';
        if (token) localStorage.setItem('access_token', token);
        showToast('success', 'Login berhasil! Mengarahkan ke halaman chatbot...');
        setTimeout(() => router.push('/chat'), 1200);
        return;
      }

      // 422 — FastAPI validation errors
      if (res.status === 422) {
        const body = await res.json().catch(() => null);
        const fe: Record<string, string> = {};
        (body?.detail ?? []).forEach((d: any) => {
          const loc: string[] = d?.loc ?? [];
          if (loc.length >= 2) fe[String(loc[1])] = d?.msg ?? 'Invalid value';
        });
        setFieldErrors(fe);
        showToast('error', 'Input tidak valid, periksa kembali form anda.');
        return;
      }

      // 401 / other errors
      const body = await res.json().catch(() => null);
      const reason = typeof body?.detail === 'string'
        ? body.detail
        : `Login gagal (status ${res.status})`;
      showToast('error', reason);

    } catch (err: any) {
      showToast('error', err?.message === 'Failed to fetch'
        ? 'Tidak dapat menghubungi server. Pastikan backend berjalan di port 8001.'
        : (err?.message ?? 'Terjadi kesalahan jaringan.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-screen h-screen" style={{ fontFamily: 'Poppins, sans-serif', overflow: 'hidden' }}>

      {/* Toast */}
      {toast && (
        <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
      )}

      {/* ══════════════════ LEFT PANEL ══════════════════ */}
      <aside
        className="flex w-1/2 relative overflow-hidden flex-col"
        style={{
          background: 'linear-gradient(160deg, #FFB3B3 0%, #FF8690 30%, #FF5C6A 65%, #E8001C 100%)',
          height: '100vh',
        }}
      >

        {/* ─── Telkomsel Logo (top-left) ─── */}
        <div
          className="absolute z-10"
          style={{ top: '40px', left: '40px' }}
        >
          <Image
            src="/telkomsel.png"
            alt="Telkomsel"
            width={300}
            height={44}
            style={{
              objectFit: 'contain',
              objectPosition: 'left center',
            }}
            priority
          />
        </div>


        {/* ─── Large Tsel mark — centered ─── */}
        <div
          className="absolute pointer-events-none"
          style={{ zIndex: 1, top: '80px', left: 0, right: 0 }}
        >
          <Image
            src="/tsel.svg"
            alt=""
            width={520}
            height={832}
            style={{
              objectFit: 'contain',
              width: '70%',
              height: 'auto',
              opacity: 0.27,
              display: 'block',
            }}
            aria-hidden="true"
          />
        </div>


        {/* ─── Bottom text ─── */}
        <div
          className="absolute bottom-10 left-10 z-10"
        >
          <p
            className="font-semibold leading-snug"
            style={{
              fontSize: '2.5rem',
              fontWeight: 550,
              color: '#ffffff',
              maxWidth: '900px',
              paddingTop:'700px',
              paddingLeft:'40px'
            }}
          >
            Empowering Modern Work Through Intelligent Conversations.
          </p>
        </div>

      </aside>

      {/* ══════════════════ RIGHT PANEL ══════════════════ */}
      <main
        className="flex flex-1 items-center justify-center px-10 py-12"
        style={{ background: '#ffffff', height: '100vh', overflowY: 'auto' }}
      >
        <div style={{ width: '100%', maxWidth: '360px' }}>

          {/* Title */}
          <h2
            className="text-center font-bold mb-2"
            style={{ fontSize: '2.25rem', color: '#111111', letterSpacing: '0.01em' }}
          >
            Sign In
          </h2>
          <div
            className="mx-auto mb-10"
            style={{ width: '40px', height: '3px', background: '#111111', borderRadius: '99px' }}
          />

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Email */}
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                name="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter your email address"
                required
                style={{
                  width: '100%',
                  border: 'none',
                  borderBottom: '1.5px solid #d1d5db',
                  padding: '10px 36px 10px 0',
                  fontSize: '0.875rem',
                  color: '#374151',
                  background: 'transparent',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={e => (e.currentTarget.style.borderBottomColor = '#111111')}
                onBlur={e => (e.currentTarget.style.borderBottomColor = '#d1d5db')}
              />
              {fieldErrors.email ? (
                <div style={{ color: '#ff4444', fontSize: '0.85rem', marginTop: 6 }}>{fieldErrors.email}</div>
              ) : null}
              {/* Mail icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}
                width="18" height="18" fill="none" viewBox="0 0 24 24"
                stroke="#9ca3af" strokeWidth="1.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25H4.5a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5H4.5a2.25 2.25 0 00-2.25 2.25m19.5 0l-9.75 6.75L2.25 6.75" />
              </svg>
            </div>

            {/* Password */}
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                minLength={1}
                style={{
                  width: '100%',
                  border: 'none',
                  borderBottom: '1.5px solid #d1d5db',
                  padding: '10px 36px 10px 0',
                  fontSize: '0.875rem',
                  color: '#374151',
                  background: 'transparent',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={e => (e.currentTarget.style.borderBottomColor = '#111111')}
                onBlur={e => (e.currentTarget.style.borderBottomColor = '#d1d5db')}
              />
              {fieldErrors.password ? (
                <div style={{ color: '#ff4444', fontSize: '0.85rem', marginTop: 6 }}>{fieldErrors.password}</div>
              ) : null}
              {/* Lock / eye toggle */}
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Sign In button — orange sesuai design */}
            <div style={{ paddingTop: '8px' }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'linear-gradient(90deg, #FE6C11 0%, #FF4400 100%)',
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
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </div>
          </form>

          <p
            className="text-center text-sm mt-6"
            style={{ color: '#4D5959' }}
          >
            Already have an account?{' '}
            <span style={{ color: '#FF4400', fontWeight: 600 }}>Please Chat Your Admin.</span>
          </p>
        </div>
      </main>

    </div>
  );
}