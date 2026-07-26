# APP2-DEC-STORAGE-C1 — Correction Report

Evidence for the asset-intake consistency correction of `APP2-DEC-STORAGE`.
**Correction Commit C: `0c8afd51b513e9a8f9c7945dfae77616f8a57d16`**
(`docs(app2): correct asset-intake architecture`). Branch `production`; nothing
pushed. `APP2-DEC-STORAGE` remains **not accepted** — the four Product Owner
parameters stay open and unapproved.

## A. Preflight and correction findings

`APP2_DEC_STORAGE_C1_PREFLIGHT = PASS`. Initial HEAD before this correction was
the evidence Commit B `ecef0cdc3f333847171b5f392688d5aa6dba6133`. Verified:
Decision Commit A `52d582e56a0adcc40a1e1edd1f985b9c7bc9755b`; Commit B; ADR-APP2-001;
IMP-D028; original completion report present; working tree clean; no APP2
implementation source; no unrelated changes. All preflight gates (`pnpm quality`,
`check:openapi`, `check:api-client`, `check:figma-design-index`,
`db:check:manifest`, `git diff --check`) exited 0 from the clean tree.

Findings corrected: **C1-01** invalid lifecycle sequencing (row `UPLOADED`
created before the object); **C1-02** streaming HTTP transport not locked (parser/
primitive/content-type left to B01); **C1-03** public-base config contradiction
(`OBJECT_STORAGE_PUBLIC_BASE_URL` under a proxied, no-public-URL model).

## B. Asset lifecycle correction (C1-01)

Repository authority: `packages/database/src/schema/asset/assets.ts` —
`size_bytes` is `bigint NOT NULL` with `ck_assets__size_bytes_positive (> 0)`;
`storage_key` is `NOT NULL` + unique; `ASSET_STATES` has **no**
`PENDING_UPLOAD`/`RESERVED`/`UPLOADING`; IDX-086 filters `status in
('UPLOADED','INSPECTING')`. Therefore no honest row can exist before the object
is streamed and measured, and `UPLOADED` is a real post-upload state.

Locked sequence (ADR §4.2): authenticate/authorize → claim idempotency in
`idempotency_records` (no asset row) → generate UUIDv7 id → derive key → stream
to storage with synchronous validation + in-flight SHA-256 → confirm object
completion → **Transaction A** (insert `assets` `UPLOADED` with real
`storage_key`/MIME/positive `size_bytes`/`checksum`/classification; complete/bind
idempotency; audit) → **Transaction B** (guarded `UPLOADED → INSPECTING` +
`outbox_events` insert in one tx) → outbox dispatch → worker.

**Steps 7–8 are two explicit idempotent transactions**, not one and not a
distributed transaction with storage. Crash behaviour: object write precedes all
DB work; keeping `UPLOADED` committed separately from the `INSPECTING` transition
preserves a durable recovery state (IDX-086) that a single collapsed transaction
would erase. Each transaction re-executes as a no-op.

## C. Failure-window and idempotency model

ADR §4.2a table: **before object completion** → no row, no `UPLOADED`, partial/
multipart upload aborted (`lib-storage` auto-abort + incomplete-multipart
lifecycle rule), idempotency claim may fail/expire/retry. **Object ok, Tx A
fails** → orphan *object* only, discoverable by the `{env}/originals/{assetId}/`
prefix, deleted after a bounded retention window; same idempotency key never
creates a second asset identity (CST-048). **Row exists, INSPECTING dispatch
fails** → asset stays truthfully `UPLOADED`, IDX-086 finds it, idempotent retry.
**INSPECTING commits, worker absent** → durable `outbox_events` redelivered,
idempotent worker, no second asset. IDX-086 is never "upload never happened";
idempotency is carried by `idempotency_records`, never a placeholder row or a new
upload-reservation table.

## D. HTTP transport decision (C1-02)

Compared T1 (single streaming multipart) vs T2 (JSON initiation + raw binary).
**Selected T1** (ADR §4.2b): one `POST multipart/form-data`, metadata fields then
one file part, row created post-object in the same request — no initiation state,
one idempotency claim, one endpoint (collapses initiate+upload+complete). T2 was
rejected for APP2: it needs ≥2 endpoints plus upload-token/expiry/cleanup and
init state that (correctly) must live in `idempotency_records` `IN_PROGRESS` — no
new table either way — for no single-operator benefit. No "B01 may choose either".

## E. Streaming package and Nginx contract

Exact future package set (ADR §3.2; current npm versions, not installed):
`@aws-sdk/client-s3` 3.1095.0, `@aws-sdk/s3-request-presigner` 3.1095.0,
`@aws-sdk/lib-storage` 3.1095.0, `busboy` 1.6.0, `@types/busboy` 1.5.4 (type-only,
dev). **AWS upload primitive = `lib-storage` `Upload`** because the parsed file
part is an unknown-length `Readable` (`PutObjectCommand` needs a known
`ContentLength`); managed multipart buffers bounded parts, not the whole object,
and auto-aborts on stream error. Parser = `busboy` streaming (Express platform;
`@nestjs/platform-express`), **not** Multer. No broad `aws-sdk`.

Nginx (ADR §4.2c; **no config change here**, owned by gateway templates at
`APP2-I01`): route-scoped `client_max_body_size` on the upload location only;
**`proxy_request_buffering off`** on that route for end-to-end streaming (never
global); response buffering untouched; upload-sized timeouts; client-disconnect
propagation → API aborts the `Upload`. The exact byte ceiling stays a Product
Owner parameter; configuration ownership is locked.

## F. Security / content-type / checksum correction

ADR §4.2d: `AuthenticatedAdminGuard`, IMP-D027 host-only HttpOnly session cookie
+ exact Origin allowlist, no browser/object-store credentials. **JSON-only body
guard excluded** from the binary stream; upload validates
`Content-Type: multipart/form-data`, rejects missing/unsupported content type,
multiple files, unexpected fields, file-before-metadata; canonical safe envelope
whenever a response channel remains. **Checksum Option A (§4.6): server-computed
SHA-256 is the only authoritative value; no client checksum required.** ETag
remains non-authoritative.

## G. Public-delivery configuration correction (C1-03)

ADR §4.9: `OBJECT_STORAGE_PUBLIC_BASE_URL` **removed** from APP2 scope. APP2
public asset URLs are application/gateway routes (publication-gated, §4.7);
`OBJECT_STORAGE_ENDPOINT` is internal adapter config; no response derives a public
URL from a bucket endpoint. CDN/public-origin base is a future APP12 deployment
decision. Private buckets and the API-proxied, publication-gated delivery model
are unchanged.

## H. Product parameters and checkpoint handoff

The four genuine Product Owner parameters remain **explicit and unapproved**:
max product-image upload bytes (blocks `APP2-B01` only), non-image embroidery
source formats in APP2 (assumed out), original-asset retention (indefinite
assumed), uploaded-SVG requirement (assumed rejected). No approval manufactured.
`APP2-I01` (foundation) precedes `APP2-B01`/`APP2-W01`; ADR §8 handoffs updated:
I01 adds the `lib-storage` adapter + route-scoped nginx support; B01 assumes T1
transport + guards + post-object insert + guarded `→INSPECTING` (≤5 endpoints);
W01 assumes truthful lifecycle + outbox intent; job runtime stays `APP2-DEC-JOBS`.

## I. Controlled spike

OS-temp workspace outside the repo; deleted before Commit C; **no artifacts
committed**; synthetic data; disposable MinIO; no real credentials; dev stack
untouched. Node 22.14 + TypeScript 5.9.3 (`strict` + `exactOptionalPropertyTypes`
+ `noUncheckedIndexedAccess`) compile **PASS**. A Node HTTP server ran T1
(`busboy` → tee to `crypto` SHA-256 + `lib-storage` `Upload`) against MinIO
`RELEASE.2025-04-08T15-41-24Z`. **16/16 checks PASS:** create-bucket; happy 6 MB
PNG → 201, stored object re-hash == server SHA-256, ETag ≠ SHA-256; **peak heap
Δ ≈ 2.17 MB for a 6 MB file (< 4 MB) — no full-object buffering**; oversize
(12 MB > 8 MB) → 413, zero completed objects; signature reject → 422, zero
objects; metadata-after-file → 400; **client disconnect mid-stream → no completed
object, zero dangling multipart** (`AbortMultipartUpload` proven, `lib-storage`
auto-aborts); cleanup prefix empty. Container stopped, port 9400 down, workspace
removed, `embroidery-dev` 6 containers intact, repo tree clean.

## J. Commit C evidence

| Field | Value |
|---|---|
| Commit C hash | `0c8afd51b513e9a8f9c7945dfae77616f8a57d16` |
| Subject | `docs(app2): correct asset-intake architecture` |
| Files (5, docs only) | `ADR-APP2-001-…md`, `14-IMPLEMENTATION-DECISION-REGISTER.md`, `phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md`, `10-MASTER-APPLICATION-ROADMAP.md`, `11-TRACEABILITY-AND-STATUS-MATRIX.md` |
| Change | `+237 / -65`, docs/governance only |

## K. Validation matrix

Before Commit C, all exit 0: `pnpm quality`, `check:openapi`, `check:api-client`,
`check:figma-design-index`, `node --test tools/check-figma-design-index.test.mjs`,
`db:check:manifest`, `node tools/check-file-size.mjs`, `git diff --check`. Frozen
baselines unchanged: OpenAPI `ae015dd6…`, API-client `89c1aace…`, DB 31 migrations
/ 78 tables / 833 columns / `4ca56a59…`. No code/config/Compose/env/dependency/
Figma/generated change; `NO_APP2_MIGRATION` preserved.

## L. Acceptance matrix

All 42 §25 criteria satisfied: A/B chain verified; lifecycle contradiction
acknowledged and fixed (row only after object completion; `UPLOADED` semantics;
real metadata; IDX-086 corrected); failure windows fully specified; idempotency
needs no false row; one transport (T1) + one content type (`multipart/form-data`)
+ one parser (`busboy`) + exact package set + AWS primitive (`lib-storage
Upload`) + unknown-length handling proven; no full-memory buffering; spike passes;
nginx buffering + route-scoped body-limit ownership explicit; admin auth/origin
preserved; JSON guard excluded; multiple-file/unexpected-field locked; server
checksum authoritative; client checksum clarified (Option A); ETag non-
authoritative; public-base contradiction closed; private buckets + publication
gating preserved; product parameters explicit/unapproved; I01/B01/W01 handoffs
exact; job runtime not selected; `NO_APP2_MIGRATION`; no source change; gates
pass; Commit C docs-only; this report evidence-only; cites exact Commit C;
≤200 lines; exactly two commits; tree clean; not pushed; APP2 engineering not
started; next checkpoint not executed.

## M. Scope confirmation

The correction changed no implementation source, config, package, Compose service,
environment file, schema, migration, generated file, Figma artifact, or
dependency. Commit C corrected the ADR + reconciled decision-register/phase-plan/
roadmap/traceability. This Commit D adds only this report and a correction-history
note (§T) in the original completion report.

## N. Evidence closure

**`APP2-DEC-STORAGE` = `COMPLETE — CORRECTED, DELIVERED_FOR_REVIEW`** (verdict
`PASS_WITH_PRODUCT_PARAMETERS`, still not accepted); **`APP2-DEC-STORAGE-C1` =
`COMPLETE`**; `APP2-DEC-JOBS` = `BLOCKED_BY_APP2_DEC_STORAGE_REVIEW`; APP2 product
engineering `NOT_STARTED`. Working tree clean after Commit C; not pushed.

## O. Subsequent correction (`APP2-DEC-STORAGE-C2`)

This report is preserved as C1 evidence. A follow-up correction
**`APP2-DEC-STORAGE-C2`** (2026-07-26) closed three residual gaps C1 left open,
without reopening C1's accepted direction: **(1)** the idempotency claim was
underspecified — C2 locks **model I1 (pre-stream durable allocation)**: the UUIDv7
`assetId`+object key are persisted in the `IN_PROGRESS` `idempotency_records.result`
and the claim is committed before streaming, so a crash-retry recovers the same
identity (repository implementation gap on `claim`, not a schema gap); **(2)** the
immutable request **fingerprint** is defined as the pre-stream normalized request
identity (no file content hash — so C1 §F Checksum Option A stands); **(3)**
`@aws-sdk/s3-request-presigner` is **removed** from the APP2 package set (no
presigned browser flow), and C1's heap-only "no full-object buffering" phrasing is
corrected to "no explicit whole-file application buffer" with RSS/external
verification deferred to `APP2-I01`/`B01`. See
[`APP2-DEC-STORAGE-C2-CORRECTION-REPORT.md`](./APP2-DEC-STORAGE-C2-CORRECTION-REPORT.md)
(Correction Commit E `86d3b91f7df592344c2175cb0840a6084941873e`).
