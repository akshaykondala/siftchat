import React, { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useCreateGroup } from "@/hooks/use-groups";
import { Button } from "@/components/ui/button-animated";
import { Input } from "@/components/ui/input";
import { PipCharacter } from "@/components/pip-character";
import { format } from "date-fns";
import { Plus, Calendar, Users, Lock, LogOut, ArrowRight, MapPin, Pencil, X, Trash2, MoreHorizontal, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStoredToken } from "@/hooks/use-auth";

interface TripSummary {
  id: number;
  name: string;
  shareLinkSlug: string;
  createdAt: string | null;
  tripPlan: {
    destination: string | null;
    startDate: string | null;
    endDate: string | null;
    status: string | null;
    committedAttendeeNames: string[] | null;
    likelyAttendeeNames: string[] | null;
  } | null;
}

const GRADIENTS = [
  { from: "#7c3aed", to: "#4f46e5", label: "violet" },
  { from: "#059669", to: "#0d9488", label: "emerald" },
  { from: "#e11d48", to: "#ec4899", label: "rose" },
  { from: "#d97706", to: "#ea580c", label: "amber" },
  { from: "#0284c7", to: "#3b82f6", label: "sky" },
  { from: "#9333ea", to: "#7c3aed", label: "purple" },
  { from: "#65a30d", to: "#16a34a", label: "lime" },
  { from: "#dc2626", to: "#e11d48", label: "red" },
];

const TAPE_COLORS = [
  "bg-yellow-200/70",
  "bg-blue-200/70",
  "bg-pink-200/70",
  "bg-green-200/70",
  "bg-purple-200/70",
];

const DESTINATION_EMOJIS: Record<string, string> = {
  tokyo: "🗼", japan: "🗾", paris: "🗼", france: "🥐",
  nyc: "🗽", "new york": "🗽", london: "🎡", rome: "🏛️",
  italy: "🍕", bali: "🌴", hawaii: "🌺", mexico: "🌮",
  cancun: "🏖️", miami: "🌊", vegas: "🎰", "las vegas": "🎰",
  barcelona: "🥘", spain: "💃", thailand: "🛕", greece: "🏛️",
  santorini: "🫙", portugal: "🐓", lisbon: "🏙️", amsterdam: "🌷",
  dubai: "🏙️", singapore: "🦁", korea: "🇰🇷", seoul: "🏙️",
};

function getDestEmoji(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, emoji] of Object.entries(DESTINATION_EMOJIS)) {
    if (lower.includes(key)) return emoji;
  }
  return "🌍";
}

function tripGradient(seed: string) {
  const n = seed.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRADIENTS[n % GRADIENTS.length];
}

function tapeColor(seed: number) {
  return TAPE_COLORS[seed % TAPE_COLORS.length];
}

function statusConfig(status: string | null) {
  if (status === "Trip locked") return { label: "🔒 Locked", bg: "bg-emerald-500", text: "text-white" };
  if (status === "Almost decided") return { label: "🔥 Almost there", bg: "bg-amber-400", text: "text-white" };
  if (status === "Narrowing options") return { label: "🗺️ Planning", bg: "bg-indigo-400", text: "text-white" };
  return { label: "💬 Just started", bg: "bg-zinc-400", text: "text-white" };
}

function AvatarDefault({ name, size = 8 }: { name: string; size?: number }) {
  const colors = [
    ["#7c3aed", "#4f46e5"],
    ["#059669", "#0d9488"],
    ["#e11d48", "#ec4899"],
    ["#d97706", "#ea580c"],
    ["#0284c7", "#3b82f6"],
    ["#9333ea", "#7c3aed"],
  ];
  const idx = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  const [c1, c2] = colors[idx];
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const px = size * 4;

  return (
    <div
      style={{
        width: px, height: px,
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
        borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "white", fontWeight: 900,
        fontSize: px * 0.35,
        boxShadow: `0 2px 8px ${c1}55`,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

function TripCard({ trip, index, onDeleted, onRenamed }: {
  trip: TripSummary;
  index: number;
  onDeleted: (id: number) => void;
  onRenamed: (id: number, name: string) => void;
}) {
  const [, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(trip.name);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const plan = trip.tripPlan;
  const dest = plan?.destination ?? trip.name;
  const grad = tripGradient(dest);
  const crew = Array.from(new Set([...(plan?.committedAttendeeNames ?? []), ...(plan?.likelyAttendeeNames ?? [])]));
  const status = statusConfig(plan?.status ?? null);
  const locked = plan?.status === "Trip locked";
  const emoji = getDestEmoji(dest);
  const tape = tapeColor(trip.id);

  const dateStr = (() => {
    if (!plan?.startDate) return null;
    if (plan.endDate && plan.endDate !== plan.startDate) return `${plan.startDate} → ${plan.endDate}`;
    return plan.startDate;
  })();

  const rotate = ((trip.id * 7 + index * 3) % 7) - 3;

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    setSaving(true);
    const token = getStoredToken();
    const res = await fetch(`/api/groups/${trip.id}/name`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ name: editName.trim() }),
    });
    if (res.ok) onRenamed(trip.id, editName.trim());
    setSaving(false);
    setEditing(false);
    setMenuOpen(false);
  };

  const handleDelete = async () => {
    const token = getStoredToken();
    const res = await fetch(`/api/groups/${trip.id}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) onDeleted(trip.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, rotate: rotate * 0.4 }}
      animate={{ opacity: 1, y: 0, rotate }}
      whileHover={{ scale: 1.03, rotate: 0, zIndex: 20 }}
      transition={{ duration: 0.4, delay: index * 0.06, type: "spring", stiffness: 260, damping: 22 }}
      className="select-none"
      style={{ transformOrigin: "center bottom", position: "relative" }}
    >
      {/* Tape strip */}
      <div className={cn("absolute -top-3 left-1/2 -translate-x-1/2 w-12 h-5 rounded-sm rotate-1 z-10 opacity-80", tape)} />

      {/* Card */}
      <div
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg overflow-hidden border border-black/5 dark:border-white/10 cursor-pointer"
        style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.13), 0 1px 4px rgba(0,0,0,0.08)" }}
        onClick={() => !menuOpen && !editing && setLocation(`/g/${trip.shareLinkSlug}`)}
      >
        {/* Photo area */}
        <div className="h-36 relative flex flex-col items-center justify-center overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${grad.from}, ${grad.to})` }}
        >
          <div className="absolute inset-0 bg-black/10" />
          <div className="relative text-5xl mb-1 drop-shadow-lg select-none">{emoji}</div>
          <div className="relative text-white font-black text-lg leading-tight drop-shadow-lg text-center px-3 max-w-full truncate">
            {dest}
          </div>
          {locked && (
            <div className="absolute top-2.5 left-2.5 bg-white/20 backdrop-blur-sm rounded-full p-1.5">
              <Lock className="w-3 h-3 text-white" />
            </div>
          )}
          {/* Menu button */}
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); setConfirmDelete(false); }}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/20 hover:bg-black/40 backdrop-blur-sm flex items-center justify-center transition-colors"
          >
            <MoreHorizontal className="w-3.5 h-3.5 text-white" />
          </button>

          {/* Dropdown menu */}
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute top-10 right-2 bg-white dark:bg-zinc-800 rounded-xl shadow-xl border border-border z-30 overflow-hidden min-w-[140px]"
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={() => { setEditing(true); setEditName(trip.name); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-secondary transition-colors text-foreground"
                >
                  <Pencil className="w-3.5 h-3.5" /> Rename
                </button>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-destructive/10 transition-colors text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                ) : (
                  <button
                    onClick={handleDelete}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm bg-destructive/10 hover:bg-destructive/20 transition-colors text-destructive font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Confirm delete
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Caption area */}
        <div className="bg-white dark:bg-zinc-900 p-3 pt-2.5 flex flex-col gap-2">
          {editing ? (
            <form onSubmit={handleRename} className="flex gap-1.5" onClick={e => e.stopPropagation()}>
              <input
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="flex-1 text-xs rounded-lg px-2 py-1 bg-secondary border border-border focus:outline-none focus:border-primary"
              />
              <button type="submit" disabled={saving} className="p-1.5 rounded-lg bg-primary text-white hover:bg-primary/90">
                <Check className="w-3 h-3" />
              </button>
              <button type="button" onClick={() => setEditing(false)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground">
                <X className="w-3 h-3" />
              </button>
            </form>
          ) : (
            <div className="flex items-center justify-between">
              <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", status.bg, status.text)}>
                {status.label}
              </span>
              {trip.createdAt && (
                <span className="text-[10px] text-muted-foreground font-medium">
                  {format(new Date(trip.createdAt), "MMM d")}
                </span>
              )}
            </div>
          )}

          <div className="space-y-1 text-[11px] text-muted-foreground">
            {dateStr && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3 h-3 shrink-0" />
                <span className="font-medium">{dateStr}</span>
              </div>
            )}
            {crew.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Users className="w-3 h-3 shrink-0" />
                <span className="truncate">{crew.slice(0, 3).join(", ")}{crew.length > 3 ? ` +${crew.length - 3}` : ""}</span>
              </div>
            )}
            {!dateStr && !crew.length && (
              <div className="flex items-center gap-1.5 italic opacity-60">
                <MapPin className="w-3 h-3 shrink-0" />
                <span>Just getting started</span>
              </div>
            )}
          </div>

          {!editing && (
            <div className="flex items-center justify-end text-primary text-[11px] font-bold pt-0.5">
              Open <ArrowRight className="w-3 h-3 ml-0.5" />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ProfileModal({ onClose }: { onClose: () => void }) {
  const { user, saveAuth } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const token = getStoredToken();
      const res = await fetch("/api/users/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name, avatarUrl }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message); setLoading(false); return; }
      saveAuth(token!, data);
      onClose();
    } catch {
      setError("Something went wrong.");
    }
    setLoading(false);
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="fixed inset-0 flex items-center justify-center z-40 px-4"
      >
        <div className="bg-card border border-border rounded-3xl p-8 w-full max-w-sm shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-black">Edit Profile</h2>
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-secondary transition-colors text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Avatar preview */}
          <div className="flex justify-center mb-5">
            {avatarUrl ? (
              <img src={avatarUrl} className="w-20 h-20 rounded-full object-cover ring-4 ring-primary/20" alt="avatar" />
            ) : (
              <AvatarDefault name={name || "?"} size={20} />
            )}
          </div>

          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Display Name</label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                className="h-11 rounded-2xl bg-secondary/40 border-transparent focus:bg-background focus:border-primary/20"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Avatar URL <span className="font-normal opacity-60">(optional)</span></label>
              <Input
                value={avatarUrl}
                onChange={e => setAvatarUrl(e.target.value)}
                placeholder="https://..."
                className="h-11 rounded-2xl bg-secondary/40 border-transparent focus:bg-background focus:border-primary/20"
              />
            </div>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button type="submit" className="w-full rounded-2xl h-11 font-semibold" isLoading={loading} disabled={!name.trim()}>
              Save changes
            </Button>
          </form>
        </div>
      </motion.div>
    </>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [tripName, setTripName] = useState("");
  const createGroup = useCreateGroup();
  const queryClient = useQueryClient();

  const { data: tripsData = [], isLoading } = useQuery<TripSummary[]>({
    queryKey: ["/api/users/me/trips"],
    queryFn: async () => {
      const token = getStoredToken();
      const res = await fetch("/api/users/me/trips", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 8000,
  });

  const [localTrips, setLocalTrips] = useState<TripSummary[] | null>(null);
  const trips = localTrips ?? tripsData;

  // Sync local state when server data updates
  const prevDataRef = React.useRef(tripsData);
  if (prevDataRef.current !== tripsData) {
    prevDataRef.current = tripsData;
    setLocalTrips(null);
  }

  const handleTripDeleted = (id: number) => {
    setLocalTrips(trips.filter(t => t.id !== id));
  };

  const handleTripRenamed = (id: number, name: string) => {
    setLocalTrips(trips.map(t => t.id === id ? { ...t, name } : t));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tripName.trim() || !user) return;
    try {
      const group = await createGroup.mutateAsync({ name: tripName });
      const token = getStoredToken();
      const joinRes = await fetch(`/api/groups/${group.shareLinkSlug}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: user.name }),
      });
      if (joinRes.ok) {
        const participant = await joinRes.json();
        localStorage.setItem(`evite_participant_${group.shareLinkSlug}`, String(participant.id));
      }
      // Invalidate so dashboard refreshes immediately on back-navigate
      queryClient.invalidateQueries({ queryKey: ["/api/users/me/trips"] });
      setShowNewTrip(false);
      setTripName("");
      setLocation(`/g/${group.shareLinkSlug}`);
    } catch { /* handled in hook */ }
  };

  const lockedCount = trips.filter(t => t.tripPlan?.status === "Trip locked").length;
  const upcomingCount = trips.filter(t => t.tripPlan?.startDate).length;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden" style={{
      backgroundImage: `radial-gradient(circle at 20% 20%, rgba(124,58,237,0.04) 0%, transparent 50%),
                        radial-gradient(circle at 80% 80%, rgba(79,70,229,0.04) 0%, transparent 50%)`,
    }}>
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border/50 px-6 pb-3 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between">
        <button
          onClick={() => setShowProfile(true)}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity group"
        >
          <div className="relative">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} className="w-9 h-9 rounded-full object-cover ring-2 ring-primary/20" alt={user.name} />
            ) : (
              <AvatarDefault name={user?.name ?? "?"} size={9} />
            )}
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-background rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border border-border">
              <Pencil className="w-2.5 h-2.5 text-muted-foreground" />
            </div>
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-foreground leading-tight">{user?.name}</div>
            <div className="text-[10px] text-muted-foreground">{user?.email}</div>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setShowNewTrip(true)}
            className="rounded-xl gap-1.5 h-8 text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> New Trip
          </Button>
          <button
            onClick={() => { logout(); setLocation("/login"); }}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto scrollbar-hide"><div className="max-w-5xl mx-auto px-6 py-6 sm:py-10 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {/* Hero */}
        <div className="flex items-start justify-between mb-6 sm:mb-10 gap-4">
          <div>
            <motion.h1
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-4xl font-black text-foreground tracking-tight"
              style={{ fontFamily: "Georgia, serif", letterSpacing: "-0.02em" }}
            >
              My Trips
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-muted-foreground text-sm mt-1.5"
            >
              {trips.length === 0
                ? "No trips yet — start planning with your crew!"
                : `${trips.length} trip${trips.length !== 1 ? "s" : ""} · ${lockedCount} locked · ${upcomingCount} with dates`}
            </motion.p>
          </div>
          <div className="shrink-0">
            <PipCharacter speeches={[
              "Where to next? 🗺️",
              "So many trips, so little time!",
              "Let's go somewhere amazing!",
              "Adventure is calling! 🌎",
              "Pick a trip and let's plan!",
            ]} />
          </div>
        </div>

        {/* Trip grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10 pt-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-64 rounded-lg bg-secondary/40 animate-pulse" />
            ))}
          </div>
        ) : trips.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-24 gap-4 text-center"
          >
            <div className="text-6xl">🌍</div>
            <div>
              <p className="font-bold text-foreground text-lg">No trips yet</p>
              <p className="text-sm text-muted-foreground mt-1">Hit "New Trip" and start planning with your crew</p>
            </div>
            <Button onClick={() => setShowNewTrip(true)} className="rounded-xl gap-1.5 mt-2">
              <Plus className="w-4 h-4" /> Start a Trip
            </Button>
          </motion.div>
        ) : (
          // Extra padding-top so tape strips don't clip
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-10 pt-4">
            {trips.map((trip, i) => (
              <TripCard key={trip.id} trip={trip} index={i} onDeleted={handleTripDeleted} onRenamed={handleTripRenamed} />
            ))}
          </div>
        )}
      </div></main>

      {/* Profile modal */}
      <AnimatePresence>
        {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      </AnimatePresence>

      {/* New trip modal */}
      <AnimatePresence>
        {showNewTrip && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30"
              onClick={() => setShowNewTrip(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="fixed inset-0 flex items-center justify-center z-40 px-4"
            >
              <div className="bg-card border border-border rounded-3xl p-8 w-full max-w-sm shadow-2xl">
                <div className="text-3xl mb-2">🗺️</div>
                <h2 className="text-xl font-black mb-1">New Trip</h2>
                <p className="text-sm text-muted-foreground mb-5">Give it a name — destination, vibe, anything.</p>
                <form onSubmit={handleCreate} className="space-y-3">
                  <Input
                    placeholder="e.g. Tokyo Summer 🗼"
                    value={tripName}
                    onChange={e => setTripName(e.target.value)}
                    className="h-12 rounded-2xl text-base bg-secondary/40 border-transparent focus:bg-background focus:border-primary/20"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 rounded-2xl h-11"
                      onClick={() => { setShowNewTrip(false); setTripName(""); }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 rounded-2xl h-11 font-semibold"
                      isLoading={createGroup.isPending}
                      disabled={!tripName.trim()}
                    >
                      Let's go <ArrowRight className="ml-1 w-4 h-4" />
                    </Button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
