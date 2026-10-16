import {queryClient} from "@/src/query-client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { AppState } from "react-native";
import { api, setToken, getToken, setRestrictedToken } from "@/src/api/client";

export type User = {
  verification_badge?: string;
  manual_badge_expires_at?: string | null;
  id: string;
  full_name: string;
  username: string;
  avatar?: string | null;
  cover?: string | null;
  bio?: string | null;
  location?: string | null;
  date_of_birth?: string | null;
  country_code?: string | null;
  sparks?: number;
  verified: boolean;
  blue_tick_active?: boolean;
  external_links?: {label: string; url: string}[];
  privacy: string;
  email?: string | null;
  phone?: string | null;
  is_admin?: boolean;
  contact_visibility?: string;
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

  useEffect(() => {
    if (!user?.id || !user.manual_badge_expires_at) return;
    const delay = Date.parse(user.manual_badge_expires_at) - Date.now();
    if (!Number.isFinite(delay)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const syncExpiry = async () => {
      try {
        const me = await api.get("/users/me");
        if (!cancelled) {
          setUserState(me);
          await queryClient.invalidateQueries();
        }
      } catch {
        if (!cancelled) {
          await queryClient.invalidateQueries({ queryKey: ["blue-entitlements"] });
          timer = setTimeout(syncExpiry, 30_000);
        }
      }
    };
    const schedule = () => {
      const remaining = Date.parse(user.manual_badge_expires_at!) - Date.now();
      if (remaining > 2147483547) {
        timer = setTimeout(schedule, 2147483547);
      } else {
        timer = setTimeout(syncExpiry, Math.max(0, remaining) + 100);
      }
    };
    schedule();
    const listener = AppState.addEventListener("change", state => {
      if (state === "active" && Date.parse(user.manual_badge_expires_at!) <= Date.now()) {
        clearTimeout(timer);
        void syncExpiry();
      }
    });
    return () => { cancelled = true; clearTimeout(timer); listener.remove(); };
  }, [user?.id, user?.manual_badge_expires_at]);

  const loginWithToken = useCallback(async (token: string, u: User) => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await setRestrictedToken(null);
    await setToken(token);
    setUserState(u);
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
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
