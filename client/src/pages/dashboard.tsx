import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useCreateGroup } from "@/hooks/use-groups";
import { Button } from "@/components/ui/button-animated";
import { Input } from "@/components/ui/input";
import { PipCharacter } from "@/components/pip-character";
import { format, parseISO, isValid } from "date-fns";
import { Plus, MapPin, Calendar, Users, Lock, Plane, LogOut, ArrowRight } from "lucide-react";
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

// Deterministic gradient per destination string
const GRADIENTS = [
  "from-violet-400 to-indigo-500",
  "from-emerald-400 to-teal-500",
  "from-rose-400 to-pink-500",
  "from-amber-400 to-orange-500",
  "from-sky-400 to-blue-500",
  "from-fuchsia-400 to-purple-500",
  "from-lime-400 to-green-500",
  "from-red-400 to-rose-600",
];

function tripGradient(seed: string) {
  const n = seed.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRADIENTS[n % GRADIENTS.length];
}

function statusLabel(status: string | null) {
  if (status === "Trip locked") return { label: "Locked", color: "bg-emerald-500 text-white" };
  if (status === "Almost decided") return { label: "Almost there", color: "bg-amber-400 text-white" };
  if (status === "Narrowing options") return { label: "Planning", color: "bg-indigo-400 text-white" };
  return { label: "Just started", color: "bg-zinc-400 text-white" };
}

function TripCard({ trip, index }: { trip: TripSummary; index: number }) {
  const [, setLocation] = useLocation();
  const plan = trip.tripPlan;
  const dest = plan?.destination ?? trip.name;
  const gradient = tripGradient(dest);
  const crew = Array.from(new Set([...(plan?.committedAttendeeNames ?? []), ...(plan?.likelyAttendeeNames ?? [])]));
  const status = statusLabel(plan?.status ?? null);
  const locked = plan?.status === "Trip locked";

  const dateStr = (() => {
    if (!plan?.startDate) return null;
    if (plan.endDate && plan.endDate !== plan.startDate) return `${plan.startDate} → ${plan.endDate}`;
    return plan.startDate;
  })();

  // Slight random rotation for scrapbook feel (deterministic from id)
  const rotate = ((trip.id * 7 + index * 3) % 5) - 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, rotate: rotate * 0.5 }}
      animate={{ opacity: 1, y: 0, rotate }}
      whileHover={{ scale: 1.03, rotate: 0, zIndex: 10 }}
      transition={{ duration: 0.35, delay: index * 0.07 }}
      onClick={() => setLocation(`/g/${trip.shareLinkSlug}`)}
      className="cursor-pointer bg-card rounded-2xl shadow-md overflow-hidden border border-border/60 flex flex-col"
      style={{ transformOrigin: "center bottom" }}
    >
      {/* Color stripe / cover */}
      <div className={cn("h-24 bg-gradient-to-br relative flex items-end px-4 pb-3", gradient)}>
        <div className="absolute inset-0 bg-black/10" />
        {locked && (
          <div className="absolute top-3 right-3 bg-white/20 backdrop-blur-sm rounded-full p-1.5">
            <Lock className="w-3 h-3 text-white" />
          </div>
        )}
        <div className="relative">
          <h3 className="text-white font-black text-lg leading-tight drop-shadow">
            {dest}
          </h3>
        </div>
      </div>

      {/* Card body */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-center justify-between">
          <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", status.color)}>
            {status.label}
          </span>
          {trip.createdAt && (
            <span className="text-[10px] text-muted-foreground">
              {format(new Date(trip.createdAt), "MMM d")}
            </span>
          )}
        </div>

        <div className="space-y-1.5 text-xs text-muted-foreground">
          {dateStr && (
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3 h-3 shrink-0" />
              <span>{dateStr}</span>
            </div>
          )}
          {crew.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Users className="w-3 h-3 shrink-0" />
              <span className="truncate">{crew.slice(0, 3).join(", ")}{crew.length > 3 ? ` +${crew.length - 3}` : ""}</span>
            </div>
          )}
        </div>

        <div className="mt-auto pt-1 flex items-center justify-end text-primary text-xs font-semibold">
          Open <ArrowRight className="w-3 h-3 ml-1" />
        </div>
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [tripName, setTripName] = useState("");
  const createGroup = useCreateGroup();

  const { data: trips = [], isLoading } = useQuery<TripSummary[]>({
    queryKey: ["/api/users/me/trips"],
    queryFn: async () => {
      const token = getStoredToken();
      const res = await fetch("/api/users/me/trips", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10000,
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tripName.trim()) return;
    try {
      const group = await createGroup.mutateAsync({ name: tripName });
      setLocation(`/g/${group.shareLinkSlug}`);
    } catch { /* handled in hook */ }
  };

  const lockedCount = trips.filter(t => t.tripPlan?.status === "Trip locked").length;
  const upcomingCount = trips.filter(t => t.tripPlan?.startDate).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border/50 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} className="w-8 h-8 rounded-full object-cover" alt={user.name} />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white text-xs font-black">
              {user?.name?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <div>
            <div className="text-sm font-bold text-foreground leading-tight">{user?.name}</div>
            <div className="text-[10px] text-muted-foreground">{user?.email}</div>
          </div>
        </div>
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

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Hero + stats */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <motion.h1
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-3xl font-black text-foreground tracking-tight"
            >
              My Trips
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-muted-foreground text-sm mt-1"
            >
              {trips.length === 0 ? "No trips yet — start planning!" : `${trips.length} trip${trips.length !== 1 ? "s" : ""} · ${lockedCount} locked · ${upcomingCount} with dates`}
            </motion.p>
          </div>
          <div className="shrink-0">
            <PipCharacter speeches={[
              "Where to next? 🗺️",
              "So many trips, so little time!",
              "Let's go somewhere amazing!",
              "Adventure is calling! ✈️",
              "Pick a trip and let's plan!",
            ]} />
          </div>
        </div>

        {/* Trip grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-52 rounded-2xl bg-secondary/40 animate-pulse" />
            ))}
          </div>
        ) : trips.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-20 gap-4 text-center"
          >
            <Plane className="w-12 h-12 text-muted-foreground/30" />
            <div>
              <p className="font-semibold text-foreground">No trips yet</p>
              <p className="text-sm text-muted-foreground mt-1">Hit "New Trip" and start planning with your crew</p>
            </div>
            <Button onClick={() => setShowNewTrip(true)} className="rounded-xl gap-1.5 mt-2">
              <Plus className="w-4 h-4" /> Start a Trip
            </Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {trips.map((trip, i) => (
              <TripCard key={trip.id} trip={trip} index={i} />
            ))}
          </div>
        )}
      </main>

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
                      onClick={() => setShowNewTrip(false)}
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
