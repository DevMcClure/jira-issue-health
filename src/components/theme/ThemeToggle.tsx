import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useTheme } from "@/hooks/useTheme"

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" onClick={toggleTheme} aria-label={label}>
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
