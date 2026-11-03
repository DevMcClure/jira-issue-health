import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type Props = {
  /** The file that failed and why, or null when closed. */
  failure: { fileName: string; problems: string[] } | null
  onClose: () => void
}

/** Every reason a file couldn't be loaded, readable, with a reminder that the current data is untouched. */
export function LoadProblemsDialog({ failure, onClose }: Props) {
  return (
    <Dialog open={failure !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Couldn't load {failure?.fileName}</DialogTitle>
          <DialogDescription>
            It isn't a Trawler export this app can read. Your current data hasn't changed.
            {failure && failure.problems.length > 1 && ` ${failure.problems.length} problems:`}
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">
          {failure?.problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
        <DialogFooter>
          <DialogClose asChild>
            <Button>OK</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
