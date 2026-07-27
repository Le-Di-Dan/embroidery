# APP2-W01 — Catalog Asset Inspection Worker — Completion Report

**Checkpoint:** `APP2-W01`
**Verdict:** `PASS`
**Status:** `COMPLETE — DELIVERED_FOR_REVIEW`
**Date:** 2026-07-27

---

## A. Preflight

```text
APP2_W01_PREFLIGHT = PASS
```

| Check | Result |
| --- | --- |
| `git branch --show-current` | `production` |
| `git rev-parse HEAD` | `ae5e65a730914d71b89e1279e6f75f9821e1d94e` — the exact `APP2-I03` evidence Commit B |
| `git status --short` | empty (clean tree) |
| prior `APP2-W01` implementation commit | none |
| `pnpm quality` | `EXIT=0` |
| `pnpm check:openapi` | `e19c2f76…` up to date |
| `pnpm check:api-client` | `55de1cc1…` up to date |
| `pnpm check:figma-design-index` | 69 registry IDs |
| `pnpm db:check:manifest` | 78 tables / 833 columns / 190 CHECK / `82864268…` |
| `git diff --check` | clean |

### Accepted chain verified from Git

```text
APP2-DEC-STORAGE   52d582e + ecef0cd, C1 0c8afd5 + 3fce01b, C2 86d3b91 + 3b167dc
APP2-DEC-JOBS      8211214 + 27c324e, C1 a9ef895 + 146c2bd
APP2-I01           (in the DEC-STORAGE chain, accepted)
APP2-I02           1d748ef + bfc2a60, C1 53417db + fd93ab3, FD1 43546a6 + 8775734
APP2-B01-G01       62034ac + 4e54633
APP2-B01           a1cb712 + ac81a2a
APP2-DB01          fc7f0a1 + cdd7b86      ← implementation A + evidence B
APP2-I03           6252e4d + ae5e65a      ← implementation A + evidence B (= entry HEAD)
```

The two evidence commits the prompt asked me to read from Git rather than assume are
`cdd7b86` (`docs(app2): record catalog derivative schema evidence`) and `ae5e65a`
(`docs(app2): record private-bucket bootstrap evidence`).

---

## B. Source audit — exact values

Read before editing: `apps/worker/**`, `packages/object-storage/**`,
`packages/persistence/**`, `packages/database/src/schema/asset/**`, migration `0032`,
the `apps/api` B01 Asset module and its integration tests, `ADR-APP2-001`,
`ADR-APP2-002`, the APP2 phase plan, the I02/B01/DB01/I03 reports, DB3 (LC-06) and DB4.

| Item | Actual source value |
| --- | --- |
| `ASSET_DERIVATIVE_KINDS` | `PREVIEW_WATERMARKED`, `MOCKUP`, `NORMALIZED`, `THUMBNAIL`, `CATALOG_PREVIEW` |
| `ASSET_DERIVATIVE_STATES` | `PENDING`, `PROCESSING`, `READY`, `FAILED` |
| watermark CHECK | `ck_asset_derivatives__watermark_by_kind` (CST-126) — `PREVIEW_WATERMARKED ⇒ true`, `CATALOG_PREVIEW ⇒ false` |
| partial derivative uniqueness | `uq_asset_derivatives__asset_kind__not_failed` on `(asset_id, kind) where status <> 'FAILED'` |
| READY storage-key CHECK | `ck_asset_derivatives__ready_has_storage_key` |
| inspection append-only trigger | `trg_asset_inspections__reject_mutation` (migration `0030`, `BEFORE UPDATE OR DELETE`, mode `always`) |
| inspection detail physical type | `asset_inspections.detail` — nullable `text` |
| `ObjectStoragePort` | exactly six methods; no presign, no unrestricted list-all |
| object-key helpers | `buildOriginalObjectKey`, `buildDerivativeObjectKey`, `buildAssetPrefix` — `{env}/{scope}/{assetId}/…` |
| `TransactionManager` | `runInTransaction(work, options)`; repositories never open a boundary (DEC-DB7-006) |
| `JobHandler` | `eventType` / `jobKind` / `payloadSchemaVersion` / `validatePayload` / `deriveEffectKey` / `execute` |
| `JobHandlerRegistry` | one handler per event type; duplicate registration throws |
| `BACKGROUND_JOB_KINDS` | includes `ASSET_PROCESSING` (previously unused) |
| worker policy accessor | `WorkerPolicyService.current()` — the validated `worker.runtime` snapshot |
| worker startup gate | `WORKER_STARTUP_GATE`, injected by the runtime, bound by the composition root |
| readiness / shutdown | `FATAL_HANDLER_UNRESPONSIVE` → `SHUTTING_DOWN` → `STARTUP_GATE_CLOSED` → `NOT_STARTED` → policy → database |

### Tuple mapping (as prescribed)

```text
THUMBNAIL        → THUMBNAIL         is_watermarked = false
catalog preview  → CATALOG_PREVIEW   is_watermarked = false
```

`PREVIEW_WATERMARKED`, `NORMALIZED`, `MOCKUP` and `OUTBOX_DISPATCH` are not used by this
job family. A spec asserts all three kind exclusions and both watermark values against the
canonical `ASSET_DERIVATIVE_KINDS`.

Actual source still represents the accepted DB01/I03 authority, so the checkpoint was not
blocked and no migration was created.

---

## C. Image library

| Fact | Value |
| --- | --- |
| Package | `sharp` |
| Resolved version | **0.35.3** exact (no caret in `apps/worker/package.json`) |
| libvips | 8.18.3 |
| License | Apache-2.0 |
| Node engine | `>=20.9.0` (runtime images are Node 22.14.0) |
| Lockfile delta | `pnpm-lock.yaml` +315 lines — `sharp` plus its per-platform optional `@img/*` packages |
| Type declarations | Sharp's own; **no** `@types/sharp` |
| Other image libraries | none — no ImageMagick/GraphicsMagick wrapper, no Jimp, no Canvas |
| Added to API / Admin / Storefront / object-storage | **no** — `apps/worker` only |

### Platform proof

- **Windows x64 (development host):** install, `typecheck`, unit + integration tests and
  `nest build` all pass. The optional native package `@img/sharp-win32-x64@0.35.3` is
  present under `node_modules/.pnpm`, and `sharp.versions.sharp` reports `0.35.3` from the
  installed binary.
- **Linux (shipped image):** the `runner` image builds from `worker.Dockerfile` unchanged
  and boots; the smoke below decodes and re-encodes a real 1400×900 PNG inside it, which
  is only possible if the musl native binary loaded. The lockfile carries every
  `@img/sharp-libvips-linuxmusl-*` entry, so `pnpm install --frozen-lockfile` inside the
  Alpine stages resolves them without a network fetch.
- **No runtime native download:** the binaries are ordinary optional dependencies resolved
  at install time; nothing is fetched when the process starts.
- **Same-platform repeatability:** repeated runs of the accepted suite produce identical
  recorded dimensions and byte sizes.

Cross-platform byte-identical WebP is **not** claimed. Every assertion about output bytes
is made against the object produced on the same platform in the same run.

---

## D. Processing policy V1

`ASSET_PROCESSING_POLICY_V1` — one frozen, worker-owned object
(`domain/asset-processing-policy.ts`). Not client-selectable, not an environment-variable
family, not an operator policy row: `worker.runtime` remains the only versioned operator
policy, and these values travel with the code that enforces them.

```text
policyVersion        = 1
source MIME          = image/png | image/jpeg | image/webp
decoded format       = png | jpeg | webp
animated/multi-page  = rejected
max oriented width   = 12,000
max oriented height  = 12,000
max oriented pixels  = 40,000,000
max channels         = 4
Sharp failOn         = warning
Sharp unlimited      = false
Sharp sequentialRead = true
Sharp animated       = false
```

SVG, GIF, AVIF, TIFF, PDF and raw pixels are all outside the accepted set and are rejected
(`SOURCE_FORMAT_UNSUPPORTED`). `Object.isFrozen` is asserted on the policy and on its
`sharp` sub-object.

### Derivative policy V1

| | THUMBNAIL | CATALOG_PREVIEW |
| --- | --- | --- |
| format | WebP | WebP |
| bounding box | 480 × 480 | 1920 × 1920 |
| fit | `inside` | `inside` |
| `withoutEnlargement` | `true` | `true` |
| quality | 82 | 82 |
| alphaQuality | 100 | 100 |
| effort | 4 | 4 |
| smartSubsample | `true` | `true` |
| `isWatermarked` | `false` | `false` |

Both pipelines auto-orient from EXIF, convert to sRGB, preserve alpha, and strip
EXIF/XMP/IPTC/ICC/comments. No `withMetadata`, `keepMetadata`, `keepExif` or
`keepIccProfile` call exists anywhere in the checkpoint — Sharp strips by default, and the
way to guarantee the blocks are gone is never to ask for them back. Keys are deterministic
and derived from the asset's UUIDv7 and the validated content type; no filename ever
reaches one.

**One deliberate deviation, flagged.** The metadata probe runs with
`limitInputPixels: false` while both generation pipelines keep the policy ceiling. With the
limit in place libvips rejects an oversized image *inside* `metadata()`, and the only thing
this code could then record is `DECODE_FAILED` — an 48-megapixel upload would be filed as
"could not decode". The probe decodes no pixels, so nothing allocates on the declared size;
the explicit check then names the real reason. The live suite asserts
`PIXEL_LIMIT_EXCEEDED`, not `DECODE_FAILED`, for an 8000 × 6000 source.

---

## E. Handler and effect

```text
eventType            = asset.inspection.requested
jobKind              = ASSET_PROCESSING
payloadSchemaVersion = 1
effect key           = asset-inspection:v1:{assetId}
```

`ASSET_PROCESSING`, not `OUTBOX_DISPATCH`: the work is processing an asset, and filing its
attempt evidence under the transport kind would make every operational query about image
processing indistinguishable from every other queued event. The kind is accepted by
`assertKnownJobKind`, which every attempt write passes through (asserted by the DB01 spec
and again here).

Payload validation is exact — exactly `schemaVersion` + `assetId`, unknown field rejected,
missing field rejected, `assetId` must be a lowercase UUIDv7. A mismatched version is
`JOB_SCHEMA_UNSUPPORTED`; everything else malformed is `JOB_PAYLOAD_INVALID`. Both are
terminal.

The effect key is a pure function of the asset — deliberately not of the outbox event id or
the attempt number, because two events asking to inspect the same asset describe one
effect. It is 61 characters, well inside `MAX_EFFECT_KEY_LENGTH`, and carries no payload,
key, filename or checksum.

The production registry contains exactly this one Asset handler. Registration happens in
`AssetInspectionModule.onModuleInit`, which Nest runs for every module before the first
`onApplicationBootstrap` — and `onApplicationBootstrap` is where the poll loop starts — so
the handler is in the registry before a single claim query is issued.

---

## F. Streaming, integrity and decode

**A normal attempt reads the original exactly four times**, each with one job:

1. integrity — every byte counted and SHA-256'd against `assets.size_bytes` /
   `assets.checksum`;
2. bounded header metadata;
3. THUMBNAIL generation;
4. CATALOG_PREVIEW generation.

Nothing is buffered. There is no `sharp(fullOriginalBuffer)`, no `toBuffer()` on a
derivative, no temporary file, no base64 and no `bytea`. The only JavaScript state that
scales with the image is a 32-byte digest context and an integer, held by
`DigestCounterStream`; a spec pushes 10 MiB through it and asserts the count without the
bytes ever accumulating. Uploads go straight into `ObjectStoragePort.putObjectStream`
(managed multipart), and every stage is joined with `node:stream/promises` `pipeline` —
never `pipe`, which silently drops a source error.

The integrity counter carries the recorded size as a **hard limit**, so an object that grew
is abandoned mid-stream rather than read to the end to reach the same conclusion.

`AbortSignal` is propagated into every `getObjectStream`, `putObjectStream`,
`deleteObject`, `listObjectsByPrefix` and into `pipeline` itself. Success, decode failure,
storage failure, timeout, abort and shutdown all destroy the source, the encoder and the
sink.

No object-storage call happens inside a database transaction, and the handler never calls
`ensurePrivateBuckets` — APP2-I03 owns startup bootstrap.

### Verification before any derivative becomes READY

Recomputed complete byte size; recomputed complete SHA-256; both matched against the row.
Decoded format matched against `assets.mime_type`. Asset kind `CATALOG_MEDIA` and
classification `PRODUCTION_SENSITIVE` required on **every** read, not just the first.
`INSPECTING` or a verified terminal replay required. ETag, object extension, client
filename and provider metadata are trusted for nothing.

Metadata gates: format in the closed set; positive source and oriented dimensions;
oriented width and height ≤ 12,000; oriented pixels ≤ 40,000,000; channels ≤ 4; pages = 1;
and a full decode, which the two generation passes perform.

Oriented dimensions come from libvips' own `metadata.autoOrient`, which is the size the
resize is actually applied to; a manual EXIF swap remains as a fallback so the two can
never silently disagree about which limits were checked.

### Closed rejection codes

`DECODE_FAILED`, `SOURCE_MEDIA_TYPE_MISMATCH`, `ORIGINAL_INTEGRITY_MISMATCH`,
`DIMENSION_LIMIT_EXCEEDED`, `PIXEL_LIMIT_EXCEEDED`, `CHANNEL_LIMIT_EXCEEDED`,
`ANIMATED_IMAGE_UNSUPPORTED`, `SOURCE_FORMAT_UNSUPPORTED`, `PROCESSING_RETRY_EXHAUSTED`.

`AssetRejectedError` carries the code and nothing else — no `detail`, no `cause`, no
provider payload. Raw Sharp/libvips errors are dropped at the boundary: not persisted, not
logged, not attached as a cause.

---

## G. Preparation, cleanup and generation

**Preparation transaction** (`prepareOrRecover`): lock the asset `FOR UPDATE`; require
`CATALOG_MEDIA` + `PRODUCTION_SENSITIVE`; branch on status. `INSPECTING` prepares or
recovers; `ACCEPTED` / `REJECTED` verify a complete terminal effect and replay;
anything else is a contradiction. For `INSPECTING`, both rows are inserted (or recovered)
as **`PENDING`** and then moved through a guarded `PENDING → PROCESSING` update — never
inserted directly as `PROCESSING`, because LC-06 says a derivative starts `PENDING` and
collapsing the two steps would also collapse the guard that makes a concurrent second
attempt lose. A recovered `PROCESSING` row is retry state and is never moved backwards. No
inspection is appended. The transaction commits before any storage work.

**Cleanup** runs when any row pre-existed. It re-reads a snapshot, refuses to run if a
terminal inspection exists or if any derivative is `READY`, deletes only
`{env}/derivatives/{assetId}/`, re-lists to prove the prefix is empty, and only then allows
replacement writes. A provider key outside the requested prefix is a contradiction, not a
delete. The original is never in that prefix and is never touched. An ordinary cleanup
failure leaves the asset `INSPECTING`, both rows `PROCESSING`, no inspection, and throws a
retryable dependency failure with no replacement write started.

**Generation** is sequential, one fresh read per output — two concurrent libvips pipelines
over one original double peak native memory for a saving measured in milliseconds. Each
output's dimensions and byte size come from the encoder's own `info` event and from a
counter on the bytes that actually reached the store, then are checked for positive size,
bounding-box compliance, no enlargement beyond the oriented source, and checksum format.
Both uploads complete before any terminal database work. No ETag checksum, no public ACL,
no presign, no public URL.

---

## H. Inspection detail V1

Written into the existing nullable `text` column — no column added, no migration.
The document is an allow-list built key by key from typed inputs and re-validated on the
way out, so it cannot contain a filename, an object key, a bucket, an EXIF/ICC blob, an
exception message, a stack or request data: **there is no code path that puts one in**.
Serialisation is bounded at 8 KiB of UTF-8 and refuses (rather than truncates) an
oversized document — half a JSON document in an append-only evidence column is worse than
none.

The processor version is a domain constant (`0.35.3`) so the domain layer never imports the
native module; a spec asserts it still equals `sharp.versions.sharp`, so an upgrade that
changes encoder behaviour cannot land without updating the value recorded next to the bytes
it produced.

The decoder is deliberately paranoid: foreign schema/policy version, malformed checksum,
non-positive or fractional measurement, `pages ≠ 1`, unknown rejection code, watermarked
catalog derivative, duplicated kind and missing derivative are each rejected, and an
over-bound string is rejected without being parsed.

---

## I. Terminal transactions, retry and replay

**Accepted** (one transaction): lock asset and both rows; recheck `INSPECTING`, unchanged
kind/classification and unchanged source MIME/size/checksum/key; require both rows exactly
`PROCESSING`; promote both to `READY` with their deterministic key and checksum, restating
`is_watermarked = false`; append exactly one `ACCEPTED` inspection with the V1 detail;
guard `INSPECTING → ACCEPTED`. Any guard matching zero rows fails the whole transaction. No
second outbox event and no product/publication record is written; returning normally lets
the I02 runtime record success and dispatch the source event.

**Rejected** (one transaction): lock; require `INSPECTING`; refuse if any row is `READY`;
set every non-`FAILED` row `FAILED`; append exactly one `REJECTED` inspection; guard
`INSPECTING → REJECTED`. Invalid or unsafe content is a handled business outcome, not a
dead-letter reason, and the original is retained.

**Retry:** before the final attempt a retryable failure leaves the asset `INSPECTING`, both
rows `PROCESSING` and no inspection, and throws an existing worker error class — I02 owns
backoff and attempt evidence. On the final attempt (compared against the validated
`worker.runtime` snapshot's `maxAttempts`, never a second copy) the handler attempts
controlled cleanup, records `PROCESSING_RETRY_EXHAUSTED` with an accurate `cleanupPending`,
finalizes atomically and returns normally. An attempt whose deadline has already fired is
excluded from that path so finalization cannot race the lease.

**Replay:** an accepted replay requires `ACCEPTED`, exactly one valid accepted inspection,
both derivatives `READY` at their deterministic keys with checksums matching the record,
and both private objects present. A rejected replay requires `REJECTED`, exactly one valid
rejected inspection and both rows `FAILED`. A valid terminal replay performs **zero** object
writes and **zero** database writes.

**Contradictions** fail closed with `JOB_INVARIANT_VIOLATION` — no cleanup, no overwrite,
no repair: terminal asset with a missing/duplicate/malformed inspection, `ACCEPTED` with a
missing or non-`READY` derivative, `REJECTED` with a `READY` derivative, changed source
facts, a foreign asset kind/classification, an unsupported detail schema and a watermark
contradiction.

---

## J. Ownership, boundaries and security

```text
apps/worker/src/jobs/asset-inspection/
  domain/                 policy, payload, detail (+ codec), rejection codes, contradiction, repository contract
  application/            source verification, generation, cleanup, use case, failure classification
  infrastructure/         image/ (the only Sharp import), persistence/, streams/
  asset-inspection.handler.ts
  asset-inspection.module.ts
```

No import from `apps/api`, no controller, no generic CRUD, no unrelated table, no raw
`process.env` in business logic. The worker-local repository exposes exactly the five
cohesive methods §19 names. Statements go through the sanctioned raw-SQL boundary
(`executeRaw` + the `sql` tag, ADR-DB1-002) with every value bound, because the worker
application deliberately does not depend on the ORM or the driver — the same rule the I02
test harness already follows. The B01 API repository was not moved.

I02 and I03 are preserved: PostgreSQL outbox queueing, registered-event filtering,
database-time lease, bounded retry, attempt evidence, stale-lease protection, FU-A07, the
real-SIGTERM behaviour, the uncooperative-handler fatal path and the private-bucket startup
gate. No broker, heartbeat, lease extension, queue status, attempt outcome, second queue
row, fabricated request id or implicit production default was added.

Logging uses the existing allow-list. The one line this checkpoint adds carries
`event`, the closed-vocabulary `rejectionCode`, `cleanupPending`, `correlationId` and
`attemptNo` — no payload, filename, bucket/object key, image bytes, metadata dump,
checksum, credential, cookie, header, stack or native error. The smoke asserts the absence
of `originals/`, `derivatives/`, `sha256:`, the secret key and `requestId` in the shipped
container's whole log.

Malware scanning remains deferred.

---

## K. Tests

### Unit — Docker-free (`pnpm --filter @embroidery/worker test`)

**24 suites / 283 tests**, up from 15 / 141 at entry.

New coverage: strict event payload and effect key (24); exact policy values, tuple and
watermark mapping, kind exclusions (17); detail schema, 8 KiB bound and sensitive-field
exclusion (25); replay verification and every contradiction (18); handler registration,
`ASSET_PROCESSING`, duplicate-registration refusal and delegation (8); MIME/format mapping,
orientation, dimension, pixel, channel and page checks, animation rejection, decode
failure, integrity mismatch, deterministic-versus-retryable classification and abort
teardown (20); output measurement, metadata stripping, alpha preservation, no-enlargement,
upload failure and abort teardown (15); orchestration — deterministic rejection, final
attempt, replay, contradictions, recovered cleanup (26); stream counter and byte limit (7).

### Live PostgreSQL + MinIO (`pnpm test:asset-processing:integration`)

**4 suites / 52 tests**, all 32 migrations, disposable PostgreSQL, pinned private MinIO,
synthetic PNG/JPEG/static-WebP, zero residue.

All 40 required scenarios are covered:

| # | Scenario | Where |
| --- | --- | --- |
| 1-3 | PNG / JPEG / static WebP accepted | accepted |
| 4 | exactly two derivative rows | accepted |
| 5-6 | THUMBNAIL and CATALOG_PREVIEW READY | accepted |
| 7 | both private objects exist | accepted |
| 8 | both outputs decode as WebP | accepted |
| 9 | output checksums match the stored bytes | accepted |
| 10 | dimensions within both bounding boxes | accepted |
| 11 | small source not enlarged | accepted |
| 12 | EXIF orientation applied to both outputs | accepted |
| 13 | EXIF/ICC/XMP/IPTC stripped | accepted |
| 14 | alpha preserved | accepted |
| 15 | source size and checksum re-verified into the record | accepted |
| 16 | source integrity mismatch rejected (size and checksum) | rejected |
| 17 | decoded format/MIME mismatch rejected | rejected |
| 18 | corrupt/truncated decode rejected | rejected |
| 19 | animated WebP rejected | rejected |
| 20 | pixel limit rejected | rejected |
| 21 | dimension limit rejected | rejected |
| 22 | original retained on rejection | rejected |
| 23 | no READY derivative and no derivative object on rejection | rejected |
| 24 | first storage failure leaves INSPECTING / PROCESSING | recovery |
| 25 | retry succeeds without duplicate rows | recovery |
| 26 | partial THUMBNAIL cleaned before replacement | recovery |
| 27 | crash after the preparation transaction converges | recovery |
| 28 | crash after both objects, before the terminal transaction, converges | recovery |
| 29 | accepted replay writes nothing | accepted |
| 30 | rejected replay writes nothing | rejected |
| 31 | concurrent executions create one terminal effect | recovery |
| 32 | foreign kind and non-inspectable state mutate nothing | recovery |
| 33 | accepted terminal rollback is atomic (+ converges after) | atomicity |
| 34 | rejected terminal rollback is atomic (+ converges after) | atomicity |
| 35 | timeout/abort closes the pipeline and writes nothing (+ converges) | recovery |
| 36 | final-attempt exhaustion rejects | rejected |
| 37 | final cleanup failure records `cleanupPending` with no key in the record | rejected |
| 38 | terminal contradictions fail closed (three shapes) | atomicity |
| 39 | append-only trigger preserved (UPDATE and DELETE both refused) | rejected |
| 40 | zero disposable residue (container gone after close) | atomicity |

Recovery states are produced through **real failure seams** — a port that refuses uploads,
a terminal transaction that dies after its write, a deadline that fires — not by
hand-writing the rows a crash is imagined to leave.

### Real Linux worker smoke (`pnpm test:asset-processing:worker-smoke`)

**12 tests.** The production `runner` image runs as PID 1 with nothing but a database row
and an object. Proven: the private-bucket gate opens and the worker reports
`ready (ok)`; the Linux Sharp binary loads; exactly **1 handler** is registered; the event
is claimed under `ASSET_PROCESSING` (one attempt, `attempt_no 1`); the asset reaches
`ACCEPTED`; both derivatives are `READY` and unwatermarked; both private objects exist with
non-zero size; exactly one `ACCEPTED` inspection; the outbox row is `DISPATCHED` with
`attempt_count 1` and `last_error` NULL; the single attempt is `SUCCEEDED`; the original is
retained; no key, checksum, filename, secret or fabricated request id appears in the logs
while the FU-A07 correlation id does; and a real `docker kill --signal=TERM` exits **0 in
309 ms** with no container or image left behind.

### I02 / I03 regressions — all green

| Suite | Result |
| --- | --- |
| `test:worker-runtime:integration` | 2 suites / 19 + 2 suites / 10 |
| `test:worker-runtime:smoke` | 6 |
| `test:worker-runtime:signal-smoke` | 5 — real SIGTERM → exit 0 in **320 ms** |
| `test:worker-runtime:uncooperative-timeout` | 3 |
| `test:worker-runtime:fatal-process` | 16 — `workerA.exitCode=1 … marginMs=16968 … attemptsBeforeReclaim=0 … finalStatus=DISPATCHED` |
| `test:storage-bootstrap:api` | 35 |
| `test:storage-bootstrap:worker` | 9 |
| `test:storage-bootstrap:composition` | 11 |

Four of those suites asserted `0 handler(s) registered`. W01 makes that number **1**, so
the four assertions were updated to `1` rather than removed — the count is asserted
precisely because it is the cheapest place a second, unintended registration would show up.
The I02 runtime harness now resets the registry to exactly the handlers a suite asked for
after `init()`, so runtime suites do not depend on a capability module they are not
testing.

---

## L. Real defects found and fixed before Commit A

1. **An upload that failed to open stalled the pipeline.** Nothing consumed the sink, so
   the encoder sat on backpressure until the attempt timed out. The upload rejection now
   destroys the counter, turning a stall into an immediate, classifiable failure; and the
   port call is wrapped so a *synchronous* throw becomes a rejection like every other
   failure instead of escaping before the handler is attached.
2. **A decode failure was reported as a storage failure.** Every failure in the pipeline
   cascades — `pipeline` destroys the remaining stages with the same error, and a dead sink
   aborts the upload — so a corrupt PNG produced both an encoder error and an upload error,
   and the upload won. Classification now records which stage failed **first**; a truncated
   original is `DECODE_FAILED`, and a real outage during a healthy image is still retryable.
3. **Contradictions raised outside the processing block were retried.** Only failures from
   `process()` were classified, so a contradiction from the preparation transaction or from
   the cleanup preconditions escaped unclassified — and the runtime's default for an
   unclassified failure is `JOB_UNKNOWN_FAILURE`, which is *retryable*. An asset in an
   irreconcilable state would have been retried to the cap before anyone was told. The
   whole attempt is now the classification boundary.
4. **A cleanup failure bypassed the final-attempt rule.** Recovered-output cleanup ran
   before the guarded block, so a store that could not be reached during cleanup threw
   forever and the asset sat in `INSPECTING` — because the step that failed happened to be
   the one *before* the work. Cleanup is now inside the same guarded block.
5. **The repository's error mapper flattened every contradiction.** `DrizzleRepository.run`
   funnels its body through `withMappedErrors`, which maps *everything* to a
   `PersistenceError` so no raw driver error can escape. A contradiction therefore reached
   the use case as an ordinary persistence failure and was retried. Contradictions now
   cross the mapper as a value and are re-thrown outside it — still inside the caller's
   transaction, so a contradicting finalization still rolls back, and real driver errors
   keep their mapping. **The unit doubles could never have caught this**: they are not
   wrapped by the mapper at all. The live suite found it.

Two further problems were mine in the test code and are worth recording because they would
each have produced a green test that proved nothing: a "default parameter" trap made the
no-policy case silently assert the opposite of its name, and a synthetic "animated WebP"
fixture built with the `pageHeight` output option was a perfectly ordinary still image, so
the animation rejection would have passed for the wrong reason. Both are fixed, and the
fixture now joins two distinct stills, which is the only construction libvips reports as
multi-page.

---

## M. Artifact boundaries

| Artifact | Before | After |
| --- | --- | --- |
| OpenAPI | `e19c2f76a800b9382d3e013e34759df5b9cd9090de021b5f3b2be7a5cfbf5c8f` | unchanged |
| API-client | `55de1cc158cf5ab112dae8e8c63f45fe5fee9de1d36aedbb222f0fcec0a6216b` | unchanged |
| Migrations | 32 | 32 |
| Tables / columns / CHECK | 78 / 833 / 190 | unchanged |
| DB fingerprint | `82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf` | unchanged |
| Figma registry | 69 IDs | 69 IDs |

W01 adds **no HTTP operation**. No migration, no schema change, no generated file and no
Figma change.

---

## N. Validation — actual commands and results

```text
pnpm install                                              ok (sharp 0.35.3, +315 lockfile lines)
pnpm --filter @embroidery/persistence lint                ok
pnpm --filter @embroidery/persistence typecheck           ok
pnpm --filter @embroidery/persistence test                9 suites / 112 tests
pnpm --filter @embroidery/worker lint                     ok
pnpm --filter @embroidery/worker typecheck                ok
pnpm --filter @embroidery/worker test                     24 suites / 283 tests
pnpm --filter @embroidery/worker build                    ok
pnpm test:asset-processing:integration                    4 suites / 52 tests      [created]
pnpm test:asset-processing:worker-smoke                   1 suite  / 12 tests      [created]
pnpm test:storage-bootstrap:worker                        1 suite  / 9 tests
pnpm test:storage-bootstrap:composition                   1 suite  / 11 tests
pnpm test:worker-runtime:integration                      2+2 suites / 19+10 tests
pnpm test:worker-runtime:smoke                            1 suite  / 6 tests
pnpm test:worker-runtime:signal-smoke                     1 suite  / 5 tests  (exit 0 in 320 ms)
pnpm test:worker-runtime:uncooperative-timeout            2 suites / 3 tests
pnpm test:worker-runtime:fatal-process                    1 suite  / 16 tests
pnpm check:frontend-boundaries                            ok
pnpm check:spike-boundaries                               ok
pnpm check:e2e                                            ok
pnpm check:openapi                                        up to date
pnpm check:api-client                                     up to date
pnpm check:figma-design-index                             69 registry IDs
node --test tools/check-figma-design-index.test.mjs       ok
pnpm db:check:manifest                                    78 / 833 / 190 / 82864268…
node tools/check-file-size.mjs                            passed
pnpm quality                                              EXIT=0
git diff --check                                          clean
```

Two scripts were created because they did not exist: `test:asset-processing:integration`
and `test:asset-processing:worker-smoke`. No substitution was made for any other command.

Cleanup: every disposable database is dropped and every MinIO container removed by the
suite that created it; the residue case asserts it rather than assuming it. `docker ps -a`
shows no `embroidery-w01-*` or `embroidery-i03-*` container after the run.

---

## O. Commit A

```text
7f01f94ada2cd65e7765051de5e6144d9551fddd
feat(worker): inspect assets and generate catalog derivatives
48 files changed, 7003 insertions(+), 17 deletions(-)
```

**Disclosure.** The commit was created once with a mangled subject — a shell-quoting
mistake put a bare `@` on the first line — and amended immediately to the prescribed
message. The amendment happened before any evidence recorded a hash and changed no file;
the tree of `7f01f94` is byte-for-byte the tree of the first attempt. Recording it here
rather than leaving a hash nobody can reproduce.

Files (all within the allowed scope):

- `apps/worker/package.json`, `pnpm-lock.yaml` — `sharp@0.35.3`
- `apps/worker/src/jobs/asset-inspection/**` — 28 new files (handler, module, domain,
  application, infrastructure, test support and specs)
- `apps/worker/test/smoke/asset-processing-worker.smoke.spec.ts` — new
- `apps/worker/src/bootstrap/worker.module.ts` — imports the capability module
- `apps/worker/src/storage/object-storage.provider.ts` / `object-storage.module.ts` —
  adds and exports `OBJECT_STORAGE_ENVIRONMENT`, exports `OBJECT_STORAGE`
- `apps/worker/jest.config.mjs` — Docker-dependent suites excluded from `pnpm test`
- `apps/worker/src/runtime/tests/worker-runtime-context.ts` — registry reset (test-only)
- four smoke suites — `0 handler(s)` → `1 handler(s)`
- root `package.json` — two new scripts

`apps/api`, `apps/admin`, `apps/storefront`, `packages/object-storage`, the database
schema and migrations, OpenAPI, the generated client, Nginx, normal Compose networking and
Figma are all untouched. **No forbidden-area change was required**, and
`worker.Dockerfile` needed no edit — the existing `pnpm install --frozen-lockfile` stages
resolve Sharp's musl binary from the lockfile.

---

## P. Acceptance

| Criterion | Result |
| --- | --- |
| one handler | ✅ |
| `ASSET_PROCESSING` | ✅ |
| THUMBNAIL + CATALOG_PREVIEW | ✅ |
| `PENDING → PROCESSING` | ✅ |
| exact Sharp options and output policies | ✅ |
| no full-file buffering | ✅ |
| source integrity verification | ✅ |
| private deterministic derivatives | ✅ |
| atomic accepted/rejected effects | ✅ |
| invalid image handled as a business rejection | ✅ |
| retry and final-attempt behaviour | ✅ |
| idempotent terminal replay | ✅ |
| closed contradictions | ✅ |
| all 40 live cases | ✅ (52 tests) |
| real Linux worker smoke | ✅ |
| all I02/I03 regressions | ✅ |
| zero residue | ✅ |
| no API/frontend/public-media/schema/Figma change | ✅ |
| two scoped commits, clean tree, not pushed | ✅ |

**Verdict: `PASS`.**

### Judgement calls flagged for the reviewer

1. **Probe pixel limit.** The metadata probe disables `limitInputPixels` (§D). Without it
   an oversized upload is recorded as `DECODE_FAILED` instead of `PIXEL_LIMIT_EXCEEDED`.
   The probe decodes no pixels; both generation pipelines keep the ceiling.
2. **A concurrent loser is a contradiction, not a replay.** When two attempts at the same
   asset overlap, the loser finds the asset already `ACCEPTED` at its own terminal
   transaction and stops with `JOB_INVARIANT_VIOLATION`. Exactly one terminal effect
   survives (proven live), and the I02 lease makes true concurrency on one event
   impossible — but a reviewer may prefer the loser to re-verify and replay instead.
3. **`OBJECT_STORAGE_ENVIRONMENT` is a new worker token**, mirroring the API's. It exposes
   only the environment string, never the configuration object, which carries credentials.
4. **`sql-asset-inspection.repository.ts` is 316 lines**, above the 300-line review
   threshold and below the 400-line limit. It is one coherent state machine; the row shapes
   and reads were already split into `asset-rows.ts`, and splitting further would fragment
   the guards.

---

## Q. Handoff

```text
APP2-W01 = COMPLETE — DELIVERED_FOR_REVIEW
APP2-A01 = READY — NOT STARTED
APP2-B02 = BLOCKED_BY_APP2-A01
APP2-S01 = DESIGN_AUTHORITY_UI02 — BLOCKED_BY_PUBLIC_BACKEND
APP2-S02 = BLOCKED_BY_UI03_RECONCILIATION_AND_PUBLIC_BACKEND
```

What `APP2-A01` inherits: an asset that reaches `ACCEPTED` has exactly two private,
unwatermarked WebP derivatives at
`{env}/derivatives/{assetId}/THUMBNAIL.webp` and
`{env}/derivatives/{assetId}/CATALOG_PREVIEW.webp`, each with a persisted
`storage_key` and `sha256:` checksum, and exactly one `ACCEPTED` inspection whose V1
detail records the source and both outputs. A `REJECTED` asset has both rows `FAILED`, one
`REJECTED` inspection carrying a closed rejection code and `cleanupPending`, and its
original still in place.

Not delivered, by scope: public media delivery, Admin/Storefront UI, product mutation,
manual retry/delete APIs, retention runners, malware scanning, watermarking, editor
previews, and SVG/GIF/AVIF/TIFF/PDF or video/document processing.
