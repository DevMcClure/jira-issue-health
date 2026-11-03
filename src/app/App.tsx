import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TicketsToFixPage } from "@/components/TicketsToFixPage"
import { AppLayout } from "./AppLayout"

/** One view, no router: the shell around "Tickets to fix". */
export function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <AppLayout>
        <TicketsToFixPage />
      </AppLayout>
      <Toaster richColors={false} position="bottom-right" />
    </TooltipProvider>
  )
}
