import { ExternalLink, KeyRound, Loader2, ShieldCheck } from "lucide-react"
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useJira } from "@/hooks/useJira"
import type { ConnectRequest, JiraConnection } from "@/lib/api/contract"

type Props = {
  onConnected?: (connection: JiraConnection) => void
  /** Focus the first field when shown. */
  autoFocus?: boolean
}

/**
 * Connect your own Jira account, so Resolve edits tickets as you, with your Jira
 * permissions. The token goes to the Jira Health server once; this browser never keeps it.
 */
export function ConnectJiraForm({ onConnected, autoFocus }: Props) {
  const { config, connect, ready } = useJira()
  const [token, setToken] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (!ready) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Checking your Jira connection…
      </p>
    )
  }
  if (!config) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn't reach the Jira Health server, so Jira can't be connected right now. Try again in a moment.
      </p>
    )
  }

  const kinds = config.jira.authKinds
  const run = async (request: ConnectRequest) => {
    setPending(true)
    setError(null)
    try {
      const conn = await connect(request)
      setToken("")
      onConnected?.(conn)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  if (kinds.includes("demo")) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">With the live server you connect your own Jira account here, so edits are made as you.</p>
        <Button type="button" onClick={() => run({ kind: "demo" })} disabled={pending} autoFocus={autoFocus}>
          {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
          Use the demo account
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    )
  }

  const basic = kinds.includes("basic")
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(basic ? { kind: "basic", email: email.trim(), token: token.trim() } : { kind: "pat", token: token.trim() })
  }
  const tokenLabel = basic ? "API token" : "Personal access token"

  return (
    <form className="space-y-3" onSubmit={submit} noValidate>
      {basic && (
        <div className="space-y-1.5">
          <Label htmlFor="jira-email">Jira email</Label>
          <Input
            id="jira-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-8 max-w-sm"
            autoFocus={autoFocus}
          />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="jira-token">{tokenLabel}</Label>
        <Input
          id="jira-token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="h-8 max-w-sm font-mono"
          aria-invalid={!!error}
          aria-describedby="jira-token-help"
          autoFocus={autoFocus && !basic}
        />
        <p id="jira-token-help" className="text-xs text-muted-foreground">
          {config.jira.tokenHelpUrl ? (
            <a href={config.jira.tokenHelpUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
              Create one in Jira <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : (
            `Create one in your Jira profile.`
          )}{" "}
          It only needs permission to edit the tickets you fix.
        </p>
      </div>
      <p className="flex gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0 translate-y-px text-brand" aria-hidden />
        Edits are made as you, with your Jira permissions. The token is checked with Jira and kept encrypted on the Jira Health server, never in
        this browser.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="sm" disabled={pending || token.trim().length === 0 || (basic && !email.trim())}>
        {pending && <Loader2 className="animate-spin" />}
        Connect Jira
      </Button>
    </form>
  )
}
