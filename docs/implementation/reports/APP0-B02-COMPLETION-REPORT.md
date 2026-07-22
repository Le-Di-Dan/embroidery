# APP0-B02 — Request context and effective request-ID propagation — Completion report

Checkpoint: `APP0-B02`
Phase: [APP0 — Application Delivery Foundation](../phases/APP0-APPLICATION-DELIVERY-FOUNDATION.md)
Decision recorded: `IMP-D020` in the [implementation decision register](../14-IMPLEMENTATION-DECISION-REGISTER.md)
Verdict: **PASS_WITH_FOLLOW_UPS**

---

## A. Preflight

| Item | Evidence |
|---|---|
| Branch | `production` |
| Initial `HEAD` | `3a2cddec656d1cc1c64fa3c1a3ea8aa15c34a937` — `feat(api): add deterministic OpenAPI foundation` |
| Initial working tree | Clean (`git status --short` produced no output) |
| Unrelated user changes | None present; nothing was reset, stashed or discarded |

### B01 evidence revalidation

The B01 summary supplied with this checkpoint was incomplete, so its claims were re-verified against the repository rather than trusted:

| Claim | Result |
|---|---|
| Ancestry `C01 → S01A → S01B → S01B-C1 → B01` | Confirmed in `git log`: `1e03997`, `9de65b0`, `86a082a`, `3563843`, `3a2cdde` |
| B01 file scope | `git show --stat 3a2cdde` — 28 files, 1352 insertions, no frontend/worker/database/Nginx file |
| Canonical artifact exists | `packages/contracts/openapi/openapi.generated.json` present and committed |
| `pnpm openapi:generate` works | Ran successfully — 2 paths, 2 operations, 4 schemas |
| `pnpm check:openapi` works and is non-mutating | Ran successfully; artifact hash unchanged across a check run |
| Operation-ID policy | `<domainKey>_<methodKey>` with presence/format/uniqueness validation, as documented |
| Runtime docs gating | `API_DOCS_ENABLED`, default off in production — confirmed in `app-config.ts` |

No B01 defect was found, so nothing from B01 was silently altered in this checkpoint.

### Gateway contract evidence

Read from the canonical templates (not modified in this checkpoint):

- `infrastructure/nginx/templates/development.conf.template`
  ```nginx
  map $http_x_request_id $effective_request_id {
      default                      $request_id;
      '~^[A-Za-z0-9._-]{1,64}$'    $http_x_request_id;
  }
  ```
  plus `add_header X-Request-ID $effective_request_id always;` at server level and in the health/gateway locations.
- `infrastructure/nginx/templates/includes/proxy-headers.conf.template`
  ```nginx
  proxy_set_header X-Request-ID $effective_request_id;
  ```
- `infrastructure/nginx/nginx.conf` access log emits `request_id=$effective_request_id`.

No contradiction with the locked contract was found, so no blocker was raised.

**Response-header ownership was determined before any code was written.** The gateway already sets `X-Request-ID` unconditionally with `always`. Nginx also forwards upstream response headers by default, so an API that set the same header would cause the client to receive it **twice**. The gateway is therefore the singular owner and the API deliberately does not emit it.

---

## B. Locked request-ID contract

| Aspect | Value |
|---|---|
| Header (canonical display name) | `X-Request-ID` |
| Header (lookup key) | `x-request-id` |
| Allowlist | `^[A-Za-z0-9._-]{1,64}$` |
| Min / max length | 1 / 64 |
| Gateway behaviour | Reuse a valid incoming value; otherwise substitute Nginx-native `$request_id`; send the effective value upstream; use the same value in the access log |
| API behaviour | Consume the effective value; preserve a valid value byte-for-byte; generate a fallback when missing, empty, oversized, ambiguous or outside the allowlist; never echo an invalid value |
| Fallback generator | `crypto.randomUUID()` — built-in CSPRNG, 36 chars of `[0-9a-f-]`, always inside the allowlist. No timestamp, no `Math.random`, no PID or machine path |
| Normalisation | **None.** A value is accepted exactly as received or replaced. `" abc "` is invalid, not `"abc"` |
| Response-header owner | **Gateway (Nginx).** The API sets no `X-Request-ID` response header |
| Async context mechanism | Node built-in `AsyncLocalStorage`, singleton provider, `run()` (not `enterWith()`) |
| Alias headers | None. `X-Correlation-ID` / `X-Trace-ID` are prohibited and asserted absent |

---

## C. Implementation

### Contract constants

`apps/api/src/platform/request-context/request-id.contract.ts` is the single source of the header names, the pattern source, the length bounds, `isValidRequestId()` and `generateRequestId()`. The pattern is built without the `g` flag so validation carries no `lastIndex` state between calls. Runtime validation, the OpenAPI schema and the gateway drift test all read these constants — the regex is not written down anywhere else in the API.

**Placement decision.** The spec prefers `packages/contracts` for cross-boundary constants. Evidence showed that is not currently viable: `@embroidery/contracts` resolves to TypeScript source (`main: ./src/index.ts`), has no build script, and is consumed only by bundled frontend targets. Under IMP-D018 the compiled API (`node dist/main.js`) cannot require it, and making it Node-loadable requires a build stage change in `infrastructure/docker/**`, which is outside this checkpoint's allowed file scope. The contract is therefore API-local, with the constraint documented in the source file. Recorded as a follow-up (F1).

### Context placement and service

`apps/api/src/platform/request-context/` — a platform concern, not a business module, and not `packages/observability` (that would pre-empt B05's ownership).

`RequestContextService` wraps a private `AsyncLocalStorage<RequestContext>` and exposes `run()`, `get()`, `getRequestId()` and `requireRequestId()`. It is a plain singleton: marking it request-scoped would cascade request scope through every consumer's graph and rebuild those providers per request to read one string. `run()` is used rather than `enterWith()` because it scopes the context to a call tree and restores the previous one on exit, so a context cannot leak into an unrelated request sharing the event loop. `requireRequestId()` throws `RequestContextUnavailableError` outside a request rather than inventing an ID — a silently generated or `"unknown"` id would produce records that look correlated but are not.

`RequestContext` carries only `requestId`. Actor identity, audit metadata and logging fields are absent by design.

### Middleware and registration

`RequestIdMiddleware` resolves exactly one ID via the exported pure function `resolveRequestId()`, then calls `next` inside `run()` so the context covers the whole downstream async chain. It does not catch errors (that is B03's exception mapping), does not touch the response body, and does not mutate the incoming headers.

`RequestContextModule` is `@Global()` so any module can inject the service without re-importing it, and applies the middleware to `'{*splat}'` — the Express 5 / path-to-regexp v8 wildcard, since the bare `'*'` of Express 4 is no longer a valid parameter name. Every route is covered, including health and the Swagger UI: a blanket rule keeps HTTP behaviour uniform and removes the risk of a future route silently having no context.

Registered in `AppModule` ahead of `HealthModule`.

### OpenAPI augmentation

`apps/api/src/openapi/request-id-header.augmentation.ts` adds, to **every** operation, the optional `X-Request-ID` request parameter and an `X-Request-ID` header on **every** documented response status. It is one document-wide transform rather than a decorator per handler, so a new endpoint cannot forget it. It is invoked from `buildOpenApiDocument()` between the prefix transform and operation-ID validation, so the runtime Swagger UI and the committed artifact stay identical.

### Gateway/API drift protection

`gateway-request-id.contract.spec.ts` reads the two canonical Nginx templates and asserts specific invariants — it does not parse the configuration language:

- the upstream header name equals the API's `REQUEST_ID_HEADER`;
- the Nginx map contains the API's `REQUEST_ID_PATTERN_SOURCE` verbatim;
- the map falls back to `$request_id`;
- the gateway sets the response header (documenting its ownership);
- neither template declares an alias correlation header;
- both sides state a maximum length of 64.

A change on either side without the other fails with an actionable message.

---

## D. Behaviour evidence

### Live gateway verification (`curl` through the running dev stack)

| Case | Sent | Received `X-Request-ID` |
|---|---|---|
| Valid client ID | `client-supplied.ID_1` | `client-supplied.ID_1` — preserved |
| No header | *(absent)* | `30aa4a50ae510fdb7aebb1836aeba4b0` — generated |
| Invalid (spaces) | `not a valid id` | `0a82f95a2d9d137906ba19a7c593240b` — replaced, not echoed |
| Oversized (65 chars) | `aaa…a` | `4bb989bfb92c57917a6ca51cfc1acf33` — replaced, not echoed |

Exactly one `X-Request-ID` header was present in every response, confirming singular ownership.

### Automated behaviour evidence

| Requirement | Where proven |
|---|---|
| Valid gateway ID preserved byte-for-byte | HTTP integration + `resolveRequestId` unit |
| Exactly 64 characters accepted, 65 rejected | Contract unit + HTTP integration |
| Missing / empty / whitespace / oversized / quoted / braced / comma-joined replaced | Contract unit + HTTP integration |
| Multi-value (array) header discarded, no arbitrary winner | `resolveRequestId` unit (supertest's typed API cannot send a repeated header) |
| No trimming of an invalid value into a valid one | Contract unit (`" abc "` invalid, `"abc"` valid) |
| Unicode, emoji, tab, newline, NUL, DEL rejected | Contract unit |
| Fallback always satisfies the contract | 500-iteration contract unit |
| Context survives `await`, `setTimeout`, `setImmediate`, nested calls | Service unit + HTTP integration |
| Optional accessor outside request → `undefined` | Service unit |
| Required accessor outside request → typed actionable error | Service unit |
| Nested `run()` restores the outer context | Service unit |
| Thrown / rejected callback does not leak context | Service unit |
| Concurrent requests isolated (delayed request keeps its own ID) | HTTP integration, 24-way parallel + slow/fast interleave |
| Error path still reaches the handler with context | HTTP integration (`/boom` → 500, no crash) |
| API emits no `X-Request-ID` response header | HTTP integration (asserts the header is absent) |
| Response body unchanged | HTTP integration asserts exact body equality |

The concurrency suite was run 5 consecutive times — 16/16 passing each time, no flake.

**Health response body unchanged:** the middleware never reads or writes the response body, and the existing `health.controller.spec.ts` (unmodified) still asserts the liveness and readiness shapes. `health.controller.ts` was not modified in this checkpoint.

---

## E. OpenAPI evidence

| Item | Value |
|---|---|
| Operations affected | 2 of 2 (`health_check`, `health_readiness`) |
| Responses carrying the header | 3 (`/api/health` 200; `/api/health/readiness` 200 and 503) |
| Request parameter | `X-Request-ID`, `in: header`, `required: false`, `type: string`, `pattern: ^[A-Za-z0-9._-]{1,64}$`, `minLength: 1`, `maxLength: 64` |
| Response header | same schema, on every documented status |
| Operation IDs | Unchanged |
| `servers` | `[]` — no host declared |
| Determinism | Two successive generations produced SHA-256 `033fdcca…f243` both times |
| Drift check | `pnpm check:openapi` → *"OpenAPI artifact is up to date"* |
| Leak scan | No `localhost`, `127.0.0.1`, `postgres://`, password, Windows path or environment host in the artifact |
| Alias headers | None; `X-Correlation-ID` / `X-Trace-ID` asserted absent |

Artifact diff: 64 insertions, 5 deletions in `packages/contracts/openapi/openapi.generated.json`.

---

## F. Tests and validation

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | PASS |
| API typecheck | `pnpm --filter @embroidery/api typecheck` | PASS |
| API lint | `pnpm --filter @embroidery/api lint` | PASS |
| API build | `pnpm --filter @embroidery/api build` | PASS |
| Targeted tests | `--testPathPatterns "(request-context\|request-id\|openapi\|config)"` | 11 suites / 129 tests PASS |
| Concurrency repeat | integration suite ×5 | 16/16 PASS each run |
| OpenAPI generate | `pnpm openapi:generate` | PASS |
| OpenAPI drift | `pnpm check:openapi` | PASS |
| Gateway drift | `gateway-request-id.contract.spec.ts` | PASS |
| File size | `node tools/check-file-size.mjs` | PASS (8 pre-existing files above the review threshold; none added by this checkpoint) |
| Whitespace | `git diff --check` | PASS |
| Full quality | `pnpm quality` | PASS |

New test files and sizes (all far below the 600-line test limit):

| File | Lines |
|---|---|
| `request-id.contract.spec.ts` | 92 |
| `request-context.service.spec.ts` | 95 |
| `request-id.middleware.spec.ts` | 98 |
| `request-id.middleware.integration.spec.ts` | 166 |
| `gateway-request-id.contract.spec.ts` | 66 |
| `request-id-header.augmentation.spec.ts` | 96 |

New source files: `request-id.contract.ts` (60), `request-context.service.ts` (79), `request-id.middleware.ts` (61), `request-context.module.ts` (32), `request-id-header.augmentation.ts` (95) — all below the 400-line limit.

`supertest` and `@types/supertest` were added as `@embroidery/api` dev dependencies; HTTP integration tests are required by the checkpoint and no HTTP test helper existed in the repository. The lockfile was updated by `pnpm`, never edited by hand. No runtime dependency was added — `AsyncLocalStorage` and `crypto.randomUUID` are Node built-ins.

---

## G. Scope confirmation

- No response envelope; no correlation field added to any response body (B03 owns that).
- No exception filter or global error mapping.
- No actor, user, staff, role, tenant or audit metadata.
- No structured logging, no redaction, no tracing/OpenTelemetry.
- No authentication, no bearer scheme.
- No feature endpoint. The only controller added is a test-only probe inside a `.spec.ts` file, never registered in `AppModule`.
- Health response body unchanged; `health.controller.ts` untouched.
- No client codegen tool chosen, no client generated.
- `infrastructure/nginx/**` unchanged — verified by `git status`.
- No frontend, worker, database schema or migration change.
- APP0-B03 not started. APP0-DEC-CODEGEN and APP0-C02 not started.

---

## H. Follow-ups

| ID | Item |
|---|---|
| F1 | Move the request-ID contract to `packages/contracts` once that package is Node-loadable (build script + `dist` entry points under IMP-D018). Needs a Docker build-stage change, so it belongs with APP0-C02 rather than here. |
| F2 | Direct API access that bypasses the gateway (the loopback debug overlay) returns no `X-Request-ID` response header, because the gateway owns it. Context and logging correlation are unaffected. Revisit if the production ingress topology stops guaranteeing a gateway hop. |
| F3 | The gateway drift test asserts the development template. If a production Nginx template is added later, extend the test to cover it. |

These are the reason the verdict is `PASS_WITH_FOLLOW_UPS` rather than `PASS`: all acceptance criteria are met, but F1 defers a placement the specification preferred, and that deferral should be visible rather than buried.

---

## I. Verdict

**PASS_WITH_FOLLOW_UPS** — every acceptance criterion in the checkpoint specification is satisfied with executable evidence. Three follow-ups are recorded above; none blocks APP0-B03.
