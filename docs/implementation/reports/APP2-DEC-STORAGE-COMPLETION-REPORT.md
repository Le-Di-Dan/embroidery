# APP2-DEC-STORAGE — Completion Report

Paired evidence for the APP2 object-storage decision. **Decision Commit A:
`52d582e56a0adcc40a1e1edd1f985b9c7bc9755b`** (`docs(app2): select object-storage
architecture`). Branch `production`; initial HEAD before the decision
`3fc1313ef9616348d3d42186fbbdc5ec958d8943` (APP2 pre-audit evidence). **Nothing
pushed.** Verdict **`PASS_WITH_PRODUCT_PARAMETERS`**; APP2 product engineering
not started.

## A. Preflight and pre-audit revalidation

| Check | Result |
|---|---|
| `git branch --show-current` | `production` |
| Initial HEAD | `3fc1313ef9616348d3d42186fbbdc5ec958d8943` |
| Working tree at start | clean |
| APP2 pre-audit Commit A | `8643431b420d28b6eb8458bb3a87c936ca803280` (`docs(app2): audit assets and catalog publication entry`) |
| APP2 pre-audit Commit B | `3fc1313ef9616348d3d42186fbbdc5ec958d8943` (`docs(app2): record pre-implementation audit evidence`) |
| Audit + report present | `audits/APP2_PRE_IMPLEMENTATION_AUDIT.md`, `reports/APP2-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md` |
| APP2 phase plan + decision register | present; IMP-O002 open, owned by this checkpoint |
| Storage adapter/package/Compose/env | none (revalidated absent) |
| APP2 code/migration/Figma change | none |
| Unrelated changes | none |

`APP2_DEC_STORAGE_PREFLIGHT = PASS` — `pnpm quality`, `check:openapi`,
`check:api-client`, `check:figma-design-index`, `db:check:manifest`,
`git diff --check` all exited 0 from the clean initial tree.

## B. Repository / product constraints

- `SYSTEM_ARCHITECTURE.md` §9–10: object storage is authoritative for binaries;
  application depends only on `ObjectStoragePort`; private-by-default; no vendor
  admin API in business modules; no permanent public URLs.
- Schema (frozen): `assets` (kind/classification/storage_key/mime_type/
  size_bytes/checksum `sha256:…`/status LC-06), `asset_derivatives`
  (own storage_key/checksum/kind/is_watermarked), `asset_inspections` (append-
  only outcome/detail). Asset id = application UUIDv7 (ADR-DB1-007).
- Security §4–6: validate size/MIME/signature/extension/decode/SVG-sanitization/
  dimension; never trust client MIME; private assets need authz; no object-store
  listing; no stable public preview URL; layered watermark.
- NFR §4: size, MIME, signature, image decode, SVG sanitization, malware "where
  practical", pixel-dimension, processing timeout, storage isolation.
- Product docs do not lock exact byte/dimension ceilings → product parameters
  (§N). Gateway already has configurable `client_max_body_size`.
- First asset class = raster product media; Admin single-operator (low intake
  concurrency).

## C. Official-source research (retrieved 2026-07-26)

Primary sources only; paraphrased, no long copy.

| Source | Domain | Claim used | Version |
|---|---|---|---|
| AWS SDK for JavaScript v3 | docs.aws.amazon.com · github.com/aws/aws-sdk-js-v3 | modular S3 client; `endpoint`+`forcePathStyle`; `getSignedUrl`; typed exceptions; Apache-2.0 | `@aws-sdk/client-s3` 3.1095.0, `@aws-sdk/s3-request-presigner` 3.1095.0 |
| MinIO | min.io · github.com/minio/minio | S3-compatible; `/minio/health/ready`; path-style; AGPL-3.0 server | image `RELEASE.2025-04-08T15-41-24Z`; `minio` JS client 8.0.7 (Apache-2.0) |
| AWS S3 | docs.aws.amazon.com/AmazonS3 | ETag is not a guaranteed MD5/content hash (esp. multipart) → use own integrity hash | — |
| Node.js | nodejs.org/api | `crypto.createHash('sha256')`; stream backpressure | 22.14 |
| Nginx | nginx.org/en/docs | `client_max_body_size`, `proxy_request_buffering` for proxied uploads | — |

## D. Candidate matrix

Hard gates: private originals · no browser credentials · S3 local/prod parity ·
streaming/backpressure · own checksum · safe validation · orphan recovery ·
testability · Win/Linux/Docker · runtime-loadable package.

**Storage product:** MinIO(dev)+S3-compatible(prod) **selected** (all gates);
AWS S3-as-emulation folded in (it is the prod side of the same contract);
filesystem **rejected** (no scale/private/presign/lifecycle, diverges from the
port); other S3 stores deferred (no evidence to include).
**SDK:** AWS SDK v3 S3 **selected** (vendor-neutral against MinIO+S3, modular,
strict-TS, streaming, presign, typed errors); MinIO JS client rejected
(portability); repo-owned HTTP rejected (SigV4 surface).
**Upload:** API-proxied streaming **selected** (same-origin CSRF reuse, no
browser creds, no store CORS, best local parity, streamed); presigned rejected
as canonical / **kept as portability seam**; hybrid rejected (two paths, no
benefit at scale).
**Bucket topology:** two private buckets (originals + derivatives) **selected**
(public delivery is proxied+publication-gated, not public-read).
**Public delivery:** gateway/API-proxied with publication check **selected**
(no stable public URL; CDN seam reserved).

## E. Controlled spike

OS-temp workspace outside the repo; deleted before Commit A; **no artifacts
committed**; dev stack untouched; zero residue.

- Env: Node 22.14, TypeScript 5.9.3 (`strict` + `exactOptionalPropertyTypes` +
  `noUncheckedIndexedAccess`), disposable MinIO `RELEASE.2025-04-08T15-41-24Z`
  (`docker run --rm`, port 9400), `@aws-sdk/client-s3@3.1095.0` +
  `@aws-sdk/s3-request-presigner@3.1095.0`, `forcePathStyle`+custom endpoint.
- Strict compile: **PASS** (`tsc --noEmit`, exit 0).
- Live run: **SPIKE_PASS** (exit 0) — create-bucket, streaming put (Readable +
  ContentLength + ContentType + custom metadata), head (content-type + checksum
  metadata round-trip), get streamed + independent SHA-256 re-hash **match**,
  presigned PUT (60 s TTL, single key, path-style), list-by-prefix (cleanup
  feasible), delete, typed `NotFound`/HTTP 404 classification.
- Key finding: single-part ETag `e3aac5ad…` ≠ server SHA-256 `sha256:b0267d78…`
  → confirms the API must compute its own checksum (ADR §4.6).
- Teardown: container stopped/removed; workspace `rm -rf`; port 9400 down;
  `embroidery-dev` 6 containers intact; repo tree clean.

## F. Selected storage product and SDK

S3-compatible behind `ObjectStoragePort`; **MinIO** dev (version-pinned,
network-internal, path-style) / any **S3-compatible** store prod by config.
Single SDK family **AWS SDK v3 S3** — future implementation may add exactly
`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (no broad `aws-sdk`, no
MinIO client, no repo HTTP client). Not installed by this checkpoint.

## G. Selected upload and finalization flow

**API-proxied streaming upload.** Authorize (staff guard, Origin-allowlist,
JSON) → reserve (`assets` row `UPLOADED` + deterministic key, one DB tx) →
stream PUT through nginx→API to `putObject` while computing SHA-256 + running
synchronous validation → idempotent finalize (persist size+checksum,
→`INSPECTING`) → worker inspect/derive (`APP2-W01`). Crash paths: pending-no-
upload swept by IDX-086 + prefix delete; upload-no-finalize → idempotent
retry + re-verify; checksum/validation fail → delete object + `REJECTED`;
duplicate finalize → no-op (ADR-DB1-017).

## H. Bucket / key / metadata / checksum contract

- Two private buckets, env-named (`OBJECT_STORAGE_ORIGINALS_BUCKET` /
  `…_DERIVATIVES_BUCKET`); no public-read/anonymous-list.
- Key: `{env}/{originals|derivatives}/{assetId-uuidv7}/{original|derivativeKind}.{ext}`
  — PII-free, prefix-cleanable, not authorization; ext from validated content
  type, never raw filename.
- Metadata authority: DB owns storage_key/detected-MIME/size/checksum/
  inspection/derivative fields; filename not persisted; ETag never a checksum;
  width/height = validated + recorded in `asset_inspections.detail` (no column,
  no gap); public URL derived at runtime, never persisted.
- Checksum: server-computed **SHA-256** (`sha256:<hex>`), API for originals /
  worker for derivatives; multipart ETag explicitly not trusted.

## I. Validation, SVG, and security policy

Synchronous intake (API): declared-MIME allowlist `image/png, image/jpeg,
image/webp` + magic-byte sniff + extension consistency + max-bytes (gateway +
app). Async worker: decode, pixel-dimension + decompression-bomb limits,
metadata stripping. **SVG rejected at intake** (raster-only; independent of the
APP0 native-SVG editor). Archives/executables rejected. **Malware scanning
deferred** (honest limitation) with compensating controls: ADMIN-only auth
intake, closed raster allowlist + signature sniff, private-by-default, no public
object URLs, upload rate limiting, audit; future owner APP12. No raw bytes/
sensitive metadata in logs.

## J. Public delivery and cleanup

Public derivative delivery = gateway/API-proxied **with a publication check** +
cache headers + immutable per-derivative versioning; unpublished/DRAFT → not
served regardless of key knowledge; originals/production-sensitive never public;
CDN portability seam reserved (APP12). Cleanup: abandoned/unfinalized → deleted
after retention TTL; failed inspection → retained per ADR-DB1-011; **unpublish
never deletes originals/derivatives**; test objects disposable per run;
two-phase tombstone (IDX-133). Scheduled-cleanup **runner** = `APP2-DEC-JOBS`.

## K. Configuration and package ownership

`OBJECT_STORAGE_*` env contract (provider/endpoint/region/access-key/secret/
force-path-style/originals-bucket/derivatives-bucket/public-base-url/presign-ttl/
max-upload-bytes) — names only, **not** added to `.env.example` here; read via
the config layer (secrets fail-fast in prod), never raw `process.env` in
business code; no values/credentials in docs. New **`packages/object-storage`**
owns port+adapter+key-helpers+contract tests (runtime-loadable, IMP-D018); API
owns initiate/finalize; worker owns inspection/derivative wiring; acyclic
(`api→object-storage`, `worker→object-storage`).

## L. Database / migration verdict

**`NO_APP2_MIGRATION`.** All persisted fields map to existing columns; SHA-256
fits the `assets.checksum` / `asset_derivatives.checksum` format; dimensions
are inspection findings, not a column. No schema gap; any future proven gap →
dedicated forward-only `APP2-DB01`, never an edited migration.

## M. Implementation handoff

New narrow **`APP2-I01` object-storage foundation** before `APP2-B01` (package +
pinned MinIO Compose service + bucket bootstrap + config + `.env.example` keys +
contract tests) — checkpoint map now **18**. `APP2-B01` may assume API-proxied
streaming upload + port + validation/config + UUIDv7 keys + idempotent finalize
(≤5 endpoints). `APP2-W01` may assume private-original read + derivative write +
inspection metadata + cleanup interface (not its runtime). Admin/Storefront
consume the intake contract / proxied published-derivative URLs (no UI here).

## N. Product parameters / human-review questions

`PASS_WITH_PRODUCT_PARAMETERS` — technical architecture complete; genuine PO
values remain: (1) **max product-image upload size** (safe configurable default
proposed; exact ceiling blocks `APP2-B01` only); (2) whether **non-image
embroidery source formats** are APP2 intake scope (assumed out); (3)
**original-asset retention** window (indefinite assumed); (4) **uploaded SVG**
need (assumed no / rejected). SDK internals are not PO questions.

## O. Decision and Commit A evidence

ADR: `docs/adr/backend/ADR-APP2-001-OBJECT-STORAGE-AND-ASSET-INTAKE.md`
(placed under `adr/backend/` per the `ADR-APP1-001` APP-ADR precedent — not a
new `adr/application/` hierarchy, per CLAUDE.md). Decision ID **IMP-D028**;
resolves **IMP-O002**.

| Field | Value |
|---|---|
| Commit A hash | `52d582e56a0adcc40a1e1edd1f985b9c7bc9755b` |
| Subject | `docs(app2): select object-storage architecture` |
| Files changed | 5 (`+413 / -4`) |
| New | `ADR-APP2-001-OBJECT-STORAGE-AND-ASSET-INTAKE.md` |
| Modified | `14-IMPLEMENTATION-DECISION-REGISTER.md`, `phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md`, `10-MASTER-APPLICATION-ROADMAP.md`, `11-TRACEABILITY-AND-STATUS-MATRIX.md` |
| Nature | docs/governance only |

## P. Validation matrix

Before Commit A, from the decision tree (all exit 0):

| Command | Exit | Result |
|---|---|---|
| `pnpm quality` | 0 | full chain incl. api 84/937, figma, openapi, api-client, db-manifest |
| `pnpm check:openapi` | 0 | unchanged |
| `pnpm check:api-client` | 0 | unchanged (`89c1aace…`) |
| `pnpm check:figma-design-index` | 0 | 39 IDs / 39 rows / 6 tables |
| `node --test tools/check-figma-design-index.test.mjs` | 0 | 75/75 |
| `pnpm db:check:manifest` | 0 | all checks passed |
| `node tools/check-file-size.mjs` | 0 | pass |
| `git diff --check` | 0 | clean |

Doc validation: ADR ID `ADR-APP2-001` unique; IMP-D028 unique; IMP-O002 resolved
once; official-source links valid; no raw secrets; no invented product limits
(routed §N); one selected architecture, no unresolved technical branch;
checkpoint graph acyclic; no code/Compose/package/schema/Figma/generated change.
Frozen baselines unchanged: OpenAPI `ae015dd6…`, API-client `89c1aace…`, DB 31
migrations / 78 tables / 833 columns / `4ca56a59…`.

## Q. Acceptance matrix

All 47 §39 criteria satisfied. Highlights: pre-audit chain verified; IMP-O002
evidence revalidated; official primary sources used; product/SDK/upload
candidates compared; controlled live MinIO spike executed; one architecture +
one SDK family + exact package set selected; upload strategy / bucket topology /
key format / metadata authority / checksum / multipart implication / validation
split / size-type ownership / SVG policy / private-original guarantee / public
delivery / unpublish semantics / presign security / config contract / acyclic
package ownership / consistency / cleanup / MinIO parity / prod portability /
test strategy all locked; `NO_APP2_MIGRATION`; IMP-O002 resolved by unique
IMP-D028; ADR path/ID canonical; B01/W01/frontend handoffs exact; PO questions
isolated; job runtime **not** decided; no code/config/Compose/package/schema/
Figma/generated change; quality + artifact + DB checks pass; Commit A docs-only;
this report evidence-only; cites exact Commit A; ≤300 lines; exactly two commits;
tree clean; not pushed; APP2 engineering not started; next checkpoint not
executed.

## R. Scope confirmation

The decision and this report changed no implementation source, config, package,
Compose service, environment file, schema, migration, generated file, Figma
artifact, or dependency. Commit A added the ADR and reconciled decision-register/
phase-plan/roadmap/traceability status. This Commit B adds only this report.

## S. Evidence closure

**`APP2-DEC-STORAGE` = `DELIVERED_FOR_REVIEW`**, verdict
`PASS_WITH_PRODUCT_PARAMETERS`. `APP2-DEC-JOBS` = `BLOCKED_BY_APP2_DEC_STORAGE_
REVIEW`; `APP2-D01` = `BLOCKED_BY_REQUIRED_DECISIONS`; APP2 product engineering
`NOT_STARTED`. Working tree clean after Commit A; not pushed.

## T. Correction history

This report is preserved as original evidence. `APP2-DEC-STORAGE` was
subsequently **corrected by `APP2-DEC-STORAGE-C1`** (2026-07-26), which fixed
three implementation-readiness defects in ADR-APP2-001 without reopening the
accepted direction: **(C1-01)** the original §G/ADR §4.2 *reserve-then-upload*
flow (create the `assets` row `UPLOADED` **before** the object) was invalid —
`assets.size_bytes` is `NOT NULL > 0`, so the row is now created **only after**
the object is stored/measured (storage-first / two idempotent transactions;
`UPLOADED` is post-upload, IDX-086 recovery-only); **(C1-02)** the HTTP transport
is locked to the **T1 single streaming multipart request** (`busboy 1.6.0` →
`@aws-sdk/lib-storage 3.1095.0` `Upload`), with route-scoped nginx
`client_max_body_size` + `proxy_request_buffering off`, JSON-body guard excluded
from the stream, and server-authoritative SHA-256; **(C1-03)**
`OBJECT_STORAGE_PUBLIC_BASE_URL` removed from APP2 scope. Corrected status:
**`APP2-DEC-STORAGE` = `COMPLETE — CORRECTED, DELIVERED_FOR_REVIEW`**;
`APP2-DEC-JOBS` = `BLOCKED_BY_APP2_DEC_STORAGE_REVIEW`. See
[`APP2-DEC-STORAGE-C1-CORRECTION-REPORT.md`](./APP2-DEC-STORAGE-C1-CORRECTION-REPORT.md)
(Correction Commit C `0c8afd51b513e9a8f9c7945dfae77616f8a57d16`).
