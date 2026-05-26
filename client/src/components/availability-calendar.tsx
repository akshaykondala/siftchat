import React, { useState, useEffect } from "react";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, isBefore, startOfToday,
} from "date-fns";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStoredToken } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";

type AvailStatus = "busy" | "tentative";

interface AvailabilityEntry {
  date: string;
  status: string;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function orderDates(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}

function datesInRange(start: string, end: string): string[] {
  const [s, e] = orderDates(start, end);
  const result: string[] = [];
  let curr = new Date(s + "T00:00:00");
  const endDate = new Date(e + "T00:00:00");
  while (curr <= endDate) {
    result.push(format(curr, "yyyy-MM-dd"));
    curr = new Date(curr.getTime() + 86400000);
  }
  return result;
}

export function AvailabilityCalendar({ userId }: { userId: number }) {
  const [viewMonth, setViewMonth] = useState(startOfMonth(new Date()));
  const [localEntries, setLocalEntries] = useState<Map<string, AvailStatus>>(new Map());
  const [savedEntries, setSavedEntries] = useState<Map<string, AvailStatus>>(new Map());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const today = startOfToday();
  const maxMonth = startOfMonth(addMonths(new Date(), 3));

  // Two-tap range selection
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [showActionBar, setShowActionBar] = useState(false);
  const [hoverDay, setHoverDay] = useState<string | null>(null);

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
        for (const e of entries) {
          if (e.status === "busy" || e.status === "tentative") {
            map.set(e.date, e.status as AvailStatus);
          }
        }
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

  const cancelRange = () => {
    setRangeStart(null);
    setRangeEnd(null);
    setShowActionBar(false);
    setHoverDay(null);
  };

  const applyToRange = (status: AvailStatus | null) => {
    if (!rangeStart) return;
    const end = rangeEnd ?? rangeStart;
    const dates = datesInRange(rangeStart, end);
    setLocalEntries(prev => {
      const next = new Map(prev);
      for (const d of dates) {
        if (status === null) next.delete(d);
        else next.set(d, status);
      }
      return next;
    });
    cancelRange();
  };

  const handleDayTap = (dateStr: string) => {
    if (showActionBar) {
      cancelRange();
      return;
    }
    if (rangeStart === null) {
      // First tap — start range
      setRangeStart(dateStr);
    } else {
      // Second tap — end range, show action bar
      setRangeEnd(dateStr);
      setShowActionBar(true);
      setHoverDay(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const token = getStoredToken();
    const allDates = Array.from(new Set([
      ...Array.from(localEntries.keys()),
      ...Array.from(savedEntries.keys()),
    ]));
    const payload = allDates.map(date => ({ date, status: localEntries.get(date) ?? "unset" }));
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

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);
  const canGoPrev = viewMonth > startOfMonth(today);
  const canGoNext = viewMonth < maxMonth;

  // Compute active range for highlighting
  const effectiveEnd = showActionBar ? rangeEnd : hoverDay;
  const rangeSet = new Set<string>();
  const [selStart, selEnd] = rangeStart && effectiveEnd
    ? orderDates(rangeStart, effectiveEnd)
    : [rangeStart ?? "", rangeStart ?? ""];
  if (rangeStart) {
    for (const d of datesInRange(rangeStart, effectiveEnd ?? rangeStart)) rangeSet.add(d);
  }

  const isEmpty = localEntries.size === 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative select-none">
      {/* Empty state prompt */}
      <AnimatePresence>
        {isEmpty && !rangeStart && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-700 px-4 py-3 text-center"
          >
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">You haven't marked any busy dates</p>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">
              Tap a start date below, then tap an end date to mark a range as busy or maybe. Everything unmarked is assumed free.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Range selection status bar */}
      <AnimatePresence mode="wait">
        {rangeStart && !showActionBar && (
          <motion.div
            key="picking-end"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mb-3 flex items-center justify-between px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                From {format(new Date(rangeStart + "T00:00:00"), "MMM d")} — now tap the end date
              </span>
            </div>
            <button onClick={cancelRange} className="text-indigo-400 hover:text-indigo-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}

        {showActionBar && rangeStart && (
          <motion.div
            key="action-bar"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mb-3 rounded-2xl border bg-card p-3 shadow-md"
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-semibold text-muted-foreground">
                {selStart === selEnd
                  ? format(new Date(selStart + "T00:00:00"), "MMM d")
                  : `${format(new Date(selStart + "T00:00:00"), "MMM d")} – ${format(new Date(selEnd + "T00:00:00"), "MMM d")}`}
                {" · "}{rangeSet.size} day{rangeSet.size !== 1 ? "s" : ""}
              </span>
              <button onClick={cancelRange} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => applyToRange("busy")}
                className="flex-1 h-9 rounded-xl bg-red-400 hover:bg-red-500 text-white text-xs font-bold transition-colors"
              >
                Busy
              </button>
              <button
                onClick={() => applyToRange("tentative")}
                className="flex-1 h-9 rounded-xl bg-amber-400 hover:bg-amber-500 text-white text-xs font-bold transition-colors"
              >
                Maybe
              </button>
              <button
                onClick={() => applyToRange(null)}
                className="flex-1 h-9 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold transition-colors"
              >
                Clear
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => canGoPrev && setViewMonth(m => subMonths(m, 1))}
          disabled={!canGoPrev}
          className={cn("w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
            canGoPrev ? "hover:bg-secondary text-foreground" : "opacity-20 cursor-not-allowed")}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-bold">{format(viewMonth, "MMMM yyyy")}</span>
        <button
          onClick={() => canGoNext && setViewMonth(m => addMonths(m, 1))}
          disabled={!canGoNext}
          className={cn("w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
            canGoNext ? "hover:bg-secondary text-foreground" : "opacity-20 cursor-not-allowed")}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-bold text-muted-foreground pb-1">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div
        className="grid grid-cols-7 gap-1"
        onMouseLeave={() => { if (!showActionBar) setHoverDay(null); }}
      >
        {Array.from({ length: startPad }).map((_, i) => <div key={`p${i}`} />)}
        {days.map(day => {
          const dateStr = format(day, "yyyy-MM-dd");
          const isPast = isBefore(day, today);
          const status = localEntries.get(dateStr);
          const inRange = rangeSet.has(dateStr);
          const isStartOrEnd = dateStr === rangeStart || (showActionBar && dateStr === rangeEnd);

          let cellClass = "";
          if (isPast) {
            cellClass = "opacity-25 text-muted-foreground cursor-not-allowed";
          } else if (isStartOrEnd) {
            cellClass = "bg-indigo-500 text-white ring-2 ring-indigo-400 scale-105 z-10";
          } else if (inRange) {
            cellClass = "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200";
          } else if (status === "busy") {
            cellClass = "bg-red-400 text-white shadow-sm";
          } else if (status === "tentative") {
            cellClass = "bg-amber-400 text-white shadow-sm";
          } else {
            cellClass = cn(
              "text-foreground transition-colors",
              rangeStart && !showActionBar
                ? "bg-secondary/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 cursor-pointer"
                : "bg-secondary/50 hover:bg-secondary cursor-pointer"
            );
          }

          return (
            <button
              key={dateStr}
              disabled={isPast}
              onClick={() => !isPast && handleDayTap(dateStr)}
              onMouseEnter={() => !isPast && rangeStart && !showActionBar && setHoverDay(dateStr)}
              className={cn(
                "aspect-square rounded-lg flex items-center justify-center text-xs font-semibold relative",
                cellClass
              )}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 mt-4 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-secondary ring-1 ring-border" /> Free (default)</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-400" /> Busy</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-amber-400" /> Maybe</div>
      </div>
      <p className="text-center text-[10px] text-muted-foreground/60 mt-1.5">
        Tap a start date, then an end date to mark a range
      </p>

      {/* Save button */}
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
              {saving
                ? <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                : "Save availability"
              }
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
