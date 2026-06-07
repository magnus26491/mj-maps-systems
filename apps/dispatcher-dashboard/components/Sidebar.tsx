'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Truck, AlertTriangle, BarChart2, PlusCircle, Settings } from 'lucide-react';
import { clsx } from 'clsx';

const NAV = [
  { href: '/',          label: 'Overview',    icon: LayoutDashboard },
  { href: '/drivers',  label: 'Drivers',      icon: Truck },
  { href: '/failed',   label: 'Failed Stops', icon: AlertTriangle },
  { href: '/analytics',label: 'Analytics',    icon: BarChart2 },
  { href: '/create',   label: 'New Route',     icon: PlusCircle },
  { href: '/settings', label: 'Settings',      icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="px-5 py-4 border-b border-gray-800">
        <span className="text-lg font-bold tracking-tight">MJ Maps</span>
        <span className="ml-2 rounded bg-blue-900/60 px-1.5 py-0.5 text-xs font-medium text-blue-300">Dispatch</span>
      </div>
      <nav className="flex-1 px-2 py-4 flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className={clsx(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
              pathname === href
                ? 'bg-blue-600/20 text-blue-300'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white',
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}