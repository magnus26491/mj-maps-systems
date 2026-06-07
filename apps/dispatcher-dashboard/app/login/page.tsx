'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.login(email, password);
      if (res.ok) {
        document.cookie = `mjtoken=${res.data.token}; path=/; max-age=43200; SameSite=Lax`;
        router.push('/');
      }
    } catch (err: any) {
      setError(err.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl bg-gray-900 p-8 shadow-xl border border-gray-800">
        <h1 className="mb-1 text-2xl font-bold tracking-tight">MJ Maps</h1>
        <p className="mb-6 text-sm text-gray-400">Dispatcher sign in</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email" required placeholder="Email"
            value={email} onChange={e => setEmail(e.target.value)}
            className="rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password" required placeholder="Password"
            value={password} onChange={e => setPassword(e.target.value)}
            className="rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit" disabled={loading}
            className="rounded-lg bg-blue-600 hover:bg-blue-500 py-2.5 text-sm font-semibold transition disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}