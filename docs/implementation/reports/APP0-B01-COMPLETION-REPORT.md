# APP0-B01 — Swagger/OpenAPI Server Foundation — Completion Report

**Checkpoint:** APP0-B01 (backend foundation; dep: APP0-C01)
**Verdict:** `PASS`
**Date:** 2026-07-22

## A. Preflight

| Item | Value |
|---|---|
| Branch | `production` |
| Initial HEAD | `3563843f7e240b820734700711176c4ab2131f8f` — `fix(styles): resolve Turbopack Sass path by package name` |
| Initial working tree | Clean (`git status --short` empty) |
| Unrelated user changes | None — the whole diff belongs to this checkpoint |

Prior checkpoint ancestry confirmed in `git log`:

- `1e03997` — APP0-C01 (application module ownership) ✅
- `9de65b0` — APP0-S01A (Sass token foundation) ✅
- `86a082a` — APP0-S01B (app SCSS entries + guardrails) ✅
- `3563843` — APP0-S01B-C1 (Turbopack Sass path correction) ✅

Existing Swagger state before the checkpoint:

- `@nestjs/swagger` **not installed**.
- No OpenAPI artifact, generation script, or Swagger configuration anywhere in the repository.
- API baseline: NestJS 11, Express adapter (`@nestjs/platform-express`), global prefix `api` set in `main.ts`, health routes `GET /api/health` and `GET /api/health/readiness`.

## B. Locked OpenAPI contract

| Decision | Value |
|---|---|
| Artifact path | `packages/contracts/openapi/openapi.generated.json` |
| Generate command | `pnpm openapi:generate` → `pnpm --filter @embroidery/api openapi:generate` |
| Drift command | `pnpm check:openapi` → `pnpm --filter @embroidery/api openapi:check` |
| Operation-ID policy | `<domainKey>_<methodKey>`, derived from the controller class name (minus `Controller`, first letter lower-cased) and the handler method name; validated against `/^[a-z][a-zA-Z0-9]*_[a-zA-Z][a-zA-Z0-9]*$/` for presence, format, and uniqueness |
| Global prefix behavior | Documented paths carry the real runtime prefix (`/api/health`, not `/health`); no `servers` entry is emitted |
| Runtime docs exposure | Swagger UI at `/api/docs`, gated by `API_DOCS_ENABLED`; default enabled in development/test, **disabled in production**; explicit `true`/`false` always wins |

Recorded as `IMP-D019` in `../14-IMPLEMENTATION-DECISION-REGISTER.md`.

## C. Implementation

### Dependencies

- Added `@nestjs/swagger@^11.4.6` to `apps/api` **dependencies** (used by both the runtime UI and the generator). Version line chosen for NestJS 11 compatibility.
- `@scarf/scarf` (an analytics postinstall pulled in transitively by `@nestjs/swagger`) is explicitly **denied** in `pnpm-workspace.yaml` `allowBuilds`, matching the repository's existing deny pattern for `@parcel/watcher`. No telemetry runs during install.
- No codegen tool, client generator, Redoc, auth package, or validation framework was added.

### Bootstrap architecture

Application creation was extracted so the runtime and the generator cannot drift:

```text
apps/api/src/bootstrap/api-application.ts
  GLOBAL_ROUTE_PREFIX = 'api'          (shared by runtime + generator)
  createApiApplication(options?)        create + setGlobalPrefix + trust proxy

main.ts    → createApiApplication → enableShutdownHooks → [optional Swagger UI] → listen
generator  → createApiApplication → buildOpenApiDocument → serialize → write → close
```

`GLOBAL_ROUTE_PREFIX` and `TRUSTED_PROXY_HOPS` moved out of `main.ts` unchanged, with their original documentation comments preserved. Runtime behavior (prefix, proxy trust, shutdown hooks, port, error handling) is unchanged; the Nginx contract is untouched.

### OpenAPI configuration

`apps/api/src/openapi/`:

| File | Responsibility |
|---|---|
| `openapi-document.config.ts` | Title, description, semantic version `0.1.0`; no server, no auth scheme |
| `operation-id.ts` | Operation-ID factory + presence/format/uniqueness validator |
| `build-openapi-document.ts` | Canonical builder (`createDocument` → prefix → validate) + `describeDocument` stats |
| `serialize-openapi-document.ts` | Deterministic serializer (recursive key sort, LF, trailing newline) |
| `openapi-artifact.ts` | Repo-root resolution, canonical path, non-mutating drift comparison |
| `generation-environment.ts` | Non-connecting placeholder `DATABASE_URL` for offline generation |
| `cli/generate-openapi.ts` | Writes the artifact, prints the summary |
| `cli/check-openapi.ts` | Compares in memory, never writes |

`ignoreGlobalPrefix: true` is passed to `createDocument` and the prefix is applied explicitly afterwards, so the documented paths do not depend on Swagger's internal prefix handling.

### Health documentation

Documentation-only changes; the JSON contract of both endpoints is byte-for-byte unchanged:

- `@ApiTags('health')` on the controller.
- `@ApiOkResponse` on liveness; `@ApiOkResponse` + `@ApiServiceUnavailableResponse` on readiness.
- New `health-response.dto.ts` with four minimal decorated classes (Swagger reflects runtime classes, not TypeScript interfaces). Return types, returned values, and status-code behavior are untouched. No envelope was wired, no field added, no database dependency introduced.

### Generator, serializer, drift checker

- The generator creates the app but never calls `init()` or `listen()`. The persistence lifecycle hook that validates the pool runs only on `init()`, so **no PostgreSQL connection is ever opened**; the `pg` pool is constructed lazily and closed in a `finally`.
- Provider factories do require a syntactically valid `DATABASE_URL`, so a non-connecting placeholder (`postgres://openapi:openapi@openapi.invalid:5432/openapi_contract`) is used **only when the variable is absent**; a real value is respected and never overwritten.
- The checker generates a candidate in memory and compares strings. It writes nothing on success or failure — verified empirically below.

### Quality integration

- Root scripts: `openapi:generate`, `check:openapi`.
- API scripts: `openapi:generate`, `openapi:check` (each runs `nest build` first, so the compiled `AppModule` the runtime uses is the one documented — consistent with IMP-D018's no-`ts-node` rule).
- `check:openapi` inserted into the root `quality` chain between `check:styles` and `db:check:manifest`.
- `packages/contracts/openapi/` added to `.prettierignore`: byte identity is owned by the deterministic serializer, and Prettier's array-wrapping heuristic would fight it. The file-size gate already ignores `.json`.
- `turbo.json` was **not** modified — no evidence required it.

## D. Artifact evidence

```text
OpenAPI artifact written: packages/contracts/openapi/openapi.generated.json
  paths:      2
  operations: 2
  schemas:    4
```

| Metric | Value |
|---|---|
| Paths | 2 — `/api/health`, `/api/health/readiness` |
| Operations | 2 — `health_check` (GET), `health_readiness` (GET) |
| Schemas | 4 — `HealthStatusResponse`, `ReadinessStatusResponse`, `DatabaseHealthResponse`, `DatabasePoolResponse` |

**No feature endpoint added.** The only documented routes are the two pre-existing platform health routes, which per `../04-BACKEND-API-DELIVERY-STANDARD.md` §2 do not count as feature APIs. No controller was created.

**Prefix behavior:** both documented paths begin with `/api/`, matching the gateway contract (D-036). A test asserts every path starts with `/api/`.

**Determinism and security evidence:**

- Two consecutive generations produced identical SHA-256 `a82dfb300f049cac32b1e318e770f8d53e18ab4ba21688442a5e50db4a73231a`.
- `file` reports `JSON text data` (LF only, no CR); the file ends with a trailing newline.
- `"servers": []` — no host, no localhost, no port.
- Artifact contains no timestamp, machine path, credential, connection string, stack trace, or internal error detail. Asserted by test (`localhost`, `postgres://`, `openapi.invalid`, and Windows/Unix absolute-path patterns are all absent).
- The health schemas expose only status, service name, uptime, timestamp, coarse database status/reason and pool counters — no connection details.

## E. Tests

All new tests live beside the code they cover and require **no PostgreSQL** (38 tests complete in ~1.2 s).

| Suite | Coverage |
|---|---|
| `operation-id.spec.ts` | Factory determinism and stability; malformed input rejected; validator accepts valid documents; rejects **duplicate**, **missing**, and **malformed** IDs; ignores non-HTTP path-item keys |
| `serialize-openapi-document.spec.ts` | Key sorting makes insertion order irrelevant; array order preserved; LF-only with trailing newline; repeat serialization identical |
| `openapi-artifact.spec.ts` | Drift comparison: identical → pass, differing → `stale`, absent → `missing`, whitespace-only difference → drift; path resolution; missing file returns `null` rather than throwing |
| `build-openapi-document.spec.ts` | Metadata; both health paths under `/api`; exactly 2 paths / 2 operations / >0 schemas; both operation IDs; no `servers`; **generated twice → byte-identical**; no host/credential/machine path; **matches the committed artifact** |
| `app-config.spec.ts` (extended) | `API_DOCS_ENABLED`: production default **false**, non-production default true, explicit opt-in honored in production, explicit opt-out honored, ambiguous value rejected |

Existing DB-backed `health.controller.spec.ts` still passes unchanged, proving the Swagger annotations did not alter health behavior.

## F. Validation

| Command | Result |
|---|---|
| `pnpm install` | PASS |
| `pnpm --filter @embroidery/api openapi:generate` | PASS — 2 paths / 2 operations / 4 schemas |
| `pnpm --filter @embroidery/api openapi:check` | PASS — "artifact is up to date" |
| `pnpm openapi:generate` / `pnpm check:openapi` (root) | PASS |
| `pnpm --filter @embroidery/api build` (`nest build`) | PASS (runs inside both OpenAPI scripts) |
| `pnpm --filter @embroidery/api typecheck` | PASS |
| `pnpm --filter @embroidery/api lint` | PASS |
| `pnpm --filter @embroidery/api test` | PASS — 38 suites, 431 tests |
| `pnpm check:file-size` | PASS — no hard-limit violation; no new file above the review threshold (largest new file: 88 lines) |
| `pnpm format:check` | PASS |
| `pnpm check:styles` | PASS |
| `git diff --check` | PASS |
| `pnpm quality` (full chain) | PASS |

Additional targeted verification:

1. **Generated twice and compared** — identical SHA-256 (see §D).
2. **Drift checker fails on a stale artifact** — exit 1, message: `Committed OpenAPI artifact at <path> is out of date.` / `Regenerate it with: pnpm openapi:generate`.
3. **Drift checker fails on a missing artifact** — exit 1, and it did **not** recreate the file.
4. **Drift checker is non-mutating** — the stale file was byte-identical after the failing run; the original artifact was restored and verified identical to the pre-test hash.
5. **Generation binds no port and needs no PostgreSQL** — both commands succeed with no database running against them and no listener; the process exits cleanly on its own.
6. **Runtime docs enabled** (development, `API_DOCS_ENABLED` unset): `GET /api/docs` → 200, `GET /api/docs-json` → 200, log line `OpenAPI docs enabled at /api/docs`. The served JSON carries `/api/health` with `operationId: health_check`, matching the committed artifact — runtime and generator agree.
7. **Runtime docs disabled** (`API_DOCS_ENABLED=false`): `GET /api/docs` → **404**, `GET /api/docs-json` → **404**, `GET /api/health` → 200. No docs route is registered.
8. **Markdown links** — the report/phase/register links resolve to existing files.
9. **Changed-file scope** — verified against the allowed list (§G).

Production-mode note: a live `NODE_ENV=production` boot was **not** performed, because the persistence layer correctly refuses to start with the documented development password and non-TLS local database. The production default is covered by unit test (`docsEnabled === false` for `NODE_ENV=production`) combined with the empirical proof that a `false` flag registers no route — together these establish that production exposes no docs route by default.

## G. Scope confirmation

- ✅ No feature API added — only the two pre-existing health routes are documented.
- ✅ No response-envelope wiring (B03 untouched); health keeps its documented envelope exception.
- ✅ No request context, actor context, or structured logging work (B02/B04/B05 untouched).
- ✅ No generated client, no codegen tool selected (`packages/api-client` untouched; DEC-CODEGEN still open as IMP-O011).
- ✅ No frontend, worker, database, schema, or migration change.
- ✅ No authentication provider or security scheme added.
- ✅ APP0 phase document marks **only** B01 complete; APP0 is not closed.

Changed files:

```text
apps/api/package.json                                   (dep + 2 scripts)
apps/api/src/main.ts                                    (reuse bootstrap + optional docs)
apps/api/src/bootstrap/api-application.ts               (new)
apps/api/src/config/app-config.ts                       (docsEnabled)
apps/api/src/config/app-config.spec.ts                  (docs flag tests)
apps/api/src/modules/health/health.controller.ts        (annotations only)
apps/api/src/modules/health/health-response.dto.ts      (new, documentation-only)
apps/api/src/openapi/**                                 (new: 8 source + 4 spec files)
packages/contracts/openapi/openapi.generated.json       (new, generated)
package.json                                            (2 scripts + quality chain)
pnpm-workspace.yaml                                     (deny @scarf/scarf build)
pnpm-lock.yaml                                          (generated)
.prettierignore                                         (generated artifact)
.env.example                                            (API_DOCS_ENABLED)
docs/implementation/phases/APP0-APPLICATION-DELIVERY-FOUNDATION.md
docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md
docs/implementation/reports/APP0-B01-COMPLETION-REPORT.md
```

## H. Git evidence

| Item | Value |
|---|---|
| Commit | `feat(api): add deterministic OpenAPI foundation` |
| Final HEAD | recorded at commit time (see terminal response) |
| Working tree | Clean after commit |
| Push status | **NOT PUSHED** |

## I. Verdict

`PASS`

All 33 acceptance criteria are satisfied with executable evidence. No follow-up is required for B01 itself.

Notes for the next checkpoints (not defects, not blockers):

- `openapi:generate`/`openapi:check` run `nest build` first and therefore expect the workspace runtime packages to be built (they are, by the time `check:openapi` runs in the `quality` chain, and by `pnpm build` from a clean checkout).
- The health response DTO classes are documentation-only mirrors of the controller's interfaces. When APP0-B03 introduces the global envelope, revisit whether the health exception should be documented through a shared schema helper instead.
