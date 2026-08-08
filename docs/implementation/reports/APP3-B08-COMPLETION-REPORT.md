# APP3-B08 — Completion report

**Checkpoint:** `APP3-B08` — Design Session autosave
**Branch:** `production`
**Status:** `COMPLETE — REVIEW_DELIVERED`
**Implementation commit (A):** `a7b0813a24873cb4e9fcc74a4f6e0e0e770e1680`
**Evidence commit (B):** this commit

---

## 1. The operation

Exactly one, and nothing adjacent to it:

```text
PUT /api/public/design-sessions/:sessionId/document
operationId = publicDesignSession_autosave
```

Published on the existing `PublicDesignSessionController`, so the operation-id
convention is B07's rather than a second public Session controller invented for
naming.

| Surface | Before | After |
| --- | --- | --- |
| paths | 22 | **23** |
| operations | 26 | **27** |
| schemas | 49 | **50** |

```text
OpenAPI SHA-256          = 4fa09b27bfc9de265af4e0da705de3c9cfe0173758f9fa570ad07cb83c04ab06
generated-client tree    = 4bf8dd9db03b44856e84e4f17804d53fc65924046efa842cc0b610dad27486f5
migrations               = 34 (unchanged)
root package scripts     = 30 (unchanged)
```

## 2. Request and response contract

**Request** — a plain object through the ordinary `createZodDto` path. B07's
union bridge was not copied; that machinery exists for a discriminated union,
and this body is not one.

| Field | Rule |
| --- | --- |
| `expectedRevision` | required, integer, `minimum: 0`, bounded above at 9 digits |
| `document` | required, the complete canonical Design Document snapshot |

`.strict()` rejects everything the server owns — session id, secret, status,
expiry, revision to *set*, schema version, storage fields, customer identity.
**The persisted schema version is derived from the document, never accepted from
the caller**, and the gate refuses a body that publishes `documentSchemaVersion`.

One deliberate decision worth review: `document` is published as an object with
`additionalProperties`, not as a mirrored copy of the P01 schema. Mirroring the
canonical Design Document at the HTTP edge would create a second definition that
drifts from `@embroidery/design-document`, and P01 is the sole judge of document
contents. See §8 for the gate consequence this had.

**Response** reuses B07's `toSessionSnapshot` — `sessionId`, `status`,
`revision`, `expiresAt`, `documentSchemaVersion`, and the persisted canonical
`document` (whose own `placement` carries the stable Side and Area identities
B07 already publishes). No competing Session shape was introduced. `scope` and
`lineage` are omitted, exactly as resume omits them.

The response is **persisted truth, not an echo**: the live suite asserts the
returned document equals the stored row.

## 3. Locked semantics preserved

| `IMP-D043` rule | How |
| --- | --- |
| `ACTIVE → ACTIVE` | the CAS predicate requires ACTIVE and unexpired |
| every mutation carries expected revision | required request field, presented to the CAS |
| match → one update, one increment | `saveDocument` sets document, schema version and `revision + 1` in one statement |
| stale → `STALE_WRITE`, no mutation | translated to `designSessionStaleWrite()` → **409**, nothing written |
| ambiguous → refetch, never blind replay | **no idempotency record exists for autosave**, by design |
| one in-flight mutation | inherited B06A limiter, unchanged |
| 30/minute mutation ceiling | inherited, unchanged; the gate refuses a widened value |
| 30-day absolute expiry, never extended | `expires_at` absent from the SET; asserted live |
| cadence | `AUTOSAVE_CADENCE_OWNER = APP3-S11`, recorded and gated |

`last_activity_at` moves only because the existing repository authority already
moves it. It is activity metadata; the TTL basis is untouched.

## 4. The durable write

One atomic compare-and-set, and it is **DB7's own** `saveDocument` (G-DB7-19)
reused rather than restated — there is exactly one definition of what an autosave
may touch, and no SQL was duplicated into the service or controller.

```text
WHERE  id = :id
  AND  status = 'ACTIVE'
  AND  expires_at > now
  AND  autosave_revision = :expectedRevision
SET    design_document, document_schema_version,
       autosave_revision = autosave_revision + 1,
       accepted activity timestamps only
```

**Ordering.** Every expensive step — placement lookup, P01 structure/complexity,
quantization, canonicalization, P02 geometry, media eligibility — runs *before*
the transaction opens. The transaction contains one guarded UPDATE and nothing
else. Validating inside it would hold a row lock across work that cannot fail the
CAS; the gate refuses that reordering.

Reading the session before validating and writing under `expectedRevision` is not
a race: the CAS decides. A writer landing in between moves the revision and this
save loses, which is the contract.

**Not touched:** `expires_at`, `session_secret_hash`, Product/Side/Area ids,
Template lineage, submission state, customer identity. **Not written:** no
idempotency record, no Outbox event of any kind, no normalization or inspection
event.

## 5. P01 and P02

`DesignDocumentAuthority.validateForSave` composes the accepted authorities in
the order their contracts require. No B08-local validator, no local schema, no
renderer or SVG/Canvas import.

1. `readSchemaVersion` — a future or unsupported version is refused as such.
2. `prepareDesignDocument` — structure, complexity, quantization,
   canonicalization, **and revalidation after quantization**, because rounding
   can push a value onto a boundary the schema rejects.
3. `validatePlacementSnapshot` — P02, against the live Side and Area.
4. `validateDocumentWithinEmbroideryArea` — P02 containment.
5. `validateDesignDocumentContext` — P01-C1 media, §6.

**What is persisted is `prepared.document`** — the canonical, quantized value —
never the caller's object. Proved live: `x: 150.000000004` is stored as `150`.

P01-C1 is preserved unchanged because it is *reused*: identity keyed by
`assetId`, one `derivativeId` per Asset per document, conflicting pairs rejected,
decoded pixels counted once per unique Asset.

**Placement authority is the Session's own persisted identity** (§7 of the
directive). `SessionPlacementResolver` reads by id through the placement port
`CatalogPlacementReadModule` already exports. Two consequences are deliberate:

- `findPlacement` projects retired rows too, so `retiredAt` arrives as the **real
  value**. B07's public-manifest resolver can hard-code `retiredAt: null` because
  a retired row never appears there; reading by id makes retirement a genuine
  possibility, which P02 is then allowed to refuse.
- The Area must belong to that Side, checked explicitly — otherwise a Session
  could be validated against an Area from a different Side of the same Product.
- Publication is **not** re-checked. `studioEligible` governs whether a Session
  may be *opened*; a Product unpublished mid-session does not retroactively make
  a customer's in-progress work unsavable. Retirement of the actual Side or Area
  is the geometry-affecting change, and that is caught.

## 6. Media authority

`validateDesignDocumentContext` decides eligibility from a map of derivative
records. B08 builds that map — **and the map is the allowlist.**

Nothing else enforces "no cross-session reference". A derivative belonging to
another Session's upload is simply never put in, so the document's reference
resolves to nothing and P01-C1 rejects it as unknown. Fail-closed by
construction, rather than a comparison someone can forget to write. The unit
suite asserts this *by omission*, which is the only way to prove such a rule.

Two sources, and the asymmetry is the point:

- **this Session's own uploads** (`design_session_assets` — `APP3-B06B` is the
  only way a row gets there);
- **Assets the Session's already-accepted document references**, which is how a
  Template clone's media survives without re-deriving Template visibility here.

The consequence, stated plainly: **a new image reference can only ever name an
Asset this Session uploaded itself.**

No object-storage call is made to validate a document (`IMP-D044`); the gate
refuses one. Eligibility comes from the `APP3-DB01` metadata quartet, which
required projecting `width_px`/`height_px`/`media_type`/`byte_size` onto the
Asset read model — they existed in the schema and were being dropped by the API
projection. That is a read-only widening; no migration.

**A finding worth recording.** The live suite originally tried to seed an
unmeasured `NORMALIZED`/`READY` derivative to prove the API refuses it. The
database refused the insert first:
`ck_asset_derivatives__ready_normalized_metadata` makes that row *impossible*.
The API branch is still covered by the unit suite, but the live test now asserts
the constraint — the database, not the application, is what guarantees a
placeable derivative was measured.

## 7. Evidence

### Focused unit/contract — 33 passed / 33

Covers all 23 required cases in §11 of the directive, including: missing,
negative and fractional revision; missing document; invalid structure;
unsupported future version; unknown fields; complexity; conflicting derivative
IDs for one Asset; derivative belonging to another asset; non-`READY`/
non-`NORMALIZED`; unmeasured; cross-session reference (by omission); placement
tamper; canvas-scale tamper; out-of-bounds; canonical persistence; single
increment; stale → 409; stale writes nothing; expiry and secret untouched; no
`Set-Cookie`; no event; no secret or storage material in the response.

### Live disposable PostgreSQL — 23 passed / 23

`CMD-TEST-APP3-B08-INTEGRATION`. **No Docker container:** autosave performs no
object-storage I/O, so the offline placeholders `createApiIntegrationContext`
already installs are sufficient. Adding a MinIO container would only have proved
the suite can start one.

| Group | Proved |
| --- | --- |
| success | canonical document persisted, schema version persisted, revision `+1` exactly once, response equals the stored row, expiry unchanged, secret digest unchanged, status still ACTIVE, outbox count unchanged, no `Set-Cookie`, quantized form stored, sequential `0 → 1 → 2`, session-uploaded image accepted |
| stale | 409, document unchanged, revision unchanged, expiry unchanged, no event; a future revision refused identically |
| authorization | foreign cookie 401 with neither session mutated; expired 401; terminal 401; cross-site 403 — none writing |
| invalid document | invalid structure, future version, tampered placement identity, tampered canvas scale, out-of-bounds, cross-session image, non-`READY` derivative — each 422 with document and revision unchanged; missing `expectedRevision` and a fractional revision each 400 |
| schema guarantee | an unmeasured `NORMALIZED`/`READY` derivative cannot be inserted at all |
| **concurrency** | **10 iterations, one invocation** |
| B07 interop | resume observes the saved document and revision, expiry unchanged |

**The race (§10/§12).** Ten iterations inside a single test, each firing two
concurrent writers at the same `expectedRevision` with different valid documents.
Per iteration: statuses sort to exactly `[200, 409]`, the revision advances
exactly once, and the persisted document is the **winner's, whole** — never a
blend. Repeating the Jest run would only have shown whether the suite is flaky;
looping in-process is what samples the interleaving.

### Gates

| Command | Result |
| --- | --- |
| `node tools/check-app3-b08.mjs` | exit 0 (chains B06B → the whole APP3 graph) |
| `node --test tools/check-app3-b08.test.mjs` | **57 / 57** |
| `check-app3-p01`, `p02`, `g03`, `g04`, `b06a`, `b07` | exit 0 each |
| `openapi:check` | artifact up to date |
| `check:generated` (client) | up to date at the recorded tree hash |
| api typecheck / build / lint | exit 0 |
| api-client typecheck / test | exit 0 / **44 passed** |
| `format:check`, `git diff --check` | exit 0 |

## 8. Gate reconciliation, and one proxy this checkpoint invalidated

Four predecessor gates needed reconciling, and one of them for a substantive
reason rather than a count.

**`APP3-P03` — the empty-body rule was a proxy.** P03 refuses any request-body
schema that is `type: object` with no properties, because `createZodDto` once
published *every* body that way (`APP3-B01-C1`). B08's `document` field is an
object with `additionalProperties` and a description — a deliberate open map, not
a schema that says nothing. The rule now treats "empty" as *no properties **and**
no `additionalProperties`*, which still catches P03's own mutation
(`{ type: 'object', properties: {} }`) and every real instance of the defect.
This is the same shape of finding as `APP3-B06B`'s word-ban: a gate asserting a
proxy for a property, invalidated by the first legitimate operation the proxy
misjudges.

The alternative — mirroring the P01 schema into the DTO so it publishes named
properties — was rejected: it would create the second, drifting definition of the
Design Document that §6 of the directive forbids.

**The other three are bookkeeping**, and each was made mode-aware rather than
re-pinned:

- `check-app3-b06b.mjs` and `check-app3-b07.mjs` each asserted
  `APP3-B08 = READY — NOT STARTED`. Both now accept either world: what they ruled
  is that B08 *is a successor*, not which review stage it has reached.
- `check-app3-g08.mjs` widened its B06B successor alternation to include
  `REVIEW_ACCEPTED`.
- `app3-accepted-surface.mjs` gained the B08 world (23/27/50, four Session
  paths); `check-app3-b01n-artifacts.mjs` gained the sixth frozen-digest world.
  Every earlier world is retained, so a rollback to any earlier phase state is
  still checked against what that state actually published.

`B06B_DELIVERED_STATUS` — the single constant introduced by B06B-C1 — absorbed
the `REVIEW_DELIVERED_AFTER_C1 → REVIEW_ACCEPTED` change in **one** edit across
three gates. That is the value of having made it a constant.

## 9. Changed files

**New — API source (5)**

| File | Lines |
| --- | --- |
| `application/autosave-design-session.use-case.ts` | 133 |
| `application/session-placement.authority.ts` | 103 |
| `application/session-document-media.authority.ts` | 110 |
| `presentation/schemas/design-session-autosave.request.ts` | 61 |
| *(all under the 400-line source limit)* | |

**New — tests (3):** `design-session-autosave.spec.ts` (521),
`test/integration/design-session-autosave.integration.spec.ts` (404),
`test/support/design-session-autosave-context.ts` (147). Both specs are under the
600-line test limit.

**New — tooling (4):** `check-app3-b08.mjs` (357),
`check-app3-b08-contract.mjs` (150), `check-app3-b08-files.mjs` (66),
`check-app3-b08.test.mjs` (469). The gate was split when the single file reached
536 lines against the 450 soft cap.

**Modified — API source (6):** `design-document.authority.ts` (the save
pipeline), `public-design-session.controller.ts` (the operation),
`design-session-authorization.ts` (`designSessionDocumentRefused`),
`design.module.ts` (three providers), `asset/domain/repositories/asset.repository.ts`
and `asset/infrastructure/persistence/asset-row.mapper.ts` (the quartet
projection).

**Modified — tooling (5):** `app3-accepted-surface.mjs`,
`check-app3-b01n-artifacts.mjs`, `check-app3-b06b.mjs`, `check-app3-b07.mjs`,
`check-app3-g08.mjs`, `check-app3-p03-contract.mjs` — six files.

**Modified — docs (6):** phase plan, roadmap, traceability matrix, phase source
map, scoped command index, security and abuse prevention.

**Modified — generated (3):** OpenAPI artifact, two client files.

**Total in commit A: 32 files, +3116 / −39.**

## 10. Confirmations

```text
migrations             = 34   (unchanged)
external dependencies  = 0    added
root package scripts   = 30   (unchanged)
worker changes         = 0
Outbox events written  = 0    (asserted live: count unchanged across a save)
cookie issuance        = 0    (asserted live: no Set-Cookie on autosave)
secret rotation        = 0    (asserted live: digest unchanged)
idempotency records    = 0    (none exists for autosave, by design)
expiry extension       = 0    (asserted live: expires_at unchanged)
```

## 11. Command ledger and budgets

| Command | Budget | Used | Terminal result |
| --- | --- | --- | --- |
| preflight/status reads | 1 grouped | 1 | baseline 22/26/49, 34 migrations, 30 scripts |
| B06B direct gate | 1 | 0 — **reused** via the B08 chain | exit 0 inside `check-app3-b08` |
| focused B08 unit/contract | 3 | 3 | 29/33 → 33/33 → 33/33 |
| API typecheck | 3 | 3 | exit 0 |
| API build | 2 | 1 | exit 0 |
| live B08 integration | 5 | **3** | 16/23 → 22/23 → **23/23** |
| B08 checker | 6 | 2 | failures → exit 0 |
| B08 checker tests | 6 | 2 | 56/57 → **57/57** |
| P01/P02/G03/G04/B06A/B07 gates | 1 each | 1 each | exit 0 |
| OpenAPI generate | 1 | 1 | 23/27/50 |
| OpenAPI check | 2 | 1 | up to date |
| client generate | 1 | 1 | tree hash recorded |
| client currentness | 2 | 1 | up to date |
| client typecheck / test | 1 / 1 | 1 / 1 | exit 0 / 44 passed |
| format:check | 2 | 1 | exit 0 |
| lint | 2 | 2 | exit 0 |
| `git diff --check` | 1 | 1 | exit 0 |

Not run, as required: `pnpm quality`, `pnpm install`, the full API suite, the
full repository integration suite, the worker suite, frontend tests, E2E, Figma,
benchmarks.

**Reused rather than rerun:** the B06B direct gate — `check-app3-b08.mjs` chains
`checkApp3B06B` and reported it green, so a separate invocation would have been
the same command on the same fingerprint.

### Failure clusters, consumed in full before each rerun

- **Unit run 1 (29/33).** All four failures were doubles in my own spec, not the
  implementation: `undefined ?? default` cannot express "explicitly absent", so
  tests asking for a missing session or missing placement silently received one;
  a look-alike error object fails `isPersistenceError`, which is an `instanceof`
  check, so the 409 mapping was being proved against nothing; and one double
  ignored the argument it was given.
- **Live run 1 (16/23).** One root cause for six: a hand-written shape element
  missing `stroke`/`strokeWidthPx`. Plus the derivative-constraint discovery in
  §6.
- **Live run 2 (22/23).** The constraint name lives on the error's `cause`, not
  the Drizzle wrapper's message.
- **Checker tests run 1 (56/57).** A real weakness in my own rule, not the test:
  `/mutation[\s\S]{0,120}?30/` also matches a widened `300`, so the check would
  have passed on precisely the change it exists to refuse. Now anchored with
  `\b`.

## 12. Limitations

1. **`document` is published as an open object.** A client reading only the
   OpenAPI document learns that a Design Document snapshot is required, not what
   it contains; the canonical schema lives in `@embroidery/design-document`. This
   is the deliberate trade against a second, drifting definition (§2).
2. **Publication is not re-checked on save** (§5). A Session opened on a
   Studio-eligible Product keeps saving if the Product is later unpublished. Side
   or Area *retirement* is refused.
3. **The live suite proves this operation, not the Studio.** Cadence, debounce,
   offline queueing and conflict UX are `APP3-S11`'s.
4. **Concurrency is sampled, not exhausted.** Ten in-process iterations is strong
   evidence of a real single-winner CAS, not a proof of every interleaving.
5. `AutosaveDesignSessionUseCase` reads the session, then validates, then writes
   under the CAS. Under contention the losing writer performs full validation
   before being refused. That is correct but not free; if autosave contention
   ever becomes hot, the cheap pre-read of the revision is the obvious first
   optimisation, and it changes no semantics.

## 13. Status

```text
APP3-B06B-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-B06B = COMPLETE — REVIEW_ACCEPTED
APP3-B08 = COMPLETE — REVIEW_DELIVERED
AUTOSAVE_CADENCE_OWNER = APP3-S11
FU-PLATFORM-ZOD-DTO-OPENAPI-PARAMETERS-01 = OPEN — NONBLOCKING_EXISTING_SURFACE_CLEANUP
```

Carried forward unfixed, as instructed: `G08_TEST_HARNESS_DEBT` (five
pre-existing `check-app3-g08.test.mjs` failures) and
`SESSION_IDEMPOTENCY_SCOPE_LABEL_NOTE` (the anonymous hash input inheriting the
literal `staff:` prefix).

Human review decides acceptance.
