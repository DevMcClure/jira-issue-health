import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { STORY_POINT_PICKS } from "@/lib/resolutions/form"

type Props = { id: string; value: string; onChange: (v: string) => void; invalid?: boolean }

/** A number input with the usual estimates as quick picks. */
export function StoryPointsInput({ id, value, onChange, invalid }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. 3"
        className="h-8 w-20"
        aria-invalid={invalid || undefined}
      />
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={STORY_POINT_PICKS.map(String).includes(value.trim()) ? value.trim() : ""}
        onValueChange={(v) => v && onChange(v)}
        aria-label="Quick picks"
      >
        {STORY_POINT_PICKS.map((p) => (
          <ToggleGroupItem key={p} value={String(p)} className="min-w-8 px-2 tabular-nums" aria-label={`${p} points`}>
            {p}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
