import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConnectJiraForm } from "./ConnectJiraForm"

/** Before any data: the server only shares it with people connected to Jira (DATA_ACCESS=connected). */
export function ConnectGate({ onConnected }: { onConnected: () => void }) {
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect Jira to continue</CardTitle>
          <CardDescription>Jira Health shows ticket data only to people with a Jira account.</CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectJiraForm onConnected={onConnected} autoFocus />
        </CardContent>
      </Card>
    </div>
  )
}
