// src/contexts/ImpersonationContext.tsx
// Global impersonation state — persists via sessionStorage so it survives page reloads.
// The impersonation token is stored separately from the admin token and has its own TTL.

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export interface ImpersonationSession {
  token: string;
  sessionId: string;
  expiresAt: string;
  impersonatedUser: {
    id: string;
    email: string;
    role: string;
  };
}

interface ImpersonationContextValue {
  session: ImpersonationSession | null;
  isImpersonating: boolean;
  startImpersonation: (session: ImpersonationSession) => void;
  endImpersonation: () => void;
}

const ImpersonationContext = createContext<ImpersonationContextValue>({
  session: null,
  isImpersonating: false,
  startImpersonation: () => {},
  endImpersonation: () => {},
});

export function ImpersonationProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<ImpersonationSession | null>(() => {
    try {
      const raw = sessionStorage.getItem('mj_impersonation');
      if (!raw) return null;
      const parsed: ImpersonationSession = JSON.parse(raw);
      if (new Date(parsed.expiresAt) < new Date()) {
        sessionStorage.removeItem('mj_impersonation');
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });

  const startImpersonation = useCallback((s: ImpersonationSession) => {
    setSession(s);
    sessionStorage.setItem('mj_impersonation', JSON.stringify(s));
  }, []);

  const endImpersonation = useCallback(() => {
    setSession(null);
    sessionStorage.removeItem('mj_impersonation');
  }, []);

  return (
    <ImpersonationContext.Provider value={{ session, isImpersonating: !!session, startImpersonation, endImpersonation }}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation(): ImpersonationContextValue {
  return useContext(ImpersonationContext);
}

export function getActiveImpersonationToken(): string | null {
  try {
    const raw = sessionStorage.getItem('mj_impersonation');
    if (!raw) return null;
    const parsed: ImpersonationSession = JSON.parse(raw);
    if (new Date(parsed.expiresAt) < new Date()) return null;
    return parsed.token;
  } catch {
    return null;
  }
}
