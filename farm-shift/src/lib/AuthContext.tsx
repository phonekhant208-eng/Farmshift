"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { fetchMe, logoutUser } from "./authApi";

type AuthUser = { username: string } | null;
type AuthCtx = {
  user: AuthUser;
  loading: boolean;
  setUser: (u: AuthUser) => void;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({ user: null, loading: true, setUser: () => {}, signOut: async () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMe().then((u) => { setUser(u); setLoading(false); });
  }, []);

  const signOut = async () => { await logoutUser(); setUser(null); };

  return <Ctx.Provider value={{ user, loading, setUser, signOut }}>{children}</Ctx.Provider>;
}