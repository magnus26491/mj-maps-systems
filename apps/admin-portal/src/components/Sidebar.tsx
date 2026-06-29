// src/components/Sidebar.tsx
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { logout, getStoredUser, isOwner } from '../api';

interface NavBadge { count?: number; variant?: 'teal' | 'red'; }

function NavIcon({ path }: { path: string }) {
  const icons: Record<string, React.ReactNode> = {
    '/':        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
    '/users':   <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    '/trials':  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    '/tickets': <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
    '/admins':  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    '/system':  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    '/audit':   <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>,
  };
  return <>{icons[path] ?? <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>}</>;
}

export default function Sidebar() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const owner = isOwner();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">MJ Maps Admin</div>
      <nav className="sidebar-nav">
        <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <NavIcon path="/" /> Overview
        </NavLink>

        <div className="nav-section-label">Management</div>

        <NavLink to="/users" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <NavIcon path="/users" /> Users
        </NavLink>
        <NavLink to="/trials" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <NavIcon path="/trials" /> Trials
        </NavLink>
        <NavLink to="/tickets" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <NavIcon path="/tickets" /> Support
        </NavLink>

        {owner && (
          <>
            <div className="nav-section-label">Security</div>
            <NavLink to="/admins" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <NavIcon path="/admins" /> Admins
            </NavLink>
          </>
        )}

        <div className="nav-section-label">Diagnostics</div>
        <NavLink to="/system" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <NavIcon path="/system" /> System Health
        </NavLink>
        <NavLink to="/audit" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <NavIcon path="/audit" /> Audit Log
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <div className="user-email">{user?.email}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)', marginTop: '0.25rem', fontFamily: 'var(--font-mono)' }}>
          {owner ? 'Owner' : 'Admin'}
        </div>
        <button onClick={handleLogout}>Sign out</button>
      </div>
    </aside>
  );
}