import { ClipboardCopy, Eraser, MoreHorizontal, RotateCcw, SlidersHorizontal, Upload } from "lucide-react"
import { useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Props = {
  onOpenRequiredFields: () => void
  onLoadFile: (file: File) => void
  /** Only offered while a loaded file is showing. */
  onResetToSample: (() => void) | null
  onCopyFixList: () => void
  /** Tickets in the current list, for the copy button. */
  ticketCount: number
  resolvedCount: number
  onClearResolutions: () => void
}

/** The page's header actions. Everything happens in this browser. */
export function PageActions({
  onOpenRequiredFields,
  onLoadFile,
  onResetToSample,
  onCopyFixList,
  ticketCount,
  resolvedCount,
  onClearResolutions,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={onOpenRequiredFields}>
        <SlidersHorizontal />
        Required fields
      </Button>
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-8" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Local changes (this browser)</DropdownMenuLabel>
          <DropdownMenuItem disabled={resolvedCount === 0} onSelect={onClearResolutions}>
            <Eraser />
            Clear local resolutions
            {resolvedCount > 0 && <span className="ml-auto text-xs text-muted-foreground tabular-nums">{resolvedCount}</span>}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
