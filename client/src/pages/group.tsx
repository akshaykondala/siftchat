import React, { useEffect, useState, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { getStoredUser } from "@/hooks/use-auth";
import { useGroup, useJoinGroup } from "@/hooks/use-groups";
import { useMessages, useSendMessage } from "@/hooks/use-messages";
import { useTripPlan, useTripAlternatives, useVoteAlternative, useUpdateAttendance, useMyAttendance, useAllAttendance, useLockTrip, useUnlockTrip, usePinboard, useAddPin, useRemovePin } from "@/hooks/use-trip";
import { usePresence } from "@/hooks/use-presence";
import { Button } from "@/components/ui/button-animated";
import { Input } from "@/components/ui/input";
import { ShinyCard } from "@/components/ui/shiny-card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { format, differenceInDays, differenceInHours, differenceInMinutes, differenceInSeconds, parseISO, isValid } from "date-fns";
import confetti from "canvas-confetti";
import {
  Send, Sparkles, Copy, Share2, Loader2, MapPin, Calendar,
  BedDouble, TrendingUp, CheckCircle2,
  MessageCircle, ThumbsUp, Star, ChevronDown, ChevronUp, Plane,
  Heart, AlertCircle, UserCheck, Lock, LockOpen, Clock, Globe, Map as MapIcon, Compass, Mail, X,
} from "lucide-react";
import type { TripPlan, TripAlternative, CommitmentLevel, SupportSignal } from "@shared/schema";
import { PipAvatar } from "@/components/pip-avatar";
import { PipCharacter } from "@/components/pip-character";

// ─── Presence Avatar ────────────────────────────────────────────────────────────
function PresenceAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "xs" }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Deterministic color from name
  const colors = [
    "bg-violet-500", "bg-indigo-500", "bg-teal-500",
    "bg-amber-500", "bg-rose-500", "bg-emerald-500",
    "bg-sky-500", "bg-orange-500",
  ];
  const idx = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  const bg = colors[idx];

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center text-white font-bold shrink-0",
        bg,
        size === "sm" ? "h-7 w-7 text-xs" : "h-5 w-5 text-[9px]"
      )}
      title={name}
    >
      {initials}
    </div>
  );
}

// ─── Typing Indicator ───────────────────────────────────────────────────────────
function TypingIndicator({ names }: { names: string[] }) {
  const label =
    names.length === 1
      ? `${names[0]} is typing…`
      : names.length === 2
      ? `${names[0]} and ${names[1]} are typing…`
      : `${names[0]} and ${names.length - 1} others are typing…`;

  return (
    <div
      className="flex items-center gap-2 px-4 pb-1 min-h-[20px]"
      data-testid="typing-indicator"
    >
      <div className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.9s" }}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground/70 italic" data-testid="typing-indicator-text">
        {label}
      </span>
    </div>
  );
}


// ─── Join Modal ────────────────────────────────────────────────────────────────
function JoinModal({ groupName, onJoin, isLoading }: { groupName: string; onJoin: (name: string) => void; isLoading: boolean }) {
  const [name, setName] = useState("");
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (name.trim()) onJoin(name); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
      <ShinyCard className="w-full max-w-md">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 text-primary">
            <Globe className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold font-display">Join {groupName}</h2>
          <p className="text-muted-foreground">Enter your name to start chatting and planning your trip.</p>
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            <Input
              placeholder="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 text-lg text-center rounded-xl"
              autoFocus
              data-testid="input-name"
            />
            <Button type="submit" size="lg" className="w-full" isLoading={isLoading} disabled={!name.trim()} data-testid="button-join">
              Join Trip Group
            </Button>
          </form>
        </div>
      </ShinyCard>
    </div>
  );
}

// ─── Field Row ─────────────────────────────────────────────────────────────────
function TripField({ icon, label, value, placeholder }: { icon: React.ReactNode; label: string; value?: string | null; placeholder: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-primary/60 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">{label}</div>
        <div className={cn("text-sm font-medium truncate", value ? "text-foreground" : "text-muted-foreground/50 italic")}>
          {value || placeholder}
        </div>
      </div>
    </div>
  );
}

// ─── Trip Card ─────────────────────────────────────────────────────────────────
function TripCard({
  trip,
  winnerAlt,
  groupId,
  allParticipants = [],
}: {
  trip: TripPlan | null;
  winnerAlt?: TripAlternative | null;
  groupId: number;
  allParticipants?: { id: number; name: string }[];
}) {
  const { data: allSignals = [] } = useAllAttendance(groupId);

  if (!trip) {
    return (
      <div className="rounded-2xl border border-primary/10 bg-gradient-to-br from-violet-50/60 to-indigo-50/60 dark:from-violet-950/20 dark:to-indigo-950/20 p-5">
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/50 gap-3">
          <MapIcon className="w-8 h-8 opacity-40" />
          <p className="text-sm text-center">Start chatting — Pip will detect your trip details automatically.</p>
        </div>
      </div>
    );
  }

  // When a winner alternative exists, promote its fields over the base trip plan
  const effectiveDest = winnerAlt?.destination || trip.destination;
  const effectiveDates = winnerAlt?.dateRange
    || (trip.startDate && trip.endDate ? `${trip.startDate} → ${trip.endDate}` : trip.startDate || trip.endDate || null);
  const effectiveBudget = winnerAlt?.budgetBand || trip.budgetBand;

  // Build participant id -> name map
  const participantNameMap = new Map(allParticipants.map((p) => [p.id, p.name]));

  // Deduplicate signals per participant: explicit beats AI, newest wins within same source
  const mainPlanSignals = allSignals.filter((s) => s.alternativeId === null);
  const deduped = new Map<number, typeof mainPlanSignals[number]>();
  for (const sig of mainPlanSignals) {
    const existing = deduped.get(sig.participantId);
    if (!existing || sig.source === "explicit" || (existing.source === "ai" && sig.source === "ai")) {
      deduped.set(sig.participantId, sig);
    }
  }
  const dedupedSignals = Array.from(deduped.values());

  const explicitCommitted = dedupedSignals
    .filter((s) => s.commitmentLevel === "committed")
    .map((s) => participantNameMap.get(s.participantId))
    .filter(Boolean) as string[];
  const explicitMaybe = dedupedSignals
    .filter((s) => s.commitmentLevel === "likely")
    .map((s) => participantNameMap.get(s.participantId))
    .filter(Boolean) as string[];
  const explicitUnavailable = dedupedSignals
    .filter((s) => s.commitmentLevel === "unavailable")
    .map((s) => participantNameMap.get(s.participantId))
    .filter(Boolean) as string[];

  // Merge with AI-detected names, deduplicating case-insensitively
  const signaled = new Set(
    [...explicitCommitted, ...explicitMaybe, ...explicitUnavailable].map((n) => n.toLowerCase())
  );
  const aiCommitted = Array.from(new Set((winnerAlt?.committedAttendeeNames ?? trip.committedAttendeeNames) ?? []))
    .filter((n) => !signaled.has(n.toLowerCase()));
  const aiLikely = Array.from(new Set((winnerAlt?.likelyAttendeeNames ?? trip.likelyAttendeeNames) ?? []))
    .filter((n) => !signaled.has(n.toLowerCase()) && !aiCommitted.map(x => x.toLowerCase()).includes(n.toLowerCase()));

  const committedNames = Array.from(new Set([...explicitCommitted, ...aiCommitted]));
  const likelyNames = Array.from(new Set([...explicitMaybe, ...aiLikely]))
    .filter((n) => !committedNames.map(x => x.toLowerCase()).includes(n.toLowerCase()));

  const isLocked = trip?.status === "Trip locked";

  return (
    <motion.div
      layout
      className={cn(
        "rounded-2xl border p-5 space-y-4",
        isLocked
          ? "border-emerald-400 dark:border-emerald-600 bg-gradient-to-br from-emerald-50/80 to-teal-50/80 dark:from-emerald-950/30 dark:to-teal-950/30"
          : winnerAlt
          ? "border-emerald-300 dark:border-emerald-700 bg-gradient-to-br from-emerald-50/60 to-teal-50/60 dark:from-emerald-950/20 dark:to-teal-950/20"
          : "border-primary/10 bg-gradient-to-br from-violet-50/60 to-indigo-50/60 dark:from-violet-950/20 dark:to-indigo-950/20"
      )}
      data-testid="trip-card"
    >
      {isLocked && (
        <div
          className="flex items-center gap-2 justify-center px-3 py-2 rounded-xl bg-emerald-500 text-white text-sm font-bold"
          data-testid="banner-trip-locked"
        >
          <Lock className="w-4 h-4" /> Trip Locked
        </div>
      )}
      {!isLocked && winnerAlt && (
        <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold uppercase tracking-widest">
          <Star className="w-3.5 h-3.5" /> Winning Option — {winnerAlt.aiSummary || winnerAlt.destination}
        </div>
      )}
      <div className="space-y-3">
        <TripField icon={<MapPin className="w-4 h-4" />} label="Destination" value={effectiveDest} placeholder="Undecided" />
        <TripField icon={<Calendar className="w-4 h-4" />} label="Dates" value={effectiveDates} placeholder="Dates TBD" />
        {/* Lodging row — shows finalized link button when available */}
        {(trip as any).finalizedLodgingUrl ? (
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-primary/60 shrink-0"><BedDouble className="w-4 h-4" /></div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Lodging</div>
              <a
                href={(trip as any).finalizedLodgingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors"
              >
                <CheckCircle2 className="w-3 h-3" /> View Lodging →
              </a>
            </div>
          </div>
        ) : (
          <TripField icon={<BedDouble className="w-4 h-4" />} label="Lodging" value={trip.lodgingPreference} placeholder="Lodging TBD" />
        )}
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground/60 shrink-0"><Plane className="w-4 h-4" /></span>{/* flights row — keep Plane */}
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 w-20 shrink-0">Flights</span>
          {trip.flightsBooked ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" data-testid="badge-flights-booked">
              <CheckCircle2 className="w-3 h-3" /> Flights booked ✓
            </span>
          ) : trip.flightSearchUrl ? (
            <a
              href={trip.flightSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
              data-testid="link-search-flights"
            >
              Search flights →
            </a>
          ) : (
            <span className="text-xs text-muted-foreground/40 italic">Not yet booked</span>
          )}
        </div>
      </div>

      {(committedNames.length > 0 || likelyNames.length > 0 || explicitUnavailable.length > 0) && (
        <div className="pt-2 border-t border-primary/10">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Who's in</div>
          <div className="flex flex-wrap gap-1">
            {committedNames.map((name) => (
              <Badge key={name} className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800 text-xs px-2 py-0.5">
                <UserCheck className="w-2.5 h-2.5 mr-1" />{name}
              </Badge>
            ))}
            {likelyNames.map((name) => (
              <Badge key={name} variant="outline" className="bg-amber-50/60 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800 text-xs px-2 py-0.5">
                {name}?
              </Badge>
            ))}
            {explicitUnavailable.map((name) => (
              <Badge key={name} variant="outline" className="bg-red-50/60 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 text-xs px-2 py-0.5 line-through opacity-70">
                {name}
              </Badge>
            ))}
          </div>
        </div>
      )}


      {trip.updatedAt && (
        <div className="text-[10px] text-muted-foreground/60 text-right" data-testid="text-last-updated">
          Last updated {format(new Date(trip.updatedAt), "MMM d, h:mm a")}
        </div>
      )}
    </motion.div>
  );
}

// ─── Planning Signals Strip ─────────────────────────────────────────────────────

// ─── Attendance Buttons ─────────────────────────────────────────────────────────
function AttendanceButtons({
  alternativeId,
  onUpdate,
  isPending,
}: {
  alternativeId: number | null;
  onUpdate: (level: CommitmentLevel) => void;
  isPending: boolean;
}) {
  const buttons: { level: CommitmentLevel; label: string; color: string }[] = [
    { level: "committed", label: "I'm in", color: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
    { level: "likely", label: "Maybe", color: "bg-amber-50 text-amber-700 hover:bg-amber-100" },
    { level: "unavailable", label: "Can't make it", color: "bg-red-50 text-red-600 hover:bg-red-100" },
  ];

  return (
    <div className="flex flex-wrap gap-1.5 mt-2" data-testid={`attendance-buttons-${alternativeId ?? "main"}`}>
      {buttons.map(({ level, label, color }) => (
        <button
          key={level}
          onClick={() => onUpdate(level)}
          disabled={isPending}
          className={cn(
            "px-2.5 py-1 rounded-full text-xs font-medium transition-all",
            color,
            isPending && "opacity-50 cursor-not-allowed"
          )}
          data-testid={`button-attendance-${level}-${alternativeId ?? "main"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── My Status Card ────────────────────────────────────────────────────────────
const COMMITMENT_CONFIG: Record<CommitmentLevel, { label: string; color: string; dot: string }> = {
  committed: { label: "I'm in", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", dot: "bg-emerald-500" },
  likely: { label: "Maybe", color: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300", dot: "bg-amber-400" },
  interested: { label: "Maybe", color: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300", dot: "bg-amber-400" },
  unavailable: { label: "Can't go", color: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400", dot: "bg-red-400" },
};

function buildSummaryLine(signals: SupportSignal[], alternatives: TripAlternative[], hasMainPlan: boolean): string {
  if (signals.length === 0) return "Set your stance on each option below.";

  // Deduplicate: prefer explicit signals over AI signals per alternativeId slot
  const slotMap = new Map<string | number, SupportSignal>();
  for (const sig of signals) {
    const key = sig.alternativeId ?? "main";
    const existing = slotMap.get(key);
    if (!existing || (sig.source === "explicit" && existing.source !== "explicit")) {
      slotMap.set(key, sig);
    }
  }

  const parts: string[] = [];

  for (const sig of Array.from(slotMap.values())) {
    const level = sig.commitmentLevel as CommitmentLevel;
    const cfg = COMMITMENT_CONFIG[level];
    if (!cfg) continue;

    let dest: string;
    if (sig.alternativeId === null) {
      dest = "the main plan";
    } else {
      const alt = alternatives.find((a) => a.id === sig.alternativeId);
      dest = alt?.destination ?? "an option";
    }

    if (level === "committed") parts.push(`in for ${dest}`);
    else if (level === "likely" || level === "interested") parts.push(`maybe for ${dest}`);
    else if (level === "unavailable") parts.push(`can't make ${dest}`);
  }

  if (parts.length === 0) return "Set your stance on each option below.";
  return "You're " + parts.join(", ") + ".";
}

function MyStatusCard({
  groupId,
  participantId,
  alternatives,
  trip,
  attendanceMutation,
}: {
  groupId: number;
  participantId: number;
  alternatives: TripAlternative[];
  trip: TripPlan | null | undefined;
  attendanceMutation: ReturnType<typeof useUpdateAttendance>;
}) {
  const { data: mySignals = [] } = useMyAttendance(groupId, participantId);

  const activeAlts = alternatives.filter((a) => a.status === "active");
  const hasMainPlan = !!trip;

  const getSignal = (alternativeId: number | null): SupportSignal | undefined => {
    const matching = alternativeId === null
      ? mySignals.filter((s) => s.alternativeId === null)
      : mySignals.filter((s) => s.alternativeId === alternativeId);
    return matching.find((s) => s.source === "explicit") ?? matching[0];
  };

  const summaryLine = buildSummaryLine(mySignals, alternatives, hasMainPlan);

  const stanceButtons: { level: CommitmentLevel; label: string }[] = [
    { level: "committed", label: "I'm in" },
    { level: "likely", label: "Maybe" },
    { level: "unavailable", label: "Can't go" },
  ];

  const renderStanceRow = (label: string, alternativeId: number | null, testSuffix: string) => {
    const signal = getSignal(alternativeId);
    const currentLevel = signal?.commitmentLevel as CommitmentLevel | undefined;
    return (
      <div key={testSuffix} className="space-y-1.5" data-testid={`my-status-row-${testSuffix}`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground truncate flex-1">{label}</span>
          {currentLevel && COMMITMENT_CONFIG[currentLevel] && (
            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold", COMMITMENT_CONFIG[currentLevel].color)} data-testid={`my-status-badge-${testSuffix}`}>
              <span className={cn("w-1.5 h-1.5 rounded-full", COMMITMENT_CONFIG[currentLevel].dot)} />
              {COMMITMENT_CONFIG[currentLevel].label}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1" data-testid={`my-status-buttons-${testSuffix}`}>
          {stanceButtons.map(({ level, label: btnLabel }) => (
            <button
              key={level}
              onClick={() => attendanceMutation.mutate({ participantId, alternativeId, commitmentLevel: level })}
              disabled={attendanceMutation.isPending}
              className={cn(
                "px-2 py-0.5 rounded-full text-[11px] font-medium transition-all border",
                currentLevel === level
                  ? cn(COMMITMENT_CONFIG[level].color, "border-current opacity-100 ring-1 ring-current/30")
                  : "bg-transparent text-muted-foreground border-border hover:border-primary/30 hover:text-foreground",
                attendanceMutation.isPending && "opacity-50 cursor-not-allowed"
              )}
              data-testid={`my-status-toggle-${level}-${testSuffix}`}
            >
              {btnLabel}
            </button>
          ))}
        </div>
      </div>
    );
  };

  if (!hasMainPlan && activeAlts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-primary/10 bg-gradient-to-br from-violet-50/40 to-indigo-50/40 dark:from-violet-950/10 dark:to-indigo-950/10 p-4 space-y-3" data-testid="card-my-status">
      <div className="flex items-center gap-2">
        <UserCheck className="w-4 h-4 text-primary/60 shrink-0" />
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">My Status</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed" data-testid="my-status-summary">{summaryLine}</p>
      <div className="space-y-3 pt-1">
        {hasMainPlan && activeAlts.length === 0 && renderStanceRow(trip?.destination ? `Main plan · ${trip.destination}` : "Main plan", null, "main")}
        {activeAlts.map((alt) =>
          renderStanceRow(alt.destination ?? "Option", alt.id, `alt-${alt.id}`)
        )}
      </div>
    </div>
  );
}

// ─── Alternative Card ──────────────────────────────────────────────────────────
function AlternativeCard({
  alt,
  groupId,
  participantId,
  isWinner,
  tripStatus,
  voteMutation,
  attendanceMutation,
  lockMutation,
}: {
  alt: TripAlternative;
  groupId: number;
  participantId: number;
  isWinner: boolean;
  tripStatus?: string | null;
  voteMutation: ReturnType<typeof useVoteAlternative>;
  attendanceMutation: ReturnType<typeof useUpdateAttendance>;
  lockMutation: ReturnType<typeof useLockTrip>;
}) {
  const [expanded, setExpanded] = useState(false);
  const committedNames = alt.committedAttendeeNames ?? [];
  const likelyNames = alt.likelyAttendeeNames ?? [];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-2xl border p-4 space-y-3 transition-all",
        isWinner
          ? "border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20"
          : "border-primary/10 bg-white/60 dark:bg-zinc-900/40"
      )}
      data-testid={`card-alternative-${alt.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-foreground">{alt.destination ?? "Unknown destination"}</span>
            {isWinner && (
              <Badge className="bg-amber-400 text-white border-0 text-[10px] px-1.5 py-0 gap-1">
                <Star className="w-2.5 h-2.5" /> Top Pick
              </Badge>
            )}
          </div>
          {alt.dateRange && (
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> {alt.dateRange}
            </div>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 text-xs shrink-0",
            voteMutation.isPending && "opacity-60"
          )}
          onClick={() => voteMutation.mutate({ alternativeId: alt.id, participantId })}
          disabled={voteMutation.isPending}
          data-testid={`button-vote-${alt.id}`}
        >
          {voteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
          {(alt.voteCount ?? 0) > 0 && <span>{alt.voteCount}</span>}
          Vote
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {((alt.voteCount ?? 0) > 0 || (alt.supportScore ?? 0) > 0) && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300">
            <TrendingUp className="w-3 h-3" />
            {(alt.voteCount ?? 0)} {(alt.voteCount ?? 0) === 1 ? "vote" : "votes"}
            {(alt.supportScore ?? 0) > 0 && ` · support score ${Math.round(alt.supportScore ?? 0)}`}
          </span>
        )}
      </div>

      {(committedNames.length > 0 || likelyNames.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {committedNames.map((name) => (
            <Badge key={`c-${name}`} className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300">
              <UserCheck className="w-2.5 h-2.5 mr-0.5" />{name}
            </Badge>
          ))}
          {likelyNames.filter(n => !committedNames.includes(n)).map((name) => (
            <Badge key={`l-${name}`} variant="outline" className="text-[10px] px-1.5 py-0 text-amber-700 border-amber-200 dark:text-amber-300">
              {name}?
            </Badge>
          ))}
        </div>
      )}

      {alt.evidenceSummary && (
        <div>
          <button
            className="text-[11px] text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
            onClick={() => setExpanded((v) => !v)}
            data-testid={`button-expand-alt-${alt.id}`}
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "Less" : "Why this option?"}
          </button>
          <AnimatePresence>
            {expanded && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="text-xs text-muted-foreground mt-1 leading-relaxed"
              >
                {alt.evidenceSummary}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="border-t border-primary/10 pt-2">
        <div className="text-[10px] font-semibold text-muted-foreground mb-1">Your stance:</div>
        <AttendanceButtons
          alternativeId={alt.id}
          onUpdate={(level) => attendanceMutation.mutate({ participantId, alternativeId: alt.id, commitmentLevel: level })}
          isPending={attendanceMutation.isPending}
        />
      </div>

      {isWinner && tripStatus === "Almost decided" && (
        <div className="border-t border-amber-200 dark:border-amber-800 pt-3">
          <Button
            className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-9 text-xs font-bold"
            onClick={() => lockMutation.mutate({ alternativeId: alt.id })}
            disabled={lockMutation.isPending}
            isLoading={lockMutation.isPending}
            data-testid={`button-lock-trip-${alt.id}`}
          >
            <Lock className="w-3.5 h-3.5" />
            Lock this trip
          </Button>
        </div>
      )}
    </motion.div>
  );
}

// ─── Featured Flight Card ────────────────────────────────────────────────────
interface FlightDetails {
  source: string;
  origin?: string;
  destination?: string;
  departDate?: string;
  returnDate?: string;
  title?: string;
}

function DeadlinePicker({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string | null;
  onSave: (date: string | null) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value ?? "");

  const daysUntil = value
    ? Math.ceil((new Date(value + "T23:59:59").getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const urgencyClass =
    daysUntil !== null && daysUntil <= 1
      ? "text-red-600 dark:text-red-400"
      : daysUntil !== null && daysUntil <= 3
      ? "text-amber-600 dark:text-amber-400"
      : "text-muted-foreground";

  if (editing) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="date"
          className="text-[11px] border rounded-lg px-1.5 py-0.5 bg-background h-6 w-28"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          autoFocus
        />
        <button
          className="text-[11px] font-semibold text-violet-600 px-1.5 h-6 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors"
          onClick={() => { onSave(draft || null); setEditing(false); }}
        >✓</button>
        <button
          className="text-[11px] text-muted-foreground px-1 h-6 rounded-lg hover:bg-muted transition-colors"
          onClick={() => setEditing(false)}
        >✕</button>
      </div>
    );
  }

  return (
    <button
      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors group shrink-0"
      onClick={() => { setDraft(value ?? ""); setEditing(true); }}
    >
      {!value && <Clock className="w-3 h-3" />}
      {value ? (
        <span className={cn(urgencyClass, "underline underline-offset-2 decoration-dashed")}>
          edit
        </span>
      ) : (
        <span className="italic group-hover:not-italic">{label}</span>
      )}
    </button>
  );
}

function DeadlinesCard({
  trip,
  groupId,
  onTripUpdate,
}: {
  trip: TripPlan;
  groupId: number;
  onTripUpdate?: () => void;
}) {
  const flightDeadline = (trip as any).flightDeadline as string | null;
  const lodgingDeadline = (trip as any).lodgingDeadline as string | null;
  const flightsBooked = trip.flightsBooked;
  const lodgingBooked = trip.lodgingBooked;

  const save = async (patch: { flightDeadline?: string | null; lodgingDeadline?: string | null }) => {
    await fetch(`/api/groups/${groupId}/deadlines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    onTripUpdate?.();
  };

  function daysUntil(dateStr: string) {
    return Math.ceil((new Date(dateStr + "T23:59:59").getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  const flightDays = flightDeadline ? daysUntil(flightDeadline) : null;
  const lodgingDays = lodgingDeadline ? daysUntil(lodgingDeadline) : null;

  const urgency = (days: number | null) =>
    days === null ? "none"
    : days <= 1 ? "critical"
    : days <= 3 ? "warn"
    : days <= 7 ? "soon"
    : "ok";

  const urgencyBg: Record<string, string> = {
    critical: "bg-red-50 border-red-300 dark:bg-red-950/30 dark:border-red-700",
    warn: "bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700",
    soon: "bg-violet-50 border-violet-200 dark:bg-violet-950/20 dark:border-violet-800",
    ok: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800",
    none: "bg-muted/40 border-border",
  };
  const urgencyText: Record<string, string> = {
    critical: "text-red-700 dark:text-red-400",
    warn: "text-amber-700 dark:text-amber-400",
    soon: "text-violet-700 dark:text-violet-400",
    ok: "text-emerald-700 dark:text-emerald-400",
    none: "text-muted-foreground",
  };

  const countdownLabel = (days: number | null) =>
    days === null ? null
    : days <= 0 ? "⚠️ Overdue"
    : days === 1 ? "1 day left"
    : `${days} days left`;

  const hasAnyDeadline = flightDeadline || lodgingDeadline;
  const allBooked = flightsBooked && lodgingBooked;
  if (allBooked) return null;

  return (
    <div className={cn(
      "rounded-xl border p-3 space-y-2",
      hasAnyDeadline
        ? urgencyBg[urgency(Math.min(flightDays ?? 999, lodgingDays ?? 999))]
        : "bg-card/80 border-border"
    )}>
      <div className="flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Book-by Deadlines</span>
        {hasAnyDeadline && (
          <span className={cn("ml-auto text-[10px] font-bold", urgencyText[urgency(Math.min(flightDays ?? 999, lodgingDays ?? 999))])}>
            {countdownLabel(Math.min(flightDays ?? 999, lodgingDays ?? 999))}
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {!flightsBooked && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm">✈️</span>
              <span className="text-[11px] font-medium text-foreground/80 truncate">Flights</span>
              {flightDeadline && (
                <span className={cn("text-[10px] font-semibold shrink-0", urgencyText[urgency(flightDays)])}>
                  {new Date(flightDeadline + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
            </div>
            <DeadlinePicker
              label="Set deadline"
              value={flightDeadline}
              onSave={(date) => save({ flightDeadline: date })}
            />
          </div>
        )}
        {!lodgingBooked && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm">🏠</span>
              <span className="text-[11px] font-medium text-foreground/80 truncate">Lodging</span>
              {lodgingDeadline && (
                <span className={cn("text-[10px] font-semibold shrink-0", urgencyText[urgency(lodgingDays)])}>
                  {new Date(lodgingDeadline + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
            </div>
            <DeadlinePicker
              label="Set deadline"
              value={lodgingDeadline}
              onSave={(date) => save({ lodgingDeadline: date })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function FeaturedFlightCard({ trip, groupId, onTripUpdate }: { trip: TripPlan; groupId?: number; onTripUpdate?: () => void }) {
  if (!trip.flightSearchUrl && !(trip as any).kayakUrl) return null;
  const origin = (trip as any).originCity as string | null;
  const dest = trip.destination ?? "destination";
  const dates = trip.startDate && trip.endDate ? `${trip.startDate} – ${trip.endDate}` : null;
  const isBooked = trip.flightsBooked;
  const flightDeadline = (trip as any).flightDeadline as string | null;

  const saveFlightDeadline = async (date: string | null) => {
    if (!groupId) return;
    await fetch(`/api/groups/${groupId}/deadlines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flightDeadline: date }),
    });
    onTripUpdate?.();
  };

  const finalizedUrl = (trip as any).finalizedFlightUrl as string | null;
  const rawDetails = (trip as any).flightDetails as string | null;
  const fd: FlightDetails | null = rawDetails ? (() => { try { return JSON.parse(rawDetails); } catch { return null; } })() : null;

  // Build a human-readable route line from scraped details
  const routeLine = fd?.origin && fd?.destination
    ? `${fd.origin} → ${fd.destination}`
    : fd?.title
    ? fd.title
    : origin
    ? `${origin} → ${dest}`
    : null;

  const dateLine = fd?.departDate
    ? fd.returnDate
      ? `${fd.departDate} – ${fd.returnDate}`
      : fd.departDate
    : dates;

  if (isBooked) {
    return (
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 p-3 space-y-2">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Flights finalized ✈️</p>
            {routeLine && <p className="text-[11px] text-muted-foreground truncate">{routeLine}{dateLine ? ` · ${dateLine}` : ""}</p>}
            {fd?.source && <p className="text-[10px] text-muted-foreground/60">via {fd.source}</p>}
          </div>
        </div>
        {finalizedUrl && (
          <a href={finalizedUrl} target="_blank" rel="noopener noreferrer"
            className="block w-full text-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold h-8 flex items-center justify-center gap-1 transition-colors">
            <Plane className="w-3 h-3" /> View booking
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Plane className="w-3.5 h-3.5 text-violet-500 shrink-0" />
        <span className="text-xs font-bold text-violet-700 dark:text-violet-300">
          {origin ? `${origin} → ${dest}` : `Flights to ${dest}`}
        </span>
      </div>
      {dates && <p className="text-[11px] text-muted-foreground pl-5">{dates}</p>}
      <div className="flex gap-2 pl-5">
        {trip.flightSearchUrl && (
          <a href={trip.flightSearchUrl} target="_blank" rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-semibold h-8 transition-colors">
            <Plane className="w-3 h-3" /> Google Flights
          </a>
        )}
        {(trip as any).kayakUrl && (
          <a href={(trip as any).kayakUrl} target="_blank" rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1 rounded-xl border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30 text-[11px] font-semibold h-8 transition-colors">
            Kayak
          </a>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground pl-5 italic">Say "@pip finalize flights" to lock in</p>
    </div>
  );
}

// ─── Featured Lodging Card ───────────────────────────────────────────────────
function FeaturedLodgingCard({ trip, groupId, onTripUpdate }: { trip: TripPlan; groupId?: number; onTripUpdate?: () => void }) {
  const t = trip as any;
  if (!t.airbnbUrl && !t.hotelsUrl) return null;
  const dest = trip.destination ?? "destination";
  const dates = trip.startDate && trip.endDate ? `${trip.startDate} – ${trip.endDate}` : null;
  const isBooked = t.lodgingBooked;
  const finalizedLodgingUrl = t.finalizedLodgingUrl as string | null;
  const lodgingDeadline = t.lodgingDeadline as string | null;
  const guestCount = Math.max(
    (trip.likelyAttendeeNames?.length ?? 0),
    (trip.committedAttendeeNames?.length ?? 0),
  ) || null;

  const saveLodgingDeadline = async (date: string | null) => {
    if (!groupId) return;
    await fetch(`/api/groups/${groupId}/deadlines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lodgingDeadline: date }),
    });
    onTripUpdate?.();
  };

  if (isBooked) {
    return (
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 p-3 space-y-2">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <div>
            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Lodging finalized 🏠</p>
            {dates && <p className="text-[11px] text-muted-foreground">{dest} · {dates}</p>}
          </div>
        </div>
        {finalizedLodgingUrl && (
          <a href={finalizedLodgingUrl} target="_blank" rel="noopener noreferrer"
            className="block w-full text-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold h-8 flex items-center justify-center gap-1 transition-colors">
            <BedDouble className="w-3 h-3" /> View booking
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <BedDouble className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        <span className="text-xs font-bold text-amber-700 dark:text-amber-300">Places to stay in {dest}</span>
      </div>
      {(dates || guestCount) && (
        <p className="text-[11px] text-muted-foreground pl-5">
          {[dates, guestCount ? `${guestCount} guests` : null].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="flex gap-2 pl-5">
        {t.airbnbUrl && (
          <a href={t.airbnbUrl} target="_blank" rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-semibold h-8 transition-colors">
            Airbnb
          </a>
        )}
        {t.hotelsUrl && (
          <a href={t.hotelsUrl} target="_blank" rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1 rounded-xl border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-[11px] font-semibold h-8 transition-colors">
            Booking.com
          </a>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground pl-5 italic">Say "@pip finalize lodging" to lock in</p>
    </div>
  );
}

// ─── Countdown Hook ────────────────────────────────────────────────────────────
function parseFlexibleDate(s: string): Date | null {
  const now = new Date();
  // Bump to future: set year to current year; if still past, use next year
  const bumpToFuture = (d: Date): Date => {
    if (d >= now) return d;
    const b = new Date(d);
    b.setFullYear(now.getFullYear());
    if (b < now) b.setFullYear(now.getFullYear() + 1);
    return b;
  };
  let d = parseISO(s);
  if (isValid(d)) return bumpToFuture(d);
  d = new Date(s);
  if (isValid(d)) return bumpToFuture(d);
  // No year — try current year, bump if past
  d = new Date(`${s} ${now.getFullYear()}`);
  if (isValid(d)) return bumpToFuture(d);
  return null;
}

function useCountdown(targetDateStr: string | null | undefined) {
  const [remaining, setRemaining] = useState<{ days: number; hours: number; mins: number; secs: number } | null>(null);

  useEffect(() => {
    if (!targetDateStr) return;
    const target = parseFlexibleDate(targetDateStr);
    if (!target) return;

    const tick = () => {
      const now = new Date();
      const totalSecs = differenceInSeconds(target!, now);
      if (totalSecs <= 0) { setRemaining({ days: 0, hours: 0, mins: 0, secs: 0 }); return; }
      const days = differenceInDays(target!, now);
      const hours = differenceInHours(target!, now) % 24;
      const mins = differenceInMinutes(target!, now) % 60;
      const secs = totalSecs % 60;
      setRemaining({ days, hours, mins, secs });
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDateStr]);

  return remaining;
}

// ─── Locked Trip Panel ─────────────────────────────────────────────────────────
function LockedTripPanel({ trip, groupId, participantName, onUnlock, isUnlocking, onShareSummary }: {
  trip: TripPlan;
  groupId: number;
  participantName: string;
  onUnlock: () => void;
  isUnlocking: boolean;
  onShareSummary: () => void;
}) {
  const t = trip as any;
  const dest = trip.destination ?? "Your Trip";
  const origin = t.originCity as string | null;
  const dates = trip.startDate && trip.endDate ? `${trip.startDate} → ${trip.endDate}` : trip.startDate ?? null;
  const committed = trip.committedAttendeeNames ?? [];
  const likely = trip.likelyAttendeeNames ?? [];
  const countdown = useCountdown(trip.startDate);
  const isTripped = countdown?.days === 0 && countdown?.hours === 0 && countdown?.mins === 0 && countdown?.secs === 0;

  const flightsBooked = !!trip.flightsBooked;
  const lodgingBooked = !!t.lodgingBooked;
  const allBooked = flightsBooked && lodgingBooked;
  const { data: pinboardItems = [] } = usePinboard(groupId);
  const removePin = useRemovePin(groupId);
  const pipControls = useAnimationControls();
  const lastMinRef = useRef<number>(-1);
  const lastHrRef = useRef<number>(-1);
  const lastDayRef = useRef<number>(-1);

  useEffect(() => {
    if (!countdown) return;
    const { days, hours, mins } = countdown;

    // New day — big party jump
    if (lastDayRef.current !== -1 && days !== lastDayRef.current) {
      lastDayRef.current = days;
      pipControls.start({
        x: [0, -14, 14, -10, 10, -5, 5, 0],
        y: [0, -22, -6, -18, -2, -10, 0],
        rotate: [0, -10, 10, -7, 7, 0],
        scale: [1, 1.15, 0.92, 1.1, 1],
        transition: { duration: 0.9, ease: "easeOut" },
      });
      return;
    }
    lastDayRef.current = days;

    // New hour — excited hop
    if (lastHrRef.current !== -1 && hours !== lastHrRef.current) {
      lastHrRef.current = hours;
      pipControls.start({
        y: [0, -16, 2, -10, 0],
        scale: [1, 1.1, 0.95, 1.05, 1],
        transition: { duration: 0.6, ease: "easeOut" },
      });
      return;
    }
    lastHrRef.current = hours;

    // New minute — little bounce
    if (lastMinRef.current !== -1 && mins !== lastMinRef.current) {
      lastMinRef.current = mins;
      pipControls.start({
        y: [0, -10, 0],
        rotate: [0, -5, 5, 0],
        transition: { duration: 0.45, ease: "easeOut" },
      });
      return;
    }
    lastMinRef.current = mins;
  }, [countdown?.days, countdown?.hours, countdown?.mins]);

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {/* ── Hero ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative overflow-hidden bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 text-white px-6 pt-8 pb-6 shrink-0"
      >
        {/* subtle shimmer rings */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full bg-white/10" />
        </div>

        <div className="relative text-center space-y-1 mb-4">
          <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider mb-3">
            <Lock className="w-3 h-3" /> Trip Locked
          </div>
          <h1 className="text-3xl font-black tracking-tight drop-shadow-sm">
            {origin ? `${origin} → ${dest}` : dest}
          </h1>
          {dates && <p className="text-emerald-100 text-sm font-medium">{dates}</p>}
        </div>

        {/* Pip + Countdown */}
        {countdown && trip.startDate ? (
          isTripped ? (
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="text-center text-5xl font-black mb-2">
              🎉 It's trip time!
            </motion.div>
          ) : (
            <div className="flex flex-col items-center gap-3 mb-2">
              {/* Big New Year's-style single-line countdown */}
              <div className="flex items-end justify-center gap-1 tabular-nums">
                {[
                  { val: countdown.days, label: "d" },
                  { val: countdown.hours, label: "h" },
                  { val: countdown.mins, label: "m" },
                  { val: countdown.secs, label: "s" },
                ].map(({ val, label }, i) => (
                  <React.Fragment key={label}>
                    {i > 0 && (
                      <motion.span
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                        className="text-4xl font-black text-white/60 leading-none mb-1"
                      >
                        :
                      </motion.span>
                    )}
                    <div className="flex flex-col items-center">
                      <motion.div
                        key={`${label}-${val}`}
                        initial={{ y: -8, opacity: 0.4 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        className="text-5xl font-black leading-none drop-shadow-lg"
                      >
                        {String(val).padStart(2, "0")}
                      </motion.div>
                      <div className="text-[9px] text-emerald-200/80 uppercase tracking-widest mt-0.5">{label === "d" ? "days" : label === "h" ? "hrs" : label === "m" ? "min" : "sec"}</div>
                    </div>
                  </React.Fragment>
                ))}
              </div>

              {/* Pip below the countdown, reacts to milestones */}
              <motion.div animate={pipControls}>
                <PipCharacter speeches={[
                  `${countdown.days} day${countdown.days === 1 ? "" : "s"} to go! 🎉`,
                  "SO excited for this trip!",
                  "Let's goooo! 🙌",
                  "This is gonna be amazing!",
                  "Pack light, dream big! 🌍",
                  "Can't wait! 🧳",
                ]} />
              </motion.div>
            </div>
          )
        ) : (
          <div className="flex justify-center mb-2">
            <PipCharacter speeches={["SO excited for this trip!", "Let's gooo! 🙌", "This is gonna be amazing!", "Can't wait! 🧳"]} />
          </div>
        )}
      </motion.div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-4">
        {/* Checklist */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-border bg-card p-4 space-y-3"
        >
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Booking Status</div>

          {/* Flights row */}
          <div className={cn(
            "flex items-center gap-3 rounded-xl p-3 transition-colors",
            flightsBooked ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-violet-50/60 dark:bg-violet-950/20"
          )}>
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
              flightsBooked ? "bg-emerald-500" : "bg-violet-200 dark:bg-violet-800"
            )}>
              {flightsBooked
                ? <CheckCircle2 className="w-4 h-4 text-white" />
                : <Plane className="w-4 h-4 text-violet-600 dark:text-violet-300" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn("text-xs font-bold", flightsBooked ? "text-emerald-700 dark:text-emerald-300" : "text-foreground")}>
                {flightsBooked ? "Flights finalized ✓" : "Flights not yet booked"}
              </div>
              {!flightsBooked && <div className="text-[11px] text-muted-foreground">Say "@pip finalize flights [link]"</div>}
            </div>
            {flightsBooked && t.finalizedFlightUrl && (
              <a href={t.finalizedFlightUrl} target="_blank" rel="noopener noreferrer"
                className="shrink-0 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:underline">
                View →
              </a>
            )}
            {!flightsBooked && trip.flightSearchUrl && (
              <a href={trip.flightSearchUrl} target="_blank" rel="noopener noreferrer"
                className="shrink-0 px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-bold transition-colors">
                Search
              </a>
            )}
          </div>

          {/* Lodging row */}
          <div className={cn(
            "flex items-center gap-3 rounded-xl p-3 transition-colors",
            lodgingBooked ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-amber-50/60 dark:bg-amber-950/20"
          )}>
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
              lodgingBooked ? "bg-emerald-500" : "bg-amber-200 dark:bg-amber-800"
            )}>
              {lodgingBooked
                ? <CheckCircle2 className="w-4 h-4 text-white" />
                : <BedDouble className="w-4 h-4 text-amber-600 dark:text-amber-300" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn("text-xs font-bold", lodgingBooked ? "text-emerald-700 dark:text-emerald-300" : "text-foreground")}>
                {lodgingBooked ? "Lodging finalized ✓" : "Lodging not yet booked"}
              </div>
              {!lodgingBooked && <div className="text-[11px] text-muted-foreground">Say "@pip finalize lodging [link]"</div>}
            </div>
            {lodgingBooked && t.finalizedLodgingUrl && (
              <a href={t.finalizedLodgingUrl} target="_blank" rel="noopener noreferrer"
                className="shrink-0 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:underline">
                View →
              </a>
            )}
            {!lodgingBooked && t.airbnbUrl && (
              <a href={t.airbnbUrl} target="_blank" rel="noopener noreferrer"
                className="shrink-0 px-2.5 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-bold transition-colors">
                Airbnb
              </a>
            )}
          </div>

          {allBooked && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center text-sm font-bold text-emerald-600 dark:text-emerald-400 py-1"
            >
              🎉 All booked — you're ready to go!
            </motion.div>
          )}
        </motion.div>

        {/* Who's going — committed only, deduplicated */}
        {Array.from(new Set(committed)).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="rounded-2xl border border-border bg-card p-4 space-y-3"
          >
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">The Crew</div>
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set(committed)).map((name) => (
                <div key={name} className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 rounded-full pl-1 pr-3 py-1">
                  <PresenceAvatar name={name} size="xs" />
                  <span className="text-xs font-semibold">{name}</span>
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Pinboard */}
        {pinboardItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl border border-border bg-card p-4 space-y-3"
          >
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">📌 Pinboard</div>
            <div className="flex flex-wrap gap-2">
              <AnimatePresence>
                {pinboardItems.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="group flex items-center gap-1.5 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 rounded-full pl-2 pr-1.5 py-1 text-xs font-medium border border-violet-200/50 dark:border-violet-700/50"
                  >
                    <span>{item.emoji}</span>
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(`${item.title} ${dest}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {item.title}
                    </a>
                    <button
                      onClick={() => removePin.mutate(item.id)}
                      className="opacity-0 group-hover:opacity-100 ml-0.5 w-4 h-4 rounded-full flex items-center justify-center hover:bg-violet-200 dark:hover:bg-violet-700 transition-all text-[10px]"
                    >
                      ×
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* Actions */}
        <div className="space-y-2 pt-1">
          <Button
            className="w-full gap-2 rounded-xl h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            onClick={onShareSummary}
          >
            <Share2 className="w-4 h-4" /> Share Trip Summary
          </Button>
          <button
            onClick={onUnlock}
            disabled={isUnlocking}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-muted-foreground/20 text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 text-xs font-medium h-9 transition-colors disabled:opacity-50"
          >
            {isUnlocking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LockOpen className="w-3.5 h-3.5" />}
            Unlock trip (back to planning)
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Commitment Cards ────────────────────────────────────────────────────────
interface Commitment { participantId: number; flightBooked: boolean; lodgingStatus: string; }

function CommitmentCards({
  groupId,
  participantId,
  participants,
  lodgingType,
  flightsRelevant,
  lodgingRelevant,
}: {
  groupId: number;
  participantId: number;
  participants: { id: number; name: string }[];
  lodgingType: string | null;
  flightsRelevant: boolean;
  lodgingRelevant: boolean;
}) {
  const [commitments, setCommitments] = React.useState<Commitment[]>([]);
  const [updating, setUpdating] = React.useState(false);

  const fetchCommitments = React.useCallback(async () => {
    const res = await fetch(`/api/groups/${groupId}/commitments`);
    if (res.ok) setCommitments(await res.json());
  }, [groupId]);

  React.useEffect(() => { fetchCommitments(); }, [fetchCommitments]);

  const myCommitment = commitments.find(c => c.participantId === participantId);

  const update = async (patch: { flightBooked?: boolean; lodgingStatus?: string }) => {
    setUpdating(true);
    try {
      const token = localStorage.getItem("siftchat_token");
      await fetch(`/api/groups/${groupId}/commitments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ participantId, ...patch }),
      });
      await fetchCommitments();
    } finally { setUpdating(false); }
  };

  if (!flightsRelevant && !lodgingRelevant) return null;

  const isRental = lodgingType === "rental";
  const isHotel = lodgingType === "hotel";
  const anyoneBookedRental = commitments.some(c => c.lodgingStatus === "booked");

  return (
    <div>
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 px-1">Who's Booked</div>
      <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
        {participants.map(p => {
          const c = commitments.find(x => x.participantId === p.id);
          const isMe = p.id === participantId;
          const flightDone = c?.flightBooked ?? false;
          const lodgingDone = c?.lodgingStatus === "booked" || c?.lodgingStatus === "covered";

          return (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
              {/* Avatar */}
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-black text-primary shrink-0">
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{isMe ? "You" : p.name}</p>
                {isRental && c?.lodgingStatus === "booked" && (
                  <p className="text-[10px] text-emerald-600">booked the place</p>
                )}
              </div>

              {/* Flight pill */}
              {flightsRelevant && (
                isMe ? (
                  <button
                    disabled={updating}
                    onClick={() => update({ flightBooked: !flightDone })}
                    title={flightDone ? "Click to undo" : undefined}
                    className={cn(
                      "text-[10px] font-bold px-2 py-1 rounded-full border transition-colors shrink-0",
                      flightDone
                        ? "bg-emerald-100 border-emerald-300 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-300 hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                        : "bg-secondary border-border text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {flightDone ? "✈️ Booked" : "Flight?"}
                  </button>
                ) : (
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-1 rounded-full border shrink-0",
                    flightDone
                      ? "bg-emerald-100 border-emerald-300 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-300"
                      : "bg-secondary border-border text-muted-foreground"
                  )}>
                    {flightDone ? "✈️ Booked" : "–"}
                  </span>
                )
              )}

              {/* Lodging pill */}
              {lodgingRelevant && (
                isMe ? (
                  isRental ? (
                    <div className="flex gap-1 shrink-0">
                      {!anyoneBookedRental || c?.lodgingStatus === "booked" ? (
                        <button
                          disabled={updating}
                          onClick={() => update({ lodgingStatus: c?.lodgingStatus === "booked" ? "pending" : "booked" })}
                          className={cn(
                            "text-[10px] font-bold px-2 py-1 rounded-full border transition-colors",
                            c?.lodgingStatus === "booked"
                              ? "bg-emerald-100 border-emerald-300 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-300"
                              : "bg-secondary border-border text-muted-foreground hover:border-primary/40"
                          )}
                        >
                          {c?.lodgingStatus === "booked" ? "🏠 I booked it" : "I booked it"}
                        </button>
                      ) : null}
                      {anyoneBookedRental && c?.lodgingStatus !== "booked" && (
                        <button
                          disabled={updating}
                          onClick={() => update({ lodgingStatus: c?.lodgingStatus === "covered" ? "pending" : "covered" })}
                          className={cn(
                            "text-[10px] font-bold px-2 py-1 rounded-full border transition-colors",
                            c?.lodgingStatus === "covered"
                              ? "bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300"
                              : "bg-secondary border-border text-muted-foreground hover:border-primary/40"
                          )}
                        >
                          {c?.lodgingStatus === "covered" ? "✓ I'm in" : "I'm in"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      disabled={updating}
                      onClick={() => update({ lodgingStatus: lodgingDone ? "pending" : "booked" })}
                      className={cn(
                        "text-[10px] font-bold px-2 py-1 rounded-full border transition-colors shrink-0",
                        lodgingDone
                          ? "bg-emerald-100 border-emerald-300 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-300"
                          : "bg-secondary border-border text-muted-foreground hover:border-primary/40"
                      )}
                    >
                      {lodgingDone ? "🏠 Booked" : isHotel ? "Room?" : "Lodging?"}
                    </button>
                  )
                ) : (
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-1 rounded-full border shrink-0",
                    c?.lodgingStatus === "booked"
                      ? "bg-emerald-100 border-emerald-300 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-300"
                      : c?.lodgingStatus === "covered"
                      ? "bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300"
                      : "bg-secondary border-border text-muted-foreground"
                  )}>
                    {c?.lodgingStatus === "booked" ? "🏠 Booked" : c?.lodgingStatus === "covered" ? "✓ In" : "–"}
                  </span>
                )
              )}
            </div>
          );
        })}
      </div>
      {isRental && !anyoneBookedRental && (
        <p className="text-[10px] text-muted-foreground mt-1.5 px-1">Someone tap "I booked it" once the place is reserved — others can then confirm they're in.</p>
      )}
      {isHotel && (
        <p className="text-[10px] text-muted-foreground mt-1.5 px-1">Hotel — everyone books their own room.</p>
      )}
    </div>
  );
}

// ─── Trip Progress Bar ─────────────────────────────────────────────────────────
function TripProgressBar({
  trip,
  commitments,
  participantCount,
}: {
  trip: TripPlan | null | undefined;
  commitments: { flightBooked: boolean }[];
  participantCount: number;
}) {
  if (!trip) return null;

  const flightCommittedCount = commitments.filter((c) => c.flightBooked).length;
  const crewIn = participantCount > 0 && flightCommittedCount >= participantCount;

  const steps = [
    {
      label: "Destination",
      done: !!trip.destination,
      icon: "🌍",
    },
    {
      label: "Dates",
      done: !!(trip.startDate || trip.endDate),
      icon: "📅",
    },
    {
      label: "Crew in",
      done: crewIn,
      icon: "🙋",
    },
    {
      label: "Flights",
      done: trip.flightsBooked === true,
      icon: "✈️",
    },
    {
      label: "Lodging",
      done: trip.lodgingBooked === true,
      icon: "🏠",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="px-1 py-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Trip Progress</span>
        <span className="text-[10px] font-bold text-muted-foreground">{pct}%</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden mb-3">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <div className="flex gap-1">
        {steps.map((step, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            <div
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[11px] transition-all",
                step.done
                  ? "bg-violet-100 dark:bg-violet-900/40 ring-1 ring-violet-400"
                  : "bg-muted ring-1 ring-border opacity-50"
              )}
              title={step.label}
            >
              {step.done ? step.icon : <span className="text-muted-foreground text-[9px] font-bold">{i + 1}</span>}
            </div>
            <span className={cn("text-[8px] text-center leading-tight", step.done ? "text-violet-600 dark:text-violet-400 font-semibold" : "text-muted-foreground")}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Travel Workspace Panel ────────────────────────────────────────────────────
function TravelWorkspace({
  groupId,
  participantId,
  participantName,
  trip,
  alternatives,
  tabMode,
  onShareSummary,
  allParticipants,
  onTripUpdate,
}: {
  groupId: number;
  participantId: number;
  participantName: string;
  trip: TripPlan | null | undefined;
  alternatives: TripAlternative[];
  tabMode?: boolean;
  onShareSummary: () => void;
  allParticipants: { id: number; name: string }[];
  onTripUpdate?: () => void;
}) {
  const voteMutation = useVoteAlternative(groupId);
  const attendanceMutation = useUpdateAttendance(groupId);
  const lockMutation = useLockTrip(groupId);
  const unlockMutation = useUnlockTrip(groupId);

  const [progressCommitments, setProgressCommitments] = React.useState<{ flightBooked: boolean }[]>([]);
  React.useEffect(() => {
    fetch(`/api/groups/${groupId}/commitments`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setProgressCommitments(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [groupId]);

  const winnerAltId = trip?.winningAlternativeId;
  const isLocked = trip?.status === "Trip locked";

  const activeAlternatives = alternatives.filter((a) => a.status === "active");

  return (
    <aside
      className={cn(
        "flex flex-col bg-card border-l",
        tabMode
          ? "h-full w-full"
          : "h-full w-full"
      )}
    >
      {/* Sidebar header */}
      <div className={cn(
        "h-16 border-b flex items-center justify-between px-4 backdrop-blur-md shrink-0",
        isLocked
          ? "bg-emerald-50/80 dark:bg-emerald-950/30"
          : "bg-white/50 dark:bg-zinc-900/50"
      )}>
        <div className="flex items-center gap-2 font-bold text-primary">
          {isLocked ? <Lock className="w-4 h-4 text-emerald-600" /> : <Compass className="w-4 h-4" />}
          <span className="text-sm">{isLocked ? "Trip Locked 🔒" : "Trip Plan"}</span>
          </div>
        {!isLocked && (
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={onShareSummary} data-testid="button-share-trip-summary">
            <Share2 className="w-3.5 h-3.5" /> Share
          </Button>
        )}
      </div>

      {isLocked && trip ? (
        <LockedTripPanel
          trip={trip}
          groupId={groupId}
          participantName={participantName}
          onUnlock={() => unlockMutation.mutate()}
          isUnlocking={unlockMutation.isPending}
          onShareSummary={onShareSummary}
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20 md:pb-4">
          {/* Trip Progress Bar */}
          {trip && (
            <div className="rounded-xl border bg-card/80 px-3 py-2">
              <TripProgressBar
                trip={trip}
                commitments={progressCommitments}
                participantCount={allParticipants.length}
              />
            </div>
          )}

          {/* Trip Card */}
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 px-1">Current Plan</div>
            <TripCard
              trip={trip ?? null}
              winnerAlt={winnerAltId ? alternatives.find((a) => a.id === winnerAltId) ?? null : null}
              groupId={groupId}
              allParticipants={allParticipants}
            />
          </div>

          {/* Featured Flight */}
          {trip && (trip.flightSearchUrl || (trip as any).kayakUrl) && (
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 px-1">Book Flights</div>
              <FeaturedFlightCard trip={trip} groupId={groupId} onTripUpdate={onTripUpdate} />
            </div>
          )}

          {/* Featured Lodging */}
          {trip && ((trip as any).airbnbUrl || (trip as any).hotelsUrl) && (
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 px-1">Book Lodging</div>
              <FeaturedLodgingCard trip={trip} groupId={groupId} onTripUpdate={onTripUpdate} />
            </div>
          )}

          {/* Book-by Deadlines */}
          {trip && (
            <DeadlinesCard
              trip={trip}
              groupId={groupId}
              onTripUpdate={onTripUpdate}
            />
          )}

          {/* Commitment Cards */}
          {trip && allParticipants.length > 0 && (
            <CommitmentCards
              groupId={groupId}
              participantId={participantId}
              participants={allParticipants}
              lodgingType={(trip as any).airbnbUrl ? "rental" : (trip as any).hotelsUrl ? "hotel" : ((trip as any).lodgingType ?? null)}
              flightsRelevant={!!(trip.flightSearchUrl || (trip as any).kayakUrl || trip.flightsBooked)}
              lodgingRelevant={!!((trip as any).airbnbUrl || (trip as any).hotelsUrl || trip.lodgingBooked || trip.lodgingPreference)}
            />
          )}


          {/* My Status */}
          {(trip || activeAlternatives.length > 0) && (
            <div>
              <MyStatusCard
                groupId={groupId}
                participantId={participantId}
                alternatives={alternatives}
                trip={trip}
                attendanceMutation={attendanceMutation}
              />
            </div>
          )}

          {/* Alternatives */}
          {activeAlternatives.length > 0 && (
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 px-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Alternative Options
              </div>
              <div className="space-y-3">
                <AnimatePresence>
                  {activeAlternatives.map((alt) => (
                    <AlternativeCard
                      key={alt.id}
                      alt={alt}
                      groupId={groupId}
                      participantId={participantId}
                      isWinner={alt.id === winnerAltId}
                      tripStatus={trip?.status}
                      voteMutation={voteMutation}
                      attendanceMutation={attendanceMutation}
                      lockMutation={lockMutation}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="p-3 border-t bg-secondary/10 text-center text-[10px] text-muted-foreground shrink-0">
        {isLocked ? "Trip is locked — use the unlock button to make changes." : "Pip updates your plan as the conversation evolves."}
      </div>
    </aside>
  );
}

function PipThinkingBubble() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      className="flex items-start gap-2 max-w-[85%] sm:max-w-[75%]"
    >
      <PipAvatar />
      <div>
        <div className="text-[10px] font-bold text-violet-600 dark:text-violet-400 mb-1">Pip</div>
        <div className="px-4 py-2.5 rounded-2xl rounded-tl-none bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/30 dark:to-indigo-900/30 shadow-sm border border-violet-200/50 dark:border-violet-800/50 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Chat Messages ─────────────────────────────────────────────────────────────
function FlightPipMessage({ text, googleUrl, kayakUrl, time }: { text: string; googleUrl: string | null; kayakUrl: string | null; time: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2 max-w-[85%] sm:max-w-[75%]"
      data-testid="message-pip-flight"
    >
      <PipAvatar />
      <div>
        <div className="text-[10px] font-bold text-violet-600 dark:text-violet-400 mb-1">Pip</div>
        <div className="px-4 py-3 rounded-2xl rounded-tl-none text-sm leading-relaxed bg-gradient-to-br from-violet-100 to-indigo-100 text-violet-900 dark:from-violet-900/30 dark:to-indigo-900/30 dark:text-violet-100 shadow-sm border border-violet-200/50 dark:border-violet-800/50 space-y-3">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-violet-500" />
            <span>{text}</span>
          </div>
          {(googleUrl || kayakUrl) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {googleUrl && (
                <a
                  href={googleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/70 dark:bg-white/10 text-violet-700 dark:text-violet-300 border border-violet-300/50 dark:border-violet-600/50 hover:bg-white dark:hover:bg-white/20 transition-colors"
                >
                  <Plane className="w-3 h-3" /> Search Google Flights
                </a>
              )}
              {kayakUrl && (
                <a
                  href={kayakUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/70 dark:bg-white/10 text-violet-700 dark:text-violet-300 border border-violet-300/50 dark:border-violet-600/50 hover:bg-white dark:hover:bg-white/20 transition-colors"
                >
                  <Plane className="w-3 h-3" /> Check Kayak
                </a>
              )}
            </div>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground mt-1 opacity-60">{time}</span>
      </div>
    </motion.div>
  );
}

function LodgingPipMessage({ destination, airbnbUrl, hotelsUrl, time }: { destination: string; airbnbUrl: string | null; hotelsUrl: string | null; time: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2 max-w-[85%] sm:max-w-[75%]"
      data-testid="message-pip-lodging"
    >
      <PipAvatar />
      <div>
        <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mb-1">Pip</div>
        <div className="px-4 py-3 rounded-2xl rounded-tl-none text-sm leading-relaxed bg-gradient-to-br from-amber-100 to-orange-100 text-amber-900 dark:from-amber-900/30 dark:to-orange-900/30 dark:text-amber-100 shadow-sm border border-amber-200/50 dark:border-amber-800/50 space-y-3">
          <div className="flex items-start gap-2">
            <BedDouble className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <span>Here are some places to stay in {destination} — check the trip panel for quick access any time!</span>
          </div>
          {(airbnbUrl || hotelsUrl) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {airbnbUrl && (
                <a href={airbnbUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/70 dark:bg-white/10 text-amber-700 dark:text-amber-300 border border-amber-300/50 dark:border-amber-600/50 hover:bg-white dark:hover:bg-white/20 transition-colors">
                  <BedDouble className="w-3 h-3" /> Search Airbnb
                </a>
              )}
              {hotelsUrl && (
                <a href={hotelsUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/70 dark:bg-white/10 text-amber-700 dark:text-amber-300 border border-amber-300/50 dark:border-amber-600/50 hover:bg-white dark:hover:bg-white/20 transition-colors">
                  <BedDouble className="w-3 h-3" /> Search Booking.com
                </a>
              )}
            </div>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground mt-1 opacity-60">{time}</span>
      </div>
    </motion.div>
  );
}

// ─── Activity Suggestions ──────────────────────────────────────────────────────
function ActivityPipMessage({ destination, items, groupId, participantName, time }: {
  destination: string;
  items: { emoji: string; title: string; category: string }[];
  groupId: number;
  participantName: string;
  time: string;
}) {
  const addPin = useAddPin(groupId);
  // Show 4 at a time, keep the rest as a reserve pool to swap in
  const [visible, setVisible] = useState(() => items.slice(0, 4));
  const [pool, setPool] = useState(() => items.slice(4));
  const [added, setAdded] = useState<Set<string>>(new Set());

  const searchUrl = (title: string) =>
    `https://www.google.com/search?q=${encodeURIComponent(`${title} ${destination}`)}`;

  const handleAdd = (item: { emoji: string; title: string; category: string }) => {
    if (added.has(item.title)) return;
    addPin.mutate({ title: item.title, emoji: item.emoji, category: item.category, addedByName: participantName });
    setAdded(prev => new Set(prev).add(item.title));
    // Swap pinned item out for next from pool
    setVisible(prev => {
      const next = pool[0];
      if (!next) return prev; // pool exhausted, leave as-is
      setPool(p => p.slice(1));
      return prev.map(v => v.title === item.title ? next : v);
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2 max-w-[92%]"
      data-testid="message-pip-activity"
    >
      <PipAvatar />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold text-violet-600 dark:text-violet-400 mb-1">Pip</div>
        <div className="px-4 py-3 rounded-2xl rounded-tl-none bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/30 dark:to-indigo-900/30 border border-violet-200/50 dark:border-violet-800/50 shadow-sm">
          <p className="text-sm font-semibold text-violet-900 dark:text-violet-100 mb-3">
            Here's what you can do in {destination} — tap + to pin, or the title to explore! 📌
          </p>
          <div className="flex flex-col gap-1.5">
            <AnimatePresence mode="popLayout">
              {visible.map((item) => {
                const isPinned = added.has(item.title);
                return (
                  <motion.div
                    key={item.title}
                    layout
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.18 }}
                    className={cn(
                      "flex items-center rounded-xl text-sm font-medium border overflow-hidden transition-colors",
                      isPinned
                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-300/50"
                        : "bg-white/70 dark:bg-white/10 text-violet-800 dark:text-violet-200 border-violet-200/40"
                    )}
                  >
                    {/* Clickable title — opens Google search */}
                    <a
                      href={searchUrl(item.title)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 flex-1 px-3 py-2.5 hover:underline"
                      onClick={e => e.stopPropagation()}
                    >
                      <span className="text-lg leading-none shrink-0">{item.emoji}</span>
                      <span className="leading-snug">{item.title}</span>
                    </a>
                    {/* Pin button */}
                    <button
                      onClick={() => handleAdd(item)}
                      disabled={isPinned}
                      className="shrink-0 w-10 self-stretch flex items-center justify-center border-l border-current/10 hover:bg-white/30 disabled:cursor-default transition-colors text-base"
                    >
                      {isPinned ? "✓" : "+"}
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
          {pool.length === 0 && added.size > 0 && (
            <p className="text-[10px] text-violet-500/70 mt-2 text-center">All suggestions explored! 🎉</p>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground mt-1 opacity-60">{time}</span>
      </div>
    </motion.div>
  );
}

function PipMessage({ content, time, groupId, participantName }: { content: string; time: string; groupId: number; participantName: string }) {
  if (content.startsWith("FLIGHT_REC:")) {
    try {
      const payload = JSON.parse(content.slice("FLIGHT_REC:".length));
      return <FlightPipMessage text={payload.text} googleUrl={payload.googleUrl} kayakUrl={payload.kayakUrl} time={time} />;
    } catch {
      // fall through to plain render
    }
  }
  if (content.startsWith("LODGING_REC:")) {
    try {
      const payload = JSON.parse(content.slice("LODGING_REC:".length));
      return <LodgingPipMessage destination={payload.destination} airbnbUrl={payload.airbnbUrl} hotelsUrl={payload.hotelsUrl} time={time} />;
    } catch {
      // fall through to plain render
    }
  }
  if (content.startsWith("ACTIVITY_REC:")) {
    try {
      const payload = JSON.parse(content.slice("ACTIVITY_REC:".length));
      return <ActivityPipMessage destination={payload.destination} items={payload.items} groupId={groupId} participantName={participantName} time={time} />;
    } catch {
      // fall through to plain render
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2 max-w-[85%] sm:max-w-[75%]"
      data-testid="message-pip"
    >
      <PipAvatar />
      <div>
        <div className="text-[10px] font-bold text-violet-600 dark:text-violet-400 mb-1">Pip</div>
        <div className="px-4 py-2.5 rounded-2xl rounded-tl-none text-sm leading-relaxed bg-gradient-to-br from-violet-100 to-indigo-100 text-violet-900 dark:from-violet-900/30 dark:to-indigo-900/30 dark:text-violet-100 shadow-sm border border-violet-200/50 dark:border-violet-800/50">
          {content}
        </div>
        <span className="text-[10px] text-muted-foreground mt-1 opacity-60">{time}</span>
      </div>
    </motion.div>
  );
}

function getLinkMeta(url: string): { label: string; icon: string; color: string } {
  if (/airbnb\.com/i.test(url)) return { label: "Airbnb", icon: "🏠", color: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800" };
  if (/vrbo\.com/i.test(url)) return { label: "VRBO", icon: "🏠", color: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800" };
  if (/booking\.com/i.test(url)) return { label: "Booking.com", icon: "🏨", color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800" };
  if (/hotels\.com/i.test(url)) return { label: "Hotels.com", icon: "🏨", color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800" };
  if (/google\.com\/travel\/flights/i.test(url)) return { label: "Google Flights", icon: "✈️", color: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800" };
  if (/kayak\.com/i.test(url)) return { label: "Kayak", icon: "✈️", color: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800" };
  if (/skyscanner/i.test(url)) return { label: "Skyscanner", icon: "✈️", color: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800" };
  if (/expedia\.com/i.test(url)) return { label: "Expedia", icon: "✈️", color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800" };
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return { label: host, icon: "🔗", color: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700" };
  } catch {
    return { label: "Link", icon: "🔗", color: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700" };
  }
}

function renderMessageContent(content: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const pipRegex = /(@pip\b)/gi;
  const parts = content.split(/(https?:\/\/[^\s]+|@pip\b)/gi);
  return parts.map((part, i) => {
    if (/^@pip$/i.test(part)) {
      return <span key={i} className="font-semibold text-violet-500 dark:text-violet-400">{part}</span>;
    }
    if (urlRegex.test(part)) {
      urlRegex.lastIndex = 0;
      const meta = getLinkMeta(part);
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium mx-0.5 no-underline hover:opacity-80 transition-opacity", meta.color)}
          onClick={e => e.stopPropagation()}
        >
          <span>{meta.icon}</span>
          <span>{meta.label}</span>
        </a>
      );
    }
    return part;
  });
}

function UserMessage({ content, name, isMe, time }: { content: string; name: string; isMe: boolean; time: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex flex-col max-w-[85%] sm:max-w-[70%]", isMe ? "ml-auto items-end" : "items-start")}
      data-testid={isMe ? "message-mine" : "message-other"}
    >
      {!isMe && <span className="text-xs font-semibold text-muted-foreground mb-1">{name}</span>}
      <div className={cn(
        "px-4 py-2 rounded-2xl text-sm shadow-sm leading-relaxed break-all",
        isMe
          ? "bg-primary text-primary-foreground rounded-tr-none"
          : "bg-white dark:bg-zinc-800 border rounded-tl-none"
      )}>
        {renderMessageContent(content)}
      </div>
      <span className="text-[10px] text-muted-foreground mt-1 opacity-60">{time}</span>
    </motion.div>
  );
}

function SystemMessage({ content, time }: { content: string; time: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-center my-1"
      data-testid="message-system"
    >
      <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-[11px] border border-border/50">
        {content}
        <span className="ml-1.5 opacity-50">{time}</span>
      </span>
    </motion.div>
  );
}

// ─── Group Page (Main) ────────────────────────────────────────────────────────
export default function GroupPage() {
  const [match, params] = useRoute("/g/:slug");
  const slug = match ? params.slug : "";
  const [, setLocation] = useLocation();

  const { data: group, isLoading: groupLoading, error: groupError } = useGroup(slug);
  // useMessages returns all messages (user + pip) already interleaved and sorted by the server
  const { data: messages } = useMessages(group?.id ?? 0);
  const { data: trip, refetch: refetchTrip } = useTripPlan(group?.id ?? 0);
  const { data: alternatives = [] } = useTripAlternatives(group?.id ?? 0);

  const joinGroup = useJoinGroup();
  const sendMessage = useSendMessage();

  const { toast } = useToast();
  const [messageText, setMessageText] = useState("");
  const [pastedLinks, setPastedLinks] = useState<{ url: string }[]>([]);
  const [participantId, setParticipantId] = useState<number | null>(null);
  const [forceShowJoin, setForceShowJoin] = useState(false);
  const [mobileTab, setMobileTab] = useState<"chat" | "plan">("chat");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmails, setInviteEmails] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const prevPipCountRef = useRef(0);
  const prevMsgCountRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isTyping = messageText.trim().length > 0;
  const { otherOnline, typingUsers, pipIsThinking } = usePresence(group?.id ?? 0, participantId, isTyping);
  const prevTripStatusRef = useRef<string | null | undefined>(undefined);
  const isLocked = trip?.status === "Trip locked";

  // Fire confetti + auto-switch to plan tab when trip becomes locked
  useEffect(() => {
    const prev = prevTripStatusRef.current;
    const current = trip?.status;
    if (prev !== undefined && prev !== "Trip locked" && current === "Trip locked") {
      setMobileTab("plan");
      const fire = (particleRatio: number, opts: object) =>
        confetti({ origin: { y: 0.6 }, ...opts, particleCount: Math.floor(200 * particleRatio) });
      fire(0.25, { spread: 26, startVelocity: 55 });
      fire(0.2, { spread: 60 });
      fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
      fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
      fire(0.1, { spread: 120, startVelocity: 45 });
    }
    prevTripStatusRef.current = current;
  }, [trip?.status]);

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/g/${slug}`);
    toast({ title: "Link Copied!", description: "Share it with your crew." });
  };

  const sendInvites = async () => {
    if (!group) return;
    const emails = inviteEmails.split(/[\s,;]+/).map(e => e.trim()).filter(e => e.includes("@"));
    if (emails.length === 0) return;
    setInviteSending(true);
    try {
      const token = localStorage.getItem("siftchat_token");
      const res = await fetch(`/api/groups/${group.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ emails }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: "Error", description: data.message, variant: "destructive" }); return; }
      toast({ title: `Invite${data.sent !== 1 ? "s" : ""} sent!`, description: `${data.sent} email${data.sent !== 1 ? "s" : ""} sent.` });
      setInviteEmails("");
      setShowInvite(false);
    } catch {
      toast({ title: "Failed to send", description: "Check your connection.", variant: "destructive" });
    } finally {
      setInviteSending(false);
    }
  };

  const shareTripSummary = () => {
    const t = trip;
    const groupName = group?.name ?? "";
    const allParticipants = group?.participants ?? [];

    // Derive effective plan from winner alternative when one is locked in
    const winnerAlt = t?.winningAlternativeId
      ? alternatives.find((a) => a.id === t.winningAlternativeId) ?? null
      : null;
    const effectiveDest = winnerAlt?.destination || t?.destination;
    const effectiveDates = winnerAlt?.dateRange
      || ([t?.startDate, t?.endDate].filter(Boolean).join(" → ") || null);
    const effectiveBudget = winnerAlt?.budgetBand || t?.budgetBand;

    let text = `🌍 ${groupName}\n`;
    if (effectiveDest) text += `📍 ${effectiveDest}\n`;
    if (effectiveDates) text += `📅 ${effectiveDates}\n`;
    if (effectiveBudget) text += `💰 ${effectiveBudget}\n`;
    if (t?.lodgingPreference) text += `🏨 ${t.lodgingPreference}\n`;
    if (t?.flightsBooked) text += `✅ Flights booked!\n`;

    // Compute attendee lists with named still-deciding derived from full participant list
    const committed = (winnerAlt?.committedAttendeeNames ?? t?.committedAttendeeNames ?? []);
    const likely = (winnerAlt?.likelyAttendeeNames ?? t?.likelyAttendeeNames ?? []);
    const knownNames = new Set([...committed, ...likely].map((n) => n.toLowerCase()));
    const stillDeciding = allParticipants
      .filter((p) => !knownNames.has(p.name.toLowerCase()))
      .map((p) => p.name);

    if (committed.length) text += `\n✅ Committed: ${committed.join(", ")}`;
    if (likely.length) text += `\n👍 Likely going: ${likely.join(", ")}`;
    if (stillDeciding.length) text += `\n❓ Still deciding: ${stillDeciding.join(", ")}`;

    if (t?.status === "Trip locked") text += `\n\n🔒 Trip locked!`;
    else if (t?.status) text += `\n\n⚡ Status: ${t.status}`;
    text += `\n🔗 Join the planning: ${window.location.origin}/g/${slug}`;
    navigator.clipboard.writeText(text);
    toast({ title: "Trip Summary Copied!", description: "Paste it in your group chat." });
  };

  const storedParticipantId = slug ? localStorage.getItem(`evite_participant_${slug}`) : null;
  const participants = group?.participants;
  const myName = participants?.find(p => p.id === participantId)?.name ?? "You";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const pipCount = messages?.filter(m => m.isPip).length ?? 0;
    const msgCount = messages?.length ?? 0;
    prevPipCountRef.current = pipCount;
    prevMsgCountRef.current = msgCount;
  }, [messages]);

  const handleJoin = async (name: string) => {
    try {
      const participant = await joinGroup.mutateAsync({ slug, name });
      localStorage.setItem(`evite_participant_${slug}`, String(participant.id));
      setParticipantId(participant.id);
      setForceShowJoin(false);
    } catch {
      // Handled in hook
    }
  };

  const handleContinueAsExisting = () => {
    if (storedParticipantId) setParticipantId(Number(storedParticipantId));
  };

  const handleJoinAsNew = () => {
    localStorage.removeItem(`evite_participant_${slug}`);
    setForceShowJoin(true);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const linkSuffix = pastedLinks.map(l => l.url).join(" ");
    const fullContent = [messageText.trim(), linkSuffix].filter(Boolean).join(" ");
    if (!fullContent || !group || !participantId) return;
    setMessageText("");
    setPastedLinks([]);
    try {
      await sendMessage.mutateAsync({ groupId: group.id, participantId, content: fullContent });
    } catch {
      setMessageText(messageText);
    }
  };

  // ── Loading / Error states ──
  if (groupLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (groupError || !group) {
    return (
      <div className="h-screen flex items-center justify-center text-destructive">
        Group not found
      </div>
    );
  }

  // ── Welcome Back flow ──
  const validStoredParticipant = storedParticipantId && participants
    ? participants.find((p) => p.id === Number(storedParticipantId))
    : null;

  // If logged in, auto-continue — no need to ask
  const loggedInUser = getStoredUser();
  if (validStoredParticipant && !participantId && !forceShowJoin) {
    if (loggedInUser) {
      // Auto-continue silently
      handleContinueAsExisting();
      return null;
    }
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50 dark:from-violet-950/20 dark:via-background dark:to-indigo-950/20 flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white dark:bg-zinc-900 rounded-3xl p-8 shadow-2xl border border-primary/10 w-full max-w-md text-center"
        >
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent mx-auto mb-6 flex items-center justify-center">
            <Globe className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold font-display mb-2">Welcome Back!</h2>
          <p className="text-muted-foreground mb-6">
            Continue planning as <span className="font-semibold text-primary">{validStoredParticipant.name}</span>?
          </p>
          <div className="space-y-3">
            <Button className="w-full h-12 rounded-xl text-base" onClick={handleContinueAsExisting} data-testid="button-continue-as">
              Continue as {validStoredParticipant.name}
            </Button>
            <Button variant="outline" className="w-full h-12 rounded-xl text-base" onClick={handleJoinAsNew} data-testid="button-join-as-new">
              Join as someone else
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!participantId) {
    return <JoinModal groupName={group.name} onJoin={handleJoin} isLoading={joinGroup.isPending} />;
  }

  // ── Main layout ──
  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* ── LEFT: Chat Panel ── */}
      <div className={cn(
        "flex flex-col h-full relative min-w-0",
        "md:flex",
        mobileTab === "plan" ? "hidden" : "flex",
        "pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0",
        isLocked ? "md:w-80 lg:w-96" : "flex-1"
      )}>
        {/* Header */}
        <header className="min-h-16 border-b flex items-center justify-between px-4 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10 shrink-0 pb-4 pt-[calc(1rem+env(safe-area-inset-top))]">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={() => setLocation("/")}
              className="shrink-0 p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              title="My trips"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                <path d="M10 13L5 8L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div className="font-bold text-lg truncate font-display">{group.name}</div>
          </div>

          {/* Online presence avatars */}
          {otherOnline.length > 0 && (
            <div
              className="flex items-center gap-1 shrink-0 mx-2"
              data-testid="presence-avatars"
              aria-label={`${otherOnline.length} other${otherOnline.length !== 1 ? "s" : ""} online`}
            >
              <div className="flex -space-x-1.5">
                {otherOnline.slice(0, 4).map((u) => (
                  <PresenceAvatar key={u.participantId} name={u.name} size="sm" />
                ))}
                {otherOnline.length > 4 && (
                  <div className="h-7 w-7 rounded-full bg-muted border border-background flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                    +{otherOnline.length - 4}
                  </div>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground hidden sm:inline ml-1" data-testid="presence-count">
                {otherOnline.length} online
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => setShowInvite(true)}
            >
              <Mail className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Invite</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={copyLink}
              data-testid="button-copy-link-header"
            >
              <Copy className="w-3.5 h-3.5" />
              <span className="hidden sm:inline ml-1.5">Copy Link</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={shareTripSummary}
              data-testid="button-share-summary-header"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline ml-1.5">Share</span>
            </Button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="messages-container">
          <div className="text-center text-xs text-muted-foreground my-4">
            Group created {format(new Date(group.createdAt ?? new Date()), "MMM d, yyyy")}
          </div>

          <AnimatePresence initial={false}>
            {messages?.map((msg) => {
              const time = format(new Date(msg.createdAt ?? new Date()), "h:mm a");
              if (msg.isPip) {
                return <PipMessage key={`pip-${msg.id}`} content={msg.content} time={time} groupId={group.id} participantName={group.participants?.find(p => p.id === participantId)?.name ?? "You"} />;
              }
              if (!msg.participantId && !msg.isPip) {
                return <SystemMessage key={`sys-${msg.id}`} content={msg.content} time={time} />;
              }
              return (
                <UserMessage
                  key={msg.id}
                  content={msg.content}
                  name={msg.participantName}
                  isMe={msg.participantId === participantId}
                  time={time}
                />
              );
            })}
            {pipIsThinking && <PipThinkingBubble key="pip-thinking" />}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <TypingIndicator names={typingUsers.map((u) => u.name)} />
        )}

        {/* Input */}
        <div className="p-4 bg-background border-t shrink-0">
          {pastedLinks.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2 max-w-4xl mx-auto">
              {pastedLinks.map((link, i) => {
                const meta = getLinkMeta(link.url);
                return (
                  <span key={i} className={cn("inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full border text-xs font-medium", meta.color)}>
                    <span>{meta.icon}</span>
                    <span>{meta.label}</span>
                    <button
                      type="button"
                      onClick={() => setPastedLinks(l => l.filter((_, j) => j !== i))}
                      className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity rounded-full hover:bg-black/10 p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <form onSubmit={handleSend} className="flex gap-2 max-w-4xl mx-auto">
            <Input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                const urls = text.match(/https?:\/\/[^\s]+/g);
                if (urls && urls.length > 0) {
                  e.preventDefault();
                  const stripped = text.replace(/https?:\/\/[^\s]+/g, "").trim();
                  if (stripped) setMessageText(prev => (prev + (prev ? " " : "") + stripped).trim());
                  setPastedLinks(prev => [...prev, ...urls.map(url => ({ url }))]);
                }
              }}
              placeholder="Message the group, or @pip to ask Pip directly…"
              className="rounded-full pl-6 bg-secondary/50 border-transparent focus:bg-background focus:border-primary/20 transition-all shadow-inner"
              data-testid="input-message"
            />
            <Button
              type="submit"
              size="icon"
              className="rounded-full h-10 w-10 shrink-0 shadow-md"
              disabled={(!messageText.trim() && pastedLinks.length === 0) || sendMessage.isPending}
              data-testid="button-send"
            >
              {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
            </Button>
          </form>
        </div>
      </div>

      {/* ── RIGHT: Travel Workspace ──
           Tablet+: side-by-side (md:block). Mobile: tab-switched ── */}
      <div className={cn(
        "md:block md:h-full md:overflow-hidden",
        mobileTab === "plan" ? "block h-full flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0" : "hidden",
        isLocked ? "md:flex-1" : "md:w-80 lg:w-96 xl:w-[420px]"
      )}>
        <TravelWorkspace
          groupId={group.id}
          participantId={participantId}
          participantName={myName}
          trip={trip}
          alternatives={alternatives}
          tabMode={mobileTab === "plan"}
          onShareSummary={shareTripSummary}
          allParticipants={group.participants ?? []}
          onTripUpdate={refetchTrip}
        />
      </div>

      {/* ── Mobile Bottom Tab Bar ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur-md flex pb-safe-bottom">
        <button
          className={cn(
            "flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors",
            mobileTab === "chat" ? "text-primary" : "text-muted-foreground"
          )}
          onClick={() => setMobileTab("chat")}
          data-testid="tab-chat"
        >
          <MessageCircle className="w-5 h-5" />
          Chat
        </button>
        <button
          className={cn(
            "flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors relative",
            mobileTab === "plan" ? "text-primary" : "text-muted-foreground"
          )}
          onClick={() => setMobileTab("plan")}
          data-testid="tab-plan"
        >
          <MapIcon className="w-5 h-5" />
          Trip Plan
          {trip?.status && trip.status !== "Early ideas" && (
            <span className="absolute top-2 right-6 w-2 h-2 bg-primary rounded-full" />
          )}
        </button>
      </div>

      {/* Invite Modal */}
      <AnimatePresence>
        {showInvite && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowInvite(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: "spring", duration: 0.3 }}
              onClick={e => e.stopPropagation()}
              className="bg-card border border-border rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-black">Invite friends</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">They'll get an email with a join link.</p>
                </div>
                <button onClick={() => setShowInvite(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <textarea
                className="w-full rounded-2xl bg-secondary/40 border border-border/60 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60 min-h-[90px]"
                placeholder="friend@gmail.com, another@gmail.com"
                value={inviteEmails}
                onChange={e => setInviteEmails(e.target.value)}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground mt-1.5 mb-4">Separate multiple emails with commas or spaces.</p>

              <Button
                className="w-full rounded-2xl font-semibold h-11"
                onClick={sendInvites}
                disabled={inviteSending || !inviteEmails.trim()}
                isLoading={inviteSending}
              >
                <Mail className="w-4 h-4 mr-2" /> Send Invites
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
