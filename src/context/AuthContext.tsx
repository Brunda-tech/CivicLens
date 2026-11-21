import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setAuthToken } from '../services/api';
import type { OfficerUser } from '../types/civiclens';

interface AuthContextValue {
  officer: OfficerUser | null;
  loading: boolean;
  loginOfficer: (email: string, password: string) => Promise<OfficerUser>;
  registerOfficer: (payload: {
    name: string;
    email: string;
    password: string;
    department: string;
    inviteCode: string;
  }) => Promise<OfficerUser>;
  logoutOfficer: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [officer, setOfficer] = useState<OfficerUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then((res) => setOfficer(res.officer))
      .catch(() => {
        setOfficer(null);
        setAuthToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const loginOfficer = useCallback(async (email: string, password: string) => {
    const data = await api.login({ email, password });
    setOfficer(data.officer);
    return data.officer;
  }, []);

  const registerOfficer = useCallback(
    async (payload: {
      name: string;
      email: string;
      password: string;
      department: string;
      inviteCode: string;
    }) => {
      const data = await api.register(payload);
      setOfficer(data.officer);
      return data.officer;
    },
    []
  );

  const logoutOfficer = useCallback(async () => {
    await api.logout();
    setOfficer(null);
  }, []);

  return (
    <AuthContext.Provider value={{ officer, loading, loginOfficer, registerOfficer, logoutOfficer }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
