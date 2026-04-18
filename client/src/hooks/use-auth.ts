import { useState, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

const TOKEN_KEY = "siftchat_token";
const USER_KEY = "siftchat_user";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser);
  const [token, setToken] = useState<string | null>(getStoredToken);

  const saveAuth = useCallback((t: string, u: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setToken(t);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    queryClient.clear();
  }, []);

  return { user, token, isLoggedIn: !!token, saveAuth, logout };
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
