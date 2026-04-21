import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence, LayoutGroup, useDragControls } from "framer-motion";
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

function GlobeRings() {
  return (
    <div
      className="absolute pointer-events-none"
      style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 300, height: 300 }}
    >
      <svg width="300" height="300" viewBox="0 0 300 300">
        {/* Outer halo */}
        <circle cx="150" cy="150" r="138" fill="rgba(139,92,246,0.05)" stroke="rgba(167,139,250,0.1)" strokeWidth="1.5" />
        <circle cx="150" cy="150" r="100" fill="none" stroke="rgba(167,139,250,0.05)" strokeWidth="1" strokeDasharray="2 6" />

        {/* Ring 1 — equatorial, slow CW, dashed */}
        <motion.g
          style={{ transformOrigin: "150px 150px" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
        >
          <ellipse cx="150" cy="150" rx="138" ry="32" stroke="rgba(167,139,250,0.32)" strokeWidth="1" fill="none" strokeDasharray="5 8" />
          <circle cx="288" cy="150" r="6" fill="#c4b5fd" />
        </motion.g>

        {/* Ring 2 — tilted start ~40°, medium CCW */}
        <motion.g
          style={{ transformOrigin: "150px 150px" }}
          animate={{ rotate: [40, 40 - 360] }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        >
          <ellipse cx="150" cy="150" rx="138" ry="32" stroke="rgba(139,92,246,0.38)" strokeWidth="1.2" fill="none" />
          <circle cx="288" cy="150" r="5" fill="#7c3aed" />
        </motion.g>

        {/* Ring 3 — opposite tilt ~-40°, slow CW */}
        <motion.g
          style={{ transformOrigin: "150px 150px" }}
          animate={{ rotate: [-40, -40 + 360] }}
          transition={{ duration: 32, repeat: Infinity, ease: "linear" }}
        >
          <ellipse cx="150" cy="150" rx="138" ry="32" stroke="rgba(109,40,217,0.2)" strokeWidth="1" fill="none" strokeDasharray="3 11" />
          <circle cx="12" cy="150" r="4" fill="#6d28d9" opacity="0.7" />
        </motion.g>

        {/* Ring 4 — near-vertical meridian, very slow */}
        <motion.g
          style={{ transformOrigin: "150px 150px" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 42, repeat: Infinity, ease: "linear" }}
        >
          <ellipse cx="150" cy="150" rx="32" ry="138" stroke="rgba(167,139,250,0.12)" strokeWidth="1" fill="none" strokeDasharray="4 10" />
        </motion.g>
      </svg>
    </div>
  );
}

export default function AuthPage() {
  const [phase, setPhase] = useState<"splash" | "form">("splash");
  const dragControls = useDragControls();
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

  useEffect(() => {
    if (!googleClientId) return;
    const initGoogle = () => {
      window.google?.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response: { credential: string }) => handleGoogleCredential(response.credential),
      });
    };
    if (window.google?.accounts) { initGoogle(); return; }
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

  const triggerGoogleSignIn = () => window.google?.accounts.id.prompt();

  return (
    <LayoutGroup>
      <div className="h-screen overflow-hidden bg-gradient-to-br from-indigo-950 via-violet-950 to-purple-900 relative">

        {/* ── SPLASH ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {phase === "splash" && (
            <motion.div
              key="splash"
              className="absolute inset-0 flex flex-col items-center justify-center z-10"
              exit={{ opacity: 0, transition: { duration: 0.35 } }}
            >
              {/* Globe rings centered on Pip */}
              <GlobeRings />

              {/* Pip — big, centered, layoutId so it flies to form */}
              <motion.div layoutId="pip-char" animate={{ scale: 1.35 }} className="relative z-20">
                <PipCharacter />
              </motion.div>

              {/* Tagline + CTA below the globe */}
              <div className="text-center mt-14 px-8 z-20">
                <motion.h1
                  className="text-4xl font-black text-white tracking-tight"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                >
                  siftchat
                </motion.h1>
                <motion.p
                  className="text-violet-300 mt-2 text-base font-medium"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45, duration: 0.5 }}
                >
                  make the trip actually happen
                </motion.p>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 0.5 }}
                  className="mt-8"
                >
                  <motion.button
                    onClick={() => setPhase("form")}
                    whileTap={{ scale: 0.94 }}
                    className="px-10 py-3.5 rounded-full bg-white text-violet-900 font-bold text-sm shadow-lg hover:bg-violet-50 transition-colors"
                  >
                    let's go →
                  </motion.button>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── FORM ───────────────────────────────────────────────── */}
        {/* Pip above the card — always rendered in form phase, outside AnimatePresence so layoutId can resolve */}
        {phase === "form" && (
          <div
            className="absolute left-0 right-0 flex items-end justify-center z-20"
            style={{ top: 0, bottom: "65vh", paddingBottom: 10 }}
          >
            <motion.div layoutId="pip-char" animate={{ scale: 1.0 }}>
              <PipCharacter />
            </motion.div>
          </div>
        )}

        <AnimatePresence>
          {phase === "form" && (
              <motion.div
                key="form-card"
                className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[32px] shadow-2xl flex flex-col overflow-hidden"
                style={{ height: "65vh" }}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 32, delay: 0.12 }}
                drag="y"
                dragControls={dragControls}
                dragListener={false}
                dragConstraints={{ top: 0 }}
                dragElastic={{ top: 0, bottom: 0.25 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 80 || info.velocity.y > 400) {
                    setPhase("splash");
                  }
                }}
              >
                {/* Drag handle — initiates drag on the whole card */}
                <div
                  className="flex justify-center pt-3 pb-2 shrink-0 cursor-grab active:cursor-grabbing touch-none"
                  onPointerDown={(e) => dragControls.start(e)}
                >
                  <div className="w-10 h-1 rounded-full bg-slate-300" />
                </div>

                <div className="flex-1 overflow-y-auto px-6 pb-6">
                  <div className="flex flex-col gap-4 pt-2">
                    <div className="text-center">
                      <h1 className="text-2xl font-black text-foreground tracking-tight">siftchat</h1>
                      <p className="text-xs text-muted-foreground mt-0.5">make the trip actually happen</p>
                    </div>

                    {/* Tab toggle */}
                    <div className="flex bg-secondary/50 rounded-2xl p-1">
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

                    <form onSubmit={handle} className="space-y-3">
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
                      {error && <p className="text-sm text-destructive text-center font-medium">{error}</p>}
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

                    {googleClientId && (
                      <div className="space-y-3">
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

                    <p className="text-xs text-muted-foreground text-center pb-2">
                      {mode === "login" ? "No account?" : "Already have one?"}{" "}
                      <button
                        onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
                        className="text-primary font-semibold hover:underline"
                      >
                        {mode === "login" ? "Sign up" : "Log in"}
                      </button>
                    </p>
                  </div>
                </div>
              </motion.div>
          )}
        </AnimatePresence>

      </div>
    </LayoutGroup>
  );
}
