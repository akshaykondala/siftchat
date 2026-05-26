import React, { useState, useEffect } from "react";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, isBefore, startOfToday,
} from "date-fns";
import { ChevronLeft, ChevronRight, Calendar, X, Users, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStoredToken } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";

interface AvailEntry {
  participantId: number;
  participantName: string;
  userId: number;
  date: string;
  status: string;
}

interface BestWindow {
  startDate: string;
  endDate: string;
  availableCount: number;
  totalParticipants: number;
  score: number;
  availableNames: string[];
  busyNames: string[];
}

interface GroupAvailData {
  entries: AvailEntry[];
  bestWindows: BestWindow[];
  participantCount: number;
  linkedCount: number;
  setAvailabilityCount: number;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function buildDateMap(entries: AvailEntry[]): Map<string, { available: string[]; busy: string[]; tentative: string[] }> {
  const map = new Map<string, { available: string[]; busy: string[]; tentative: string[] }>();
  for (const e of entries) {
    if (!map.has(e.date)) map.set(e.date, { available: [], busy: [], tentative: [] });
    const b = map.get(e.date)!;
    if (e.status === "available") b.available.push(e.participantName);
    else if (e.status === "busy") b.busy.push(e.participantName);
    else if (e.status === "tentative") b.tentative.push(e.participantName);
  }
  return map;
}

function isBestWindow(date: string, windows: BestWindow[]): boolean {
  return windows.some(w => date >= w.startDate && date <= w.endDate);
}

export function GroupAvailabilityPanel({
  groupId,
  participantCount,
}: {
  groupId: number;
  participantCount: number;
}) {
  const [data, setData] = useState<GroupAvailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [nudgeSending, setNudgeSending] = useState(false);
  const today = startOfToday();
  const maxMonth = startOfMonth(addMonths(new Date(), 3));

  useEffect(() => {
    const token = getStoredToken();
    const start = format(today, "yyyy-MM-dd");
    const end = format(addMonths(today, 3), "yyyy-MM-dd");
    fetch(`/api/groups/${groupId}/availability?start=${start}&end=${end}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [groupId]);

  const dateMap = data ? buildDateMap(data.entries) : new Map();
  const bestWindows = data?.bestWindows ?? [];

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);

  const canGoPrev = viewMonth > startOfMonth(today);
  const canGoNext = viewMonth < maxMonth;

  const notSetCount = data ? (data.linkedCount - data.setAvailabilityCount) : 0;
  const showNudge = !nudgeDismissed && data && notSetCount > 0 && notSetCount >= Math.ceil(data.linkedCount / 2);

  const handleNudgePip = async () => {
    setNudgeSending(true);
    const token = getStoredToken();
    try {
      // Send a @pip mention asking for availability check
      // We do this by getting the participant's ID from the trip page and posting a system message
      // For now, just send an API call that triggers the availability nudge
      await fetch(`/api/groups/${groupId}/availability-nudge`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch { /* no-op */ }
    setNudgeDismissed(true);
    setNudgeSending(false);
  };

  const selectedDayData = selectedDay ? dateMap.get(selectedDay) : null;

  if (loading) {
    return (
      <div className="rounded-xl border bg-card/80 px-3 py-4 flex items-center justify-center">
        <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card/80 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Group Availability</span>
        </div>
        {bestWindows.length > 0 && (
          <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">
            {bestWindows.length} best window{bestWindows.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Nudge banner */}
      <AnimatePresence>
        {showNudge && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-3 mb-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 px-3 py-2.5"
          >
            <div className="flex items-start gap-2">
              <div className="text-base">⚠️</div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                  {notSetCount} of {data!.linkedCount} haven't set availability yet
                </p>
                <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
                  Pip can't find the best dates until everyone fills in their calendar.
                </p>
              </div>
              <button onClick={() => setNudgeDismissed(true)} className="text-amber-400 hover:text-amber-600 mt-0.5">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              onClick={handleNudgePip}
              disabled={nudgeSending}
              className="mt-2 w-full text-[11px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-800/30 hover:bg-amber-200 dark:hover:bg-amber-700/40 rounded-lg py-1.5 transition-colors flex items-center justify-center gap-1.5"
            >
              <Bell className="w-3 h-3" />
              Have Pip remind them
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Best windows list */}
      {bestWindows.length > 0 && (
        <div className="mx-3 mb-3 space-y-1.5">
          {bestWindows.map((w, i) => {
            const startFmt = new Date(w.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
            const endFmt = new Date(w.endDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
            const pct = Math.round(w.score * 100);
            return (
              <div key={i} className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-2.5 py-2 border border-emerald-200 dark:border-emerald-800/40">
                <div className="text-emerald-500 font-black text-[13px] w-5 shrink-0">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">{startFmt} – {endFmt}</p>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                    {pct}% free{w.busyNames.length > 0 ? ` · ${w.busyNames.join(", ")} busy` : " · everyone free"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Calendar */}
      <div className="px-3 pb-3">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => canGoPrev && setViewMonth(m => subMonths(m, 1))}
            disabled={!canGoPrev}
            className={cn("w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
              canGoPrev ? "hover:bg-secondary text-foreground" : "opacity-20 cursor-not-allowed")}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-bold">{format(viewMonth, "MMMM yyyy")}</span>
          <button
            onClick={() => canGoNext && setViewMonth(m => addMonths(m, 1))}
            disabled={!canGoNext}
            className={cn("w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
              canGoNext ? "hover:bg-secondary text-foreground" : "opacity-20 cursor-not-allowed")}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-0.5">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="text-center text-[9px] font-bold text-muted-foreground pb-0.5">{d}</div>
          ))}
        </div>

        {/* Day cells — clear = everyone free (default), red fill = busy conflict */}
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
          {days.map(day => {
            const dateStr = format(day, "yyyy-MM-dd");
            const bucket = dateMap.get(dateStr);
            const isPast = isBefore(day, today);
            const isBest = isBestWindow(dateStr, bestWindows);
            // Use linkedCount from API if available, fall back to participantCount
            const denom = (data?.linkedCount || participantCount) || 1;
            const busyCount = bucket ? bucket.busy.length : 0;
            const tentativeCount = bucket ? bucket.tentative.length : 0;
            // Conflict score: 0 = everyone free, 1 = everyone busy
            const conflictFrac = (busyCount + tentativeCount * 0.5) / denom;
            const hasConflict = conflictFrac > 0;

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDay(selectedDay === dateStr ? null : dateStr)}
                className={cn(
                  "relative aspect-square rounded-lg flex flex-col items-center justify-between overflow-hidden text-[10px] font-semibold transition-all",
                  isPast ? "opacity-30 cursor-not-allowed" : "cursor-pointer hover:scale-[1.05] active:scale-95",
                  isBest && !isPast ? "ring-1 ring-emerald-400 dark:ring-emerald-500" : "",
                  selectedDay === dateStr ? "ring-2 ring-primary" : ""
                )}
                disabled={isPast}
                style={{ minHeight: 32 }}
              >
                {/* Conflict fill: grows from bottom, red = busy */}
                {hasConflict && (
                  <div
                    className="absolute bottom-0 inset-x-0 bg-red-400/50 dark:bg-red-500/40 pointer-events-none"
                    style={{ height: `${Math.round(conflictFrac * 100)}%` }}
                  />
                )}
                <span className="relative z-10 pt-0.5 text-foreground/80">{format(day, "d")}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Day detail bottom sheet */}
      <AnimatePresence>
        {selectedDay && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t bg-secondary/20 px-3 py-3"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold">
                {new Date(selectedDay + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </span>
              <button onClick={() => setSelectedDay(null)}>
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            {(() => {
              const busyNames = selectedDayData?.busy ?? [];
              const tentativeNames = selectedDayData?.tentative ?? [];
              const explicitlyMarked = new Set([...busyNames, ...tentativeNames, ...(selectedDayData?.available ?? [])]);
              // Everyone not explicitly marked is free by default
              const implicitlyFreeNames = data?.entries
                ? Array.from(new Set(data.entries.map(e => e.participantName))).filter(n => !explicitlyMarked.has(n))
                : [];
              const allFreeNames = [...(selectedDayData?.available ?? []), ...implicitlyFreeNames];

              return (
                <div className="space-y-1">
                  {allFreeNames.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-secondary ring-1 ring-border shrink-0" />
                      <span className="text-[10px] text-muted-foreground">Free: <span className="text-foreground font-medium">{allFreeNames.join(", ")}</span></span>
                    </div>
                  )}
                  {tentativeNames.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                      <span className="text-[10px] text-muted-foreground">Maybe: <span className="text-foreground font-medium">{tentativeNames.join(", ")}</span></span>
                    </div>
                  )}
                  {busyNames.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />
                      <span className="text-[10px] text-muted-foreground">Busy: <span className="text-foreground font-medium">{busyNames.join(", ")}</span></span>
                    </div>
                  )}
                  {allFreeNames.length === 0 && tentativeNames.length === 0 && busyNames.length === 0 && (
                    <p className="text-[10px] text-muted-foreground italic">No one's set their availability yet.</p>
                  )}
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 px-3 py-2 border-t text-[9px] text-muted-foreground">
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-secondary ring-1 ring-border" /> Free (default)</div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-red-400/50" /> Busy</div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm ring-1 ring-emerald-400" /> Best window</div>
      </div>
    </div>
  );
}
