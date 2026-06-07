'use client';
import { useState } from 'react';
import { api } from '../../lib/api';
import Sidebar from '../../components/Sidebar';
import { useQuery } from '@tanstack/react-query';

export default function SettingsPage() {
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: api.me });
  const [fcmToken, setFcmToken] = useState('');
  const [saved, setSaved] = useState(false);

  async function saveFcmToken() {
    const token = document.cookie.match(/mjtoken=([^;]+)/)?.[1] ?? '';
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/dispatcher/fcm-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fcmToken }),
    });
    setSaved(true);
  }

  const user = me?.data;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-56 flex-1 p-6 max-w-lg">
        <h1 className="text-xl font-bold mb-6">Settings</h1>
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5 mb-4">
          <h2 className="text-sm font-semibold mb-3 text-gray-300">Account</h2>
          <p className="text-sm text-gray-400">Name: <span className="text-white">{user?.name ?? '—'}</span></p>
          <p className="text-sm text-gray-400 mt-1">Email: <span className="text-white">{user?.email ?? '—'}</span></p>
          <p className="text-sm text-gray-400 mt-1">Role: <span className="text-white capitalize">{user?.role ?? '—'}</span></p>
          <p className="text-sm text-gray-400 mt-1">Plan: <span className="text-white uppercase">{user?.planId ?? '—'}</span></p>
        </div>
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <h2 className="text-sm font-semibold mb-1 text-gray-300">Push Notifications</h2>
          <p className="text-xs text-gray-500 mb-3">Register this device to receive FCM overload and failed-delivery alerts.</p>
          <input value={fcmToken} onChange={e => setFcmToken(e.target.value)}
            placeholder="FCM device registration token"
            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono" />
          <button onClick={saveFcmToken} disabled={!fcmToken}
            className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-medium disabled:opacity-50 transition">
            {saved ? '✅ Saved' : 'Save token'}
          </button>
        </div>
      </main>
    </div>
  );
}