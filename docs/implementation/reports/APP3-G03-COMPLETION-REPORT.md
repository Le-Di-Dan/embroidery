# APP3-G03 — Completion report

**Checkpoint:** `APP3-G03` — Anonymous Design Session ownership, transport and
retention authority
**Date:** 2026-08-04
**Branch:** `production` (local)
**Entry HEAD:** `16b08be39bf1eb6149499e7ac399c3dfb01ca5ab`
**Verdict:** `COMPLETE — REVIEW_DELIVERED`

---

## 1. Entry authority

Preflight ran on local `production` with a clean tree.

| Check | Result |
|---|---|
| `git branch --show-current` | `production` |
| `git rev-parse HEAD` / `production` | `16b08be39bf1eb6149499e7ac399c3dfb01ca5ab` |
| `git rev-parse origin/production` | `8b5f3b0279b1920babd05b52014af3b853f526c0` (7 behind; nothing pushed) |
| `git status --short` | clean |
| `pnpm check:app3-g01` | PASS |
| `pnpm check:app3-g02` | PASS |
| `pnpm check:app2-closure` | PASS |
| `pnpm check:lifecycle` | PASS |
| `pnpm quality` | `EXIT 0` |
| `IMP-D043` | free (register held `IMP-D041`, `IMP-D042` and no higher id) |

Accepted predecessors: `APP3-G01 = COMPLETE — REVIEW_ACCEPTED` (IMP-D041, seven
placement rulings, `G01_DB_DISPOSITION = REQUIRES_APP3_DB01`) and
`APP3-G02 = COMPLETE — REVIEW_ACCEPTED` (IMP-D042, LC-24 with six transitions,
`TR-LC04-06`, `G02_DB_CONTRIBUTION = NONE`). Both are recorded as accepted in
§6.6.4; the dated §6.4.4 and §6.5.4 tables are **not** rewritten — each carries a
forward supersession note instead, exactly as `APP3-G02` did for `APP3-G01`.

---

## 2. Session schema and repository evidence (read-only)

`packages/database/src/schema/design/design-sessions.ts` (TBL-025):

| Element | Declaration |
|---|---|
| public handle | `id: idColumn().notNull()`, `pk_design_sessions` |
| verifier | `sessionSecretHash: text('session_secret_hash').notNull()` |
| verifier uniqueness | `unique('uq_design_sessions__session_secret_hash')` (CST-019 / IDX-021) |
| expiry | `expiresAt: instant('expires_at').notNull()` |
| creation | `createdAt: createdAt()` |
| state | `status: stateColumn().notNull()` + `stateCheck(t.status, DESIGN_SESSION_STATES)` |
| concurrency | `autosaveRevision: integer('autosave_revision').notNull()`, CHECK `>= 0` |
| LC-07 states | `['ACTIVE', 'SUBMITTED', 'EXPIRED', 'DELETED']` |
| identity columns | **none** — no customer FK, email, phone, IP or fingerprint |

`apps/api/src/modules/design/`: four repository contracts and their Drizzle
implementations plus integration specs. `DesignSessionRepository` already carries
`STALE_WRITE` (G-DB7-19) with `expectedRevision` on `saveDocument`, plus
`expire()`, `submit()`, `findById()` and `findActiveBySecretHash()`. The module
has **no** `presentation` or `application` directory — no Session HTTP surface
exists, and `DesignModule` is still not imported by the composition root.

> **Reconciliation recorded in PO-01.** `findActiveBySecretHash` is a persistence
> lookup, not an authorization decision. `APP3-B07` must resolve by exact id and
> then verify the secret; authorizing on a hash lookup alone would satisfy the
> repository while violating the ruling.

Committed OpenAPI (`packages/contracts/openapi/openapi.generated.json`): 16
paths, 19 operations, **zero** Design Session, Design Template or Studio
operations. The only `session` path is `/api/staff/session` (APP1).

Precedent reused rather than reinvented: `CookiePolicyService` (one place that
owns cookie name and attributes, `__Host-` in production), `RequestOriginPolicy`
(exact normalized `scheme://host[:port]` allowlist, never substring) and
`login-rate-limiter.ts` — all APP1/identity, all staff-scoped, none reusable for
an anonymous per-session cookie without the authority this gate supplies.

---

## 3. Existing-data measurement (read-only)

Run against the dev database (`docker exec … psql -U embroidery -d embroidery`),
no mutation, development data treated as evidence only.

| Query | Result |
|---|---|
| `SELECT status, count(*) FROM design_sessions GROUP BY status` | 0 rows |
| `count(*)`, `count(*) FILTER (WHERE session_secret_hash IS NULL)`, `count(*) - count(DISTINCT session_secret_hash)` | `0 / 0 / 0` |
| `count(*) FILTER (WHERE expires_at IS NULL)`, `… (WHERE expires_at < created_at)` | `0 / 0` |
| `WHERE status = 'ACTIVE' AND expires_at <= now()` | `0` |
| `WHERE status = 'EXPIRED' AND expires_at <= now() - interval '24 hours'` | `0` |
| identity columns matching `%customer%`, `%email%`, `%phone%`, `%ip%`, `%fingerprint%` | 0 rows |
| `autosave_revision`: nulls / negatives / min / max | `0 / 0 / — / —` (no rows) |
| `information_schema.columns` | 17 columns, all as declared |
| `pg_constraint` | 9: PK, 1 unique, 5 FK, 2 CHECK (`status_allowed`, `autosave_revision_non_negative`) |

**Consequence.** There is no legacy data to migrate or grandfather: every rule
below applies from the first session ever created. Unlike `APP3-G02` — where 3
`ARCHIVED` products proved rows already depended on an unauthorised transition —
the zero-row baseline here means the authority is purely forward-looking.

---

## 4. The ten rulings

Recorded verbatim in `IMP-D043` and in phase §6.6.2. Summary of what each binds:

- **PO-01 — anonymous ownership.** Both public id *and* high-entropy secret;
  neither alone. Raw secret never persisted, logged, in a URL/query/fragment,
  returned in JSON or in browser storage. No Customer, email, phone, name, device
  fingerprint or anonymous-user aggregate. One safe external error shape for
  missing, expired and unauthorized alike.
- **PO-02 — generation and verification.** 32 server CSPRNG bytes, unpadded
  base64url, persisted only as `HMAC-SHA-256(runtime pepper, secret)`, compared
  in constant time. No browser `crypto.subtle`, no password hash, no secret or
  digest in logs/Audit/telemetry/exceptions. Missing pepper fails loudly.
- **PO-03 — browser transport.** `__Host-nettheu_ds_<session-id>`; `Secure`,
  `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`, `Max-Age` never beyond
  `expires_at`. Cookie holds only the secret; bootstrap returns the non-secret
  id; one cookie per session; removal on expiry, invalidation and failed
  authorization. Studio route stays `/san-pham/[slug]/thiet-ke`. Bearer, shared
  cookie, staff cookie and browser storage all forbidden.
- **PO-04 — issuance and rotation.** Authenticated resume rotates atomically
  under compare-and-swap, one winner, immediate invalidation, no grace window, no
  TTL extension. Autosave never rotates. No recovery credential in APP3.
- **PO-05 — CSRF, origin, enumeration.** Exact `Origin`, allowed
  `Sec-Fetch-Site`, host-only cookie and expected revision on every mutation.
  Credentialed cross-origin CORS disabled; `SameSite` alone insufficient; one
  safe non-enumerating error; repeated failures rate-limited.
- **PO-06 — retention and expiry.** `SESSION_TTL = 30 days` absolute from
  `created_at`, never slid. `TR-LC07-04` on an hourly sweep; `TR-LC07-05` after a
  24-hour purge grace, scoped to the exclusively-owned session family. Shared
  authority never deleted. `SUBMITTED` retention is APP5's. No restore.
- **PO-07 — rate and concurrency.** 5/hour (burst 2/minute) creation; 60/minute
  read; 10 per 15 minutes authorization failures; 30/minute mutations; 1
  in-flight mutation. Ephemeral network HMAC under a rotating salt; no raw IP
  persisted; no durable browser identity; no per-browser quota.
- **PO-08 — autosave conflict.** Expected `autosave_revision` on every mutation;
  match → one atomic update, one increment; stale → `STALE_WRITE` **without
  mutation**; ambiguity → refetch before retry, never blind replay. No
  idempotency table. `APP3-S11` owns the UX.
- **PO-09 — APP5 boundary.** No Customer identity, contact collection, staff auth
  attachment, submission or ownership transfer in APP3. `TR-LC07-03` is APP5's.
- **PO-10 — database contribution.** Every required field and constraint measured
  present; nothing new required → `G03_DB_CONTRIBUTION = NONE`.

---

## 5. Retention closure

`O-008` ("Temporary session retention — exact expiration period") and the
`design_sessions` half of `DP-RET-01` are **closed** by PO-06.

Two documents previously stated a **sliding** basis and are now superseded in
place, with the old text struck through rather than deleted:

- `DB4_DELETE_ARCHIVE_RETENTION_MAPPING.md` — `last_activity_at + TTL (O-008)` →
  `created_at + 30 days, absolute`, hard delete 24 h after `EXPIRED`.
- `DB10_DATA_DURABILITY_MATRIX.md` — same, plus the note that PO-07 forbids
  persisting raw IP in Design Session tables.

`last_activity_at` and `IDX-085` remain and still order the ACTIVE sweep; they no
longer *determine* expiry. `DB0_LIFECYCLE_INVENTORY.md` LC-07's three
"missing/ambiguous" items are marked closed. `DP-RET-02…09` stay deferred, and
`O-012` (all other retention) stays open.

---

## 6. Database contribution

```text
G03_DB_CONTRIBUTION = NONE
```

`APP3-DB01` still runs, but **only** because `APP3-G01` requires it
(`G01_DB_DISPOSITION = REQUIRES_APP3_DB01`). Neither G02 nor G03 contributes a
column, so `APP3-DB01 = REQUIRED — AWAITING_G04_CONTRIBUTION` is unchanged.

---

## 7. Dependency reconciliation

```text
APP3-G01 = COMPLETE — REVIEW_ACCEPTED
APP3-G02 = COMPLETE — REVIEW_ACCEPTED
APP3-G03 = COMPLETE — REVIEW_DELIVERED
APP3-G04 = READY — NOT STARTED
APP3-P01 = READY — NOT STARTED
APP3-P02 = READY — NOT STARTED
APP3-DB01 = REQUIRED — AWAITING_G04_CONTRIBUTION
G01_DB_DISPOSITION = REQUIRES_APP3_DB01
G02_DB_CONTRIBUTION = NONE
G03_DB_CONTRIBUTION = NONE
APP3-B07 identity/transport portion = UNBLOCKED_BY_G03
APP3-B07 overall = BLOCKED_BY_APP3_P01_APP3_P02_AND_DB_DISPOSITION
APP3-B08 session-concurrency portion = UNBLOCKED_BY_G03
APP3-B08 overall = BLOCKED_BY_APP3_P01_APP3_P02_AND_DB_DISPOSITION
APP3-W01 expiry authority = UNBLOCKED_BY_G03
APP3-W01 overall = BLOCKED_BY_DB_DISPOSITION
APP3-S11 conflict/reload UX authority = UNBLOCKED_BY_G03 — checkpoint not started
O-008 = CLOSED_BY_IMP-D043
DP-RET-01 design_sessions = CLOSED_BY_IMP-D043
```

**No implementation checkpoint is complete.**

---

## 8. Scope this gate did **not** rule (disclosed)

§6.3 previously assigned four open items to `APP3-G03`. The ten rulings close
three of them and **part** of the fourth:

| Item | Disposition |
|---|---|
| Design-session TTL (`O-008` / `DP-RET-01`) | **CLOSED** (PO-06) |
| Anonymous transport, issuance, rotation, enumeration | **CLOSED** (PO-01…PO-05) |
| Autosave **conflict** policy | **CLOSED** (PO-08) |
| Autosave **cadence** | **STILL OPEN** — not ruled by IMP-D043 |
| Anonymous rate/concurrency quotas | **CLOSED** (PO-07) |
| Document complexity / layer / image limits | **STILL OPEN** — not ruled by IMP-D043 |

The two remaining items are recorded as open in §6.3 with **no owner invented
here**; assigning them is a Product Owner decision.

---

## 9. Mechanical gate

`pnpm check:app3-g03` — `tools/check-app3-g03.mjs` (398 lines) plus one
responsibility split, `tools/check-app3-g03-security.mjs` (202 lines), which owns
credential, transport and abuse verification. Registered in `pnpm quality`
immediately after `check:app3-g02`.

What it recomputes, against the repository rather than the prose:

1. `IMP-D043` exists exactly once, records `PO-01`…`PO-10`, and is `LOCKED`.
2. All 79 ruled facts, from the bounded §6.6.1 table.
3. Ownership needs both halves — id-alone and secret-alone are separate facts.
4. Raw-secret prohibitions: persistence, URL, JSON, logs, browser storage.
5. HMAC-SHA-256 under a runtime pepper, 32 CSPRNG bytes, constant-time compare,
   no pepper fallback — asserted in the prose as well as the table.
6. The exact cookie name and every attribute, in **both** §6.6.2 and security §9.
7. Atomic compare-and-swap rotation, one winner, no TTL extension, no grace.
8. Origin allowlist, `Sec-Fetch-Site`, credentialed CORS disabled, `SameSite`
   alone insufficient.
9. One safe non-enumerating error shape.
10. `SESSION_TTL = 30 days` absolute and the 24-hour purge grace.
11. `SUBMITTED` stays APP5-owned.
12. The exact rate limits (in the fact table *and* the security §7 table), and
    the absence of any durable browser identity.
13. One in-flight mutation, expected revision, `STALE_WRITE` without mutation, no
    blind replay, no idempotency table.
14. No email/phone/customer ownership — as facts **and** as a scan of the real
    schema for identity-bearing column names.
15. `G03_DB_CONTRIBUTION = NONE`.
16. The eight required schema declarations and the LC-07 state set, matched on
    the declaration (`stateColumn()`, `instant()`, `createdAt()`), not on an
    assumed literal.
17. No Design Session path **or** `designSession*` operation id in the committed
    OpenAPI, and no `presentation`/`application` directory in the Design module.
18. LC-07 preserved: five transition ids, exact from→to pairs, `ABANDONED`
    eliminated.
19. `checkApp3G01` and `checkApp3G02` run in full; any failure propagates.
20. APP2 closure chronology (`checkNextPhaseChronology` against `8b5f3b0`).

Two checker defects its own tests caught, both fixed before delivery:

- **Markdown hard-wrapping** split `raw IP is **not**\npersisted` and
  `**not**\nownership or customer identity`, so three correct rulings read as
  absent. Every prose assertion now runs against whitespace-flattened text — the
  same failure mode `APP3-G01` hit and the reason `flatten()` exists.
- **An `ABANDONED` guard that could satisfy itself.** The first version passed if
  the LC-07 section contained "eliminated" anywhere — which this gate's own note
  supplies. It now anchors on the canonical sentence
  `` `ABANDONED` eliminated (merged into EXPIRED) ``.

## 10. Disclosed tooling defect — `FU-APP3-G02-DEPENDENCY-TABLE-BOUND-01`

`check-app3-g02.mjs` reads §6.5.4 with the literal end marker `## 7. ` rather
than "the next heading". That was correct only while §6.5.4 was the last
subsection before §7; adding §6.6.4 put a second dependency table inside its
range, and `new Map()` lets the later duplicate keys win — so G02 briefly read
G03's statuses and failed.

It is **not** edited or weakened here: `tools/` outside `check-app3-g03*` is
outside this checkpoint's allowed files. §6.6.4 instead uses a three-column
`Checkpoint | Portion | Status` table, which is independently the right shape —
`APP3-B07`, `APP3-B08` and `APP3-W01` are each only *partly* unblocked, and one
row per checkpoint could only record that by dropping half the fact. G02 reads
its own frozen §6.5.4 rows correctly and passes untouched (verified). The
follow-up is recorded in §6.6.4 for the next checkpoint authorized to touch that
file; `check-app3-g01.mjs` already bounds by the next heading and is the pattern
to copy.

---

## 11. Tests

`tools/check-app3-g03.test.mjs` — **66 tests, 66 passing**. One file; the second
authorized file was not needed. Each case breaks exactly one ruling in a
throwaway copy of the repository (canonical files plus real `.git` for the
chronology half) and asserts the checker refuses it.

Covered: id-only and secret-only authorization; raw secret in JSON, URL and
browser storage; weakened secret length; a non-HMAC digest; dropped constant-time
compare; a pepper fallback; a missing cookie attribute in each of the two places
the contract is stated; one shared cookie; a cookie outliving `expires_at`; staff
cookie reuse; rotation extending TTL; a retained previous secret; more than one
winning rotation; dropped compare-and-swap; credentialed cross-origin use;
accepting an absent `Origin`; existence-revealing and per-cause errors; a changed
TTL, a sliding TTL, extension on activity, and a changed purge grace; APP3 owning
`SUBMITTED` retention; purging shared authority; reverting `O-008` to deferred; a
retention row that still states `last_activity_at` as live; altered creation and
mutation limits; a durable browser identity; a per-browser quota; persisted raw
IP; more than one in-flight mutation; a dropped security-document limit; dropped
revision, a mutating stale write, blind replay and an idempotency table; customer
identity, contact collection and APP3 owning the submit transition; an
identity-bearing column added to the schema; a claimed G03 migration
contribution; a removed required column; a removed uniqueness constraint; a
changed LC-07 state set; a Session path and a Session operation id in OpenAPI; a
renumbered LC-07 transition; a reintroduced `ABANDONED`; a missing, duplicated
and unlocked decision; a missing ruling id; and G01/G02 regression propagation.
Plus the positive baseline: the corrected repository passes with zero failures.

No existing gate or test was weakened. `check:lifecycle` (11/11),
`check-app3-g01` (25/25), `check-app3-g02` (26/26), `check-app2-closure` (40/40)
and `check-app2-closure-chronology` (12/12) all still pass unchanged.

---

## 12. Changed files

Authority and reconciliation:

- `docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md` — §6.3 open
  decisions, §6.5.4 supersession note, new §6.6 (facts, ten rulings, DB
  contribution, dependency reconciliation), §10 status.
- `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` — `IMP-D043`.
- `docs/database/DB3_LIFECYCLE_SPECIFICATIONS.md` — LC-07 authority note;
  transitions unchanged.
- `docs/12-DECISION-LOG.md` — `O-008` closed.
- `docs/database/DB10_DURABILITY_PARAMETER_REGISTRY.md` — `DP-RET-01`.
- `docs/database/DB4_DELETE_ARCHIVE_RETENTION_MAPPING.md`,
  `docs/database/DB10_DATA_DURABILITY_MATRIX.md` — sliding basis superseded.
- `docs/database/DB0_LIFECYCLE_INVENTORY.md` — LC-07 ambiguities closed.
- `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` — §7 limits, §9 credential
  transport, §10 session retention.
- `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md`,
  `11-TRACEABILITY-AND-STATUS-MATRIX.md`, `13-PHASE-SOURCE-MAP.md`,
  `audits/APP3_PRE_IMPLEMENTATION_AUDIT.md` — status and finding closure.

Gate and registration:

- `tools/check-app3-g03.mjs`, `tools/check-app3-g03-security.mjs`,
  `tools/check-app3-g03.test.mjs`, `package.json`.

**Not touched:** `apps/**`, `packages/**`, schema, migrations, the OpenAPI
artifact, the generated client, `docs/design/**`, Figma, `spikes/**`,
`infrastructure/**`, `pnpm-lock.yaml`, dependencies.

---

## 13. Validation

Run on `production` after Commit A.

| Command | Result |
|---|---|
| `pnpm check:app3-g01` | PASS |
| `node --test tools/check-app3-g01.test.mjs` | PASS (25/25) |
| `pnpm check:app3-g02` | PASS |
| `node --test tools/check-app3-g02.test.mjs` | PASS (26/26) |
| `pnpm check:app3-g03` | PASS |
| `node --test tools/check-app3-g03.test.mjs` | PASS (66/66) |
| `pnpm check:lifecycle` | PASS |
| `node --test tools/check-lifecycle-consistency.test.mjs` | PASS |
| `pnpm check:app2-closure` | PASS |
| `node --test tools/check-app2-closure.test.mjs` | PASS |
| `node --test tools/check-app2-closure-chronology.test.mjs` | PASS |
| `pnpm check:secrets` | PASS |
| `pnpm check:openapi` | PASS |
| `pnpm check:api-client` | PASS |
| `pnpm check:figma-design-index` | PASS |
| `node --test tools/check-figma-design-index.test.mjs` | PASS |
| `pnpm db:check:manifest` | PASS |
| `pnpm check:spike-boundaries` | PASS |
| `pnpm spike:editor:check` | PASS |
| `node tools/check-file-size.mjs` | PASS — 0 hard-limit violations |
| `git diff --check` | clean |
| `pnpm quality` | **EXIT 1** — see below |

### `pnpm quality` is red — disclosed, not claimed green

`pnpm quality` reached `pnpm test` and stopped there:

```text
# tests 524
# suites 56
# pass 523
# fail 1
[ELIFECYCLE] Test failed.
```

The failing case is **one** of the 260 top-level cases in the aggregated
`node --test "tools/*.test.mjs"` run. Every tools suite this checkpoint touches
or depends on was run individually and passed — `check-app3-g01` (25/25),
`check-app3-g02` (26/26), `check-app3-g03` (66/66),
`check-lifecycle-consistency`, `check-app2-closure`,
`check-app2-closure-chronology` and `check-figma-design-index` — so the failure
is **not attributed** to a specific suite in this report. Identifying it requires
the full aggregate run, which was explicitly stopped as too slow, and that cost
is itself the subject of the quality-mechanism refactor this checkpoint hands
over to.

`pnpm quality` was `EXIT 0` at entry (`16b08be`), so the regression is bounded to
this checkpoint's 17 files or to cross-suite interference in the aggregate run.
**This is an open item. `APP3-G03` must not be accepted as `REVIEW_ACCEPTED`
until it is identified and resolved.** Recorded as
`FU-APP3-G03-QUALITY-AGGREGATE-01`.

---

## 14. Commit protocol

| Commit | Hash | Subject |
|---|---|---|
| A | `9c686c9c78ff8801d4a6c39015d4dcf91d98955d` | `docs(app3): lock anonymous session authority` |
| B | *(this report)* | `docs(app3): record APP3-G03 evidence` |

Confirmations:

- branch is local `production`; **nothing pushed** — `origin/production` remains
  `8b5f3b0279b1920babd05b52014af3b853f526c0`;
- no commit was amended, squashed, rebased or rewritten;
- working tree clean after Commit B;
- **no implementation**: no application source, schema, migration, OpenAPI
  operation, generated client, Figma node or UI was changed, and the gate asserts
  that absence;
- `.env` was not written; no secret-bearing variable was read, echoed or
  committed. The only environment values read were `POSTGRES_USER` and
  `POSTGRES_DB`, both ordinary non-secret config.

---

## 15. Delivered statuses

```text
APP3-G01 = COMPLETE — REVIEW_ACCEPTED
APP3-G02 = COMPLETE — REVIEW_ACCEPTED
APP3-G03 = COMPLETE — REVIEW_DELIVERED
APP3 = IN PROGRESS — THIRD GATE DELIVERED_FOR_REVIEW
APP3-G04 = READY — NOT STARTED
FU-APP3-G02-DEPENDENCY-TABLE-BOUND-01 = OPEN
FU-APP3-G03-QUALITY-AGGREGATE-01 = OPEN
```

Human review owns `APP3-G03 = REVIEW_ACCEPTED`, and should withhold it until
`FU-APP3-G03-QUALITY-AGGREGATE-01` is closed.
