"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** A small themed single-date month calendar (shadcn-style, no native picker). */
export function Calendar({
  selected,
  onSelect,
  className,
}: {
  selected?: Date
  onSelect: (date: Date) => void
  className?: string
}) {
  const [view, setView] = useState(() => {
    const d = selected ?? new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  const today = new Date()
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const firstWeekday = new Date(view.year, view.month, 1).getDay()
  const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  })

  const shift = (delta: number) =>
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  const shiftYear = (delta: number) => setView((v) => ({ ...v, year: v.year + delta }))

  return (
    <div className={cn("w-64 p-3", className)}>
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => shiftYear(-1)} type="button" title="Previous year">
            <ChevronsLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => shift(-1)} type="button" title="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
        </div>
        <span className="text-sm font-medium">{monthLabel}</span>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => shift(1)} type="button" title="Next month">
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => shiftYear(1)} type="button" title="Next year">
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className={cn("py-1 text-xs font-medium text-muted-foreground", i === 0 && "text-rose-500")}>
            {w}
          </div>
        ))}
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`b${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const date = new Date(view.year, view.month, day)
          const isSelected = selected && sameDay(date, selected)
          const isToday = sameDay(date, today)
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(date)}
              className={cn(
                "flex aspect-square items-center justify-center rounded-md text-sm transition-colors",
                isSelected
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "hover:bg-accent hover:text-accent-foreground",
                !isSelected && isToday && "border border-primary text-primary"
              )}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
