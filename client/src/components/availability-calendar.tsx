import React, { useState, useEffect, useRef } from "react";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, isBefore, startOfToday,
} from "date-fns";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStoredToken } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";

// "available" removed from cycle — unset days are free by default.
// Cycle: unset (free) → busy → tentative (maybe) → unset
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

  // Drag-range state
  const gridRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const [showRangeActions, setShowRangeActions] = useState(false);
  const downPosRef = useRef<{ x: number; y: number } | null>(null);

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
          // Only keep busy/tentative; old "available" entries are treated as unset
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

  const cycleDay = (dateStr: string) => {
    setLocalEntries(prev => {
      const next = new Map(prev);
      const cur = prev.get(dateStr);
      if (!cur) next.set(dateStr, "busy");
      else if (cur === "busy") next.set(dateStr, "tentative");
      else next.delete(dateStr);
      return next;
    });
  };

  const applyToRange = (status: AvailStatus | null) => {
    if (!dragStart || !dragEnd) return;
    const dates = datesInRange(dragStart, dragEnd);
    setLocalEntries(prev => {
      const next = new Map(prev);
      for (const d of dates) {
        if (status === null) next.delete(d);
        else next.set(d, status);
      }
      return next;
    });
    setDragStart(null);
    setDragEnd(null);
    setShowRangeActions(false);
  };

  const getDateAtPoint = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const cell = (el as HTMLElement).closest("[data-date]");
    return cell?.getAttribute("data-date") ?? null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Dismiss range action bar on any new pointer down
    if (showRangeActions) {
      setShowRangeActions(false);
      setDragStart(null);
      setDragEnd(null);
      return;
    }
    const dateStr = getDateAtPoint(e.clientX, e.clientY);
    if (!dateStr) return;
    const d = new Date(dateStr + "T00:00:00");
    if (isBefore(d, today)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    downPosRef.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
    setHasMoved(false);
    setDragStart(dateStr);
    setDragEnd(dateStr);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const down = downPosRef.current;
    if (down) {
      const dx = Math.abs(e.clientX - down.x);
      const dy = Math.abs(e.clientY - down.y);
      if (dx > 6 || dy > 6) setHasMoved(true);
    }
    const dateStr = getDateAtPoint(e.clientX, e.clientY);
    if (dateStr && dateStr !== dragEnd) {
      const d = new Date(dateStr + "T00:00:00");
      if (!isBefore(d, today)) setDragEnd(dateStr);
    }
  };

  const handlePointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    downPosRef.current = null;

    const [start, end] = dragStart && dragEnd ? orderDates(dragStart, dragEnd) : [null, null];
    const isRange = hasMoved && start !== end;

    if (!isRange) {
      // Single tap: cycle the day
      if (dragStart) cycleDay(dragStart);
      setDragStart(null);
      setDragEnd(null);
    } else {
      // Range selected: show action bar
      setShowRangeActions(true);
    }
    setHasMoved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const token = getStoredToken();
    const allDates = Array.from(new Set([
      ...Array.from(localEntries.keys()),
      ...Array.from(savedEntries.keys()),
    ]));
    const payload = allDates.map(date => ({
      date,
      status: localEntries.get(date) ?? "unset",
    }));
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

  // Compute which dates are in the active selection
  const selectionDates = new Set<string>();
  if ((isDragging && dragStart && dragEnd) || (showRangeActions && dragStart && dragEnd)) {
    for (const d of datesInRange(dragStart, dragEnd)) selectionDates.add(d);
  }

  const [selStart, selEnd] = dragStart && dragEnd ? orderDates(dragStart, dragEnd) : ["", ""];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative select-none">
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

      {/* Day grid — pointer events on container for drag detection */}
      <div
        ref={gridRef}
        className="grid grid-cols-7 gap-1"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {Array.from({ length: startPad }).map((_, i) => <div key={`p${i}`} />)}
        {days.map(day => {
          const dateStr = format(day, "yyyy-MM-dd");
          const isPast = isBefore(day, today);
          const status = localEntries.get(dateStr);
          const inSel = selectionDates.has(dateStr);
          const isSelEdge = dateStr === selStart || dateStr === selEnd;

          let cellClass = "";
          if (isPast) {
            cellClass = "opacity-25 text-muted-foreground bg-transparent";
          } else if (inSel) {
            cellClass = isSelEdge
              ? "bg-indigo-500 text-white ring-2 ring-indigo-400 scale-[1.05]"
              : "bg-indigo-200 dark:bg-indigo-800/50 text-indigo-900 dark:text-indigo-100";
          } else if (status === "busy") {
            cellClass = "bg-red-400 text-white shadow-sm";
          } else if (status === "tentative") {
            cellClass = "bg-amber-400 text-white shadow-sm";
          } else {
            cellClass = "bg-secondary/50 hover:bg-secondary text-foreground";
          }

          return (
            <div
              key={dateStr}
              data-date={dateStr}
              className={cn(
                "aspect-square rounded-lg flex items-center justify-center text-xs font-semibold transition-all",
                isPast ? "cursor-not-allowed" : "cursor-pointer",
                cellClass
              )}
            >
              {format(day, "d")}
            </div>
          );
        })}
      </div>

      {/* Range action bar */}
      <AnimatePresence>
        {showRangeActions && selStart && selEnd && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            className="mt-3 rounded-2xl border bg-card p-3 shadow-lg"
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-semibold text-muted-foreground">
                {selStart === selEnd
                  ? format(new Date(selStart + "T00:00:00"), "MMM d")
                  : `${format(new Date(selStart + "T00:00:00"), "MMM d")} – ${format(new Date(selEnd + "T00:00:00"), "MMM d")}`
                }
              </span>
              <button
                onClick={() => { setDragStart(null); setDragEnd(null); setShowRangeActions(false); }}
                className="text-muted-foreground hover:text-foreground"
              >
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

      {/* Legend + hint */}
      <div className="flex items-center justify-center gap-5 mt-4 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-secondary ring-1 ring-border" /> Free (default)</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-400" /> Busy</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-amber-400" /> Maybe</div>
      </div>
      <p className="text-center text-[10px] text-muted-foreground/60 mt-1.5">
        Tap to cycle • Hold &amp; drag to select a range
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
