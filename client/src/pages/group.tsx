import React, { useEffect, useState, useRef } from "react";
import { useRoute } from "wouter";
import { useGroup, useJoinGroup } from "@/hooks/use-groups";
import { useMessages, useSendMessage } from "@/hooks/use-messages";
import { useTripPlan, useTripAlternatives, useVoteAlternative, useUpdateAttendance } from "@/hooks/use-trip";
import { usePresence } from "@/hooks/use-presence";
import { Button } from "@/components/ui/button-animated";
import { Input } from "@/components/ui/input";
import { ShinyCard } from "@/components/ui/shiny-card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { format } from "date-fns";
import {
  Send, Sparkles, Copy, Share2, Loader2, MapPin, Calendar,
  DollarSign, BedDouble, TrendingUp, CheckCircle2, HelpCircle,
  MessageCircle, ThumbsUp, Star, ChevronDown, ChevronUp, Plane,
  Heart, AlertCircle, UserCheck,
} from "lucide-react";
import type { TripPlan, TripAlternative, CommitmentLevel } from "@shared/schema";

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

// ─── Confidence Pill ───────────────────────────────────────────────────────────
function ConfidencePill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    "Early ideas": "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    "Narrowing options": "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
    "Almost decided": "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    "Trip locked": "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  };
  const icons: Record<string, React.ReactNode> = {
    "Early ideas": <Sparkles className="w-3 h-3" />,
    "Narrowing options": <TrendingUp className="w-3 h-3" />,
    "Almost decided": <Star className="w-3 h-3" />,
    "Trip locked": <CheckCircle2 className="w-3 h-3" />,
  };
  return (
    <span
      data-testid="status-confidence-pill"
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold",
        styles[status] ?? styles["Early ideas"]
      )}
    >
      {icons[status] ?? icons["Early ideas"]}
      {status}
    </span>
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
            <Plane className="w-6 h-6" />
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
function TripCard({ trip, winnerAlt }: { trip: TripPlan | null; winnerAlt?: TripAlternative | null }) {
  if (!trip) {
    return (
      <div className="rounded-2xl border border-primary/10 bg-gradient-to-br from-violet-50/60 to-indigo-50/60 dark:from-violet-950/20 dark:to-indigo-950/20 p-5">
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/50 gap-3">
          <Plane className="w-8 h-8 opacity-40" />
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

  const likelyNames = (winnerAlt?.likelyAttendeeNames ?? trip.likelyAttendeeNames) ?? [];
  const committedNames = (winnerAlt?.committedAttendeeNames ?? trip.committedAttendeeNames) ?? [];

  return (
    <motion.div
      layout
      className={cn(
        "rounded-2xl border p-5 space-y-4",
        winnerAlt
          ? "border-emerald-300 dark:border-emerald-700 bg-gradient-to-br from-emerald-50/60 to-teal-50/60 dark:from-emerald-950/20 dark:to-teal-950/20"
          : "border-primary/10 bg-gradient-to-br from-violet-50/60 to-indigo-50/60 dark:from-violet-950/20 dark:to-indigo-950/20"
      )}
    >
      {winnerAlt && (
        <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold uppercase tracking-widest">
          <Star className="w-3.5 h-3.5" /> Winning Option — {winnerAlt.aiSummary || winnerAlt.destination}
        </div>
      )}
      <div className="space-y-3">
        <TripField icon={<MapPin className="w-4 h-4" />} label="Destination" value={effectiveDest} placeholder="Undecided" />
        <TripField icon={<Calendar className="w-4 h-4" />} label="Dates" value={effectiveDates} placeholder="Dates TBD" />
        <TripField icon={<DollarSign className="w-4 h-4" />} label="Budget" value={effectiveBudget} placeholder="Budget TBD" />
        <TripField icon={<BedDouble className="w-4 h-4" />} label="Lodging" value={trip.lodgingPreference} placeholder="Lodging TBD" />
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground/60 shrink-0"><Plane className="w-4 h-4" /></span>
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

      <div className="pt-2 border-t border-primary/10 space-y-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1.5 flex items-center gap-1">
            <UserCheck className="w-3 h-3" /> Committed
          </div>
          {committedNames.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {committedNames.map((name) => (
                <Badge key={name} className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800 text-xs px-2 py-0.5">
                  {name}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/50 italic">No commitments yet</span>
          )}
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-1.5 flex items-center gap-1">
            <Heart className="w-3 h-3" /> Likely going
          </div>
          {likelyNames.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {likelyNames.map((name) => (
                <Badge key={name} variant="outline" className="bg-indigo-50/60 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-800 text-xs px-2 py-0.5">
                  {name}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/50 italic">No likely attendees yet</span>
          )}
        </div>
      </div>

      <div className="pt-2 border-t border-primary/10">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Confidence</span>
          <span className="text-xs font-bold text-primary">
            {(trip.confidenceScore ?? 0) > 0 ? `${trip.confidenceScore}%` : "Calculating…"}
          </span>
        </div>
        <div className="h-1.5 bg-primary/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${trip.confidenceScore ?? 0}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      </div>

      {trip.updatedAt && (
        <div className="text-[10px] text-muted-foreground/60 text-right" data-testid="text-last-updated">
          Last updated {format(new Date(trip.updatedAt), "MMM d, h:mm a")}
        </div>
      )}
    </motion.div>
  );
}

// ─── Planning Signals Strip ─────────────────────────────────────────────────────
function PlanningSignalsStrip({ trip }: { trip: TripPlan | null }) {
  if (!trip) return null;

  const chips: { label: string; color: string; icon: React.ReactNode }[] = [];

  if (trip.destination) chips.push({ label: trip.destination, color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300", icon: <MapPin className="w-3 h-3" /> });
  if (trip.startDate) chips.push({ label: trip.startDate, color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300", icon: <Calendar className="w-3 h-3" /> });
  if (trip.endDate && trip.endDate !== trip.startDate) chips.push({ label: `→ ${trip.endDate}`, color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300", icon: <Calendar className="w-3 h-3" /> });
  if (trip.budgetBand) chips.push({ label: trip.budgetBand, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", icon: <DollarSign className="w-3 h-3" /> });
  if (trip.flightsBooked) chips.push({ label: "Flights booked ✓", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", icon: <Plane className="w-3 h-3" /> });
  if (trip.lodgingPreference) chips.push({ label: trip.lodgingPreference, color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300", icon: <BedDouble className="w-3 h-3" /> });

  const questions = trip.unresolvedQuestions ?? [];
  const committed = trip.committedAttendeeNames ?? [];
  const likely = trip.likelyAttendeeNames ?? [];

  if (chips.length === 0 && questions.length === 0 && committed.length === 0 && likely.length === 0) return null;

  return (
    <div className="space-y-2">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip, i) => (
            <span
              key={i}
              className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium", chip.color)}
              data-testid={`chip-signal-${i}`}
            >
              {chip.icon}
              {chip.label}
            </span>
          ))}
        </div>
      )}
      {/* Attendance signal chips */}
      {(committed.length > 0 || likely.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {committed.map((name, i) => (
            <span key={`c-${i}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" data-testid={`chip-attendance-committed-${i}`}>
              <UserCheck className="w-3 h-3" /> {name} ✓
            </span>
          ))}
          {likely.map((name, i) => (
            <span key={`l-${i}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300" data-testid={`chip-attendance-likely-${i}`}>
              <Heart className="w-3 h-3" /> {name}
            </span>
          ))}
        </div>
      )}
      {questions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {questions.map((q, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              data-testid={`chip-question-${i}`}
            >
              <HelpCircle className="w-3 h-3" />
              {q}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

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
    { level: "interested", label: "Interested", color: "bg-zinc-100 text-zinc-600 hover:bg-zinc-200" },
    { level: "likely", label: "Likely", color: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100" },
    { level: "committed", label: "I'm in", color: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
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

// ─── Alternative Card ──────────────────────────────────────────────────────────
function AlternativeCard({
  alt,
  groupId,
  participantId,
  isWinner,
  voteMutation,
  attendanceMutation,
}: {
  alt: TripAlternative;
  groupId: number;
  participantId: number;
  isWinner: boolean;
  voteMutation: ReturnType<typeof useVoteAlternative>;
  attendanceMutation: ReturnType<typeof useUpdateAttendance>;
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
        {alt.budgetBand && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
            <DollarSign className="w-3 h-3" /> {alt.budgetBand}
          </span>
        )}
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
          {likelyNames.map((name) => (
            <Badge key={`l-${name}`} variant="outline" className="text-[10px] px-1.5 py-0 text-indigo-700 border-indigo-200 dark:text-indigo-300">
              {name}
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
    </motion.div>
  );
}

// ─── Travel Workspace Panel ────────────────────────────────────────────────────
function TravelWorkspace({
  groupId,
  participantId,
  trip,
  alternatives,
  tabMode,
  onCopyLink,
  onShareSummary,
}: {
  groupId: number;
  participantId: number;
  trip: TripPlan | null | undefined;
  alternatives: TripAlternative[];
  tabMode?: boolean;
  onCopyLink: () => void;
  onShareSummary: () => void;
}) {
  const voteMutation = useVoteAlternative(groupId);
  const attendanceMutation = useUpdateAttendance(groupId);

  const winnerAltId = trip?.winningAlternativeId;

  const activeAlternatives = alternatives.filter((a) => a.status === "active");

  return (
    <aside
      className={cn(
        "flex flex-col bg-card border-l",
        tabMode
          ? "h-full w-full"
          : "h-full w-96 xl:w-[420px]"
      )}
    >
      {/* Sidebar header */}
      <div className="h-16 border-b flex items-center justify-between px-4 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2 font-bold text-primary">
          <Plane className="w-4 h-4" />
          <span className="text-sm">Trip Plan</span>
          {trip?.status && <ConfidencePill status={trip.status} />}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20 lg:pb-4">
        {/* Action buttons */}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 gap-1.5 rounded-xl text-xs h-9" onClick={onCopyLink} data-testid="button-copy-link">
            <Copy className="w-3.5 h-3.5" /> Invite Link
          </Button>
          <Button variant="outline" className="flex-1 gap-1.5 rounded-xl text-xs h-9" onClick={onShareSummary} data-testid="button-share-trip-summary">
            <Share2 className="w-3.5 h-3.5" /> Share Summary
          </Button>
        </div>

          {/* Trip Card */}
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 px-1">Current Plan</div>
            <TripCard
              trip={trip ?? null}
              winnerAlt={winnerAltId ? alternatives.find((a) => a.id === winnerAltId) ?? null : null}
            />
          </div>

          {/* Planning Signals */}
          {trip && (
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 px-1">Detected Signals</div>
              <PlanningSignalsStrip trip={trip} />
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
                      voteMutation={voteMutation}
                      attendanceMutation={attendanceMutation}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>

        <div className="p-3 border-t bg-secondary/10 text-center text-[10px] text-muted-foreground shrink-0">
          Pip updates your plan as the conversation evolves.
        </div>
      </aside>
  );
}

// ─── Chat Messages ─────────────────────────────────────────────────────────────
function PipMessage({ content, time }: { content: string; time: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2 max-w-[85%] sm:max-w-[75%]"
      data-testid="message-pip"
    >
      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
        <Sparkles className="w-3.5 h-3.5 text-white" />
      </div>
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
        "px-4 py-2 rounded-2xl text-sm shadow-sm leading-relaxed break-words",
        isMe
          ? "bg-primary text-primary-foreground rounded-tr-none"
          : "bg-white dark:bg-zinc-800 border rounded-tl-none"
      )}>
        {content}
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

  const { data: group, isLoading: groupLoading, error: groupError } = useGroup(slug);
  // useMessages returns all messages (user + pip) already interleaved and sorted by the server
  const { data: messages } = useMessages(group?.id ?? 0);
  const { data: trip } = useTripPlan(group?.id ?? 0);
  const { data: alternatives = [] } = useTripAlternatives(group?.id ?? 0);

  const joinGroup = useJoinGroup();
  const sendMessage = useSendMessage();

  const { toast } = useToast();
  const [messageText, setMessageText] = useState("");
  const [participantId, setParticipantId] = useState<number | null>(null);
  const [forceShowJoin, setForceShowJoin] = useState(false);
  const [mobileTab, setMobileTab] = useState<"chat" | "plan">("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isTyping = messageText.trim().length > 0;
  const { otherOnline, typingUsers } = usePresence(group?.id ?? 0, participantId, isTyping);

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/g/${slug}`);
    toast({ title: "Link Copied!", description: "Share it with your crew." });
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

    let text = `✈️ ${groupName}\n`;
    if (effectiveDest) text += `📍 ${effectiveDest}\n`;
    if (effectiveDates) text += `📅 ${effectiveDates}\n`;
    if (effectiveBudget) text += `💰 ${effectiveBudget}\n`;
    if (t?.lodgingPreference) text += `🏨 ${t.lodgingPreference}\n`;
    if (t?.flightsBooked) text += `✈️ Flights booked!\n`;

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
    if (!messageText.trim() || !group || !participantId) return;
    const content = messageText;
    setMessageText("");
    try {
      await sendMessage.mutateAsync({ groupId: group.id, participantId, content });
    } catch {
      setMessageText(content);
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

  if (validStoredParticipant && !participantId && !forceShowJoin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50 dark:from-violet-950/20 dark:via-background dark:to-indigo-950/20 flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white dark:bg-zinc-900 rounded-3xl p-8 shadow-2xl border border-primary/10 w-full max-w-md text-center"
        >
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent mx-auto mb-6 flex items-center justify-center">
            <Plane className="w-8 h-8 text-white" />
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
        "flex-1 flex flex-col h-full relative min-w-0",
        "lg:flex",
        mobileTab === "plan" ? "hidden" : "flex",
        "pb-14 lg:pb-0" // bottom padding clears the fixed mobile tab bar
      )}>
        {/* Header */}
        <header className="h-16 border-b flex items-center justify-between px-4 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="font-bold text-lg truncate font-display">{group.name}</div>
            {trip?.status && (
              <span className="shrink-0" data-testid="status-confidence-pill">
                <ConfidencePill status={trip.status} />
              </span>
            )}
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
                return <PipMessage key={`pip-${msg.id}`} content={msg.content} time={time} />;
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
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <TypingIndicator names={typingUsers.map((u) => u.name)} />
        )}

        {/* Input */}
        <div className="p-4 bg-background border-t shrink-0">
          <form onSubmit={handleSend} className="flex gap-2 max-w-4xl mx-auto">
            <Input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Share your thoughts on the trip..."
              className="rounded-full pl-6 bg-secondary/50 border-transparent focus:bg-background focus:border-primary/20 transition-all shadow-inner"
              data-testid="input-message"
            />
            <Button
              type="submit"
              size="icon"
              className="rounded-full h-10 w-10 shrink-0 shadow-md"
              disabled={!messageText.trim() || sendMessage.isPending}
              data-testid="button-send"
            >
              {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
            </Button>
          </form>
        </div>
      </div>

      {/* ── RIGHT: Travel Workspace ──
           Desktop: static side panel (w-96/w-420)
           Mobile tab mode (mobileTab="plan"): full-width inline panel ── */}
      <div className={cn(
        "lg:block lg:h-full lg:overflow-hidden",
        mobileTab === "plan" ? "block h-full flex-1" : "hidden"
      )}>
        <TravelWorkspace
          groupId={group.id}
          participantId={participantId}
          trip={trip}
          alternatives={alternatives}
          tabMode={mobileTab === "plan"}
          onCopyLink={copyLink}
          onShareSummary={shareTripSummary}
        />
      </div>

      {/* ── Mobile Bottom Tab Bar ── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur-md flex">
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
          <Plane className="w-5 h-5" />
          Trip Plan
          {trip?.status && trip.status !== "Early ideas" && (
            <span className="absolute top-2 right-6 w-2 h-2 bg-primary rounded-full" />
          )}
        </button>
      </div>
    </div>
  );
}
