# APP6-B06 — Digitizing Transition — Completion Report

```text
APP6-B05 = ACCEPTED
APP6-B06 = COMPLETE
NEW HTTP OPERATIONS = 0
EXISTING OPERATION = adminCustomRequest_transition
TOSTATUS ADDED = DIGITIZING ONLY
TR-LC11-07 = DELIVERED
QUOTE_ACCEPTED → DIGITIZING = ADMIN COMMAND
GRD-005 = ENFORCED
QUOTE_NOT_ACCEPTED = CANONICAL
DIRECT QUOTED COMMAND = ABSENT
DIRECT QUOTE_ACCEPTED COMMAND = ABSENT
DIRECT DESIGN_REVIEW COMMAND = ABSENT
DIRECT APPROVED COMMAND = ABSENT
EXISTING APP5 EDGES = UNCHANGED
NEW COMMANDABLE EDGE COUNT = 1
OUTBOX/NOTIFICATION = NONE
QUOTATION/ACCEPTANCE MUTATION = NONE
DESIGN VERSION = NONE
ORDER/PAYMENT/INVENTORY/PRODUCTION SIDE EFFECTS = NONE
DATABASE MIGRATION = NONE
OPENAPI PATH COUNT = UNCHANGED
OPENAPI OPERATION COUNT = UNCHANGED
B07 = NOT STARTED
NEXT CHECKPOINT = APP6-B07
```

---

## 1. Entry state

| Fact | Value |
|---|---|
| Entry `HEAD` | `fb653fb3173f8e04fa5700aefca3dda9c171762d` (`docs(app6): record the APP6-B05 commit hash in its completion report`) |
| Branch | `production` |
| Working tree at entry | clean — `git status --porcelain` produced no output |
| `4d18ee3` reachable from `HEAD` | **yes** — `git merge-base --is-ancestor 4d18ee3 HEAD` exited 0 |
| Predecessor verdict applied | `APP6-B05 = PASS`, `CORRECTION = NONE` |

No unrelated user change was present, so the commit below is a clean
path-scoped commit of this checkpoint's work only.

### 1.1 What was inspected before any edit

The delivered `APP5-B05` transition path, end to end:

| Layer | File |
|---|---|
| Endpoint | `apps/api/src/modules/order/presentation/admin-custom-request-moderation.controller.ts` |
| Request schema | `apps/api/src/modules/order/presentation/schemas/admin-custom-request-moderation.request.ts` |
| Response schema | `apps/api/src/modules/order/presentation/schemas/admin-custom-request-moderation.response.ts` |
| Policy | `apps/api/src/modules/order/domain/moderation/request-moderation.policy.ts` |
| Error catalogue | `apps/api/src/modules/order/domain/moderation/request-moderation.errors.ts` |
| Use case | `apps/api/src/modules/order/application/moderation/transition-custom-request.use-case.ts` |
| Outbox recorder | `apps/api/src/modules/order/application/moderation/request-moderation.recorder.ts` |
| Repository transition | `apps/api/src/modules/order/infrastructure/persistence/drizzle-custom-request.repository.ts` |
| Canonical lifecycle | `apps/api/src/modules/order/domain/lifecycle/request-transitions.ts` |
| Focused tests | the policy unit suite, the moderation contract suite, the transition integration suite, the race suite |

Canonical authority read before changing code:

- `docs/database/DB3_LIFECYCLE_SPECIFICATIONS.md` — LC-11 row `TR-LC11-07`
  (`QUOTE_ACCEPTED→DIGITIZING`, actor **admin**, guard **GRD-005**, in-tx
  `mark`, after-commit "optional SE soft hold", audit `yes`, no idempotency
  binding, no concurrency row);
- `docs/database/DB3_TRANSITION_GUARD_CATALOG.md` — GRD-005 row: arbiter
  `request state`, mechanism `tx`, public error **`QUOTE_NOT_ACCEPTED`**;
- `docs/adr/database/ADR-DB3-001-APPROVAL-QUOTATION-ORDERING.md` r1 — "Request
  enters `DIGITIZING` only from `QUOTE_ACCEPTED` … **No admin override**";
- `docs/implementation/audits/APP6_G01_DESIGN_REVIEW_AND_QUOTATION_AUTHORITY.md`
  §4 (error mapping: `QUOTE_NOT_ACCEPTED`; wrong source state
  `INVALID_TRANSITION`), §4.1 (the projection rule), §11 (the guard/race table,
  "each owning checkpoint publishes the code exactly as named here rather than
  inventing a synonym");
- `docs/database/DB7_TX_APP_GUARD_MATRIX.md` G-DB7-22 — GRD-005 is enforced at
  `CustomRequestRepository.transition`.

No contradiction was found between these sources.

---

## 2. Endpoint reuse — zero new HTTP operations

The delivered operation is reused **unchanged and not reissued**:

```text
POST /api/admin/custom-requests/{requestId}/transitions
→ adminCustomRequest_transition
```

No `/digitize`, no `/start-digitizing`, no `/status`, no second controller, no
second route, no second operation id. The controller class, its guards
(`AuthenticatedAdminGuard` + `StaffOriginGuard` + `StaffJsonBodyGuard`), its
`200` status and its response payload are untouched; only the OpenAPI
`description` strings changed, to say what the new target requires and what it
refuses with.

---

## 3. Request schema — exactly one enum addition

| | Before | After |
|---|---|---|
| `toStatus` enum | `UNDER_REVIEW`, `NEEDS_CLARIFICATION`, `REJECTED`, `CANCELLED` | the same four **+ `DIGITIZING`** |
| Body strictness | `.strict()` → `additionalProperties: false` | unchanged |
| `required` | `["toStatus"]` | unchanged |
| Server-owned fields accepted | none | none |

`QUOTED`, `QUOTE_ACCEPTED`, `DESIGN_REVIEW` and `APPROVED` remain **absent from
the published enum**, so a client asking for one is a `400` at the schema
boundary before the policy is ever consulted. `NEW` remains absent. The enum was
**not** replaced by the full lifecycle vocabulary: the set of states a request
can be *in* and the set an operator may *ask for* stay different sets, and the
DTO now says so in prose as well as in code.

The same widening reaches `RequestTransitionedResponse.toStatus`, which is
generated from the same constant — a mechanical consequence, not a second
decision.

---

## 4. Policy — exactly one legal edge

`APP5_TRANSITIONS`, source state by source state:

| Source | Before | After |
|---|---|---|
| `NEW` | `UNDER_REVIEW`, `CANCELLED` | unchanged |
| `UNDER_REVIEW` | `NEEDS_CLARIFICATION`, `REJECTED`, `CANCELLED` | unchanged |
| `NEEDS_CLARIFICATION` | `UNDER_REVIEW`, `REJECTED`, `CANCELLED` | unchanged |
| `QUOTED` | — | unchanged (empty) |
| **`QUOTE_ACCEPTED`** | — | **`DIGITIZING`** |
| `DIGITIZING` | — | unchanged (empty) |
| `DESIGN_REVIEW` | — | unchanged (empty) |
| `APPROVED` | — | unchanged (empty) |
| `REJECTED` | — | unchanged (empty) |
| `CANCELLED` | — | unchanged (empty) |

```text
existing APP5 edges = 8
new B06 edge        = 1   (QUOTE_ACCEPTED → DIGITIZING)
total               = 9
```

`DESIGN_REVIEW → DIGITIZING` is a legal LC-11 edge and is **deliberately not
offered**: rework is design-version work no delivered checkpoint owns, and a
command allow-list is not the place to open a workflow nothing implements.

### 4.1 How the proof is built

The existing whole-state-space enumeration was **extended**, not replaced, and
no bespoke checker was written. `request-moderation.spec.ts` now carries
`APP5_EDGES` (the delivered eight) and `B06_EDGES` (the one addition)
separately, and proves:

| Claim | Test |
|---|---|
| every one of the nine edges is permitted | `permits %s -> %s` (9 cases) |
| **exactly** those nine, across all 10×10 pairs | `permits exactly those nine edges and no others…` |
| all eight APP5 edges survive, and the **delta** is exactly one | `leaves all eight delivered APP5 edges exactly as APP5-B05 left them` — computes the set difference against the whole space rather than asserting a count |
| the four system-owned APP6 targets are refused from **every** state | `refuses the four system-owned APP6 targets from every source state` (40 pairs) |
| `DIGITIZING` is reachable from exactly one state | `reaches DIGITIZING from QUOTE_ACCEPTED and from no other state` |
| `QUOTE_ACCEPTED` offers `DIGITIZING` and nothing else | `offers exactly DIGITIZING from QUOTE_ACCEPTED, and nothing else` |
| no backward edge, no new cancellation stage | `adds no backward edge and no new cancellation stage` |
| the policy is still a strict subset of LC-11 | the pre-existing `is a strict subset of the canonical LC-11 graph…` (unchanged, re-run against nine edges) |
| stage-S1 cancellation bound is unchanged | the pre-existing `bounds cancellation to the three APP5-safe pre-quotation states` |

---

## 5. GRD-005 and `QUOTE_NOT_ACCEPTED`

### 5.1 Where the guard lives

GRD-005 **is** the allow-list row. `DIGITIZING` is offered from `QUOTE_ACCEPTED`
and from nowhere else, so there is no override branch to write and none to
forget to check — ADR-DB3-001 r1's "no admin override" is a structural property,
not a condition somebody remembered to test.

The guard is decided in transaction, as the catalogue requires, and the
mechanism is the delivered one:

```text
runInTransaction
  read current state                       ← the state the command is judged against
  evaluateModerationCommand(current, cmd)  ← GRD-005 decided here
  requests.transition({ …, expectedFrom: current.status })
      SELECT … FOR UPDATE                  ← the arbiter row lock
      refuse if the locked row ≠ expectedFrom   (STALE_TRANSITION)
      refuse if LC-11 forbids the move          (INVALID_TRANSITION)
      UPDATE custom_requests + INSERT custom_request_transitions
COMMIT
```

`expectedFrom` is what makes the unlocked first read safe: the row is pinned,
under the lock, to the exact state GRD-005 was evaluated against. A request that
left `QUOTE_ACCEPTED` between the two reads cannot have this decision applied to
it from a different source state — it is refused as stale.

### 5.2 Which code answers which state

`APP6-G01` §4 names two codes for `TR-LC11-07`. They are partitioned by whether
the operator can act on the advice:

| Source state | Answer | Why |
|---|---|---|
| `QUOTE_ACCEPTED` | **200** | the only legal source |
| `NEW`, `UNDER_REVIEW`, `NEEDS_CLARIFICATION`, `QUOTED` | **409 `QUOTE_NOT_ACCEPTED`** | genuinely pre-acceptance — acceptance is still ahead, and this is the exact failure ADR-DB3-001 r1 exists to prevent |
| `DIGITIZING` (repeat), `DESIGN_REVIEW`, `APPROVED`, `REJECTED`, `CANCELLED` | **409 `INVALID_TRANSITION`** | none of these can still reach `QUOTE_ACCEPTED`, so "get the quotation accepted first" would be advice the operator cannot act on |

`QUOTE_NOT_ACCEPTED` is the canonical `DB3_TRANSITION_GUARD_CATALOG.md` code,
carried verbatim. No synonym was invented, and a test asserts the catalogue
contains exactly one quotation-named code. The refusal message is
`"Digitizing can start only after the customer has accepted a quotation."` —
specific to what the authenticated operator typed, naming no customer, contact,
token, digest, storage key or unreleased APP6 capability.

`APP5-B05`'s "names no APP6 capability in any published code" rule was
**narrowed rather than deleted**: design and approval capabilities stay unnamed,
and the one quotation word the catalogue may now carry must be exactly
`QUOTE_NOT_ACCEPTED`.

### 5.3 What B06 did not import

No quotation module, no customer secure-flow module, no acceptance-evidence
read. `APP6-B05` already guarantees `QUOTE_ACCEPTED` is the atomic projection of
a committed acceptance inside the acceptance transaction, and GRD-005's arbiter
per the catalogue is the **request state**, not a second persisted fact. Re-proving
B05 from here would add a dependency the guard does not need.

---

## 6. Actor, correlation and transition evidence

`TR-LC11-07` is an **admin** command and stays one — no conversion to SYSTEM.
The delivered actor derivation and transaction are reused with no change:

| Column | Value | Source |
|---|---|---|
| `from_status` | `QUOTE_ACCEPTED` | server read + row lock |
| `to_status` | `DIGITIZING` | the only client input |
| `actor_kind` | `ADMIN` | `requireAdminActorId(requestContext)` |
| `admin_id` | the session's operator | request context, never the body |
| `customer_id` / `system_job_key` | `NULL` | exactly one actor reference matches the kind |
| `reason` / `customer_visible_reason` | `NULL` unless an internal reason was supplied | see §7 |
| `correlation_id` | this request's own id | `requestContext.requireRequestId()` |

Asserted in `digitizing-transition.integration.spec.ts` →
`records an ADMIN actor, a real correlation id and neither reason text`.

The root update and the TBL-042 row remain one write inside one transaction; no
second transaction, no state-sync call, no direct SQL from the use case and no
in-process mutex was added.

---

## 7. Reason / note semantics for `DIGITIZING`

Digitizing is workflow progression, not a refusal, so the combination was
decided explicitly rather than inherited from the moderation targets beside it:

| Field | `DIGITIZING` | Reason |
|---|---|---|
| `internalReason` | `OPTIONAL` | nothing is being refused, so there is no decision to justify; an operator may still record why they started now |
| `customerVisibleReason` | **`FORBIDDEN`** | DB3 LC-11 maps no notification to `TR-LC11-07` and `APP6-G01` §4 records its outbox column as `none`. A text written here would be a message with no delivery that `APP5-B03` would then show the customer as the explanation of a state they were never told about — refused rather than silently dropped |
| `moderationNote` | `OPTIONAL` | the evidence this move owes is its TBL-042 row |
| `moderationNoteKind` | **`['NOTE']` only** | `CLARIFY`, `REJECT` and `SPAM` all describe refusals; inheriting the full set would let an operator file a rejection note against a request that has just started being worked on |

No new note kind, no new reason field, no new note vocabulary. `PAUSE` remains
unexposed.

---

## 8. Side effects — none

`MODERATION_EVENT_OF` gains `DIGITIZING: undefined`. The `Record` is exhaustive
over the target union, so the widening **forced** this decision at compile time
rather than allowing a silent default.

No `request.digitizing-started` was minted; no notification intent, no quotation
or acceptance mutation, no design case / version / document, no order, payment
obligation, payment attempt, inventory hold, reservation or production job.

Proved by comparing, before and after a successful move, the row counts of
`quotations`, `quotation_versions`, `quotation_acceptances`, `design_versions`,
`approval_snapshots`, `orders` and `payment_obligations` — a *comparison*, not a
zero assertion, so an already-empty table proves nothing by accident. Plus, on
the request's own aggregate, `{ transitions: 1, notes: 0, outbox: 0 }`.

`notifiesCustomer` was converted from `to !== 'UNDER_REVIEW'` to an exhaustive
`Record`: the old form would have defaulted `DIGITIZING` to *notifying*, which
is exactly the class of accident a widening produces.

---

## 9. Transaction and stale protection

Unchanged. `transition-custom-request.use-case.ts` and
`drizzle-custom-request.repository.ts` carry **no diff** in this checkpoint —
the new target travels the delivered path verbatim.

What is proved for the new target specifically
(`pins the source state it judged, so a stale decision cannot reapply`): the
repository's `transition` is called exactly once, with
`{ to: 'DIGITIZING', expectedFrom: 'QUOTE_ACCEPTED', actor: { kind: 'ADMIN', adminId } }`.
A stale Admin decision therefore cannot silently apply from a different source
state; `expectedFrom` was not weakened, and no path bypasses it.

A repeat command after a successful move is refused `INVALID_TRANSITION` and
leaves exactly one transition row.

---

## 10. OpenAPI and generated client

Sequence, run once each in this order: stabilize code → API typecheck → generate
→ inspect semantic diff → check → client generate → client check → typechecks.

| Metric | Before | After |
|---|---|---|
| Paths | 65 | **65** |
| Operations | 71 | **71** |
| Schemas | 148 | **148** |

Semantic diff, computed by parsing both artifacts:

```text
path delta:          []
operationId delta:   []
schema name delta:   []
changed schemas:     ["RequestTransitionedResponse", "TransitionCustomRequestBody"]
```

Both changes are the same single enum widening (`…,"CANCELLED"` → `…,"CANCELLED","DIGITIZING"`).
The only other lines in the raw diff are the transition operation's `description`
and its `409` `description`. `adminCustomRequest_transition` is unchanged as an
operation id, method and path. **No customer quotation operation changed** —
the `publicQuotation_*` family is untouched, as the empty operation and schema
deltas show.

Generated client: `+2` lines in `embroidery-api.schemas.ts` (the enum constant
in both places) and one description line in `embroidery-api.ts`. Tree hash
`48e51aeb794001bed765ff78e37f4e925ea61db07f0dc042491d11a001640741`, and
`check:generated` reports the client up to date. No regeneration loop occurred:
generate and check each ran exactly once.

### 10.1 Admin frontend

`apps/admin` declares its own narrow `ModerationTarget` union of four values
(`moderation-actions.ts:31`) rather than consuming the generated enum, so the
widening reaches no Admin screen and offers no new operator control.
`tsc --noEmit` on `@embroidery/admin` is clean. No Admin UI work was done, as
§16 requires.

---

## 11. Focused test ledger

| # | Command | Result | Why it was justified |
|---|---|---|---|
| 1 | `pnpm --filter @embroidery/api exec jest src/modules/order/domain/moderation/request-moderation.spec.ts` | **57 passed** | the policy and error catalogue changed |
| 2 | `… jest src/modules/order/presentation/admin-custom-request-moderation.contract.spec.ts` | **10 passed** | the published request/response schemas changed |
| 3 | `… jest src/modules/order/tests/integration/digitizing-transition.integration.spec.ts` | **23 passed** | the new B06 suite |
| 4 | `… jest src/modules/order/tests/integration/moderation-transition.integration.spec.ts` | **23 passed** | the delivered APP5-B05 endpoint suite — the widening must not have disturbed it |
| 5 | `pnpm --filter @embroidery/api exec tsc --noEmit` | clean | API source changed |
| 6 | `pnpm --filter @embroidery/api openapi:generate` | 65 / 71 / 148 | the request enum changed |
| 7 | `pnpm --filter @embroidery/api openapi:check` | up to date | contract drift gate |
| 8 | `pnpm --filter @embroidery/api-client generate` | 2 files, tree hash `48e51aeb…` | after an OpenAPI change |
| 9 | `pnpm --filter @embroidery/api-client check:generated` | up to date | generated-client drift gate |
| 10 | `pnpm --filter @embroidery/api-client exec tsc --noEmit` | clean | the generated client changed |
| 11 | `pnpm --filter @embroidery/admin exec tsc --noEmit` | clean | the generated enum it consumes widened |
| 12 | `npx eslint` over the eight touched API paths | clean | scoped lint |
| 13 | `npx prettier --check` over every changed file | clean | scoped format |
| 14 | `node tools/check-file-size.mjs` | see §11.2 | touched source/test files |
| 15 | `git diff --cached --check` | clean | whitespace |

### 11.1 Reruns and what justified each

| Command | Runs | Justification for the rerun |
|---|---|---|
| policy unit suite (#1) | 3 | run 1 after the policy/error/spec edits; run 2 after trimming the `REQUIREMENT_OF` comment block; run 3 after a second comment-only trim — the file's bytes changed each time, so a prior pass no longer covered the input |
| B06 integration suite (#3) | 3 | run 1 failed on a shared-fixture collision (`seedRequest` derives its contact value and category slug from the leading characters of a UUIDv7, and rows created in the same millisecond collide on `uq_customer_contact_points__kind_value__verified` / `uq_categories__slug`); run 2 failed on the same collision at the category; run 3 green after the offending test was restructured to issue four refused commands against **one** request instead of seeding four |

No other command was rerun on unchanged inputs.

### 11.2 Not run, deliberately

Per §13 and §15, and because their owned source did not change:

- **`APP5-B05`'s race suite** (`moderation-race.integration.spec.ts`) — B06
  changed no repository or adapter lock semantics, no `expectedFrom` handling and
  no transaction boundary. The use case and the Drizzle repository carry a
  **zero-line diff**. Focused transition integration is therefore sufficient, and
  the new suite still proves the `expectedFrom` pin for the new target directly.
- B05 quotation accept/reject suites, the CC-05/CC-06/CC-16 races, the full
  quotation module, the full customer module, the full order module, the full API
  regression, the full repository suite, Admin/Storefront frontend suites, the
  worker, Playwright/E2E, the DB manifest/fingerprint/checksum/index suites, the
  Figma checker, the historical APP3/APP4/APP5 gate sweeps and SonarQube.

One full-API `jest` run was started by mistake while chaining shell commands and
was stopped immediately; it contributed no evidence and none is claimed from it.

### 11.3 File-size result

`node tools/check-file-size.mjs` reports 75 pre-existing repository-wide
hard-limit violations, all in `tools/*.mjs` and none in a file this checkpoint
touched. Two of this checkpoint's files sit above the **review threshold** (not
the hard limit):

| File | Lines | Threshold | Hard limit |
|---|---|---|---|
| `request-moderation.policy.ts` | 313 | 300 | 400 |
| `request-moderation.spec.ts` | 528 | 500 | 600 |

Both are single-responsibility files — one policy, one proof of that policy —
and splitting either by line count is the arbitrary split `CLAUDE.md` §6
forbids. The policy file's added prose was trimmed twice to keep it as close to
the threshold as the reasoning allows. Flagged for review, not silently left.

The B06 integration proof was placed in its own file
(`digitizing-transition.integration.spec.ts`, 381 lines) rather than appended to
the 464-line APP5-B05 suite, which would have pushed that file past the 600-line
test hard limit.

---

## 12. Acceptance evidence against §12

| # | Requirement | Evidence |
|---|---|---|
| 1 | `adminCustomRequest_transition` unchanged | contract suite `publishes exactly two mutations, under the B04 domain, with no id reissued`; OpenAPI operationId delta `[]` |
| 2 | zero new HTTP operations | 65 paths / 71 operations before and after; path delta `[]` |
| 3 | `toStatus` gains exactly `DIGITIZING` | contract suite `offers the four APP5 targets plus DIGITIZING…`; artifact diff shows one added enum member in two schemas |
| 4 | four system-owned APP6 targets uncommandable | contract suite `keeps the four system-owned APP6 states out of the published command enum`; policy suite `refuses the four system-owned APP6 targets from every source state`; integration `still refuses the system-owned target %s at the schema boundary` (400) |
| 5 | all eight APP5 edges unchanged | policy suite `leaves all eight delivered APP5 edges exactly as APP5-B05 left them` (set difference over the whole state space); the delivered B05 integration suite green at 23 |
| 6 | exactly one new legal edge | same test — delta is `['QUOTE_ACCEPTED->DIGITIZING']` |
| 7 | a real `QUOTE_ACCEPTED` request reaches `DIGITIZING` | integration `moves QUOTE_ACCEPTED -> DIGITIZING with nothing at all` — 200, root row `DIGITIZING` |
| 8 | transition row records Admin actor + real correlation | integration `records an ADMIN actor, a real correlation id and neither reason text` |
| 9 | GRD-005 refuses genuine pre-acceptance with `QUOTE_NOT_ACCEPTED` | integration, 4 source states, plus `refuses the same request however fully the operator justifies it` |
| 10 | stale source-state protection correct | integration `pins the source state it judged…` (`expectedFrom: 'QUOTE_ACCEPTED'`); `refuses a repeat, leaving exactly one transition row` |
| 11 | no outbox / notification | `{ outbox: 0 }` on every B06 assertion; `MODERATION_EVENT_OF.DIGITIZING === undefined`; policy suite `notifiesCustomer('DIGITIZING') === false` |
| 12 | no quotation / acceptance mutation | `downstream()` before/after equality across `quotations`, `quotation_versions`, `quotation_acceptances` |
| 13 | no design / order / payment / inventory / production effect | same comparison across `design_versions`, `approval_snapshots`, `orders`, `payment_obligations` |
| 14 | no migration | no file under `packages/database/migrations` changed; `git status` §14 |
| 15 | B07 not started | no design-session read, no design version, no new module |

---

## 13. Files changed

| File | Change |
|---|---|
| `apps/api/src/modules/order/domain/moderation/request-moderation.policy.ts` | `DIGITIZING` added to the target list; `QUOTE_ACCEPTED: ['DIGITIZING']`; `PRE_ACCEPTANCE_STATES`; the `DIGITIZING` requirement row; `QUOTE_NOT_ACCEPTED` verdict; `notifiesCustomer` made exhaustive |
| `apps/api/src/modules/order/domain/moderation/request-moderation.errors.ts` | `QUOTE_NOT_ACCEPTED` failure + `409` response; header rule narrowed to *unreleased* APP6 capabilities |
| `apps/api/src/modules/order/application/moderation/request-moderation.recorder.ts` | `MODERATION_EVENT_OF.DIGITIZING = undefined` + why |
| `apps/api/src/modules/order/presentation/schemas/admin-custom-request-moderation.request.ts` | doc only — what the widened enum publishes and what it still refuses |
| `apps/api/src/modules/order/presentation/admin-custom-request-moderation.controller.ts` | doc only — operation and `409` descriptions |
| `apps/api/src/modules/order/domain/moderation/request-moderation.spec.ts` | extended: `B06_EDGES`, the additive-delta proof, the GRD-005 verdict partition, `DIGITIZING` reason/note semantics, the error-catalogue rules |
| `apps/api/src/modules/order/presentation/admin-custom-request-moderation.contract.spec.ts` | widened target assertion + a new system-owned-state exclusion test |
| `apps/api/src/modules/order/tests/integration/moderation-transition.integration.spec.ts` | the APP6-target boundary case narrowed from five states to the four system-owned ones; header cross-reference |
| `apps/api/src/modules/order/tests/integration/digitizing-transition.integration.spec.ts` | **new** — 23 cases |
| `packages/contracts/openapi/openapi.generated.json` | generated |
| `packages/api-client/src/generated/embroidery-api.schemas.ts` | generated |
| `packages/api-client/src/generated/embroidery-api.ts` | generated |
| `docs/implementation/phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md` | B06 status, B07 marked next, status block |
| `docs/implementation/reports/APP6-B06-COMPLETION-REPORT.md` | **new** — this file |

`SCOPED_COMMAND_INDEX.md` was **not** modified: B06 added no new scoped
command. Every command in §11 is an already-indexed entry
(`CMD-OPENAPI-GENERATE`, `CMD-OPENAPI-CHECK`, `CMD-API-CLIENT-GENERATE`,
`CMD-API-CLIENT-CHECK`, `CMD-CHECK-FILE-SIZE`) or a direct package-scoped
`jest`/`tsc`/`eslint`/`prettier` invocation. No root script was added.

---

## 14. Scope guard

Not implemented and not started: `APP6-B07` submitted-design read, design
session/document retrieval, design version authoring, send-for-review, customer
design review or approval, quotation changes, customer cancellation, any further
lifecycle endpoint, Admin or Storefront UI, schema migration, new event
vocabulary, and any order/payment/inventory/production work.

No dependency was added.

---

## 15. Follow-ups

| Id | Status | Owner | Note |
|---|---|---|---|
| `FU-APP6-B05-AGG14-LOCK-ORDER-01` | `OPEN` | `APP6-X01` | documentation-only; carried unchanged, out of B06 scope |
| `FU-APP6-B05-B04-FROZEN-SURFACE-DRIFT-01` | `CLOSED_ON_ARRIVAL` | — | carried as closed |
| `FU-APP6-B06-POLICY-FILE-REVIEW-THRESHOLD-01` | `OPEN` (nonblocking) | `APP6-X01` | `request-moderation.policy.ts` at 313 lines and `request-moderation.spec.ts` at 528 sit above the review thresholds (§11.3). Both are under their hard limits and single-responsibility; a split, if any, is a review decision, not a line-count one |

All previously carried B01–B04 and APP3-era nonblocking / frozen-surface items
are untouched.

---

## 16. Commit

```text
COMMIT = <recorded below>
BRANCH = production
PUSHED = no
```

---

## 17. Verdict

```text
APP6-B06 = COMPLETE
TR-LC11-07 = DELIVERED
GRD-005 = ENFORCED, NO OVERRIDE
NEW HTTP OPERATIONS = 0
NEW COMMANDABLE EDGE COUNT = 1
DATABASE MIGRATION = NONE
B07 = NOT STARTED
NEXT CHECKPOINT = APP6-B07
```
