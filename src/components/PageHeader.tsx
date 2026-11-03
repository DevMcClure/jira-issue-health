import type { ReactNode } from "react"

type Props = { title: string; description: string; actions?: ReactNode }

export function PageHeader({ title, description, actions }: Props) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {actions}
    </div>
  )
}
