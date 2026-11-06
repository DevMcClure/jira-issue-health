import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TicketsToFixPage } from "@/components/TicketsToFixPage"
import { useData } from "@/hooks/useData"
import { AppLayout } from "./AppLayout"

/** One view, no router: the shell around "Tickets to fix". */
export function App() {
  const { dataset, origin } = useData()
  // A different file starts with fresh filters: sprints, people and teams belong to the old one.
  // Live updates keep the same key, so filters and open rows survive them.
  const dataKey = origin.kind === "upload" ? `${origin.loadedAt}|${dataset.meta.generatedAt}` : origin.kind
  return (
    <TooltipProvider delayDuration={200}>
      <AppLayout>
        <TicketsToFixPage key={dataKey} />
      </AppLayout>
      <Toaster richColors={false} position="bottom-right" />
    </TooltipProvider>
  )
}
