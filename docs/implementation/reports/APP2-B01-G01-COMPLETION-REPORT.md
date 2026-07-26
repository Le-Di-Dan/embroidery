# APP2-B01-G01 — Asset-Intake Entry-Gate Closure — Completion Report

- Checkpoint: `APP2-B01-G01` — close the asset-intake idempotency, reclaim,
  result-schema and upload-policy gate
- Type: decision/gate (documentation + evidence only), executed **under
  `APP2-B01` ownership**
- Date: 2026-07-27
- Verdict: **`PASS`**
- Not: `APP2-DEC-STORAGE-C3` · not `APP2-B01` implementation · not an
  exploratory architecture checkpoint

---

## A. Preflight and authority chain

`APP2_B01_G01_PREFLIGHT = PASS` — full, not partial.

| Requirement | Observed |
|---|---|
| Branch | `production` |
| `HEAD` | `8775734493638fe47b3df38d823db11345cbe749` — `docs(app2): record final worker-runtime evidence` = the **`APP2-I02-FD1` Commit F** read from Git, exactly as required |
| Working tree | `git status --short` empty |
| Baseline `pnpm quality` | `EXIT=0` before any edit |
| Baseline artifact checks | OpenAPI up to date; API-client tree hash `89c1aace…`; DB manifest all checks passed (78 tables / 833 columns / 31 migrations) |

**Evidence chains verified in `git log`:**

| Chain | Commits |
|---|---|
| Storage decision A–F | `52d582e` · `ecef0cd` · `0c8afd5` · `3fce01b` · `86d3b91` · `3b167dc` |
| `APP2-I01` object storage | `48e676d` + `a82f4f2` |
| `APP2-I02` foundation | `1d748ef` + `bfc2a60` |
| `APP2-I02-C1` correction | `53417db` + `fd93ab3` |
| `APP2-I02-FD1` final proof | `43546a6` (E, known) + **`8775734` (F, read from Git)** |

Frozen baselines at entry, all unchanged at exit:

```text
OpenAPI      ae015dd65dc2f64c902145f19d5fa5fae6cd6423a54934c1126cd289e3d30946
API client   89c1aace328eef1ee05a74950faa48bf907babece025a6abb9ca1baa1574502f
Database     31 migrations · 78 tables · 833 columns
             4ca56a5967730d257edb34e72d6c40373156704cab7c87e3a684803c8321672f
Figma        69 registry IDs
```

---

## B. Existing schema and repository audit

Read from source before any documentation change. Nothing below is inferred
from an earlier report.

### B.1 `idempotency_records` (TBL-074)

`packages/database/src/schema/platform/idempotency-records.ts`:
`id`, `operation_namespace`, `scope_key`, `fingerprint`, `status`, `result`
(nullable `jsonb`), `expires_at`, `claimed_at`, `completed_at`, `created_at`,
`updated_at`. Arbiter `CST-048` = `unique(operation_namespace, scope_key)`.
States `LC-23` = `IN_PROGRESS | COMPLETED` — **there is no `FAILED` state**.
The file states explicitly that `status`/`result`/`expires_at`/`claimed_at`/
`completed_at` are **mutable by design (DB5-A10)** and that no immutability
trigger belongs on the table. Measured: **zero** non-internal triggers (§K/P2).

**Consequence:** every field the gate model needs — the versioned result union,
the rotating `claimToken`, the renewed claim and expiry — already has a column.

### B.2 `IdempotencyStore` (`packages/persistence/src/platform/idempotency-store.ts`)

Exactly `claim`, `complete`, `release`, `find`. Behaviour read from code:

- `claim` inserts with `onConflictDoNothing` on the arbiter — deliberately not
  catching 23505, because a caught unique violation would abort the caller's
  transaction and take the domain work with it. On conflict it re-reads and
  returns `replay` (COMPLETED) / `in_progress`, or throws
  `IDEMPOTENCY_CONFLICT` on a fingerprint mismatch.
- `complete` is gated on `status = 'IN_PROGRESS'`; zero rows →
  `IDEMPOTENCY_CLAIM_NOT_HELD`.
- `release` **deletes** the `IN_PROGRESS` row.

**Gaps found (implementation, not schema)** — these are the authoritative list,
recorded in `ADR-APP2-001` §4.2f-7:

1. `claim` never writes `result`, so the allocation cannot be persisted at claim
   time (already known from C2; re-verified in source).
2. **New finding:** `claim` is **not expiry-aware**. An `IN_PROGRESS` row whose
   `expires_at` has passed still returns `in_progress`, so the reclaim path in
   §G does not exist at all today.
3. **New finding:** no row lock. `claim`/`find` issue plain `SELECT`s; the
   single-winner reclaim of §G needs `FOR UPDATE`.
4. **New finding:** no `result`-only update on a held claim, which is what
   `claimToken` rotation requires.
5. `release`'s delete semantics **conflict** with rotate-in-place reclaim and
   must not be used on the reclaim path (see §F).

### B.3 `assets` (TBL-022) and `AssetRepository`

Schema: `id`, `kind`, `classification`, `storage_key` (unique, `CST-017`),
`mime_type`, `size_bytes` (`bigint`, `> 0`), `checksum` (`^sha256:[0-9a-f]{64}$`),
`status`, provenance columns, two-phase tombstone columns. States `LC-06` =
`UPLOADED | INSPECTING | ACCEPTED | REJECTED | DELETION_PENDING | DELETED`.
`IDX-086` is the partial `(created_at, id) WHERE status IN ('UPLOADED','INSPECTING')`
processing sweep.

`ASSET_KINDS` = `CUSTOMER_UPLOAD | TEMPLATE_SOURCE | PRODUCTION_FILE |
CATALOG_MEDIA | GALLERY_MEDIA`. `ASSET_CLASSIFICATIONS` = `CUSTOMER_PRIVATE |
PRODUCTION_SENSITIVE | PUBLIC`.

`apps/api/src/modules/asset/**` — `AssetRepository` + `DrizzleAssetRepository`
provide `register` (inserts `status: 'UPLOADED'`), `recordInspection`
(`ACCEPTED`/`REJECTED`), derivative operations, `tombstone`, `findById`,
`findByStorageKey`, `listDerivatives`, `listInspections`.

**Gaps found:** `register` is a plain insert with no insert-or-recover on the
same `assetId` (Tx A needs one); there is **no** `UPLOADED → INSPECTING`
transition operation at all (Tx B needs a guarded one); and there is no
cursor-paginated asset listing (operation 3 needs one — `ADR-DB5-001` keyset,
for which `packages/persistence/src/query/keyset-cursor.ts` already exists).

### B.4 `outbox_events` (TBL-073)

`CST-099` restricts mutation to `status`, `attempt_count`, `next_attempt_at`,
`claimed_by`, `claimed_at`, `dispatched_at`, `last_error`; the payload and event
identity are immutable. `id` is a sequence column — so the
`inspectionEventId` recorded in the completed result is that generated id, read
back from the insert inside Tx B. `OutboxEventStore.append` is the sanctioned
insert path (`APP2-DEC-JOBS`), and `APP2-I02`'s `WorkerJobQueueRepository` is
the consumer. Nothing about the gate model touches the worker contract.

### B.5 Object storage

`packages/object-storage/src/object-storage.port.ts` — exactly six operations:
`putObjectStream`, `getObjectStream`, `headObject`, `deleteObject` (idempotent
by contract), `listObjectsByPrefix` (prefix-scoped; no list-all),
`ensurePrivateBuckets`. `ObjectStorageBucket` = `ORIGINALS | DERIVATIVES`,
which is exactly the `bucketAlias` domain the result union uses.

`object-key.ts` builds `{env}/originals/{assetId}/original.{ext}` and
`{env}/derivatives/{assetId}/{kind}.{ext}` with a UUIDv7-validated asset id and
an extension derived from the validated content type
(`image/png`→`png`, `image/jpeg`→`jpg`, `image/webp`→`webp`; everything else,
including SVG, is rejected). `buildAssetPrefix` gives the exact per-asset
prefixes the §G cleanup needs, and `assertValidObjectPrefix` requires a trailing
`/` so a prefix cannot straddle a segment boundary.

**Every operation the §G cleanup ordering requires already exists on the port.**
No port change is needed for `APP2-B01`.

### B.6 HTTP boundary

- Guards: `AuthenticatedAdminGuard`, `StaffOriginGuard`, `StaffJsonBodyGuard`
  (the JSON guard is login-scoped and must **not** be applied to the multipart
  upload route).
- Envelope: `apps/api/src/platform/http-response/` — `API_ERROR_CODE` is a
  deliberately **transport-level** set only; the file states that business codes
  belong to the feature that owns the rule and are supplied per endpoint. So
  `IDEMPOTENCY_CONFLICT`, `ASSET_UPLOAD_IN_PROGRESS`, `STALE_UPLOAD_CLAIM` and
  `IDEMPOTENCY_RESULT_INVALID` are named by `APP2-B01`, exactly as `ADR-APP2-001`
  §4.2e anticipated.
- Route convention observed in the repository: `@Controller('staff/session')`
  under the global `api` prefix → `/api/staff/session`. The committed (inactive)
  nginx seam uses `/api/admin/assets/upload` as its illustrative location. The
  gate does **not** fix the final path; it fixes the three capabilities.
- Request context / correlation (`X-Request-ID`, `AsyncLocalStorage`) and the
  persistence error taxonomy (`PersistenceError`, non-enumerable `diagnostics`)
  are unchanged and already carry everything the gate model needs.

### B.7 Nginx upload seam

`infrastructure/nginx/templates/includes/upload-proxy.conf.template` exists and
is **inert** — nothing includes it, `tools/nginx-upload-seam.test.mjs` fails if
it becomes active early, and it carries exactly one directive
(`proxy_request_buffering off`). Its comments name the three deliberately unset
hooks and the reason: `client_max_body_size` was "blocked on the open Product
Owner parameter". That parameter is now closed (§C), so `APP2-B01` fills them.

Measured http-level defaults (`.env`, `.env.example`,
`infrastructure/compose/docker-compose.dev.yml`, `…e2e.yml`):
`GATEWAY_CLIENT_MAX_BODY_SIZE=20m`, `GATEWAY_PROXY_READ_TIMEOUT=60s`,
`GATEWAY_PROXY_SEND_TIMEOUT=60s`.

**Reconciliation recorded:** the http-level ceiling (`20m`) is *below* the
approved route ceiling (`27m`). Nginx resolves `client_max_body_size` at the
most specific level, so the upload `location` overrides it **upward** to `27m`
for that route only. The global value stays `20m` — no global change, exactly as
`ADR-APP2-001` §4.2c requires.

---

## C. Product Owner policy decisions

Recorded verbatim as binding; not re-derived, not softened to "configurable
later", not converted to other units.

| Parameter | Approved value |
|---|---|
| Maximum raster product-image file size | **25 MiB = 26 214 400 bytes** |
| Accepted uploaded media | `image/png`, `image/jpeg`, `image/webp` |
| Uploaded SVG | **rejected** |
| Non-image embroidery source files | **excluded from APP2** |
| Original-asset retention | retained while the asset exists; unpublish never deletes the original; **no** automatic age-based original deletion in APP2 |
| API authoritative file counter | 26 214 400 bytes |
| Coarse Nginx multipart request ceiling | **27 MiB = 28 311 552 bytes** (envelope headroom; **not** the authoritative validator) |
| API hard upload duration | **5 minutes** |
| Gateway upload timeouts | strictly greater than 5 minutes, in the existing `${GATEWAY_*}` units |
| Idempotency `IN_PROGRESS` allocation TTL | **15 minutes** |

Required relation **satisfied**: 15 min > 5 min + cleanup/finalization margin —
a 10-minute margin between the hard abort of a request and the earliest moment
its own allocation can be reclaimed by anyone else.

`UPLOAD-POLICY-BLK-01 = RESOLVED_BY_PRODUCT_OWNER`. `ADR-APP2-001` §7 changed
from "parameters requiring review" to "parameters resolved"; nothing in that ADR
now blocks `APP2-B01` execution.

**Naming conflict reported, not silently resolved.** The gate input specified
`"assetKind": "PRODUCT_IMAGE"` in the request fingerprint. `PRODUCT_IMAGE`
appears **nowhere** in the repository (verified by full-tree search across
`*.ts` and `*.md`). The locked `ASSET_KINDS` check constraint
(`ck_assets__kind_allowed`, `DB4_COLUMN_DICTIONARY` COL-TBL022-01) admits
`CATALOG_MEDIA` for product media. Per the source-of-truth order, the locked
database enum governs: **`assetKind` takes a canonical `ASSET_KINDS` value, and
APP2 product-image intake is `CATALOG_MEDIA`.** `PRODUCT_IMAGE` remains product
language and is never a persisted or fingerprinted value.

A second, related constraint is recorded rather than invented: intake must never
set `classification = 'PUBLIC'` (INV-09 — `PUBLIC` is reached only through
publication). Which non-public value catalog media takes at intake is a bounded
choice from the locked set, made in `APP2-B01`; the gate does not guess it.

---

## D. Two-stage fingerprint (`STORAGE-BLK-01`)

The unresolved C2 ambiguity was that §4.2e locked a **pre-stream** fingerprint
but never defined what makes a *completed* replay content-complete. The closure
is two fingerprints with different lifetimes and different homes.

### D.1 Request fingerprint V1 — the column

Stored in `idempotency_records.fingerprint`, immutable after claim. SHA-256,
lowercase hex, `sha256:` prefix, over canonical UTF-8 JSON with
lexicographically sorted keys and no whitespace dependence:

```json
{
  "version": 1,
  "operationNamespace": "admin.asset.upload",
  "scopeKey": "<authenticated staff/account scope + idempotency key>",
  "assetKind": "<canonical ASSET_KINDS value — CATALOG_MEDIA for APP2>",
  "classification": "<canonical ASSET_CLASSIFICATIONS value, never PUBLIC>",
  "declaredMediaType": "image/png | image/jpeg | image/webp",
  "normalizedFilename": "<bounded normalized filename>"
}
```

Excluded by contract: raw file bytes, the content SHA-256, cookies, request id,
multipart boundary, ETag. The idempotency key participates **inside** `scopeKey`
and is never exposed separately in a log or a result.

Same scope key + different request fingerprint → `IDEMPOTENCY_CONFLICT`,
409-class, **zero** object acceptance, no stored-result leakage beyond the
authorized safe conflict response. This is the existing
`IdempotencyStore.claim` behaviour, unchanged.

### D.2 Content fingerprint V1 — the result

Computed only from server-observed facts, only after the entire file has been
consumed and validated; same sorted-key canonicalisation:

```json
{ "version": 1, "mediaType": "…", "byteSize": 26214400, "checksum": "sha256:<64 hex>" }
```

Stored as `contentFingerprint` **inside** the completed result — never in the
immutable column. The server-computed SHA-256 stays the only authority
(`ADR-APP2-001` §4.6 Option A); no client checksum is required and none is
accepted as authoritative.

### D.3 Complete replay decision

A completed replay is valid only when **both** fingerprints match. Because no
client checksum exists, a retry of a completed upload **must resend the
multipart body**. Required API order:

1. Parse the canonical metadata first.
2. Match the request fingerprint.
3. Consume the entire file into the **validation/hash-only** path.
4. Perform **no object-store write**.
5. Recompute byte size, signature/media type, SHA-256, content fingerprint.
6. Return the stored safe result **only** on a content-fingerprint match.
7. Return `IDEMPOTENCY_CONFLICT` when it differs.

This preserves server-owned integrity, content-complete idempotency, and zero
object re-upload after a lost completed response. **A metadata-only replay is
not content-complete and is not described as one anywhere in the updated
documentation.**

### D.4 Active `IN_PROGRESS` duplicate

Same request fingerprint while the allocation is unexpired →
`ASSET_UPLOAD_IN_PROGRESS`, 409-class, no second object upload. The server may
stop/drain the body per the canonical HTTP-abort convention but must never
process a second file stream.

### D.5 Media-type consequence (recorded)

The object key is allocated **pre-stream** and its extension is derived from the
content type (`object-key.ts`), so the only value available at allocation time
is `declaredMediaType`. Therefore an accepted asset's validated media type must
**equal** its declared media type; a signature contradicting the declaration is
a rejection, never a key rewrite. Without this the allocated key and the stored
object could disagree.

---

## E. Result JSON union (`STORAGE-BLK-02`)

One closed, versioned, discriminated union in `idempotency_records.result`.
Internal persistence data — **not** the public API response body.

**Allocation variant** — written in the same transaction as the first
`IN_PROGRESS` claim:

```json
{ "schemaVersion": 1, "kind": "ASSET_UPLOAD_ALLOCATION",
  "assetId": "<UUIDv7>", "bucketAlias": "ORIGINALS",
  "objectKey": "<deterministic PII-free key>", "claimToken": "<random UUID>",
  "requestFingerprintVersion": 1 }
```

**Completed variant:**

```json
{ "schemaVersion": 1, "kind": "ASSET_UPLOAD_COMPLETED",
  "assetId": "<UUIDv7>", "bucketAlias": "ORIGINALS", "objectKey": "<same key>",
  "mediaType": "image/png | image/jpeg | image/webp", "byteSize": 26214400,
  "checksum": "sha256:<64 hex>", "contentFingerprint": "sha256:<64 hex>",
  "assetStatus": "INSPECTING", "inspectionEventId": "<outbox event id>" }
```

Decoding is strict: exact `schemaVersion`, exact `kind` discriminant, exact
required fields, no unknown-field trust, UUID and checksum format validation,
`byteSize` an integer within the approved maximum, a `bucketAlias` that must be
`ORIGINALS`, and an object key matching the asset id and MIME-derived extension. No public
URL, no credential, no raw filename, no actor email ever appears in a result.

State/result invariant: `IN_PROGRESS ⇒ ASSET_UPLOAD_ALLOCATION`;
`COMPLETED ⇒ ASSET_UPLOAD_COMPLETED`. A malformed, unsupported or contradictory
stored result is `IDEMPOTENCY_RESULT_INVALID` — safe 5xx category, **no** object
write, **no** lifecycle transition. Older/unversioned JSON is never silently
coerced; there is no APP2 legacy production data, so no compatibility fallback
is defined.

**Measured storage caveat (§K/P9).** PostgreSQL `jsonb` normalises object key
order — the allocation variant authored as
`schemaVersion,kind,assetId,bucketAlias,objectKey,claimToken,requestFingerprintVersion`
comes back as
`kind,assetId,objectKey,claimToken,bucketAlias,schemaVersion,requestFingerprintVersion`.
Consequences now recorded in the ADR: a stored result must be decoded
**field-by-field** and must **never** be re-serialised to reproduce a hash. Both
fingerprints are canonicalised and hashed in application code *before* storage
and are never recomputed from a `jsonb` round-trip.

---

## F. Claim token and stale-owner protection

`claimToken` exists for exactly one failure: a stale request finalizing after its
expired allocation was reclaimed by someone else.

| Situation | Token behaviour |
|---|---|
| New claim | generate |
| Active retry (unexpired) | **does not rotate** |
| Expired reclaim | **rotate atomically**, preserving `assetId` and `objectKey`, renewing `claimed_at` and the 15-minute `expires_at` |
| Tx A and Tx B | verify the current token **inside** their own database transaction |

A stale token yields `STALE_UPLOAD_CLAIM` — a safe conflict/retry category with
**no** asset mutation, **no** outbox mutation and **no** idempotency completion.
The token never appears in a browser-visible response or in a log. It uses the
mutable `result` jsonb plus existing row locking; **no schema change**.

**This supersedes** the `ADR-APP2-001` §4.2e concurrency-matrix row "same key
after failed/expired claim → expired `IN_PROGRESS` reclaimed (**delete**),
re-claimed". Delete-and-re-claim would mint a *new* `assetId` and a *new* object
key, orphaning the first object and destroying the one-identity guarantee the
durable allocation exists to provide. Reclaim now rotates in place instead, and
`IdempotencyStore.release`'s delete semantics are explicitly **not** used on the
reclaim path.

---

## G. Expired reclaim and cleanup ordering (`STORAGE-BLK-03`)

**Step 1 — lock and classify**, one transaction: lock the idempotency row →
verify `IN_PROGRESS` → verify expiry **using database time** → verify the
request fingerprint → strictly decode the allocation result → rotate
`claimToken` → renew the claim and 15-minute expiry → commit. Only one
concurrent reclaimer wins (proven, §K/P5).

**Step 2 — inspect durable asset truth** by the allocated `assetId`, only after
the renewed claim has committed.

**Asset exists** — never delete the original object, never delete derivative
prefixes; resume from the truthful lifecycle:

| Asset state | Handling |
|---|---|
| `UPLOADED` | validate the resent body through the hash-only path; on a match with persisted metadata, execute Tx B |
| `INSPECTING` | verify the matching outbox intent; complete/reconstruct the idempotency result safely |
| later valid lifecycle | return or reconstruct the authorized safe result **only** when the stored facts prove the upload had already finalized |
| `REJECTED` / contradictory | canonical safe lifecycle conflict/error |

**Asset does not exist** — the renewed claimant owns cleanup, in this exact
order: verify the current claim token → delete the exact allocated original
object key when it exists → delete **only** the APP2-owned derivative prefix for
that asset id → verify the controlled prefixes are empty → verify the claim
token is **still** current → only then accept and stream the new file to the
same allocated original key. Replacement streaming never starts before cleanup
completes; a delete never happens after replacement streaming has started.

**Cleanup failure** — accept no new object, insert no asset, do not release or
delete the allocation record; return a retryable safe storage error and leave the
renewed allocation to expire for another reclaim attempt.

**Active-request safety** — 5-minute hard upload duration vs 15-minute
allocation TTL guarantees a normal request is aborted long before its own
allocation can expire; the pre-Tx-A and pre-Tx-B token checks cover the residual
window. No staging-copy promotion and no second object-key model is introduced.

Every object-store call this ordering needs already exists on `ObjectStoragePort`
(§B.5) — `deleteObject` is idempotent by contract, so a retried cleanup never
fails on its own earlier progress, and `listObjectsByPrefix` over
`buildAssetPrefix` is the emptiness verification.

---

## H. Tx A / Tx B and replay windows

**Pre-stream claim transaction:** claim `IN_PROGRESS`, persist
`ASSET_UPLOAD_ALLOCATION`, commit **before** streaming.

**Object stream:** `busboy` streaming parser · one file only · metadata before
file · incremental 25 MiB hard counter · MIME allowlist · signature validation ·
server SHA-256 · `ObjectStoragePort.putObjectStream` · `AbortController` on
limit, parser failure, disconnect or timeout.

**Tx A — post-object durable asset.** Verify the current claim token and request
fingerprint, then atomically insert-or-recover the **same** `assetId` with
`status = 'UPLOADED'`, persisted original object key, media type, byte size and
server SHA-256. **No outbox event in Tx A.**

**Tx B — inspection handoff.** Verify the current claim token and a truthful
`UPLOADED` asset, then atomically transition `UPLOADED → INSPECTING`, insert
**one** outbox event for asset inspection, replace the result with
`ASSET_UPLOAD_COMPLETED` (storing the created outbox event id) and mark the
record `COMPLETED`.

| Replay window | Outcome |
|---|---|
| after Tx A, before Tx B | resume Tx B |
| after Tx B, before the HTTP response | verify the resent content through the hash-only path, return the stored result, **zero** object writes |

Delivery remains **at-least-once attempt / idempotent durable effect / one
accepted asset identity**. **Exactly-once is not claimed** anywhere.

---

## I. Exact `APP2-B01` endpoint handoff

**Three operations. Not five.**

1. `POST` Admin asset upload — multipart streaming, idempotent intake.
2. `GET` Admin asset by id — truthful intake/inspection status and safe metadata.
3. `GET` Admin asset list — bounded cursor pagination and allowed intake filters.

Explicitly excluded: manual inspection trigger, delete endpoint, public
derivative delivery, product/catalog mutation. The historical `≤5` budget
(`ADR-APP2-001` §4.2b/§8: "upload + detail + list + retry") is **superseded** —
the retry operation is dropped rather than kept to fill a budget, and no
operation is invented to reach five.

Route naming follows the repository convention (resource controller under the
global `api` prefix, as in `@Controller('staff/session')` → `/api/staff/session`);
the committed inactive nginx seam illustrates `/api/admin/assets/upload`. The
gate fixes the **capabilities**, not the final path string.

Locked transport and gateway contract for B01:

- `multipart/form-data`, `busboy` `1.6.0`, `@types/busboy` `1.5.4` as a
  dev/type dependency, one file, metadata fields before the file.
- Synchronous guards: authenticated staff · exact admin Origin policy ·
  multipart content type · required + bounded idempotency key · metadata schema ·
  single file · approved MIME · magic/signature compatibility · 25 MiB
  incremental file counter · 5-minute hard request duration · client-disconnect
  propagation.
- Gateway upload location, **route-scoped only**: `client_max_body_size 27m` ·
  `proxy_request_buffering off` · `proxy_read_timeout`/`proxy_send_timeout`
  greater than 5 minutes · every value from the environment via the existing
  `${GATEWAY_*}` pattern. The API stays authoritative for the 25 MiB file limit.
  MinIO is never exposed through Nginx; no browser or object-store credential is
  introduced.

Plus the §B repository gaps, restated in `ADR-APP2-001` §4.2f-7 as B01's work
list.

---

## J. Migration and dependency verdict

**`NO_APP2_MIGRATION`** — re-confirmed a third time, now against the gate model.

| Gate concept | Existing home |
|---|---|
| request fingerprint | `idempotency_records.fingerprint` (immutable text) |
| allocation + completed result union | `idempotency_records.result` (nullable, **mutable** jsonb, DB5-A10) |
| content fingerprint | inside the completed result |
| `claimToken` + rotation | inside the result; rotation is a `result` update |
| allocation TTL / renewal | `expires_at`, `claimed_at` (both mutable) |
| single-winner reclaim | `SELECT … FOR UPDATE` on the existing row |
| asset identity, key, media type, size, checksum | existing `assets` columns, `checksum` already `^sha256:[0-9a-f]{64}$` |
| inspection intent | existing `outbox_events` insert; its sequence `id` is the recorded `inspectionEventId` |

No new column, constraint, index, table or migration. No `APP2-DB01` is raised.
**No dependency change** — `busboy` `1.6.0` / `@types/busboy` `1.5.4` are
*documented as B01's* additions and were **not** installed here;
`pnpm-lock.yaml` is untouched.

---

## K. Disposable proof (optional, executed)

Justification for running one: §B.2 found three behaviours the gate depends on
that **no prior spike covered** — expiry-aware reclaim, in-place `claimToken`
rotation on a held row, and single-winner locking. C2's 18/18 proved
claim/allocation/replay, not these. Asserting them from documentation alone
would repeat the mistake the I02 chain already cost this project twice.

Harness: the repository's own `createDisposableDatabase` (`packages/database/
src/testing`), which applies the **real** migrations to a throwaway database on
the pinned `postgres:16.14-alpine` dev server. Driver `pg` `8.22.0`. Script ran
from the session scratchpad, outside the repository; nothing was committed from
it. The repository source was not modified for the proof.

**9/9 PASS:**

| # | Check | Result |
|---|---|---|
| P1 | real baseline applied | **31 migrations / 78 public tables** |
| P2 | trigger scan on `idempotency_records` | **0** non-internal triggers — `status`/`result`/`expires_at`/`claimed_at` genuinely mutable (DB5-A10) |
| P9 | `jsonb` key ordering | authored `schemaVersion,kind,assetId,bucketAlias,objectKey,claimToken,requestFingerprintVersion` → stored `kind,assetId,objectKey,claimToken,bucketAlias,schemaVersion,requestFingerprintVersion` — **key order is not preserved** |
| P3 | `ASSET_UPLOAD_ALLOCATION` representability | round-trips **field-for-field** with `status='IN_PROGRESS'` and the request fingerprint intact |
| P4 | claim-token JSON update | expired row: `jsonb_set` rotates `claimToken`, `assetId`/`objectKey`/`kind` preserved, `claimed_at` and a fresh 15-minute `expires_at` written — 1 row |
| P5 | row locking / concurrent reclaim | two live transactions: B **blocked** on A's `FOR UPDATE` for the full 400 ms observation window; A's guarded rotation matched **1** row, B's matched **0** |
| P7 | stale claim token | a finalization predicated on the rotated-away token matched **0** rows — `STALE_UPLOAD_CLAIM` is expressible as a guarded `UPDATE` |
| P6 | `ASSET_UPLOAD_COMPLETED` + double-complete | round-trips field-for-field (`byteSize` **26 214 400** as an integer, both `sha256:` hashes, `inspectionEventId`); the existing `IN_PROGRESS` gate matched **0** rows on a second complete |
| P8 | residue | disposable database dropped; **0** matching databases remain on the server |

A first run reported P3/P6 as failures. The cause was **my assertion**, not the
model: I compared with `JSON.stringify`, which is key-order sensitive, against a
`jsonb` column that normalises key order. The fix was a structural comparison
plus an explicit new check (P9) that *measures* the reordering — and that
measurement became a real contract clause in §E: never re-serialise a stored
result to reproduce a hash.

Residue: 0 databases (asserted, P8); no containers created (the pinned dev
PostgreSQL server was reused, no new container started); `docker ps` shows the
same 7 `embroidery-dev-*` containers as at entry; the development database was
never written to; repository tree clean apart from the intended documentation.

---

## L. Commit A evidence

```text
62034acf05f228acb260e35d93194fbcf2e7d5f0
docs(app2): close asset-intake entry blockers
6 files changed, 375 insertions(+), 25 deletions(-)
```

| File | Change |
|---|---|
| `docs/adr/backend/ADR-APP2-001-OBJECT-STORAGE-AND-ASSET-INTAKE.md` | +326/−… — new **§4.2f** entry-gate closure (§4.2f-1…§4.2f-7); header entry-gate note; §5 third `NO_APP2_MIGRATION` re-confirmation; §7 rewritten as **resolved** Product Owner parameters; §8 handoff superseded to three operations |
| `docs/adr/backend/ADR-APP2-002-ASYNCHRONOUS-JOB-RUNTIME.md` | blocker list marked closed by `APP2-B01-G01`; the `APP2-B01` handoff note updated from "remains blocked" to `READY`, naming the Tx B outbox event recorded in the completed result |
| `docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md` | `APP2-B01-G01` status block; blocker-routing block marked resolved; §6.1 map gains row **4c** `APP2-B01-G01` and rewrites row 5 `APP2-B01` (three operations, dependencies `I01, B01-G01`) |
| `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` | IMP-D028 gains the full entry-gate clause; IMP-O002 status updated to unblocked |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | §6 APP2 status paragraph gains the `APP2-B01-G01` closure and `APP2-B01 = READY — NOT STARTED` |
| `docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md` | matching status pointer |

Historical reports are preserved untouched; superseding pointers were added only
inside the canonical ADR and plan, never by rewriting an earlier report.
**No `APP2-DEC-STORAGE-C3` was created.**

---

## M. Validation matrix

Every command run from a clean tree at Commit A.

| Command | Result |
|---|---|
| `pnpm quality` | `EXIT=0` (also `EXIT=0` at preflight, before any edit) |
| `pnpm check:openapi` | `EXIT=0` — artifact up to date |
| `pnpm check:api-client` | `EXIT=0` — tree hash `89c1aace…` |
| `pnpm check:figma-design-index` | `EXIT=0` — 69 registry IDs, 69 node rows, 9 tables |
| `node --test tools/check-figma-design-index.test.mjs` | `EXIT=0`, 0 failures |
| `pnpm db:check:manifest` | `EXIT=0` — 78 tables / 833 columns / 31 migrations / all checks passed |
| `node tools/check-file-size.mjs` | `EXIT=0` — 13 pre-existing review-threshold files, **no new one**, no hard-limit violation |
| `git diff --check` | clean |
| Disposable proof | **9/9 PASS**, zero residue |

Frozen artifacts, verified unchanged at exit:

```text
OpenAPI      ae015dd65dc2f64c902145f19d5fa5fae6cd6423a54934c1126cd289e3d30946
API client   89c1aace328eef1ee05a74950faa48bf907babece025a6abb9ca1baa1574502f
Database     31 migrations · 78 tables · 833 columns · 4ca56a59…
Figma        69 registry IDs
```

`git show --stat` for Commit A lists **only** files under `docs/`. No
application source, package manifest, lockfile, Compose file, Nginx template,
schema, migration, OpenAPI artifact, generated client or Figma node was touched.

---

## N. Acceptance matrix

| # | Criterion | Evidence |
|---|---|---|
| 1 | Clean exact preflight | §A — `HEAD` = FD1 Commit F, empty tree, baseline gates green |
| 2 | I02-FD1 accepted chain verified | §A — `43546a6` + `8775734` read from Git |
| 3 | Storage A–F chain verified | §A — six commits listed |
| 4 | No storage C3 created | §L — no new correction file; ADR header states it must not be created |
| 5 | 25 MiB exact file limit approved | §C — 26 214 400 bytes |
| 6 | 27 MiB gateway envelope approved | §C — 28 311 552 bytes, route-scoped |
| 7 | PNG/JPEG/WebP only | §C · §B.5 (`EXTENSION_BY_MIME_TYPE`) |
| 8 | SVG rejected | §C · ADR §4.6 unchanged |
| 9 | Non-image source files excluded | §C |
| 10 | Original retention approved | §C |
| 11 | Request fingerprint V1 exact | §D.1 |
| 12 | Content fingerprint V1 exact | §D.2 |
| 13 | Completed replay consumes the full resent body | §D.3 steps 1–3 |
| 14 | Completed replay performs no object write | §D.3 step 4 |
| 15 | Content mismatch returns conflict | §D.3 step 7 |
| 16 | Active duplicate streams no second object | §D.4 |
| 17 | Allocation JSON exact and versioned | §E · proven §K/P3 |
| 18 | Completed JSON exact and versioned | §E · proven §K/P6 |
| 19 | State/result invariants exact | §E |
| 20 | Malformed stored result fails safely | §E — `IDEMPOTENCY_RESULT_INVALID` |
| 21 | Claim token rotates on expired reclaim | §F · proven §K/P4 |
| 22 | Tx A and Tx B verify claim token | §F · §H |
| 23 | Only one reclaimer wins | §G Step 1 · proven §K/P5 |
| 24 | Existing asset never deleted during reclaim | §G |
| 25 | Missing-asset cleanup completes before replacement | §G |
| 26 | Cleanup failure accepts no replacement object | §G |
| 27 | Tx A/Tx B boundaries exact | §H |
| 28 | Response-loss replay exact | §H table |
| 29 | No exactly-once claim | §H — stated explicitly |
| 30 | Three-operation B01 handoff locked | §I · ADR §4.2f-6 · plan §6.1 row 5 |
| 31 | No migration | §J · proven §K/P1–P7 |
| 32 | No dependency or implementation change | §J · §M — lockfile untouched, docs-only diff |
| 33 | Full quality and frozen checks pass | §M |
| 34 | Blockers marked resolved | §L — ADR, ADR-002, plan, register, roadmap, matrix |
| 35 | Commit A decision-only | §L — no report in Commit A |
| 36 | Commit B evidence-only | this file + status pointers |
| 37 | Exactly two commits | §O |
| 38 | Report complete without arbitrary compression | this document — no line-count target applied |
| 39 | Final tree clean | §O |
| 40 | Nothing pushed | §O |
| 41 | B01 implementation not started | §O |
| 42 | W01/frontend not started | §O |

---

## O. Scope and evidence closure

**Not done, deliberately:** no `APP2-B01` implementation, no `busboy` install,
no controller, route, guard, use case, repository method, OpenAPI operation or
generated-client entry; no Nginx activation of the upload seam; no Compose,
schema, migration or Figma change; no worker handler; no frontend.

**Two commits, no more:**

| | Commit | Content |
|---|---|---|
| A | `62034acf05f228acb260e35d93194fbcf2e7d5f0` | `docs(app2): close asset-intake entry blockers` — ADR/plan/register/roadmap/matrix |
| B | this commit | `docs(app2): record B01 entry-gate evidence` — this report only |

Nothing squashed; Commit A was not amended after report authoring began; nothing
pushed.

**Final state:**

```text
APP2-I01              = COMPLETE — REVIEW_ACCEPTED
APP2-I02              = COMPLETE — CORRECTED — REVIEW_ACCEPTED
APP2-B01-G01          = COMPLETE — ENTRY_GATE_CLOSED
STORAGE-BLK-01        = RESOLVED
STORAGE-BLK-02        = RESOLVED
STORAGE-BLK-03        = RESOLVED
UPLOAD-POLICY-BLK-01  = RESOLVED
APP2-B01              = READY — NOT STARTED
APP2-W01              = BLOCKED_BY_APP2-B01
```

**Verdict: `PASS`.**
