import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { AppLoading } from "@/components/AppLoading"
import { DataContext, type LoadResult } from "./data-context"
import type { DataSource, LoadedData } from "./data-source"
import { problemsFrom, summariseProblems as summarise } from "./problems"
import { createStaticDataSource } from "./static-data-source"

const defaultSource = createStaticDataSource()

type Props = {
  children: ReactNode
  /** Where data comes from; defaults to the bundled sample plus loaded files. */
  dataSource?: DataSource
}

export function DataProvider({ children, dataSource = defaultSource }: Props) {
  const [data, setData] = useState<LoadedData | null>(null)
  /** Set when the first load failed and there's nothing to show yet. */
  const [bootError, setBootError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    dataSource.load().then(
      (loaded) => !cancelled && setData(loaded),
      (err) => !cancelled && setBootError(summarise(problemsFrom(err))),
    )
    return () => {
      cancelled = true
    }
  }, [dataSource])

  const retryBoot = useCallback(() => {
    setBootError(null)
    dataSource.load().then(setData, (err) => setBootError(summarise(problemsFrom(err))))
  }, [dataSource])

  const loadFromFile = useCallback(
    async (file: File): Promise<LoadResult> => {
      try {
        const { data: loaded, remembered } = await dataSource.loadFile(file)
        setData(loaded)
        toast.success(`Loaded ${loaded.dataset.issues.length} tickets from ${file.name}`, {
          description: remembered
            ? "Processed in your browser; nothing was uploaded."
            : "Processed in your browser. Too large to remember after a refresh.",
        })
        return { ok: true, dataset: loaded.dataset }
      } catch (err) {
        // The caller shows every problem; the current data stays as it was.
        return { ok: false, problems: problemsFrom(err) }
      }
    },
    [dataSource],
  )

  const resetToSample = useCallback(() => {
    dataSource.reset().then(
      (loaded) => {
        setData(loaded)
        toast.success("Reset to sample data")
      },
      (err) => toast.error("Couldn't load the sample data", { description: summarise(problemsFrom(err)) }),
    )
  }, [dataSource])

  const value = useMemo(
    () => data && { dataset: data.dataset, origin: data.origin, loadFromFile, resetToSample },
    [data, loadFromFile, resetToSample],
  )

  if (!value) return <AppLoading error={bootError} onRetry={retryBoot} />
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
