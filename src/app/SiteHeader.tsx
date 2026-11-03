import { ThemeToggle } from "@/components/theme/ThemeToggle"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <span className="truncate text-sm font-medium">Tickets to fix</span>
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  )
}
