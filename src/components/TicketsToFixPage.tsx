import { ListTodo } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { useData } from "@/hooks/useData"
import { PageHeader } from "./PageHeader"

/** The app's one view. Filters, summary strip and the ticket list fill this in. */
export function TicketsToFixPage() {
  const { dataset } = useData()
  return (
    <>
      <PageHeader
        title="Tickets to fix"
        description="Tickets missing information the Jira Dashboard needs, and what each gap affects."
      />
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <ListTodo className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">
            {dataset.issues.length} tickets loaded across {dataset.teams.length} teams
          </p>
          <p className="text-sm text-muted-foreground">The list of tickets to fix will appear here.</p>
        </CardContent>
      </Card>
    </>
  )
}
