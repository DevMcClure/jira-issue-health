import { Check, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type FilterOption = {
  value: string
  label: string
  group?: string
  icon?: React.ReactNode
  /** Optional facet count shown on the right. */
  count?: number
}

type Props = {
  title: string
  icon?: LucideIcon
  options: FilterOption[]
  selected: string[]
  onChange: (next: string[]) => void
  /** Text shown when nothing is selected. */
  emptyLabel?: string
  className?: string
  /** E.g. "hidden xl:inline" to show only the icon and value where space is short (the title stays in the label). */
  titleClassName?: string
  align?: "start" | "end"
  disabled?: boolean
}

/** Compact multi-select: Popover + Command, showing "All" or a count badge. */
export function FilterPopover({
  title,
  icon: Icon,
  options,
  selected,
  onChange,
  emptyLabel = "All",
  className,
  titleClassName,
  align = "end",
  disabled = false,
}: Props) {
  const selectedSet = new Set(selected)
  const groups = groupBy(options)

  const toggle = (value: string) =>
    onChange(selectedSet.has(value) ? selected.filter((v) => v !== value) : [...selected, value])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 gap-1.5 border-dashed", className)}
          disabled={disabled}
          aria-label={`${title}: ${selected.length ? `${selected.length} selected` : emptyLabel}`}
        >
          {Icon && <Icon className="size-3.5" />}
          <span className={titleClassName}>{title}</span>
          {selected.length > 0 ? (
            <Badge variant="secondary" className="rounded-sm px-1 font-normal tabular-nums">
              {selected.length}
            </Badge>
          ) : (
            <span className="font-normal text-muted-foreground">{emptyLabel}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align={align}>
        <Command>
          <CommandInput placeholder={`Search ${title.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            {groups.map(([group, items]) => (
              <CommandGroup key={group ?? "_"} heading={group}>
                {items.map((o) => {
                  const isSelected = selectedSet.has(o.value)
                  return (
                    <CommandItem key={o.value} value={`${o.label} ${o.group ?? ""}`} onSelect={() => toggle(o.value)}>
                      <div
                        className={cn(
                          "flex size-4 items-center justify-center rounded-[4px] border border-primary",
                          isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible",
                        )}
                      >
                        <Check className="size-3 text-primary-foreground" />
                      </div>
                      {o.icon}
                      <span className="truncate">{o.label}</span>
                      {o.count !== undefined && (
                        <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">{o.count}</span>
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
            {selected.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange([])} className="justify-center text-center">
                    Clear filter
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function groupBy(options: FilterOption[]): [string | undefined, FilterOption[]][] {
  const map = new Map<string | undefined, FilterOption[]>()
  for (const o of options) map.set(o.group, [...(map.get(o.group) ?? []), o])
  return [...map.entries()]
}
