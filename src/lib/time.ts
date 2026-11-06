import { format, isSameDay } from "date-fns"

/** "just now", "4 min ago", "2 h ago", else the time (and day when it isn't today). */
export function ago(iso: string, now: Date): string {
  const at = new Date(iso)
  const seconds = Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000))
  if (seconds < 45) return "just now"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 6) return `${hours} h ago`
  return format(at, isSameDay(at, now) ? "HH:mm" : "d MMM, HH:mm")
}
