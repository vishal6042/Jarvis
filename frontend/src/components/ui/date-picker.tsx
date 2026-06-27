"use client"

import { useState } from "react"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const pad = (n: number) => String(n).padStart(2, "0")
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Themed date picker (Popover + Calendar). `value`/`onChange` use yyyy-MM-dd strings. */
export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
}: {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const date = value ? new Date(`${value}T00:00:00`) : undefined
  const label = date
    ? date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className={cn("w-full justify-start gap-2 font-normal", !date && "text-muted-foreground", className)}
          />
        }
      >
        <CalendarIcon className="size-4 text-muted-foreground" />
        {label ?? <span>{placeholder}</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          selected={date}
          onSelect={(d) => {
            onChange(toISO(d))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
