import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TicketsToFixPage } from "@/components/TicketsToFixPage"
import { useData } from "@/hooks/useData"
import { ResolutionsProvider } from "@/providers/ResolutionsProvider"
import { AppLayout } from "./AppLayout"

/** One view, no router: the shell around "Tickets to fix". */
export function App() {
  const { dataset, origin } = useData()
  // New data starts with fresh filters: sprints, people and teams belong to the old file.
  const dataKey = `${origin.kind === "upload" ? origin.loadedAt : "sample"}|${dataset.meta.generatedAt}`
  return (
    <TooltipProvider delayDuration={200}>
      <AppLayout>
        {/* Resolutions belong to one dataset, identified by when it was trawled. */}
        <ResolutionsProvider key={dataset.meta.generatedAt} datasetId={dataset.meta.generatedAt}>
          <TicketsToFixPage key={dataKey} />
        </ResolutionsProvider>
      </AppLayout>
      <Toaster richColors={false} position="bottom-right" />
    </TooltipProvider>
  )
}
