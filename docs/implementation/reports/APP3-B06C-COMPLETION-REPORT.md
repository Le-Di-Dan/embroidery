# `APP3-B06C` — completion report

**Class** replan child completing `APP3-B06`. Not a correction of `APP3-B06B`
and not an `APP3-B06B-C2`.
**Status** `COMPLETE — REVIEW_DELIVERED`. Not self-accepted.
**Commit A** `f027211` `feat(api): deliver private Design Session assets`
**Branch** `production`, nothing pushed.

---

## A. Entry and the `APP3-S05` acceptance

Human review accepted the `APP3-S05` chain, and the phase document now records
it:

```text
APP3-S05      = COMPLETE — REVIEW_ACCEPTED
APP3-S05-C1   = COMPLETE — REVIEW_ACCEPTED
APP3-S05-MI01 = COMPLETE — REVIEW_ACCEPTED   (Commit A f8b269d)
```

Entry contract world, verified before any edit: **35 paths / 40 operations / 83
schemas**, **34** migrations, **30** root scripts, generated-client tree
`d9aac2b3…`. Nothing in `APP3-S05`, `S05-C1`, `S05-MI01`, `S03`, `S03-C1` or
`S07` was reopened.

---

## B. Authority and replan ownership

`APP3-B06`'s scope was always *"session-scoped customer asset intake **+ granted
delivery**"*. `APP3-G08` replanned it into `B06A` (the credential verifier, zero
HTTP operations) and `B06B` (intake, one operation), and the delivery half was
never reassigned. This is that half — `IMP-D044` PO-06 delivery class 3, the
third and last:

| # | Class | Authorization context | Owner |
|---|---|---|---|
| 1 | Product Side background | Product + Side | `APP3-B02` |
| 2 | Published Template asset | Template + published Version | `APP3-B05A` |
| 3 | **Session upload** | **Session id + matching credential** | **`APP3-B06C`** |

Reused, never redesigned: `B06A` credential verification, `B07` cookie issuance,
`B06B` intake and the `DESIGN_SESSION_ASSET` association, `W01A` normalized
output, `W01C` inspection convergence, `G04`/`DB01` derivative kind and quartet.
`B08` was **not** taken as a dependency: delivery is a read and needs no
autosave.

---

## C. Route and operation-id audit

The route was already locked by the phase plan and by the pre-implementation
audit; nothing contradicted it:

```text
GET /api/public/design-sessions/{sessionId}/assets/{assetId}/editor-preview
operationId = publicDesignSessionAsset_get
```

**The controller is a second class, and that needed a decision.** Putting the GET
on `PublicDesignSessionAssetController` took that file to **346 lines** — past
the CLAUDE.md §6 review threshold of 300. So delivery became
`PublicDesignSessionAssetPreviewController` (196 lines), leaving the accepted
upload controller byte-for-byte unchanged.

A split is exactly the operation-id trap `APP3-B04A` recorded: the factory
derives the domain from the class name, so this would have minted
`publicDesignSessionAssetPreview_get`. Both classes are therefore mapped in
`CONTROLLER_DOMAIN_KEYS`, which is what that table exists for — an entry states
*"these classes are one published domain"*, a contract fact rather than a
file-layout decision naming a public identifier. `publicDesignSessionAsset_create`
is unchanged, and a gate mutation removing either entry fails.

---

## D. The read-security composition

`DesignSessionGuard` is mutation-specific in two ways this route must not
inherit, so `DesignSessionReadGuard` composes the same primitives —
`AuthorizeDesignSessionService`, `DesignSessionOriginPolicy`,
`DesignSessionRateLimiter`, `EphemeralNetworkKeyService`,
`attachDesignSessionContext` — and drops exactly those two. No cookie parsing,
HMAC, pepper or liveness rule is re-implemented.

**1 · Origin.** `IMP-D043` PO-05 requires an exact `Origin` and
`Sec-Fetch-Site: same-origin` on a *state-changing* request, because a
`SameSite=Lax` cookie accompanies a top-level cross-site POST. **A browser sends
no `Origin` at all on a same-origin image load**, so inheriting that rule would
mean no `<img>` could ever display a customer's own upload — the one thing this
route exists for. `evaluateSafeRead` keeps the part that is free: an explicit
`Sec-Fetch-Site: cross-site` is refused before a cookie is read. That check costs
nothing (a Lax cookie is not sent on a cross-site subresource anyway) and an
absent header is allowed, because `Sec-Fetch-*` is withheld entirely on a
non-trustworthy origin. The mutation rule is untouched, and a gate mutation
weakening it fails.

**2 · The mutation limit.** PO-07's 30/minute is a budget for *changes* to a
Session. A Studio scene can reference several images, so charging previews
against it would let ordinary rendering exhaust a customer's ability to save
their own work. `checkMutation` is not called; a focused test drives 40
consecutive authorized reads and asserts the counter was never touched.

Everything about authorization is kept identical, including the order: refuse
cheaply, then the id+secret pair, then — only once a failure is known — the
authorization-failure budget, so a well-behaved client never spends it.

---

## E. Credential and liveness

Ownership is the **pair**. The id selects the cookie; neither authorizes alone.
Proved in the focused suite against the *real* `AuthorizeDesignSessionService`,
verifier and cookie policy — a stubbed authorizer would only assert about itself:
the matching pair succeeds; the session id alone fails; a **valid credential for
another session** fails against this address; an expired session and a
non-`ACTIVE` session both fail. The raw secret and its digest never reach the
request context, asserted by serializing the context and searching it.

The descriptor statement re-asserts `status = 'ACTIVE'` and
`expires_at > authorizedAt` inside the same snapshot as the association, closing
the window between guard and query and making the statement self-sufficient.

---

## F. Read-rate behaviour — a disclosed gap, not a decision

The directive's §6 states a *"bootstrap/resume/read limit = 60/minute per
ephemeral network key"*. **No such limit exists.** `IMP-D043` PO-07 and
`design-session-auth.config.ts` define exactly four: creation 5/hour, creation
burst 2/minute, mutation 30/minute, authorization failure 10 per 15 minutes.
There is no read limit anywhere in the repository, and `resume` is a POST behind
the mutation guard.

I did not invent one. A number chosen here would be a PO-07 ruling nobody made,
hard-coded into a file whose docblock says the values are "verbatim, not
environment-tunable". What actually bounds probing today:

- unauthorized attempts spend the authorization-failure budget, unchanged;
- an **authorized** session probing random asset ids is bounded only by the 122
  bits of a UUIDv4 and by every miss being indistinguishable.

That residual is real and is **not** closed by this checkpoint. Recorded as
`FU-APP3-B06C-READ-RATE-LIMIT-01`. §19's tests 21 and 22 are answered as: the
accepted PO-07 set is unchanged, and the mutation limiter is provably not
consumed.

---

## G. The authorized Session context

`sessionId: context.designSessionId`, never `params.sessionId`. The guard proved
ownership of *that* id; re-reading the path would reintroduce the gap it just
closed. A gate mutation swapping one for the other fails on both halves of the
rule, and it is the mutation that would ship a working feature while deleting the
whole authorization argument.

---

## H. Ownership through `DESIGN_SESSION_ASSET`

The descriptor statement **starts from** `design_session_assets` and carries both
halves of the pair in its first relation:

```sql
from design_session_assets
  join design_sessions   on id = session_id
  join assets            on id = asset_id
  join asset_derivatives on asset_id = assets.id
where session_id = <authorized id> and asset_id = <requested id> …
```

So a foreign asset is **unreachable**, not fetched and then rejected — there is
no ordering of these predicates in which it is ever a candidate. Nothing
authorizes via the raw `assetId`, Template lineage, `B05A` permission, asset
existence or derivative existence. A cloned Session's Template provenance buys
nothing here.

---

## I. Lane eligibility

`kind = CUSTOMER_UPLOAD`, `classification = CUSTOMER_PRIVATE`,
`status = ACCEPTED`, `deleted_at is null` — re-checked on every request rather
than trusted from the intake that wrote the association.

The parent's inspection verdict is asserted **independently of the derivative**,
and that is deliberate: a derivative can be written while the asset is still
`INSPECTING` (`APP2-DB01`), so a route checking only the derivative would serve
an image inspection had not yet cleared, and would keep serving one it later
rejected. `CATALOG_MEDIA`, `TEMPLATE_SOURCE` and `PRODUCTION_SENSITIVE` are
excluded by the two lane comparisons alone.

---

## J. The `READY` `NORMALIZED` quartet

`kind = NORMALIZED`, `status = READY`, `is_watermarked = false`, and all four of
`width_px`, `height_px`, `media_type`, `byte_size` present, positive and read
rather than trusted from a CHECK. The persisted values are canonical;
`assets.mime_type`, `assets.size_bytes`, inspection detail and provider metadata
are never substituted.

**A finding the live suite produced.** A `READY` `NORMALIZED` row with an
incomplete quartet is **unrepresentable** — `ck_asset_derivatives__ready_normalized_metadata`
refuses it. `APP3-DB01` closed that state physically, so the delivery route's
quartet check is defence in depth against a row the database will not hold. The
live suite proves the constraint by name, and seeds the ineligible case as
`PROCESSING`, because the `READY` variant does not exist to be tested.

---

## K. Raster only; original and SVG denied

`SESSION_ASSET_MEDIA_TYPES = ['image/webp']` — **narrower than the intake
allowlist, and measured rather than assumed**. `APP3-B06B` accepts JPEG, PNG and
WebP, but those describe the uploaded original nobody may see;
`NORMALIZED_OUTPUT_POLICY.mediaType` in `APP3-W01A` is a single value,
`image/webp`. `image/svg+xml` is absent and its absence is load-bearing:
`IMP-D044` PO-04 authorizes SVG for Template artwork, which is why `APP3-B05A`
lists it, and nothing authorizes it for a Session upload.

`ORIGINAL`, `THUMBNAIL`, `CATALOG_PREVIEW`, `PREVIEW_WATERMARKED` and `MOCKUP`
are **unnameable** across the policy, adapter, service and controller — asserted
as a whole-file ban, with a gate mutation for each. There is no read-time
normalization and no rendition parameter: the request schema is `.strict()`, so
`?variant=original` is a 400 rather than a silently ignored field.

---

## L. The safe private-miss taxonomy

Eleven internal conditions, one indistinguishable answer
(`DESIGN_SESSION_ASSET_NOT_FOUND`, 404): unknown asset, asset owned by another
session, missing association, wrong kind, wrong classification, tombstoned,
`INSPECTING`, `REJECTED`, no derivative, unready derivative, watermarked
derivative, unapproved media type. The repository cannot report which — it
returns `undefined` for all of them.

**Session credential failure stays its own layer.** Missing, wrong or expired
credentials answer the accepted `APP3-B06A` 401 (or 429 once the failure budget
is spent), and are *not* collapsed into the 404. Merging them sounds safer and is
not: it would hide from a legitimate client that its credential died.

The live suite compares the caller-visible body of an unknown id, an `INSPECTING`
asset and a foreign asset with the per-request `meta` excluded — that field
carries a request id and timestamp by design, and comparing it would make two
identical refusals look different.

---

## M. Provider contradiction — 503, never 404

By the time this can fire, the whole authorization has succeeded: the association
exists and the row says `READY` with a durable key. Reporting a storage outage as
not-found would tell a customer their own upload is gone.

`503` for: object missing, provider unavailable, provider size not finite, ≤ 0,
or ≠ the persisted `byte_size`. The stream is destroyed **before** the refusal,
so a contradicted object never leaves a provider connection draining into an
abandoned request. The persisted metadata is never repaired from provider state —
proved live by re-reading `byte_size` after a mismatched read and finding it
unchanged. A client abort propagates as an abort rather than being dressed up as
a server fault.

---

## N. Descriptor before storage

```text
validate path → authorize session → association + liveness + lane + verdict
              + derivative + quartet   ← one statement, one snapshot
              → only then open object storage
```

Unauthorized or ineligible probes make **zero** object-storage calls, so provider
load and response timing are not an existence oracle. The unit suite asserts the
call list is empty on refusal; the gate asserts the ordering structurally (the
descriptor call precedes the storage call and the refusal between them is
unconditional), with a mutation that opens storage first.

No object I/O inside a transaction, and no transaction at all: the adapter
contains no `insert`, `update`, `delete`, `for('update')` or `transaction(`, and
holding one would pin a connection for the length of a client's download.

---

## O. Private streaming and disconnect

`ObjectStoragePort.getObjectStream` against the private `DERIVATIVES` bucket,
using the **persisted** key — never one derived from the request. Streamed, never
buffered: `Buffer.concat`, `toArray()`, `readFileSync` and `arrayBuffer(` are all
banned on the path, because buffering would put a whole customer upload in the
heap per concurrent request and destroy backpressure.

`watchClientDisconnect` was lifted from `APP3-B05A`'s controller into
`apps/api/src/platform/http-response/client-disconnect.ts` and both controllers
now share it. Two copies of a connection-lifecycle rule is how one of them
quietly stops matching the other, and the consequence — a provider connection
draining into a socket nobody reads — is invisible to tests and obvious in
production. `writableEnded` still guards the abort, so a completed response is
never reported as cancelled.

---

## P. Headers

`Content-Type` from the persisted `media_type`; `Cache-Control: no-store`;
`X-Content-Type-Options: nosniff`; `Content-Disposition: inline` with **no**
filename (the original name is never persisted, so one could only be invented);
`Content-Length` from the reconciled `byte_size`. Exactly two `setHeader` calls,
asserted by count.

No `ETag`, `Last-Modified`, `Range`, `Accept-Ranges`, `max-age`, `immutable` or
`public`. The bytes never change, which is exactly what makes an immutable cache
look safe and be wrong: what expires is the **authorization**.

**A gate rule I had to correct.** My first cache rule banned the *words*
`immutable` and `max-age` anywhere in the controller — and it fired on the
published description, which correctly says the bytes are immutable while the
authorization is not. That is the proxy failure `APP3-B06B` recorded, arriving
again. The rule now asserts the values actually sent and the policy constants; a
test pins that the description may keep the word.

---

## Q. Zero writes, no cookie rotation

Structural first: the delivery module binds a **one-method read port**, not
`DESIGN_SESSION_REPOSITORY`. `attachAsset`, `saveDocument`, `advanceRevision`,
`rotateSecret`, `submit` and `expire` are not merely unused on this path — they
are unreachable from it. There is no audit, outbox, normalization or idempotency
collaborator to append with.

Proved live across a success, an authorization failure, a private miss and a
malformed id in one test: `design_sessions` row identical (revision, document,
secret digest, status, expiry, last activity, `updated_at`), and
`audit_events`, `outbox_events`, `asset_derivatives` and `design_session_assets`
counts unchanged. A successful read sends no `Set-Cookie` at all.

The guard's one permitted `Set-Cookie` is the accepted `APP3-B06A` **clearing** of
a credential that will never work again; a gate mutation replacing it with an
issued cookie fails. The only non-durable state a request touches is the
in-memory rate-limit counter — security infrastructure, not a business write.

---

## R. Live PostgreSQL + MinIO evidence

**27 cases, 27 passed**, real `AppModule`, disposable PostgreSQL, disposable
MinIO, real HTTP with a real `__Host-` cookie. No second harness: this extends
`APP3-B06B-C1`'s accepted `createSessionAssetContext` with a seeder for the state
`APP3-W01A` leaves behind.

Covered: exact bytes and every header (A); a foreign credential (C) and an asset
associated to another session (D) both refused; expired and non-`ACTIVE` sessions
(E); `INSPECTING` (F) and `REJECTED` (G) refused; watermarked, wrong-kind,
unready and incompletely described derivatives (H); the original never returned
when `NORMALIZED` is absent (I); a missing object (J) and a size mismatch (K)
both 503 with the persisted row unrepaired; zero durable writes (L); no
storage key, bucket, provider endpoint, checksum, derivative id or filename in
any response (M); and the disposable database and MinIO container dropped (N).

The `APP3-B06B` intake suite runs under the same config and still passes:
**49 tests / 2 suites** together.

---

## S. Real HttpOnly-cookie browser evidence — and a finding that is not mine

Run through the accepted `APP3-S01` helpers rather than a new harness:
`smoke-app3-s01-trustworthy-origin.mjs apply` for a genuinely trustworthy
`http://localhost`, and `smoke-app3-s01-fixtures.mjs seed` for a published
placement. Both were restored afterwards; no `.env` was written and no guard was
weakened.

Proved in a real browser:

- `POST /api/public/design-sessions` → **201**, and `document.cookie` is **empty**
  — the credential is genuinely unreadable from script, and the response body
  carries no secret;
- `POST …/assets` with a PNG painted in a canvas → **202**, `INSPECTING`;
- the preview **while `INSPECTING`** → **404**, no bytes;
- once the terminal state existed, the preview → **200**, `image/webp`, **10100
  bytes**, magic `RIFF…WEBP`, with `cache-control: no-store`,
  `x-content-type-options: nosniff`, `content-disposition: inline` and no `etag`,
  `last-modified`, `accept-ranges`, bucket, storage key or provider host;
- **a real `<img src>` loaded it, 600×600.** This is the decisive one: a
  same-origin subresource load sends the HttpOnly cookie automatically and sends
  **no `Origin` header at all**, which is precisely why inheriting the mutation
  guard would have broken the route while looking stricter;
- an authorized *stranger* session asking for the owner's asset → **404**; an
  unknown asset under the owner's own session → **404**; an unknown session →
  **401**; the owner still → **200**;
- the session then expired in the database, with the browser still holding its
  valid cookie → **401**, and no `Set-Cookie`;
- the `design_sessions` row after every read: revision, `last_activity_at` and
  `updated_at` all still at the upload's timestamp.

**The finding.** The browser run could not reach `ACCEPTED` through the real
pipeline, and the reason is upstream of this checkpoint:

> `apps/worker/src/jobs/asset-inspection/infrastructure/persistence/asset-rows.ts`
> requires `kind = CATALOG_MEDIA` and `classification = PRODUCTION_SENSITIVE`.
> **No worker consumer inspects the `CUSTOMER_UPLOAD` lane.**

So a Session upload's `asset.inspection.requested` job dead-letters
(`JOB_INVARIANT_VIOLATION`, *"the asset is not private catalog media"*), the
normalization job then dead-letters too, and the asset stays `INSPECTING`
permanently. **Today, no Session upload can ever become deliverable through the
real pipeline.**

That is an `APP3-B06B`/`APP3-W01` gap, not a B06C defect — B06C refuses an
`INSPECTING` asset, which is exactly what it is required to do, and it may not
touch worker runtime. I did **not** relax the `ACCEPTED` requirement to work
around it: serving an image inspection has not cleared is the failure the lane
exists to prevent. Recorded as `FU-APP3-B06C-SESSION-LANE-INSPECTION-01` and it
**blocks `APP3-S06` from being usable end to end**.

For the browser run only, the terminal state was seeded directly — asset
`ACCEPTED`, one `READY` unwatermarked `NORMALIZED` derivative with the full
quartet, and real WebP bytes copied from an object `APP3-W01A` genuinely produced
— exactly the shape a Session-lane inspection consumer would produce. The script
lives in the scratchpad and is **not committed**. All fixtures, rows and objects
were removed afterwards; two `DEAD_LETTER` outbox rows remain because
`outbox_events` is immutable by design, which is correct and not residue I may
delete.

**Console:** one pre-existing `favicon.ico` 404, HMR WebSocket failures caused by
my own container restarts, and the deliberate 404/401 responses from the negative
probes. Zero unexpected errors.

---

## T. Enumeration and non-disclosure

For an authorized session, `random assetId`, `asset owned by another session`,
`missing association`, `wrong lane`, `INSPECTING`, `REJECTED`, `missing READY
NORMALIZED` and `incomplete quartet` all produce the same status and the same
body. The credential family (missing / wrong / expired) keeps its own accepted
answer and is not merged into it. No response, header, log or thrown message
carries a secret, digest, cookie value, pepper, bucket, storage key, provider
endpoint, checksum, derivative id, original filename or authorization reason.

---

## U. OpenAPI and client delta

Generated **exactly once each**, after the source had stabilized.

| | entry | after |
|---|---|---|
| paths | 35 | **36** |
| operations | 40 | **41** |
| schemas | 83 | **83** — measured, not forced |
| migrations | 34 | 34 |
| root scripts | 30 | 30 |

Schemas are unchanged because the response is binary and the request has no body,
so the operation publishes a media type rather than a component.

```text
OpenAPI  SHA-256 = 0bdb5261acc233aa33b21972c2069157319923c52beaed03c9bbb7f5e3867307
client tree hash = d8ff2e10bfa5335bd0b86ac1e482fc32eb9da96c31e2f5107d78328be755b8d8
```

Generated shape, exactly as predicted:

```ts
publicDesignSessionAssetGet(sessionId: string, assetId: string) => Blob
// url: /api/public/design-sessions/${sessionId}/assets/${assetId}/editor-preview
// method: GET, responseType: 'blob'
```

Two UUID path params, no body, no query, no secret, no revision. `openapi:check`
and `check:generated` both clean. No generated file was hand-edited. No curated
Storefront export was added — that is consumer-driven curation for `APP3-S06`.

---

## V. Checker and mutation evidence

`tools/check-app3-b06c.mjs` (369) with `-security.mjs` (210) and `-stream.mjs`
(204); `check-app3-b06c.test.mjs` (636). All under the soft caps. No root script;
four commands registered in `SCOPED_COMMAND_INDEX.md`.

**`node --test tools/check-app3-b06c.test.mjs` → 70 / 70.** Every mutation §23
names is present and fails without its rule, including the ones that leave a
working route: the route rewritten as a generic asset-by-id; the guard removed;
the mutation guard substituted; the ownership predicate dropped; the identity
taken from the path; `ORIGINAL` made a candidate; the `READY`/`NORMALIZED`
predicate dropped; SVG widened; storage opened first; the cache made public and
immutable; a size mismatch streamed; the GET given revision semantics; a second
operation added; Storefront source appearing in scope. The checker never reads
the completion report.

**Two of my own rules were wrong and the mutations caught them.** A mutation
renaming the operation id passed because my *assertion* looked for a string the
message did not contain; and a mutation removing the read-port binding passed
because `without()` deletes only the first matching line, leaving the provider
line intact. Both are the same lesson in different clothes: a mutation test that
passes is only evidence if the mutation was real.

---

## W. Predecessor-gate evolution

Historical worlds are frozen; a new one is added on top, so a rollback is still
checked against what that phase actually shipped:

- **`app3-accepted-surface.mjs`** — a `B06C` world (36/41/83, 5 Session paths) at
  the head of the list, and the delivery path appended **last** to `SESSION_PATHS`
  so every earlier world's slice is unchanged.
- **`app3-accepted-paths.mjs`** — `isB06CDelivered`.
- **`check-app3-b01n-artifacts.mjs`** — a `B06C` digest/count tier at the head of
  each chain; no earlier constant edited.
- **`check-app3-b05a.mjs`** — its ban on "any public address whose identity is an
  asset id" explicitly anticipated this route and refused it. The world is now
  enlarged by **naming B06C's one address**, not by loosening the shape: any
  other Session-shaped asset route still fails.
- **`check-app3-s02` / `s03` / `s07`** — each carried "`APP3-B06C` is not recorded
  complete" as a proxy for "I do not implement it". That proxy is now gated on
  the world, exactly as their own `isS03Delivered` handling already was, and the
  coverage it carried moves to a rule that is true in **both** worlds: the
  checkpoint's own source never reaches `publicDesignSessionAssetGet` or
  `editor-preview`. `APP3-S02`'s runtime stays a placeholder; its gate is now
  B06C-aware without claiming S06 pixels exist.

No accepted historical report was altered.

**Disclosed pre-existing failures.** `check-app3-a01.mjs` (2) and
`check-app3-a03.mjs` (1) fail on Figma-registry rows. I verified them in a
throwaway worktree at entry HEAD `d89ba47`: **byte-identical failure text**, so
they are pre-existing and none of them names B06C or any file this checkpoint
touched. Not repaired — they belong to their own checkpoints.

Likewise, `pnpm --filter @embroidery/api test` (the aggregate, run once by
accident and not part of the validation set) has 6 unit failures that assert
frozen counts B02A and B05A already moved. Verified identical under `git stash`
at entry HEAD. Not mine, not repaired.

---

## X. Changed files

**32 files in Commit A.** New API source (lines): policy 106, errors 100, port
80, adapter 173, service 148, read guard 111, request schema 32, delivery
controller 196, shared disconnect seam 35. Tests: unit 501, contract 253, live
353, live-context extension +119. Tools: 369 + 210 + 204 + 636. Every source file
is under the 400-line limit and every test under 600.

Modified accepted files, each minimally: `design.module.ts` (+wiring),
`design-session-origin.policy.ts` (+`evaluateSafeRead`, mutation rule untouched),
`public-design-template-asset.controller.ts` (−the lifted helper),
`operation-id.ts` (+2 domain-key entries).

**Zero files** under `apps/worker`, `apps/storefront`, `apps/admin` or
`packages/database`. No migration, no dependency, no `pnpm install`, no root
script, no Figma mutation.

### Deviations

1. **No read-rate limit was invented** (§F). The directive asserted a 60/minute
   limit that does not exist in `IMP-D043` PO-07 or the repository.
2. **The delivery controller is a second class**, not a method on the accepted
   upload controller (§C) — a file-size decision, made contract-safe through
   `CONTROLLER_DOMAIN_KEYS`.
3. **`watchClientDisconnect` was lifted to `platform/`** and `APP3-B05A`'s
   controller now imports it (§O).
4. **The browser proof seeded the terminal asset state** because the worker
   cannot produce it (§S).
5. **Commit A was amended once**, before Commit B and before this report was
   authored: a shell here-string leaked a stray `@` into the subject line, and the
   required subject could not otherwise be honoured. No amend after this point.

---

## Y. Command ledger and budget

| # | Command | Result | Decision |
|---|---|---|---|
| 1 | entry audit — OpenAPI/migrations/scripts | 35/40/83, 34, 30 | world confirmed |
| 2 | `tsc --noEmit` (api) ×3 | PASS | after each source stage |
| 3 | focused jest `design-session-asset-delivery` ×4 | 45/45 | contract + unit |
| 4 | live `jest.design-session-asset.config.mjs` ×4 | 27/27, then 49/49 with B06B | 3 real defects found and fixed on run 1 |
| 5 | `openapi:generate` ×1 | 36/41/83 | after source stable |
| 6 | api-client `generate` ×1 | tree `d8ff2e10…` | after OpenAPI stable |
| 7 | predecessor gates ×3 sweeps | 26 pass, 5 evolved, 2 pre-existing | world-aware evolution |
| 8 | `check-app3-b06c` ×5 · its tests ×3 | PASS · 70/70 | 2 weak rules found |
| 9 | browser smoke ×1 | PASS + upstream finding | S06 blocker recorded |
| 10 | `pnpm lint`, `prettier --check .`, `git diff --check` | clean | 2 lint defects fixed |

Live integration budget: **4 of 5**, under the suggested cap. No same-fingerprint
rerun was performed for confidence.

**Disclosed:** `pnpm --filter @embroidery/api test` (the full API suite) was run
once by accident — a `cd` that did not take effect in a parallel shell. It is on
the do-not-run list. Its output was used only to confirm the 6 failures are
pre-existing, and it is reported rather than omitted.

---

## Z. Commit A

```text
f027211  feat(api): deliver private Design Session assets   (32 files)
```

Contains no completion report.

---

## AA. Roadmap

```text
APP3-S05      = COMPLETE — REVIEW_ACCEPTED
APP3-S05-C1   = COMPLETE — REVIEW_ACCEPTED
APP3-S05-MI01 = COMPLETE — REVIEW_ACCEPTED
APP3-B06C     = COMPLETE — REVIEW_DELIVERED
APP3-S06      = BLOCKED_BY_APP3-B06C_REVIEW_ACCEPTANCE
```

After human acceptance, `APP3-B06C = COMPLETE — REVIEW_ACCEPTED` and
`APP3-S06 = READY — NOT STARTED` becomes the next recommended frontend
checkpoint. `APP3-S06` was not started and no Storefront file was touched.

**`APP3-S06` should not be planned as usable end to end until
`FU-APP3-B06C-SESSION-LANE-INSPECTION-01` is closed** (§S): the delivery contract
is correct and complete, but nothing in the current worker can move a Session
upload out of `INSPECTING`, so S06 would upload an image the preview correctly
refuses to serve.

---

## AB. Clean tree

Branch `production`, working tree clean, Commit A immediately precedes Commit B,
nothing pushed. No amend after this report; no squash, no rebase.

Environment restored: S01 fixtures reverted, trustworthy-origin helper restored
to the tracked configuration, browser sessions and seeded rows deleted, MinIO
objects removed. No `.env` written; no credential read, logged, echoed or
rotated; the only environment values read were non-secret container settings.

---

## What this report does not claim

- **`APP3-S06` is not implemented.** No Storefront file was touched.
- **The upload does not wait for normalization.** `APP3-B06B` still answers `202`
  with `INSPECTING`.
- **`INSPECTING` is not deliverable**, and is refused before any storage call.
- **The original is not editor-safe** and is never a candidate.
- **A Session id alone authorizes nothing**, and neither does an asset id.
- **The GET requires no revision** and advances none.
- **The cookie is not readable by JS** — proved empty `document.cookie` in a real
  browser.
- **No immutable or public caching**, in any world.
- **No generic asset delivery exists**, and the gate refuses one.
- **No claim that the worker gap was fixed** — it was found, proved and disclosed.
- **No claim of a 60/minute read limit** — none exists, and none was invented.
