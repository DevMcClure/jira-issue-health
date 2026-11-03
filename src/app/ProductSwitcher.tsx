import { Check, ChevronsUpDown, ExternalLink, HeartPulse, Layers } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL

/** Jira Dashboard ↔ Jira Health. This app is the current one; the dashboard is an external link. */
export function ProductSwitcher() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground">
                <HeartPulse className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Jira Health</span>
                <span className="truncate text-xs text-muted-foreground">Data gaps to fix</span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg" align="start">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Switch app</DropdownMenuLabel>
            <DropdownMenuItem disabled={!DASHBOARD_URL} asChild={!!DASHBOARD_URL}>
              {DASHBOARD_URL ? (
                <a href={DASHBOARD_URL}>
                  <Layers />
                  Jira Dashboard
                  <ExternalLink className="ml-auto" />
                </a>
              ) : (
                <>
                  <Layers />
                  Jira Dashboard (link not set)
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem aria-current="page">
              <HeartPulse />
              Jira Health
              <Check className="ml-auto" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
