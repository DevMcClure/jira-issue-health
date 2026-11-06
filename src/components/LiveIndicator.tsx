import { LogOut, RefreshCw, RotateCcw } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { useData } from "@/hooks/useData"
import { useJira } from "@/hooks/useJira"
import { useNow } from "@/hooks/useNow"
import { ago } from "@/lib/time"
import { cn } from "@/lib/utils"
import type { LiveState } from "@/providers/data-source"
import { ConnectJiraForm } from "./ConnectJiraForm"

const STATE: Record<LiveState, { label: string; dot: string; pulse: boolean }> = {
  live: { label: "Live", dot: "bg-status-done", pulse: true },
  connecting: { label: "Connecting…", dot: "bg-severity-warning", pulse: false },
  reconnecting: { label: "Reconnecting…", dot: "bg-severity-warning", pulse: false },
  offline: { label: "Offline", dot: "bg-severity-critical", pulse: false },
}

/** Header status: is the data live, how fresh is it, and who Resolve writes to Jira as. */
export function LiveIndicator() {
  const { live, mode, refresh, demo, dataset } = useData()
  const { connection, disconnect, config } = useJira()
  const now = useNow(15_000)
  const [simulating, setSimulating] = useState(() => demo?.simulation.enabled() ?? false)

  const state = live?.state ?? "connecting"
  const meta = STATE[state]
  const label = mode === "demo" ? "Demo" : meta.label
  const checked = live?.checkedAt ? ago(live.checkedAt, now) : null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-2 px-2.5" aria-label={`Data: ${label}${checked ? `, checked ${checked}` : ""}. Data and Jira connection details`}>
          <span className="relative flex size-2" aria-hidden>
            {meta.pulse && <span className={cn("absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping", meta.dot)} />}
            <span className={cn("relative inline-flex size-2 rounded-full", meta.dot)} />
          </span>
          <span className="text-xs font-medium">{label}</span>
          {checked && <span className="hidden text-xs text-muted-foreground tabular-nums @lg/header:inline">· {checked}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 text-sm">
        <div className="space-y-1">
          <p className="font-medium">{mode === "demo" ? "Demo data" : "Live data"}</p>
          <p className="text-xs text-muted-foreground">
            {mode === "demo"
              ? "Everything runs in your browser: sample data, a simulated Jira, and a stand-in feed that fixes a ticket every minute or so."
              : "From the Jira Health server. Changes from Jira and from other people's fixes appear here as they happen."}
          </p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Status</dt>
          <dd>{mode === "demo" ? "Simulated" : meta.label}</dd>
          <dt className="text-muted-foreground">Checked</dt>
          <dd>{checked ?? "not yet"}</dd>
          <dt className="text-muted-foreground">Trawled</dt>
          <dd>{ago(dataset.meta.generatedAt, now)}</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-7" onClick={refresh}>
            <RefreshCw />
            Refresh now
          </Button>
          {demo && (
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => demo.reset().then(() => toast.success("Demo changes cleared", { description: "Back to the data as loaded." }))}
            >
              <RotateCcw />
              Reset demo changes
            </Button>
          )}
        </div>
        {demo && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="demo-simulate"
              checked={simulating}
              onCheckedChange={(v) => {
                demo.simulation.setEnabled(v === true)
                setSimulating(v === true)
              }}
            />
            <Label htmlFor="demo-simulate" className="text-xs font-normal">
              Simulate people fixing tickets in Jira
            </Label>
          </div>
        )}

        <Separator />

        <div className="space-y-2">
          <p className="font-medium">Jira</p>
          {connection ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs">
                Resolve edits tickets as <span className="font-medium">{connection.user.displayName}</span>
                {config?.jira.writer === "mock" && mode === "api" && <span className="text-muted-foreground"> (mock Jira)</span>}.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2"
                onClick={() => disconnect().then(() => toast("Jira disconnected"), () => toast.error("Couldn't disconnect; try again."))}
              >
                <LogOut />
                Disconnect
              </Button>
            </div>
          ) : (
            <ConnectJiraForm onConnected={(c) => toast.success(`Connected to Jira as ${c.user.displayName}`)} />
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
