import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MJ Maps — Dispatcher Console',
  description: 'Live fleet management, turn alerts, and route intelligence',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark h-full">
      <body className="h-full bg-[#171614] text-[#cdccca] antialiased">
        {children}
      </body>
    </html>
  );
}
