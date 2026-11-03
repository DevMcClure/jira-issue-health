import { AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

type Props = {
  /** Why the first load failed, or null while loading. */
  error: string | null
  onRetry: () => void
}

/** Full-screen state before any data is loaded. */
export function AppLoading({ error, onRetry }: Props) {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      {error ? (
        <div role="alert" className="flex max-w-md flex-col items-center gap-3 text-center">
          <AlertTriangle className="size-8 text-severity-critical" aria-hidden />
          <p className="font-medium">Couldn't load the data</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button onClick={onRetry}>Try again</Button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading tickets…
        </p>
      )}
    </div>
  )
}
