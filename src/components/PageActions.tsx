import { ClipboardCopy, RotateCcw, SlidersHorizontal, Upload } from "lucide-react"
import { useRef } from "react"
import { Button } from "@/components/ui/button"

type Props = {
  onOpenRequiredFields: () => void
  /** Demo only: data from the server can't be replaced by a file. */
  onLoadFile: ((file: File) => void) | null
  /** Only offered while a loaded file is showing. */
  onResetToSample: (() => void) | null
  onCopyFixList: () => void
  /** Tickets in the current list, for the copy button. */
  ticketCount: number
}

/** The page's header actions. */
export function PageActions({ onOpenRequiredFields, onLoadFile, onResetToSample, onCopyFixList, ticketCount }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={onOpenRequiredFields}>
        <SlidersHorizontal />
        Required fields
      </Button>
      {onLoadFile && (
        <>
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            <Upload />
            Load Trawler file
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.log,.txt,application/json,text/plain"
            className="hidden"
            aria-label="Trawler export file"
            onChange={(e) => {
              const file = e.target.files?.[0]
              // Reset so the same file can be picked again after a fix.
              e.target.value = ""
              if (file) onLoadFile(file)
            }}
          />
        </>
      )}
      {onResetToSample && (
        <Button variant="outline" size="sm" onClick={onResetToSample}>
          <RotateCcw />
          Reset to sample data
        </Button>
      )}
      <Button size="sm" onClick={onCopyFixList} disabled={ticketCount === 0}>
        <ClipboardCopy />
        Copy fix list
      </Button>
    </div>
  )
}
