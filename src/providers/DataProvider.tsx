import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { AppLoading } from "@/components/AppLoading"
import { ConnectGate } from "@/components/ConnectGate"
import { DataContext, type LoadResult } from "./data-context"
import { NeedsConnectionError, type Backend, type LiveStatus, type LoadedData } from "./data-source"
import { problemsFrom, summariseProblems as summarise } from "./problems"

type Props = {
  children: ReactNode
  backend: Pick<Backend, "mode" | "data" | "demo">
}

type BootError = { message: string; needsConnection: boolean }

/** The current data, kept up to date by the backend's live feed. */
export function DataProvider({ children, backend }: Props) {
  const { data: source, mode, demo } = backend
  const [data, setData] = useState<LoadedData | null>(null)
  const [live, setLive] = useState<LiveStatus | null>(null)
  /** Set when the first load failed and there's nothing to show yet. */
  const [bootError, setBootError] = useState<BootError | null>(null)
  const booted = data !== null

  const boot = useCallback(
    () =>
      source.load().then(setData, (err) =>
        setBootError({ message: summarise(problemsFrom(err)), needsConnection: err instanceof NeedsConnectionError }),
      ),
    [source],
  )

  useEffect(() => {
    let cancelled = false
    source.load().then(
      (loaded) => !cancelled && setData(loaded),
      (err) => !cancelled && setBootError({ message: summarise(problemsFrom(err)), needsConnection: err instanceof NeedsConnectionError }),
    )
    return () => {
      cancelled = true
    }
  }, [source])

  // Live updates once there's data to update.
  useEffect(() => {
    if (!booted) return
    return source.subscribe((u) => (u.kind === "data" ? setData(u.data) : setLive(u.status)))
  }, [source, booted])

  const retryBoot = useCallback(() => {
    setBootError(null)
    void boot()
  }, [boot])

  const refresh = useCallback(() => {
    source.refresh().then(setData, (err) => toast.error("Couldn't refresh the data", { description: summarise(problemsFrom(err)) }))
  }, [source])

  const files = source.files
  const loadFromFile = useCallback(
    async (file: File): Promise<LoadResult> => {
      if (!files) return { ok: false, problems: ["Files can't be loaded here: the data comes from the server."] }
      try {
        const { data: loaded, remembered } = await files.loadFile(file)
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
    [files],
  )

  const resetToSample = useCallback(() => {
    files?.reset().then(
      (loaded) => {
        setData(loaded)
        toast.success("Reset to sample data")
      },
      (err) => toast.error("Couldn't load the sample data", { description: summarise(problemsFrom(err)) }),
    )
  }, [files])

  const value = useMemo(
    () =>
      data && {
        mode,
        dataset: data.dataset,
        origin: data.origin,
        revision: data.revision,
        fixes: data.fixes,
        live,
        refresh,
        loadFromFile: files ? loadFromFile : null,
        resetToSample: files && data.origin.kind === "upload" ? resetToSample : null,
        demo: demo ?? null,
      },
    [data, mode, live, refresh, files, loadFromFile, resetToSample, demo],
  )

  if (!value) {
    if (bootError?.needsConnection) return <ConnectGate onConnected={retryBoot} />
    return <AppLoading error={bootError?.message ?? null} onRetry={retryBoot} />
  }
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
