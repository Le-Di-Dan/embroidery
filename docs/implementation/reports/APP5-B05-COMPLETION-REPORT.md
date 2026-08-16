# APP5-B05 — Admin Moderation Notes & Guarded Transitions — Completion Report

**Date:** 2026-08-16 · **Branch:** `production` · **HEAD at entry:** `9c00713`
**Checkpoint type:** backend (Admin mutation). No migration, no Figma change, no
worker change, no frontend.

---

## 1. Verdict

```text
APP5-B05 = COMPLETE
```

No blocker was met. Every §19 hard-blocker condition was checked and none held:
the repository composes root + transition + note + outbox in one transaction
(§5), the canonical lifecycle and `APP5-G01` agree (§7), the notification
consequence is the existing outbox and needs no new architecture (§9), and the
schema persists both reason texts without a column being added (§6).

---

## 2. Baseline

| | |
|---|---|
| Entry HEAD | `9c00713` — *feat(app5): read the admin request queue and one request* |
| Predecessors | `R00`, `G01`, `D01`, `B01`, `DB01`, `B02`, `B03`, `B04` = COMPLETE |
| B04 surface at entry | `GET /api/admin/custom-requests` (`adminCustomRequest_list`), `GET /api/admin/custom-requests/{requestId}` (`adminCustomRequest_detail`) |
| Published document at entry | **54 paths / 59 operations / 126 schemas** |

---

## 3. Endpoints

Two, and no third.

| Method | Path | Operation id | Success |
|---|---|---|---|
| `POST` | `/api/admin/custom-requests/{requestId}/moderation-notes` | `adminCustomRequest_appendNote` | `201` · `MODERATION_NOTE_APPENDED` |
| `POST` | `/api/admin/custom-requests/{requestId}/transitions` | `adminCustomRequest_transition` | `200` · `CUSTOM_REQUEST_TRANSITIONED` |

Both sit behind `AuthenticatedAdminGuard` (controller level) plus
`StaffOriginGuard` and `StaffJsonBodyGuard` (handler level) — the exact
combination every Admin mutation in this repository already uses.

There is **no route per transition** (`/reject`, `/cancel`, `/clarify`,
`/review`): five endpoints doing one thing each would put the lifecycle in the
URL space, where every future state demands another path and no single handler
can enforce the subset. There is no `PUT`, `PATCH` or `DELETE` on a note, and no
route that addresses a single note at all — append-only is a property of the
surface, not a convention the handler observes.

### 3.1 One published domain, two controller classes

`AdminCustomRequestController` (B04, reads) and
`AdminCustomRequestModerationController` (B05, writes) both map to the
`adminCustomRequest` domain key in `apps/api/src/openapi/operation-id.ts`. Two
classes because B04's module deliberately does **not** import the AGG-13 write
repository, so a read route cannot reach `transition()`; one domain key because a
module-boundary decision must not name a public identifier. **B04's two accepted
operation ids are byte-identical to what it published** — proved by
`admin-custom-request-moderation.contract.spec.ts` and by the artifact diff in
§13.

---

## 4. Transition matrix

Implemented exactly `APP5-G01` §2's subset, as an application-layer restriction
above the persistence GRD-019 guard (`G01-D07`).

| From → To | TR | Internal reason | Customer-visible reason | Moderation note | Outbox |
|---|---|---|---|---|---|
| `NEW` → `UNDER_REVIEW` | TR-LC11-02 | optional | **forbidden** | optional (any kind) | none |
| `NEEDS_CLARIFICATION` → `UNDER_REVIEW` | TR-LC11-04 | optional | **forbidden** | optional (any kind) | none |
| `UNDER_REVIEW` → `NEEDS_CLARIFICATION` | TR-LC11-03 | **required** | **required** | **required**, `CLARIFY` | `request.clarification-requested` (SE-004) |
| `UNDER_REVIEW` → `REJECTED` | TR-LC11-10 | **required** | **required** | **required**, `REJECT` \| `SPAM` | `request.rejected` (SE-012) |
| `NEEDS_CLARIFICATION` → `REJECTED` | TR-LC11-10 | **required** | **required** | **required**, `REJECT` \| `SPAM` | `request.rejected` (SE-012) |
| `NEW` \| `UNDER_REVIEW` \| `NEEDS_CLARIFICATION` → `CANCELLED` | TR-LC11-11 | **required** | **required** | optional (any kind) | `request.cancelled` (SE-012) |

Eight edges, and the unit suite enumerates the **whole 10 × 10 state space** to
prove those eight and no others are permitted, that each is also legal in the
canonical LC-11 graph (never wider), and that cancellation is bounded to the
three pre-quotation states `ADR-DB3-002` stage S1 can reach (`G01-D06`).

### 4.1 APP6+ targets

`QUOTED`, `QUOTE_ACCEPTED`, `DIGITIZING`, `DESIGN_REVIEW` and `APPROVED` are
refused **twice over**: the published `toStatus` enum carries four values, so one
of them is a `400` before the request row is read, and the policy returns
`INVALID_TRANSITION` for every one of them from every source state even if the
schema were bypassed. The canonical enum in
`domain/lifecycle/request-transitions.ts` is untouched — B04 still reads a
`QUOTED` request truthfully, and APP6 still owns the transitions into it.

### 4.2 The one design question B05 was asked to settle

`APP5-D01` §10.5 recorded that the moderation dialogs treat the internal reason
and the customer-visible text as **two separate required fields** on
`NEEDS_CLARIFICATION`, `REJECTED` and `CANCELLED`, while `APP5-G01` §2 marks only
`reason` as required, and asked B05 to confirm or correct it.

**Confirmed, and implemented as the design drew it.** The design is not adding a
requirement G01 lacks; it is naming the second half of one G01 already implies.
G01 §8's own closing line — *"reason text carried to a customer is
`cancelled_customer_reason` / `customer_visible_reason`, never the internal
`reason`"* — makes a customer-facing text a *distinct* value from the audited
one, and SE-004/SE-012 are the rows that carry it. A `NEEDS_CLARIFICATION` with
no customer-visible reason would emit an event whose whole purpose is to explain
something to a customer, carrying nothing to explain it with; a `REJECTED` or
`CANCELLED` the same. So both are required on exactly the three targets that
notify, and neither is derived from the other.

The converse is enforced too and is not in the design's words: on the two
`UNDER_REVIEW` moves a customer-visible reason is **refused**
(`TRANSITION_CUSTOMER_REASON_NOT_ALLOWED`) rather than dropped. Those moves have
no SE row, so the text would have no delivery — and `APP5-B03`'s projection would
still show it as the explanation of a state the customer was never told about.
Silently discarding an operator's words is how they come to believe the customer
read them.

### 4.3 Note kinds

`CLARIFY`, `REJECT`, `SPAM`, `NOTE`. TBL-041's fifth kind `PAUSE` is **not
exposed**: the column keeps it and the CHECK still accepts it, but APP5 has no
transition that pauses anything, so offering it would let an operator record a
decision the lifecycle cannot carry out. Same class of decision as `G01-D14`'s
treatment of the `ATTACHMENT` asset role.

---

## 5. Atomic write map

One transaction, opened by `TransitionCustomRequestUseCase`, closed on commit.

| Step | Owner |
|---|---|
| Read current state | `CustomRequestRepository.findById` — the state the command is judged against |
| APP5 policy validation | `domain/moderation/request-moderation.policy.ts` — subset, reason matrix, note-kind compatibility |
| Row lock + stale check | `DrizzleCustomRequestRepository.transition` — `SELECT … FOR UPDATE`, then `expectedFrom` comparison |
| Lifecycle validation (GRD-019) | `isLegalRequestTransition`, under that same lock |
| Root update (+ `cancelled_reason` / `cancelled_customer_reason` on `CANCELLED`) | `DrizzleCustomRequestRepository.transition` |
| Transition append (TBL-042) | `DrizzleCustomRequestRepository.transition` — one write with the root update |
| Note append (TBL-041) | `CustomRequestRepository.appendModerationNote` |
| Outbox fact | `RequestModerationRecorder` → `OutboxEventStore.append` |
| Correlation | `RequestContextService.requireRequestId()` — this request's id, never a constant |
| Actor | `RequestContextService.requireAuthenticatedActor()` via `moderation-actor.ts` |

Every one of §5's impossible partial states is impossible because of that
boundary and nothing else: status changed without its note, transition appended
without a root update, customer-visible reason surviving a rolled-back move,
outbox fact for a rolled-back transition. There is no `try`/`catch` inside the
transaction that could swallow one and let the rest commit — the integration
suite asserts `{transitions: 0, notes: 0, outbox: 0}` after every refusal.

**No external call inside the transaction (INV-23).** `RequestModerationRecorder`
writes one row and returns; it imports no provider, no notification module and no
delivery code. Delivery is after-commit and is a later consumer's work
(`G01-D05b`), so a delivery failure cannot roll back request state — delivery
cannot begin until this transaction has already committed.

---

## 6. Reason semantics

```text
internalReason  !=  customerVisibleReason
```

They are separate parameters, separate columns and separate response fields for
their whole journey, and nothing anywhere copies one into the other.

| Target | Internal lands on | Customer-visible lands on |
|---|---|---|
| `NEEDS_CLARIFICATION`, `REJECTED` | `custom_request_transitions.reason` | `custom_request_transitions.customer_visible_reason` |
| `CANCELLED` | `custom_requests.cancelled_reason` (COL-TBL037-08) **and** the transition row | `custom_requests.cancelled_customer_reason` (COL-TBL037-09) **and** the transition row |

The two root columns are written **only** by a cancellation — the `set` clause
spreads them conditionally on `to === 'CANCELLED'` — so a rejection's text can
never land in the field that explains a cancellation. `APP5-B03`'s and
`APP5-B04`'s projections both already prefer those columns on `CANCELLED` and
fall back to the transition row, so B05 satisfies both readers by writing both.

**No copy is possible in the outbox path either.** `RecordModerationInput` has
one reason member, named `customerVisibleReason`, and the internal text is not a
parameter of any method on the recorder. A call site cannot pass it by mistake.

**Proved.** The integration suite uses two deliberately different strings for
every transition and asserts, after a real mutation: the transition row carries
each in its own column; the outbox payload contains the customer's and
`not.toContain` the internal one; the B04 detail returns both as distinct fields;
and the B03 read (§8) contains the customer's and neither the internal reason nor
the note text.

---

## 7. Note semantics

- **Append-only.** No update method, no delete method, no note id on the way in,
  and no HTTP route that addresses a single note — `PUT`, `PATCH` and `DELETE`
  under `/moderation-notes/{n}` are `404` because no handler exists, and the
  published document contains exactly one `/moderation-notes` path with exactly
  one method. TBL-041 has no `updated_at` and DB4 marks it append-only (CST-098);
  a changed decision is a new note.
- **Kinds:** `CLARIFY`, `REJECT`, `SPAM`, `NOTE` (§4.3).
- **Actor derived server-side.** The Admin id comes from the actor
  `AuthenticatedAdminGuard` bound from the session cookie. Sending `adminId` in
  the body is a `400` (`.strict()`), not a value that is ignored.
- **Ordering server-derived.** `id` is a `generatedAlwaysAsIdentity` bigint and
  **is** the append sequence (IDX-137); `created_at` is the database's clock. The
  insert names neither, and the receipt reports the returned row.
- **A note-only append creates no transition row and no outbox event** — asserted
  directly, and structurally guaranteed by `AppendModerationNoteUseCase` holding
  no recorder and reaching the repository through one method.

---

## 8. Concurrency

`moderation-race.integration.spec.ts` — one real PostgreSQL race, run **once**,
deterministically, against three independently pooled connections.

**Setup.** A request at `UNDER_REVIEW`. A third connection takes the row lock
first and holds it. Both moderators then start their real transactions through
the real use case: each reads the current state (an unblocked `SELECT`, so both
observe `UNDER_REVIEW`), and each blocks on `SELECT … FOR UPDATE`. The suite
waits for a **real condition** — two ungranted locks in `pg_locks` — rather than
for a duration, then releases the holder.

**Mechanism.** The arbiter is the row lock plus a comparison performed under it.
`TransitionRequestInput.expectedFrom` carries the state the caller judged the
command against; when the locked row no longer holds it, the caller's validation
— which reason texts were required, which note kind explained the move — was
performed against a state the request has left, and the move is refused rather
than silently re-applied from wherever the request ended up. Without it the loser
would succeed: `NEEDS_CLARIFICATION → REJECTED` is itself a legal APP5 edge, so
GRD-019 alone would let a rejection formed against `UNDER_REVIEW` land on a
request that had already moved.

`expectedFrom` is **entirely server-side**. The client sends no `fromStatus`, no
version and no token — the schema refuses all of them — so it can neither weaken
the guard by omitting a field nor turn it into permission for a move the policy
forbids. There is no in-process mutex anywhere in the moderation path.

**Result.**

| Assertion | Value |
|---|---|
| Fulfilled attempts | **1** |
| Rejected attempts | **1**, with `failure = REQUEST_TRANSITION_STALE` (`409`) |
| `custom_request_transitions` rows | **1**, `from_status = UNDER_REVIEW` |
| `request_moderation_notes` rows | **1**, the winner's kind |
| `outbox_events` rows | **1**, the winner's event type |
| `custom_requests.status` | the winner's target |

Which of the two wins is left to the database and is never asserted. The loser's
required note and outbox fact rolled back with its transition, which is the
atomicity claim of §5 observed under contention rather than in sequence.

Corroboration from the approved design: `FIG-APP5-A02-MODERATION-CONFLICT`
(`670:104`, *"Stale Transition Conflict"*) is an approved A02 state, so the
refusal this checkpoint mints is the one the screen was drawn to show.

---

## 9. B04 interoperability (§11)

One focused test. No B04 suite was re-run.

```text
POST …/transitions  UNDER_REVIEW → NEEDS_CLARIFICATION (+ CLARIFY note)
  → GET /api/admin/custom-requests/{requestId}
```

| Read back | Value |
|---|---|
| `status` | `NEEDS_CLARIFICATION` |
| `transitions` | 1 entry — `UNDER_REVIEW → NEEDS_CLARIFICATION`, `actorKind: ADMIN`, `actorAdminId` = the session's admin |
| `transitions[0].internalReason` / `.customerVisibleReason` | both present, **different values** |
| `moderationNotes` | 1 entry — `kind: CLARIFY`, the exact text appended |
| `internalReason` / `customerVisibleReason` (root) | both present and distinct |

---

## 10. B03 interoperability (§12)

One focused parameterised test over all three notifying targets. No B03 suite was
re-run.

```text
POST …/transitions  → NEEDS_CLARIFICATION | REJECTED | CANCELLED
  → ReadGrantScopedRequest (real APP4 secure-link admission, real peppered digest)
```

For each: `outcome === 'READ'`, the serialized view **contains** the
customer-visible reason and **does not contain** the internal reason or the
moderation-note text.

That absence is structural as well as asserted: `GrantScopedRequestView` has no
`internalReason` and no `moderationNotes` member, so the customer projection
cannot express either. The grant is resolved by the production path — a real
`ACTIVE` `REQUEST_ACCESS` row whose digest was computed with the same peppered
HMAC the resolver uses — not by a stub.

---

## 11. Focused tests

| Suite | Kind | Tests |
|---|---|---|
| `domain/moderation/request-moderation.spec.ts` | unit, Docker-free | 36 |
| `presentation/admin-custom-request-moderation.contract.spec.ts` | contract, Docker-free | 9 |
| `tests/integration/moderation-note.integration.spec.ts` | integration | 12 |
| `tests/integration/moderation-transition.integration.spec.ts` | integration | 24 |
| `tests/integration/moderation-race.integration.spec.ts` | concurrency | 1 |
| **Total** | | **82** |

The integration harness boots the **real** `AuthenticatedAdminGuard`, the real
moderation module, the real B04 read module and the real B03 reader against one
disposable database. Nothing is overridden and no guard is stubbed. Unlike the
B04 harness, moderation evidence is never seeded by raw SQL: the transitions and
notes under test are produced by the routes under test. Peppers and the envelope
key are synthetic values generated per run; **no `.env` file was read, written or
consulted, and no credential was rotated** (`CLAUDE.md` §8a).

---

## 12. Validation ledger

| Command | Impact reason | Result | Reruns |
|---|---|---|---:|
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="request-moderation"` | B05 policy + error mapping | **PASS** — 36 tests | 1 (first run failed on a non-exported runtime tuple; restated locally with a `satisfies` exhaustiveness proof) |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="moderation-note.integration"` | Note append surface | **PASS** — 12 tests | 1 (first run: error envelope field name, and three eagerly-constructed supertest requests) |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="moderation-transition.integration"` | Transition surface + §11 + §12 | **PASS** — 24 tests | 0 |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="moderation-race.integration"` | §6 real PostgreSQL race | **PASS** — 1 test | 0 |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="admin-custom-request-moderation.contract\|admin-custom-request.contract"` | Published contract, before the generation slot | **PASS** — 19 tests | 1 (first run: platform-added `500`, and a schema-name regex that caught B04's components) |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="moderation" --runInBand` | Final confirmation of all five B05 suites together | **PASS** — 82 tests, 5 suites | 0 |
| `pnpm --filter @embroidery/api typecheck` | API source and tests changed | **PASS** | 2 (unused import; two `unknown` supertest bodies) |
| `pnpm --filter @embroidery/api openapi:generate` | Two operations added | **PASS** — 56 paths / 61 operations / 130 schemas | 0 |
| `pnpm --filter @embroidery/api-client generate` | The client must carry the two new operations | **PASS** — 2 files, tree hash `8bed4113…` | 0 |
| `pnpm --filter @embroidery/api openapi:check` | Committed artifact must not drift | **PASS** | 0 |
| `pnpm --filter @embroidery/api-client check:generated` | Generated client must not drift | **PASS** | 0 |
| `pnpm --filter @embroidery/api-client typecheck` | The client changed | **PASS** | 0 |
| `npx eslint <16 changed API/test paths>` | Changed files only | **PASS** | 1 (one unused type import, fixed) |
| `npx prettier --write <21 changed paths>` | Changed files only | **PASS** | 0 |

Generation was run **once** for each artifact, after the contract was frozen by
the two Docker-free contract suites, and was not re-run after any
implementation-only change.

**Confirmed not run**, per §14: the B01 submission/race suite, the B02
upload/quota/cleanup suite, the full B03 suite, the full B04 suite, the DB01
suites, full API integration, full Jest, the worker suite, Playwright/E2E,
frontend tests, full DB regression, SonarQube, all-workspace build/typecheck, and
the three named stale surface gates (`tools/check-app3-p03.mjs`,
`tools/check-app4-b05.mjs`, `tools/check-app4-b06-contract.mjs`). No stale
operation-count gate was repaired. `pnpm quality` does not exist and was not run.

### 12.1 One older assertion reconciled, not relaxed

`admin-custom-request.contract.spec.ts` (B04) asserted *"adds no mutation route
anywhere under the Admin request path"*, which was correct for B04 and is exactly
what this checkpoint makes stale. It is now an **allowlist**: B04's two paths
still carry `get` and nothing else (asserted separately and unchanged), and the
only writes anywhere under the prefix are B05's two, named literally. A third
mutation, a note edit, a note delete or a per-transition route would all fail it.
This is the same class of reconciliation `APP4-B06` recorded — publishing a route
forces every older checker that froze the surface to be revisited — and it is the
only pre-existing assertion B05 touched.

---

## 13. OpenAPI / client

| | Before | After |
|---|---|---|
| Paths | 54 | **56** |
| Operations | 59 | **61** |
| Schemas | 126 | **130** |

Generation counts: OpenAPI **1**, api-client **1**, freshness checks **1** each,
client typecheck **1**.

**Operation delta against `HEAD`, computed from the artifacts:**

```text
removed: []
added:   [ adminCustomRequest_appendNote, adminCustomRequest_transition ]
```

No accepted operation was deleted or reissued.

**No server-owned field is accepted.** The contract suite asserts that neither
body publishes `fromStatus`, `adminId`, `customerId`, `actorKind`, `actor`,
`correlationId`, `requestId`, `sequence`, `createdAt`, `occurredAt` or
`timestamp`, and that both carry `additionalProperties: false` — so an unlisted
field is refused rather than ignored. It also asserts `toStatus` publishes exactly
the four APP5 targets, `kind` exactly the four APP5 note kinds, and that no B05
component names a credential (`tokenHash`, `storageKey`, `bucket`, `secretHash`,
`idempotencyKey`, `grantToken`, …) or an APP6 state.

---

## 14. B04 asset-delivery follow-up (§20)

`FU-APP5-B04-COP-ASSET-DELIVERY-01` is **not solved here and is not closed.**

**Does the approved A02 design require actually opening or rendering those
images?** **Yes** — for the customer-owned-product branch it is unavoidable.

*What was inspected, and what was not.* The Figma MCP server is unauthenticated
in this session, so the live canvas was **not** opened. The inspection is of the
approved authority as this repository records it: the fifteen
`FIG-APP5-A02-*` rows in `docs/design/FIGMA_DESIGN_INDEX.md` §4.11 (all
`APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP5-D01-PO-001`) and the
`APP5-D01` completion report, whose frame index was generated from the live node
tree rather than transcribed. Whoever executes the new checkpoint should still
open `665:115` before building.

The conclusion does not rest on a pixel, though. `APP5-G01` §6 and `G01-D10`
argue it directly: a customer-owned garment *"has no catalog media, no design
session and no design document; without a photograph, **nothing in the record
describes the physical object an Admin is asked to triage**"* — which is why
`COP_IMAGE ≥ 1` is an invariant at intake. `FIG-APP5-A02-DETAIL-DESKTOP-COP`
(`665:115`) is the frame where that object is triaged, and B04's detail publishes
attachment **metadata only** (id, role, MIME, size, state) with no binary route
(B04 §9.4). An operator cannot decide `REJECTED` versus `NEEDS_CLARIFICATION` on
a photograph they are told the size of.

**Routed, not left to the frontend.** A new narrow backend checkpoint is inserted
**before** `APP5-A02`:

```text
APP5-B06 — Admin private request-asset delivery
  one authorized Admin binary route for a request-bound asset
  (COP_IMAGE / REFERENCE), behind AuthenticatedAdminGuard, streamed
  through the API; no presigned URL, no storage credential, no key
  disclosure (IMP-D048, 09-SECURITY §4/§5)
```

The existing precedent to reuse is `APP3-B05A` / `APP3-B06C`'s private delivery
lane, not a new mechanism. `FU-APP5-B04-COP-ASSET-DELIVERY-01` stays **OPEN**,
now with a named owner.

The second B04 follow-up, `FU-APP5-B04-DESIGN-PREVIEW-01`, is unchanged and
remains an APP6-era decision.

---

## 15. Files changed

**New — runtime (9):**

```text
apps/api/src/modules/order/domain/moderation/request-moderation.policy.ts        224
apps/api/src/modules/order/domain/moderation/request-moderation.errors.ts        149
apps/api/src/modules/order/application/moderation/transition-custom-request.use-case.ts  204
apps/api/src/modules/order/application/moderation/append-moderation-note.use-case.ts      92
apps/api/src/modules/order/application/moderation/request-moderation.recorder.ts 103
apps/api/src/modules/order/application/moderation/moderation-actor.ts             37
apps/api/src/modules/order/presentation/admin-custom-request-moderation.controller.ts    265
apps/api/src/modules/order/presentation/schemas/admin-custom-request-moderation.request.ts  71
apps/api/src/modules/order/presentation/schemas/admin-custom-request-moderation.response.ts 102
apps/api/src/modules/order/custom-request-moderation.module.ts                    47
```

**New — tests (5):**

```text
apps/api/src/modules/order/domain/moderation/request-moderation.spec.ts                    328
apps/api/src/modules/order/presentation/admin-custom-request-moderation.contract.spec.ts   204
apps/api/src/modules/order/tests/integration/moderation-context.ts                         323
apps/api/src/modules/order/tests/integration/moderation-note.integration.spec.ts           167
apps/api/src/modules/order/tests/integration/moderation-transition.integration.spec.ts     456
apps/api/src/modules/order/tests/integration/moderation-race.integration.spec.ts           246
```

**Modified (8):**

```text
apps/api/src/bootstrap/app.module.ts                     — registers the module
apps/api/src/openapi/operation-id.ts                     — two CONTROLLER_DOMAIN_KEYS entries
apps/api/src/modules/order/domain/repositories/custom-request.repository.ts
      — expectedFrom precondition; appendModerationNote returns its sequence
apps/api/src/modules/order/infrastructure/persistence/drizzle-custom-request.repository.ts
      — stale guard; cancellation reason columns; note returning()
apps/api/src/modules/order/presentation/admin-custom-request.contract.spec.ts  — §12.1
packages/contracts/openapi/openapi.generated.json        — generated
packages/api-client/src/generated/embroidery-api.ts      — generated
packages/api-client/src/generated/embroidery-api.schemas.ts — generated
docs/implementation/phases/APP5-CUSTOM-REQUESTS.md       — roadmap
docs/implementation/reports/APP5-B05-COMPLETION-REPORT.md — this report
```

Every runtime file is ≤ 265 lines and every test file ≤ 456 — inside the
`CLAUDE.md` §6 limits, and only `moderation-transition.integration.spec.ts` is
past the 300/500 review threshold at all.

**No migration. No schema change. No Figma node created, read live or mutated. No
worker change. No frontend.**

---

## 16. Roadmap

```text
APP5-R00  = COMPLETE
APP5-G01  = COMPLETE
APP5-D01  = COMPLETE
APP5-B01  = COMPLETE
APP5-DB01 = COMPLETE
APP5-B02  = COMPLETE
APP5-B03  = COMPLETE
APP5-B04  = COMPLETE
APP5-B05  = COMPLETE
APP5-S01  = INCOMPLETE
APP5-S02  = INCOMPLETE
APP5-A01  = INCOMPLETE
APP5-B06  = INCOMPLETE   ← inserted by B05 (§14), before A02
APP5-A02  = INCOMPLETE
APP5-E01  = INCOMPLETE
APP5-X01  = INCOMPLETE
```

The eight-operation APP5 endpoint budget of `APP5-R00` §10.3 is now **fully
spent**: four public + four Admin. `APP5-B06` is an addition to that budget,
recorded here rather than absorbed silently, and it is the direct consequence of
a gap B04 found and named.

```text
NEXT CHECKPOINT: APP5-S01 — Request creation & submission
```

`APP5-B06` may be executed at any point before `APP5-A02`; it does not block
`S01`, `S02` or `A01`.

---

## 17. Residual risks

1. **`expectedFrom` is optional on the persistence contract.** Existing callers
   that omit it — only the DB7-era `custom-request.integration.spec.ts` fixtures
   today — keep the old behaviour of judging from the locked state alone. That is
   deliberate (a caller with no earlier read has nothing to defend), but a future
   moderation-like caller that forgets it gets no stale protection. The optional
   marker is documented at the field; a required marker would have rewritten
   unrelated suites for no safety gained.
2. **The outbox events have no consumer.** `request.clarification-requested`,
   `request.rejected` and `request.cancelled` are durable and unread, exactly as
   `G01-D05b` intends and exactly as `request.submitted` already is. They will
   accumulate as `PENDING` rows until a consumer exists (`IMP-O006` → APP12) or
   are drained by whatever the APP4 worker does with unknown event types — worth
   confirming at `APP5-X01` that an unrecognised type is left alone rather than
   dead-lettered.
3. **The stale refusal is not idempotent-friendly.** A losing operator gets a
   `409` and must reload and decide again; there is no "apply anyway" affordance
   and none should be added without design. `FIG-APP5-A02-MODERATION-CONFLICT` is
   the approved screen for it.
4. **`occurredAt` on the transition receipt is this process's clock**, while
   `custom_request_transitions.created_at` is the database's. They can differ by
   milliseconds. The receipt is a confirmation, not evidence — the audited value
   is the row's — but a client that treats the two as the same instant would be
   wrong.
5. **No rate limit on moderation.** An authenticated operator can append notes
   without bound. No authority sets a limit for staff mutations and APP1 has no
   role model, so none was invented; the 2000-character cap on each text is the
   only bound.

---

## 18. Commit

```text
feat(app5): moderate a custom request with notes and guarded transitions
```

Committed on `production`. **Not pushed.**

---

## 19. Stop

`APP5-B05` mutation implementation, focused evidence, generated artifacts,
roadmap, commit and this report are complete.

**STOP.** `APP5-S01` was not started. Private Admin asset delivery was not
implemented.
