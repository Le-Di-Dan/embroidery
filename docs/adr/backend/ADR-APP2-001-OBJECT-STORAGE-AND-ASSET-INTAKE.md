# ADR-APP2-001 — Object Storage and Asset Intake Architecture

- Status: Accepted — corrected by `APP2-DEC-STORAGE-C1` and `APP2-DEC-STORAGE-C2` (2026-07-26)
- Date: 2026-07-26 (corrected 2026-07-26)
- Phase / checkpoint: APP2 / `APP2-DEC-STORAGE` (corrections `APP2-DEC-STORAGE-C1`, `APP2-DEC-STORAGE-C2`)
- Decision ID: IMP-D028 (resolves IMP-O002)
- Supersedes: none

> **Correction note (`APP2-DEC-STORAGE-C2`).** C1 left the idempotency contract
> underspecified. C2 locks it (no new ADR/decision id): the selected model is
> **I1 — pre-stream durable allocation** (§4.2e); the application-owned UUIDv7
> `assetId` + object key are durably persisted in the `IN_PROGRESS`
> `idempotency_records.result` (schema-sufficient jsonb, mutable per DB5-A10) so
> a crash-retry recovers the **same** identity; the `idempotency_records.fingerprint`
> is the **pre-stream** normalized request identity (no file content hash, so C1
> checksum Option A stands); the full concurrency/crash matrix (CW-01…CW-07) is
> proven. C2 also **removes `@aws-sdk/s3-request-presigner` from the APP2 package
> set** (§3.2, unused under API-proxied delivery) and corrects the C1 memory
> wording (§4.2b). Persisting the allocation at claim time is a documented
> **repository implementation gap** (owner `APP2-B01`), not a schema gap —
> `NO_APP2_MIGRATION` holds.

> **Correction note (`APP2-DEC-STORAGE-C1`).** The original §4.2 described a
> *reserve-then-upload* flow that created the `assets` row in state `UPLOADED`
> **before** the binary existed. That is invalid: `assets.size_bytes` is
> `NOT NULL` with a `> 0` check and `storage_key` is unique/`NOT NULL`, so no
> honest row can exist before the object is streamed and measured, and
> `UPLOADED` is a real post-upload state (not a pending-upload reservation).
> §4.2/§4.2a/§4.2b below replace that flow: the row is created **only after**
> object storage confirms the binary and the server knows all durable metadata.
> The C1 correction also locks the HTTP transport (single streaming multipart,
> §4.2b), names the exact streaming package set (§3.2), locks the nginx upload
> contract (§4.2c), clarifies the client-checksum trust level (§4.6), and
> removes `OBJECT_STORAGE_PUBLIC_BASE_URL` from APP2 scope (§4.9).
- Related: `SYSTEM_ARCHITECTURE.md` §9–10 (Object-Storage Port), IMP-D018
  (runtime-loadable packages), ADR-DB4-003 (asset association), ADR-DB1-011
  (delete/archive/retention), ADR-DB1-017 (idempotency), IMP-D027 (staff auth /
  origin-allowlist CSRF), `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` §4–6,
  `docs/10-NON-FUNCTIONAL-REQUIREMENTS.md` §4.

> This ADR locks the object-storage product, SDK, and asset-intake architecture
> for APP2. It is a **decision**, not an implementation: no adapter, package,
> Compose service, environment variable, dependency, migration, or UI is created
> by this checkpoint. It deliberately does **not** decide the job runtime
> (`APP2-DEC-JOBS`), the image-processing library (`APP2-W01`), UI (`APP2-D01`),
> or a production CDN vendor (APP12).

## 1. Context

The DB0–DB10 baseline already models assets as metadata that references a binary
in object storage by a stable internal `storage_key` — the binary never enters
PostgreSQL (INV-10). `assets` carries `kind`, `classification`
(CUSTOMER_PRIVATE / PRODUCTION_SENSITIVE / PUBLIC, private-by-default INV-09),
`mime_type`, `size_bytes`, `checksum` (constrained to `^sha256:[0-9a-f]{64}$`),
and a state machine (UPLOADED→INSPECTING→ACCEPTED/REJECTED→DELETION_PENDING→
DELETED). `asset_derivatives` carries its own `storage_key`, `checksum`,
`kind` (PREVIEW_WATERMARKED/MOCKUP/NORMALIZED/THUMBNAIL), and `is_watermarked`.
`asset_inspections` is the append-only inspection-outcome history.

`SYSTEM_ARCHITECTURE.md` §10 defines an application-owned `ObjectStoragePort`
(`putObject`/`getObject`/`deleteObject`/`createSignedReadUrl`/
`createSignedUploadUrl`) and requires: no domain dependency on a specific
product, no vendor admin API in business modules, private-by-default buckets,
authorised short-lived access. The concrete product remained ADR-pending
(`IMP-O002`); `APP2-PRE-AUDIT` confirmed there is no adapter package, no
MinIO/S3 Compose service, and no storage config in `.env.example`, and verdicted
`NO_APP2_MIGRATION`. The API gateway (nginx) already exposes a configurable
`client_max_body_size` (`GATEWAY_CLIENT_MAX_BODY_SIZE`). Asset ids are
application-generated UUIDv7 (ADR-DB1-007).

APP2's first required asset class is **raster product media** (product images);
the Admin tool is single-operator (IMP-D027, REQ-IDN-001), so intake throughput
is low and concurrency is bounded.

## 2. Decision drivers

- Private originals/production files must never be publicly reachable
  (INV-09, security §5); public visibility is governed by catalog publication,
  never by guessing an object URL.
- No storage credentials in the browser.
- One S3-compatible contract must run identically on a developer's Docker host
  and in production (local/prod parity), on Windows and Linux.
- Streaming with backpressure — never buffer a whole object in API memory.
- A server-authoritative content checksum (ETag is not a reliable hash).
- Safe content validation before an object is trusted.
- Orphan/abandoned-upload recovery.
- The storage package must be runtime-loadable by both the API and the worker
  (IMP-D018) with acyclic dependencies.
- Testability against a disposable object store, reusing existing harnesses.

## 3. Options considered

### 3.1 Storage product

| Option | Verdict | Reason |
|---|---|---|
| **A. MinIO (dev) + S3-compatible production adapter** | **Selected** | Apache-2.0, actively released, full S3 API + presign + path-style; runs in Docker on Windows/Linux; the production adapter is the same S3 API against any S3-compatible store. |
| B. AWS S3 as prod target + S3 emulation locally | Folded into A | The *contract* is the AWS S3 API; MinIO is the concrete local emulator. Not a separate architecture — it is A's production side. |
| C. Filesystem / local-disk adapter | **Rejected** | Not horizontally scalable, no native private/presigned/lifecycle semantics, no container-volume durability story, and diverges from the production contract — the pre-audit and `SYSTEM_ARCHITECTURE` require an object-storage port, not a disk. |
| D. Other S3-compatible store (Ceph/Garage/…) | Rejected for now | No repository/product evidence justifying inclusion; the S3-compatible adapter keeps the door open without adding a candidate to enlarge the matrix. |

### 3.2 Node SDK

| Option | Verdict | Reason |
|---|---|---|
| **`@aws-sdk/client-s3` v3 + `@aws-sdk/s3-request-presigner`** | **Selected** | The S3-native, vendor-neutral client: `endpoint` + `forcePathStyle` targets MinIO today and any S3-compatible store in production with no code change; modular (no broad AWS aggregation), ESM, strong TypeScript (compiles under `exactOptionalPropertyTypes`), streaming, presign, typed `S3ServiceException`. Apache-2.0. |
| MinIO JS client (`minio`) | Rejected | Couples the adapter to MinIO's client flavour; weaker portability to AWS/other S3 and a second addressing model. Kept only as a spike comparison. |
| Repository-owned HTTP/SigV4 implementation | Rejected | Re-implements SigV4/multipart/presign — unjustified security and maintenance surface when a vetted official SDK exists. |

Exact package set future implementation may add (and only these). No broad
`aws-sdk` aggregate. Versions at research time (2026-07-26, npm registry):

| Package | Version | Role | Scope |
|---|---|---|---|
| `@aws-sdk/client-s3` | `3.1095.0` | S3 client (put/get/head/delete/list/multipart) | runtime |
| `@aws-sdk/lib-storage` | `3.1095.0` | managed multipart `Upload` for an **unknown-length** stream (the multipart-parsed file part); auto-aborts the S3 multipart upload on stream error | runtime |
| `busboy` | `1.6.0` | streaming multipart parser (T1, §4.2b); Nest is on `@nestjs/platform-express`; **not** Multer (no memory/disk buffering) | runtime |
| `@types/busboy` | `1.5.4` | type-only | dev |

`@aws-sdk/lib-storage` and `busboy`/`@types/busboy` are added because the selected
transport (§4.2b) streams a file part of unknown length. `PutObjectCommand` needs
a known `ContentLength`; the parsed part has none, so the AWS upload primitive is
**`lib-storage` `Upload`** (multipart, bounded part buffering, not full-object
memory buffering). Nothing is installed by this checkpoint.

**`@aws-sdk/s3-request-presigner` is removed from the APP2 package set
(`APP2-DEC-STORAGE-C2`).** APP2 delivery is API-proxied for both upload and
publication-gated download against private buckets — there is **no presigned
browser flow**, so the presigner is an unused dependency. It is **reserved for a
future ADR** that activates presigned transfer (the `createSignedUploadUrl` /
`createSignedReadUrl` portability seam in `SYSTEM_ARCHITECTURE` §10 stays in the
port interface, but the dependency is not installed "for portability"). The §3.2
"Selected" row above (client-s3 + presigner) is superseded by this exact set:
**`@aws-sdk/client-s3` + `@aws-sdk/lib-storage` + `busboy`** (runtime) and
**`@types/busboy`** (dev).

### 3.3 Upload strategy

| Option | Verdict | Reason |
|---|---|---|
| **A. API-proxied streaming upload** (browser → nginx → Nest API → storage) | **Selected** | Same-origin through the gateway → reuses the IMP-D027 staff-session cookie + Origin-allowlist CSRF with no CORS on the object store; the browser never receives storage credentials or a storage endpoint; the API streams the body (no full-object buffering) and computes the authoritative SHA-256 in-flight; best MinIO local parity (the object store stays network-internal, never exposed to the browser); the gateway body limit is a single controllable guard. Fits the single-operator, moderate-image workload. |
| B. Presigned direct upload | Rejected as the canonical flow, **kept as a portability seam** | Requires exposing the object-store endpoint + CORS to the browser and breaks the internal-only local-parity property; its main benefit (offloading large-file bytes from the API) is not needed at APP2 scale. Reserved for a future large-file/scale need behind the same port (`createSignedUploadUrl` already exists). |
| C. Hybrid (small proxy / large presign) | Rejected for APP2 | Two intake code paths and two failure models for no current benefit; revisit only if a large-file class appears. |

The main intake flow is **not** left as an implementation choice: it is A.

## 4. Decision

### 4.1 Product, SDK, adapter boundary

Object storage is **S3-compatible**, accessed only through the application-owned
`ObjectStoragePort` (`SYSTEM_ARCHITECTURE` §10). Development uses **MinIO**;
production uses any **S3-compatible** store configured by environment. The
single SDK family is **AWS SDK v3 S3** (`@aws-sdk/client-s3` +
`@aws-sdk/lib-storage`; presigner removed, §3.2) with `forcePathStyle: true` and
a custom `endpoint`. Business modules never import the SDK or a vendor admin API.

### 4.2 Admin upload flow — row created only after the object exists

The `assets` row is **never** created before the binary is accepted by object
storage. `UPLOADED` means "a real binary has been stored and measured", not "an
upload may happen later". There is no `PENDING_UPLOAD`/`RESERVED`/`UPLOADING`
state, and IDX-086 (`status in ('UPLOADED','INSPECTING')`) is a
processing/recovery access path for *real* uploaded assets — never a
pending-upload store. Conceptual sequence for one intake request:

1. **Authenticate/authorize** — `AuthenticatedAdminGuard` (ADMIN actor,
   host-only HttpOnly session cookie, Origin allowlist, §4.2d). Applies to the
   multipart request; the JSON-body guard is **not** applied to the binary
   stream.
2. **Generate the asset id + key** — application-owned UUIDv7 (ADR-DB1-007) in
   memory **before** any DB write, and derive the final private originals key
   (§4.4) from it and the validated declared content type.
3. **Claim idempotency (durable allocation)** — compute the pre-stream
   fingerprint (§4.2e) and claim `(operation_namespace, scope_key)` in
   `idempotency_records` (`IN_PROGRESS`, CST-048 arbiter, ADR-DB1-017),
   **persisting `{assetId, objectKey}` in the record's `result` and committing the
   claim in its own transaction** so the allocation survives a crash. No `assets`
   row represents the claim. A retry recovers the same `assetId`/key (§4.2e).
4. **Stream to storage** — parse the multipart request and stream the file part
   (§4.2b) to the durable allocated key via `lib-storage` `Upload`, computing
   SHA-256 in-flight and enforcing synchronous intake validation (§4.6). No
   full-object buffering. On any pre-completion failure nothing is inserted
   (§4.2a); a retry overwrites the **same** key (no second object).
5. **Confirm object completion** — the managed upload resolves; the server now
   holds the real `storage_key`, detected MIME, positive `size_bytes`, and
   `checksum`.
6. **Transaction A** (idempotent) — insert the `assets` row (using the
   durably-allocated `assetId`) with **real** `storage_key`/`mime_type`/
   `size_bytes`/`checksum`/`classification` and status `UPLOADED`; **complete**
   the idempotency record (`IN_PROGRESS → COMPLETED`, `result` = the safe asset
   reference) via the held claim; write the canonical audit fact. Commit.
7. **Transaction B** (idempotent) — transition `UPLOADED → INSPECTING` through
   the canonical lifecycle guard **and** enqueue the inspection `outbox_events`
   row in the same transaction (transactional-outbox invariant). Commit.
8. **Dispatch** — the outbox relay publishes the inspection intent; the worker
   (`APP2-W01`) reads the private original, records `asset_inspections`,
   transitions `ACCEPTED`/`REJECTED`, and writes derivatives. Job runtime is
   `APP2-DEC-JOBS`.

**Two transactions, not one, and not a distributed transaction with storage.**
Object storage and PostgreSQL cannot share a transaction, so the object write
(steps 4–5) precedes the asset-insert DB work. Steps 6 and 7 are **two explicit
idempotent transactions** so that `UPLOADED` is a durably observable state for
recovery: if step 7 never runs, the asset truthfully remains `UPLOADED` and
IDX-086 finds it for reconciliation (§4.2a) — collapsing them into one
transaction would erase that recovery window. The idempotency claim (step 3) is a
**third, earlier** commit whose sole job is to durably record the allocation
before the object exists; each transaction is guarded so re-execution is a no-op.

### 4.2a Failure-window and idempotency model

| Window | Guaranteed outcome |
|---|---|
| **Before object completion** (auth/validation fails, stream aborted, client disconnects, S3 PUT fails, max-size exceeded, MIME/signature rejected) | **No `assets` row**; **no `UPLOADED` state**; the partial/multipart upload is aborted (`lib-storage` auto-aborts on stream error; incomplete-multipart lifecycle rule as defense-in-depth); the `IN_PROGRESS` idempotency claim may safely fail/expire/retry. |
| **Object succeeds, Transaction A fails/crashes** | The object may exist with **no `assets` row** — an **orphan**, discoverable through the APP2-owned `{env}/originals/{assetId}/` key prefix, deleted only after a bounded retention window. A retry with the **same idempotency key** must not create a second asset identity (CST-048); the first orphan is prefix-swept. |
| **Row exists, INSPECTING dispatch fails** (Transaction B not committed) | The asset remains truthfully `UPLOADED` (real metadata); IDX-086 finds it for retry/reconciliation; the dispatch retry is idempotent (guarded transition + outbox insert). Never a fake `INSPECTING`. |
| **INSPECTING transition commits, worker does not run** | The `outbox_events` row makes the intent durable; outbox/job reconciliation redelivers it; the worker is idempotent, so **no second asset** and no duplicate derivative identity. |

IDX-086 is never used to mean "upload never happened". Idempotency is carried by
`idempotency_records`, never by a placeholder `assets` row and never by a new
upload-reservation table.

### 4.2b HTTP transport (locked) — single streaming multipart request (T1)

Two transports were compared; the choice is **not** left to `APP2-B01`.

| | **T1 — single streaming multipart (SELECTED)** | T2 — JSON initiation + raw binary stream |
|---|---|---|
| Shape | one `POST` `multipart/form-data`: metadata fields **then** one file part | JSON `initiate` → separate raw `PUT` binary with `Content-Length`+`Content-Type` |
| Initiation state | none needed — row created post-object in the same request | must persist init state **without a false `assets` row** → `idempotency_records` `IN_PROGRESS` (no new table) |
| Endpoints | **1** upload endpoint (collapses initiate+upload+complete) | ≥2 (initiate + upload/complete) + token/expiry/cleanup |
| Idempotency | one claim for the whole request | claim spans two calls; upload-token safety/expiry |
| Verdict | fewer moving parts, one atomic request, smaller surface; fits single-operator scale | more endpoints, upload-token lifecycle, cleanup of abandoned initiations for no APP2 benefit |

**Selected: T1.** Locked contract:

- **Parser:** `busboy` streaming parser (Express platform), `limits: { files: 1,
  fileSize: <max> }`. **Not** Multer (memory or disk buffering both rejected),
  not full-body buffering in Nest or nginx.
- **Content type:** `multipart/form-data` only. Metadata fields **must precede**
  the file part (so validation/limits are known before bytes stream); a file
  arriving before required metadata, a second file part, or unexpected fields is
  rejected with the canonical safe envelope before/without completing an object.
- **Size enforcement:** `busboy` `fileSize` limit (application) paired with the
  gateway `client_max_body_size` (§4.2c); exceeding either aborts the upload
  → 413, no row.
- **AWS primitive:** `@aws-sdk/lib-storage` `Upload` (the file part is an
  unknown-length `Readable`; managed multipart, bounded part buffering). On
  abort/stream error it issues `AbortMultipartUpload`; an incomplete-multipart
  lifecycle rule is defense-in-depth.
- **Checksum:** SHA-256 computed while the same bytes stream to storage (§4.6).
- **Endpoint budget:** `APP2-B01` becomes upload(1) + detail(1) + list(1) +
  retry(1) ≤ 5 (was initiate+complete separate).
- **Memory bounds (`APP2-DEC-STORAGE-C2`, owned by `APP2-I01`/`APP2-B01`):** the
  adapter owns `lib-storage` `Upload` `partSize` and `queueSize` and
  `leavePartsOnError = false` (so aborted uploads clean up); `busboy` file-stream
  `highWaterMark`; and an application hard byte counter tied to an `AbortController`
  wired to both the request and the `Upload`. Bounded-configuration policy:
  in-flight memory ≈ `partSize × queueSize` plus small stream buffers — set from
  the accepted maximum upload size (a Product Owner parameter, §7), not guessed
  tuning constants. **Memory-claim correction:** the C1 spike's Node **heap** delta
  does not account for Buffer/external memory; it proves only that there is **no
  explicit whole-file application buffer**. `APP2-I01`/`APP2-B01` must verify
  RSS/external-memory or bounded-part behaviour at the selected maximum size — the
  earlier "constant memory" phrasing is not retained.

### 4.2c Nginx upload contract (gateway ownership; no config change here)

Locked for the upload route only (owned by the gateway templates, applied at
`APP2-I01`; **no nginx change in this correction**):

- **Route-scoped `client_max_body_size`** on the upload `location` only — never
  a global change (the exact ceiling is a Product Owner parameter, §7).
- **`proxy_request_buffering off`** on the upload route so nginx streams the
  request body to the API instead of buffering the whole request to disk first —
  required for the end-to-end streaming claim. Not disabled globally (unrelated
  routes keep default buffering).
- Response `proxy_buffering` unaffected; upload-sized `proxy_read_timeout` /
  `send_timeout` on the route; client disconnect propagates to the upstream so
  the API aborts the `Upload` (§4.2a).

### 4.2d Upload request security boundary

- `AuthenticatedAdminGuard` (ADMIN actor) — no anonymous upload.
- Reuses the IMP-D027 host-only HttpOnly staff session cookie + exact Origin
  allowlist for credentialed browser requests (CSRF); no browser storage
  credential, no object-store credential ever in the browser.
- The JSON-only body guard is **excluded** from the binary upload stream; the
  upload endpoint validates `Content-Type: multipart/form-data`, rejects a
  missing/unsupported content type, multiple files, unexpected fields, and (for
  T2 only, not selected) missing length. Validation failures use the canonical
  safe error envelope whenever a response can still be sent (a mid-stream client
  abort may leave no response channel — §4.2a still guarantees no row/object).

### 4.2e Upload idempotency: identity, fingerprint, crash-retry (`APP2-DEC-STORAGE-C2`)

**Repository authority** (`packages/persistence/src/platform/idempotency-store.ts`,
`packages/database/src/schema/platform/idempotency-records.ts`, DB7 contract): the
`IdempotencyStore` exposes exactly `claim(namespace, scopeKey, fingerprint)` →
`claimed | in_progress | replay | conflict`, `complete`, `release` (delete of an
`IN_PROGRESS` row — there is no FAILED state), and `find`. The arbiter is the
unique `(operation_namespace, scope_key)` (CST-048) via `onConflictDoNothing`;
`complete` is gated on `status = 'IN_PROGRESS'` (no double-complete); a fingerprint
mismatch is `IDEMPOTENCY_CONFLICT` (GRD-030). Columns `status`/`result`/
`expires_at`/`claimed_at`/`completed_at` are **mutable by design** (DB5-A10);
`operation_namespace`/`scope_key`/`fingerprint` are **immutable request identity**.

**Selected model — I1 (pre-stream durable allocation).** The application generates
the UUIDv7 `assetId` and derives the object key, then claims the record
`IN_PROGRESS` **with `result = {assetId, objectKey}`** and commits that claim in
its own transaction *before* streaming. Because the allocation is durable, a
crash-retry with the same key reads it back (`find`) and reuses the **same**
`assetId`/key — one identity, one object key. Rejected: **I2** (mandatory client
checksum) — needless browser hashing; C1 Option A (server-only SHA-256) stands and
the fingerprint does **not** need the content hash. **I3** (deterministic staging
key + copy/promote) — adds `CopyObject`+delete and extra orphan windows for no
benefit. **I4** (two-step T2) — no schema blocker forces it.

**Durable allocation vs. existing repository.** The schema is **sufficient** —
`result` is nullable, mutable jsonb and already the durable per-claim payload. The
current `claim()` does not *write* `result` at claim time, so persisting the
allocation at claim is a **repository implementation gap** (owner `APP2-B01`: a
claim-with-allocation write, or a follow-up `result` write on the held
`IN_PROGRESS` claim), **not a schema gap** → `NO_APP2_MIGRATION` holds. AssetId
stays application-owned UUIDv7 (never storage- or filename-derived); the key is
never an authorization token.

**Fingerprint contract (§C2-02).** `fingerprint` is a SHA-256 over a canonical,
key-sorted JSON of **pre-stream** identity only: `{ version, operation_namespace,
admin/account scope, idempotency (scope) key, asset kind, classification,
normalized declared MIME, normalized declared filename }`. It is computed **before**
the file streams, is deterministic, bounded, PII-minimized, immutable, and safe to
log only as its hash. It **excludes** raw file bytes, the content SHA-256, the raw
filename where avoidable, the session cookie, request id, multipart boundary, and
ETag. Same key + **different** fingerprint → `IDEMPOTENCY_CONFLICT` (no second
object accepted, no prior result leaked beyond the authorized safe replay). The
public error surface (a `409`-class conflict) is routed to `APP2-B01` to name in
the canonical error taxonomy — not invented here.

**Concurrency / crash matrix.**

| State | Winner / loser | Object writes | Asset identity | HTTP category |
|---|---|---|---|---|
| same key+fp, first `IN_PROGRESS` | winner streams; loser → `in_progress` | 1 (winner) | one allocated | 202/409-class in-progress |
| same key+fp, first `COMPLETED` | replay stored result | 0 (no re-upload) | the one asset | 200-class replay |
| same key, different fp | conflict | 0 | none created | 409 conflict |
| same key after failed/expired claim | expired `IN_PROGRESS` reclaimed (delete), re-claimed | 1 | one | normal |
| two first requests racing before claim commit | one `claimed`, one `in_progress` (CST-048) | 1 | one | normal / in-progress |
| retry after object done, before Tx A | recover same allocation, overwrite same key, then Tx A | +0 net (same key) | same | normal |
| retry after Tx A, before Tx B | replay `COMPLETED`; resume Tx B from truthful `UPLOADED` | 0 | same | 200-class |
| retry after Tx B, before HTTP response | replay `COMPLETED` | 0 | same | 200-class |

This is **at-least-once attempt / idempotent durable effect / one accepted asset
identity** — not exactly-once execution. Crash-window invariants proven: **CW-01**
no object accepted without a durable recoverable identity (allocation committed
first); **CW-02** one key cannot allocate two live asset ids (CST-048 + recovered
allocation); **CW-03** fingerprint mismatch cannot reuse an earlier result;
**CW-04** object-success/DB-failure retry converges on one identity; **CW-05**
`COMPLETED` result replays without re-upload; **CW-06** Tx A done / Tx B missing
resumes from truthful `UPLOADED`; **CW-07** lost HTTP response never duplicates
asset or object. Expired `IN_PROGRESS` claims are reclaimed by the existing sweep
(IDX-093/094); a reclaimed allocation's object is prefix-swept (§4.11).

### 4.3 Bucket topology

**Two private buckets**, environment-named by configuration: an **originals**
bucket (private, never public) and a **derivatives** bucket (holds watermarked/
public-eligible and internal derivatives — still private at the object level).
No object-store public-read, no anonymous listing (security §5). Environment
isolation is by bucket name (and test-run prefix). Bucket names are **not**
hard-coded — they come from `OBJECT_STORAGE_ORIGINALS_BUCKET` /
`OBJECT_STORAGE_DERIVATIVES_BUCKET`. Bucket creation/policy/lifecycle ownership
is the storage-foundation checkpoint (§8), never a business module.

### 4.4 Object-key format

Deterministic, PII-free, prefix-cleanable, UUIDv7-based:

```
{env}/originals/{assetId}/original.{ext}
{env}/derivatives/{assetId}/{derivativeKind}.{ext}
```

(`assetId` = the row's UUIDv7; `ext` derived from the validated content type,
never from the raw client filename.) Not content-hash-based (would complicate
cleanup and the checksum lives in the DB). The key is **not** an authorization
token — the DB remains metadata + authority. No raw filename, email, customer
id, business slug, or Windows path semantics in a key. Path-traversal segments
are rejected. Example (safe fake id): `dev/originals/018f…-uuidv7/original.png`.

### 4.5 Metadata ownership

| Field | Authority |
|---|---|
| original filename | not persisted (used only to derive/validate extension; never a key) |
| declared MIME | request input, validated, not the trusted authority |
| detected MIME (sniffed) | database (`assets.mime_type`) after validation |
| byte size | database (`assets.size_bytes`), server-measured |
| checksum (SHA-256) | database (`assets.checksum` / `asset_derivatives.checksum`), server-computed |
| width/height | validated at intake/inspection; recorded as bounded `asset_inspections.detail` findings — **not** a dedicated column (no schema gap) |
| object key | database (`storage_key`) |
| bucket | configuration (not persisted per-row) |
| ETag | never persisted as a checksum; runtime-only |
| inspection result | database (`asset_inspections`) |
| derivative kind / watermarked | database (`asset_derivatives`) |
| public URL/path | derived at runtime from publication + key; never persisted as a stable public URL |
| processing error class | database (`asset_inspections.detail`, classification only) |

No field has two mutable authorities.

### 4.6 Integrity and validation

- **Checksum:** SHA-256, computed by the **API** while streaming intake (and by
  the **worker** for derivatives), persisted as `sha256:<64hex>` — exactly the
  existing column format. **Option A (selected): the server-computed SHA-256 is
  the only authoritative checksum; the client is not required to supply one.**
  (Option B — client may send an *expected* `sha256:…` that the server
  recomputes and rejects on mismatch — is rejected for APP2: it adds a
  client-trust surface with no benefit at single-operator scale; a client value,
  if ever accepted later, is an advisory integrity hint, never authoritative.)
  ETag is never assumed to equal MD5 or a content hash (multipart ETags are not
  MD5; both spikes confirmed ETag ≠ SHA-256).
- **Synchronous intake validation** (API, `APP2-B01`): declared-MIME allowlist,
  magic-byte/signature sniff, extension↔content consistency, maximum bytes
  (gateway + application), reject on mismatch. Raster product media only:
  allowlist `image/png`, `image/jpeg`, `image/webp`.
- **Asynchronous deep inspection** (worker, `APP2-W01`): image decode,
  pixel-dimension limit, decompression-bomb protection, metadata stripping on
  derivative generation.
- **SVG:** **rejected at intake in APP2** (product media is raster; script/XML/
  external-reference risk). This is independent of APP0's native-SVG editor
  rendering, which never accepts untrusted uploaded SVG. Accepting sanitized
  SVG is a future, separately-decided scope.
- **Archives/executables:** rejected (allowlist is closed to the three raster
  types).
- **Malware scanning:** **not implemented in APP2** (honest limitation).
  Compensating controls: ADMIN-only authenticated intake (no anonymous upload),
  closed raster-type allowlist + signature sniff, private-by-default originals,
  no direct public object URLs, upload rate limiting, audit logging. Future
  owner: APP12 hardening (or earlier if customer upload — APP4/APP5 — expands
  the trust boundary).
- Logs/audit never contain raw object bytes or sensitive metadata (IMP-D022
  redaction).

### 4.7 Public delivery

Public delivery of an approved derivative is **gateway/API-proxied with a
publication check** — never object-store public-read and never a presigned GET
handed out as a stable public URL (security §5–6: "no stable public preview
URL", "direct object storage listing is prohibited"). For a `PUBLISHED` product,
the public read path resolves the `PREVIEW_WATERMARKED`/approved derivative key
and streams it with cache headers and immutable per-derivative versioning
(key includes derivative identity). Unpublished/DRAFT product → not served
(404-class), regardless of key knowledge. Private originals and
production-sensitive assets are never delivered publicly. A **portability seam**
is preserved so a future CDN (APP12+) can front the derivatives bucket without
changing the port. Presigned **read** URLs (`createSignedReadUrl`) remain
available for authorized short-lived internal/admin access, not for public
delivery.

### 4.8 Presigned URL security (portability seam only — not built in APP2)

`APP2-DEC-STORAGE-C2` confirms APP2 uses **no** presigned browser flow, so
`@aws-sdk/s3-request-presigner` is **not** an APP2 dependency (§3.2) and the port's
`createSignedUploadUrl`/`createSignedReadUrl` methods are reserved, not wired.
Should a future ADR activate presigned transfer, lock: single operation, single
object key, short TTL
(`OBJECT_STORAGE_PRESIGN_TTL_SECONDS`), constrained content-length/type where
enforceable, scoped credentials, explicit CORS origins/methods/headers,
mandatory server-side completion confirmation + checksum re-verification. Never
persist a presigned URL; never expose storage credentials to the browser; never
allow client-selected arbitrary bucket/key.

### 4.9 Configuration contract (names only — not added to `.env.example` here)

| Variable | Required | Secret | Notes |
|---|---|---|---|
| `OBJECT_STORAGE_PROVIDER` | yes | no | `minio` (dev) / `s3` (prod) selector |
| `OBJECT_STORAGE_ENDPOINT` | dev yes / prod optional | no | custom endpoint (MinIO); omit for AWS default |
| `OBJECT_STORAGE_REGION` | yes | no | e.g. `us-east-1` for MinIO |
| `OBJECT_STORAGE_ACCESS_KEY_ID` | yes | **yes** | credential |
| `OBJECT_STORAGE_SECRET_ACCESS_KEY` | yes | **yes** | credential |
| `OBJECT_STORAGE_FORCE_PATH_STYLE` | yes | no | `true` for MinIO |
| `OBJECT_STORAGE_ORIGINALS_BUCKET` | yes | no | private originals bucket |
| `OBJECT_STORAGE_DERIVATIVES_BUCKET` | yes | no | derivatives bucket |
| `OBJECT_STORAGE_PRESIGN_TTL_SECONDS` | optional | no | default short TTL |
| `OBJECT_STORAGE_MAX_UPLOAD_BYTES` | optional | no | application max; pairs with `GATEWAY_CLIENT_MAX_BODY_SIZE`; default is a product parameter (§7) |

**Correction (`APP2-DEC-STORAGE-C1`): `OBJECT_STORAGE_PUBLIC_BASE_URL` is removed
from APP2 scope.** APP2 public asset URLs are **application/gateway routes**
(publication-gated, §4.7); the object-store `OBJECT_STORAGE_ENDPOINT` is
internal adapter configuration only. No application response derives a public URL
from a bucket endpoint. A CDN/public-origin base is a future *deployment*
decision (APP12), not an APP2 implementation variable — reintroduced only then.

All are read through the app config layer (validated at startup, fail-fast in
production for missing secrets / insecure combinations), never `process.env`
directly in business code. No values in documentation.

### 4.10 Package / module ownership (acyclic)

- **`packages/object-storage/`** (new, future) — owns the `ObjectStoragePort`
  interface, DTO types, the S3 adapter (config-injected, wrapping
  `@aws-sdk/client-s3` + `@aws-sdk/lib-storage` `Upload`; **no presigner** in
  APP2, §3.2/§4.8), key helpers, and a test-support fake/contract-suite.
  Runtime-loadable to `dist` (IMP-D018) since both API and worker consume it.
  Depends on nothing business.
- **`apps/api`** — owns the HTTP transport (the `busboy` streaming multipart
  parse, §4.2b), the single upload use case (auth → durable idempotency
  allocation → stream → two idempotent transactions, §4.2/§4.2e), and synchronous
  intake validation. The multipart parser lives at the API HTTP boundary, not in
  the storage package; the idempotency claim uses the platform `IdempotencyStore`
  (with the C2 claim-with-allocation extension, §4.2e).
- **`apps/worker`** — owns inspection/derivative adapter wiring.
- The storage package must **not** own asset lifecycle, catalog publication,
  Nest controllers, worker job semantics, UI, or database repositories.
  Dependencies: `api → object-storage`, `worker → object-storage`; no reverse
  edge, no cycle.

### 4.11 Consistency, cleanup, retention

Object storage and PostgreSQL cannot share a transaction; the corrected design
is **storage-first, DB-second, two idempotent transactions** (§4.2/§4.2a) — the
binary is confirmed before any row exists, so a crash yields at worst an orphan
*object*, never a phantom `UPLOADED` *row*. Orphan objects are found by listing
an asset's `{env}/…/{assetId}/` prefix and comparing to DB state; `UPLOADED`
rows whose INSPECTING dispatch was lost are found by the existing IDX-086
processing sweep.
Cleanup policy: abandoned authorization / unfinalized object → deleted after a
retention TTL; failed inspection → object may be retained per ADR-DB1-011
tombstone/retention (not auto-hard-deleted); **product unpublish never deletes
originals or derivatives** (only removes public visibility); test objects →
disposable per-run bucket/prefix. Two-phase tombstone (IDX-133): mark
`DELETION_PENDING`, delete the binary, then set `deleted_at`. The **execution
mechanism** for scheduled cleanup (a claim job vs a lifecycle rule) is
`APP2-DEC-JOBS` — this ADR defines the policy, not the runner.

### 4.12 Local MinIO parity

Dev MinIO is **version-pinned** (a specific `RELEASE.*` tag, never `latest`),
speaks the S3 API with path-style, is health-checked at
`/minio/health/ready`, has buckets bootstrapped by the storage-foundation
checkpoint, receives credentials by env injection, and is **network-internal
only** — the MinIO console is never behind the public gateway; because the
canonical upload flow is API-proxied, the browser never needs direct MinIO
access (no browser-facing CORS). A dev persistent volume + a disposable
per-run test instance (reusing the T01/DB7 disposable pattern, `CleanupStack`)
are provided by the foundation checkpoint.

### 4.13 Test strategy

Storage-adapter **contract tests** against a disposable local MinIO
(create/put/get/head/delete, path-style, custom endpoint, presign, prefix list,
typed errors); upload security/validation unit tests (allowlist, signature
mismatch, oversize, SVG/archive rejection); disposable-DB application
integration for initiate/finalize idempotency and orphan sweep; worker
idempotency/derivative tests (`APP2-W01`); negative public-visibility tests
(draft/unpublished never served); cross-layer publication E2E with a real
disposable MinIO in the `@embroidery/e2e-testing` orchestrator (`APP2-E01`).
No second DB or E2E harness; reuse APP0/APP1 canonical harnesses.

## 5. Migration verdict

**`NO_APP2_MIGRATION`.** Every persisted field maps to an existing column:
`kind`, `classification`, `storage_key`, `mime_type`, `size_bytes`, `checksum`
(`sha256:…` format already enforced), `status`; derivative `storage_key`,
`checksum`, `kind`, `is_watermarked`; inspection `outcome`/`detail`. Image
dimensions are validated and recorded as bounded inspection findings, not a new
column. No schema gap found; if a later spec proves one, it becomes a dedicated
forward-only `APP2-DB01` checkpoint — never an edited migration here.

**`APP2-DEC-STORAGE-C2` re-confirms `NO_APP2_MIGRATION`.** The upload-idempotency
model (§4.2e) is fully representable on the existing `idempotency_records`
(`result` jsonb holds the `{assetId, objectKey}` allocation; mutable per DB5-A10),
proven against the real 31-migration schema (§ Appendix). Persisting the
allocation at claim time is a **repository implementation gap** (owner `APP2-B01`),
**not** a schema gap — no missing durable fact, no new column/constraint, so no
`APP2-DB01` is raised and `APP2-DEC-STORAGE-C2` is **not** `BLOCKED_BY_SCHEMA_GAP`.

## 6. Consequences

Positive: one S3-compatible contract dev→prod; no browser credentials; private
originals guaranteed; server-authoritative checksums fitting the frozen schema;
no migration; acyclic runtime-loadable package; clear handoffs. Negative /
accepted: API-proxied uploads consume API/gateway bandwidth (acceptable at
single-operator scale; presign seam reserved); public images are proxied rather
than CDN-served in APP2 (portability seam reserved for APP12); malware scanning
deferred with explicit compensating controls; MinIO is a production
*approximation* — the production S3-compatible store is validated in APP12.

## 7. Product parameters requiring Product Owner review

Technical architecture is complete; these business values remain (verdict
`PASS_WITH_PRODUCT_PARAMETERS`):

1. **Maximum product-image upload size** — safe configurable default proposed
   (`OBJECT_STORAGE_MAX_UPLOAD_BYTES`, pair with gateway limit); the exact
   ceiling is a PO value, required before `APP2-B01`.
2. **Whether non-image embroidery source formats** (e.g. `.dst`/`.emb`) are
   APP2 intake scope — assumed **out** (APP2 = raster product media); confirm.
3. **Original-asset retention** — indefinite retention of originals assumed;
   confirm any retention window.
4. **Uploaded SVG** — assumed **not needed** in APP2 (rejected); confirm.

None blocks locking the architecture; (1) blocks `APP2-B01` execution only.

## 8. Implementation handoff

- **New checkpoint `APP2-I01 — Object-storage foundation`** (inserted before
  `APP2-B01`): create `packages/object-storage` (port + S3 adapter over
  **`client-s3` + `lib-storage` only — no presigner**, §3.2/§4.8 — + key helpers
  + contract tests), the pinned MinIO Compose service + bucket bootstrap, the
  config contract + startup validation, `.env.example` keys, the **route-scoped
  nginx upload support** (§4.2c), and the `lib-storage` memory-bound policy
  (`partSize`/`queueSize`/`leavePartsOnError=false`, §4.2b). No Asset/idempotency
  use case. Rationale (transparent map change, §9): folding the storage package +
  Compose + adapter + gateway support into `APP2-B01` would push B01 past a single
  reviewable slice.
- **`APP2-B01 — Asset intake API`** may assume, with **no transport/library
  decision left open**: the T1 single streaming multipart transport (§4.2b) with
  `busboy`; staff auth/origin/content-type guards (§4.2d); synchronous stream
  validation; object write via `lib-storage` `Upload`; the post-object `assets`
  insert as `UPLOADED` then the guarded `UPLOADED → INSPECTING` handoff (two
  idempotent transactions, §4.2); status/read APIs — ≤5 endpoints (upload, detail,
  list, retry). **B01 must implement the §4.2e idempotency model:** the
  claim-with-allocation extension on `IdempotencyStore` (documented repository
  implementation gap, schema-sufficient), stable UUIDv7 `assetId` allocation +
  crash recovery, the canonical pre-stream fingerprint, same-key mismatch
  (`IDEMPOTENCY_CONFLICT` → named 409-class error), replay-after-response-loss,
  and Tx A/Tx B resume — with tests covering every §4.2e concurrency/crash row
  (CW-01…CW-07).
- **`APP2-W01`** may assume: private-original read, derivative write, server-owned
  SHA-256, truthful `UPLOADED`/`INSPECTING` lifecycle, outbox/job intent emitted
  by B01, cleanup interface — **not** its job runtime (`APP2-DEC-JOBS`).
- **Frontends:** Admin (`APP2-A01`) consumes the initiate→upload→finalize
  contract with progress/status; Storefront (`APP2-S01/S02`) consumes proxied
  published-derivative URLs governed by publication. No UI is designed here.

## 9. Checkpoint-map change

The pre-audit's 17-checkpoint map gains one narrow prerequisite →
**18 checkpoints**: `… D01 → APP2-I01 (object-storage foundation) → B01 → W01 →
…`. `APP2-I01` depends on `APP2-DEC-STORAGE` (this ADR); `APP2-B01` now depends
on `APP2-I01`. All other ordering, endpoint counts, and the acyclic/Admin-leads
properties are unchanged.

## Appendix — research and spike evidence

**Official primary sources (retrieved 2026-07-26):**
- AWS SDK for JavaScript v3 — `@aws-sdk/client-s3` / `s3-request-presigner`,
  `docs.aws.amazon.com` + `github.com/aws/aws-sdk-js-v3` (Apache-2.0; custom
  `endpoint` + `forcePathStyle`; modular clients; `getSignedUrl`). Version
  `3.1095.0`.
- MinIO — `min.io` docs + `github.com/minio/minio` (AGPL-3.0 server; S3 API;
  `/minio/health/ready`; path-style). `minio` JS client `8.0.7` (Apache-2.0).
- AWS S3 — `docs.aws.amazon.com/AmazonS3` (ETag is not guaranteed MD5,
  especially for multipart; use a separate integrity hash).
- Node.js — `nodejs.org/api` (`crypto.createHash('sha256')`, stream backpressure).
- Nginx — `nginx.org/en/docs` (`client_max_body_size`, `proxy_request_buffering`).

**Controlled spike (OS-temp workspace, outside repo, deleted before Commit A;
no artifacts committed):** Node 22.14, TypeScript 5.9.3 strict +
`exactOptionalPropertyTypes` compile PASS; live disposable MinIO
(`RELEASE.2025-04-08T15-41-24Z`) via `@aws-sdk/client-s3@3.1095.0` +
`s3-request-presigner@3.1095.0` with `forcePathStyle` + custom endpoint. All
checks PASS: create-bucket, streaming put (Readable + ContentLength +
ContentType + custom metadata), head (content-type + checksum-metadata
round-trip), get streamed + independent SHA-256 re-hash match, presigned PUT
(60 s TTL, single key, path-style), list-by-prefix (cleanup feasible),
delete, typed `NotFound`/HTTP 404 error classification. Observed
single-part ETag ≠ server SHA-256 — confirms §4.6 (compute our own checksum).
Container stopped/removed; workspace deleted; dev stack untouched; zero residue.

**Correction spike (`APP2-DEC-STORAGE-C1`, retrieved/executed 2026-07-26; OS-temp
workspace outside repo, deleted before the correction commit; no artifacts
committed; no real credentials):** researched current npm versions
(`@aws-sdk/lib-storage` `3.1095.0`, `busboy` `1.6.0`, `@types/busboy` `1.5.4`).
Node 22.14 + TypeScript 5.9.3 (`strict` + `exactOptionalPropertyTypes` +
`noUncheckedIndexedAccess`) compile **PASS**. A Node HTTP server ran the T1
transport (`busboy` streaming parse → tee to `crypto` SHA-256 + `lib-storage`
`Upload`) against disposable MinIO `RELEASE.2025-04-08T15-41-24Z`. **16/16
checks PASS:** create-bucket; happy path — 6 MB PNG streamed, HTTP 201, stored
object independently re-hashed == server SHA-256, ETag ≠ SHA-256; **memory
evidence — peak heap Δ ≈ 2.17 MB for the 6 MB file, indicating no explicit
whole-file application buffer** (heap alone excludes Buffer/external memory —
corrected by C2 §4.2b; RSS/external verification deferred to `APP2-I01`/`B01`);
oversize (12 MB > 8 MB limit) → 413 with **zero completed objects**; signature
reject (PNG mime, non-PNG magic bytes) → 422 with **zero objects**;
metadata-after-file ordering → 400; **client disconnect mid-stream → no completed
object and zero dangling multipart uploads** (`lib-storage` auto-aborts on stream
error; `AbortMultipartUpload` proven available); prefix cleanup empties. Container
stopped, port 9400 down, workspace `rm -rf`, `embroidery-dev` 6 containers intact,
repo tree clean.

**Correction spike (`APP2-DEC-STORAGE-C2`, executed 2026-07-26; OS-temp workspace
outside repo, deleted before the correction commit; no artifacts committed; no
real credentials; synthetic raster payloads):** disposable PostgreSQL 16 with the
**real 31 migrations applied** (78 public tables — matches the frozen baseline) +
disposable MinIO `RELEASE.2025-04-08T15-41-24Z`, driven by `pg` + `@aws-sdk/
client-s3`/`lib-storage`. The idempotency SQL **mirrors
`packages/persistence/src/platform/idempotency-store.ts` exactly** (claim =
`onConflictDoNothing` on `(operation_namespace, scope_key)`; `complete` gated on
`IN_PROGRESS`; fingerprint-mismatch conflict; `release` = delete) so the real
schema/constraints arbitrate; repo source unaltered. **18/18 checks PASS**
validating model I1 (§4.2e): first-claim; **concurrent duplicate → exactly one
winner** (CST-048); **crash-before-Tx-A retry recovers the SAME UUIDv7 assetId**
from the durable `IN_PROGRESS` `result`; **same object key overwrite** (retry
writes 1 key, no second object); Tx A `complete` (`IN_PROGRESS → COMPLETED`);
**replay after response loss → stored result, zero re-upload**; same-key/
different-fingerprint → conflict with **zero object**; no-double-complete;
expired `IN_PROGRESS` reclaimed then re-claimed; rolled-back claim leaves no row;
cleanup empties. This proves the model is **schema-representable with no migration**
(the `result` jsonb holds the allocation) and that the only shortfall is a
**repository implementation gap** (claim-with-allocation write, owner `APP2-B01`).
Both containers stopped, ports 55432/9400 down, workspace deleted, `embroidery-dev`
6 containers intact, repo tree clean.
