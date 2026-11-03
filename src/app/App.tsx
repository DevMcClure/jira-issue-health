import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TicketsToFixPage } from "@/components/TicketsToFixPage"
import { useData } from "@/hooks/useData"
import { AppLayout } from "./AppLayout"

/** One view, no router: the shell around "Tickets to fix". */
export function App() {
  const { dataset, origin } = useData()
  // New data starts with fresh filters: sprints, people and teams belong to the old file.
  const dataKey = `${origin.kind === "upload" ? origin.loadedAt : "sample"}|${dataset.meta.generatedAt}`
  return (
    <TooltipProvider delayDuration={200}>
      <AppLayout>
        <TicketsToFixPage key={dataKey} />
      </AppLayout>
      <Toaster richColors={false} position="bottom-right" />
    </TooltipProvider>
  )
}
