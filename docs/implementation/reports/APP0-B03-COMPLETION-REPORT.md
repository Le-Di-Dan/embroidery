# APP0-B03 — Global response envelope and safe exception mapping — Completion report

Checkpoint: `APP0-B03`
Phase: [APP0 — Application Delivery Foundation](../phases/APP0-APPLICATION-DELIVERY-FOUNDATION.md)
Verdict: **PASS_WITH_FOLLOW_UPS**

---

## A. Preflight

| Item | Evidence |
|---|---|
| Branch | `production` |
| Initial `HEAD` | `e6749fae2d0d14706ccefc1ad443d22a7af45353` — `feat(api): add request context propagation` |
| Initial working tree | Clean (`git status --short` produced no output) |
| Unrelated user changes | None; nothing was reset, stashed or discarded |

### B02 evidence revalidation

| Claim | Result |
|---|---|
| Ancestry `C01 → S01A → S01B → S01B-C1 → B01 → B02` | Confirmed: `1e03997`, `9de65b0`, `86a082a`, `3563843`, `3a2cdde`, `e6749fa` |
| B02 file scope | `git show --stat e6749fa` — 19 files, no frontend/worker/database/Nginx file |
| Request-context tests pass | Yes, re-run before and after this checkpoint's changes |
| `pnpm openapi:generate` / `check:openapi` | Both pass; check is non-mutating |
| Gateway is response-header owner | Unchanged; API still sets no `X-Request-ID` header |

**Request context covers the error path.** This was verified rather than assumed: the B02 middleware is registered through `MiddlewareConsumer.forRoutes('{*splat}')`, which binds it on the Express instance ahead of routing. An HTTP test against an unmatched route (`GET /api/does-not-exist`) returns a 404 envelope whose `meta.requestId` equals the client-supplied header, proving context exists even where no controller ran. No B02 correction was needed.

### Canonical envelope audit — and a contradiction to report

The canonical contract already exists and is locked (D-034, `docs/12-DECISION-LOG.md`; `docs/development/BACKEND_CONVENTIONS.md` §6; `packages/contracts/src/api-envelope/`):

```ts
interface ApiSuccessResponse<TData> { success: true; code: string; message: string; data: TData; meta: ApiResponseMeta }
interface ApiErrorResponse<TError>  { success: false; code: string; message: string; errors?: TError[]; meta: ApiResponseMeta }
interface ApiResponseMeta { requestId: string; timestamp: string; pagination?: ApiPaginationMeta }
```

**This differs from the shape sketched in the checkpoint specification §4**, which showed `{ success, data, meta }` and a nested `error: { code, message, details }`, and which listed `timestamp` among fields not to add.

Resolved in favour of the canonical contract, which is what §4 itself instructs ("nếu current canonical envelope đã có shape, giữ nguyên"; "phải dùng exact canonical shape thay vì ví dụ trên") and what the CLAUDE.md source-of-truth order requires. Concretely:

- `code` and `message` are top-level on **both** success and error; there is no nested `error` object.
- Error details use `errors: ApiFieldError[]`, not `details`.
- `meta.timestamp` is **required** by the canonical contract, so it is populated.

The specification's determinism concerns behind the "no timestamp" rule are honoured separately rather than by dropping a required field: the envelope factory never calls the clock — `timestamp` is an explicit input, supplied by an injectable `ResponseClock` — so the factory stays pure and tests assert exact envelopes; and the OpenAPI artifact contains **no** example timestamp, keeping it byte-identical across machines.

Other audit findings: no pre-existing interceptor, exception filter, validation pipe or error-code registry in the API; no `ApiResponseFactory`; the Compose/Kubernetes probes call `GET /api/health` and check only the exit status of `wget`, not the body.

---

## B. Locked response contract

| Aspect | Value |
|---|---|
| Success shape | `{ success: true, code, message, data, meta }` |
| Error shape | `{ success: false, code, message, errors?, meta }` |
| Correlation | `meta.requestId`, read from the APP0-B02 request context |
| Timestamp | `meta.timestamp`, ISO-8601 UTC, injected via `ResponseClock` |
| Default success code | `OK` / `Request completed successfully`, overridable per endpoint with `@ApiSuccessCode(code, message)` |
| Error codes | Transport-level only: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `METHOD_NOT_ALLOWED`, `CONFLICT`, `UNPROCESSABLE_ENTITY`, `TOO_MANY_REQUESTS`, `INTERNAL_SERVER_ERROR` |
| Code derivation | From HTTP status via an explicit map, never from an exception class name. Unlisted 4xx → `BAD_REQUEST`; anything else → `INTERNAL_SERVER_ERROR` |
| 5xx message | Always the single generic string; the specific message is never published |
| Operational opt-out | `@SkipApiEnvelope()` route metadata, read with `Reflector` — no path strings |
| Health | Success body **unchanged**; the controller carries the opt-out. Errors are still safe-mapped |
| Response headers | Unchanged from B02 — the gateway remains the sole `X-Request-ID` owner |

---

## C. Implementation

All platform code lives in `apps/api/src/platform/http-response/`, outside every business module.

| File | Responsibility | Lines |
|---|---|---|
| `api-error-code.ts` | Stable codes, status→code map, canonical messages | 71 |
| `api-envelope.factory.ts` | Pure envelope construction + factory identity | 99 |
| `api-error-mapper.ts` | Exception → safe `{status, code, message, errors?}` | 187 |
| `api-envelope.decorators.ts` | `@SkipApiEnvelope()`, `@ApiSuccessCode()` | 46 |
| `response-clock.ts` | Injectable timestamp seam | 18 |
| `api-response.interceptor.ts` | Global success wrapping | 103 |
| `api-exception.filter.ts` | Global safe error mapping | 57 |
| `http-response.module.ts` | `APP_INTERCEPTOR` / `APP_FILTER` registration | 28 |

**Factory** — pure. `requestId` and `timestamp` are parameters, not ambient reads, so an envelope is fully determined by its inputs. It does not mutate input data and copies the `errors` array. `errors` is omitted entirely rather than set to `undefined`, which `exactOptionalPropertyTypes` and JSON serialisation both prefer.

**Exception mapper** — pure and framework-free, so the whole mapping table is asserted directly. It works by **allowlist**: nothing reaches the client unless explicitly copied. A "safe message" is a non-empty, single-line string of at most 500 characters — multi-line strings are rejected because in an exception payload they are almost always a stack trace. A `HttpException` with status ≥ 500 has its message replaced like any other server fault, since it may have been built from an internal failure. Non-`HttpException` throwables — plain `Error`, strings, objects, `null`, numbers — are all reported generically.

**Interceptor** — reads `@SkipApiEnvelope()` and `@ApiSuccessCode()` via `Reflector.getAllAndOverride` so a handler can override its controller. It skips `StreamableFile` and `Buffer`, `HEAD` requests, and 204/304 responses.

**Double-wrap prevention** — see the boundary note below: identity, via a `WeakSet` of factory-created objects, not a structural `'success' in payload` check that would misfire on any domain object with a `success` field. Nothing is added to the serialised JSON (asserted).

**Filter** — `@Catch()` with no argument, deliberately: a filter catching only `HttpException` would let a driver error reach Nest's default handler, which is exactly the leaking path. It uses `HttpAdapterHost` rather than an Express type, returns early if headers were already sent, and **contains no logging** — adding one here would create a second, unredacted sink for the payloads it exists to sanitise. Logging is APP0-B05's.

**Registration** — `APP_INTERCEPTOR` / `APP_FILTER` inside `HttpResponseModule`, not `app.useGlobalX()` in `main.ts`, so both participate in DI (they need `RequestContextService`, `Reflector`, `ResponseClock`) and so the runtime app, the OpenAPI generator and every test app get identical behaviour from one module. `RequestContextModule` is imported first; its middleware runs before any interceptor or filter.

**Contracts-package boundary (transitional).** `@embroidery/contracts` still has `main: ./src/index.ts` with no build output, so under IMP-D018 the compiled API cannot `require` it. The API therefore imports the canonical types with `import type`, which TypeScript erases completely — giving compile-time conformance without a runtime dependency, and without duplicating the shape anywhere. The one casualty is the canonical `isApiResponseEnvelope` runtime guard, which cannot be called; re-implementing it locally would duplicate the canonical shape, so factory identity is used instead. `contracts-package-boundary.spec.ts` scans the compiled `dist` and fails if any emitted file ever `require`s the package — the check that catches a future `import type` silently becoming a value import. Per §17 no Docker or package-build change was made; runtime integration stays with APP0-C02.

**OpenAPI** — `apps/api/src/openapi/envelope-schema.augmentation.ts` registers the five reusable components and adds a documented 500 error response to every operation. It runs before the B02 request-ID transform so the new 500 response also receives the `X-Request-ID` response header. It deliberately does **not** rewrite 2xx responses, because endpoints may opt out.

---

## D. Behaviour evidence

| Requirement | Result |
|---|---|
| Object wrapped | `{success:true, code:'OK', message:…, data:{id:'abc'}, meta:{requestId, timestamp}}` |
| Array wrapped, not flattened | `data: [1,2,3]` |
| Primitive wrapped | `data: 'plain'` |
| Empty payload | `data: null`, `success: true` |
| Endpoint-declared code | `@ApiSuccessCode('PROBE_READ', …)` → `code: 'PROBE_READ'` |
| 204 | Empty body, no envelope |
| `StreamableFile` | Binary body returned untouched |
| Already an envelope | Passed through; `data` holds the payload, not another envelope |
| Opted-out endpoint | Body returned exactly as the handler produced it |
| Health opt-out | `Reflector.get(SKIP_API_ENVELOPE, HealthController) === true` |
| 400 | Status preserved, `code: BAD_REQUEST`, safe message kept |
| 404 thrown by a handler | `code: NOT_FOUND` |
| 404 unknown route | Safe envelope **and** correct `meta.requestId` |
| 401/403/405/409/422/429 | Status preserved, stable code, neutral message when the payload has none |
| Validation `message: string[]` | Converted to canonical `errors[]` entries |
| Canonical `errors[]` | Passed through; malformed entries dropped |
| Unknown `Error` | Generic 500, `INTERNAL_SERVER_ERROR` |
| Thrown string / object / null / number | Generic 500 |
| Exempt endpoint that throws | Still safe-mapped to a generic 500 |
| Direct call, no header | `meta.requestId` matches `^[A-Za-z0-9._-]{1,64}$` |
| Response header ownership | API sets no `X-Request-ID`; gateway remains sole owner |
| Concurrency | 16 interleaved requests, alternating 200 and 500, each envelope carried its own request ID |

---

## E. Security evidence

A single thrown message packed with realistic secrets was used across four paths (unknown `Error`, thrown string, `HttpException` with an extra internal field, and an envelope-exempt endpoint):

```text
connect ECONNREFUSED postgres://admin:hunter2@db.internal:5432/embroidery
while running SELECT * FROM customers; at C:\srv\app\dist\main.js:42
and /var/lib/app/secrets.json (authorization: Bearer sk_live_abc123)
```

Every serialised response was asserted to contain none of: `postgres://`, `hunter2`, `db.internal`, `SELECT * FROM`, `C:\srv\app`, `/var/lib/app`, `sk_live_abc123`, `ECONNREFUSED`, `main.js:42`, `    at `, `stack`.

Additionally asserted at unit level: arbitrary payload fields (`debug`, `metadata`, `stack`) are stripped rather than serialised; `Error.cause` never appears; a multi-line message is rejected as a probable stack trace; an over-long message is replaced; a server-side `HttpException` message containing a connection string is replaced by the generic text.

Scope note: these assertions cover the tested strings and the mapper's allowlist behaviour. No claim is made of general secret scanning.

---

## F. OpenAPI evidence

| Item | Value |
|---|---|
| Schemas | 4 → 9 (added `ApiSuccessResponse`, `ApiErrorResponse`, `ApiResponseMeta`, `ApiFieldError`, `ApiPaginationMeta`) |
| Health `200` | Still `$ref: HealthStatusResponse` — raw operational schema, unchanged |
| Readiness statuses | `200`, `503` (both raw), plus the new `500` |
| Health/readiness `500` | `$ref: ApiErrorResponse`, with the `X-Request-ID` response header |
| `meta.requestId` schema | `pattern ^[A-Za-z0-9._-]{1,64}$`, `minLength 1`, `maxLength 64` — from the B02 constants |
| Error `code` enum | Exactly the nine platform codes |
| Operation IDs | `health_check`, `health_readiness` — unchanged |
| `servers` | `[]` |
| Determinism | Two successive generations produced SHA-256 `8a365626…dd7e` both times |
| Drift check | `pnpm check:openapi` → *"OpenAPI artifact is up to date"* |
| Leak scan | No `localhost`, `127.0.0.1`, `postgres://`, password, Windows path or ISO timestamp |
| Test-only controllers | Absent from the artifact (they live only in `.spec.ts` files) |

---

## G. Validation

| Gate | Result |
|---|---|
| `pnpm format:check` | PASS |
| `pnpm --filter @embroidery/api typecheck` | PASS |
| `pnpm --filter @embroidery/api lint` | PASS |
| `pnpm --filter @embroidery/api build` | PASS |
| Targeted tests (`http-response`, `envelope`, `openapi`, `request-context`) | 15 suites / 214 tests PASS |
| `pnpm openapi:generate` ×2 | Identical SHA-256 |
| `pnpm check:openapi` | PASS |
| `node tools/check-file-size.mjs` | PASS |
| `git diff --check` | PASS |
| `pnpm quality` | PASS |

New test files: `api-envelope.factory.spec.ts` (149), `api-error-mapper.spec.ts` (205), `api-response.integration.spec.ts` (~300), `contracts-package-boundary.spec.ts` (58), `envelope-schema.augmentation.spec.ts` (166) — all below the 600-line limit. All source files are below 400 lines.

One `eslint-disable` was added, for `@typescript-eslint/only-throw-error` on a test endpoint that throws a non-`Error` on purpose — the exact case the filter must sanitise. One documented type assertion exists in the OpenAPI augmentation, where Swagger's `SchemaObject` types literals such as `type: 'object'` as narrow unions that an object literal widens to `string`.

`@embroidery/contracts` was added to `apps/api` dependencies for type-only use; the lockfile was updated by `pnpm`, never hand-edited. No runtime dependency was added.

---

## H. Scope confirmation

- No actor, user, staff, role or tenant context; no audit metadata.
- No structured logging, no log statement anywhere in the filter or interceptor, no tracing.
- No authentication.
- No feature API. The only controllers added live inside `.spec.ts` files and never reach the artifact.
- Health success body unchanged; the controller gained only the opt-out decorator and its import.
- Response-header ownership unchanged — the API still sets no `X-Request-ID`.
- No client generated, no codegen tool chosen.
- `infrastructure/nginx/**`, frontend, worker, database schema and migrations untouched.
- No Docker or package-build change; the contracts runtime boundary was left to APP0-C02.
- APP0-B04 and APP0-B05 not started.

---

## I. Follow-ups

| ID | Item |
|---|---|
| F1 | Restore the canonical `isApiResponseEnvelope` guard for double-wrap detection once `@embroidery/contracts` is Node-loadable (APP0-C02). Until then an envelope built by something other than the factory is not recognised — no such producer exists, and controllers are forbidden from hand-building response shapes. |
| F2 | Carried from B02: move the request-ID contract into `packages/contracts` when the same package boundary is resolved. |
| F3 | When a validation pipe is introduced, revisit whether its output should map to `errors[]` entries with real `field` values instead of the current field-less details. |

These are why the verdict is `PASS_WITH_FOLLOW_UPS` rather than `PASS`: every acceptance criterion is met, but F1 is a real behavioural narrowing caused by the package boundary and should be visible rather than buried.

---

## J. Verdict

**PASS_WITH_FOLLOW_UPS** — all 45 acceptance criteria satisfied with executable evidence. The specification's §4 example envelope was superseded by the locked canonical contract, as §4 itself directs; that decision and its `timestamp` consequence are documented in section A rather than resolved silently.
