import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setToken, getToken } from "@/src/api/client";

export type User = {
  id: string;
  full_name: string;
  username: string;
  avatar?: string | null;
  cover?: string | null;
  bio?: string | null;
  location?: string | null;
  verified: boolean;
  privacy: string;
  email?: string | null;
  phone?: string | null;
  is_admin?: boolean;
  counts?: { saved: number; friends: number; posts: number };
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  signedIn: boolean;
  refresh: () => Promise<void>;
  loginWithToken: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
};

const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        setUserState(null);
        return;
      }
      const me = await api.get("/users/me");
      setUserState(me);
    } catch {
      await setToken(null);
      setUserState(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const loginWithToken = useCallback(async (token: string, u: User) => {
    await setToken(token);
    setUserState(u);
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await setToken(null);
    setUserState(null);
  }, []);

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        signedIn: !!user,
        refresh,
        loginWithToken,
        logout,
        setUser: setUserState,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
