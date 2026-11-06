/**
 * Every setting the server reads, validated at startup. All come from the
 * environment (a git-ignored .env in development); nothing real is in the code.
 * See .env.example.
 */
import { z } from "zod"

const bool = z
  .enum(["true", "false", "1", "0", "yes", "no"], { message: "must be true or false" })
  .transform((v) => v === "true" || v === "1" || v === "yes")

const text = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))

const positiveInt = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform(Number)
    .pipe(z.number({ message: "must be a number" }).int("must be a whole number").positive("must be more than 0"))

const list = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((s) =>
      s
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    )

/** "/" or "/something", without a trailing slash ("" for the root). */
const basePath = z
  .string()
  .trim()
  .default("/")
  .refine((p) => p.startsWith("/"), { message: "must start with /" })
  .transform((p) => (p === "/" ? "" : p.replace(/\/+$/, "")))

const envSchema = z.object({
  // --- HTTP
  HOST: z.string().trim().default("127.0.0.1"),
  PORT: z
    .string()
    .default("8787")
    .transform(Number)
    .pipe(z.number({ message: "must be a number" }).int().min(1, "must be 1–65535").max(65535, "must be 1–65535")),
  BASE_PATH: basePath,
  /** Origins allowed to call the API with cookies (comma-separated), e.g. the GitHub Pages origin. */
  CORS_ORIGIN: list("http://localhost:5173"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** Behind a TLS-terminating proxy, trust its X-Forwarded-* headers. */
  TRUST_PROXY: bool.default(false),

  // --- Issue data
  /** "mongo" in every real deployment; "memory" runs on the bundled mock data, for development only. */
  DATA_STORE: z.enum(["mongo", "memory"], { message: "must be mongo or memory" }).default("mongo"),
  MONGO_URI: text.refine((u) => !u || /^mongodb(\+srv)?:\/\//.test(u), { message: "must start with mongodb:// or mongodb+srv://" }),
  MONGO_DB_NAME: text,
  MONGO_TLS_CA_FILE: text,
  /** Put the mock data into an empty database (development). */
  SEED_MOCK: bool.default(false),
  /** Without change streams (a standalone MongoDB), how often to look for changes. */
  LIVE_POLL_SECONDS: positiveInt("15"),
  /** Bearer token for POST /api/ingest; unset turns ingest off. */
  INGEST_TOKEN: text,
  INGEST_MAX_MB: positiveInt("50"),
  /** "open": anyone who can reach the server can read the data. "connected": only people connected to Jira. */
  DATA_ACCESS: z.enum(["open", "connected"], { message: "must be open or connected" }).default("open"),

  // --- Jira
  /** "rest" writes to a real Jira; "mock" is a built-in stand-in for development. */
  JIRA_MODE: z.enum(["rest", "mock"], { message: "must be rest or mock" }).default("mock"),
  JIRA_BASE_URL: text.refine((u) => !u || /^https?:\/\/\S+$/.test(u), { message: "must be an http(s) URL" }),
  JIRA_FLAVOUR: z.enum(["datacenter", "cloud"], { message: "must be datacenter or cloud" }).default("datacenter"),
  /** The custom field holding story points, e.g. customfield_10016. */
  JIRA_FIELD_STORY_POINTS: text,
  /** Data Center: the Epic Link custom field. Cloud uses the parent field instead. */
  JIRA_FIELD_EPIC_LINK: text,
  JIRA_RESOLUTIONS: list("Done,Won't Do,Duplicate,Cannot Reproduce"),
  JIRA_TIMEOUT_SECONDS: positiveInt("15"),

  // --- People's Jira connections
  /** Encrypts each person's Jira token at rest. At least 32 characters; keep it secret. */
  TOKEN_ENCRYPTION_KEY: z.string({ message: "TOKEN_ENCRYPTION_KEY is required" }).min(32, "must be at least 32 characters"),
  SESSION_TTL_HOURS: positiveInt("12"),
  /** "none" when the web app is on another site (e.g. GitHub Pages) than the API; needs HTTPS. */
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_SECURE: bool.default(true),
})

export type Env = z.output<typeof envSchema>

export class EnvError extends Error {
  readonly problems: string[]
  constructor(problems: string[]) {
    super(`The server can't start; fix these settings (see .env.example):\n${problems.map((p) => `  - ${p}`).join("\n")}`)
    this.name = "EnvError"
    this.problems = problems
  }
}

const PLACEHOLDER = "change-me-to-a-long-random-string-of-32-chars-or-more"

/** Settings that depend on each other. */
function crossProblems(env: Env): string[] {
  const problems: string[] = []
  if (env.DATA_STORE === "mongo") {
    if (!env.MONGO_URI) problems.push("MONGO_URI is required with DATA_STORE=mongo")
    if (!env.MONGO_DB_NAME) problems.push("MONGO_DB_NAME is required with DATA_STORE=mongo")
  }
  if (env.JIRA_MODE === "rest") {
    if (!env.JIRA_BASE_URL) problems.push("JIRA_BASE_URL is required with JIRA_MODE=rest")
    if (!env.JIRA_FIELD_STORY_POINTS) problems.push("JIRA_FIELD_STORY_POINTS is required with JIRA_MODE=rest (e.g. customfield_10016)")
    if (env.JIRA_FLAVOUR === "datacenter" && !env.JIRA_FIELD_EPIC_LINK)
      problems.push("JIRA_FIELD_EPIC_LINK is required with JIRA_MODE=rest on Data Center (e.g. customfield_10014)")
    if (env.TOKEN_ENCRYPTION_KEY === PLACEHOLDER) problems.push("TOKEN_ENCRYPTION_KEY: replace the placeholder from .env.example")
  }
  if (env.COOKIE_SAMESITE === "none" && !env.COOKIE_SECURE) problems.push("COOKIE_SAMESITE=none needs COOKIE_SECURE=true")
  if (env.CORS_ORIGIN.includes("*")) problems.push("CORS_ORIGIN can't be * (cookies are sent); list the web app's origins")
  return problems
}

export function loadEnv(raw: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(raw)
  if (!parsed.success) {
    throw new EnvError(parsed.error.issues.map((i) => `${i.path.join(".") || "(env)"}: ${i.message}`))
  }
  const problems = crossProblems(parsed.data)
  if (problems.length) throw new EnvError(problems)
  return parsed.data
}
