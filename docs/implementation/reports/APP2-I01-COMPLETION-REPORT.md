# APP2-I01 — Object-Storage Foundation — Completion Report

**Checkpoint:** APP2-I01 — Implement the S3-compatible object-storage foundation
**Verdict:** `PASS` · **Status:** `COMPLETE — DELIVERED_FOR_REVIEW` · 2026-07-26

## A. Preflight and authority chain

`APP2_I01_PREFLIGHT = PARTIAL`.

| Item | Value |
| --- | --- |
| Branch / initial HEAD | `production` / `34ec9544ba6c3f8088bc453927a063346931f7d3` |
| Storage chain A–F | `52d582e5…`, `ecef0cdc…`, `0c8afd51…`, `3fce01b6…`, `86d3b91f…`, `3b167dc31cc9dca1d3ecb2404f8243a994931b50` |
| Jobs chain | `8211214`, `27c324e`, `a9ef895`, `146c2bd` |
| D01-C1 A / B | `c40e5c4058ec05ea0976104f9341ded48a9662df` / `34ec9544ba6c3f8088bc453927a063346931f7d3` |

All chains verified present and in order.

**Disclosure — the tree was NOT clean on entry.** It already held uncommitted,
untracked APP2-I01 work (a `packages/object-storage/` scaffold — 11 source files,
2 unit specs — plus a modified `pnpm-lock.yaml` with the AWS SDK entries), so
`pnpm quality` **failed** at `format:check` on five files. That work was not
authored in this session; it matches ADR-APP2-001 section by section and is
consistent with in-flight work from an earlier one. Deleting untracked files is
irreversible, so the non-destructive reading was taken: audit it against §6–§10
line by line, then complete it. Nothing was accepted because it looked plausible
— every behavioural claim below is backed by a passing test. The "I01 not already
implemented" premise of §17 did not hold; this report describes the end state.

## B. Package audit and architecture

`packages/object-storage` / `@embroidery/object-storage`, private, strict TS via
`@embroidery/typescript-config/library.json`.

**Side-effect-free on import** (no client construction, no `process.env` read,
nothing started at module load), **framework-neutral** (no Nest, `apps/**`,
`@embroidery/database` or `@embroidery/persistence` import; only `node:*` and the
two AWS packages) and **runtime-loadable** (CommonJS `dist/`, IMP-D018). Owns
port, adapter, config, key helpers, bucket bootstrap, error mapping and test
support; owns no asset lifecycle, idempotency, HTTP parsing, worker handler,
image processing, repository or UI.

## C. Port, config, key and error contracts

**Port — exactly six operations**, buckets addressed only by `ORIGINALS` /
`DERIVATIVES` alias so no call site can name a bucket: `putObjectStream`,
`getObjectStream`, `headObject`, `deleteObject`, `listObjectsByPrefix`,
`ensurePrivateBuckets`. No presign. No unrestricted list-all — every listing
needs a validated prefix ending in `/`, so `…/asset-1` cannot straddle into
`…/asset-10`.

**Keys** — `{environment}/{originals|derivatives}/{assetId}/{name}.{ext}`. UUIDv7
enforced by pattern (version nibble *and* variant bits); traversal, backslash,
empty segment and control characters rejected; extension derived only from
validated MIME (`image/png→png`, `image/jpeg→jpg`, `image/webp→webp`). SVG and all
other types rejected. No filename, email or customer identifier can reach a key.

**Config** — the eight `OBJECT_STORAGE_*` variables, fail-fast: provider must be
`s3`; region required; endpoint required in development (else the SDK silently
addresses real AWS); strict boolean accepting only `true`/`false`; bucket names
validated and required distinct; credentials all-or-nothing, absence falling back
to the AWS default chain. `OBJECT_STORAGE_PUBLIC_BASE_URL`, `…PRESIGN_TTL_SECONDS`
and `…MAX_UPLOAD_BYTES` are **not** supported, as required.

**Secrets** — the secret key appears in no message, returned field or log
projection; `describeObjectStorageConfig` omits it and reports the access key id
only as present/absent.
**Errors** — closed taxonomy (`OBJECT_NOT_FOUND`, `ACCESS_DENIED`, `CONFLICT`,
`REQUEST_ABORTED`, `PROVIDER_TIMEOUT`, `PROVIDER_UNAVAILABLE`,
`INVALID_PROVIDER_RESPONSE`). Raw SDK exceptions never escape; unrecognised
failures become `INVALID_PROVIDER_RESPONSE` rather than being guessed into a
retryable class. The package never logs.

## D. S3 adapter and memory bounds

One `S3Client` from typed config (region, optional endpoint, optional explicit
credentials, `forcePathStyle`). No ACL, public-read, vendor admin API or
provider-specific business branch. `putObjectStream` uses `lib-storage` `Upload`
with `partSize` 5 MiB, `queueSize` 2, `leavePartsOnError: false`; overrides are
validated against provider bounds and rejected as configuration errors, never as
retryable provider failures.

**Memory statement (honest):** provider-managed multipart buffering is
*approximately* bounded by `partSize × queueSize`, excluding runtime overhead
(socket buffers, TLS records, V8/libuv allocation). No constant-memory claim is
made and none is derived from heap measurements.
**Defect found and fixed by the contract suite.** Case 16 failed against a real
MinIO: after a mid-stream abort a **dangling multipart upload remained**. Root
cause, confirmed by reading `lib-storage`: `Upload.done()` is
`Promise.race([__doMultipartUpload(), __abortTimeout(signal)])` and
`Upload.abort()` only trips the abort watcher, so `done()` rejects while
`AbortMultipartUpload` is still in flight on a detached promise — the caller is
told the upload failed while parts are still open. Awaiting `abort()` does not
help; it is effectively synchronous. Fix: abort by destroying the source stream,
routing `lib-storage` through its ordinary error path where it **awaits**
`AbortMultipartUpload` before rejecting. Cases 15 and 16 pass on repeated runs.

## E. MinIO Compose service and bootstrap

`minio/minio:RELEASE.2025-04-08T15-41-24Z`, digest
`sha256:8834ae47a2de3509b83e0e70da9369c24bbbc22de42f2a2eddc530eee88acd1b`. On the
existing `embroidery` network, named volume `embroidery_minio_data`, credentials
from local `OBJECT_STORAGE_*` values. Healthcheck uses the official readiness
endpoint (`/minio/health/live`) — **verified live**, `healthy` on first poll.
**No host port is published**: the API and worker reach `minio:9000` over the
compose network and the contract suite starts its own container.
`pnpm docker:dev:up` remains the only startup command; `server /data` is the
image's own required subcommand, not a project step. Bucket bootstrap lives in
the package on the same `@aws-sdk/client-s3` — no `mc`, no second SDK — and calls
only `HeadBucket`/`CreateBucket`, never
`PutBucketPolicy`/`PutBucketAcl`/`PutPublicAccessBlock`, so it has no mechanism
to make a bucket public. API/worker startup is **not** wired.

**Anonymous access proven denied** on the running service: `GET /` →
`403 AccessDenied`; `GET /embroidery-dev-originals/` → `403`.

## F. Nginx seam

`infrastructure/nginx/templates/includes/upload-proxy.conf.template` — one active
directive, `proxy_request_buffering off;`.

**Inactive**: `nginx.conf` includes only `/etc/nginx/conf.d/*.conf`, a single
level, so a file rendered into `conf.d/includes/` loads only when a `location`
explicitly includes it — and nothing does. No route, upstream, server block or
global directive. `client_max_body_size`, `proxy_read_timeout` and
`proxy_send_timeout` are documented ownership hooks left **deliberately unset**:
the maximum-image-bytes parameter is still open and a value here would silently
become the product limit. No byte limit invented.
`tools/nginx-upload-seam.test.mjs` — 7 deterministic Docker-free tests inside
`pnpm test`; they fail if the seam is referenced, made global, given a block or a
limit, or if any routed location disables request buffering.

## G. Unit tests

**150 tests, 5 suites, all passing, Docker-free**, inside `pnpm quality`.
`object-storage.config` — happy path, every error path, credential pairing, strict
boolean, bucket validation/distinctness, secret redaction. `object-key` —
original/derivative/prefix keys, UUIDv7, traversal, unsafe segments, MIME mapping,
SVG rejection. `object-storage.errors` — classification matrix, name-over-status
precedence, unknown → `INVALID_PROVIDER_RESPONSE`, redaction, `cause`.
`multipart-options` — defaults, bounds, boundary values, fractional/NaN/Infinity
rejection. `object-metadata` — entry/key/value bounds, non-ASCII and control
rejection, lowercase round trip.

## H. Contract tests and cleanup

**20 / 20 required cases pass** against a disposable pinned MinIO, confirmed on
three consecutive runs. Excluded from `pnpm test` / `pnpm quality`; invoked by
`pnpm test:object-storage:contract`.

1 readiness · 2 config parse · 3 two private buckets · 4 repeated bootstrap no-op
· 5 unknown-length upload · 6 original head/get · 7 derivative put/get ·
8 content-type round trip · 9 bounded metadata round trip · 10 independent
SHA-256 re-hash · 11 ETag opaque · 12 prefix pagination and isolation · 13 delete
existing · 14 delete missing idempotently · 15 abort leaves no object · 16 no
dangling multipart · 17 unauthenticated GET denied (403) · 18 unauthenticated
listing denied (403) · 19 wrong credentials → `ACCESS_DENIED`, no secret in the
message · 20 full cleanup.
Harness: random loopback port, run-scoped container and bucket names (a stale
bucket cannot make a later assertion pass), readiness by polling a real signal
with a bounded deadline, teardown via `docker rm --force --volumes`.
Testcontainers was not added — `docker run` is what the repository already does
and no evidence justified a new dependency. **Zero residue, measured:**
`embroidery-i01-minio-*` containers after run = 0; dangling volumes before 63 /
after 63, **delta 0**. The normal dev stack was untouched — different project,
name, port and volume.

## I. Dependencies, build and boundaries

`@aws-sdk/client-s3` and `@aws-sdk/lib-storage` — both requested `3.1095.0`, both
resolved `3.1095.0`. Exactly two direct runtime dependencies. **Not** installed:
`@aws-sdk/s3-request-presigner`, `busboy`, `@types/busboy`, aws-sdk v2, MinIO JS
client — `busboy` remains APP2-B01's. Build, lint, typecheck, unit test, file-size
and boundary checks pass; every file is within limits (largest source 262/400,
largest test 478/600).

## J. Commit A evidence

| Field | Value |
| --- | --- |
| Hash | `48e676def522a9bfc4ab34418e52074df004db3a` |
| Subject | `feat(storage): add S3-compatible object-storage foundation` |
| Files | 30 changed, +3213 |

Scope: `packages/object-storage/**` (26), `.env.example`, the dev Compose file,
the Nginx seam template, `package.json`, `pnpm-lock.yaml` and
`tools/nginx-upload-seam.test.mjs`. No completion report in Commit A.

## K. Validation matrix

| Command | Exit |
| --- | --- |
| `pnpm format:check` / `lint` / `typecheck` / `test` | 0 / 0 / 0 / 0 |
| `pnpm --filter @embroidery/object-storage build` | 0 |
| `pnpm test:object-storage:contract` (×3) | 0 |
| `pnpm docker:dev:config` | 0 |
| `pnpm check:file-size` / `check:styles` | 0 / 0 |
| `pnpm check:figma-design-index` + `node --test` | 0 / 0 |
| `check:frontend-boundaries` / `check:e2e` / `check:spike-boundaries` | 0 / 0 / 0 |
| `pnpm check:openapi` / `check:api-client` / `db:check:manifest` | 0 / 0 / 0 |
| `pnpm quality` / `git diff --check` | 0 / 0 |

Exit codes were captured directly, never through a pipe (a piped `$?` reports the
last command in the pipeline, not the gate).
**Frozen baselines re-verified unchanged:** OpenAPI
`ae015dd65dc2f64c902145f19d5fa5fae6cd6423a54934c1126cd289e3d30946` · API client
`89c1aace328eef1ee05a74950faa48bf907babece025a6abb9ca1baa1574502f` · DB 31
migrations / 78 tables / 833 columns, fingerprint `4ca56a59…` · Figma registry
untouched (69 IDs, 9 tables).

## L. Acceptance matrix

All 27 criteria in §23 are met — evidence for each is in §B–§K above: package and
isolation (2–4), port and aliases (5), streaming with auto-abort (6), opaque ETag
and no presign (7, 11), closed taxonomy (8), strict config and redaction (9–10),
exact keys and SVG rejection (11), honest multipart bounds (12), pinned MinIO on
the existing startup path (13), private idempotent bootstrap (14), inactive seam
(15), all tests (16–18), zero residue (19), workspace and Compose checks (20–21),
frozen baselines (22), no app/schema/migration change (23), blockers preserved
(24), commit split and count (25–26), nothing downstream started (27).
Criterion 1 is met **as corrected in §A**: chains and scope were verified, but the
tree was not clean on entry and I01 was partially implemented. That is disclosed,
not reported as a pass.

## M. Preserved blockers and handoff

Untouched, still APP2-B01 entry blockers: `STORAGE-BLK-01` content-complete upload
fingerprint · `STORAGE-BLK-02` typed idempotency result JSON · `STORAGE-BLK-03`
allocation reclaim / object cleanup ordering. Open Product Owner parameters, none
invented: maximum image bytes · original retention · non-image source inclusion ·
uploaded SVG requirement. Current assumptions stand — raster PNG/JPEG/WebP only,
SVG rejected, non-image sources excluded, no shortening of original retention.
**Handoff to APP2-B01:** include the Nginx seam on the upload route and set the
three ownership hooks together once the size limit is decided; with buffering off
the API owns incremental size enforcement and its own read timeout — the gateway
is not the size authority. Add `busboy` there, not here.

**Status:** `I01 = COMPLETE — DELIVERED_FOR_REVIEW` · `I02 = READY, NOT STARTED` ·
`B01 = BLOCKED_BY_STORAGE-BLK-01..03_AND_UPLOAD_SIZE_PARAMETER` ·
`W01 = BLOCKED_BY_I02_AND_B01` · `A01..A04 = DESIGN_APPROVED_BUT_BLOCKED_BY_BACKEND`
· `S01 = DESIGN_AUTHORITY_UI02 — BLOCKED_BY_PUBLIC_BACKEND` ·
`S02 = BLOCKED_BY_UI03_RECONCILIATION_AND_PUBLIC_BACKEND` · APP2 product
engineering = `STARTED_WITH_FOUNDATION_ONLY`. No upload, processing, publication
or public product functionality exists yet.

## N. Scope confirmation

Not modified: `apps/**`, `packages/database/**`, `packages/persistence/**`,
migrations or schema, OpenAPI, the generated API client, Figma or the design
index, Storefront/Admin source. No Nest module, controller, multipart parser,
worker handler or public-media endpoint was created. `NO_APP2_MIGRATION` holds. No
secrets committed: `.env.example` carries local-only placeholders and contract
credentials are literals scoped to a disposable container.

## O. Evidence closure

Initial HEAD `34ec9544ba6c3f8088bc453927a063346931f7d3` → Commit A
`48e676def522a9bfc4ab34418e52074df004db3a` → Commit B (this report). Exactly two
commits, clean tree, **not pushed**. `I02`, `B01`, `W01` and all frontend work
remain not started.
