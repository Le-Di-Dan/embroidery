# APP4-B08 — Admin Notification Delivery Operations and Manual Transport Replay — Completion Report

## A. Verdict

**PASS.**

Two Admin operations, and no third:

```text
GET  /api/admin/notification-intents                   adminNotificationIntent_list
POST /api/admin/notification-intents/{intentId}/replay adminNotificationIntent_replay
```

The published surface grew by exactly two operations, 50 → 52. The route is
`/replay`; no `/retry` exists anywhere in the document, the source or the
generated client.

**Both terminal records survive untouched.** The origin intent stays `FAILED`
and the dead-lettered outbox row stays `DEAD_LETTER` — asserted column for
column, including the attempt counter. Replay appends a **new** `PENDING`
notification intent and a **new** `PENDING` outbox event, exactly as DB3 §3
rule 2 prescribes and as `job_key = outbox event id` requires.

**The envelope is copied, never opened.** The source payload crosses the replay
as an opaque value and is handed straight to `append`. No B08 file imports
`@embroidery/notification-delivery` at all — not `openDeliveryEnvelope`, not
`sealDeliveryEnvelope`, not the codec — so there is no symbol in scope that could
decrypt or re-seal one. The integration proof is the IV: a re-seal mints a fresh
random one by construction, and the replay event's `iv`, `ciphertext` and
`authTag` equal the source's exactly.

**The source is found by linkage, never by content.** The terminal event is
resolved through `aggregate_kind = NOTIFICATION_INTENT`, `aggregate_id`, the
event type and `status = 'DEAD_LETTER'` — four indexed columns. Nothing queries
`payload`.

**Duplicates and concurrent replays collapse onto one.** The deterministic
`app4-manual-replay:v1:<origin>:<deadLetter>` SHA-256 key rides the existing
`intent_key` uniqueness, and a `FOR UPDATE` lock on the origin makes the loser
read what the winner committed. No new idempotency framework, no mutex.

**An unusable secret refuses with `REISSUE_REQUIRED`** and writes nothing. A
wrong intent state refuses with `REPLAY_NOT_APPLICABLE` instead — telling an
operator to mint a new credential for a `SATISFIED` notification would be
actively wrong.

No `BLOCKED_BY_AUTHORITY` condition was reached. In particular §52.1 does not
apply — a new `PENDING` intent needs no schema change — and §52.7 does not apply:
`APP4-W01` reads `aggregate_id` as the lifecycle target and the encrypted
`originNotificationIntentId` as lineage only, so a copied envelope is consumable
unchanged (§N).

**No full regression/test chain was run.**

---

## B. Entry state

| Fact | Value |
|---|---|
| P00 | `CLOSED_AFTER_MANDATORY_DIRECTIVE` |
| G01, D01, W01, B02–B07 | `PASS` |
| P01, B01 | `PASS_AFTER_C1` |
| Migrations | 34 (`NO_APP4_MIGRATION`) |
| OpenAPI at entry | 45 paths / 50 operations / 95 schemas — **measured**, not assumed |
| OpenAPI at exit | 47 paths / 52 operations / 99 schemas |
| Delta | +2 paths / **+2 operations** / +4 schemas |
| Migrations at exit | 34 — unchanged |

---

## C. Authority and repository audit

Recorded before any replay code was written (§5).

| # | Question | Finding |
|---|---|---|
| 1 | Intent states and transitions | `PENDING`, `PROCESSING`, `SATISFIED`, `FAILED`, `CANCELLED`. DB3 §1 enumerates TR-NTF-01…06; **there is no `FAILED → PENDING`**, and §3 rule 2 prescribes "manual resend = new intent, không reopen intent cũ" |
| 2 | Attempt outcomes and safe fields | `DELIVERED`, `FAILED_RETRYABLE`, `FAILED_TERMINAL`; safe columns `attempted_at`, `channel`, `outcome`, `error_class`. `provider_message_ref` exists and is always null in APP4 |
| 3 | Methods to list / read / lock an intent | **None.** The port had `findByIntentKey`, `countAttempts` and `claimBatch` only — no id read, no lock, no list, no timeline read |
| 4 | Idempotent create | `createIdempotent(input)` → `{ outcome: 'created' \| 'replay', intent }`, on `intent_key` uniqueness (CST-047), inserting `status: 'PENDING'` |
| 5 | Replay-origin trace | `CreateIntentInput.sourceOutboxEventId?: bigint` already exists (G-DB7-49, no FK, resolved at creation). **Usable as-is** |
| 6 | Outbox read capability | `listForAggregate` returns id / eventType / status — **no payload**, by design (diagnostic read) |
| 7 | Outbox append capability | `append(input)` — `@requiresTransaction`, validates the aggregate kind, returns the new `bigint` id |
| 8 | DEAD_LETTER immutability | The S24 column-scoped trigger (CST-098) makes `payload` immutable; the store offers no method that returns a `DEAD_LETTER` row to `PENDING` |
| 9 | Challenge eligibility fields | `findById` → `status` (`ISSUED`) and `expiresAt`. Sufficient |
| 10 | Grant eligibility fields | `findById` returns **no status**. Insufficient → needed a narrow read |
| 11 | Admin actor / audit API | `RequestContextService.requireActor()` + `AuditEventRepository.append`; `NOTIFICATION_INTENT` is already in `AUDIT_TARGET_KINDS` |
| 12 | Repository extensions required | Four, all narrow: intent `listForAdmin` / `findById` / `lockById` / `listAttempts`; outbox `listTerminalEventsForAggregate`; grant `findSummaryById` |
| 13 | Older checkers affected | `b04`, `b05`, `b06`, `b07` (operation count only) — see §Q |
| 14 | OpenAPI / client baseline | 45 / 50 / 95; client tree hash recomputed after regeneration |

---

## D. Admin list contract

`GET /admin/notification-intents`, filtered by an optional `status` drawn from
the closed intent state set, newest first, bounded server-side at 50.

There is deliberately **no** recipient, customer, template, provider or free-text
search parameter, no date range and no cursor. `.strict()` refuses an unknown
query key rather than dropping it: a caller who believes it filtered by recipient
and receives an unfiltered page is worse served than one that receives a 400.

The list is not paginated by cursor because no consumer has asked for one, and
inventing a pagination contract for `APP4-A01` would freeze it into every
generated client.

`Cache-Control: no-store`, from a named policy constant.

---

## E. Attempt timeline and privacy

Per intent: `intentId`, `status`, `channel`, `recipientMasked`, `templateKey`,
`templateVersion`, `createdAt`, `attempts[]`. Per attempt: `attemptedAt`,
`channel`, `outcome`, `errorClass`.

Ordering is `attempted_at` ascending with the append-only row id as the
tie-breaker. **No display ordinal is persisted** — a counter column would be a
second source of truth for something the ordering already says.

Absent, and each for its own reason: the normalized and raw recipient and the
contact-point id (`recipient_masked` was frozen at intake by the P01 masker
precisely so this screen could exist); `params` (secret-free, but still a
business identifier from which the next reasonable request is a lookup); the
envelope, ciphertext, IV, auth tag and outbox payload (the API never opens one,
so a field for it here is how the decrypt gets added later);
`provider_message_ref`, provider bodies, exception messages and stacks; and the
scheduler internals `next_attempt_at`, `claimed_by` and `attempt_count`.

There is also no `canReplay` flag. Whether a `FAILED` intent can actually be
replayed depends on the underlying challenge or grant still being live, which
this read does not check; a flag computed from status alone would be a confident
lie on exactly the rows an operator cares about. `APP4-A01` attempts the replay
and handles the canonical conflict.

---

## F. Manual replay transaction

One transaction, in this order:

1. **lock** the origin intent (`FOR UPDATE`, deliberately not `SKIP LOCKED`);
2. require `status = FAILED`, else `REPLAY_NOT_APPLICABLE`;
3. resolve the terminal source event through the non-secret linkage
   (`aggregate_kind`, `aggregate_id`, event type, `status = 'DEAD_LETTER'`);
4. require **exactly one**; zero or many → `REPLAY_SOURCE_UNAVAILABLE`;
5. read the typed reference from `params`; malformed → `REPLAY_SOURCE_UNAVAILABLE`;
6. check eligibility; ineligible → `REISSUE_REQUIRED`;
7. derive the locked replay key;
8. `createIdempotent` the replay intent — on `replay`, **return before appending
   or auditing anything**;
9. append one `PENDING` event with the copied payload and schema version,
   `aggregate_id` = the **new** intent;
10. audit;
11. commit.

`FOR UPDATE` rather than `SKIP LOCKED` is the load-bearing choice: the claim path
skips locked rows because a second worker should take different work, but two
Admins naming the same intent must **serialize** so the second sees what the
first committed. Skipping would let both proceed and append two deliveries for
one operator decision.

---

## G. Origin and new intent lifecycle

The origin intent is never written. The replay intent is new:

| Field | Value |
|---|---|
| `id` | new |
| `intent_key` | the derived replay key (CST-047 admits one row per key, so the origin's is unavailable) |
| `status` | `PENDING` |
| `template_key` / `template_version` / `channel` | copied |
| `recipient_masked` | copied — never re-derived from a contact row |
| `params` | copied, so the replay points at exactly the business object the original did |
| `recipient_contact_point_id` | copied when present |
| `source_outbox_event_id` | the source `DEAD_LETTER` event — the non-secret replay-origin trace on the existing no-FK field (G-DB7-49) |
| `correlation_id` | this request — truthfully, this request created this intent |

Zero delivery attempts at creation, so `countAttempts` gives the worker a clean
budget. This is also the only form that *functions*: a reopened intent would
re-enter delivery with its attempt count already at the limit and terminal-fail
on the first attempt.

---

## H. DEAD_LETTER preservation

The old event is not reset, reactivated, re-claimed or mutated in any column. Its
`status`, `attempt_count`, `next_attempt_at`, `claimed_by` and `last_error` are
asserted byte-identical after a replay.

The decisive reason is recorded in `APP4_PHASE_ENTRY_AUDIT` §C.8.3: `job_key`
**is** the outbox event id, so reusing that identity would collide with CST-049
`uq_background_job_attempts__kind_key_attempt` and destroy the monotonicity of
`(job_kind, job_key, attempt_no)`. A new event id yields a new `job_key` and an
attempt sequence starting at 1.

The B08 gate refuses `markDeadLetter`, `markFailed`, `markDelivered`,
`markDispatched`, `scheduleRetry`, `claimBatch` and `recordAttempt` in the replay
path, and refuses any `db.update` / `tx.update` or attempt-counter reference in
any B08 file.

---

## I. Replay idempotency and concurrency

The replay `intent_key` is `SHA-256(app4-manual-replay:v1:<originIntentId>:<deadLetterEventId>)`,
lowercase hex — the locked IMP-D049 PO-11 input, restated in
`manual-replay-key.ts` rather than shared with the business intent-key
derivation, because both live in one unique column and a change to one tuple must
not move the other.

Nothing else enters the key. The gate refuses a `Date`, `now`, `random`,
`adminId`, `requestId`, `nonce` or `uuid` component by name, and the unit suite
proves the two properties the whole mechanism rests on: the same pair always
yields the same key, and a different pair never does. No digest value is written
down anywhere — a test that pinned one would pass whether or not the input was
right.

**Sequential duplicate:** the second call returns the same `replayIntentId`, and
the database holds two intents, two events and **one** audit row.

**Concurrent duplicate:** two parallel HTTP calls, real PostgreSQL, both `200`
with the same `replayIntentId`; two intents, two events, one audit row; origin
`FAILED` and old `DEAD_LETTER` unchanged.

**Atomicity:** with `OutboxEventStore.append` rejecting once — injected at an
existing collaborator, with no production failure-injection infrastructure added
— the whole transaction rolls back: zero replay intents, zero replay events, zero
audit rows, both terminal records unchanged. A subsequent replay then succeeds,
proving the rollback left no half-claimed key behind.

---

## J. Verification-code eligibility

Replay is permitted only while the code can still be entered:

```text
challenge exists  ∧  status = ISSUED  ∧  expiresAt > now
```

`ISSUED` is the only answerable state — LC-02 offers no way back from `VERIFIED`,
`FAILED`, `EXPIRED` or `CANCELLED`, so a code behind any of them is dead whatever
its deadline says. Expiry is compared strictly (`>`), matching every other read in
the phase.

Refused: expired-by-time, `VERIFIED`, `CANCELLED`, `FAILED`, and missing. Each →
`409 / REISSUE_REQUIRED` with zero writes.

A missing challenge is `false` rather than a distinct error: an id that resolves
to nothing is as unusable as one that expired, and distinguishing them would make
this an existence oracle over the aggregate.

---

## K. Secure-grant eligibility

```text
grant exists  ∧  status = ACTIVE  ∧  expiresAt > now
```

Supersession needs no separate check: `APP4-B05` revokes the source row before
pointing it at its replacement, so a superseded grant is already `REVOKED`. The
suite proves that case explicitly, through the lineage pointer.

Refused: expired, `REVOKED`, superseded, and missing → `409 / REISSUE_REQUIRED`
with zero writes, and the grant table byte-identical afterwards.

The resolver reads **state**, never a stored secret: the gate refuses
`codeHash`, `code_hash`, `tokenHash`, `token_hash` and `findCodeDigest` in that
file. A narrow `SecureAccessGrantRepository.findSummaryById` was added because
`findById`'s read model carries no `status` — it returns the same digest-free
projection `listForCustomer` does, from a shared explicit column list.

---

## L. `REISSUE_REQUIRED` and the other refusals

| Code | Status | Meaning |
|---|---|---|
| `NOT_FOUND` | 404 | No such notification |
| `REPLAY_NOT_APPLICABLE` | 409 | The notification did not fail delivery — `PENDING`, `PROCESSING`, `SATISFIED` or `CANCELLED` |
| `REISSUE_REQUIRED` | 409 | The code or link it carries is no longer usable. **The routing signal** — go to B03 resend or B05 reissue |
| `REPLAY_SOURCE_UNAVAILABLE` | 409 | No single dead-lettered delivery record, or `params` that does not satisfy the B01 reference contract |

The boundary between the last three is the rule this checkpoint most had to get
right. `REISSUE_REQUIRED` is spent only on an ineligible **secret**: using it for
a `SATISFIED` intent would tell an operator to mint a new credential for a
customer who already received one, and using it for malformed persistence would
issue a real secret to paper over a bad row. The gate asserts the ineligible path
maps to it and that the state-conflict path does not.

---

## M. Envelope-copy and no-decrypt proof

**Structural.** No file in `NotificationAdminModule` imports
`@embroidery/notification-delivery`, and the module composes no
`DeliveryEnvelopeKeyProvider` — so the AEAD key is not even resolvable in this
dependency closure. The gate asserts the package import by exact specifier and
refuses `openDeliveryEnvelope`, `sealDeliveryEnvelope`, `createDecipheriv`,
`createCipheriv`, `digestSecret`, `createHmac` and both secret issuers in every
B08 file.

**Behavioural.** `payload` and `payloadSchemaVersion` are read from the source
event and passed to `append` unchanged, asserted inside the append call itself
rather than file-wide. The integration compares the replay event's `payload` to
the source's with `toEqual`, and each of `version`, `algorithm`, `iv`,
`ciphertext` and `authTag` individually. A re-seal cannot produce that: the codec
mints a fresh random 96-bit IV on every seal, so an identical IV **is** the proof
that nothing decrypted and re-encrypted.

The one SHA-256 in the B08 path is the non-secret replay key. It is not a
peppered HMAC over a credential and must not be confused with one.

---

## N. Fresh worker budget and W01 compatibility

Proven structurally, without running the worker:

- a **new outbox event id**, which is the worker's `job_key`;
- a **new replay intent id** as the event's `aggregate_id`;
- the replay intent has **zero** `notification_delivery_attempts` rows;
- `background_job_attempts` is empty for the new event;
- the origin's three attempt rows and the old event's `attempt_count` are
  unchanged.

**Recorded dependency.** This shape is consumable by delivered `APP4-W01`
unchanged because W01 reads the **outbox linkage** as the current lifecycle
target and treats the encrypted `originNotificationIntentId` as lineage only
(IMP-D049 PO-08, and the in-source comment on `OUTBOX_AGGREGATE_KINDS` that
anticipates exactly this divergence). **No worker production file was changed**,
and no W01 suite was run. A full replay-through-worker journey is `APP4-E01`'s.

---

## O. Replay audit

One `notification.delivery.replayed` event per successful replay:

```text
actor_kind = ADMIN
admin_id   = the authenticated session's account
target     = NOTIFICATION_INTENT / the ORIGIN intent id
summary    = { operation: MANUAL_TRANSPORT_REPLAY, replayIntentId, sourceOutboxEventId }
```

The target is the **origin**, because that is the id an operator was given; the
replay's id sits in the summary where it reads as a consequence.

The actor comes from `RequestContextService.requireActor()` and is refused unless
`kind === 'ADMIN'` — never from a body, and with no fallback, so an
unattributable replay fails rather than being filed against `SYSTEM`. Unlike
`SecureGrantAuditRecorder`, this recorder admits no other actor kind at all,
because there is no automatic path to this code.

The summary carries no recipient — not even the mask. `audit_events` outlives the
intent it describes (G-DB7-46), and a trail accumulating masked destinations
becomes a contact-adjacent dataset with a retention rule nobody chose. A refused
replay audits nothing; no bounded failure event was added, because no existing
Admin precedent requires one for a business conflict.

---

## P. OpenAPI and generated client

| Step | Command | Result |
|---|---|---|
| Generate | `pnpm --filter @embroidery/api openapi:generate` | 47 paths / 52 operations / 99 schemas |
| Check | `pnpm --filter @embroidery/api openapi:check` | up to date |
| Client generate | `pnpm --filter @embroidery/api-client generate` | 2 files, 3171 lines, tree hash `8f254b7e…` |
| Client check | `pnpm --filter @embroidery/api-client check:generated` | up to date |
| Client typecheck | `pnpm --filter @embroidery/api-client typecheck` | clean |

- Exactly **2** B08 operations; delta over B07 is **+2**.
- Both publish `security: [{ adminSession: [] }]`.
- New schemas (4): `AdminNotificationAttemptResponse`,
  `AdminNotificationIntentResponse`, `AdminNotificationIntentListResponse`,
  `NotificationReplayResponse`.
- New client symbols: `adminNotificationIntentList`,
  `adminNotificationIntentReplay`. **No `retry` symbol and no `/retry` path.**
- The replay request has no body: the origin id comes from the path and only the
  path.
- `409` is documented with all three codes; the list's `status` filter is the
  closed intent state set.
- No credential field in either generated file; no TanStack hook.
- Every prior operation id is unchanged.
- No generated file was hand-edited.

---

## Q. Older-checker reconciliation

| Gate | Cause | Action |
|---|---|---|
| `b01` | **Not affected.** 7 pre-existing failures, identical before and after (verified at `2780b03`) | Not touched |
| `w01` | Passes; unaffected | Not touched |
| `b02` | **Not affected by B08** — its `/customer/i` path filter does not match `/notification-intents`. Failure set identical to before this checkpoint | Not touched (§Q.1) |
| `b03` | Passes; its grant/secure-link bans do not match a notification path | Not touched |
| `b04`, `b05`, `b06`, `b07` | Frozen operation count only (50 → 52). No path ban matched | Count updated in each, with the history restated in the comment; the mutation test asserting the message updated to `expected 52` |

No path allowlist needed widening: B08's routes match none of the grant,
secure-link, verification or customer patterns those gates police. Every prior
invariant is preserved and re-proved — the `b04`/`b05`/`b06` mutation suites still
refuse an Admin grant issue route, a global grant listing, a public grant route
and a second verb on an authorized path.

**One gate was genuinely strengthened.** B08 factored the customer grant
adapter's explicit column list into a shared `SUMMARY_COLUMNS` constant so the
new `findSummaryById` could not drift from `listForCustomer`. That moved the
security property out of the method body, where B07's gate was scanning for it,
so the B07 rule now also asserts the shared column list carries no `token_hash`
and still carries `status` and `expiresAt` — otherwise a digest added one line
above `listForCustomer` would have passed.

No old completion report was edited. No old runtime integration suite was re-run
because of checker evolution.

### Q.1 `FU-APP4-B02-GATE-SCOPE-01` — carried forward, unresolved

`tools/check-app4-b02.mjs` still fails with **39 failures**, unchanged by this
checkpoint. Its "B02 publishes no HTTP surface" rule scans the whole customer
module's `presentation/` folder and went stale when `APP4-B03` shipped that
module's first controller; `APP4-B07` documented it and declined to re-scope
another checkpoint's gate. **B08 touched neither the rule nor a fact it parses**,
and per §45 did not broaden into a B02 repair. The follow-up stands as recorded.

---

## R. B08 checker

`tools/check-app4-b08-contract.mjs` + `tools/check-app4-b08-replay.mjs` +
`tools/check-app4-b08-contract.test.mjs`.

Split by responsibility, following the `check-app4-w01-boundaries.mjs`
precedent: the contract half answers *"what does the surface publish?"* and the
replay half answers *"what does the replay do to the records?"*. The shared file
helpers live on the replay side so the dependency runs one way and neither file
imports the other back. The entry point re-exports the symbols the mutation suite
resolves, so a consumer never has to know which half a rule lives in.

Reads the generated OpenAPI document, the generated client and **source with
comments stripped**. Never prose, never this report.

All 38 required assertions are covered:

| # | Assertion | Where |
|---|---|---|
| 1–4, 37 | exactly 2 operations, canonical routes, one verb each, **no `/retry` anywhere**, +2 over the B07 baseline | `checkPublishedSurface` |
| 5, 6 | the existing Admin guard plus the APP1 Origin allowlist on the mutation, no second guard, no permission model | `checkAdminAuthorization` |
| 7–13 | closed-set status filter and no other query parameter, masked recipient, template reference, attempt timeline with safe outcome and error class, no provider body, no `params` | `checkListProjection` |
| 14–16, 19, 22, 23 | origin locked and required `FAILED`; no settle, dead-letter, re-claim, counter touch or row update; one idempotent create; one append whose `aggregate_id` is the **new** intent | `checkReplayTransaction` |
| 17, 18, 24, 25 | source found on four linkage columns and `DEAD_LETTER`, never by payload; payload and schema version copied inside the append call | `checkSourceLookupAndCopy` |
| 26–28 | no open, seal, cipher or issuer, and no envelope-package import at all | `checkNoSecretHandling` |
| 20, 21 | the locked SHA-256 key over the locked pair, nothing per-call, no second idempotency framework | `checkReplayKey` |
| 29–31 | typed reference from versioned `params`, both ports read, expiry enforced on **both** aggregates, ineligible → `REISSUE_REQUIRED`, state conflict → not | `checkEligibility` |
| 32, 33 | Admin-only audit actor from the request context, no secret in the summary | `checkAudit` |
| 34–36, 38 | no provider SDK, no schema or migration, no APP5–APP7 content, client exposes `replay` not `retry` and no credential | `checkScopeAndClient` |

Additionally: `no-store` on the list from a named constant; no customer-facing
notification route; and **B01's boundary re-asserted** — intake still reaches no
challenge or grant repository, which is why B08's eligibility seam lives in the
Admin module.

**62 mutation tests, all passing.** Four keep the gate honest — it passes against
the real repository and a faithful copy at another path, fails when an owned file
is deleted, and **reads code rather than prose**.

Three rules were tightened after their own mutation tests exposed them as too
weak: the Origin-guard check matched an import rather than an applied decorator;
the payload-copy check matched the private source-read's return rather than the
append call; and the expiry check passed with one of two aggregates unguarded.

---

## S. Focused tests

**Five suites, 59 tests, all passing**, plus 12 in the outbox persistence suite.

The terminal-delivery fixture is built by the **production path**:
`RequestNotificationUseCase` seals a real AES-GCM envelope and appends a real
`PENDING` event; three attempts are recorded; `markFailed` and `markDeadLetter` —
the two calls W01 makes on exhaustion — move both records to terminal. No status
column is written directly. A hand-written envelope would only have proved that
B08 can copy a JSON object the test invented.

**Auth (§31).** Both routes: no cookie → 401; a cookie resolving to no session →
401; a foreign `Origin` on the replay → 403; a live session reaches the handler.
Through the **real** `AuthenticatedAdminGuard`, with real `admin_sessions` rows.
One representative invalid-session case only.

**List (§32).** Intents seeded across `PENDING`, `SATISFIED` and `FAILED`.
Asserted: no-filter behaviour, each status filter, an unknown status → 400, an
unknown query key → 400, the mask, template key and version, the channel, a
three-attempt chronological timeline with `errorClass` on each, the exact field
sets for intent and attempt, and `Cache-Control: no-store`. The whole serialized
body is searched for the raw recipient, the sealed code, the fixture's challenge
digest marker and eighteen forbidden field names.

**Eligible verification replay (§33).** Origin intent and dead-letter row equal
column-for-column afterwards; new `PENDING` intent with copied template, channel,
mask and params, the `source_outbox_event_id` trace and a 64-hex derived key; one
new `PENDING` event with a new id, `aggregate_id` = the replay intent,
`attempt_count` 0, `last_error` null, and payload plus every encrypted field
identical to the source; replay attempts 0 and origin attempts still 3;
`background_job_attempts` empty; one audit row with `actor_kind = ADMIN` and the
session's `admin_id`.

**Eligible grant replay (§34).** Same envelope copied, and the
`secure_access_grants` table byte-identical afterwards — no grant issued,
reissued, revoked or superseded.

**Refusal matrix (§35, §36).** Challenge expired-by-time (clock advanced),
`VERIFIED`, `CANCELLED`, `FAILED`, missing; grant expired, `REVOKED`, superseded
— all `409 / REISSUE_REQUIRED`. `SATISFIED` and still-`PENDING` intents →
`409 / REPLAY_NOT_APPLICABLE`. No `DEAD_LETTER` source and malformed `params` →
`409 / REPLAY_SOURCE_UNAVAILABLE`. Every one asserts zero replay intents, zero
replay events and zero audit rows.

**Idempotency, concurrency, rollback (§37–§39).** As described in §I.

**Replay key (§42).** Six cases on the canonical input string and the digest's
determinism.

**Repository (§47.2, §47.3).** Four cases added to the delivered AGG-22 suite
(`listForAdmin` ordering / filter / limit, `findById`, `listAttempts` ordering and
field set, `lockById` inside and outside a transaction) and one to the outbox
suite (`listTerminalEventsForAggregate` returns only dead-lettered events of the
right aggregate and type, with their payload).

### S.1 A pre-existing broken suite, repaired in one line

`notification-persistence.integration.spec.ts` failed **14/14 at `2780b03`** —
verified by running HEAD's version of the file — because `APP4-B01` gave
`RequestNotificationUseCase` a `RequestContextService` dependency without adding
the `@Global()` `RequestContextModule` to this suite's test graph. Every case
failed on the container build, not on an assertion.

§47.2 requires running this suite because B08 changed the port and the adapter,
so B08 named the composition it needs: **one line in the test graph**, no
production module changed. The suite is now 18/18.

---

## T. Secret evidence

All fixtures are deterministic and synthetic. No real code, token, hash,
ciphertext, envelope key, contact or session value appears in the repository, the
tests or this report.

| Checked for | In | Result |
|---|---|---|
| Raw recipient | list response, replay response, replay intent columns, audit rows | absent |
| The sealed plaintext code | list response, replay response, replay intent columns, audit rows, the new outbox row's non-payload columns | absent |
| Fixture challenge digest marker | list response | absent |
| `params`, `reference`, `challengeId`, `grantId` | list response | absent |
| `ciphertext`, `authTag`, `iv`, `algorithm`, `payload`, `envelope` | list response, replay response, audit rows | absent |
| Masked recipient | audit rows | absent (deliberately — see §O) |
| Provider fields, stack, scheduler internals | list response | absent |
| Credential fields | generated client and schemas | absent (gate-asserted) |
| The copied ciphertext | the new outbox row's `payload` | present and **still sealed** — identical to the source |

`node tools/check-report-secrets.mjs` — pass.

---

## U. Validation ledger

Change-impact only. Each command run **once** on success; reruns happened only
after a file it covers changed.

| # | Command | Result |
|---|---|---|
| 1 | `pnpm --filter @embroidery/api exec jest --config jest.config.mjs --runTestsByPath src/modules/notification/tests/integration/admin-notification-list.integration.spec.ts src/modules/notification/tests/integration/admin-notification-replay.integration.spec.ts src/modules/notification/tests/integration/admin-notification-replay-refusal.integration.spec.ts src/modules/notification/tests/integration/notification-persistence.integration.spec.ts src/modules/notification/domain/replay/manual-replay-key.spec.ts` | 5 suites / 59 tests pass |
| 2 | `pnpm --filter @embroidery/persistence exec jest --runTestsByPath src/platform/outbox-event-store.integration.spec.ts` | 12 tests pass |
| 3 | `pnpm --filter @embroidery/api typecheck` | clean |
| 4 | `pnpm --filter @embroidery/persistence build` | clean (the port is consumed from `dist`, IMP-D018) |
| 5 | `pnpm --filter @embroidery/api openapi:generate` | 47 / 52 / 99 |
| 6 | `pnpm --filter @embroidery/api openapi:check` | up to date |
| 7 | `pnpm --filter @embroidery/api-client generate` | tree hash `8f254b7e…` |
| 8 | `pnpm --filter @embroidery/api-client check:generated` | up to date |
| 9 | `pnpm --filter @embroidery/api-client typecheck` | clean |
| 10 | `node tools/check-app4-b08-contract.mjs` | pass |
| 11 | `node --test tools/check-app4-b08-contract.test.mjs` | 62 / 62 pass |
| 12 | `node tools/check-app4-b04-contract.mjs` · `b05` · `b06-contract` · `b07-contract` · `b03-contract` | pass (reconciled) |
| 13 | `node --test` over the b03/b04/b05/b06/b07/b08 checker tests | 323 / 323 pass |
| 14 | `node tools/check-app4-b01.mjs` · `check-app4-w01.mjs` | unchanged: b01 7 pre-existing failures, w01 pass |
| 15 | `node tools/check-app4-b02.mjs` | **unchanged pre-existing failure set** (§Q.1) |
| 16 | `pnpm --filter @embroidery/api exec eslint src/modules/notification src/modules/customer src/bootstrap/app.module.ts` | clean |
| 17 | `pnpm --filter @embroidery/persistence exec eslint src/platform/outbox-event-store*.ts` | clean |
| 18 | `pnpm exec prettier --check` over the changed paths | clean |
| 19 | `node tools/check-report-secrets.mjs` | pass |
| 20 | staged whitespace check | clean |

Reruns and why: (1), (3), (10)–(13) were re-run after Prettier reformatted eleven
files, because the gates read source and the mutation tests match anchors in it.
Nothing else was repeated; the concurrency race ran once, after the final code.

**Deliberately not run** (§47): full API Jest; the full NotificationModule or
persistence suites; the worker/W01 suite; B01–B07 runtime suites; the full APP1
auth matrix; the full P01 suite; frontend, Admin or Playwright tests; Figma
checks; DB manifest or migration regression; the G01 checker; SonarQube; any
repo-wide build, typecheck or lint; any aggregate regression chain.

**No full regression/test chain was run.**

---

## V. Files changed

**Added — API (13)**

```text
apps/api/src/modules/notification/notification-admin.module.ts
apps/api/src/modules/notification/application/admin-notification-intent.query.ts
apps/api/src/modules/notification/application/replay-notification-delivery.use-case.ts
apps/api/src/modules/notification/application/replay-eligibility.resolver.ts
apps/api/src/modules/notification/application/notification-replay-audit.recorder.ts
apps/api/src/modules/notification/domain/replay/manual-replay-key.ts
apps/api/src/modules/notification/domain/replay/manual-replay-key.spec.ts
apps/api/src/modules/notification/domain/replay/manual-replay.errors.ts
apps/api/src/modules/notification/domain/replay/replay-reference.ts
apps/api/src/modules/notification/domain/replay/admin-notification.policy.ts
apps/api/src/modules/notification/infrastructure/clock/notification-clock.ts
apps/api/src/modules/notification/presentation/admin-notification-intent.controller.ts
apps/api/src/modules/notification/presentation/schemas/admin-notification-intent.response.ts
apps/api/src/modules/notification/presentation/schemas/admin-notification-intent.request.ts
```

**Added — tests (4)**

```text
apps/api/src/modules/notification/tests/integration/admin-notification-context.ts
apps/api/src/modules/notification/tests/integration/admin-notification-list.integration.spec.ts
apps/api/src/modules/notification/tests/integration/admin-notification-replay.integration.spec.ts
apps/api/src/modules/notification/tests/integration/admin-notification-replay-refusal.integration.spec.ts
```

**Added — tools (3)**

```text
tools/check-app4-b08-contract.mjs
tools/check-app4-b08-replay.mjs
tools/check-app4-b08-contract.test.mjs
```

**Modified**

```text
apps/api/src/bootstrap/app.module.ts                                              (+ NotificationAdminModule)
apps/api/src/modules/notification/domain/repositories/notification-intent.repository.ts  (+ read model, + 4 reads)
apps/api/src/modules/notification/infrastructure/persistence/drizzle-notification-intent.repository.ts
apps/api/src/modules/notification/tests/integration/notification-persistence.integration.spec.ts  (+ 4 cases, + test-graph fix)
apps/api/src/modules/customer/domain/repositories/secure-access-grant.repository.ts       (+ findSummaryById)
apps/api/src/modules/customer/infrastructure/persistence/drizzle-secure-access-grant.repository.ts (+ shared column list)
packages/persistence/src/platform/outbox-event-store.ts                           (+ terminal-source read)
packages/persistence/src/platform/outbox-event-store.integration.spec.ts          (+ 1 case)
packages/contracts/openapi/openapi.generated.json                                 (generated)
packages/api-client/src/generated/embroidery-api.ts · .schemas.ts                 (generated)
tools/check-app4-b04-contract.mjs · b05.mjs · b06-contract.mjs · b07-contract.mjs (operation count)
tools/check-app4-b04-contract.test.mjs · b06-contract.test.mjs · b07-contract.test.mjs   (count + column-list guards)
docs/implementation/SCOPED_COMMAND_INDEX.md                                       (3 new scoped commands)
```

No schema, no migration, no worker change, no frontend file, no generated file
hand-edited, no `.env` write.

Every runtime source file is under 400 lines and every test file under 600.

The gate was written as one 807-line file and then **split by responsibility**
into 422 + 439 lines, both inside the §49 tooling preference of 450; the mutation
suite is 613 against a preference of 700. The split is the
`check-app4-w01-boundaries.mjs` shape, not a line-count trim — the two halves
answer different questions and share only the file helpers.

---

## W. Git evidence

Committed on `production`, **not pushed**. Working tree clean at exit.

Implementation commit: `<recorded in the evidence commit below>`.

---

## X. Follow-ups

| Id | Status | Note |
|---|---|---|
| `FU-APP4-B02-GATE-SCOPE-01` | **Carried forward, unresolved** | Pre-existing tooling debt from `APP4-B03`, documented by `APP4-B07`. B08 changed no B02-owned fact and did not broaden into a repair (§Q.1) |
| `FU-APP4-B08-WORKER-JOURNEY-01` | **New, deferred to `APP4-E01`** | A full replay-through-worker journey — replay, claim, open, deliver — belongs to the cross-layer checkpoint. B08 proves the shape structurally (§N) |

---

## Y. Next checkpoint

`APP4-S01`.

Not started. No S01 file, route, component or test exists in this change.

---

## Acceptance criteria

All 72 criteria in §51 are met. The ones worth naming explicitly:

- **3** — the route is `/replay`; the gate refuses `/retry` on any path, in the
  document and in the generated client.
- **17, 18, 22** — origin intent, its attempt rows and the old `DEAD_LETTER` row
  are asserted unchanged column-for-column after a replay.
- **19, 20** — the source is resolved on four indexed linkage columns; the gate
  refuses a payload query in the lookup and any envelope read in B08 source.
- **32, 33, 34, 35, 36** — encrypted fields and schema version identical to the
  source, proven by the IV a re-seal could not reproduce; no import of the
  envelope package anywhere in the module.
- **26, 43, 44** — the locked deterministic key; sequential and concurrent
  duplicates each produce one intent, one event and one audit row.
- **39, 41, 42** — every ineligible secret answers `REISSUE_REQUIRED` with zero
  writes; a `SATISFIED` intent answers `REPLAY_NOT_APPLICABLE` instead.
- **45, 46, 47, 48** — audit actor is the authenticated Admin, carries no secret;
  a forced failure rolls the whole replay back.
- **51** — no worker production file was changed, and no incompatibility was
  found.
- **58, 59** — older gates reconciled only where B08 moved a fact they parse; the
  B02 debt was carried forward, not absorbed.
- **64, 65, 66** — change-impact validation only, one run per successful command,
  no full regression chain.
