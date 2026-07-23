# APP0-B05 — Structured Logging and Redaction Foundation — Completion Report

**Checkpoint:** APP0-B05
**Branch:** `production`
**Verdict:** `PASS_WITH_FOLLOW_UPS`
**Commit:** `feat(api): add structured logging and redaction`

---

## A. Preflight

- **Branch:** `production`. **Initial HEAD:** `8bbc53c` (`feat(api): add actor context and audit metadata`, APP0-B04). **Working tree:** clean.
- **History verified:** C01 → S01A → S01B → B01 (`3a2cdde`) → B02 (`e6749fa`) → B03 (`7572a58`) → B04 (`8bbc53c`) all present. `8bbc53c` was **not** assumed to be HEAD — confirmed by `git rev-parse HEAD`.
- **B02/B03/B04 regressions re-run before implementation:** the full `src/platform` suite (14 files / 223 tests) passed on the pre-change tree.
- **Existing logging audit:**
  - Nest used its **default** logger. Bootstrap emitted two lines via `new Logger('Bootstrap')` in `main.ts`.
  - `console.*`/`Logger` usage: only `main.ts` (bootstrap) and benchmark/durability **test** utilities. The B03 exception filter deliberately did **not** log.
  - No structured-logging schema, `LOG_LEVEL` config, or logging test/sink existed.
- **Observability-package runtime audit:** `@embroidery/observability` exists with `main`/`types`/`exports` → `./src/index.ts` (raw TypeScript), `src/index.ts` **empty**, and **no build script**. Importing values from it at runtime would reproduce the IMP-D018 failure that crashed the API container (commit `d52ea5a`). It is therefore **not** runtime-loadable within B05 scope without a Docker/infra change.

## B. Locked logging contract

- **Schema (one-line JSON):** `schemaVersion` (=1), `timestamp` (ISO-8601), `level`, `service` (`"api"`), `event`, `message`, plus optional `context`, `requestId`, `actor`, `http`, `error`, `attributes`.
- **Levels:** `debug` < `info` < `warn` < `error`, with a numeric severity threshold for filtering.
- **Events (platform taxonomy only):** `application.log`, `http.request.completed`, `platform.error`. Malformed event names fall back to `platform.log`. No business/audit event names.
- **Clock:** injected `LogClock` → `Date` (own concern; `ResponseClock`/`AuditClock` deliberately not reused). Duration is measured separately with `performance.now()` (monotonic).
- **Service name:** `api` (single process; no canonical name existed).
- **Correlation:** `requestId` and `actor` are read from the B02 context and B04 actor at emit time; absent outside a request (never fabricated).
- **Sink/config:** newline-delimited JSON on stdout (`debug`/`info`) and stderr (`warn`/`error`); `LOG_LEVEL` (default `info` in production, `debug` otherwise) and `LOG_STACK_ENABLED` (default off in production).
- **Audit-vs-log boundary:** a structured log is **not** an audit event — it persists nothing, writes no `audit_events`, and satisfies no business audit requirement.

## C. Redaction policy

- **Key rules:** case/separator-normalised denylist (authorization, proxy-authorization, cookie/set-cookie, password/passwd/pwd, secret/client_secret, token/access_token/refresh_token/id_token, api_key/x-api-key, private_key, credential(s), otp, code_hash, verification_code, session, jwt, bearer). A matching key's value becomes `[REDACTED]`.
- **Value rules:** conservative, anchored patterns — `Bearer <token>`, basic-auth-in-URL, credential-bearing `postgres/redis/amqp/mongodb` URLs, JWT-like triples, PEM private-key blocks, inline `password/token/secret/api_key` assignments.
- **Bounds/circular handling:** max depth 6, max 100 array items / object keys, max 2 000-char strings; `[Circular]`, `[Truncated]`, `[Unreadable]`, `[Buffer n]` markers. Handles Date, BigInt, Buffer, Error (+ cause), Map/Set, throwing getters, proxies; never mutates input; never throws.
- **Stack policy:** internal-error stack is gated by `LOG_STACK_ENABLED` (off in production), bounded to 30 lines / 4 000 chars, and value-redacted line by line. No stack ever appears on a non-error record or in a public response.
- **False-positive controls:** tested that `tokenCount`, `authorizationRequired`, benign UUIDs/route ids, safe URLs, and the word "authorization" in prose are left intact.

## D. Implementation

- **Shared package:** unchanged. `@embroidery/observability` stays empty (see A / follow-up F-1). No `dist` require to it exists in the compiled API (verified).
- **API adapter (`apps/api/src/platform/logging/`):** `log-record.ts` (contract/constants), `log-redaction.ts` + `log-sanitizer.ts` (redaction/sanitisation), `actor-log-view.ts`, `log-record.factory.ts` (pure assembly), `log-clock.ts`, `log-sink.ts` (`StdoutLogSink`), `logging-config.ts`, `structured-logger.service.ts`, `nest-logger.adapter.ts`, `safe-route.ts`, `request-logging.interceptor.ts`, `log-error.ts`, `logging.module.ts` (`@Global`).
- **Request lifecycle:** `RequestLoggingInterceptor` (global `APP_INTERCEPTOR`) attaches a `response.once('finish', …)` listener, restoring the async context via `AsyncLocalStorage.snapshot()` so a **late-bound actor** and the **final status** are captured; emits exactly one `http.request.completed` record with monotonic `durationMs`. It reads the request and never writes to the response.
- **B03 filter integration:** `ApiExceptionFilter` now injects `StructuredLogger` + `LOGGING_CONFIG` and, **after** replying, emits one redacted `platform.error` for a 5xx (best-effort, failure swallowed). Public envelope, error mapping and 4xx behaviour unchanged. `HttpResponseModule` imports `LoggingModule`.
- **Config:** `LOG_LEVEL` / `LOG_STACK_ENABLED` parsed at startup (fail-fast on invalid), documented in `.env.example`.
- **Runtime package boundary:** implementation is API-local; the compiled `dist` contains **no** require to `@embroidery/observability`.
- **Bootstrap:** `main.ts` calls `app.useLogger(app.get(NestLoggerAdapter))` so Nest framework/startup logs become the same one-line JSON.
- **Decision-register sync:** IMP-D021 (records already-locked B04 actor/audit semantics) and IMP-D022 (B05 logging) added.

## E. Behavior evidence

Asserted by `logging.integration.spec.ts` (recording sink; fixed clocks) and confirmed by a real compiled-runtime boot:

- **Success:** exactly **1** `http.request.completed` (info), method/route/statusCode/`durationMs`, `requestId` = the B02 id, anonymous actor.
- **Actor bound in handler:** captured as `{ kind: ADMIN, id }` at completion.
- **4xx:** exactly **1** completion (warn), **0** `platform.error`.
- **5xx:** **1** completion (warn) + **exactly 1** `platform.error` (error); public 500 body identical to B03 (`INTERNAL_SERVER_ERROR`, generic message), and no `hunter2`/`Bearer`/`postgres`/`customers` in the response.
- **Query/body/headers:** query string, request body, and `Authorization`/`Cookie` headers never appear in any record; the completion `route` carries no `?`.
- **Concurrency:** three concurrent requests keep their own `requestId`/actor with no cross-contamination.
- **Health:** liveness body `{ status: ok, service: api, … }` unchanged and still logged.
- **Runtime boot (compiled `node dist/main.js`, dev DB):** structured JSON startup lines (`RoutesResolver`, `RouterExplorer`, `DatabaseModule`, `NestApplication`, `Bootstrap`) and a live request produced `{"event":"http.request.completed","requestId":"smoke-req-2","actor":{"kind":"ANONYMOUS"},"http":{"method":"GET","route":"/api/health","statusCode":200,"durationMs":6.028}}`.

## F. Security evidence

- **Leak corpus** (a message packed with a `postgres://admin:hunter2@…` URL, a `Bearer sk_live_…` token, SQL, and file paths) is redacted to `postgres[REDACTED]…` and `authorization: [REDACTED]` in both the public response (B03) and the internal error log — verified in the running B03 integration suite output and asserted in tests.
- No PII/credential/body/header reaches a record; the raw exception object is never serialised (only a redacted `{ name, message, code?, stack? }` summary).
- Sink fallback emits a minimal valid record on serialisation failure and never recurses.

## G. Validation

- `pnpm --filter @embroidery/api typecheck` — **PASS**. `lint` (changed files) — **PASS**. `build` — **PASS**.
- API tests: `src/platform` = **21 suites / 320 tests PASS** (223 pre-existing regressions + 97 new logging tests). Redaction, sanitiser structural safety, logger construction/level filtering/sink, Nest adapter, config, error summariser, and HTTP integration all green.
- `pnpm check:openapi` — **PASS, artifact byte-identical**.
- `node tools/check-file-size.mjs` — **PASS** (no new file over threshold; largest new logic file well under 400 lines).
- `git diff --check` — clean.
- **Runtime-loadability proof:** compiled `dist` has no `@embroidery/observability` require; `node dist/main.js` boots past full module wiring with no `MODULE_NOT_FOUND` and emits valid structured JSON.
- Full `pnpm quality` status: see the terminal response (run with the dev PostgreSQL container up).

## H. Scope confirmation

No OpenTelemetry/tracing, no logging vendor/framework, no remote/file transport, no log retention/sampling, no audit persistence, no schema/migration, no auth/authorization, no feature events or endpoints, no request/response body logging, no raw header/cookie logging, no envelope-shape change, no request-ID ownership change, no OpenAPI artifact change, no frontend/worker/Nginx change. APP0-DEC-CODEGEN and APP0-C02 **not** started.

## I. Git evidence

- Commit: `feat(api): add structured logging and redaction`.
- Final HEAD: the new commit; working tree clean after it.
- **Push status: NOT PUSHED.**

## J. Verdict

**`PASS_WITH_FOLLOW_UPS`.**

Follow-ups (none blocking):

- **F-1 — Shared observability extraction.** The pure primitives (record contract, redaction, sanitiser, sink interface) are the natural contents of `@embroidery/observability`, but that package's `main` still resolves to unbuilt TS source (IMP-D018) and giving it a `dist` build entails a Docker copy/build change that is out of B05 scope. The runtime is API-local until the package is made runtime-loadable; extraction is deferred to its owner.
- **F-2 — Route-template limitation.** When the framework exposes no route template, `safeRoute` logs the query-stripped pathname, which can contain an id. Bounded (no query, length-capped) and preferred over logging nothing; revisit if a stricter path policy is locked.
- **F-3 — System/worker correlation.** The worker application emits no structured logs yet; the logging platform is API-local and its extension to the worker belongs to the worker's owning phase.
