# APP2-T01-C1 — Production API gateway evidence correction

**Verdict: `PASS`.**

`APP2-T01`'s media contract was accepted; what was missing was proof that the
gateway smoke had ever reached a *production* API. It had not. This correction
builds the canonical production image, starts it as the gateway's `api`
upstream, and re-runs the media scenarios against it — and in doing so
reproduced a **production-only defect that made the production image
unstartable**, which no previous gate could see.

---

## A. Preflight and the original T01 A/B chain

| Item | Value |
| --- | --- |
| Branch | `production` |
| Entry `HEAD` | `d3fb3d0b921e8621709880244f5d4972f5c7891b` — `docs(app2): record public media delivery evidence` |
| T01 Commit A | `136243f37948934ee5f63544a1fa7f8f3fecd133` — `feat(api): implement public catalog media delivery` (31 files, +3068 −12) |
| T01 Commit B | `d3fb3d0b921e8621709880244f5d4972f5c7891b` (3 files, +640) |
| Entry tree | clean — `git status --short` empty |
| Ignored `evidences/` | untouched, unstaged, never referenced |
| Pushed | nothing; the branch remains ahead of `origin/production` |

`HEAD` was exactly the T01 evidence commit, as required. Commit A was read back
with `git show --stat` and is unchanged; neither T01 commit was amended,
rebased or squashed by this correction.

`APP2_T01_C1_PREFLIGHT = PASS`.

---

## B. The exact missing production evidence

The T01 completion report recorded `API production build = PASS` and
`gateway smoke = PASS`. Both were true, and neither implied the other. The
build was `nest build` (compilation only); the smoke ran against the ordinary
development container, which serves TypeScript from a bind mount and never
loads `dist/`. Nothing in the record established:

- `NODE_ENV=production` in the process that answered the request;
- the production entry command;
- the production image/container identity;
- the absence of development bind mounts;
- the gateway upstream pointing at a production API;
- restoration of the original development topology afterwards.

The reviewer was right, and the gap was not cosmetic. Closing it surfaced a
defect that made the production image exit on startup (§M).

---

## C. Runtime audit

Read from source and from the running stack before any edit:

| Question | Finding |
| --- | --- |
| Development API command | `pnpm --filter @embroidery/api dev` (`api.Dockerfile` `dev` stage) |
| Production API command | `node dist/main.js`, `WORKDIR /app/apps/api`, `USER node`, `ENV NODE_ENV=production` (`runner` stage) |
| Development API mounts | one — `../../apps/api/src:/app/apps/api/src` |
| Production runner stage | `runner`, from the tracked `infrastructure/docker/api.Dockerfile` |
| Gateway upstream | `upstream api_upstream { server api:4000; }` — service alias **`api`** |
| How the T01 smoke reached the API | `curl` → gateway (`localhost` + `Host:` header) → `api` upstream |
| Which runtime it reached | the **development** container — the gap this correction closes |
| Narrowest existing isolation pattern | `tools/smoke-app2-publication-production.mjs` (APP2-A04-C1): ephemeral image + temporary Compose override + `finally` restore |

The A04-C1 pattern was adapted rather than reinvented: same ephemeral-image
model, same `!reset` override, same structural `finally` teardown, same
`cleanupPlan`/`restoreArgs` shape, same redaction discipline. Two things it did
not need are new here — a gateway reload (§E) and a disposable database (§D).

---

## D. Selected production topology

```
client
  → real Nginx gateway (embroidery-dev-gateway-1, tracked config, unmodified)
  → service alias `api`
  → PRODUCTION API container  (node dist/main.js, NODE_ENV=production, 0 mounts)
  → disposable TLS PostgreSQL (embroidery-dev-api-db-t01c1-1)
  → development MinIO         (private, unchanged, no host port)
```

### Why a disposable database was unavoidable

A genuine production API **cannot attach to the development database**, by
deliberate design. `packages/database/src/config/database-config.ts`
`assertProductionSafety` refuses to start when `NODE_ENV=production` and:

1. `DATABASE_SSL_MODE` is `disable` — and the development PostgreSQL serves no
   TLS; and
2. the connection URL carries the documented development password.

A third guard lives in
`apps/api/src/modules/identity/config/staff-auth.config.ts`:
`STAFF_SESSION_COOKIE_SECURE` **must** be true under `NODE_ENV=production`.

All three are correct. None was weakened, disabled, or worked around — doing so
to make a smoke pass is exactly what `CLAUDE.md` §9 forbids. Instead the run
*satisfies* them: a purpose-built PostgreSQL with real TLS
(`show ssl` → `on`, asserted at runtime, not assumed) and a password generated
per run.

The disposable database is loaded with a copy of the development database via
`pg_dump`, so `storage_key` values resolve to derivative objects that really
exist in the development MinIO — which is what makes the byte-exactness
assertions meaningful. **The developer's PostgreSQL is read once and never
written.** No credential is needed for that read: `docker exec … pg_dump`
authenticates over the container's local socket.

`POSTGRES_BASE_IMAGE` mirrors the tracked development pin
(`postgres:16.14-alpine`) exactly; the certificate is generated inside the image
so the key can be `postgres`-owned and `0600` (PostgreSQL refuses a
world-readable key, which a Windows bind mount cannot express), and is valid for
two days so it is useless beyond the run that made it.

---

## E. Isolation and the gateway swap

**Build isolation.** The production image is built from the canonical
`api.Dockerfile` `runner` stage. `.dockerignore` excludes `**/node_modules`,
`**/dist`, `**/.next`, `**/coverage` and `**/.turbo`, so the compile happens
entirely inside image layers: no mutable host build output enters the context
and nothing on the host is written. The harness asserts this at runtime
(`dockerignoreIsolatesBuildOutput`) rather than trusting it, so a future
`.dockerignore` edit fails the harness instead of silently re-introducing the
coupling.

**Swap.** A Compose override is written to a temp directory (asserted to be
outside the repository) and passed alongside the tracked dev file. It targets
the same Compose project, so the gateway keeps proxying its `api` upstream *by
service name* and that name now resolves to the production container — a gateway
proof, not a host-port proof. `build: !reset null` and `volumes: !reset []`
clear the base keys, so the container runs the immutable image and **not** the
bind-mounted `apps/api/src`.

**No tracked infrastructure change.** `infrastructure/nginx/**` and
`infrastructure/compose/**` are untouched.

**Gateway reload — a real trap.** `upstream api_upstream { server api:4000; }`
has no `resolver`, so Nginx resolves the name once at configuration load and
caches it. Replacing the container gives it a new address the running gateway
would never see, and every request for the whole run would have been a 502 that
looked like a route defect and was not. The swap and the restore therefore both
end with `nginx -s reload`, which re-reads the committed configuration
unchanged.

---

## F. Harness implementation and cleanup

| File | Lines | Responsibility |
| --- | --- | --- |
| `tools/smoke-app2-t01-production-topology.mjs` | 359 | Pure topology: image tags, override YAML, swap/restore/reload args, runtime classification, cleanup plan, redaction |
| `tools/smoke-app2-t01-docker-facts.mjs` | 84 | The only channel to Docker; gathers non-secret runtime facts and redacts before any caller can print |
| `tools/smoke-app2-t01-public-media-production.mjs` | 360 | Orchestration: verify → build ×2 → seed → swap → reload → scenarios → restore → cleanup |
| `tools/smoke-app2-t01-public-media-scenarios.mjs` | 339 | The assertions only, in a child process |
| `tools/smoke-app2-t01-gateway-http.mjs` | 63 | curl-based gateway client; has no session concept at all |
| `tools/smoke-app2-t01-public-media-production.test.mjs` | 288 | Docker-free harness regression suite |
| `tools/api-production-image.test.mjs` | 108 | Docker-free regression for the production-only defect (§M) |

Script: `pnpm smoke:app2-t01-public-media:production`. It requires Docker and
therefore stays **outside** `pnpm quality`; the Docker-free tests run inside the
existing `node --test "tools/*.test.mjs"` aggregation, so they execute on every
`pnpm test`.

**Cleanup is structural, not conditional.** `cleanupPlan()` is a pure function
of *what the run changed*, never of whether it succeeded, and the orchestrator's
`finally` executes exactly that plan:

```
restore-dev-api → reload-gateway → remove-database → remove-image → remove-database-image
```

Restoration always comes from the tracked dev file alone (asserted: exactly one
`-f`, and it is `docker-compose.dev.yml`), with `--force-recreate` and a bounded
`--wait`. Every wait in the harness is bounded: `BUILD_TIMEOUT_MS = 1_200_000`
and `--wait-timeout 240` on the database start, the swap and the restore.

This was not merely asserted — it was **observed**. Three separate runs failed
(two on a transient Docker Hub TLS timeout, one on the reproduced defect) and
each one restored the developer's API and left `residualImages: 0`,
`residualContainers: 0`, `temporaryDirectoryRemoved: true`.

---

## G. Docker-free harness tests

`node --test tools/smoke-app2-t01-public-media-production.test.mjs tools/api-production-image.test.mjs tools/smoke-app2-t01-public-media.test.mjs`
→ **35 tests, 35 pass, 0 fail.**

Covering, in the order §9 asks for them:

| Required property | How it is proven |
| --- | --- |
| Smoke cannot run before the swap | `phasePlan()` orders `swap-upstream` and `reload-gateway` before `scenarios`; the orchestrator throws `refusing to smoke` unless the runtime classifies as production |
| Production command and `NODE_ENV` asserted | `classifyApiRuntime` returns `production` only for `dist/main.js` **and** `NODE_ENV=production` **and** zero mounts; each condition is negated independently |
| Correct service alias | The override's service name is matched against the committed `upstream api_upstream { server api:4000; }` in the real Nginx template |
| Override outside tracked paths | `isOutsideRepository`, plus `mkdtempSync(join(tmpdir(), …))` |
| Restore runs after success | `cleanupPlan` returns the restore step whenever the swap happened |
| Restore runs after simulated failure | A test throws inside `try` and asserts the `finally` plan still executed every step |
| Original dev API restore mandatory | `restoreArgs` uses exactly one `-f`, the tracked dev file |
| Bounded startup timeout | Every `up` vector carries `--wait` and `--wait-timeout <bounded>`; build carries `BUILD_TIMEOUT_MS` |
| Secrets never in argv or logs | Every argument vector the run builds is asserted credential-free; `redactSecrets` is applied to stdout, stderr and every result line |
| Temporary image/container/path cleanup complete | `removeImageArgs`, `removeDatabaseArgs` (`-f -v`), `rmSync`, and a residue re-check that *asks Docker* rather than assuming |
| `B04/S01/S02/E01/X01` commands absent | All four harness sources scanned for those identifiers and for `publicProduct_list`/`publicProduct_detail` |

Two further properties specific to this correction:

- **Guards satisfied, not weakened** — the override is asserted to set
  `DATABASE_SSL_MODE: require`, a non-development `DATABASE_URL` and
  `STAFF_SESSION_COOKIE_SECURE: 'true'`, *and* `database-config.ts` is read to
  confirm both refusal messages still exist in the source.
- **Fixture honesty** — every `record(...)` label in the scenarios is extracted
  and asserted not to contain a lowercase `publish`/`unpublish` verb, so a
  direct status write can never be re-labelled as a Product command by a later
  edit. The check is case-sensitive on purpose: `PUBLISHED` is the lifecycle
  *state* the fixture sets and is legitimate.

No fixture contains a real secret; the suite's placeholders are
`synthetic-not-a-real-password` and `operator@example.invalid`.

---

## H. Production runtime identity proof

Captured from the running container by `docker inspect` and `printenv` — all
non-secret, and no diagnostic endpoint was added to the application.

| Fact | Development (entry & exit) | Production (during the smoke) |
| --- | --- | --- |
| Image | `embroidery-dev-api` | `embroidery-t01c1-api-prod:msak4rnuf615cf` |
| Image id | `sha256:4124d6aa5910` | `sha256:ccd2d23076a7` |
| Command | `pnpm --filter @embroidery/api dev` | `node dist/main.js` |
| `NODE_ENV` | `development` | **`production`** |
| Mounts | `["/app/apps/api/src"]` (1) | `[]` (**0**) |
| Classification | `development` | `production` |

The API service has exactly one container, so the production container
*replacing* it is conclusive proof the gateway could not have reached the
development API during the smoke: the two image ids differ, and the development
runtime was not running at all. The harness asserts this directly
(`the development API runtime is no longer running`).

The production API's own startup log confirms it independently:

```
"message":"database pool validated","context":"DatabaseModule"
"message":"Nest application successfully started","context":"NestApplication"
"message":"API listening on port 4000 (production)","context":"Bootstrap"
```

Every request logged during the run carries `"actor":{"kind":"ANONYMOUS"}`.

---

## I. Production media scenarios

All through the real gateway, against the production API. **22/22 passed**, twice.

| Scenario | Result |
| --- | --- |
| Unknown rendition → safe 400 | `400` |
| Unknown Product → safe 404 | `404`, `PUBLIC_PRODUCT_MEDIA_NOT_FOUND` |
| Safe miss leaks no storage detail | message `That product image is not available.` |
| `DRAFT` Product → safe 404 | `404` |
| `PUBLISHED` thumbnail → exact WebP bytes | `200`, **16400 bytes**, RIFF/WEBP verified |
| `PUBLISHED` catalog-preview → different WebP bytes | `200`, **28378 bytes** |
| `Content-Type` | `image/webp` |
| `X-Content-Type-Options` | `nosniff` |
| `Content-Disposition` | `inline`, **no filename** |
| `Cache-Control` | `no-store` |
| No storage/provider metadata | `leaked: []` (no `etag`, `x-amz`, `minio`, `bucket`, `storage`) |
| Anonymous — no cookie required | asserted structurally: the request builder emits no `-b`/`-c`/`Authorization` |
| Host-independence | identical `200` on the Admin host |
| MinIO not publicly exposed | `/minio/` through the gateway ≠ 200 |
| Fixture → `DRAFT` revokes the next request | `404` |
| Fixture → `PUBLISHED` restores access | `200` |
| Read route writes no Audit/Outbox row | audit `112 → 112`, outbox `35 → 35` |

The two byte counts are **identical to the T01 baseline** (16400 / 28378),
recorded there against a disposable MinIO through the development runtime. The
production runtime streams the same objects byte-for-byte.

---

## J. Client-abort behaviour in production

A raw socket opens a media request through the gateway, reads the first chunk,
and destroys the connection mid-stream — a genuine client disconnect, not a
simulated one.

| Assertion | Result |
| --- | --- |
| Bytes received before the abort | 16566 (run 1: 16816) — a real partial read |
| Production API healthy afterwards | `GET /api/health` → `200` |
| A subsequent media request succeeds | `200`, 16400 bytes, WebP |
| No unhandled stream error in the log | `hits: []` |

The log scan is deliberately narrow —
`unhandledRejection`, `uncaughtException`, `ERR_STREAM_PREMATURE_CLOSE`,
`ERR_STREAM_DESTROYED`, `ERR_UNHANDLED_ERROR`. A generic `/error/i` sweep would
match ordinary request logging and prove nothing; a unit test asserts the narrow
matcher ignores an info line containing the word "error" and still catches a
real premature-close.

The T01 disposable-MinIO integration test remains the load-bearing proof that
the **upstream object stream itself** is destroyed on disconnect. It was not
weakened, modified, or skipped.

---

## K. Lifecycle setup method — disclosed in full

**Method used: §8's sanctioned test-fixture alternative.** Publication state was
arranged by writing `products.status` directly **on the run's disposable
database copy**, never on the developer's database, and it is described as a
fixture everywhere — in the harness, in its result labels, and here. It is not a
Product command: it runs no readiness evaluation, honours no concurrency token,
and records no Audit or Outbox row. **No shared-development lifecycle claim is
made.**

**Why the preferred B03 path was not used.** It is not reachable, for a
structural reason rather than a configuration one. A production API mandates a
`Secure`, `__Host-` prefixed staff session cookie
(`staff-auth.config.ts`: *"STAFF_SESSION_COOKIE_SECURE must be true in
production"*), and the development gateway terminates **plain HTTP**. No
conforming client returns a `Secure` cookie over `http://`, so **no
authenticated Admin operation can be driven against a production API behind the
supported gateway** — `adminProduct_publish` and `adminProduct_unpublish`
included. The route under test is anonymous and entirely unaffected.

The operator supplied an Admin credential for this run when the B03 path still
looked viable. Once the above was established the credential became unnecessary
and **was not used**: it was never sent to any endpoint, never written to disk,
never placed in an argument, never logged, and appears nowhere in this report or
in any committed file. The harness contains no `SMOKE_ADMIN_*` variable, no
cookie jar, and no login code — asserted by a test. Nothing was read from a
repository `.env`, and no credential was rotated or re-seeded.

The only secret in play is the PostgreSQL password this process generates for
its own throwaway container. That is not a rotation: no existing credential is
read, replaced or re-seeded. It reaches the container through the temporary
Compose override file — never an argument vector — is redacted from every line
the harness prints, and dies with the container.

---

## L. Product, Audit and Outbox evidence

| Measure | Entry | Exit |
| --- | --- | --- |
| `audit_events` (disposable copy) | 112 | **112** |
| `outbox_events` (disposable copy) | 112 → n/a; outbox | 35 → **35** |
| Target product | `a03-live-check-khan-theu`, `DRAFT` in the copy | fixture left `PUBLISHED` in the copy |

Because no lifecycle command runs at all, the counts are identical from the
first assertion to the last — measured both across the read-only window and
across the entire run. That identity **is** the evidence that the read route
writes nothing.

**Audit/Outbox residue: none.** The developer's database was never written, so
there is no residue in it to disclose. The disposable copy — including its
Audit and Outbox tables and the fixture status change — was destroyed with the
container and its volume at teardown.

**No durable evidence was deleted.** No raw-SQL delete was issued against
`audit_events` or `outbox_events` anywhere, on either database.

---

## M. Production-only defect reproduced and fixed

Running the real production image is what found this. It is the exact class §10
anticipates ("production module resolution"), and **nothing in the repository
could have caught it**: the development image serves TypeScript over a bind
mount and never loads `dist/`, `nest build` only compiles, and the T01 gateway
smoke ran against that development runtime.

### Before

The container started and exited immediately:

```
Error: Cannot find module '@nestjs/common'
Require stack:
- /app/packages/persistence/dist/database.module.js
- /app/packages/persistence/dist/index.js
- /app/apps/api/dist/modules/asset/asset-intake.module.js
- /app/apps/api/dist/bootstrap/app.module.js
- /app/apps/api/dist/main.js
```

### Root cause

pnpm links in **isolated** mode. `@nestjs/common` for `@embroidery/persistence`
lives at `packages/persistence/node_modules/@nestjs/common` — not at the
workspace root, which holds only the virtual store. Verified directly in the
running development container: `/app/packages/persistence/node_modules/@nestjs`
exists; `/app/node_modules/@nestjs` does not.

The `runner` stage shipped each runtime workspace package's `dist` and
`package.json` but **not its `node_modules`**, so resolution from
`/app/packages/persistence/dist/` found nothing. Compounding it, the
`prod-deps` stage installed with `--filter @embroidery/api` (no ellipsis) and
did not copy those packages' manifests, so pnpm never treated them as importers
and their `node_modules` were never created in the first place.

### Fix — `infrastructure/docker/api.Dockerfile` only

1. `prod-deps` now copies `packages/{database,object-storage,persistence}/package.json`
   and installs with `--filter "@embroidery/api..."` (ellipsis), making the
   API's workspace dependencies importers of the production install.
2. `runner` now copies each of those packages' `node_modules` from `prod-deps`
   alongside its `dist` and `package.json`.

Nothing else changed: no dependency, no lockfile, no version, no application
source, no `deps`/`dev`/`build` stage. The development image is unaffected.

### After

`node dist/main.js` starts, validates its pool, and serves:
`API listening on port 4000 (production)`.

### Focused regression — `tools/api-production-image.test.mjs`

Docker-free, in the standard aggregation, and **derived** rather than
hard-coded: it reads `apps/api/package.json`, takes every `workspace:`
dependency, excludes `@embroidery/contracts` (raw TypeScript the compiled API
must never require, IMP-D018), and asserts the `runner` stage ships `dist`,
`package.json` **and** `node_modules` for each. Adding a fourth runtime
workspace package and shipping only its `dist` fails at `pnpm test` speed
instead of in a container. It also pins the ellipsis filter, the per-package
manifest copies, `ENV NODE_ENV=production`, `CMD ["node", "dist/main.js"]`,
`USER node`, and that no raw `src/` is shipped.

**No other production-only defect was found.** Beyond this fix, Commit C
contains only the orchestration seam and its tests; the accepted T01 route was
not touched.

### A second, non-defect finding

Two further production guards had to be *satisfied* before the API would boot
(§D): the database TLS/password rules and `STAFF_SESSION_COOKIE_SECURE`. These
are not defects — they are the guards working. They are recorded because they
are the reason the topology needs a disposable database, and because the third
of them is what makes the B03 lifecycle path unreachable (§K).

---

## N. Development-stack restoration

| Check | Result |
| --- | --- |
| `dev API restored` | exit `0` |
| Restored runtime classification | `development` |
| Restored image id | `sha256:4124d6aa5910` — identical to entry |
| Restored mounts | `1` (`/app/apps/api/src`) — identical to entry |
| Gateway health after restore | `healthy` |
| API health after restore | `healthy` |
| Gateway reloaded back onto the dev upstream | yes, part of the cleanup plan |
| Residual images / containers / temp dir | `0` / `0` / removed |

The restore is driven from the tracked dev file alone and runs in `finally`, so
it executes after failure exactly as after success — observed on three failed
runs, not merely asserted.

---

## O. Frozen artifacts — all unchanged

| Artifact | Baseline | Verified |
| --- | --- | --- |
| OpenAPI SHA-256 | `3d905a5736c44c6c7ee1ca482789b3bd7c53c5f198f68b1252244519a788c9e5` | unchanged |
| OpenAPI shape | 14 paths / 17 operations / 27 schemas | unchanged |
| Generated API client | `be372048edd8d5b2e5257856cfe3aee2d9e7fc09297f643935038bbb0c0a8899` | unchanged |
| Database | 33 migrations / 78 tables / 833 columns / 190 CHECKs | unchanged |
| Database fingerprint | `82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf` | unchanged |
| Figma | 72 registry IDs / 72 node rows | unchanged |

No OpenAPI regeneration was needed or performed. No schema, migration, Figma,
Admin, Storefront, worker, tracked Nginx, tracked Compose, dependency or
lockfile change exists in this correction.

---

## P. Commit C

**`b7985d2549cfa8261a5e060db1a12f3727e171fe`** — `test(api): add isolated production media smoke`

9 files, +1716 −2.

| File | Change |
| --- | --- |
| `infrastructure/docker/api.Dockerfile` | +23 −1 — the reproduced production-only fix (§M) |
| `package.json` | +3 −1 — `smoke:app2-t01-public-media:production` |
| `tools/smoke-app2-t01-production-topology.mjs` | new, 359 |
| `tools/smoke-app2-t01-public-media-production.mjs` | new, 360 |
| `tools/smoke-app2-t01-public-media-production.test.mjs` | new, 357 |
| `tools/smoke-app2-t01-public-media-scenarios.mjs` | new, 339 |
| `tools/api-production-image.test.mjs` | new, 123 — focused regression for the defect |
| `tools/smoke-app2-t01-docker-facts.mjs` | new, 88 |
| `tools/smoke-app2-t01-gateway-http.mjs` | new, 66 |

Scope: production-smoke orchestration, its Docker-free regression tests, the
minimal script exposure, and the one reproduced production-only fix with its
focused regression. Nothing else. No `apps/**` source, no schema, no OpenAPI,
no generated client, no Figma, no tracked Nginx or Compose, no dependency and
no lockfile change.

---

## Q. Validation

Recorded results are from commands actually executed; nothing here is claimed
unrun.

| Command | Result |
| --- | --- |
| `node --test` — harness + production-image regression + T01 smoke + gateway seam | **40 tests, 40 pass, 0 fail** |
| Focused T01 unit suite (`public-product-media`), run 1 | 3 suites, **47 tests**, pass |
| Focused T01 unit suite, run 2 | 3 suites, **47 tests**, pass |
| `pnpm test:public-media:integration` (disposable PostgreSQL + MinIO) | 2 suites, **36 tests**, pass |
| `pnpm test:public-media:gateway` | 5 tests, pass |
| `pnpm --filter @embroidery/api lint` | exit 0 |
| `pnpm --filter @embroidery/api typecheck` | exit 0 |
| `pnpm --filter @embroidery/api test` | **108 suites, 1398 tests**, pass |
| `pnpm --filter @embroidery/api build` | exit 0 |
| **Isolated production API gateway smoke, run A (final code)** | **20/20 orchestration, 22/22 scenarios** |
| **Isolated production API gateway smoke, run B (final code)** | **20/20 orchestration, 22/22 scenarios** |
| `pnpm check:secrets` | pass — 352 documents, 1669 tracked files |
| `pnpm check:lifecycle` | pass — LC-04: 5 transitions, exactly one `PUBLISHED → DRAFT` |
| `pnpm check:openapi` | artifact up to date |
| `pnpm check:api-client` | tree hash `be372048…` unchanged |
| `pnpm check:figma-design-index` | 72 registry IDs / 72 node rows |
| `pnpm db:check:manifest` | 78 tables / 833 columns — all checks passed |
| `pnpm quality` | **exit 0** |
| `node tools/check-file-size.mjs` | pass — no hard-limit violation |
| `git diff --check` | clean |

The API suite total is **unchanged from T01** (108 suites / 1398 tests): this
correction adds no Jest test, only Node-runner harness tests and one Dockerfile
regression, both of which live in the `tools/*.test.mjs` aggregation.

### Production smoke run history — disclosed in full

| # | Code state | Outcome |
| --- | --- | --- |
| 1 | pre-fix | **FAIL** — swap succeeded, production container unhealthy; `Cannot find module '@nestjs/common'` (§M) |
| 2 | pre-fix, with startup-log capture | **FAIL** — same defect, now with the stack trace captured |
| 3 | post-module-fix | **FAIL** — production guard: `DATABASE_SSL_MODE "disable" is not permitted when NODE_ENV=production` (§D) |
| 4 | post-topology | **PASS** — 20/20 + 22/22 |
| 5 | post-topology | **PASS** — 20/20 + 22/22 |
| 6 | final (formatted) | **FAIL at build** — transient Docker Hub TLS handshake timeout resolving `docker/dockerfile:1`; unrelated to this repository |
| 7 | final (formatted) | **PASS** — 20/20 + 22/22 |
| 8 | final (formatted) | **PASS** — 20/20 + 22/22 |

Runs 1, 2, 3 and 6 each restored the developer's API and left zero residue,
which is the failure-path evidence §16 asks for — observed rather than asserted.

---

## R. Acceptance

| # | Criterion | Status |
| --- | --- | --- |
| 1 | Exact clean T01 evidence entry | PASS |
| 2 | T01 Commit A unchanged | PASS |
| 3 | Missing production-runtime proof disclosed | PASS (§B) |
| 4 | Existing T01 route contract preserved | PASS — no `apps/api/src` change |
| 5 | Real production API build used | PASS — canonical `runner` stage |
| 6 | Real production API process started | PASS — `API listening on port 4000 (production)` |
| 7 | `NODE_ENV=production` proven | PASS (§H) |
| 8 | Gateway reached production API | PASS |
| 9 | Gateway did not reach dev API during smoke | PASS — dev container replaced; image ids differ |
| 10 | Production image/container identity recorded | PASS (§H) |
| 11 | Development source mounts absent | PASS — `mounts: []` |
| 12 | No tracked Nginx/Compose change | PASS |
| 13 | Build/runtime isolated from mutable host output | PASS — asserted at runtime |
| 14 | Bounded startup timeout | PASS |
| 15 | Cleanup after success | PASS |
| 16 | Cleanup after simulated failure | PASS — and after four real ones |
| 17 | Original dev API restoration mandatory | PASS |
| 18 | Credentials absent from argv/logs/reports | PASS — no credential used at all (§K) |
| 19 | Docker-free orchestration tests pass | PASS — 35/35 |
| 20 | Smoke exercises the exact T01 route | PASS |
| 21 | Thumbnail exact bytes | PASS — 16400 |
| 22 | Catalog-preview exact bytes | PASS — 28378 |
| 23 | Safe headers | PASS |
| 24 | Anonymous behaviour | PASS |
| 25 | Visibility 400/404 behaviour | PASS |
| 26 | Unpublish revocation via a truthful setup | PASS — fixture, disclosed as such (§K) |
| 27 | Republish restoration | PASS — fixture, disclosed as such |
| 28 | Client-abort leaves production API healthy | PASS |
| 29 | Subsequent media request succeeds | PASS |
| 30 | No unhandled production stream error | PASS |
| 31 | Read route writes no Audit/Outbox row | PASS — 112/112, 35/35 |
| 32 | Lifecycle setup method disclosed | PASS (§K) |
| 33 | Shared-dev direct status write not mislabelled | PASS — there is **no** shared-dev write; fixture honesty is test-enforced |
| 34 | Product mutable state restored | PASS — copy destroyed; dev database never written |
| 35 | Audit/Outbox residue disclosed | PASS — none in the dev database (§L) |
| 36 | No raw-SQL durable-evidence deletion | PASS |
| 37 | Dev API restored and healthy | PASS |
| 38 | Gateway healthy after restore | PASS |
| 39 | Temporary containers/images/files removed | PASS |
| 40 | No accepted T01 behaviour regressed | PASS |
| 41 | No `B04/S01/S02/E01/X01` source | PASS — test-enforced |
| 42 | OpenAPI unchanged | PASS |
| 43 | Generated client unchanged | PASS |
| 44 | Database baseline unchanged | PASS |
| 45 | Figma unchanged | PASS |
| 46 | No dependency/lockfile change | PASS |
| 47 | Focused T01 tests pass twice | PASS — 47 tests, twice |
| 48 | PostgreSQL/MinIO integration passes | PASS — 36 tests |
| 49 | API full suite/build passes | PASS — 108 suites / 1398 tests; build exit 0 |
| 50 | Full quality passes | PASS — exit 0 |
| 51 | Commit C orchestration/test scope only | PASS |
| 52 | Commit D evidence/status scope only | PASS |
| 53 | Exactly two correction commits | PASS |
| 54 | Complete report | PASS |
| 55 | Final tree clean | PASS |
| 56 | Nothing pushed | PASS |
| 57 | `APP2-T01-C2` not created | PASS |

---

## S. `APP2-B04` handoff

`APP2-B04` is unblocked. It remains **exactly two JSON operations** —
`publicProduct_list` and `publicProduct_detail` — and consumes the shared
relative route helper `buildPublicProductMediaPath` from `@embroidery/contracts`.
No B04 source, route, schema or test was written by this correction.

Carried forward, unchanged from T01:

- **`product_media.id` is not a durable address.** `APP2-B02`'s update deletes
  and re-inserts a product's media associations wholesale, so every media edit
  mints new ids and previously issued URLs stop resolving. Safe — they 404, the
  route is `no-store`, and B04 projects the address per read — but a consumer
  must never treat it as permanent.
- **The compiled API cannot require `@embroidery/contracts`** (IMP-D018). B04
  must import the helper as a *type-only* symbol or re-declare its own copy and
  hold the two together with a test, exactly as T01 did.

New from this correction, and relevant beyond B04:

- **The production image now actually starts.** Before this fix, any deployment
  of `api.Dockerfile`'s `runner` stage would have crash-looped on the first
  require. This is the highest-value outcome of the correction and it was
  reachable only by running the real thing.
- **A production API needs a TLS database, a non-development password, and a
  Secure staff cookie.** Any future production-runtime evidence — B04's included
  — must satisfy those three guards rather than work around them, and cannot
  drive an authenticated Admin operation over the plain-HTTP development
  gateway.

---

## Final state

```text
APP2-T01   = COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW
APP2-T01-C2 = MUST_NOT_BE_CREATED
APP2-B04   = READY — NOT STARTED
APP2-S01 / APP2-S02 = BLOCKED_BY_APP2-B04
APP2-E01   = BLOCKED_BY_APP2-S01_AND_APP2-S02
```
