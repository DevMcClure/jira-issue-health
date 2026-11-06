/**
 * The HTTP API. Every route sits under `${BASE_PATH}/api`; CORS allows only
 * CORS_ORIGIN. Built from env plus its dependencies, so tests run it in memory.
 *
 *   GET    /health                 liveness + store check
 *   GET    /config                 what the web app needs to know (Jira flavour, how to connect)
 *   GET    /dataset                the data as contract JSON (ETag = revision; 304 when unchanged)
 *   GET    /events                 server-sent events: "dataset" (new revision), "fix"
 *   GET    /fixes?days=7           fixes made through Resolve
 *   GET    /jira/connection        who you're connected to Jira as
 *   POST   /jira/connection        connect with your own token (checked with Jira, kept encrypted)
 *   DELETE /jira/connection        disconnect (forgets the token)
 *   POST   /issues/:key/resolve    write missing fields to Jira as you
 *   POST   /ingest                 replace the data with a Trawler export (bearer INGEST_TOKEN)
 */
import { timingSafeEqual } from "node:crypto"
import type { OutgoingHttpHeaders } from "node:http"
import cookie from "@fastify/cookie"
import cors from "@fastify/cors"
import rateLimit from "@fastify/rate-limit"
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify"
import { connectRequestSchema, toExportDoc, type Fix, type ResolveResult, type ServerConfig } from "../src/lib/api/contract"
import { JiraExportError, parseExportText } from "../src/lib/jira/adapter"
import type { Env } from "./env"
import { JiraAuthError, JiraUnreachableError, type JiraClient, type JiraCredentials } from "./jira/client"
import type { Sessions } from "./jira/sessions"
import { createDatasetCache, createLiveHub, debounce } from "./live"
import { resolveIssue } from "./resolve"
import type { IssueStore } from "./store/issue-store"

type Options = {
  env: Env
  store: IssueStore
  jira: JiraClient
  sessions: Sessions
  version: string
  /** Turn request logging off in tests. */
  logger?: boolean
  heartbeatMs?: number
  now?: () => Date
}

export const SESSION_COOKIE = "jh_session"
/** State-changing requests must carry this; a plain cross-site form can't. */
export const CSRF_HEADER = "x-requested-with"
export const CSRF_VALUE = "jira-health"

const STATUS_FOR: Record<Exclude<ResolveResult, { ok: true }>["code"], number> = {
  invalid: 400,
  "not-connected": 401,
  forbidden: 403,
  "not-found": 404,
  conflict: 409,
  rejected: 422,
  "jira-unreachable": 502,
}

function tokenHelpUrl(env: Env): string | null {
  if (env.JIRA_FLAVOUR === "cloud") return "https://id.atlassian.com/manage-profile/security/api-tokens"
  return env.JIRA_BASE_URL ? `${env.JIRA_BASE_URL}/secure/ViewProfile.jspa?selectedTab=com.atlassian.pats.pats-plugin:jira-user-personal-access-tokens` : null
}

const sameSecret = (given: string, expected: string) => {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function buildApp({ env, store, jira, sessions, version, logger = true, heartbeatMs, now = () => new Date() }: Options) {
  const app = Fastify({ logger: logger ? { level: env.LOG_LEVEL } : false, trustProxy: env.TRUST_PROXY })
  const startedAt = Date.now()
  const cache = createDatasetCache(store)
  const hub = createLiveHub({ heartbeatMs })

  /** Re-read the data; tell every browser when it changed. */
  const announce = async () => {
    if (await cache.refresh()) {
      const current = await cache.get()
      if (current) hub.broadcast({ type: "dataset", revision: current.revision })
    }
  }
  const onStoreChange = debounce(() => {
    announce().catch((err: Error) => app.log.warn({ err: err.message }, "Couldn't re-read the data after a change"))
  }, 300)
  let stopWatching: (() => void | Promise<void>) | undefined
  app.addHook("onReady", async () => {
    stopWatching = await store.watch(onStoreChange)
  })
  app.addHook("onClose", async () => {
    onStoreChange.cancel()
    await stopWatching?.()
    hub.close()
  })

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Content-Type", "X-Requested-With", "If-None-Match"],
    exposedHeaders: ["ETag"],
  })
  await app.register(cookie)
  // Only routes that opt in are limited.
  await app.register(rateLimit, { global: false })

  const apiPath = `${env.BASE_PATH}/api`
  const cookieOptions = {
    path: apiPath,
    httpOnly: true,
    sameSite: env.COOKIE_SAMESITE,
    secure: env.COOKIE_SECURE,
    maxAge: sessions.ttlSeconds,
  } as const

  const csrf = async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.headers[CSRF_HEADER] !== CSRF_VALUE) return reply.code(403).send({ error: `Send the ${CSRF_HEADER}: ${CSRF_VALUE} header.` })
  }
  const sessionOf = (req: FastifyRequest) => sessions.get(req.cookies[SESSION_COOKIE])
  /** DATA_ACCESS=connected: only people connected to Jira can read the data. */
  const canRead = async (req: FastifyRequest, reply: FastifyReply) => {
    if (env.DATA_ACCESS === "connected" && !(await sessionOf(req))) {
      return reply.code(401).send({ error: "Connect your Jira account to see the data." })
    }
  }

  await app.register(
    async (api) => {
      api.get("/health", async (_req, reply) => {
        const uptimeSeconds = Math.round((Date.now() - startedAt) / 1000)
        try {
          await store.ping()
          return { status: "ok", store: "ok", version, uptimeSeconds, liveClients: hub.size }
        } catch {
          return reply.code(503).send({ status: "degraded", store: "down", version, uptimeSeconds })
        }
      })

      api.get("/config", async (): Promise<ServerConfig> => {
        const current = await cache.get().catch(() => null)
        return {
          mode: "api",
          version,
          dataAccess: env.DATA_ACCESS,
          jira: {
            writer: jira.kind,
            flavour: env.JIRA_FLAVOUR,
            baseUrl: env.JIRA_BASE_URL ?? current?.dataset.meta.jiraBaseUrl ?? null,
            authKinds: env.JIRA_FLAVOUR === "cloud" ? ["basic"] : ["pat"],
            tokenHelpUrl: tokenHelpUrl(env),
            resolutions: env.JIRA_RESOLUTIONS,
          },
        }
      })

      api.get("/dataset", { preHandler: canRead }, async (req, reply) => {
        const current = await cache.get()
        if (!current) return reply.code(404).send({ error: "No data yet. Send a Trawler export to POST /api/ingest, or start with SEED_MOCK=true." })
        const etag = `"${current.revision}"`
        reply.header("ETag", etag).header("Cache-Control", "no-cache")
        if (req.headers["if-none-match"] === etag) return reply.code(304).send()
        return reply.type("application/json; charset=utf-8").send(current.json)
      })

      api.get("/events", { preHandler: canRead }, async (req, reply) => {
        const current = await cache.get().catch(() => null)
        reply.hijack()
        reply.raw.writeHead(200, {
          ...(reply.getHeaders() as OutgoingHttpHeaders),
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          // Stop nginx buffering the stream.
          "X-Accel-Buffering": "no",
        })
        reply.raw.write("retry: 5000\n\n")
        hub.add(reply.raw, current ? [{ type: "dataset", revision: current.revision }] : [])
        req.log.debug({ clients: hub.size }, "Live client connected")
      })

      api.get<{ Querystring: { days?: string } }>("/fixes", { preHandler: canRead }, async (req) => {
        const days = Math.min(30, Math.max(1, Number(req.query.days) || 7))
        return { fixes: await store.fixes(new Date(now().getTime() - days * 86_400_000)) }
      })

      api.get("/jira/connection", async (req, reply) => {
        reply.header("Cache-Control", "no-store")
        return { connection: (await sessionOf(req))?.connection ?? null }
      })

      api.post("/jira/connection", { preHandler: csrf, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
        const parsed = connectRequestSchema.safeParse(req.body)
        if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request." })
        const input = parsed.data
        if (input.kind === "demo") return reply.code(400).send({ error: "Demo connections only exist in the in-browser demo." })
        const credentials: JiraCredentials = input.kind === "pat" ? { kind: "pat", token: input.token } : input
        try {
          const user = await jira.whoAmI(credentials)
          await sessions.end(req.cookies[SESSION_COOKIE])
          const { sessionId, connection } = await sessions.start(credentials, user)
          reply.setCookie(SESSION_COOKIE, sessionId, cookieOptions)
          req.log.info({ user: user.id }, "Jira connected")
          return { connection }
        } catch (err) {
          if (err instanceof JiraAuthError) return reply.code(401).send({ error: err.message })
          if (err instanceof JiraUnreachableError) return reply.code(502).send({ error: err.message })
          throw err
        }
      })

      api.delete("/jira/connection", { preHandler: csrf }, async (req, reply) => {
        await sessions.end(req.cookies[SESSION_COOKIE])
        reply.clearCookie(SESSION_COOKIE, { path: apiPath })
        return { connection: null }
      })

      api.post<{ Params: { key: string } }>(
        "/issues/:key/resolve",
        { preHandler: csrf, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
        async (req, reply) => {
          const session = await sessionOf(req)
          if (!session) {
            const result: ResolveResult = { ok: false, code: "not-connected", message: "Connect your Jira account to resolve tickets.", fieldErrors: {} }
            return reply.code(401).send(result)
          }
          const result = await resolveIssue(req.params.key, req.body, session, {
            store,
            cache,
            jira,
            now,
            onWritten: async (fix: Fix) => {
              await announce()
              hub.broadcast({ type: "fix", fix })
            },
          })
          if (result.ok) {
            req.log.info({ issue: result.fix.issueKey, fields: result.written, user: session.connection.user.id }, "Resolved in Jira")
            return result
          }
          if (result.code === "not-connected") {
            await sessions.end(req.cookies[SESSION_COOKIE])
            reply.clearCookie(SESSION_COOKIE, { path: apiPath })
          }
          if (result.code === "conflict") await announce()
          return reply.code(STATUS_FOR[result.code]).send(result)
        },
      )

      if (env.INGEST_TOKEN) {
        const token = env.INGEST_TOKEN
        await api.register(async (scope) => {
          // The export is parsed by the same adapter as a file loaded in the browser (JSON or an audit log).
          scope.addContentTypeParser(
            ["application/json", "text/plain"],
            { parseAs: "string", bodyLimit: env.INGEST_MAX_MB * 1024 * 1024 },
            (_req, body, done) => done(null, body),
          )
          scope.post("/ingest", async (req, reply) => {
            const auth = req.headers.authorization ?? ""
            if (!auth.startsWith("Bearer ") || !sameSecret(auth.slice(7), token)) return reply.code(401).send({ error: "Bad ingest token." })
            try {
              const dataset = parseExportText(req.body as string)
              await store.replace(toExportDoc(dataset))
              await announce()
              const current = await cache.get()
              req.log.info({ issues: dataset.issues.length }, "Ingested a Trawler export")
              return { ok: true, issues: dataset.issues.length, revision: current?.revision ?? null }
            } catch (err) {
              if (err instanceof JiraExportError) return reply.code(422).send({ error: "Not a valid Trawler export.", problems: err.problems.slice(0, 50) })
              if (err instanceof SyntaxError) return reply.code(422).send({ error: `Not valid JSON: ${err.message}` })
              throw err
            }
          })
        })
      }
    },
    { prefix: apiPath },
  )

  return app
}
