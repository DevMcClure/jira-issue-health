import { format, parseISO } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type Props = {
  id: string
  /** yyyy-MM-dd, or "" for none. */
  value: string
  onChange: (day: string) => void
  /** Days before this (yyyy-MM-dd) can't be picked. */
  min?: string
}

export function DatePickerField({ id, value, onChange, min }: Props) {
  const [open, setOpen] = useState(false)
  const selected = value ? parseISO(value) : undefined
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" size="sm" className="h-8 w-44 justify-start font-normal">
          <CalendarIcon />
          {selected ? format(selected, "d MMM yyyy") : <span className="text-muted-foreground">Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          disabled={min ? { before: parseISO(min) } : undefined}
          onSelect={(d) => {
            if (d) onChange(format(d, "yyyy-MM-dd"))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
