"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  date: string;  // YYYY-MM-DD
  label: string;
  color?: "default" | "success" | "warning" | "danger" | "info";
  tooltip?: string;
}

export interface CalendarViewProps {
  events: CalendarEvent[];
  onDateClick?: (date: string) => void;
  title?: string;
}

// ── Color Map ────────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  default: "bg-primary/20 text-primary",
  success: "bg-green-500/20 text-green-700 dark:text-green-400",
  warning: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  danger: "bg-red-500/20 text-red-700 dark:text-red-400",
  info: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
};

// ── CalendarView ─────────────────────────────────────────────────────────────

export function CalendarView({ events, onDateClick, title }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const monthLabel = new Date(currentDate.year, currentDate.month).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function prevMonth() {
    setCurrentDate((d) => {
      if (d.month === 0) return { year: d.year - 1, month: 11 };
      return { ...d, month: d.month - 1 };
    });
  }

  function nextMonth() {
    setCurrentDate((d) => {
      if (d.month === 11) return { year: d.year + 1, month: 0 };
      return { ...d, month: d.month + 1 };
    });
  }

  // Build event lookup map
  const eventMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = e.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  // Build calendar grid
  const firstDay = new Date(currentDate.year, currentDate.month, 1);
  const lastDay = new Date(currentDate.year, currentDate.month + 1, 0);
  const startDayOfWeek = firstDay.getDay(); // 0=Sunday
  const daysInMonth = lastDay.getDate();

  const cells: { day: number; dateStr: string; isToday: boolean }[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // Padding for start of month
  for (let i = 0; i < startDayOfWeek; i++) {
    cells.push({ day: 0, dateStr: "", isToday: false });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentDate.year}-${String(currentDate.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, dateStr, isToday: dateStr === today });
  }

  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <Card>
      {title && (
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className="space-y-3">
        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">{monthLabel}</span>
          <Button variant="ghost" size="sm" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((day) => (
            <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, i) => {
            if (cell.day === 0) {
              return <div key={i} className="h-10" />;
            }

            const dayEvents = eventMap.get(cell.dateStr) || [];

            return (
              <TooltipProvider key={i}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={`h-10 rounded-md text-sm flex flex-col items-center justify-center gap-0.5 hover:bg-accent/50 transition-colors
                        ${cell.isToday ? "bg-primary/10 font-bold ring-1 ring-primary" : ""}
                        ${dayEvents.length > 0 ? "font-medium" : "text-muted-foreground"}
                      `}
                      onClick={() => onDateClick?.(cell.dateStr)}
                    >
                      <span className="text-xs">{cell.day}</span>
                      {dayEvents.length > 0 && (
                        <div className="flex gap-0.5">
                          {dayEvents.slice(0, 3).map((e, j) => (
                            <div key={j} className={`w-1 h-1 rounded-full ${COLOR_MAP[e.color || "default"].split(" ")[0].replace("/20", "")}`} />
                          ))}
                        </div>
                      )}
                    </button>
                  </TooltipTrigger>
                  {dayEvents.length > 0 && (
                    <TooltipContent>
                      <div className="space-y-1">
                        {dayEvents.map((e, j) => (
                          <div key={j} className="text-xs">
                            <Badge variant="outline" className={`text-[10px] ${COLOR_MAP[e.color || "default"]}`}>
                              {e.label}
                            </Badge>
                            {e.tooltip && <p className="mt-0.5 text-muted-foreground">{e.tooltip}</p>}
                          </div>
                        ))}
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
