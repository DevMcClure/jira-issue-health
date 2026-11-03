import type { ReactNode } from "react"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "./AppSidebar"
import { SiteHeader } from "./SiteHeader"

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="relative min-w-0">
        {/* Faint glow behind the top of the content (dark mode only). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 hidden h-96 bg-[radial-gradient(ellipse_at_top,var(--color-brand),transparent_70%)] opacity-[0.06] dark:block"
        />
        <SiteHeader />
        <main className="relative flex flex-1 flex-col gap-4 p-4 sm:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
