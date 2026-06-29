'use client';

import { useState, useEffect, FormEvent } from 'react';
import { login, isLoggedIn } from '@/lib/auth';

export default function LoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (isLoggedIn()) {
      window.location.href = '/dispatcher';
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { role, planId } = await login(email, password);
      if (role !== 'dispatcher' && role !== 'admin') {
        throw new Error('This account does not have dispatcher access. Ask your admin to set your role to dispatcher, or log in with an admin account.');
      }
      window.location.href = '/dispatcher';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1117] p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-[#00c2a8] flex items-center justify-center flex-shrink-0">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M4 17L8.5 6L11 12L13.5 8.5L18 17" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="18" cy="6.5" r="2" fill="white" fillOpacity="0.75"/>
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-100 leading-tight">MJ Maps Systems</div>
            <div className="text-xs text-zinc-500 leading-tight">Dispatcher Console</div>
          </div>
        </div>

        {/* Card */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-8">
          <h1 className="text-xl font-bold text-zinc-100 mb-1">Sign in</h1>
          <p className="text-sm text-zinc-500 mb-6">Dispatcher and admin accounts only.</p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl text-zinc-100 text-sm px-3.5 py-2.5 outline-none focus:border-[#00c2a8] transition-colors placeholder:text-zinc-600"
              />
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl text-zinc-100 text-sm px-3.5 py-2.5 outline-none focus:border-[#00c2a8] transition-colors placeholder:text-zinc-600"
              />
            </div>

            {error && (
              <div className="mb-4 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#00c2a8] hover:bg-[#009e88] disabled:opacity-60 text-[#0d1117] font-bold text-sm rounded-xl py-2.5 transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign in to Dashboard'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-zinc-600 mt-5">
          Driver? <a href="/driver" className="text-[#00c2a8] hover:underline">Open the driver app</a>
        </p>
      </div>
    </div>
  );
}
