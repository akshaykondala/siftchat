import { useState, useEffect, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

const TOKEN_KEY = "siftchat_token";
const USER_KEY = "siftchat_user";

// Module-level store so all hook instances share the same state
type Listener = () => void;
const listeners = new Set<Listener>();
let _token: string | null = localStorage.getItem(TOKEN_KEY);
let _user: AuthUser | null = (() => {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; }
})();

function notify() { listeners.forEach(l => l()); }

export function getStoredToken(): string | null { return _token; }
export function getStoredUser(): AuthUser | null { return _user; }

export function useAuth() {
  const [, rerender] = useState(0);

  useEffect(() => {
    const listener = () => rerender(n => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const saveAuth = useCallback((t: string, u: AuthUser) => {
    _token = t;
    _user = u;
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    notify();
  }, []);

  const logout = useCallback(() => {
    _token = null;
    _user = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    queryClient.clear();
    notify();
  }, []);

  return { user: _user, token: _token, isLoggedIn: !!_token, saveAuth, logout };
}

// Attach token to fetch requests
export function authedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}
