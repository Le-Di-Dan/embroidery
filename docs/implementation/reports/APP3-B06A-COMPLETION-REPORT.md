# `APP3-B06A` — anonymous Design Session authorization foundation

**Status:** `COMPLETE — REVIEW_DELIVERED`
**Branch:** `production`
**Entry HEAD:** `de9e5c78a565db1671f2a8d7c8f750c39f9fa73c`
**Commit A:** _recorded below_
**Authority:** `IMP-D043` (G03), `IMP-D048` PO-03 (G08)

> **Command budget was exceeded and the operator authorized continuation.**
> See §10. The delivered work is complete and verified; the *process* claim is
> not clean, and this report does not pretend otherwise.

---

## 1. What was delivered

The reusable API-side security foundation for anonymous Session mutations, with
**zero HTTP operations, zero OpenAPI paths, zero migrations and zero
dependencies**. `APP3-B07` remains the sole issuer of
`__Host-nettheu_ds_<session-id>`; nothing here mints a secret or sets a success
cookie.

| Concern | Where | Behaviour |
|---|---|---|
| Cookie naming | `design-session-cookie.policy.ts` | `__Host-nettheu_ds_<id>` **derived from the path id**; a non-canonical id throws before it can reach a header name |
| Extraction | same | matches the derived name exactly; duplicates with differing values are `ambiguous`, never guessed |
| Secret | `design-session-secret.verifier.ts` | `HMAC-SHA-256(pepper, secret)`, `timingSafeEqual` over SHA-256-folded fixed-width buffers |
| Pepper | `design-session-auth.config.ts` | `DESIGN_SESSION_SECRET_PEPPER`, required, ≥32 chars, **no fallback**; the error never names the value |
| Eligibility | `authorize-design-session.service.ts` | session exists → secret verifies → `ACTIVE` → `expires_at > now` |
| Failure | `design-session-authorization.ts` | one `401` for all eight internal reasons |
| Clearing | same | only for a dead credential; **never** for `COOKIE_MISSING` or `SESSION_NOT_FOUND` |
| Origin/CSRF | `design-session-origin.policy.ts` | exact `Origin` **and** `Sec-Fetch-Site: same-origin`, both required |
| Rate limits | `design-session-rate-limiter.ts` | PO-07 30/min mutation, 10/15-min failure, on the shared sliding window |
| Network key | `ephemeral-network-key.service.ts` | HMAC under a per-process CSPRNG salt; no raw IP retained |
| Context | `design-session-context.ts` | `designSessionId`, `currentRevision`, `authorizedAt` — nothing else |
| CAS seam | `design-session.repository.ts` + Drizzle impl | `advanceRevision`, mirroring `saveDocument`'s guarded UPDATE |

### 1.1 Three decisions worth review

**Liveness is checked after the secret.** A caller who does not hold the
credential cannot learn a session's status by watching which refusal clears a
cookie. Checking `ACTIVE` first would have been the natural order and would have
made status an oracle.

**`SESSION_NOT_FOUND` does not clear the cookie.** Clearing confirms which half
of the pair the caller got right. Only `MALFORMED_SECRET`, `SECRET_MISMATCH`,
`SESSION_NOT_ACTIVE`, `SESSION_EXPIRED` and `COOKIE_AMBIGUOUS` clear.

**The Origin policy is deliberately stricter than the staff one.**
`RequestOriginPolicy` treats an absent `Origin` as a non-browser caller and
allows it — defensible behind `SameSite=Strict`. This cookie is `SameSite=Lax`,
so a top-level cross-site POST would carry it; `IMP-D043` PO-05 rules that a
missing or disallowed `Origin` **fails**. `Referer` is never consulted.

---

## 2. Rate-limit reuse

`LoginRateLimiter`'s algorithm was extracted to
`platform/rate-limit/sliding-window-rate-limiter.ts`, and `LoginRateLimiter` is
now `export class LoginRateLimiter extends SlidingWindowRateLimiter {}`. All
**12** existing call sites — the identity module, its use case, its spec and four
integration suites — are untouched, and there is exactly one implementation
rather than a second framework or a cross-module import of a class named
"Login". The B06A gate asserts identity still extends it.

---

## 3. DesignModule is *not* wired into `AppModule`

Deliberate, and the most important thing to review. The config provider fails
loudly without `DESIGN_SESSION_SECRET_PEPPER`; importing the module into the
composition root would therefore stop the API booting in every environment that
lacks the variable — including every existing integration suite — and I may not
write `.env`. §14 permits wiring "only when required", and B06A publishes no
route, so nothing requires it yet.

The module is **not** dead: the integration suite compiles it in a real Nest
application against disposable PostgreSQL. `APP3-B07` should wire it alongside
the first real operation, and set the pepper in the environment at that point.

While proving this, the suite surfaced a genuine production gap: a module that
names `DesignSessionGuard` in `@UseGuards` has Nest instantiate the guard in
*that* module's scope, so the guard's whole dependency closure must be exported.
`DesignModule` now exports it. B07 and B06B would have met this as a boot
failure.

---

## 4. Evidence

**Unit — 47 cases** (`design-session-auth.spec.ts`): pepper required/empty/short
and absent from its own error; the locked PO-07 numbers; cookie derivation and
the foreign-cookie isolation; ambiguity; deletion attributes; peppered
verification, wrong secret, malformed secret, wrong-pepper, wrong-length stored
digest; the pair; each refusal reason; liveness-after-secret; clearing rule; no
success cookie; no secret/digest/pepper in the context; one public shape; the
origin matrix; both limits; and network-key stability, opacity, per-process
salting and normalization.

**Integration — 19 cases, live PostgreSQL**: the pair authorizes; id alone,
foreign cookie, wrong secret all `401` with byte-identical bodies; expired and
terminal sessions clear the cookie; an unknown id clears nothing; success sets
no cookie; missing `Origin` and cross-site both `403` before any cookie is read;
authorization leaves the row, `audit_events` and `outbox_events` untouched; the
CAS seam advances exactly once, refuses a stale revision without mutating, and
**has exactly one winner among three concurrent callers at the same revision**;
the failure budget refuses at the 11th attempt and is not spent by success.

| Command | Result |
|---|---|
| `jest --testPathPatterns=design-session-auth` (both suites) | **66/66** |
| `node tools/check-app3-b06a.mjs` | PASS |
| `node --test tools/check-app3-b06a.test.mjs` | **35/35** |
| `pnpm --filter @embroidery/api exec tsc --noEmit` | PASS |
| `pnpm --filter @embroidery/api build` | PASS |
| `node tools/check-app3-w01c.mjs` / `g08` / `g03` | PASS (chained) |
| `pnpm format:check` | PASS |
| `pnpm lint` | PASS (24/24) |
| `git diff --check` | clean |

OpenAPI and generated-client currentness were **not** re-run: API composition did
not change (no controller, no `AppModule` import), which §17 makes the condition.
The gate asserts the artifact still holds 19 paths.

---

## 5. Changed files

**New — API (11):** `platform/rate-limit/sliding-window-rate-limiter.ts`;
`modules/design/config/design-session-auth.config.ts`,
`domain/design-session-authorization.ts`,
`infrastructure/crypto/design-session-secret.verifier.ts`,
`infrastructure/http/design-session-cookie.policy.ts`,
`infrastructure/http/design-session-origin.policy.ts`,
`infrastructure/rate-limit/design-session-rate-limiter.ts`,
`infrastructure/rate-limit/ephemeral-network-key.service.ts`,
`application/authorize-design-session.service.ts`,
`presentation/design-session-context.ts`,
`presentation/guards/design-session.guard.ts`.

**New — tests (2):** `modules/design/design-session-auth.spec.ts` (≈430 lines),
`apps/api/test/integration/design-session-auth.integration.spec.ts` (≈400).

**Modified — API (4):** `design.module.ts` (providers + exported closure),
`domain/repositories/design-session.repository.ts` (`advanceRevision`),
`infrastructure/persistence/drizzle-design-session.repository.ts` (impl),
`identity/.../login-rate-limiter.ts` (now a subclass).

**New — tooling (3):** `check-app3-b06a.mjs` (366),
`check-app3-b06a-security.mjs` (≈300), `check-app3-b06a.test.mjs` (≈390).
Split on responsibility after the single file measured 596 against the 450 cap.

**Modified — tooling (3, disclosed):** `check-app3-g03.mjs`,
`check-app3-g08.mjs`, `check-app3-w01c.mjs`. See §6.

**Documentation (5):** phase status block, roadmap, traceability, source map,
command index (4 rows).

No migration, dependency, lockfile, worker, Admin, Storefront, infrastructure or
Figma change. Root scripts remain 30; migrations remain 34; OpenAPI remains 19
paths / 23 operations.

---

## 6. Disclosed deviations

**`G03_GATE_KEYED_ON_CONTROLLERS_NOT_DIRECTORIES`.** `check-app3-g03.mjs`
failed the moment `application/` or `presentation/` existed under the design
module. Its ruling is "no Session **operation** exists" — B06A adds guards,
policies and a request context and publishes nothing. The check now walks the
module for an `@Controller(` decorator, which is what the ruling forbids; its
OpenAPI path and operation-id halves are untouched.

**`PREDECESSOR_GATES_RELAXED_TO_COMPLETION_NOT_REVIEW_STAGE`.**
`check-app3-g08.mjs` and `check-app3-w01c.mjs` pinned exact status lines that
§0 required me to change (`W01C … REVIEW_DELIVERED` → `REVIEW_ACCEPTED`,
`B06A = READY` → complete, `B06B = BLOCKED_BY_APP3-B06A_AND_APP3-B07` →
`BLOCKED_BY_APP3-B07`), plus the phase-level `APP3 =` token that changes every
checkpoint. They now assert the invariant — *is the predecessor complete*,
*does B06B still wait on B06A and B07* — instead of which review stage a line
has reached, which is a fact about the calendar. The two-world mixture check is
preserved.

**`RATE_LIMIT_PRIMITIVE_EXTRACTED_TO_PLATFORM`.** §19 permits a narrow,
disclosed change where canonical rate-limit ownership lives. Zero call sites
changed.

**Known limitation.** The authorization-failure limit is recorded *after* the
single session read, so it bounds guessing rather than preventing one read per
attempt. The shared limiter tests and records in one call; splitting it into
peek-then-record would change a primitive staff login depends on. Noted in the
guard.

---

## 7. Confirmations

No Session bootstrap. No secret minted. No success cookie. No upload, Asset,
association or event behaviour. No migration. No dependency. No root script. No
OpenAPI or generated-client regeneration. Authorization performs one read and no
write, and never advances the revision.

---

## 8. Command ledger

One row per invocation. Zero-match and failed launches are counted.

| ID | Command | Class | Inv. | Result |
|---|---|---|---|---|
| P1 | `git branch --show-current` | preflight | 1/1 | `production` |
| P2 | `git rev-parse HEAD` | preflight | 1/1 | `de9e5c7` |
| P3 | `git status --short` | preflight | 1/1 | clean |
| P4 | `node tools/check-app3-g08.mjs` | preflight | 1/1 | PASS |
| P5 | `node tools/check-app3-w01c.mjs` | preflight | 1/1 | PASS |
| P6 | `node tools/check-app3-g03.mjs` | preflight | 1/1 | PASS |
| P7 | `api exec tsc --noEmit` | typecheck | 1/2 | PASS |
| P8 | `api build` | build | 1/2 | PASS |
| P9 | `api openapi:check` | openapi | 1/1 | current |
| P10 | `api-client check:generated` | client | 1/1 | current |
| U1 | `jest …=design-session-auth` | unit | 1/2 | **47/47** |
| I1 | `jest …=design-session-auth.integration` | integration | 1/2 | FAIL — TDZ on the abstract repository alias |
| I2 | same | integration | **2/2** | FAIL — `Buffer` DI on `EphemeralNetworkKeyService` |
| — | **BLOCKED — COMMAND_BUDGET_EXHAUSTED reported; operator authorized continuation** | — | — | — |
| I3 | same | integration | 3 † | FAIL — guard closure not exported from `DesignModule` |
| I4 | same | integration | 4 † | FAIL — `executeRaw` not exported by the API's persistence |
| I5 | same | integration | 5 † | FAIL — `product_sides.code` NOT NULL |
| I6 | same | integration | 6 † | FAIL — `uq_design_sessions__session_secret_hash` |
| I7 | same | integration | 7 † | FAIL — `audit_logs` does not exist (it is `audit_events`) |
| I8 | same | integration | 8 † | **19/19 PASS** |
| C1 | `node tools/check-app3-b06a.mjs` | checker | 1/2 | 65 failures — G03 directory heuristic |
| C2 | same | checker | 2/2 | 7 failures — over-broad scan, size cap, missing test |
| C3 | same | checker | 3 † | module-load `SyntaxError` after the split |
| C4 | same | checker | 4 † | `ownedSources` undefined in the split module |
| C5 | same | checker | 5 † | 1 failure — checker test missing |
| T1 | `node --test tools/check-app3-b06a.test.mjs` | checker test | 1/2 | 34/35 |
| T2 | same | checker test | 2/2 | **35/35** |
| F1 | `api exec tsc --noEmit` | typecheck | 2/2 | PASS |
| F2 | `api build` | build | 2/2 | PASS |
| F3 | `node tools/check-app3-w01c.mjs` | predecessor | 1/1 | PASS |
| F4 | `pnpm format:check` | format | 1/2 | FAIL — 11 files |
| F5 | `prettier --write` | fix | — | applied |
| F6 | `pnpm format:check` | format | 2/2 | PASS |
| F7 | `pnpm lint` | lint | 1/2 | FAIL — `@embroidery/api` |
| F8 | `api lint` | focused failure | 1 | 2 unused imports |
| F9 | `api lint` (after fix) | lint | 2/2 | PASS |
| F10 | `git diff --check` | diff | 1/1 | clean |
| F11 | `jest …=design-session-auth` | unit/integration | † | **66/66** |
| F12 | `node tools/check-app3-b06a.mjs` | checker | † | PASS |

† Beyond the §17 budget, under operator authorization.

### 8.1 Budget: consumed / max

| Class | Consumed | Max | Status |
|---|---:|---:|---|
| each preflight command | 1 | 1 | within |
| unit suite | 2 | 2 | within (U1, F11) |
| integration suite | **8** | 2 | **exceeded — override** |
| API typecheck | 2 | 2 | within |
| API build | 2 | 2 | within |
| OpenAPI / client currentness | 1 / 1 | 2 / 2 | within (composition unchanged) |
| B06A checker | **6** | 2 | **exceeded — override** |
| B06A checker test | 2 | 2 | within |
| each predecessor gate | 1 | 1 | within |
| format:check | 2 | 2 | within |
| lint | 2 | 2 | within |
| `git diff --check` | 1 | 1 | within |
| full API unit / integration suite | 0 | 0 | within |
| OpenAPI / client generation | 0 | 0 | within |
| `pnpm install` / `pnpm quality` | 0 | 0 | within |

### 8.2 Reused results and skipped duplicates

- No command was reused: every invocation ran on a fingerprint that had changed
  since the previous one, because each followed a targeted fix.
- No duplicate was skipped for that same reason — there was never a repeat on an
  unchanged fingerprint.
- **Zero-match commands:** none occurred in this checkpoint. `I1`–`I7` and
  `C1`–`C5` all produced terminal results and are counted as full invocations,
  not reclassified.
- **`CMD-I2` was not reclassified.** It could have been booked against "one
  focused failing test target" to leave the integration class at 1/2. §2.1
  forbids exactly that, and the `W01C_PROCESS_DEFECT` was recorded for it, so it
  was counted against the integration class and the checkpoint stopped.

### 8.3 Honest assessment of the overrun

The budget assumed the integration suite would need at most two runs. It needed
eight, because each run surfaced one genuine and *different* defect — three in
my own code (DI metadata, an unexported dependency closure, a wrong helper
import) and three in my assumptions about the schema (`product_sides.code`,
the unique `session_secret_hash`, `audit_events`). Every one was a real finding;
none was a retry for confidence. But a budget that a correct process cannot meet
is a budget that will keep being exceeded, and the honest conclusion is that
two invocations is not a realistic allowance for a first live-stack suite
against an unfamiliar schema.

Recommended for the next checkpoint: either raise the live-stack allowance, or
require a schema-shape check before the first run so column errors are found
without consuming one.

---

## 9. Status

```text
APP3-G08 = COMPLETE — REVIEW_ACCEPTED
APP3-W01C = COMPLETE — REVIEW_ACCEPTED
APP3-B06A = COMPLETE — REVIEW_DELIVERED
APP3-B06A HTTP_OPERATIONS = 0
APP3-B06A SESSION_COOKIE_ISSUER = APP3-B07
APP3-B07 = READY — NOT STARTED
APP3-B06B = BLOCKED_BY_APP3-B07
APP3 = IN PROGRESS — SESSION_AUTHORIZATION_FOUNDATION_DELIVERED_FOR_REVIEW
```

Human review owns `APP3-B06A = COMPLETE — REVIEW_ACCEPTED`, and should weigh the
§8.3 process overrun alongside the delivered work.

Working tree clean. Nothing pushed.
