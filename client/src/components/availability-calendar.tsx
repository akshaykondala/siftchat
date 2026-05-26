import React, { useState, useEffect, useCallback } from "react";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, isBefore, startOfToday, isSameMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStoredToken } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";

type AvailStatus = "available" | "busy" | "tentative";

interface AvailabilityEntry {
  date: string;
  status: AvailStatus;
}

const STATUS_CONFIG = {
  available: { bg: "bg-violet-500", ring: "ring-violet-400", text: "text-white", dot: "bg-violet-500", label: "Free" },
  busy: { bg: "bg-red-400", ring: "ring-red-400", text: "text-white", dot: "bg-red-400", label: "Busy" },
  tentative: { bg: "bg-amber-400", ring: "ring-amber-400", text: "text-white", dot: "bg-amber-400", label: "Maybe" },
};

function nextStatus(current: AvailStatus | undefined): AvailStatus | null {
  if (!current) return "available";
  if (current === "available") return "busy";
  if (current === "busy") return "tentative";
  return null; // unset
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function AvailabilityCalendar({ userId }: { userId: number }) {
  const [viewMonth, setViewMonth] = useState(startOfMonth(new Date()));
  const [localEntries, setLocalEntries] = useState<Map<string, AvailStatus>>(new Map());
  const [savedEntries, setSavedEntries] = useState<Map<string, AvailStatus>>(new Map());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const today = startOfToday();
  const maxMonth = startOfMonth(addMonths(new Date(), 3));

  useEffect(() => {
    const token = getStoredToken();
    const start = format(today, "yyyy-MM-dd");
    const end = format(addMonths(today, 3), "yyyy-MM-dd");
    fetch(`/api/availability/${userId}?start=${start}&end=${end}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : [])
      .then((entries: AvailabilityEntry[]) => {
        const map = new Map<string, AvailStatus>();
        for (const e of entries) map.set(e.date, e.status as AvailStatus);
        setLocalEntries(new Map(map));
        setSavedEntries(new Map(map));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const isDirty = (() => {
    if (localEntries.size !== savedEntries.size) return true;
    for (const [date, status] of Array.from(localEntries.entries())) {
      if (savedEntries.get(date) !== status) return true;
    }
    for (const date of Array.from(savedEntries.keys())) {
      if (!localEntries.has(date)) return true;
    }
    return false;
  })();

  const handleDayTap = useCallback((dateStr: string) => {
    setLocalEntries(prev => {
      const next = new Map(prev);
      const current = prev.get(dateStr);
      const nextVal = nextStatus(current);
      if (nextVal === null) next.delete(dateStr);
      else next.set(dateStr, nextVal);
      return next;
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const token = getStoredToken();
    const allDates = Array.from(new Set([...Array.from(localEntries.keys()), ...Array.from(savedEntries.keys())]));
    const payload: { date: string; status: string }[] = [];
    for (const date of allDates) {
      const current = localEntries.get(date);
      payload.push({ date, status: current ?? "unset" });
    }
    try {
      await fetch("/api/availability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      setSavedEntries(new Map(localEntries));
    } catch { /* no-op */ }
    setSaving(false);
  };

  // Build calendar days for current view month
  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart); // 0=Sun, pad empty cells

  const canGoPrev = viewMonth > startOfMonth(today);
  const canGoNext = viewMonth < maxMonth;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => canGoPrev && setViewMonth(m => subMonths(m, 1))}
          disabled={!canGoPrev}
          className={cn(
            "w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
            canGoPrev ? "hover:bg-secondary text-foreground" : "opacity-20 cursor-not-allowed"
          )}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-bold">
          {format(viewMonth, "MMMM yyyy")}
        </span>
        <button
          onClick={() => canGoNext && setViewMonth(m => addMonths(m, 1))}
          disabled={!canGoNext}
          className={cn(
            "w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
            canGoNext ? "hover:bg-secondary text-foreground" : "opacity-20 cursor-not-allowed"
          )}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-bold text-muted-foreground pb-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {/* Padding cells before month start */}
        {Array.from({ length: startPad }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {days.map(day => {
          const dateStr = format(day, "yyyy-MM-dd");
          const isPast = isBefore(day, today);
          const status = localEntries.get(dateStr);
          const config = status ? STATUS_CONFIG[status] : null;

          return (
            <button
              key={dateStr}
              onClick={() => !isPast && handleDayTap(dateStr)}
              disabled={isPast}
              className={cn(
                "relative aspect-square rounded-lg flex items-center justify-center text-xs font-semibold transition-all select-none",
                "w-full",
                isPast
                  ? "opacity-25 cursor-not-allowed text-muted-foreground"
                  : config
                  ? cn(config.bg, config.text, "shadow-sm scale-[1.02]")
                  : "bg-secondary/50 hover:bg-secondary text-foreground"
              )}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-4 text-[11px] text-muted-foreground">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={cn("w-3 h-3 rounded-full", cfg.dot)} />
            <span>{cfg.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-secondary" />
          <span>Unset</span>
        </div>
      </div>

      {/* Tap hint */}
      <p className="text-center text-[10px] text-muted-foreground/60 mt-2">
        Tap a day to cycle: Free → Busy → Maybe → clear
      </p>

      {/* Floating save button */}
      <AnimatePresence>
        {isDirty && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-4"
          >
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full h-11 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving ? (
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                "Save availability"
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
