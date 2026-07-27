# APP2-B01 — Idempotent Admin Asset Intake APIs — Completion Report

- Checkpoint: `APP2-B01` — implement idempotent Admin asset intake, detail and list APIs
- Type: backend (three related operations)
- Date: 2026-07-27
- Verdict: **`PASS`**

---

## A. Preflight and authority chains

`APP2_B01_PREFLIGHT = PASS` — full, not partial.

| Requirement | Observed |
|---|---|
| Branch | `production` |
| `HEAD` | `4e546334355828b1e0e7bc1ed659eba75756e973` — `docs(app2): record B01 entry-gate evidence` = the **`APP2-B01-G01` evidence Commit B**, read from Git |
| Working tree | `git status --short` empty |
| `pnpm quality` | `EXIT=0` |
| `pnpm check:openapi` | `EXIT=0` |
| `pnpm check:api-client` | `EXIT=0` |
| `pnpm check:figma-design-index` | `EXIT=0` |
| `pnpm db:check:manifest` | `EXIT=0` |
| `git diff --check` | `EXIT=0` |

**Chains verified in `git log`:**

| Chain | Commits |
|---|---|
| `APP2-B01-G01` | A `62034ac` + **B `4e54633`** (read from Git) |
| `APP2-I02` foundation | `1d748ef` + `bfc2a60` |
| `APP2-I02-C1` | `53417db` + `fd93ab3` |
| `APP2-I02-FD1` | `43546a6` + `8775734` |
| `APP2-I01` | `48e676d` + `a82f4f2` |
| Storage decision A–F | `52d582e` · `ecef0cd` · `0c8afd5` · `3fce01b` · `86d3b91` · `3b167dc` |

**Source gaps from the G01 report re-verified in code before implementing.** All six were still present and all six are now closed:

| Gap (ADR-APP2-001 §4.2f-7) | Closed by |
|---|---|
| `IdempotencyStore.claim` writes no `result` | `IdempotencyAllocationStore.claimWithAllocation` |
| No expiry-aware claim | the `expired` outcome, decided by `now()` in SQL |
| No row lock | `lockForUpdate` (`SELECT … FOR UPDATE`) |
| No `result`-only update on a held claim | `renewExpiredClaim`, `completeHeldClaim` |
| `AssetRepository.register` is a plain insert | `registerOrRecover` (conflict on the primary key) |
| No guarded `UPLOADED → INSPECTING`, no cursor list | `beginInspection`, `listScoped` + `findScoped` |

---

## B. Source audit and actual path adaptations

Everything below was read before any code was written, and every deviation from
the prompt's illustrative paths is recorded here rather than applied silently.

### B.1 Adaptations

| Prompt assumption | What the repository required |
|---|---|
| Persistence changes under `packages/persistence/…asset/outbox repository files` | The asset repository lives in `apps/api/src/modules/asset/**`, not in `packages/persistence`. Asset work went there; only the idempotency seam is a persistence-package addition. |
| A new `OutboxEventStore` finder for the reclaim path | **Not added.** `listForAggregate` already existed and returns events ordered by id; using it avoided a duplicate query method. |
| `ASSET_STATES` importable as a runtime value | Only the `AssetState` **type** is exported. Presentation declares the filter tuple locally with a compile-time exhaustiveness proof, so the ORM schema namespace stays out of the presentation layer. |
| `AssetModule` hosts the intake feature | Split: `AssetModule` stays the persistence module; the new `AssetIntakeModule` owns the controller, services and storage binding. See §B.2. |
| `express` `Request` in the controller | `IncomingMessage` from `node:http` — no `@types/express` dependency, and the handler needs nothing Express-specific. |

### B.2 The module split (a defect found by an existing test)

Wiring the controller, guards and object storage into `AssetModule` made the
DB7-era `asset-persistence.integration.spec.ts` fail: a suite that only
exercises the repository suddenly required object-storage configuration and the
whole authentication graph.

That is a real coupling defect, not a test inconvenience. It was fixed by
splitting the module rather than by teaching the test to tolerate it:

- **`AssetModule`** — `DatabaseModule` + `ASSET_REPOSITORY`. Unchanged surface.
- **`AssetIntakeModule`** — `AssetModule` + `IdentityModule` + object storage +
  the intake services + `AdminAssetController`. Registered in `AppModule`.

The pre-existing suite now passes untouched.

### B.3 Offline object-storage configuration

`AssetIntakeModule` validates object-storage configuration at provider
construction, exactly as `DatabaseModule` validates `DATABASE_URL` — a
misconfigured process fails at bootstrap, not on the first upload. Constructing
an S3 client opens no socket, so the two application graphs that build
`AppModule` without a real store still work: `applyOfflineObjectStorageEnv`
(exported from `generation-environment.ts`, the module that already owned the
`DATABASE_URL` placeholder) supplies `.invalid` values for the OpenAPI generator
and the API integration harness. One helper, three call sites, no drift.

### B.4 Other audited contracts, used unchanged

`AuthenticatedAdminGuard` / `StaffOriginGuard` (both now exported from
`IdentityModule`) · the canonical Zod pipe and `createZodDto` · the response
envelope, `ApiSuccessCode` and the safe exception filter · `newId()` UUIDv7 ·
`TransactionManager` (the only place a transaction opens) · `DrizzleRepository`
(error funnelling) · `OutboxEventStore.append` with aggregate kind `ASSET` ·
`ObjectStoragePort` (six operations, unchanged) · `buildOriginalObjectKey` /
`buildAssetPrefix` · `encodeCursor`/`decodeCursor`/`resolveLimit`/`buildPage`.

---

## C. HTTP contracts and security

| Operation | Route | Operation id |
|---|---|---|
| Upload | `POST /api/admin/assets/upload` | `adminAsset_upload` |
| Detail | `GET /api/admin/assets/:assetId` | `adminAsset_detail` |
| List | `GET /api/admin/assets` | `adminAsset_list` |

No alias under `/staff`, `/media` or any other family. Operation ids follow the
canonical `<domain>_<method>` policy and are validated by the existing gate.

**Guards.** All three carry `AuthenticatedAdminGuard`. The upload additionally
carries `StaffOriginGuard` — the exact Admin Origin allowlist — because it is
the one state-changing route. The login-only `StaffJsonBodyGuard` is **not**
applied: it would reject `multipart/form-data` with 415 before the parser ever
ran. Proven by an API case asserting that a JSON body reaches the multipart
parser and fails as `ASSET_UPLOAD_INVALID_MULTIPART` (400), never 415.

**Preserved unchanged:** request context and `meta.requestId`, actor binding
(the guard binds the ADMIN actor once), the success/error envelope, safe
exception mapping, and the Swagger conventions.

The upload handler takes `@Req()` rather than `@Body()`. Binding a body would
make Nest buffer 25 MiB before the handler ran — the exact behaviour the
streaming design exists to avoid.

---

## D. Multipart streaming and limits

`busboy@1.6.0` (runtime) + `@types/busboy@1.5.4` (dev). No Multer, no second
multipart library.

**Required shape**, enforced in `multipart-upload.parser.ts`: `assetKind` =
`CATALOG_MEDIA`, then `classification` = `PRODUCTION_SENSITIVE`, then exactly
one file part named `file`. Metadata strictly before the file. Rejected:
unexpected field, duplicate field, missing field, wrong fixed value, a second
file, a missing file, a field after the file, a non-multipart content type, an
oversized field value.

The parser resolves **at** the file part with the stream still unread. Busboy
stalls until it is consumed, which is what lets the durable allocation commit
before a single byte is read.

**One pass over the bytes** (`validated-file.reader.ts`): a bounded 12-byte
signature prefix is buffered and checked, then every chunk is counted, hashed
and forwarded. Nothing else is retained — there is no whole-file buffer on any
path. The same reader serves the replay path with **no sink at all**, which is
how a replay is content-complete while writing zero objects.

`Content-Length` is never trusted; the counter is incremental and rejects at
`26_214_400 + 1` before the offending byte is hashed or forwarded.

**Three real streaming defects were found by the live suite and fixed:**

1. **Destroying the sink with an error crashed the worker.** A stream destroyed
   with an error emits `error`; unhandled, it terminates the process. The sink
   *must* be destroyed with an error (destroying it cleanly would look like a
   normal end-of-stream and let `lib-storage` complete a truncated object), so a
   guard listener was added instead of weakening the teardown.
2. **A disconnecting client produced an unhandled `error`.** `pipe` does not
   forward source errors, so a socket failing mid-body emitted `error` on the
   request with no listener. The parser now handles it, which also turns a
   dropped connection into a settled rejection instead of a hung request.
3. **A stalled client hung past its own deadline.** The reader only checked the
   abort signal when a chunk arrived, and the parser's failure path did not tear
   Busboy down after the file had been handed over. A client that simply stopped
   sending produced no chunks, so neither the timeout nor the abort took effect.
   The reader now listens for the abort, and parser teardown is unconditional.

Each was a genuine production robustness gap that only a real streaming test
could surface.

---

## E. Fingerprints and result codecs

**Idempotency key** (`domain/idempotency-key.ts`): required header, 8–128
characters of `A-Za-z0-9._:-`, no trimming and no normalisation — a trailing
space is a rejection, not an alias, because folding two client keys into one
claim is the one thing an arbiter must never do. The stored `scope_key` is
`sha256(staff:{actorId}:{key})`, so the raw key never reaches the database. An
API case asserts it never reaches the logs either.

**Filename normalization** (`domain/normalized-filename.ts`): the eight
specified steps, case preserved, NFC applied, bounded to 255 UTF-8 bytes, only
the basename retained. Never stored in a key, a result, a response or a log.
Recorded: a tab is a control character (0x09), so step 1 rejects it before the
whitespace-collapsing step can be reached — the collapse step therefore handles
spaces and non-ASCII spaces only.

**Canonical JSON** (`domain/canonical-json.ts`): sorted keys, no insignificant
whitespace, integers only, SHA-256 lowercase hex with the `sha256:` prefix. The
module carries the G01 measurement as a rule: **never canonicalise a value read
back out of `jsonb`**, because `jsonb` normalises key order. Both fingerprints
are hashed from in-memory facts before anything is stored.

**Request fingerprint V1** — the exact seven-field document, pinned by a unit
test that rebuilds it literally rather than calling the function twice.
**Content fingerprint V1** — the exact four-field document, likewise pinned.

**Result codecs** (`domain/upload-result.codec.ts`): Zod `.strict()` on both
variants, exact `schemaVersion` and `kind` literals, UUIDv7 for `assetId`,
`sha256:` patterns for both hashes, `byteSize` an integer bounded by the
approved maximum, `bucketAlias` fixed to `ORIGINALS`, `assetStatus` fixed to
`INSPECTING`. The outbox id is carried as a **decimal string** so a sequence
value beyond `Number.MAX_SAFE_INTEGER` cannot be silently rounded.
`decodeResultForState` enforces the state/result invariant. Every failure is
`IDEMPOTENCY_RESULT_INVALID`, and the Zod issue is discarded so stored values
cannot reach a client — asserted by a test.

---

## F. Claim, replay and reclaim state machine

One request takes exactly one of five paths, chosen by the claim outcome:

| Outcome | Path |
|---|---|
| `claimed` | stream to storage → Tx A → Tx B |
| `in_progress` | `ASSET_UPLOAD_IN_PROGRESS` (409); no second object |
| `conflict` | `IDEMPOTENCY_CONFLICT` (409); no object, no stored result disclosed |
| `completed` | re-read and re-verify the whole body, write nothing, replay |
| `expired` | reclaim, then resume from durable asset truth |

**Pre-stream claim** commits `IN_PROGRESS` + the allocation result +
`claimed_at = now()` + `expires_at = now() + 15 min` **before** any file byte is
read. Only the transaction winner streams. `IdempotencyStore.release` is not
used on the upload or reclaim path.

A refused duplicate **drains** the body rather than destroying the socket: a
destroyed socket loses the response, so the client would see a transport error
instead of the 409 that tells it what happened. The hard-duration deadline
bounds the drain.

**Completed replay** parses metadata, matches the request fingerprint, consumes
the entire body through the hash-only path, performs no object write,
recomputes the content fingerprint, and returns the stored receipt only on a
match. A metadata-only replay does not exist anywhere in the implementation.

**Expired reclaim** locks the row, verifies `IN_PROGRESS` + expiry by database
time + the request fingerprint, strictly decodes the allocation, rotates
`claimToken` while preserving `assetId` and `objectKey`, and renews the lease —
guarded additionally on the previous token so a second reclaimer updates
nothing. Then it reads durable asset truth:

| Asset state | Handling |
|---|---|
| absent | cleanup (delete original → delete only this asset's derivative prefix → verify both prefixes empty → re-verify the token) **then** stream the replacement |
| `UPLOADED` | verify the resent body against persisted metadata, then Tx B |
| `INSPECTING` / `ACCEPTED` | reconstruct the completion from the **real** outbox intent; no second intent |
| anything else | `ASSET_UPLOAD_STATE_CONFLICT` |

Cleanup failure accepts no object, inserts no asset, releases no allocation, and
leaves the renewed claim to expire for another attempt.

**Recorded behaviour:** a retry made while the allocation is still live is
refused as `ASSET_UPLOAD_IN_PROGRESS`, not resumed. The server cannot
distinguish a crashed attempt from one still streaming — that is precisely what
the lease is for. Resumption happens through the expired-reclaim path. The live
suite asserts both halves of this.

---

## G. Tx A and Tx B

Both verify the claim token **inside** their own transaction, under the row
lock, so a request whose allocation was reclaimed mid-stream matches zero rows
and mutates nothing.

**Tx A** — insert-or-recover the same `assetId` as `UPLOADED` with the allocated
key, validated media type, server byte size and server SHA-256. A recovered row
must agree on every immutable fact or the request fails with
`ASSET_UPLOAD_STATE_CONFLICT`. **No outbox event.**

**Tx B** — guarded `UPLOADED → INSPECTING` (the from-state is in the predicate,
not an earlier read), exactly one outbox event, the completed result carrying
that event's id, and `COMPLETED`. Because the transition is the guard, "exactly
one inspection event per asset" is a consequence of the state machine rather
than of a uniqueness constraint.

Event type: **`asset.inspection.requested`**, aggregate kind `ASSET`, payload
`{"schemaVersion":1,"assetId":"<UUIDv7>"}`, `payload_schema_version` 1. **No
worker handler was added** — `APP2-W01` owns that.

No object-store call happens inside any transaction.

Exactly-once delivery is not claimed anywhere: this is at-least-once attempt
with an idempotent durable effect and one accepted asset identity.

---

## H. Persistence changes

**New** `packages/persistence/src/platform/idempotency-allocation.ts` —
`IdempotencyAllocationStore` with exactly four operations:
`claimWithAllocation`, `lockForUpdate`, `renewExpiredClaim`, `completeHeldClaim`.
All require the caller's transaction; expiry is decided by `now()` in SQL, never
by a Node clock, so two API processes cannot disagree about who owns an
allocation. It lives beside `IdempotencyStore` rather than inside it because the
base store is a general platform primitive shared with payments and
notifications, and a claim-token concept has no business there.

**Extended** `AssetRepository` / `DrizzleAssetRepository` with
`registerOrRecover`, `beginInspection`, `findScoped` and `listScoped`; scope and
keyset predicates were extracted into `asset-scope.filters.ts`. `Asset` gained
`createdAt`/`updatedAt`, which the detail view needs.

**No generic CRUD. No schema change. No migration.**

---

## I. Nginx route activation

The `upload-proxy.conf.template` seam is now active for exactly one location:

```nginx
location = /api/admin/assets/upload {
    include /etc/nginx/conf.d/includes/proxy-headers.conf;
    include /etc/nginx/conf.d/includes/upload-proxy.conf;
    proxy_pass http://api_upstream;
}
```

The include carries `proxy_request_buffering off`, `client_max_body_size
${GATEWAY_UPLOAD_MAX_BODY_SIZE}` and both timeouts from
`${GATEWAY_UPLOAD_PROXY_TIMEOUT}` — every value from the environment, no literal
invented in the template. Defaults `27m` and `360s` in `.env.example` and both
Compose files.

An **exact-match** location so it cannot widen to
`/api/admin/assets/uploads-of-anything`. Global `client_max_body_size 20m` and
the 60s timeouts are unchanged; the location overrides upward for that route
only. MinIO is not exposed.

---

## J. Public response and error contracts

Upload returns **202** with the canonical envelope and exactly seven fields:
`assetId`, `kind`, `classification`, `status`, `mediaType`, `byteSize`,
`checksum`. A completed replay returns the identical payload. Detail adds
`createdAt`/`updatedAt`. List returns `items` / `nextCursor` / `hasNext` with
keyset pagination only — no offset paging anywhere.

Never exposed: `bucketAlias`, `objectKey`/`storageKey`, `claimToken`,
`contentFingerprint`, `inspectionEventId`, the idempotency scope or fingerprint,
the raw filename, actor identifiers. The projection is a hand-written allowlist,
and tests assert both the exact key sets and the absence of the values.

Detail and list are scoped to `CATALOG_MEDIA` + `PRODUCTION_SENSITIVE` **in
SQL**, so an out-of-scope asset is never selected; a scoped miss is reported as
`ASSET_NOT_FOUND`, identically to a non-existent id.

| Code | Status |
|---|---|
| `ASSET_UPLOAD_INVALID_MULTIPART` · `ASSET_UPLOAD_METADATA_INVALID` · `IDEMPOTENCY_KEY_INVALID` | 400 |
| `ASSET_UPLOAD_TIMEOUT` | **408** |
| `ASSET_NOT_FOUND` | 404 |
| `IDEMPOTENCY_CONFLICT` · `ASSET_UPLOAD_IN_PROGRESS` · `STALE_UPLOAD_CLAIM` · `ASSET_UPLOAD_STATE_CONFLICT` | 409 |
| `ASSET_UPLOAD_TOO_LARGE` | 413 |
| `ASSET_UPLOAD_MEDIA_UNSUPPORTED` · `ASSET_UPLOAD_SIGNATURE_MISMATCH` | 415 |
| `IDEMPOTENCY_RESULT_INVALID` | 500 |
| `ASSET_STORAGE_UNAVAILABLE` | 503 |

**Recorded platform behaviour.** The canonical exception mapper replaces every
5xx code and message with `INTERNAL_SERVER_ERROR` and the generic text, because
a server-fault message may have been built from an internal failure. So
`IDEMPOTENCY_RESULT_INVALID` and `ASSET_STORAGE_UNAVAILABLE` keep their
**status** on the wire (500 / 503) but reach the client as the generic
server-fault code. That is existing reviewed behaviour and was not bypassed;
both names remain the operator-facing ones. Every 4xx code above reaches the
client verbatim. No raw provider, SQL, Busboy or filesystem error is exposed.

---

## K. Unit tests

Docker-free, part of `pnpm test` and `pnpm quality`. **194 tests** across seven
suites in the asset module.

| Suite | Covers |
|---|---|
| `domain/intake-identity.spec.ts` | idempotency-key validation (both length bounds, every rejected shape, the no-normalisation rule), scope hashing (stable, distinct per actor and per key, raw key absent), filename normalization (all eight steps, case preserved, NFC, traversal reduced to a basename, every rejection), canonical JSON (key sorting, no whitespace, nested sorting, integer-only), and both fingerprints **pinned to their literal canonical documents** |
| `domain/media-signature.spec.ts` | PNG/JPEG/WebP detection including minimum prefixes, a RIFF container that is not WebP, an 11-byte WebP being undecidable, the closed allowlist (SVG, GIF, TIFF, casing, parameterised type), and declaration-vs-content mismatch |
| `domain/upload-result.codec.spec.ts` | both variants accepted exactly; unknown field, wrong discriminant, wrong version, non-v7 id, foreign bucket, malformed hashes, out-of-range and fractional `byteSize`, numeric/zero event id all rejected; the state/result invariant both ways; the large-sequence event id preserved as a string; and that a rejection never echoes the stored value |
| `infrastructure/http/validated-file.reader.spec.ts` | all three types measured and forwarded byte-identically; the hash-only path producing the same checksum with no sink; exactly 25 MiB accepted and the first byte over rejected; **zero bytes forwarded** on a signature mismatch; SVG-as-PNG; unrecognised bytes; a too-short file; an empty file; abort destroying both streams; a mid-stream source error destroying the sink |
| `infrastructure/http/multipart-upload.parser.spec.ts` | resolution at the file part with the stream unread; file-before-metadata and file-after-one-field; duplicate, unexpected, wrong-value and oversized fields; missing file; wrong file part name; a second file and a late field surfacing through `finish()`; JSON/missing-boundary/absent content types; external abort |
| `application/asset-intake-contracts.spec.ts` | the exact published key sets; five internal field names and the storage-key value absent; `bigint` → JSON-safe number; ISO timestamps; scoped detail and scoped-miss-as-not-found; list scoping, default 20 and clamp to 100, `hasNext`, over-fetch discarded, cursor round-trip into an ordering position, filters passed through, three malformed cursors rejected; **every error code mapped to its exact status**, the business code in the payload, safe single-line messages, and a completeness assertion so a new code cannot ship unmapped |
| `tests/integration/asset-persistence.integration.spec.ts` | the pre-existing DB7 suite, still passing untouched after the module split |

## L. PostgreSQL / MinIO integration

`pnpm test:asset-intake:integration` — **2 suites, 25 tests, all passing**,
against a disposable database with all 31 migrations and a disposable pinned
`minio/minio:RELEASE.2025-04-08T15-41-24Z`. All 30 required §25 cases are
covered; several are asserted together where they describe one run.

| § | Case | Where |
|---|---|---|
| 1, 4, 5, 7 | PNG upload; `INSPECTING`; exactly one intent; private object at the deterministic key | `asset-intake` — "a PNG upload lands…" |
| 2 | JPEG upload, keyed `.jpg` | same suite |
| 3 | WebP upload | same suite |
| 6 | completed result strict, internal, not published; raw key absent from the row | same suite |
| 8 | exactly 25 MiB accepted | same suite |
| 9 | first byte over the limit rejected; no asset, no object | same suite |
| 10 | SVG rejected before any claim exists | same suite |
| 11 | declared/signature mismatch rejected before any object write | same suite |
| 12 | active duplicate writes no second object | same suite |
| 13 | same key, different request → conflict, no new row | same suite |
| 14 | completed replay, same body → no object write, identical receipt, one intent | same suite |
| 15 | completed replay, different bytes → conflict | same suite |
| 16 | malformed stored result → safe failure, no transition, no second intent | same suite |
| 17 | retry after Tx A resumes Tx B; one object, one identity, one intent | `asset-intake-lifecycle` |
| 18 | replay after Tx B returns the identical receipt (twice) | same suite |
| 19, 25 | reclaim rotates the token, preserves identity and key; the existing asset and its object are never deleted | same suite |
| 20 | two concurrent reclaimers → exactly one durable effect | same suite |
| 21, 22 | a stale token completes neither Tx A nor Tx B and mutates nothing | same suite |
| 23 | missing asset → original and derivative prefix cleaned **before** the replacement | same suite |
| 24 | cleanup failure → no replacement object, no asset, allocation left to expire | same suite |
| 26 | `INSPECTING` asset reconstructs its completion from the real intent; no second intent | same suite |
| 27 | client disconnect aborts the parser; no asset, no object | same suite |
| 28 | the hard-duration deadline aborts an in-flight upload, through the injected timer | same suite |
| 29 | a failed Tx B leaves no transition, no intent, no completion | same suite |
| 30 | container removed, port free, disposable database absent — asserted from a second connection | same suite |

**Every pre-state is produced by making the runtime actually fail**, never by
editing tables. `withFailingOutboxAppend` rolls Tx B back for real;
`withFailingAssetInsert` leaves a stored object with no asset row. This was
forced by a real constraint and is better evidence for it: the S24 immutability
trigger refuses a `DELETE` on `outbox_events`, so the SQL shortcut this suite
first attempted is not available — and a hand-built row would only have proved
that SQL can write it, not that the system can reach it.

Synthetic images throughout (generated, signature-valid); no real user file and
no project credential.

## M. API and gateway tests

**API — `pnpm test:asset-intake:api`: 27 tests, all passing.** Real `AppModule`
through Supertest against disposable PostgreSQL and MinIO. The authentication
guard is doubled (APP1 owns that contract and tests it); the **Origin guard is
real**, because it is part of this checkpoint's boundary.

Covered: 202 with the canonical envelope and `meta.requestId`; no internal field
in the receipt and the exact seven-key set; a foreign Origin rejected with 403;
missing / too-short / illegal idempotency keys → 400; a JSON body reaching the
multipart parser as 400 rather than the JSON guard's 415; a client-selected
`PUBLIC` classification rejected; 415 for SVG and for a signature mismatch; 413
for oversize; 409 for a request-fingerprint conflict and for a content
mismatch; an identical 202 on replay; the safe detail view and its exact nine
keys; 404 for an unknown id, **404 for an out-of-scope asset** (inserted
directly as `CUSTOMER_UPLOAD`/`CUSTOMER_PRIVATE`), 400 for a malformed id; the
default list page; cursor continuation with no repeated row; status and
mediaType filters; four rejected query shapes; a malformed cursor rejected; and
that the logs contain no idempotency key, claim token or storage key.

**Gateway — `pnpm test:asset-intake:gateway`: 20 tests, all passing.**

- `tools/nginx-upload-seam.test.mjs` (13) — static: the seam's exact four
  directives, every value sourced from `GATEWAY_UPLOAD_*`, the approved `27m`
  and `360s` in `.env.example` and both Compose files, the timeout strictly
  greater than the 300 s API duration, exactly one include and it is the upload
  route, exact-match location, proxy headers preserved, global defaults
  unchanged, buffering disabled nowhere else, no other location carrying the
  upload limits, no block opened in the seam, `nginx.conf` not auto-loading it,
  and no MinIO reference or S3 port anywhere.
- `tools/nginx-upload-render.test.mjs` (7) — **the real `nginx:1.27.3-alpine`
  image** runs its own entrypoint substitution over the real templates with the
  approved environment, then `nginx -t`: *syntax is ok / test is successful*.
  The rendered include carries literal `27m` / `360s` / `buffering off` with no
  unsubstituted `${…}`; the upload location appears exactly once; the global
  `20m` / `60s` survive; no other rendered location disables buffering or
  carries `27m`; no MinIO; `X-Request-ID` mapping and header intact. Timing is
  asserted from the rendered config, so no five-minute wall-clock test exists.

## N. OpenAPI and generated client

| Artifact | Before | After |
|---|---|---|
| OpenAPI SHA-256 | `ae015dd65dc2f64c902145f19d5fa5fae6cd6423a54934c1126cd289e3d30946` | `e19c2f76a800b9382d3e013e34759df5b9cd9090de021b5f3b2be7a5cfbf5c8f` |
| Generated-client tree SHA-256 | `89c1aace328eef1ee05a74950faa48bf907babece025a6abb9ca1baa1574502f` | `55de1cc158cf5ab112dae8e8c63f45fe5fee9de1d36aedbb222f0fcec0a6216b` |
| Paths / operations / schemas | 4 / 5 / — | **7 / 8 / 14** |

Operation ids: `adminAsset_upload`, `adminAsset_detail`, `adminAsset_list`.

The upload operation documents `multipart/form-data` with the `assetKind`,
`classification` and binary `file` properties, the required `Idempotency-Key`
header, a 202 response, and 400 / 408 / 409 / 413 / 415 / 500 / 503. Detail
documents its `assetId` path parameter; list documents `cursor`, `limit`
(integer, 1–100, default 20), `status` and `mediaType`, and the cursor response
shape.

**No unrelated churn:** the generated client diff is **+197 lines, 0 deletions**
across the two generated files. `pnpm check:openapi` and `pnpm check:api-client`
both pass against the committed artifacts.

One existing APP0 spec had to change: `build-openapi-document.spec.ts` pinned
`pathCount = 4` / `operationCount = 5`. Adding three operations legitimately
changes those numbers; the assertion was updated to 7 / 8 with the reason in the
comment, rather than loosened.

## O. Dependency, migration and boundary verdict

**`NO_APP2_MIGRATION` holds.** Zero changes under `packages/database`; the
migration count is still 31 and the manifest still reports 78 tables / 833
columns.

**Dependencies added — exactly the two locked ones**, plus the workspace edge
the module needs:

```text
busboy            1.6.0      apps/api dependency
@types/busboy     1.5.4      apps/api devDependency
@embroidery/object-storage  workspace:*  apps/api dependency
```

`pnpm-lock.yaml` grew by 16 lines and nothing else.

**Untouched, verified by `git status`:** `apps/worker/**`,
`packages/object-storage/**`, `packages/database/**` (schema and migrations),
`apps/admin/**`, `apps/storefront/**`, the Figma design index.

---

## P. Commit A evidence

```text
a1cb712eaa6f8c6e50539e721001d83f94f3efd4
feat(api): add idempotent Admin asset intake APIs
```

Changed files, by area:

| Area | Files |
|---|---|
| Asset domain (new) | `asset-intake.policy.ts`, `asset-intake.errors.ts`, `canonical-json.ts`, `idempotency-key.ts`, `normalized-filename.ts`, `intake-fingerprints.ts`, `media-signature.ts`, `upload-result.codec.ts` + 4 spec files |
| Asset application (new) | `asset-intake.service.ts`, `upload-transactions.service.ts`, `upload-reclaim.service.ts`, `asset-catalog.query.ts`, `asset-projection.ts`, `ports/upload-timer.ts`, `asset-intake-contracts.spec.ts` |
| Asset infrastructure (new) | `http/multipart-upload.parser.ts`, `http/validated-file.reader.ts` + 2 specs, `storage/object-storage.provider.ts`, `persistence/asset-scope.filters.ts` |
| Asset presentation (new) | `admin-asset.controller.ts`, `schemas/admin-asset.request.ts`, `schemas/admin-asset.response.ts` |
| Asset modules | `asset-intake.module.ts` (new), `asset.module.ts` (reverted to persistence-only) |
| Asset persistence (modified) | `domain/repositories/asset.repository.ts`, `infrastructure/persistence/asset-row.mapper.ts`, `infrastructure/persistence/drizzle-asset.repository.ts` |
| API platform (modified) | `bootstrap/app.module.ts`, `modules/identity/identity.module.ts`, `openapi/generation-environment.ts`, `openapi/build-openapi-document.spec.ts` |
| Persistence package | `platform/idempotency-allocation.ts` (new), `database.module.ts`, `index.ts` |
| Tests / harness (new) | `test/support/asset-intake-context.ts`, `asset-intake-fixtures.ts`, `disposable-minio.ts`, `synthetic-images.ts`; `test/integration/asset-intake.integration.spec.ts`, `asset-intake-lifecycle.integration.spec.ts`, `asset-intake-api.integration.spec.ts`; `test/support/api-integration-context.ts` (modified) |
| Gateway | `infrastructure/nginx/templates/includes/upload-proxy.conf.template`, `templates/development.conf.template`, `tools/nginx-upload-seam.test.mjs`, `tools/nginx-upload-render.test.mjs` (new) |
| Config / manifests | `.env.example`, both Compose files, `package.json`, `apps/api/package.json`, `apps/api/jest.config.mjs`, `apps/api/jest.asset-intake.config.mjs` (new), `pnpm-lock.yaml` |
| Generated artifacts | `packages/contracts/openapi/openapi.generated.json`, `packages/api-client/src/generated/*` |

## Q. Validation matrix

Script substitutions are recorded where the prompt's name did not exist:
`pnpm test:asset-intake:gateway` was created by this checkpoint (it runs both
Nginx test files); `pnpm --filter @embroidery/api test` is the package test
script the prompt refers to.

| Command | Result |
|---|---|
| `pnpm install` | clean; lockfile +16 lines |
| `pnpm --filter @embroidery/persistence lint` | `EXIT=0` |
| `pnpm --filter @embroidery/persistence typecheck` | `EXIT=0` |
| `pnpm --filter @embroidery/persistence test` | `EXIT=0` — 8 suites, **107 tests** |
| `pnpm --filter @embroidery/api lint` | `EXIT=0` |
| `pnpm --filter @embroidery/api typecheck` | `EXIT=0` |
| `pnpm --filter @embroidery/api test` | `EXIT=0` — 90 suites, **1112 tests** |
| `pnpm --filter @embroidery/worker test` | `EXIT=0` — 14 suites, **130 tests** (unchanged by this checkpoint) |
| `pnpm --filter @embroidery/api build` | `EXIT=0` |
| `pnpm test:asset-intake:integration` | `EXIT=0` — 2 suites, **25 tests** (all 30 §25 cases) |
| `pnpm test:asset-intake:api` | `EXIT=0` — **27 tests** |
| `pnpm test:asset-intake:gateway` | `EXIT=0` — **20 tests** (13 static + 7 real-render) |
| `pnpm openapi:generate` / `pnpm check:openapi` | `EXIT=0` — 7 paths, 8 operations, 14 schemas |
| `pnpm api-client:generate` / `pnpm check:api-client` | `EXIT=0` — tree hash `55de1cc1…` |
| `pnpm check:frontend-boundaries` | `EXIT=0` |
| `pnpm check:spike-boundaries` | `EXIT=0` |
| `pnpm check:e2e` | `EXIT=0` — 32 tests collect, Playwright pinned 1.61.1 |
| `pnpm check:figma-design-index` | `EXIT=0` — **69 registry IDs, unchanged** |
| `node --test tools/check-figma-design-index.test.mjs` | `EXIT=0` |
| `pnpm db:check:manifest` | `EXIT=0` — **78 tables / 833 columns / 31 migrations** |
| `node tools/check-file-size.mjs` | `EXIT=0` — no hard-limit violation |
| `pnpm quality` | `EXIT=0` — 21/21 turbo tasks |
| `git diff --check` | clean |

**Frozen-artifact verdicts:**

```text
Database   31 migrations · 78 tables · 833 columns — UNCHANGED
Figma      69 registry IDs — UNCHANGED
OpenAPI    ae015dd6… → e19c2f76…  (expected: three operations added)
Client     89c1aace… → 55de1cc1…  (expected: +197 lines, 0 deletions)
```

**File sizes.** Every source file is under the 400-line hard limit and every
test file under 600. Two source files sit above the 300-line review threshold
and are flagged for a reviewer's attention: `asset-intake.service.ts` (389 —
the five-path state machine, deliberately in one place) and
`drizzle-asset.repository.ts` (304 — the pre-existing AGG-08 contract plus four
methods, with the query predicates already extracted).

**Disposable residue: zero.** Case 30 asserts the MinIO container is gone, its
port free, and the database absent — the database check runs from a *second*
connection, not the dropped one. `docker ps -a` after the runs shows only the
seven long-lived `embroidery-dev-*` containers.

**Environment instability is recorded honestly, not hidden.** Three separate
environmental events occurred while validating, and none is a code failure:

1. A mid-session API run reported 2 failing suites with SQLSTATE `57P03` — the
   development PostgreSQL container had restarted (uptime ~1 minute) under the
   churn of starting and removing MinIO containers.
2. A later `pnpm quality` reported **12** failing integration suites, every one
   timing out at 120–320 s on database setup. Root cause found and fixed: **56
   leftover disposable databases** had accumulated from runs this session killed
   at the tool timeout, each carrying 31 migrations and 78 tables — roughly
   4 300 tables of dead weight on one server. They were dropped
   (`embroidery_db7_*` only; the persistent `embroidery` database was left
   untouched and verified present), after which `@embroidery/persistence` went
   from 7 failing suites to **107/107 passing** with no code change. That
   residue was mine, and cleaning it up is part of the checkpoint.
3. Docker Desktop's engine process exited mid-cleanup and had to be restarted.
   The run immediately after it reported one failing suite,
   `db10-cp2-logical-restore` — but the failure was a **teardown**
   `docker exec … dropdb`, not an assertion: that same run reported
   `Tests: 1112 passed, 1112 total` alongside `Test Suites: 1 failed`. Run in
   isolation on a stable daemon the suite passes **13/13**.

None of the three touches asset code. The gate result recorded above was
produced after the cleanup and after Docker was stable again.

## R. Acceptance matrix

| # | Criterion | Evidence |
|---|---|---|
| 1 | Clean exact preflight | §A |
| 2 | G01 A/B and prior chains verified | §A |
| 3 | Exactly three API operations | §C · OpenAPI 8 total = 5 pre-existing + 3 |
| 4 | Exact routes | §C |
| 5 | Canonical auth + Origin protection | §C · API 403 case |
| 6 | No JSON-body guard on upload | §C · the 400-not-415 case |
| 7 | Busboy versions exact | §O |
| 8 | One file, ordered fixed metadata | §D · parser suite |
| 9 | Idempotency key validation exact | §E · unit suite |
| 10 | Raw key never stored or logged | §E · integration case 6 + API logging case |
| 11 | Scope hash exact | §E |
| 12 | Filename normalization exact | §E |
| 13 | Request fingerprint exact | §E — pinned literally |
| 14 | Content fingerprint exact | §E — pinned literally |
| 15 | PNG/JPEG/WebP signatures exact | §D · signature suite |
| 16 | SVG rejected | integration case 10, API 415 case |
| 17 | 25 MiB boundary exact | cases 8 and 9 |
| 18 | No full-file buffering | §D — bounded 12-byte prefix only |
| 19 | Allocation persisted before streaming | §F · case 9 (claim exists, no object) |
| 20 | Active duplicate writes no object | case 12 |
| 21 | Request mismatch conflicts safely | case 13 |
| 22 | Completed replay consumes full body | §F · case 14 |
| 23 | Completed replay writes no object | case 14 |
| 24 | Completed content mismatch conflicts | case 15 |
| 25 | Strict versioned result union | §E · codec suite |
| 26 | Malformed result fails safely | case 16 |
| 27 | Claim token rotates on reclaim | case 19 |
| 28 | Stale claim cannot Tx A/Tx B | cases 21/22 |
| 29 | Only one reclaimer wins | case 20 |
| 30 | Existing asset never deleted on reclaim | case 25 |
| 31 | Missing-asset cleanup precedes replacement | case 23 |
| 32 | Cleanup failure accepts no replacement | case 24 |
| 33 | Tx A exact and atomic | §G · case 17 |
| 34 | Tx B exact and atomic | §G · case 29 |
| 35 | Exactly one inspection outbox event | cases 5, 14, 17, 18, 20, 26 |
| 36 | No worker handler added | `apps/worker` untouched (§O) |
| 37 | Public responses expose no internal fields | §J · projection + API leak cases |
| 38 | Detail/list correctly scoped | §J · out-of-scope 404 case |
| 39 | Cursor pagination, no offset | §J · cursor cases |
| 40 | Route-specific 27m/360s/buffering-off | §I · real-render tests |
| 41 | Global gateway defaults unchanged | §I |
| 42 | MinIO remains private | §I · render test |
| 43 | OpenAPI contains three operations | §N |
| 44 | Client updated without unrelated churn | §N — 0 deletions |
| 45 | Unit tests pass | §K — 194 |
| 46 | All required live cases pass | §L — 30/30 |
| 47 | API/gateway tests pass | §M — 27 + 20 |
| 48 | Zero disposable residue | §Q · case 30 |
| 49 | No migration/schema change | §O |
| 50 | DB baseline unchanged | §Q |
| 51 | Figma unchanged | §Q |
| 52 | I01/I02 unchanged | §O |
| 53 | No frontend implementation | §O |
| 54 | Commit A implementation-only | §P |
| 55 | Commit B evidence-only | §S |
| 56 | Exactly two commits | §S |
| 57 | Report complete, uncompressed | this document |
| 58 | Clean final tree | §S |
| 59 | Nothing pushed | §S |
| 60 | W01/A01/S01 not started | §S |

## S. Handoff and scope closure

**Not done, deliberately:** no inspection worker, no image decoding or
derivatives, no manual retry, no delete endpoint, no product/catalog mutation,
no public media delivery, no Admin or Storefront UI, no Figma change, no
migration.

**What `APP2-W01` inherits:** an asset that reaches `INSPECTING` with truthful
`mime_type`, `size_bytes` and server SHA-256; exactly one durable outbox intent
per asset — event type **`asset.inspection.requested`**, aggregate kind `ASSET`,
payload `{"schemaVersion":1,"assetId":"<UUIDv7>"}`, schema version 1 — waiting
in `PENDING` for the `APP2-I02` runtime; the original readable from the
`ORIGINALS` bucket at `{env}/originals/{assetId}/original.{ext}`; and a
derivative prefix that the intake reclaim path already knows how to clean.

**Two commits:**

| | Commit | Content |
|---|---|---|
| A | `a1cb712eaa6f8c6e50539e721001d83f94f3efd4` | `feat(api): add idempotent Admin asset intake APIs` |
| B | this commit | `docs(app2): record asset-intake API evidence` — this report + status pointers |

Nothing squashed; Commit A was not amended after report authoring began;
nothing pushed.

**Final state:**

```text
APP2-B01 = COMPLETE — DELIVERED_FOR_REVIEW
APP2-W01 = READY — NOT STARTED
APP2-A01 = DESIGN_APPROVED — BLOCKED_BY_APP2-W01
APP2-S01 = DESIGN_AUTHORITY_UI02 — BLOCKED_BY_PUBLIC_BACKEND
```

**Verdict: `PASS`.**
