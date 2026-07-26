# ADR-APP2-001 — Object Storage and Asset Intake Architecture

- Status: Accepted
- Date: 2026-07-26
- Phase / checkpoint: APP2 / `APP2-DEC-STORAGE`
- Decision ID: IMP-D028 (resolves IMP-O002)
- Supersedes: none
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

Exact package set future implementation may add (and only these):
`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`. No broad `aws-sdk`
aggregate. Versions at research time (2026-07-26): both `3.1095.0`.

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
`@aws-sdk/s3-request-presigner`) with `forcePathStyle: true` and a custom
`endpoint`. Business modules never import the SDK or a vendor admin API.

### 4.2 Admin upload and finalization flow (crash-tolerant)

1. **Authorize** — staff-guarded `initiate` use case (ADMIN actor,
   Origin-allowlist, JSON-only).
2. **Reserve** — in one DB transaction, create the `assets` row in state
   `UPLOADED` with a reserved deterministic `storage_key` (§4.4), declared MIME,
   and declared size; commit. The row is the pending-upload marker.
3. **Upload** — browser PUTs the binary to the API through the gateway; the API
   streams it to `putObject` while computing SHA-256 and enforcing synchronous
   validation (§4.6). No full-object buffering.
4. **Finalize** — a separate idempotent `complete` use case verifies the stream
   result, persists `size_bytes` + `checksum` (`sha256:…`), and transitions the
   asset to `INSPECTING` (handing off to `APP2-W01`). Finalization is guarded by
   the existing idempotency arbiter (ADR-DB1-017) so a retried finalize is a
   no-op, not a second effect.
5. **Inspect / derive** — worker (`APP2-W01`) reads the private original,
   records an `asset_inspections` outcome, transitions to `ACCEPTED`/`REJECTED`,
   and writes derivatives; job runtime is `APP2-DEC-JOBS`.

Failure handling: DB row but no upload → pending asset swept after a TTL
(existing IDX-086 processing sweep) and its object prefix deleted; object
uploaded but finalize fails → finalize is idempotent and retryable, checksum
re-verified; checksum/validation mismatch → object deleted, asset `REJECTED`
with a bounded reason; worker failure → `REJECTED` + inspection record; client
re-initiate → new asset id + key (old pending swept); duplicate finalize →
idempotent no-op.

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
  existing column format. ETag is never assumed to equal MD5 or a content hash
  (multipart ETags are not MD5; the spike confirmed ETag ≠ SHA-256).
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

### 4.8 Presigned URL security (portability seam only)

Where presigned URLs are used (reserved future direct-upload / authorized read),
lock: single operation, single object key, short TTL
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
| `OBJECT_STORAGE_PUBLIC_BASE_URL` | prod optional | no | future CDN/proxy base for derivatives |
| `OBJECT_STORAGE_PRESIGN_TTL_SECONDS` | optional | no | default short TTL |
| `OBJECT_STORAGE_MAX_UPLOAD_BYTES` | optional | no | application max; pairs with `GATEWAY_CLIENT_MAX_BODY_SIZE`; default is a product parameter (§7) |

All are read through the app config layer (validated at startup, fail-fast in
production for missing secrets / insecure combinations), never `process.env`
directly in business code. No values in documentation.

### 4.10 Package / module ownership (acyclic)

- **`packages/object-storage/`** (new, future) — owns the `ObjectStoragePort`
  interface, DTO types, the S3 adapter (config-injected), key helpers, and a
  test-support fake/contract-suite. Runtime-loadable to `dist` (IMP-D018) since
  both API and worker consume it. Depends on nothing business.
- **`apps/api`** — owns the `initiate`/`complete` use cases, synchronous
  validation, and adapter wiring.
- **`apps/worker`** — owns inspection/derivative adapter wiring.
- The storage package must **not** own asset lifecycle, catalog publication,
  Nest controllers, worker job semantics, UI, or database repositories.
  Dependencies: `api → object-storage`, `worker → object-storage`; no reverse
  edge, no cycle.

### 4.11 Consistency, cleanup, retention

Object storage and PostgreSQL cannot share a transaction; the design is
**DB-first, storage-second, idempotent-finalize** (§4.2). Orphan objects are
found by listing an asset's `{env}/…/{assetId}/` prefix and comparing to DB
state; stale pending assets are found by the existing processing-state sweep.
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
  `APP2-B01`): create `packages/object-storage` (port + S3 adapter + key helpers
  + contract tests), the pinned MinIO Compose service + bucket bootstrap, the
  config contract + startup validation, and `.env.example` keys. Rationale for
  adding a checkpoint (transparent map change, §9): folding the whole storage
  package + Compose + adapter into `APP2-B01` would push B01 past a single
  reviewable slice; a narrow foundation keeps B01 focused on the intake API.
- **`APP2-B01 — Asset intake API`** may assume: API-proxied streaming upload,
  the `ObjectStoragePort`, synchronous validation + config, UUIDv7 key scheme,
  idempotent finalize; ≤5 endpoints (initiate, upload/complete, detail, list,
  retry).
- **`APP2-W01`** may assume: private-original read, derivative write, inspection
  metadata recording, cleanup interface — **not** its job runtime.
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
