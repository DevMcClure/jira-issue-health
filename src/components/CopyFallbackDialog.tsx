import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

/** When the clipboard isn't available: the Markdown, selected, to copy by hand. */
export function CopyFallbackDialog({ text, onClose }: { text: string | null; onClose: () => void }) {
  return (
    <Dialog open={text !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Copy fix list</DialogTitle>
          <DialogDescription>Your browser didn't allow copying automatically. Select all and copy it from here.</DialogDescription>
        </DialogHeader>
        <Textarea readOnly value={text ?? ""} className="h-72 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} autoFocus />
        <DialogFooter>
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
