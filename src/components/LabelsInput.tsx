import { Plus, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Props = {
  id: string
  value: string[]
  onChange: (labels: string[]) => void
  /** Labels to offer as one-click additions, most useful first. */
  common: string[]
}

/** Multi-select with free entry: chosen labels as removable chips, common ones to add, and a box for new ones. */
export function LabelsInput({ id, value, onChange, common }: Props) {
  const [draft, setDraft] = useState("")
  const add = (label: string) => {
    const l = label.trim()
    if (l && !value.includes(l)) onChange([...value, l])
    setDraft("")
  }
  const offered = common.filter((l) => !value.includes(l)).slice(0, 8)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.length === 0 && <span className="text-xs text-muted-foreground">No labels</span>}
        {value.map((l) => (
          <span key={l} className="inline-flex items-center gap-1 rounded-md border bg-secondary px-1.5 py-0.5 text-xs">
            {l}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== l))} aria-label={`Remove label ${l}`}>
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault()
              add(draft)
            }
          }}
          placeholder="Add a label…"
          className="h-8 w-44"
        />
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => add(draft)} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
      {offered.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground">Common:</span>
          {offered.map((l) => (
            <Button key={l} type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => add(l)}>
              <Plus className="size-3" />
              {l}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
