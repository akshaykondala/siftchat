import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { PipCharacter } from "@/components/pip-character";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button-animated";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: object) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const { saveAuth } = useAuth();
  const [, setLocation] = useLocation();

  // Load Google client ID from server config
  useEffect(() => {
    fetch("/api/auth/config")
      .then(r => r.json())
      .then(d => setGoogleClientId(d.googleClientId ?? null))
      .catch(() => {});
  }, []);

  const handleGoogleCredential = useCallback(async (idToken: string) => {
    setGoogleLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message); setGoogleLoading(false); return; }
      saveAuth(data.token, data.user);
      setLocation("/");
    } catch {
      setError("Google sign-in failed. Try again.");
      setGoogleLoading(false);
    }
  }, [saveAuth, setLocation]);

  // Initialize Google Identity Services once client ID is known
  useEffect(() => {
    if (!googleClientId) return;

    const initGoogle = () => {
      window.google?.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response: { credential: string }) => {
          handleGoogleCredential(response.credential);
        },
      });
    };

    if (window.google?.accounts) {
      initGoogle();
      return;
    }

    // Load GSI script dynamically
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initGoogle;
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, [googleClientId, handleGoogleCredential]);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body = mode === "signup" ? { email, password, name } : { email, password };
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message); setLoading(false); return; }
      saveAuth(data.token, data.user);
      setLocation("/");
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  };

  const triggerGoogleSignIn = () => {
    window.google?.accounts.id.prompt();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 pt-safe-top pb-safe-bottom">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="w-full max-w-sm flex flex-col items-center gap-6"
      >
        <PipCharacter />

        <div className="text-center">
          <h1 className="text-4xl font-black tracking-tight text-foreground">siftchat</h1>
          <p className="text-sm text-muted-foreground mt-1">plan trips together</p>
        </div>

        {/* Tab toggle */}
        <div className="flex bg-secondary/50 rounded-2xl p-1 w-full">
          {(["login", "signup"] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(""); }}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                mode === m
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "login" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>

        <form onSubmit={handle} className="w-full space-y-3">
          <AnimatePresence>
            {mode === "signup" && (
              <motion.div
                key="name"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Input
                  placeholder="Your name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="h-12 rounded-2xl text-base bg-secondary/40 border-transparent focus:bg-background focus:border-primary/20"
                  autoComplete="name"
                />
              </motion.div>
            )}
          </AnimatePresence>
          <Input
            placeholder="Email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="h-12 rounded-2xl text-base bg-secondary/40 border-transparent focus:bg-background focus:border-primary/20"
            autoComplete="email"
          />
          <Input
            placeholder="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="h-12 rounded-2xl text-base bg-secondary/40 border-transparent focus:bg-background focus:border-primary/20"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          {error && (
            <p className="text-sm text-destructive text-center font-medium">{error}</p>
          )}
          <Button
            type="submit"
            size="lg"
            className="w-full rounded-2xl font-semibold h-12"
            isLoading={loading}
            disabled={!email || !password || (mode === "signup" && !name)}
          >
            {mode === "login" ? "Log in" : "Create account"}
          </Button>
        </form>

        {/* Google sign-in */}
        {googleClientId && (
          <div className="w-full space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border/60" />
              <span className="text-xs text-muted-foreground font-medium">or</span>
              <div className="flex-1 h-px bg-border/60" />
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={triggerGoogleSignIn}
              disabled={googleLoading}
              className="w-full h-12 rounded-2xl bg-secondary/50 hover:bg-secondary/80 border border-border/60 flex items-center justify-center gap-3 transition-colors font-semibold text-sm text-foreground disabled:opacity-60"
            >
              {googleLoading ? (
                <span className="text-muted-foreground text-xs animate-pulse">Signing in...</span>
              ) : (
                <>
                  {/* Google "G" icon */}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </>
              )}
            </motion.button>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          {mode === "login" ? "No account?" : "Already have one?"}{" "}
          <button
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
            className="text-primary font-semibold hover:underline"
          >
            {mode === "login" ? "Sign up" : "Log in"}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
