// src/App.tsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated } from './api';
import { ImpersonationProvider } from './contexts/ImpersonationContext';
import LoginPage from './pages/LoginPage';
import OverviewPage from './pages/OverviewPage';
import UsersPage from './pages/UsersPage';
import UserDetailPage from './pages/UserDetailPage';
import TrialsPage from './pages/TrialsPage';
import TicketsPage from './pages/TicketsPage';
import TicketDetailPage from './pages/TicketDetailPage';
import AdminsPage from './pages/AdminsPage';
import SystemHealthPage from './pages/SystemHealthPage';
import AuditLogPage from './pages/AuditLogPage';
import Sidebar from './components/Sidebar';
import ImpersonationBanner from './components/ImpersonationBanner';

function RequireAuth({ children }: { children: React.ReactNode }) {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />;
}

function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell">
      <Sidebar />
      <div className="main-content">
        <ImpersonationBanner />
        {children}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ImpersonationProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAuth><AdminLayout><OverviewPage /></AdminLayout></RequireAuth>} />
          <Route path="/users" element={<RequireAuth><AdminLayout><UsersPage /></AdminLayout></RequireAuth>} />
          <Route path="/users/:id" element={<RequireAuth><AdminLayout><UserDetailPage /></AdminLayout></RequireAuth>} />
          <Route path="/trials" element={<RequireAuth><AdminLayout><TrialsPage /></AdminLayout></RequireAuth>} />
          <Route path="/tickets" element={<RequireAuth><AdminLayout><TicketsPage /></AdminLayout></RequireAuth>} />
          <Route path="/tickets/:id" element={<RequireAuth><AdminLayout><TicketDetailPage /></AdminLayout></RequireAuth>} />
          <Route path="/admins" element={<RequireAuth><AdminLayout><AdminsPage /></AdminLayout></RequireAuth>} />
          <Route path="/system" element={<RequireAuth><AdminLayout><SystemHealthPage /></AdminLayout></RequireAuth>} />
          <Route path="/audit" element={<RequireAuth><AdminLayout><AuditLogPage /></AdminLayout></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ImpersonationProvider>
    </BrowserRouter>
  );
}
