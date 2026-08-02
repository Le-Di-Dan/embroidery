# APP2 — Assets and Catalog Publication

> **Status:** `AUDITED — PASS_WITH_REQUIRED_DECISIONS` (engineering
> `STARTED_WITH_FOUNDATION_ONLY` — see the `APP2-I01` block below).
> `APP2-PRE-AUDIT` complete — audit [`audits/APP2_PRE_IMPLEMENTATION_AUDIT.md`](../audits/APP2_PRE_IMPLEMENTATION_AUDIT.md),
> report [`reports/APP2-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md`](../reports/APP2-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md).
> Verdict `NO_APP2_MIGRATION`; two required decisions before any code
> (`IMP-O002` object storage → `APP2-DEC-STORAGE`; `IMP-O003` job runtime →
> `APP2-DEC-JOBS`), one design package (`APP2-D01`, Admin `NEW` + Storefront
> list/detail `SUPPLEMENT`). First checkpoint: **`APP2-DEC-STORAGE`**. The
> corrected 17-checkpoint map in §6.1 supersedes the §6 candidate slices.
>
> **`APP2-DEC-STORAGE` = `COMPLETE — CORRECTED, DELIVERED_FOR_REVIEW`** —
> object-storage + asset-intake architecture locked by **IMP-D028 /
> [`ADR-APP2-001`](../../adr/backend/ADR-APP2-001-OBJECT-STORAGE-AND-ASSET-INTAKE.md)**
> (S3-compatible / MinIO dev, AWS SDK v3, API-proxied streaming upload, two
> private buckets, server SHA-256, SVG rejected, proxied publication-gated
> delivery, `NO_APP2_MIGRATION`), verdict `PASS_WITH_PRODUCT_PARAMETERS`.
> **Corrected by `APP2-DEC-STORAGE-C1`** (report
> [`reports/APP2-DEC-STORAGE-C1-CORRECTION-REPORT.md`](../reports/APP2-DEC-STORAGE-C1-CORRECTION-REPORT.md)):
> the `assets` row is created **only after** the object is stored/measured
> (`UPLOADED` is post-upload, not a reservation; IDX-086 recovery-only); the HTTP
> transport is the **T1 single streaming multipart request** (`busboy` →
> `@aws-sdk/lib-storage` `Upload`); route-scoped nginx `client_max_body_size` +
> `proxy_request_buffering off`; server-authoritative SHA-256 (no client
> checksum); and `OBJECT_STORAGE_PUBLIC_BASE_URL` removed from APP2 scope. It
> adds a narrow **`APP2-I01`** object-storage foundation checkpoint before
> `APP2-B01` (map now **18 checkpoints**, §6.1; **19 from 2026-08-01**, when
> `APP2-T01` was activated ahead of `APP2-B04` — IMP-D036).
> **Also corrected by `APP2-DEC-STORAGE-C2`** (report
> [`reports/APP2-DEC-STORAGE-C2-CORRECTION-REPORT.md`](../reports/APP2-DEC-STORAGE-C2-CORRECTION-REPORT.md)):
> upload idempotency locked to **model I1 — pre-stream durable allocation**
> (UUIDv7 `assetId`+key persisted in the `IN_PROGRESS` `idempotency_records.result`
> so a crash-retry recovers the same identity); **pre-stream fingerprint** (no
> content hash); full CW-01…CW-07 crash matrix; **`@aws-sdk/s3-request-presigner`
> removed** from the APP2 package set; `lib-storage` memory-bound policy + C1
> heap-claim corrected. Persisting the allocation is a **repository implementation
> gap** (owner `APP2-B01`), **not** a schema gap — `NO_APP2_MIGRATION` re-confirmed
> against the real 31-migration schema. `APP2-DEC-JOBS` and `APP2-D01` remain
> blocked pending required-decision review.
>
> **`APP2-DEC-STORAGE` accepted** by the Product Owner as
> `ACCEPTED_WITH_BLOCKED_IMPLEMENTATION_GAPS` (no `APP2-DEC-STORAGE-C3`; the
> one-correction governance rule below applies). Three storage issues are
> **routed** to the `APP2-B01` entry gate — `STORAGE-BLK-01` content-complete
> upload idempotency fingerprint, `STORAGE-BLK-02` versioned/discriminated
> idempotency result JSON shape, `STORAGE-BLK-03` expired-allocation reclaim /
> old-object cleanup ordering — they block `APP2-B01` and downstream asset
> intake but **not** `APP2-DEC-JOBS`, `APP2-D01`, or `APP2-I01`.
> **All three are `RESOLVED_BY_APP2-B01-G01` (2026-07-27)**, together with
> `UPLOAD-POLICY-BLK-01` = `RESOLVED_BY_PRODUCT_OWNER`; see the `APP2-B01-G01`
> block below and `ADR-APP2-001` §4.2f.
>
> **`APP2-DEC-JOBS` = `DELIVERED_FOR_REVIEW`** — the asynchronous job runtime is
> locked by **IMP-D029 /
> [`ADR-APP2-002`](../../adr/backend/ADR-APP2-002-ASYNCHRONOUS-JOB-RUNTIME.md)**:
> a **PostgreSQL-backed claim queue on the existing persistence** (`outbox_events`
> durable work signal + `background_job_attempts` + `FOR UPDATE SKIP LOCKED`
> claim + **visibility-timeout lease on `next_attempt_at`**; J2 Redis/BullMQ and
> J3 RabbitMQ rejected — second datastore, transactional-outbox invariant lost).
> **No new runtime dependency, `NO_APP2_MIGRATION`** (spike 23/23 vs the real
> 31-migration schema). At-least-once + idempotent creation/execution (not
> exactly-once). It inserts a narrow **`APP2-I02`** worker-runtime foundation
> checkpoint (poll/claim-lease driver, `event_type` handler registry, attempt
> seam, `FU-A07` worker logging/correlation, graceful shutdown replacing the
> keep-alive) between `APP2-DEC-JOBS`/`APP2-B01` and `APP2-W01` (map now
> **19 checkpoints**, §6.1). Report:
> [`reports/APP2-DEC-JOBS-COMPLETION-REPORT.md`](../reports/APP2-DEC-JOBS-COMPLETION-REPORT.md).
> **Corrected by `APP2-DEC-JOBS-C1`** (report
> [`reports/APP2-DEC-JOBS-C1-CORRECTION-REPORT.md`](../reports/APP2-DEC-JOBS-C1-CORRECTION-REPORT.md)):
> the original claim predicate/retry state contradicted IDX-088 (partial `WHERE
> status='PENDING'`). Locked state machine — **`PENDING` is the only automatic
> claim/retry state** (three column-distinguished sub-states); retryable failure
> returns the row to **`PENDING`** with a backoff `next_attempt_at` (never
> `FAILED`); `DISPATCHED`/`DEAD_LETTER` terminal; **`FAILED` reserved, never
> emitted/claimed** by the APP2 runtime. Ownership-guarded success/retry/terminal
> completion transactions (attempt + outbox mutation atomic, after the handler
> effect commits); `job_key=outbox_events.id`; expired-lease recovery records the
> crashed attempt (`WORKER_LEASE_EXPIRED`, CST-049 conflict-safe) then reclaims;
> no-heartbeat timeout invariant + `AbortSignal`; handler idempotency contract;
> policy-key set. `NO_APP2_MIGRATION`, no dependency; correction spike **25/25**.
> This is the **only** correction for `APP2-DEC-JOBS` (one-correction rule).
>
> **`APP2-D01` = `DELIVERED_FOR_PRODUCT_OWNER_REVIEW`** — the Assets and Catalog
> Publication design package is delivered as **one** package on the new Figma page
> **APP_02 (`419:3`)**, section **`APP2-D01 · Assets & Catalog Publication`
> (`423:3`)**: 27 screen/state frames + 2 annotation frames + 1 design-system
> supplement. Admin asset intake / product draft / catalog / publication are `NEW`;
> Storefront product list and detail are `SUPPLEMENT` (cloned from the **approved**
> APP1-D02 shells, which are unmodified). `GAP-D01` is supplemented in the product
> file as `FIG-DS-INPUT-APP2`; `GAP-D02` remains a local `ink/900 @45%` composition.
> All 30 new registry rows are `REVIEW_REQUIRED` and **no APP1 row is superseded**.
> Registry: [`FIGMA_DESIGN_INDEX.md`](../../design/FIGMA_DESIGN_INDEX.md) §4.3/§6.1b
> (69 registry IDs). Report:
> [`reports/APP2-D01-COMPLETION-REPORT.md`](../reports/APP2-D01-COMPLETION-REPORT.md).
> **No frontend checkpoint may implement from these rows until the Product Owner
> promotes them to `APPROVED_FOR_IMPLEMENTATION`.** See the §6.2 handoff.
>
> **Product Owner review outcome + `APP2-D01-C1` correction (2026-07-26):**
>
> ```text
> APP2-D01-ADMIN                       = COMPLETE — PRODUCT_OWNER_APPROVED — FROZEN
> APP2-D01-STOREFRONT-PRODUCT-LIST     = REJECTED_NODE_SET_REMOVED
>                                        SOURCE_AUTHORITY_CORRECTED_TO_UI02
> APP2-D01-STOREFRONT-PRODUCT-DETAIL   = NOT_APPROVED
>                                        WITHHELD_PENDING_UI03_RECONCILIATION
> APP2-D01                             = PARTIAL_PRODUCT_OWNER_APPROVAL
>                                        CORRECTION_COMPLETE (APP2-D01-C1)
> ```
>
> `APP2-D01-C1` deleted the four rejected card-grid frames, removed their registry
> authority, and made **UI02 – Discover Feed** the mandatory source of truth for
> `APP2-S01` (§6.2.1). Admin was verified unchanged (31/31 frozen nodes identical).
> Report:
> [`reports/APP2-D01-C1-STOREFRONT-SOURCE-CORRECTION-COMPLETION-REPORT.md`](../reports/APP2-D01-C1-STOREFRONT-SOURCE-CORRECTION-COMPLETION-REPORT.md).
>
> **`APP2-I01` = `COMPLETE — DELIVERED_FOR_REVIEW`** — the object-storage
> foundation, the first APP2 engineering checkpoint. `@embroidery/object-storage`
> ships the six-operation port (bucket **alias** only, no presign, no
> unrestricted list-all), the S3 adapter with streaming `lib-storage` multipart
> (5 MiB × 2, `leavePartsOnError: false`), PII-free UUIDv7 keys from validated
> MIME (SVG rejected), strict fail-fast config with paired credentials and secret
> redaction, and a closed provider-error taxonomy. Also: the pinned
> `minio/minio:RELEASE.2025-04-08T15-41-24Z` development Compose service with
> in-package private-bucket bootstrap, and an **inactive** route-scoped nginx
> upload seam. Direct dependencies are exactly `@aws-sdk/client-s3` +
> `@aws-sdk/lib-storage` `3.1095.0`; `NO_APP2_MIGRATION` holds and every frozen
> baseline is unchanged. 150 unit tests + 20/20 disposable-MinIO contract cases.
> Report:
> [`reports/APP2-I01-COMPLETION-REPORT.md`](../reports/APP2-I01-COMPLETION-REPORT.md).
>
> Two consequences carried forward. **`APP2-B01` owns the seam's unset hooks:**
> `client_max_body_size`, `proxy_read_timeout` and `proxy_send_timeout` were left
> unset on purpose because the maximum-image-bytes Product Owner parameter is
> still open — with request buffering off, the API owns incremental size
> enforcement and its own read timeout, and the gateway is **not** the size
> authority. **`busboy` belongs to `APP2-B01`**, not here.
>
> **`APP2-I02` = `COMPLETE — DELIVERED_FOR_REVIEW`** — the PostgreSQL
> worker-runtime foundation, implementing IMP-D029 / `ADR-APP2-002` as corrected
> by `APP2-DEC-JOBS-C1`, and closing **`FU-A07`**.
>
> `packages/persistence` gains `WorkerJobQueueRepository`, a narrow typed seam:
> `claimRegisteredBatch`, `completeSucceededAttempt`, `completeRetryableAttempt`,
> `completeTerminalAttempt`, `probeWorkerDatabase`. The claim is a **single
> statement**, so one database instant governs due-ness, `claimed_at` and the
> lease deadline; it filters to the registry's event types (an empty registry
> claims **nothing**, never everything), takes rows with `FOR UPDATE SKIP
> LOCKED`, appends conflict-safe `WORKER_LEASE_EXPIRED` evidence for an abandoned
> lease through a data-modifying CTE, leases via `next_attempt_at`, and keeps
> `status = 'PENDING'`. Completions are ownership-guarded on
> `(id, PENDING, worker, attempt)` and return typed `STALE_JOB_LEASE` without
> writing evidence when the guard fails. **`FAILED` is never emitted.**
>
> `apps/worker` gains the handler registry (one handler per event type, duplicate
> registration fails startup), the closed error taxonomy, the exact capped
> backoff `min(base × 2^(n−1), max)` with no jitter, worker identity plus
> `AsyncLocalStorage` correlation behind an allow-list log projection (no
> fabricated `X-Request-ID`, no payload/secret/stack), a bounded poll loop with a
> per-attempt `AbortController` timeout, graceful shutdown and readiness. The
> no-op keep-alive service is removed. **No new dependency**;
> `NO_APP2_MIGRATION` holds; every frozen baseline is unchanged.
>
> Runtime policy is read from the canonical `policy_configurations` /
> `policy_configuration_versions` path under key `worker.runtime`. **No
> environment variable duplicates it, there is no production default, and no
> development bootstrap was added** — the prompt permits one only when a
> canonical platform-bootstrap mechanism already owns such defaults, and none
> exists. Consequence, stated rather than hidden: the development Compose worker
> reports `WORKER_POLICY_MISSING`, stays up and claims nothing until an operator
> publishes `worker.runtime`.
>
> Evidence: 115 worker + 107 persistence unit tests, all 27 required
> disposable-PostgreSQL cases (29 total, with real parallel-transaction
> concurrency evidence), and a 6-assertion real-process smoke. Report:
> [`reports/APP2-I02-COMPLETION-REPORT.md`](../reports/APP2-I02-COMPLETION-REPORT.md).
>
> **The production handler registry is empty.** That is correct, not a gap:
> `APP2-W01` owns the Asset inspection and derivative handlers.
>
> **`APP2-I02-C1` = `COMPLETE`** — the single allowed correction. Review
> returned `CORRECTION_REQUIRED` on two counts, both now fixed, so
> **`APP2-I02` = `COMPLETE — CORRECTED — DELIVERED_FOR_REVIEW`**.
>
> **1. Overlapping timed-out attempts.** A handler that ignored its
> `AbortSignal` was abandoned while the runtime recorded a retryable timeout and
> **released the lease** — so the still-running handler could overlap a retry of
> the same job with the same `effectKey`. Node cannot cancel a running promise;
> the I02 report was wrong to record this as a limitation rather than a defect.
> The handler promise is now never detached. After the abort the runtime waits
> on it until a hard stop of
> `min(timeoutInstant + leaseSafetyMarginMs, leaseExpiresAt − fatalExitSafetyMs)`,
> where `fatalExitSafetyMs = 250` is an internal constant — not an environment
> variable — enforced at policy startup by requiring `leaseSafetyMarginMs` to
> exceed it. A **cooperative** handler settles inside the deadline and completes
> through the existing atomic transaction as `JOB_HANDLER_TIMEOUT`; a late
> success can never be recorded as `SUCCEEDED`. An **uncooperative** handler
> gets **no completion at all**: the row keeps `PENDING`, `claimed_by`,
> `attempt_count` and `next_attempt_at` exactly as claimed, the runtime enters
> `FATAL_HANDLER_UNRESPONSIVE`, stops claiming, reports unready, emits one
> allow-list fatal log, closes context and pool once, and exits `1` before the
> lease expires. A later worker reclaims after expiry and writes the single
> `WORKER_LEASE_EXPIRED` attempt. The process boundary is the only cancellation
> a JavaScript handler cannot ignore.
>
> **2. Signal evidence.** `process.emit('SIGTERM')` proves a listener is
> attached and nothing more. A **real Linux SIGTERM** is now delivered with
> `docker kill --signal=TERM` to the shipped `runner` image, which exits **0 in
> 362 ms**; `process.emit` is demoted to a fast unit check. That smoke also
> exposed a pre-existing defect in the production image, which had never been
> executed because the development stack uses the `dev` target: the
> `deps`/`prod-deps` stages never copied the `packages/database` and
> `packages/persistence` manifests, so their `node_modules` were never installed
> and the container died on `@nestjs/common`. Fixed in `worker.Dockerfile`.
>
> No dependency, no migration, no schema/status/outcome change, and no
> persistence change (`leaseExpiresAt` was already projected). Evidence: 130
> worker + 107 persistence unit tests, 29 queue-integration cases, 3 timeout
> cases, 5 real-signal cases, zero Docker and database residue, frozen baselines
> unchanged. Report:
> [`reports/APP2-I02-C1-CORRECTION-REPORT.md`](../reports/APP2-I02-C1-CORRECTION-REPORT.md).
> **`APP2-I02-C2` must not be created.**
>
> **`APP2-I02-FD1` = `COMPLETE`** — the mandatory final directive, and the
> reason **`APP2-I02` = `COMPLETE — CORRECTED — REVIEW_ACCEPTED`** with
> `APP2-I02-C1` = `SUPERSEDED_BY_FINAL_PROCESS_PROOF`.
>
> Final review ruled C1 `IMPLEMENTATION_SUBSTANTIALLY_CORRECT BUT
> ACCEPTANCE_NOT_PROVEN`, and it was right. C1 proved the uncooperative path
> with an **injected** process-exit seam inside Jest: worker A's never-settling
> promise stayed alive in the test process, and worker B started after an exit
> *record* rather than after worker A had actually died. Ordering between two
> objects in one process cannot rule out overlap, and the enforcement mechanism
> under test is process death — so a test that never kills a process never
> exercises it.
>
> FD1 supplies the real thing. Worker A runs the genuine Nest runtime as **PID 1
> in a Linux container** with the **production** exit seam; its handler ignores
> `AbortSignal` and never settles; the real fatal path ends the real container.
> Worker B is a **separate container**, started only once `docker inspect`
> reports worker A stopped **and** the database's `clock_timestamp()` has passed
> the lease deadline. Ordering is established by the database clock and Docker's
> own `FinishedAt` — never a host clock, never an in-process observer.
>
> Proven externally over **three consecutive runs**: `ExitCode 1` /
> `Running: false` roughly 17 s before the lease deadline; the row stays
> `PENDING`, owned by worker A, `attempt_count = 1`, `next_attempt_at`
> unchanged, `last_error` NULL; **zero** attempt rows before the reclaim;
> worker B's handler starts ~18 s after worker A's `FinishedAt`; attempts become
> exactly `1/FAILED_RETRYABLE/WORKER_LEASE_EXPIRED` then `2/SUCCEEDED`; final
> status `DISPATCHED`; worker B exits 0; both containers, the test image and the
> disposable database are removed and their absence asserted.
>
> **The production runtime needed no change.** The C1 state machine passed this
> test on its first complete run; the only two defects found were mine, in the
> test — reading only `stdout` hid Nest's stderr fatal line, and one assertion
> targeted a warning that is genuinely unreachable once the fatal closer's
> `app.close()` aborts the shutdown signal first. A test-only `process-test`
> Docker target compiles the fixtures; the production `runner` image copies
> nothing from it and normal Compose never references it. No dependency, no
> migration, no schema change, no Asset handler. Report:
> [`reports/APP2-I02-FD1-FINAL-VERIFICATION-REPORT.md`](../reports/APP2-I02-FD1-FINAL-VERIFICATION-REPORT.md).
>
> **`APP2-B01-G01` = `COMPLETE — ENTRY_GATE_CLOSED`** (2026-07-27) — the asset-
> intake entry gate, executed **under `APP2-B01` ownership**, not as a third
> storage correction (`APP2-DEC-STORAGE-C3` must not be created). It closes all
> four gate blockers: **`STORAGE-BLK-01/02/03` = `RESOLVED_BY_APP2-B01-G01`** and
> **`UPLOAD-POLICY-BLK-01` = `RESOLVED_BY_PRODUCT_OWNER`**.
>
> Product Owner values are now binding: **25 MiB (26 214 400 bytes)** maximum
> raster product image enforced by the API as the authoritative incremental
> counter; accepted media exactly `image/png`/`image/jpeg`/`image/webp`; **SVG
> rejected**; non-image embroidery source files **excluded from APP2**; originals
> **retained while the asset exists** (unpublish never deletes an original, no
> age-based deletion in APP2); a **coarse route-scoped 27 MiB (28 311 552 bytes)**
> gateway multipart ceiling that is explicitly *not* the file-size validator;
> **5-minute** API hard upload duration with strictly longer gateway timeouts;
> **15-minute** allocation TTL (TTL > hard duration + cleanup margin).
>
> The contract is locked in [`ADR-APP2-001`](../../adr/backend/ADR-APP2-001-OBJECT-STORAGE-AND-ASSET-INTAKE.md)
> §4.2f: a **two-stage identity** — an immutable pre-stream *request* fingerprint
> in the `fingerprint` column plus a post-stream *content* fingerprint stored in
> the result, so a completed replay is content-complete only when it **resends
> and re-verifies the whole body** with **zero** object writes; a **versioned,
> discriminated** `ASSET_UPLOAD_ALLOCATION` / `ASSET_UPLOAD_COMPLETED` result
> union with strict decoding and a state/result invariant (malformed →
> `IDEMPOTENCY_RESULT_INVALID`, safe 5xx, no object write, no transition); a
> **`claimToken`** that rotates only on expired reclaim — preserving `assetId`
> and `objectKey` — and is verified inside both Tx A and Tx B, so a stale request
> gets `STALE_UPLOAD_CLAIM` and mutates nothing; and a strictly ordered reclaim
> that **never deletes an existing durable asset** and, when no asset exists,
> completes cleanup and re-verifies the token **before** replacement streaming
> begins (cleanup failure accepts no object at all).
>
> `APP2-B01` is scoped to **exactly three operations** — Admin asset upload,
> asset detail, asset list — dropping the historical "retry" endpoint rather than
> inventing operations to fill a five-endpoint budget.
>
> Two reconciliations recorded rather than silently resolved: the gate input's
> `PRODUCT_IMAGE` asset kind **does not exist** in the repository, so the locked
> `ASSET_KINDS` value **`CATALOG_MEDIA`** governs; and the http-level
> `client_max_body_size 20m` stays, with the upload location overriding it
> **upward** to `27m` for that route only. `NO_APP2_MIGRATION` re-confirmed —
> **9/9** disposable-PostgreSQL checks against the real 31-migration / 78-table
> schema, zero residue. Every remaining shortfall is a **repository
> implementation gap** (ADR §4.2f-7), owner `APP2-B01`. Report:
> [`reports/APP2-B01-G01-COMPLETION-REPORT.md`](../reports/APP2-B01-G01-COMPLETION-REPORT.md).
>
> **`APP2-B01` = `COMPLETE — DELIVERED_FOR_REVIEW`** (2026-07-27) — the three
> Admin asset operations: `POST /api/admin/assets/upload` (`adminAsset_upload`),
> `GET /api/admin/assets/:assetId` (`adminAsset_detail`) and
> `GET /api/admin/assets` (`adminAsset_list`).
>
> Upload streams one PNG/JPEG/WebP through `busboy` into the private
> `ORIGINALS` bucket in a **single pass**: a bounded 12-byte prefix settles the
> signature before any byte reaches storage, the 25 MiB counter is incremental
> and authoritative, and the SHA-256 is computed on the same bytes — nothing
> buffers the whole file anywhere. The pre-stream claim commits the allocation
> (UUIDv7 asset id, deterministic key, claim token) **before** a single file byte
> is read, so a crash-retry recovers the same identity. A completed replay
> re-reads and re-verifies the entire resent body through a hash-only path and
> writes **zero** objects; an expired allocation is reclaimed by rotating the
> claim token in place and then resuming from durable asset truth, never
> deleting an existing asset and always finishing cleanup before a replacement
> byte is streamed. Tx A inserts-or-recovers the asset as `UPLOADED` with no
> event; Tx B performs the guarded `UPLOADED → INSPECTING` transition, appends
> **exactly one** `asset.inspection.requested` event and completes the record
> with that event's id. Both verify the claim token inside their own
> transaction. Exactly-once is not claimed.
>
> Persistence gains `IdempotencyAllocationStore` (claim-with-allocation, locked
> read, expired-claim renewal, guarded completion — expiry always by database
> time) and `AssetRepository` gains insert-or-recover, the guarded transition,
> and scoped detail/keyset list. **No schema change, no migration**; the only
> dependencies added are `busboy` `1.6.0` and `@types/busboy` `1.5.4`.
>
> The Nginx upload seam is **activated** for exactly one exact-match location
> with `27m` / `360s` / `proxy_request_buffering off`, every value from the
> environment; global gateway limits are unchanged and MinIO stays unexposed.
>
> **Three real streaming defects were found by the live suite and fixed:** an
> errored sink destroyed without a listener crashed the process; `pipe` does not
> forward source errors, so a disconnecting client emitted an unhandled `error`;
> and a stalled client hung past its own deadline because the reader only
> checked the abort signal when a chunk arrived. A fourth finding was structural
> — wiring the controller into `AssetModule` broke the DB7 persistence suite, so
> the module was **split** into `AssetModule` (persistence) and
> `AssetIntakeModule` (HTTP + storage + state machine).
>
> Evidence: 194 asset unit tests; **25 live PostgreSQL + MinIO cases covering all
> 30 required scenarios**; 27 API cases; 20 gateway cases including a **real
> `nginx:1.27.3-alpine` render + `nginx -t`**. `pnpm quality` `EXIT=0`
> (90/90 API suites, 1112 tests). OpenAPI `ae015dd6…` → `e19c2f76…` and client
> `89c1aace…` → `55de1cc1…` (+197 lines, 0 deletions); DB 78/833/31 and Figma 69
> unchanged. Report:
> [`reports/APP2-B01-COMPLETION-REPORT.md`](../reports/APP2-B01-COMPLETION-REPORT.md).
>
> **Asset processing now exists (`APP2-W01`); publication and public product
> functionality still do not.** `APP2-A01` is `DESIGN_APPROVED — READY — NOT
> STARTED` and `APP2-S01` stays
> `DESIGN_AUTHORITY_UI02 — BLOCKED_BY_PUBLIC_BACKEND`.

> **`APP2-W01` entry gate (2026-07-27) — `BLOCKED`, then routed.** W01's
> mandatory schema-representability gate failed and the checkpoint stopped
> before any code: `asset_derivatives.kind` had no non-watermarked catalog
> display kind, and neither candidate was usable (`PREVIEW_WATERMARKED` is bound
> to INV-22/BR-012 and the public preview contract; `NORMALIZED` would redefine
> the artwork concept CON-042/CON-061 merged). The same audit found two DB3
> LC-06 contradictions (derivatives start at `PENDING`, and LC-06 read as
> "derivatives only after `ACCEPTED`") and one runtime-foundation gap
> (`ensurePrivateBuckets` has no production caller). Routed to two new
> checkpoints — **`APP2-DB01`** (schema/lifecycle, delivered) and **`APP2-I03`**
> (bucket bootstrap wiring) — so the order is
> **`APP2-DB01 → APP2-I03 → APP2-W01`** and the map is now **21 checkpoints**
> (§6.1). Both prerequisites were delivered, and **`APP2-W01` is now
> `COMPLETE — DELIVERED_FOR_REVIEW`** — one handler for
> `asset.inspection.requested` under `ASSET_PROCESSING`, `sharp@0.35.3`,
> `THUMBNAIL` + `CATALOG_PREVIEW` both unwatermarked, all 40 required live cases
> plus a shipped-image Linux smoke ([`reports/APP2-W01-COMPLETION-REPORT.md`](../reports/APP2-W01-COMPLETION-REPORT.md)).
> **`APP2-A01` = `READY — NOT STARTED`.**

> **`APP2-A01` entry gate (2026-07-27) — `BLOCKED`, then cured by `APP2-D02`.**
> A01's design/contract audit stopped the checkpoint **before any source change**
> (no commit, no file changed) with
> **`BLOCKED_BY_MISSING_ASSET_LIST_CONTINUATION_DESIGN`**: `adminAsset_list`
> returns `hasNext` + `nextCursor` (`limit` ≤ 100, no delete API, so the list
> outgrows one page), yet none of the seven approved frames, the handoff-notes
> node `450:404`, the registry, the D01 reports or this plan defined any
> continuation interaction — proven from node metadata, because the Uploading /
> Processing / Rejected frames clip their grid at the 1024 px frame bottom.
> Rendering page 1 alone would silently discard pages; inventing a control would
> be self-approved design. The same audit reproduced a second gap: every approved
> card and row displayed a **source filename**, which B01 neither persists nor
> exposes. Two candidate blockers were **checked and cleared** — thumbnails are
> honest placeholder glyphs, so no media-delivery contract is required, and the
> side navigation locks a dedicated Assets destination, so `/assets` is not an
> invented route.
>
> **`APP2-D02` = `COMPLETE — DELIVERED_FOR_REVIEW`** (2026-07-27) — the narrow
> design-reconciliation checkpoint that cures both gaps, design and documentation
> only. Product Owner decisions, applied in place to the eight existing nodes:
> an explicit user-triggered **`Tải thêm tài sản`** control shown only when
> `hasNext = true` (append, never replace; loading keeps existing items and
> announces politely once; a continuation failure keeps existing items and offers
> `Thử lại` on the **same** cursor; no control when `hasNext = false`; no
> total-count copy, because the API exposes no total; never infinite scroll,
> viewport-triggered loading, offset or page-number paging, or silent
> truncation), and a **server-backed identity** of `image/png → Ảnh PNG`,
> `image/jpeg → Ảnh JPEG`, `image/webp → Ảnh WebP`, unknown →
> `Tài sản hình ảnh`, with a `{size} · {createdAt}` secondary line in `vi-VN`
> (`dd/MM/yyyy, HH:mm`). **No backend field is added and no filename is
> fabricated**; `File.name` stays transient local upload state and the view
> switches to server identity once it reconciles from B01. The seven Admin Assets
> registry rows are promoted to `APPROVED_FOR_IMPLEMENTATION` under
> **`FIG-APPROVAL-APP2-D01-ADMIN-001`**, closing the divergence between the
> frozen ruling and the rows, and one annotation node
> `FIG-ADMIN-ASSETS-CONTINUATION-IDENTITY` (`484:272`) is registered (registry
> 69 → 70). Design authority is now
> **`PRODUCT_OWNER_APPROVED — FROZEN — D02_RECONCILED`**. No application source,
> dependency, OpenAPI, client or database change — map now **22 checkpoints**
> ([`reports/APP2-D02-COMPLETION-REPORT.md`](../reports/APP2-D02-COMPLETION-REPORT.md)).
> **`APP2-A01` = `READY — NOT STARTED`** (unblocked).
>
> **`APP2-A01` delivered (2026-07-28).** The Admin asset library ships at
> `/assets` against the three accepted `APP2-B01` operations, implementing
> `IMP-D031` continuation and identity exactly. Baselines unchanged (OpenAPI
> `e19c2f76…`, client `55de1cc1…`, DB 32 migrations / 78 tables / `82864268…`,
> Figma registry 70 IDs); no dependency added. **`APP2-A01` =
> `COMPLETE — DELIVERED_FOR_REVIEW`**, so **`APP2-B02` = `READY — NOT STARTED`**
> ([`reports/APP2-A01-COMPLETION-REPORT.md`](../reports/APP2-A01-COMPLETION-REPORT.md)).
>
> > **SUPERSEDED (2026-07-28).** `APP2-B02` was **not** in fact executable at
> > that point: its pre-code audit blocked as
> > `BLOCKED_BY_PRODUCT_DRAFT_FIELD_DECISION`. The entry gate `APP2-B02-G01`
> > closes it — see the `APP2-B02-G01` record below for the current status.
> One approved affordance is **not** implemented and needs a reviewer decision:
> the Rejected-state action `Xoá khỏi danh sách` has no delete or hide operation
> in the contract, and this checkpoint may not add one.
>
> **`APP2-A01-C1` (2026-07-28) — secure-context idempotency key.** A live test
> through the development gateway showed every upload failing with the generic
> safe error and **no network request at all**:
> `http://admin.embroidery.local` is plain HTTP on a named host, so it is not a
> secure context and the `[SecureContext]`-only `crypto.randomUUID()` is absent
> there, making the intent throw before the transport was reached. The key now
> falls back to 16 `crypto.getRandomValues()` bytes formatted as a v4 UUID —
> still cryptographically strong, still inside B01's length window and
> allowlist, still no `Math.random()` path. Two regression tests reproduce the
> insecure context. Commit `77691abcadae042646416f1f6171f107112fceee`;
> `pnpm quality` `EXIT=0`; all baselines unchanged. **`APP2-A01` =
> `COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW`.**
>
> **`APP2-B02` entry gate (2026-07-28) — `BLOCKED`, then closed by
> `APP2-B02-G01`.** The `APP2-B02` pre-code audit blocked as
> **`BLOCKED_BY_PRODUCT_DRAFT_FIELD_DECISION`** with **no commit and no tracked
> file changed**. The schema was *not* the problem — draft create/list/detail/
> update, ordered media, archive and `updated_at` concurrency are all
> representable on the existing 32 migrations. The blocker was that `products`
> carries **10 NOT NULL columns with no default**, and after the four rules DB7
> already locks in `drizzle-product.repository.ts` (`status='DRAFT'`,
> `currency='VND'`, `is_display_out_of_stock=false`, `is_indexable=true`) five
> mandatory values still had no locked rule: `category_id`, `slug`,
> `base_price_amount`, `display_order` and `product_media.role`. `category_id`
> was the severe one — it is NOT NULL with a `restrict` FK, **zero category rows
> existed**, there is **no category operation in the API**, and `APP2-B02` may
> not add a sixth operation, so a draft could never have been created.
>
> **`APP2-B02-G01` = `COMPLETE — ENTRY_GATE_CLOSED`.** IMP-D032 locks all five
> decisions and migration `0033` provisions the fixed four-category taxonomy
> (`thu-bong`, `khan`, `quan-ao`, `khac`) as reference data. **Data only:** 32 →
> 33 migrations, while **78 tables / 833 columns / 190 CHECKs and fingerprint
> `82864268…` are unchanged**, proven on a fresh 33-migration database. B02
> accepts `categorySlug` (closed enum) and never exposes a category UUID. No
> OpenAPI, generated-client, application-source, Figma or dependency change
> ([`reports/APP2-B02-G01-COMPLETION-REPORT.md`](../reports/APP2-B02-G01-COMPLETION-REPORT.md)).
> **`APP2-B02` = `READY — NOT STARTED`** (unblocked), with its canonical
> five-operation scope unchanged.
>
> **`APP2-B02` delivered (2026-07-31).** Five Admin operations, no sixth and no
> category endpoint. Every IMP-D032 decision is implemented as locked, and the
> two facts the schema forced are recorded rather than hidden: there is **no
> ownership column** on `products` (one Admin actor, so authentication is the
> scope and no audit actor can be stored), and `updated_at` is compared
> **truncated to milliseconds**, because that is the precision of the ISO token
> a client can echo back — the raw microsecond comparison failed every guarded
> write. Archive is not delete. OpenAPI 7 → 10 paths and 8 → 13 operations
> (`e19c2f76…` → `b789cc99…`); client `55de1cc1…` → `66d1c991…`; DB baseline,
> Figma (70) and dependencies unchanged. **`APP2-B02` =
> `COMPLETE — DELIVERED_FOR_REVIEW`**, so **`APP2-A02` and `APP2-A03` are
> `READY — NOT STARTED`** and `APP2-B03` is `BLOCKED_BY_APP2-B02`
> ([`reports/APP2-B02-COMPLETION-REPORT.md`](../reports/APP2-B02-COMPLETION-REPORT.md)).
>
> **`APP2-B02-C1` (2026-07-31) — mutation protection, concurrency token and
> media validation.** The review found three blocking gaps and one unproved
> invariant, all reproduced before being fixed. (1) The mutations carried
> `StaffOriginGuard` but **not** `StaffJsonBodyGuard` — which existed in APP1
> but was never exported — so a `text/plain` post answered **400 instead of
> 415**; all three now carry the canonical
> `AuthenticatedAdminGuard + StaffOriginGuard + StaffJsonBodyGuard`.
> (2) `updated_at` truncated to milliseconds was comparable but **not
> monotonic**: two writes in one millisecond published the same token and a
> stale value still matched. The database now computes
> `GREATEST(date_trunc(ms, clock_timestamp()), date_trunc(ms, updated_at) + 1ms)`
> and returns it; application time is no longer the authority anywhere on the
> write path. (3) The **invented twelve-item media limit** is removed — it
> existed only to bound a per-item loop and had no product authority (it never
> reached OpenAPI, so it was runtime-only). (4) Validation is now one
> transaction-scoped `FOR SHARE` batch read, so a selected Asset **cannot leave
> `ACCEPTED` between validation and the media write** — proved with two real
> transactions and SQLSTATE `55P03`. Description semantics locked: absent leaves
> the value, `null` or blank clears it. 19 new tests; OpenAPI `b789cc99…` →
> `c4d1fef8…` and client `66d1c991…` → `3e3e267d…` (description wording plus the
> 403/415 the guards now produce; **paths and operation IDs unchanged**); no
> schema, migration, Figma, frontend, worker, object-storage or dependency
> change. **`APP2-B02` = `COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW`**
> ([`reports/APP2-B02-C1-CORRECTION-REPORT.md`](../reports/APP2-B02-C1-CORRECTION-REPORT.md)).
> **`APP2-B02-C2` = `MUST_NOT_BE_CREATED`.** `APP2-A02` and `APP2-A03` are
> **`BLOCKED_BY_PRODUCT_OWNER_DESIGN_APPROVAL`**.
>
> **`APP2-A02` blocked, then cured by `APP2-D03` (2026-07-31).** The A02 implementation
> gate stopped before any code was written — **no commit, no tracked file change** — with
> **`BLOCKED_BY_CATALOG_LIST_DESIGN_CONTRADICTION`**. Two contradictions were proved
> against the live nodes: the canonical A02 scope locks **filters** and pagination, but
> none of the three frozen Catalog nodes contained a status or category filter; and the
> nodes carried `Tạo sản phẩm`, `Chỉnh sửa`, `Xuất bản` and `Gỡ xuất bản`, which belong to
> `APP2-A03` and `APP2-A04` and whose routes do not exist at A02 delivery time. A third
> defect was documentary: §6.2 and annotation `450:404` inverted the A02/A03 labels.
> **`APP2-D03`** reconciles the three nodes in place (IMP-D033): it adds the `Trạng thái`
> and `Danh mục` filters and the `Tải thêm sản phẩm` continuation control reusing the
> `APP2-D02` cursor pattern, removes every create/edit/publication control so A02 ships a
> truthful **read-only** list, replaces the empty state's dead CTA with approved copy, and
> records `FIG-APPROVAL-APP2-D03-CATALOG-LIST-001`. Price and search stay out of A02;
> `APP2-A03` restores create/edit and `APP2-A04` adds publish/unpublish as supplements.
> Registry 70 → 71; OpenAPI, generated client and database unchanged; design and
> documentation only. **`APP2-D03` = `COMPLETE — DELIVERED_FOR_REVIEW`**, so
> **`APP2-A02` = `READY — NOT STARTED`**
> ([`reports/APP2-D03-COMPLETION-REPORT.md`](../reports/APP2-D03-COMPLETION-REPORT.md)).
>
> **`APP2-A02` delivered (2026-07-31).** The read-only Admin Product List ships at
> `/products` inside the authenticated Admin shell: the `Trạng thái`/`Danh mục` filters
> with URL-owned state, the `Tải thêm sản phẩm` cursor continuation, a semantic desktop
> table and a mobile card collection, and the four truthful list states (loading,
> unavailable, unfiltered-empty, filtered-empty). It consumes `adminProduct_list` only —
> create, detail, update and archive are deliberately **not** re-exported from
> `@embroidery/api-client`, so no mutation is reachable before the checkpoint that owns
> it. No price, no search, no action control, and an honest media placeholder pending
> `APP2-T01`. 50 new component tests; production Admin reviewed behind the real gateway at
> 1440 and 390 against 27 real seeded drafts. OpenAPI, generated client, database and
> Figma registry unchanged; no dependency added. **`APP2-A02` =
> `COMPLETE — DELIVERED_FOR_REVIEW`**, so **`APP2-A03` = `READY — NOT STARTED`**
> ([`reports/APP2-A02-COMPLETION-REPORT.md`](../reports/APP2-A02-COMPLETION-REPORT.md)).
>
> **`APP2-A03` blocked, then cured by `APP2-A03-G01` (2026-07-31).** The mandatory A03
> pre-code design/contract audit stopped **before any source file, commit or Figma edit**
> with **`BLOCKED_BY_PRODUCT_FORM_DESIGN_CONTRACT_CONTRADICTION`**. All five approved
> Product Draft nodes were one `Sản phẩm mới` create screen with a single atomic
> `Lưu bản nháp`, while `adminProduct_create` is `.strict()` and accepts only
> `categorySlug`, `name` and `description`: the screen's media selection therefore required
> a second PATCH, `Phiên bản & SKU` had **no field in any B02 operation**, there was **no
> edit/detail design at all**, and `basePriceAmount` had no approved surface.
> **`APP2-A03-G01`** is a narrow entry gate **under A03 ownership** — **`APP2-D04` was not
> created and must not be** — that reconciles the five existing nodes in place into an
> explicit two-mode capability: minimal create at `/products/new` (three POST fields,
> `Tạo bản nháp`, redirect to detail) and edit/detail at `/products/{productId}`
> (`Lưu thay đổi`, `Giá cơ bản`, read-only slug/status, ordered media via PATCH). Variants
> and SKU are removed and deferred as `FU-APP2-PRODUCT-VARIANTS-SKU-01`; the
> publication-readiness rail and `Tới bước xuất bản` are removed (A04/B03); fabricated
> filenames give way to B01/D02 server identity; keyboard media ordering replaces
> drag-only. Five rows promoted under `FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001`,
> registry 71 → 72, IMP-D034 locked. OpenAPI, generated client, database and application
> source unchanged.
> ([`reports/APP2-A03-G01-COMPLETION-REPORT.md`](../reports/APP2-A03-G01-COMPLETION-REPORT.md)).
>
> **⚠️ Superseded in part by `APP2-A03-G01-C1` (2026-07-31).** The promotion described
> above did **not** land in the canonical registry. `APP2-A03-G01` Commit A `5699207`
> replaced the document title with the five promoted rows concatenated onto one line, so
> the canonical rows stayed `REVIEW_REQUIRED` with no approval evidence — and
> `check:figma-design-index` stayed green, because rows written outside a parsed table are
> invisible to every status and evidence rule. **The G01 completion report's claim that
> five rows were promoted was therefore false as committed.** The defect was found by the
> `APP2-A03` pre-code audit, which correctly blocked before any source change.
> `APP2-A03-G01-C1` repairs the title, promotes the five canonical rows in place (node IDs
> unchanged, registry still 72) and hardens the gate with `document-title`, `row-placement`
> and `a03-approval` rules plus a fixture reproducing the committed corruption. The
> historical G01 report is left unedited; this pointer supersedes its registry claim
> ([`reports/APP2-A03-G01-C1-CORRECTION-REPORT.md`](../reports/APP2-A03-G01-C1-CORRECTION-REPORT.md)).
> **`APP2-A03-G01` = `COMPLETE — CORRECTED (C1) — REVIEW_ACCEPTED`**.
>
> **`APP2-A03` delivered against that authority (2026-08-01).** One capability, two modes per
> IMP-D034: create `/products/new` sends exactly the three fields `adminProduct_create`
> accepts in a single POST and redirects to the authoritative `productId`; edit/detail
> `/products/{productId}` loads with `adminProduct_detail` and saves with
> `adminProduct_update`, carrying `expectedUpdatedAt` and only the fields that changed. The
> description diff distinguishes untouched (absent) from cleared (`null`); price is a
> whole-VND string whose `"0"` sentinel renders as an empty field and never as `0 ₫`; slug and
> status are read-only text. Ordered media is a complete `mediaAssetIds` replacement sent only
> when the selection or its order changed, with first = `THUMBNAIL`, keyboard
> `Di chuyển trước/sau` as the primary ordering mechanism, and a cursor-paginated picker over
> `adminAsset_list` restricted to `ACCEPTED` `CATALOG_MEDIA`. `PRODUCT_VERSION_CONFLICT` (409)
> opens the approved reload dialog — no force-save, no retry with the stale token, no
> timestamp or request id in the copy. The A02 list regains exactly `Tạo sản phẩm` and
> `Chỉnh sửa`; publication, archive and delete remain absent and `adminProductArchive` stays
> off the client boundary. Verified live behind the gateway at 1440 and 390 (0px overflow),
> including a real two-tab concurrency conflict. OpenAPI, generated client, database and Figma
> unchanged
> ([`reports/APP2-A03-COMPLETION-REPORT.md`](../reports/APP2-A03-COMPLETION-REPORT.md)).
>
> **`APP2-A03` corrected by `APP2-A03-C1` (2026-08-01).** Review found two blocking defects.
> A03 evidence had recorded a development credential in plaintext: the disclosure lived in a
> superseded revision of the evidence commit, that commit was rewritten so the value is
> withheld, its absence from every reachable ref was proven, the credential was rotated through
> the sanctioned bootstrap path, and the account was reconciled to exactly one authenticating
> credential. A new canonical gate `pnpm check:secrets` now rejects plaintext credential
> disclosure in any tracked document — and tracked `.env`/private-key files — while leaving
> ordinary security prose and explicit redaction writable. Separately, the save classifier
> treated **every** HTTP `409` as a stale-version conflict, so a lifecycle refusal
> (`PRODUCT_NOT_EDITABLE`) or an ineligible image (`PRODUCT_MEDIA_ASSET_UNAVAILABLE`) opened a
> dialog whose reload discards the operator's unsaved edits; only the exact
> `PRODUCT_VERSION_CONFLICT` code opens it now, and every other outcome keeps the edits and
> shows a safe message. No production authentication code, OpenAPI, generated client, database
> or Figma change. **`APP2-A03` = `COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW`**, so
> **`APP2-A03-C2` = `MUST_NOT_BE_CREATED`**
> ([`reports/APP2-A03-C1-CORRECTION-REPORT.md`](../reports/APP2-A03-C1-CORRECTION-REPORT.md)).
>
> **`APP2-B03` blocked at its representability gate, then cured by `APP2-B03-G01` (2026-08-01).**
> The mandatory B03 audit proved the phase requires unpublish while accepted LC-04 authority had
> **no exit from `PUBLISHED` except archive** — four transitions, none of them
> `PUBLISHED → DRAFT`. B03 stopped before any source change
> (`BLOCKED_BY_PRODUCT_UNPUBLISH_LIFECYCLE_CONTRADICTION`, no commit, no file). The entry gate
> `APP2-B03-G01` — under B03's ownership, **not** a phase checkpoint and **not** `APP2-D04` —
> adds the single canonical transition **`TR-LC04-05` `PUBLISHED → DRAFT` (Unpublish Product)**
> under **IMP-D035**: it removes public visibility without archiving or deleting, preserving
> slug, category, name, description, price, ordered media, Assets and derivatives, and returns
> the product to the existing editable `DRAFT` state with no new `UNPUBLISHED` status. Archive
> stays the distinct `PUBLISHED → ARCHIVED`. LC-04 **4 TR → 5 TR**; DB0/DB2/DB3, `07 §3`,
> REQ-CAT-003, the APP2 pre-implementation audit (whose "schema sufficient" verdict confused
> physical representability with lifecycle authority) and this phase plan are reconciled; audit,
> outbox and lifecycle-error vocabulary are locked as authority for B03 to implement. A new gate
> `pnpm check:lifecycle` (10 tests) fails any future document that claims a Product transition
> LC-04 does not define. Documentation and one checker only — no migration, schema, application
> source, OpenAPI, generated-client, Figma or dependency change. **`APP2-B03-G01` =
> `COMPLETE — DELIVERED_FOR_REVIEW`**, so **`APP2-B03` = `READY — NOT STARTED`** and
> **`APP2-A04` = `BLOCKED_BY_APP2-B03`**
> ([`reports/APP2-B03-G01-COMPLETION-REPORT.md`](../reports/APP2-B03-G01-COMPLETION-REPORT.md)).
>
> **`APP2-B03` delivered (2026-08-01).** Three Admin operations —
> `adminProduct_publicationReadiness` (`GET .../publication-readiness`, side-effect-free),
> `adminProduct_publish` (`TR-LC04-01` `DRAFT → PUBLISHED`) and `adminProduct_unpublish`
> (`TR-LC04-05` `PUBLISHED → DRAFT`, IMP-D035). Readiness is a **closed, ordered seven-code
> set** — `PRODUCT_NAME_READY`, `PRODUCT_DESCRIPTION_READY`, `PRODUCT_CATEGORY_READY`,
> `PRODUCT_PRICE_READY`, `PRODUCT_MEDIA_READY`, `PRODUCT_MEDIA_ASSETS_READY`,
> `PRODUCT_MEDIA_DERIVATIVES_READY` — every one source-grounded, with variants, SKU,
> inventory, SEO fields, display order and any media maximum deliberately excluded. Publish
> **never trusts a previous readiness read**: one transaction locks the product root
> `FOR UPDATE`, share-locks the category, media, Assets and derivatives, recomputes the same
> pure evaluator over the locked rows, and only then performs the guarded transition, advancing
> the B02-C1 monotonic `updated_at` token and appending one `product.published` audit row and
> one `product.published` outbox event atomically. Unpublish deletes nothing, never writes
> `archived_at`, and does **not** re-run readiness. No migration, and no schema, Figma, Admin,
> Storefront, worker, object-storage, Nginx, Compose or dependency change. OpenAPI 10 → 13 paths
> and 13 → 16 operations; generated client additions only. **`APP2-B03` =
> `COMPLETE — DELIVERED_FOR_REVIEW`**, so **`APP2-A04` = `READY — NOT STARTED`** and
> **`APP2-B04` = `BLOCKED_BY_APP2-A04`**
> ([`reports/APP2-B03-COMPLETION-REPORT.md`](../reports/APP2-B03-COMPLETION-REPORT.md)).
>
> **`APP2-A04` delivered (2026-08-01).** The Admin publication interaction at the canonical child
> route `/products/[productId]/publication`, consuming exactly the three B03 operations through
> three new hand-written `@embroidery/api-client` exports (archive still withheld). The screen
> reads detail and readiness independently and offers a lifecycle action **only when both agree
> on status and token**, sending `{ expectedUpdatedAt }` from that one coherent snapshot; a mixed
> pair renders a reload prompt instead of a command. Nothing is optimistic. All seven requirement
> codes render in server order from an exhaustive map keyed by the generated enum, with an
> unknown code shown visibly and never counted as satisfied. Refusals are classified by exact
> domain code — only `PRODUCT_VERSION_CONFLICT` opens the approved A03 reload dialog. Unpublish
> is deliberately independent of current readiness and uses a `role="alertdialog"` confirmation
> with no reason field and no archive call. Following the normative handoff `450:404`, which marks
> `/san-pham/<slug>` as `CHƯA CHỐT`, the screen shows the **bare server slug as read-only
> metadata** and constructs no public URL; media stays an honest placeholder. No API, OpenAPI,
> generated-client, worker, Storefront, object-storage, database, Figma, Nginx, Compose or
> dependency change; no Product List publication action. **`APP2-A04` =
> `COMPLETE — DELIVERED_FOR_REVIEW`**, so **`APP2-B04` = `READY — NOT STARTED`** and
> **`APP2-S01` / `APP2-S02` = `BLOCKED_BY_APP2-B04`**
> ([`reports/APP2-A04-COMPLETION-REPORT.md`](../reports/APP2-A04-COMPLETION-REPORT.md)).
>
> **`APP2-A04-C1` delivered (2026-08-01) — `COMPLETE — DELIVERED_FOR_REVIEW`.** A04's browser review ran against the
> dev-mode Admin, so nothing proved production startup, production route serving, asset
> delivery, hard refresh or gateway-to-production behaviour. C1 adds a repeatable isolated
> smoke (`pnpm smoke:app2-publication`): an ephemeral `runner`-stage image becomes the real
> gateway's `admin` upstream — verified by **zero bind mounts**, `NODE_ENV=production` and
> `node apps/admin/server.js` — while `.dockerignore`'s `**/.next` keeps the production build
> inside the image and away from the active dev output, and the service swap is a **temp-dir
> Compose override**, so A04's stated reason for reviewing in dev mode ("would require a
> Compose change this checkpoint may not make") turns out not to hold. Teardown is planned
> from what the run changed, not from whether it passed, so a failed scenario cannot leave the
> developer's Admin swapped; 18 Docker-free regressions run in the ordinary `tools/*.test.mjs`
> aggregation. Desktop scenarios, direct load, hard refresh, assets, console cleanliness and a
> real `PRODUCT_VERSION_CONFLICT` (no code, request id or token in the DOM) all pass; the dev
> stack and mutable Product state were restored exactly (26 DRAFT / 3 ARCHIVED).
>
> **C1 retracts A04's `.next`-collision root cause.** `apps/admin/.next` is *not* bind-mounted
> (the Admin service mounts three `src` directories only) and `.dockerignore` excludes
> `**/.next`; a host production build was run against the live dev stack and every route kept
> answering. The route-wide 404 A04 attributed to that collision is unexplained by it.
>
> **The smoke found a real defect on its first run.** At 390 px
> `a.product-publication__back` was a **16 px** touch target — colour and font-size only, so its
> box was just the line box of its own label — failing the 44 px minimum and WCAG 2.5.8, on a
> criterion A04 had recorded as passing. It is pure CSS and identical in development, so the
> first delivery reported it as a blocker rather than patch outside its stated scope. The
> reviewer ruled it a genuine A04 defect that the requirement covers and extended C1 once to
> repair it.
>
> **Fix:** `display: inline-flex; align-items: center; min-height: styles.$size-touch-target-min`
> — the **existing approved token**, already used by the Admin shell, product list, product
> form, assets screen and staff login. The label, the `<Link>` semantics, the
> `ADMIN_PRODUCTS_ROUTE` destination, the focus treatment and the desktop composition are all
> unchanged. The mobile assertion that missed it measured one screen; it now sweeps **blocked
> DRAFT, ready DRAFT, PUBLISHED and the open confirmation dialog**, measures computed
> `getBoundingClientRect()` geometry and reports selector, accessible name and size on failure.
> Its single exclusion — the off-canvas keyboard skip link — is a **frozen named list, not a
> predicate**, and harness tests assert the publication selectors are absent from it, so the
> assertion cannot later be widened until a real failure disappears.
>
> **`APP2-A04-C1` = `COMPLETE — DELIVERED_FOR_REVIEW`** — final smoke **11/11 harness, 20/20
> browser**, run twice (once after the fix, once after the measurement module was split out
> when the scenario file crossed the 400-line hard limit); 25 Docker-free regressions; Admin
> 519/519 unchanged. **`APP2-A04-C2` = `MUST_NOT_BE_CREATED`**, so **`APP2-B04` = `READY — NOT
> STARTED`**
> ([`reports/APP2-A04-C1-CORRECTION-REPORT.md`](../reports/APP2-A04-C1-CORRECTION-REPORT.md)).
>
> **`FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01` = `ROUTED — NONBLOCKING_FOR_A04`** — `APP2-B02`
> implements archive with `PRODUCT_ARCHIVABLE_STATES = [DRAFT]` while LC-04 defines archive
> only as `PUBLISHED → ARCHIVED`. Discovered by `APP2-B03-G01` and still deliberately unresolved:
> neither B03 nor A04 calls or modifies archive, and A04 owns publish/unpublish only.
>
> **`FU-APP2-PRODUCT-ARCHIVE-UI-01` = `DEFERRED_PENDING_PRODUCT_OWNER_SURFACE_DECISION`** —
> `adminProduct_archive` remains withheld from the `@embroidery/api-client` boundary, so no
> Admin screen can reach it.
>
> **`FU-APP2-PRODUCT-VARIANTS-SKU-01` = `DEFERRED_BEYOND_APP2_CATALOG_ALPHA`** — product
> variants and SKU are not exposed or persisted by the delivered `APP2-B02` contract and are
> **nonblocking** for `A03`/`B03`/`A04`.
>
> **`FU-APP2-CATEGORY-MANAGEMENT-01` = `DEFERRED_BEYOND_CATALOG_ALPHA`** —
> mutable category management (create/rename/reorder/archive, Admin UI and API)
> is deliberately out of APP2 and **nonblocking** for `B02`/`A02`/`A03`.
>
> **`FU-APP2-THUMBNAIL-01` = `ROUTED_TO_APP2-T01`**, `NONBLOCKING_FOR_APP2-B02/A02/A03`.
>
> **SUPERSEDED (2026-08-01) — `APP2-T01` activated before `APP2-B04`.** The mandatory `APP2-B04`
> entry audit returned **`PUBLIC_MEDIA_DELIVERY_GATE = BLOCKED`**: `Q-01` requires an image on
> every public product card and `Q-02` requires ordered media, but **no route in the repository
> served image bytes to anyone** — 16 operations, none public and none binary; `apps/api` never
> called `getObjectStream`; the gateway had no media location; and `admin-product.response.ts`
> already recorded the reason ("APP2 has no authenticated media-delivery contract, so an address
> here would be fabricated"). `ADR-APP2-001` §4.7 *designs* proxied publication-gated delivery,
> but a design paragraph is not a route. `PUBLIC_CATALOG_SCHEMA_GATE` passed — only the transport
> was missing. The Product Owner chose the smallest option: **activate the already-routed
> `APP2-T01` as a mandatory predecessor of `B04`**, so `B04` stays exactly two JSON operations and
> consumes a safe route helper. The earlier T01 wording ("authenticated Admin thumbnail delivery
> and placeholder replacement") named the first visible consumer, not the capability; T01's
> canonical scope is now the **application-owned catalog derivative delivery foundation**, and
> this activation implements only the blocking public lane.
>
> **`FU-APP2-ADMIN-MEDIA-PLACEHOLDER-01` = `DEFERRED — NONBLOCKING_FOR_APP2-B04`** — replacing the
> honest Admin placeholders in `A01`/`A02`/`A03`/`A04` with real images is *not* implemented by
> this activation. The delivered route is anonymous and serves `PUBLISHED` products only, so it
> cannot render a DRAFT product's images in Admin; an Admin lane needs its own authenticated
> contract and its own checkpoint.
>
> **Governance rule (locked here):** a checkpoint may receive **at most one
> correction**; after that, remaining defects become **named blockers** with an
> owner and an activation gate rather than a further correction chain.

## 1. Outcome

Deliver the first full business vertical slice: Admin uploads/processes assets, creates and publishes catalog products, and Storefront server-renders only published products.

## 2. Dependencies

APP1 complete; object-storage and worker adapter choices must be available or selected in this phase through approved ADR/checkpoint.

## 3. Design policy

Audit current homepage/discovery/detail designs and Admin coverage. Public screens may be `REUSE` or `SUPPLEMENT`; Admin asset/catalog screens are likely `NEW/SUPPLEMENT`. Any required design is completed as one APP2 package before frontend coding.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

- Asset upload authorization, metadata, inspection, derivatives, failure/retry visibility.
- Admin product draft creation, editing, list/detail, archive where allowed.
- Product publication/unpublication and validation.
- Public catalog list and product detail.
- SEO metadata, canonical URL, public/private asset access.
- Publication visibility and cache/revalidation behavior.

## 5. Out of scope

- Design template authoring.
- Design Studio.
- Inventory reservation.
- Requests, quotation, payment, order.
- General-purpose DAM beyond product/catalog needs.

## 6. Candidate engineering checkpoints

These are planning slices. Execute and review one at a time. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

- **APP2-C01 — Asset contract:** Define upload-intent/authorization, completion, detail/list, and retry operations; no more than five endpoints.
- **APP2-B01 — Asset intake:** Implement asset metadata and authorized upload flow with signature/MIME/size validation boundaries.
- **APP2-W01 — Asset inspection and derivatives:** Implement one idempotent worker job family with attempt records, bounded retry, terminal failure, and object-storage safety.
- **APP2-A01 — Admin asset library:** Implement asset list/upload/status/retry capability using the real contract.
- **APP2-C02 — Catalog draft contract:** Define product list, detail, create, update, and archive operations as one bounded draft-management slice.
- **APP2-B02 — Catalog draft backend:** Implement product draft commands/queries, ownership, validation, repository tests, and safe errors.
- **APP2-A02 — Admin product list:** Implement list, filters/pagination, loading/empty/error and permission-aware actions.
- **APP2-A03 — Admin product form/detail:** Implement create/edit/detail with asset selection and server conflict handling.
- **APP2-C03 — Publication contract:** Define publish, unpublish, and publication-preview/readiness operations.
- **APP2-B03 — Publication backend:** Implement lifecycle checks, visibility, audit, cache/revalidation consequence and tests. Publication moves `DRAFT → PUBLISHED` (`TR-LC04-01`) and back via unpublish `PUBLISHED → DRAFT` (`TR-LC04-05`); archive (`PUBLISHED → ARCHIVED`) is a separate action and is never the implementation of unpublish.
- **APP2-A04 — Admin publication interaction:** Implement publish readiness, confirmation, errors, status and unpublish behavior.
- **APP2-C04 — Public catalog contract:** Define public list and detail endpoints/read models.
- **APP2-B04 — Public catalog queries:** Implement published-only queries, SEO fields, pagination/filter semantics, and asset access mapping.
- **APP2-S01 — Storefront product list:** Implement server-first public catalog/discovery screen using approved design.
- **APP2-S02 — Storefront product detail:** Implement server-rendered product detail, gallery, metadata and not-found behavior.
- **APP2-E01 — Publication E2E:** Upload asset → process → create draft → publish → public list/detail visible → unpublish → public visibility removed.
- **APP2-X01 — Phase closure:** Close R1 Catalog Alpha and hand off catalog/template compatibility to APP3.

## 6.1 Corrected checkpoint map (APP2-PRE-AUDIT)

The §6 candidate slices are corrected here from repository truth (see the audit
§O). Contract-only `C0x` slices are **merged into their backend checkpoint** —
`IMP-D019` generates OpenAPI from decorated NestJS controllers, so a
contract-only checkpoint that writes no controller cannot produce the committed
artifact. Prerequisites (decisions + design) are added. `NO_APP2_MIGRATION`
(no `APP2-DB01` unless a later spec proves a concrete schema gap). Order is
dependency-correct and acyclic; Admin leads Storefront; worker follows the
decisions; no frontend before `APP2-D01` approval; no backend checkpoint >5
endpoints.

| # | ID | Type | Scope | Predecessors |
|---|---|---|---|---|
| 1 | APP2-PRE-AUDIT | audit | this audit | APP1-X01 |
| 2 | APP2-DEC-STORAGE | decision | object-storage ADR (IMP-O002) | PRE-AUDIT |
| 3 | APP2-DEC-JOBS | decision | job-runtime ADR (IMP-D029/`ADR-APP2-002`): PostgreSQL claim queue on existing persistence, visibility-timeout lease, `NO_APP2_MIGRATION` (IMP-O003) — **`DELIVERED_FOR_REVIEW`** | PRE-AUDIT |
| 3b | APP2-I02 | foundation | Worker job-runtime foundation — poll loop + claim/lease driver, `event_type` handler registry, attempt-recording seam, **`FU-A07`** worker structured logging + out-of-request correlation (`{job_kind}:{job_key}:{attempt_no}` `AsyncLocalStorage` over IMP-D022), SIGTERM/SIGINT graceful shutdown replacing the no-op keep-alive; no asset job family (IMP-D029) — **`COMPLETE — CORRECTED — REVIEW_ACCEPTED`** (corrected by `APP2-I02-C1`: a timed-out handler is no longer abandoned with its lease released, and acceptance uses a real Linux SIGTERM; accepted after `APP2-I02-FD1` proved the uncooperative path across a real Linux process boundary). *Delivered divergence:* the claim/lease driver is a **new** `WorkerJobQueueRepository` rather than an extension of `OutboxEventStore.claimBatch`, because that DB7-era primitive claims `['PENDING','FAILED']` and its `scheduleRetry` writes `FAILED` — both contradict `APP2-DEC-JOBS-C1`, and widening it would have put two contradictory lifecycles in one class. The old store is untouched. | DEC-JOBS |
| 4 | APP2-D01 | design | Admin asset/catalog `NEW` + Storefront list/detail `SUPPLEMENT` (one package) — **`DELIVERED_FOR_PRODUCT_OWNER_REVIEW`**, section `423:3` on page APP_02, 30 `REVIEW_REQUIRED` rows (§6.2) | PRE-AUDIT |
| 4b | APP2-I01 | foundation | Object-storage foundation — `packages/object-storage` (port + S3 adapter over `client-s3`/`lib-storage` **only, no presigner** + key helpers + contract tests), pinned MinIO Compose service + bucket bootstrap, config contract + `.env.example` keys, route-scoped nginx upload support (`client_max_body_size` + `proxy_request_buffering off`), `lib-storage` memory-bound policy (IMP-D028 / C1 / C2) | DEC-STORAGE |
| 4c | APP2-B01-G01 | gate | Asset-intake entry-gate closure (docs/evidence only, under `APP2-B01` ownership) — Product Owner upload policy, two-stage request+content fingerprint, versioned discriminated result union, `claimToken` ownership, expired-reclaim/cleanup ordering, Tx A/Tx B boundaries, three-operation B01 handoff (`ADR-APP2-001` §4.2f) — **`COMPLETE — ENTRY_GATE_CLOSED`**; `STORAGE-BLK-01..03` `RESOLVED_BY_APP2-B01-G01`, `UPLOAD-POLICY-BLK-01` `RESOLVED_BY_PRODUCT_OWNER`; `NO_APP2_MIGRATION` re-confirmed (9/9 disposable checks) | I01, I02 |
| 5 | APP2-B01 | backend | Asset intake API — **exactly three operations** (Admin asset upload / detail / list; the historical "retry" endpoint is dropped): T1 streaming multipart upload with the 25 MiB incremental counter and 5-minute hard duration, pre-stream durable allocation + **request** fingerprint and post-stream **content** fingerprint, versioned `ASSET_UPLOAD_ALLOCATION`/`ASSET_UPLOAD_COMPLETED` result union with strict decoding, `claimToken` rotation on expired reclaim verified inside Tx A and Tx B, ordered reclaim/cleanup-before-replacement, post-object `UPLOADED` insert + guarded `→INSPECTING`, one-transition outbox `append`, route-scoped nginx upload location (27 MiB, `proxy_request_buffering off`, >5-minute timeouts), CW-01…CW-07 tests, + OpenAPI/client. Closes the `ADR-APP2-001` §4.2f-7 repository gaps. **Entry gate `APP2-B01-G01` closed** → **`COMPLETE — REVIEW_ACCEPTED`**. | I01, B01-G01 |
| 5b | APP2-DB01 | database | Catalog derivative schema & lifecycle alignment — adds the `CATALOG_PREVIEW` derivative kind and the first physical half of INV-22 (`ck_asset_derivatives__watermark_by_kind`, CST-126) in migration `0032`; aligns DB3 LC-06 into a catalog lane (derivatives prepared at `PENDING`, generated while the asset is `INSPECTING`, terminal tuple written in one transaction) and an unchanged design/artwork lane; locks the `APP2-W01` job kind to `ASSET_PROCESSING`. 78 tables / 833 columns unchanged; OpenAPI, client and Figma unchanged — **`COMPLETE — DELIVERED_FOR_REVIEW`** | B01 |
| 5c | APP2-I03 | foundation | Wire idempotent private-bucket bootstrap into the API and worker composition roots. `ensurePrivateBuckets` exists in `packages/object-storage` but has **no production caller** — only tests — so nothing creates the buckets in a real deployment and the first real upload/derivative write would fail. No new SDK, no MinIO exposure — **`COMPLETE — DELIVERED_FOR_REVIEW`**: the API awaits the bootstrap before `listen`, the worker gates its poll loop behind an abstract `WORKER_STARTUP_GATE` bound to the same bootstrap, both memoize one attempt per process, and a concurrent two-process race against an empty MinIO yields exactly two private buckets. Also fixed the shipped worker image, which never shipped the object-storage package | I01, B01 |
| 6 | APP2-W01 | worker | Asset inspection/derivatives job family handler + image-processing library decision (uses I02 runtime). Produces exactly `THUMBNAIL` + `CATALOG_PREVIEW`, both unwatermarked, per `APP2-DB01`; `sharp@0.35.3` locked as the image library (worker-only); no migration, no HTTP operation — **`COMPLETE — DELIVERED_FOR_REVIEW`** | B01, I02, DB01, I03 |
| 6b | APP2-D02 | design | Admin Assets continuation & identity reconciliation — cures `APP2-A01`'s `BLOCKED_BY_MISSING_ASSET_LIST_CONTINUATION_DESIGN`: explicit cursor-driven `Tải thêm tài sản`, server-backed identity (media format + size + `createdAt`), original filename transient-local only; seven `FIG-ADMIN-ASSETS-*` rows promoted under `FIG-APPROVAL-APP2-D01-ADMIN-001`; one annotation node added (registry 69 → 70). Design/documentation only — no source, dependency, OpenAPI, client or database change — **`COMPLETE — DELIVERED_FOR_REVIEW`** | D01, B01, W01 |
| 7 | APP2-A01 | frontend | Admin asset library — `/assets` inside the accepted APP1 shell: catalog-media upload with real transferred-byte progress and honest ambiguous cancellation, explicit cursor continuation (`Tải thêm tài sản`, same-cursor retry, no total-count copy), server-backed identity from `mediaType` + `{size} · {createdAt}` (no filename anywhere), and detail-only processing reconciliation on one `3000 ms` constant. Consumes only the three accepted B01 operations; honest thumbnail placeholder (no media-delivery contract exists). No API operation, generated-client, schema, worker or Figma change; no new dependency — **`COMPLETE — DELIVERED_FOR_REVIEW`** ([`reports/APP2-A01-COMPLETION-REPORT.md`](../reports/APP2-A01-COMPLETION-REPORT.md)). Open for the reviewer: the approved Rejected-state action `Xoá khỏi danh sách` has **no backend capability** and is deliberately not implemented | B01, W01, D01, D02 |
| 7b | APP2-B02-G01 | gate | Product-draft required-field entry gate (data/authority only, under `APP2-B02` ownership) — closes `BLOCKED_BY_PRODUCT_DRAFT_FIELD_DECISION` by locking IMP-D032: fixed four-category taxonomy provisioned by data migration `0033` and addressed by `categorySlug` (never a category UUID), server-owned immutable product slug with a `{base}-{8 hex}` collision fallback, `DRAFT` price sentinel `0` VND, draft `display_order = 0`, and first-media `THUMBNAIL` / rest `GALLERY` with `DETAIL` excluded. 32 → 33 migrations; **78 tables / 833 columns / 190 CHECKs and fingerprint `82864268…` unchanged**; no schema, OpenAPI, client, application-source, Figma or dependency change — **`COMPLETE — ENTRY_GATE_CLOSED`** | DB7 catalog schema |
| 8 | APP2-B02 | backend | Catalog draft backend + OpenAPI/client (≤5) — **entry gate `APP2-B02-G01` closed**; exactly five Admin operations (`adminProduct_list/detail/create/update/archive`) implementing IMP-D032 as locked: `categorySlug` on the wire and never a category UUID, server-owned immutable slug, `DRAFT` price sentinel `0` VND rendered as whole đồng, `display_order 0`, first-media `THUMBNAIL` / rest `GALLERY` with `DETAIL` never written, complete all-or-nothing ordered media replacement, and `updated_at` optimistic concurrency compared at the millisecond precision the client token carries. Archive is a guarded `DRAFT → ARCHIVED` that deletes nothing. OpenAPI `e19c2f76…` → `b789cc99…`, client `55de1cc1…` → `66d1c991…` (additions only); **no migration, no schema/Figma/frontend/worker/object-storage change, no dependency** — **`COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW`**; **`APP2-B02-C1`** closed the mutation-guard, monotonic-token and invented-media-limit gaps and proved the asset-eligibility race is serialized ([`reports/APP2-B02-COMPLETION-REPORT.md`](../reports/APP2-B02-COMPLETION-REPORT.md), [`reports/APP2-B02-C1-CORRECTION-REPORT.md`](../reports/APP2-B02-C1-CORRECTION-REPORT.md)) | B01, B02-G01 |
| 8b | APP2-D03 | design | Admin Product List design reconciliation — cures `APP2-A02`'s `BLOCKED_BY_CATALOG_LIST_DESIGN_CONTRADICTION`: adds the `Trạng thái`/`Danh mục` filters and the `Tải thêm sản phẩm` continuation control to the three frozen Catalog nodes, removes every `APP2-A03`/`APP2-A04` control so A02 is a truthful read-only list, replaces the empty state's dead CTA, and corrects the A02/A03 label inversion (IMP-D033). Three `FIG-ADMIN-CATALOG-*` rows promoted under `FIG-APPROVAL-APP2-D03-CATALOG-LIST-001`; one annotation node added (registry 70 → 71). Design/documentation only — no source, dependency, OpenAPI, client or database change — **`COMPLETE — DELIVERED_FOR_REVIEW`** | D01, B02 |
| 9 | APP2-A02 | frontend | Admin product list — read-only list at `/products`, status/category filters, cursor continuation (entry gate `APP2-D03` closed). Consumes `adminProduct_list` only — **`COMPLETE — DELIVERED_FOR_REVIEW`** | B02, D01, D03 |
| 9b | APP2-A03-G01 | design | **Entry gate under `APP2-A03` ownership** (not a phase checkpoint, and **not `APP2-D04`**) — reconciles the five Product Draft nodes with the delivered B02 contract after the mandatory A03 pre-code audit blocked. Splits the capability into minimal create (`/products/new`, three POST fields) and edit/detail (`/products/{productId}`, PATCH), adds `Giá cơ bản` and read-only slug/status, removes `Phiên bản & SKU` and the publication-readiness rail, replaces fabricated filenames with B01/D02 server identity, and adds keyboard media ordering (IMP-D034). Five `FIG-ADMIN-PRODUCT-*` rows promoted under `FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001`; one annotation node added (registry 71 → 72). Design/documentation only. **Corrected by `APP2-A03-G01-C1`** — the promotion was spliced onto the document title instead of the canonical rows, leaving them `REVIEW_REQUIRED` behind a gate blind to rows outside a table; C1 repairs the registry and adds `document-title` / `row-placement` / `a03-approval` invariants — **`COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW`** | A02, B02, D01 |
| 10 | APP2-A03 | frontend | Admin product form/detail — create/edit/detail with Asset selection and server conflict handling (entry gate `APP2-A03-G01` closed, repaired by `APP2-A03-G01-C1`). Delivers IMP-D034's two modes: create `/products/new` (exactly the three POST fields, one request, redirect to the authoritative `productId`) and edit/detail `/products/{productId}` (`adminProduct_detail` + `adminProduct_update`, `expectedUpdatedAt`, only changed fields, description absent-vs-null, whole-VND string price with the `"0"` sentinel, read-only slug/status, ordered `mediaAssetIds` with keyboard reordering and cursor-paginated asset picker, `PRODUCT_VERSION_CONFLICT` reload dialog, unsaved-change protection). Restores exactly `Tạo sản phẩm` and `Chỉnh sửa` on the A02 list. `adminProductArchive` stays off the client boundary — **`COMPLETE — DELIVERED_FOR_REVIEW`** | B02, D01, A03-G01 |
| 11 | APP2-B03 | backend | Publication backend + OpenAPI/client (≤3) — publish is `TR-LC04-01` `DRAFT → PUBLISHED`; **unpublish is `TR-LC04-05` `PUBLISHED → DRAFT`** (IMP-D035, added by the entry gate `APP2-B03-G01`), removing public visibility without archiving or deleting; archive stays the distinct `PUBLISHED → ARCHIVED` | B02, B03-G01 |
| 12 | APP2-A04 | frontend | Admin publication interaction | B03, D01 |
| 12b | APP2-T01 | backend | **Public catalog media delivery foundation** — activated ahead of `B04` on 2026-08-01 to cure `APP2-B04 = BLOCKED_BY_PUBLIC_MEDIA_DELIVERY_CONTRACT_GAP` (IMP-D036). Exactly one anonymous binary operation, `publicProductMedia_get` — `GET /api/public/products/{slug}/media/{productMediaId}/{rendition}` with `thumbnail` → `THUMBNAIL` and `catalog-preview` → `CATALOG_PREVIEW`. Publication, category, attachment, Asset lane and derivative readiness are re-proved in **one bounded query on every request**, and every miss collapses to one safe 404; `product_media.id` is authorised as an **opaque association identity only**. Streams through `getObjectStream` with client-disconnect teardown, `image/webp` + `nosniff` + `inline` (no filename) + **`no-store`** until an invalidation consumer exists. Adds the shared relative route helper `buildPublicProductMediaPath` in `@embroidery/contracts` for `B04`/`S01`/`S02`. OpenAPI 13→14 paths / 16→17 operations, schemas 27 unchanged; **no migration, no Figma, no Admin/Storefront/worker change, no tracked Nginx/Compose change, no dependency** — **`COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW`**. `APP2-T01-C1` supplied the missing production-runtime evidence: the canonical `api.Dockerfile` `runner` image was built and started as the gateway's `api` upstream (`node dist/main.js`, `NODE_ENV=production`, zero bind mounts) against a disposable TLS PostgreSQL, and the media scenarios re-ran through the real gateway — 20/20 orchestration and 22/22 scenarios, twice, with the same 16400/28378 WebP byte counts. It reproduced and fixed a **production-only defect that made the production image unstartable** (pnpm isolated linking: the `runner` stage shipped each runtime workspace package's `dist` without its `node_modules`, so `dist/main.js` died on `Cannot find module '@nestjs/common'`). `APP2-T01-C2` = `MUST_NOT_BE_CREATED` — [`APP2-T01-C1-CORRECTION-REPORT.md`](../reports/APP2-T01-C1-CORRECTION-REPORT.md) | B03, W01, I03 |
| 13 | APP2-B04 | backend | **Public catalog queries** — exactly two anonymous JSON operations, `publicProduct_list` (`GET /api/public/products`) and `publicProduct_detail` (`GET /api/public/products/{slug}`). Visibility is `products.status = PUBLISHED` plus a coherent public Category, reusing the same constants `APP2-T01` applies to media delivery; DRAFT, ARCHIVED, unknown slug and a non-public Category all collapse to one safe 404. Keyset pagination on the canonical Q-01 tuple `(display_order, id)` over **IDX-065**, with the cursor bound to the filter it was issued under — **the pagination authority was reconciled by `APP2-B04-C1`: the Product Owner ruled keyset, `ADR-DB5-001` gained **R10** and the DB5 matrices agree (IMP-D037)**. Media addresses are composed locally and locked to `buildPublicProductMediaPath` by a contract test (IMP-D018); list cards use `thumbnail`, detail uses `catalog-preview` in persisted `display_order`, and an image whose rendition is not servable is omitted rather than advertised. `Cache-Control: no-store` on both, because no cache-invalidation consumer exists. SEO exposes only the columns that physically exist (`seo_title`, `seo_description`, `is_indexable`) and **no canonical browser URL** — `/san-pham/<slug>` stays unresolved for S02. OpenAPI 14→16 paths / 17→19 operations / 27→34 schemas; generated-client additions only; **no migration, no Figma, no Admin/Storefront/worker change, no tracked Nginx/Compose change, no dependency**. `APP2-B04-C1` then closed the two authority defects that blocked review acceptance: the Product Owner ruled **keyset** (IMP-D037), `ADR-DB5-001` gained **R10** and the DB5 documents were reconciled with the prior offset classification kept as dated history; the access path was **measured** on a disposable PostgreSQL 16.14 (`pnpm explain:q01`) rather than asserted — both delivered forms seq-scan and sort at MVP cardinality and are accepted, and **IDX-065 orders the page only from a `category_id`-constant form the contract does not issue**, recorded precisely and routed to DB10. It also corrected the S02 handoff, which B04 had wrongly called ready. New gate `pnpm check:pagination-authority`; no index, migration, application, OpenAPI, generated-client or Figma change. `APP2-B04-C2` = `MUST_NOT_BE_CREATED` — **`COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW`** ([`APP2-B04-C1-CORRECTION-REPORT.md`](../reports/APP2-B04-C1-CORRECTION-REPORT.md)) | B03, T01 |
| 13b | APP2-S01-G01 | gate | **Storefront Discover route authority** — activated on 2026-08-02 to cure `APP2-S01 = BLOCKED_BY_STOREFRONT_DISCOVER_ROUTE_DECISION`, which the first S01 attempt raised at its route gate after changing no file. Documentation, authority-consistency and evidence only. The Product Owner locked the Discover route **`/kham-pha`** (`/` stays Homepage-owned; `/discover`, `/catalog`, `/products`, `/san-pham` rejected, no alias and no redirect), the category query state `?category=<slug>` over the four fixed slugs, the narrow S01 shell/not-found activation, and — explicitly — **staged non-interactive Product cards** for S01, so the unresolved Product Detail route can no longer block the feed. `/san-pham/<slug>` stays `CHƯA CHỐT`/`NOT_CANONICAL` and S02 stays blocked by the UI03 reconciliation (IMP-D038, §6.2.2). New gate `pnpm check:storefront-route-authority`; **no application source, OpenAPI, generated-client, database, Figma, infrastructure or dependency change** — **`COMPLETE — DELIVERED_FOR_REVIEW`** ([`APP2-S01-G01-COMPLETION-REPORT.md`](../reports/APP2-S01-G01-COMPLETION-REPORT.md)) | B04 |
| 14 | APP2-S01 | frontend | Storefront product list — design authority is **UI02 Discover Feed** (`REUSE_AND_SUPPLEMENT_ONLY`): 5-column desktop / 3-column tablet / 2-column mobile masonry with linear DOM reading order (§6.2.1). Route authority is `/kham-pha` with `?category=<slug>` and staged non-interactive cards (IMP-D038, §6.2.2). Delivered server-first: the route segment resolves the category, seeds the first keyset page and renders the products into the HTML, with `force-dynamic` because nothing invalidates a cache here; masonry is CSS multi-column so one list in server order is distributed visually while **DOM reading order stays linear** — measured live in a production browser at 5 / 3 / 2 columns with identical DOM order at every viewport. Consumes `publicProductList` only (`publicProductDetail` stays off the client boundary while the detail route is unresolved); price and the stock flag are dropped at the projection boundary. Continuation is gated on `hasNext` **and** a usable cursor with the in-flight cursor held in a ref — render state alone let three synchronous sentinel callbacks each start the same request. Isolated production evidence: canonical Storefront `runner` image, zero bind mounts, behind the real gateway with a production API and disposable TLS PostgreSQL, 24 synthetic published products against **real** THUMBNAIL bytes, 24/24 orchestration + 43/43 browser scenarios twice, including DRAFT removal (product gone, media 404, no route cache). **No backend, OpenAPI, generated-client, database, Figma, infrastructure or dependency change** — **`COMPLETE — DELIVERED_FOR_REVIEW`** ([`APP2-S01-COMPLETION-REPORT.md`](../reports/APP2-S01-COMPLETION-REPORT.md)) | B04, D01, S01-G01 |
| 14b | APP2-S02-G01 | gate | **Storefront Product Detail reconciliation** — activated on 2026-08-02 to cure `APP2-S02 = BLOCKED_BY_UI03_RECONCILIATION`. Design, authority-consistency and evidence only. All twelve UI03 draft roots audited live and left unmodified as `HISTORICAL_DRAFT_SOURCE`; a new sibling section `529:2224` carries nine reconciled roots plus a scope board. The Product Owner locked the detail route **`/san-pham/[slug]`** (server-owned immutable slug; no UUID, no query-mode route, no trailing-slash authority; `/product/*`, `/products/*`, `/catalog/*`, `/tac-pham/*`, `/kham-pha/*` rejected) and the studio-Work-Detail scope: one description section, browser-local share, Discover continuation, **no price/stock display**, and materials/process/related/save/commission deferred because the delivered contract does not represent them (IMP-D039, §6.2.3). New gate `pnpm check:storefront-product-detail-authority`; **no application source, OpenAPI, generated-client, database, infrastructure or dependency change** — **`COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW`** ([`APP2-S02-G01-COMPLETION-REPORT.md`](../reports/APP2-S02-G01-COMPLETION-REPORT.md); correction [`APP2-S02-G01-C1-COMPLETION-REPORT.md`](../reports/APP2-S02-G01-C1-COMPLETION-REPORT.md) — the delivered gate claimed a readable story measure while the nodes rendered the description full-band; `APP2-S02-G01-C2` = `MUST_NOT_BE_CREATED`) | B04, T01, D01 |
| 15 | APP2-S02 | frontend | Storefront product detail — delivered at **`/san-pham/[slug]`** (IMP-D039) against the reconciled authority `529:2224`. Server-first (`force-dynamic`; name, category, first image and description are in the HTML with JavaScript disabled), consuming **only** `publicProductDetail` through the hand-written boundary; price and the stock flag are dropped at the projection boundary. Ordered `catalog-preview` gallery with contain/natural ratio, roving-tabindex thumbnails, an accessible lightbox (focus trap, Escape, arrow order, textual position), honest empty and per-image error states, exactly one description section at the corrected 640px measure, browser-local Share, and truthful Discover links; the S01 card became one semantic link with masonry, content and DOM order unchanged. Isolated production evidence: canonical Storefront `runner` image, zero bind mounts, real gateway, disposable TLS PostgreSQL, **99/99 browser scenarios + 24/24 orchestration twice**, including one-backend-read-per-request measured from the API access log and durable removal after a DRAFT transition. Two defects found by the production run and fixed (a pre-hydration image failure that never reached `onError`; a Playwright path matcher that had been aborting nothing). Open, disclosed: `FU-APP2-DETAIL-NOT-FOUND-STATUS-01` (Next 16.2.10 answers 200 for `notFound()` from a dynamic segment; surface correct) and `FU-APP2-STOREFRONT-CONTENT-BAND-01` (shell gutter 16px → 358px mobile content). **No backend, OpenAPI, generated-client, database, Figma, infrastructure or dependency change** — **`COMPLETE — DELIVERED_FOR_REVIEW`** ([`APP2-S02-COMPLETION-REPORT.md`](../reports/APP2-S02-COMPLETION-REPORT.md)) | B04, T01, S02-G01 |
| 16 | APP2-E01 | E2E | publication cross-layer journey — **`BLOCKED_BY_APP2-S02`** after `APP2-S01` completed | S01, S02 |
| 17 | APP2-X01 | closure | close R1 Catalog Alpha; APP3 handoff | E01 |

## 6.2 `APP2-D01` design handoff (per consuming checkpoint)

Source of truth: [`FIGMA_DESIGN_INDEX.md`](../../design/FIGMA_DESIGN_INDEX.md) §4.3
(Figma file `BQwqV8GdfUIELvsQDB1UQE`, page **APP_02** `419:3`, section `423:3`).
Cross-cutting behaviour is annotated in `FIG-APP2-ASSET-CATALOG-NOTES` (`450:404`)
and `FIG-APP2-REUSE-MAP` (`451:404`).

> **SUPERSEDED (2026-07-27).** The gate paragraph below was written before the Product
> Owner ruling of 2026-07-26 and is kept for chronology only. It is superseded for
> **A01** by `APP2-D02`: the seven `FIG-ADMIN-ASSETS-*` rows are
> `APPROVED_FOR_IMPLEMENTATION` under **`FIG-APPROVAL-APP2-D01-ADMIN-001`**
> ([`../../design/approvals/APP2-D01-ADMIN-ASSETS-DESIGN-APPROVAL.md`](../../design/approvals/APP2-D01-ADMIN-ASSETS-DESIGN-APPROVAL.md)),
> and Admin Assets design authority is `PRODUCT_OWNER_APPROVED — FROZEN —
> D02_RECONCILED`. It is superseded for **A02** by `APP2-D03`: the three
> `FIG-ADMIN-CATALOG-*` rows are `APPROVED_FOR_IMPLEMENTATION` under
> **`FIG-APPROVAL-APP2-D03-CATALOG-LIST-001`**
> ([`../../design/approvals/APP2-D03-ADMIN-PRODUCT-LIST-DESIGN-APPROVAL.md`](../../design/approvals/APP2-D03-ADMIN-PRODUCT-LIST-DESIGN-APPROVAL.md)),
> and Admin Product List authority is `PRODUCT_OWNER_APPROVED — D03_RECONCILED`. It still
> applies verbatim to **A03–A04**, whose rows remain `REVIEW_REQUIRED` with no approval
> evidence, and to every Storefront row.
>
> **Checkpoint-label correction (`APP2-D03`, 2026-07-31).** The A02/A03 rows in the table
> below previously read A02 → Product Draft and A03 → Catalog, contradicting the canonical
> checkpoint map in §6.1. Canonical ownership is **A02 = Admin Product List**,
> **A03 = Admin Product Form/Detail**, **A04 = Publication Interaction**; the table is
> corrected accordingly and the checkpoint order is unchanged.

**Gate for every row below — `BLOCKED_BY_APP2_D01_PRODUCT_OWNER_APPROVAL`.** Each row
is `REVIEW_REQUIRED`; a frontend checkpoint must block until it is promoted to
`APPROVED_FOR_IMPLEMENTATION` with an approval evidence ID, and must record the
registry IDs it used in its completion report.

| Checkpoint | Registry IDs (states delivered) | Responsive evidence |
|---|---|---|
| **A01** Admin asset library | `FIG-ADMIN-ASSETS-DESKTOP-{DEFAULT,EMPTY,UPLOADING,PROCESSING,REJECTED}`, `FIG-ADMIN-ASSETS-MOBILE-{DEFAULT,UPLOAD}` (all `APPROVED_FOR_IMPLEMENTATION`), plus `FIG-ADMIN-ASSETS-CONTINUATION-IDENTITY` (`484:272`, annotation) and `FIG-APP2-ASSET-CATALOG-NOTES` (`450:404`) | 1440 desktop (5 states) + 390 mobile (2 states); 1024 by annotation. Desktop Default is **1440×1092** since `APP2-D02` so the continuation control is visible, not clipped |
| **A02** Admin product list | `FIG-ADMIN-CATALOG-DESKTOP-{DEFAULT,EMPTY}`, `FIG-ADMIN-CATALOG-MOBILE-DEFAULT` (all `APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP2-D03-CATALOG-LIST-001`), plus `FIG-ADMIN-CATALOG-FILTERS-ACTIONS-HANDOFF` (`498:272`, annotation) | 1440 desktop table + 390 mobile card list; read-only list with `Trạng thái`/`Danh mục` filters and `Tải thêm sản phẩm` |
| **A03** Admin product form/detail | `FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-{DEFAULT,VALIDATION,SAVING}`, `FIG-ADMIN-PRODUCT-DRAFT-MOBILE-DEFAULT`, `FIG-ADMIN-PRODUCT-MEDIA-SELECT-DESKTOP` (all `APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001`), plus `FIG-ADMIN-PRODUCT-FORM-CONTRACT-HANDOFF` (`521:284`, annotation) | 1440 desktop edit/detail (3 states + media dialog) + 390 mobile; minimal create mode specified on the handoff annotation |
| **A04** Admin publication interaction | `FIG-ADMIN-PUBLICATION-DESKTOP-{READY,BLOCKED,CONFIRM-UNPUBLISH}`, `FIG-ADMIN-PUBLICATION-MOBILE` | 1440 desktop (3 states) + 390 mobile |
| **S01** Storefront product list / discover | **UI02 authority** — `FIG-UI02-DISCOVER-{SECTION,DESKTOP,TABLET,MOBILE}` (`208:538`, `208:2002`, `224:871`, `226:1038`) | 5-column / 3-column / 2-column **masonry** from UI02 |
| **S02** Storefront product detail | **Withheld** — `FIG-STOREFRONT-PRODUCT-DETAIL-{DESKTOP,TABLET,MOBILE,MEDIA-STATE}` are `NOT_APPROVED` / `NOT_IMPLEMENTATION_AUTHORITY` | pending UI03 reconciliation |

**Interaction and accessibility obligations (all six):** single `<h1>` per page; DS
`Input` supplement carries `<label for>` + `aria-describedby` help/error wiring;
validation summaries use `role="alert"` and per-field errors; progress/saving use
`role="status"` + `aria-live="polite"`; **upload progress is determinate (%)** while
**inspection progress is indeterminate — never a fabricated percentage**; dialogs use
`role="dialog"`/`alertdialog` with `aria-modal`, focus enter → trap → return, and
Escape/backdrop close; touch targets ≥44px; status is never conveyed by colour alone
(dot + text label); no 390px horizontal overflow.

**Domain semantics carried by the design:** asset states map `UPLOADED` → *Đã tải lên /
Đang chờ xử lý*, `INSPECTING` → *Đang xử lý*, `ACCEPTED` → *Sẵn sàng*, `REJECTED` →
*Không thể sử dụng*; only `ACCEPTED` media is selectable for a product; **Save Draft and
Publish are distinct actions**; drafts are never publicly visible; **unpublish removes
public visibility and is never deletion**; Storefront renders published products only,
using approved derivatives, never a private original.

**Exclusions (must not be implemented from this package):** customer account/auth,
wishlist/cart/checkout/payment, orders/shipping, reviews, inventory reservation,
working search, recommendations, Design Studio/3D, download/export, bulk import,
roles/permissions, analytics/worker dashboards. The reused Storefront shell contains a
search field and later-phase nav items — these stay **inert** in APP2. Unpublished or
missing products reuse the approved APP1-D02 `FIG-STOREFRONT-NOTFOUND`; APP2 adds no
not-found of its own.

### 6.2.1 `APP2-D01-C1` — Storefront discovery authority correction

The Product Owner **approved and froze Admin**, **rejected** the APP2 Storefront Product
List, and **withheld** Product Detail. `APP2-D01-C1` applied that ruling.

- **`APP2-S01` reads UI02 directly.** Primary authority: `FIG-UI02-DISCOVER-*`
  (`208:538` / `208:2002` / `224:871` / `226:1038`). Supporting: UI01 `183:7`,
  `189:266`, `191:412`, plus the approved APP1-D02 shell. Reuse policy
  **`REUSE_AND_SUPPLEMENT_ONLY`** — supplements may add published-only data, product
  title and detail link, approved-derivative image rules, and product-specific
  empty/loading/media-fallback data, but must **preserve UI02's masonry architecture**.
- **Locked invariants:** image-led Pinterest-inspired discovery; masonry **5 columns
  desktop / 3 tablet / 2 mobile**; varying card heights and editorial rhythm; artwork
  dominant with minimal catalog chrome; masonry is presentation only — **DOM reading
  order stays linear**.
- **Forbidden for `APP2-S01`:** equal-height ecommerce card grid; uniform 3-column
  desktop / 2-column tablet / single-column mobile retail cards; generic marketplace
  treatment; redesigning a covered capability because a registry title lacks the words
  "Product List"; treating `DRAFT` content maturity as absence of visual authority.
- **The four rejected card-grid nodes were deleted** (`444:204`, `445:204`, `445:210`,
  `446:223`) and their registry rows removed — there is **no active handoff path** to
  them. See `FIGMA_DESIGN_INDEX.md` §4.3.1 and §4.4.
- **`APP2-S02` is blocked beyond backend.** Its four frames remain in Figma unmodified
  but are `NOT_APPROVED` / `NOT_IMPLEMENTATION_AUTHORITY`. A **separate reconciliation
  checkpoint against UI03** (`261:1290` — `262:1291` / `273:1409` / `279:1504`) is
  required before S02 may be designed or implemented. UI02 is **not** the Product Detail
  authority.

**Open items to resolve before the dependent checkpoint ships:** maximum image bytes,
original retention, non-image source inclusion, uploaded-SVG handling (all four are
deliberately absent from the frames — supported formats are shown with **no numeric size
limit**), and the **public product URL pattern** (`/san-pham/<slug>` is drawn as a
proposal only; only the API path `/api/public/products/{slug}` is locked).

### 6.2.2 `APP2-S01-G01` — Storefront Discover route authority (IMP-D038)

`APP2-S01` blocked at its route gate on 2026-08-02 with
`BLOCKED_BY_STOREFRONT_DISCOVER_ROUTE_DECISION`, changing no file. The block was
correct: the Storefront App Router carried exactly one browser route (`/`, the CP0
Homepage scaffold) plus `/healthz` and the not-found boundary; the shell's `discover`
nav item was deliberately `route: null` ("real routes and `href`s are added by the
phases that own each area"); the approved 404 tagged *Khám phá tác phẩm* **`Sắp ra
mắt`**; and no accepted document, decision-register entry or registry row named a
Discover path. `FIGMA_DESIGN_INDEX.md` §4.4.1 records the four UI02 rows with a
Route/Capability of *Discovery authority (APP2-S01)* — a capability, never a path.
**A Figma label is not a URL contract**, so the route could only come from the
Product Owner. It now has.

The route decision below is **repository and Product Owner authority**. It did not
come from Figma, and it changes nothing in Figma: the UI02 masonry authority
(`208:538`, `208:2002`, `224:871`, `226:1038`, `REUSE_AND_SUPPLEMENT_ONLY`) and the
72/72 registry are untouched.

**Machine-checked route facts** — `pnpm check:storefront-route-authority` compares
this table against the `IMP-D038` register row and the surrounding authority set.

| Fact | Value |
|---|---|
| `APP2-S01 discover route` | `/kham-pha` |
| `Homepage route` | `/` |
| `Category query key` | `category` |
| `Category slugs` | `thu-bong, khan, quan-ao, khac` |
| `S01 product card interaction` | `NON_INTERACTIVE` |
| `Product detail browser route` | `/san-pham/[slug]` |
| `APP2-S02 status` | `READY` |

> **Two facts in this table were resolved by `APP2-S02-G01` (IMP-D039, 2026-08-02).** They
> read `UNRESOLVED` and `BLOCKED_BY_UI03_RECONCILIATION` from `APP2-S01-G01` until this
> gate, because that gate deliberately held the line until the Product Owner supplied a
> detail route. It now has: the route is `/san-pham/[slug]` (§6.2.3). The table is updated
> in place rather than duplicated, so the checker keeps enforcing exactly one live route
> ruling; **the rest of the S01 ruling below is unchanged and still binding** — in
> particular `APP2-S01` cards stay non-interactive, since converting them is `APP2-S02`
> work that has not been done.

**Route.** The APP2 Storefront Discover / Product List route is **`/kham-pha`**, with
no trailing slash. The product is positioned as a Pinterest-inspired creative
embroidery studio rather than a conventional marketplace; the approved primary
navigation label is *Khám phá*; Vietnam is the primary market; and `/` stays
Homepage-owned. `/kham-pha` carries the browsing intent without turning the
experience into a `/san-pham` shop listing. `/`, `/discover`, `/catalog`, `/products`
and `/san-pham` are **rejected** as current Discover paths — this decision approves no
alias and no redirect.

**Category URL state.** `/kham-pha` unfiltered, and `/kham-pha?category=<slug>` for
the four fixed slugs `thu-bong`, `khan`, `quan-ao`, `khac` (rendered *Thú bông*,
*Khăn*, *Quần áo*, *Khác*). "All categories" **omits** the query rather than sending a
sentinel. The query key is exactly `category`. Any unknown or malformed value uses the
approved public not-found policy. Query parsing itself is `APP2-S01` work; this gate
implements no route.

**Shell and not-found ownership.** When `APP2-S01` starts it owns exactly one shell
activation: nav id `discover`, label *Khám phá*, route `/kham-pha`, with active state
and `aria-current` on `/kham-pha`. It may also point the approved not-found recovery
action *Khám phá tác phẩm* at `/kham-pha`, retiring that action's `Sắp ra mắt` tag.
Collections, Studio, Commission, Journal and Search stay unrouted and inert; `/`
remains Homepage-owned.

**Staged Product cards.** For `APP2-S01`, Product cards are explicitly authorized to
be **staged, non-interactive content**: a semantic list item / article carrying a
thumbnail (or an honest placeholder), the Product name and the Category name, with no
`href`, no click handler, no button role, no pointer cursor, no interactive hover
treatment, no *Xem chi tiết* affordance and no link to API JSON. This is a deliberate,
truthful interim state — **not** a missing acceptance item, and not a licence to link
somewhere dead. The registry's permitted-supplement wording (§4.4, "product title and
product-detail link") listed *examples* of permissible supplements; it was never a
mandate to fabricate a route. S01 therefore uses the Product title and withholds the
detail link.

**Product Detail deferral (superseded by §6.2.3).** At the time of `APP2-S01-G01` the
Product Detail browser route was **unresolved** and belonged to the UI03 reconciliation /
`APP2-S02` authority: `/san-pham/<slug>` was `CHƯA CHỐT` / `NOT_CANONICAL` /
`NOT_IMPLEMENTATION_AUTHORITY`, a proposal only, and `APP2-S02` was
`BLOCKED_BY_UI03_RECONCILIATION` against UI03 `261:1290` / `262:1291` / `273:1409` /
`279:1504`. **`APP2-S02-G01` resolved it** — see §6.2.3. The forward-looking clause still
holds: S02 may convert the existing S01 semantic card wrapper into a link **without**
changing the masonry architecture, and until S02 ships that conversion the S01 cards remain
non-interactive.

### 6.2.3 `APP2-S02-G01` — Storefront Product Detail reconciliation (IMP-D039)

`APP2-S02` was blocked by two separate absences, and an implementation checkpoint could
invent neither: there was **no approved design authority** (UI03 was Draft; the four
`APP2-D01` Product Detail frames were `NOT_APPROVED — WITHHELD_PENDING_UI03_RECONCILIATION`)
and **no Product Detail browser route**. This gate supplies both. It changed no application
source, no OpenAPI artifact, no generated client, no database object and no dependency.

**Machine-checked Product Detail facts** — `pnpm check:storefront-product-detail-authority`
compares this table against the `IMP-D039` register row and the surrounding authority set.

| Fact | Value |
|---|---|
| `Product detail route` | `/san-pham/[slug]` |
| `Product detail operation` | `publicProductDetail` |
| `Product detail media rendition` | `catalog-preview` |
| `Description sections` | `1` |
| `Price and stock display` | `HIDDEN` |
| `Deferred scope` | `materials, process, related, save, commission` |
| `Description measure (desktop/tablet)` | `640px` |
| `Description measure (mobile)` | `342px content width` |
| `S01 card link upgrade owner` | `APP2-S02` |
| `APP2-S02 design authority` | `529:2224` |
| `APP2-S02 status` | `READY` |

**The contradiction.** All twelve UI03 draft roots were audited live before any edit. The
draft carries a year, a technique label, dimensions, collection membership, three separate
story fields, materials and techniques, a craft macro taxonomy, a Product-specific four-step
process, eight related works with tabs, a save/favourite action, a soft-commission CTA and a
mobile commission sticky bar. The delivered `publicProductDetail` contract returns `slug`,
`name`, `description?`, `category`, `price`, `isDisplayOutOfStock`, `media[]` and `seo` —
**and nothing else**. There is no related-Product operation anywhere in the API. The
reconciliation therefore removes what the contract cannot feed rather than creating backend
requirements to preserve fictional content.

**Route.** `/san-pham/[slug]`, rendered `/san-pham/<server-owned-product-slug>`. The slug
comes only from `APP2-B04`, is immutable and server-owned; no Product UUID, no query-mode
detail route, no trailing-slash authority. `/product/*`, `/products/*`, `/catalog/*`,
`/tac-pham/*` and `/kham-pha/*` are **rejected** as detail aliases — no alias and no
redirect is approved — and `/kham-pha` remains Discover. This supersedes the old
`CHƯA CHỐT` proposal status.

**Studio Work Detail, not a PDP.** `publicProductDetail` returns `price` and
`isDisplayOutOfStock`; `APP2-S02` displays **no** price, stock, buy-box, cart, rating or SKU.

**One description.** `description` present → exactly one section *Câu chuyện về tác phẩm*;
absent → the section is omitted cleanly. One description is never split into invented
semantic fields, and no copy is generated to fill it.

**Readable measure (`APP2-S02-G01-C1`).** Product description uses a maximum readable
measure of 640px on Desktop and Tablet; Mobile uses its 342px content width. The paragraph
stays aligned to the approved content gutter — Desktop `x = 80`, Tablet `x = 48`, Mobile
`x = 24` — and is never centred as a narrow marketing block. Text wraps naturally and its
frame height follows the rendered copy; no fixed text height is forced. This restates the
original UI03 accessibility authority (board `292:1582`, *Story & Craft*: "cột chữ ≤ 640px
(~75 ký tự)"). The gate as first delivered claimed a readable single-column measure while
the reconciled nodes still rendered the description across the full content band — 1280px
on Desktop and Media Empty, 928px on Tablet — because removing the draft's `StoryMedia`
column let the remaining text `FILL` the row. `APP2-S02-G01-C1` constrains it.

**Continue discovery** replaces the unsupported related feed: *Khám phá tất cả* →
`/kham-pha` and *Khám phá {category.name}* → `/kham-pha?category={category.slug}`. No
related Product cards and no extra list request.

**Share.** One browser-local action — Web Share when available, otherwise copy the canonical
Product URL and announce success. No auth, persistence, SDK or analytics; no favourite/save.

**Media and lightbox.** Ordered `media[]` by persisted `display_order`, catalog-preview
only, never a private original and never a storage-provider URL. `media = []` renders an
honest placeholder with **no** lightbox affordance; an individual failure preserves the
Product text and controls. The contract publishes no dimensions, so the artwork uses a
neutral bounded stage with `contain`/natural-ratio behaviour — universal 3:4 cropping is not
locked and width/height are not fabricated. The lightbox is `role=dialog` with an accessible
title, focus enter/trap/return, Escape to close, previous/next in media order, the selected
position exposed textually, ≥44px controls, immediate transitions under reduced motion, and
no previous/next when there is only one image.

**SEO.** Canonical `/san-pham/{slug}`; `title = seo.title ?? name`;
`description = seo.description ?? description ?? approved generic description`;
`robots.index = seo.isIndexable`, `robots.follow = true`. No invented published date,
author, technique, dimensions, collection, rating, availability schema or price rich-result
schema; Product media is not used as an OG image until a social-image policy exists; and no
Product structured data is promised here. `APP2-S02` must remain dynamic/`no-store` so an
unpublish cannot leave a stale detail page.

**Design authority.** The reconciled section `529:2224` (desktop `529:2225`, tablet
`529:2431`, mobile `529:2575`, media-empty `532:3`, media-error `532:105`, lightboxes
`533:3` / `533:26`, contract handoff `537:3`, state authority `537:38`) is
`APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001`. UI03
`261:1290` / `262:1291` / `273:1409` / `279:1504` become `HISTORICAL_DRAFT_SOURCE` /
`NOT_IMPLEMENTATION_AUTHORITY` and are preserved unmodified, never deleted.

**Follow-ups routed, neither blocking:** `FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01` (B04 publishes
no width/height; S02 uses natural-ratio/contain) and `FU-APP2-STOREFRONT-CONTENT-BAND-01`
(the APP1 shell keeps its 1200px content band although the source frames draw 1280px; the
APP1 shell is not altered by this gate).

### 6.2.4 `APP2-S02-C1` — streamed not-found transport and the mobile band (IMP-D040)

`APP2-S02` was returned `CORRECTION_REQUIRED` because its own report recorded two unmet
acceptance criteria. Both are settled here. This correction changed no application contract:
the route, the API boundary, the gallery, the lightbox, share, the S01 card link and the
request-scoped loader are exactly as delivered.

**Machine-checked correction facts** — `pnpm check:storefront-product-detail-authority`
compares this table against the `IMP-D040` register row and the surrounding authority set.

| Fact | Value |
|---|---|
| `Product detail mobile gutter` | `24px` |
| `Product detail mobile content width` | `342px` |
| `Streamed not-found classification` | `SAFE_STREAMED_NOT_FOUND` |
| `Streamed not-found measured status` | `200` |
| `Streamed not-found noindex` | `REQUIRED` |
| `Streamed not-found product canonical` | `FORBIDDEN` |
| `Streamed not-found duplicate lookup` | `FORBIDDEN` |
| `Exact 404 transport follow-up` | `ROUTED — FRAMEWORK_TRACKING — NONBLOCKING_AFTER_C1` |

**Mobile content band.** At 390 the Product Detail content sits in a **342px** band with a
**24px** gutter on each side, as the approved frame `529:2575` locks. The APP1 shell's own
mobile gutter is **16px**, which had left the page 358px wide. The shell is **not** widened —
it also owns the Homepage, Discover and every other route, and moving it to satisfy one
screen's authority would be the wrong trade — so Product Detail applies a feature-local 8px
inset below the shell's own 768px threshold. Tablet and desktop keep the shell's band
untouched and the story keeps its 640px maximum. The lightbox is unaffected: its scrim is
viewport-owned. Measured live at 390: gutters 24/24, content 342, story 342, media stage 342,
thumbnail viewport 342, zero document overflow.

**`SAFE_STREAMED_NOT_FOUND`.** A data-driven `notFound()` on this streamed route answers
**HTTP 200** with a `noindex` signal. That is the framework's transport, not a choice made
here, and it is **not** called a 404 anywhere in this repository. It is accepted only while
every safety condition holds, each measured per case in the production run: the approved
surface renders; `noindex` is present; no Product canonical, title, description, JSON or
hidden Product data is emitted; unknown, `DRAFT`, `ARCHIVED` and non-public-category stay
indistinguishable; no raw cause appears; nothing is stored durably; a new request
re-evaluates visibility; and the old media path still returns a **real** HTTP 404 after
unpublish. A malformed slug takes the same surface with no Product API call.

**No fabricated 404.** A proxy, middleware or custom-server preflight could force the status,
and each would duplicate the Product-detail read, add a second authorization path or bypass
the request-scoped loader. None is approved. Exact transport stays
`FU-APP2-DETAIL-NOT-FOUND-STATUS-01` = `ROUTED — FRAMEWORK_TRACKING — NONBLOCKING_AFTER_C1`.

**Shell ownership.** `FU-APP1-SHELL-BRAND-TOUCH-TARGET-01` =
`ROUTED — NONBLOCKING_FOR_APP2-S02` records the shell brand link that misses 44px; the
off-canvas skip link is a keyboard affordance and is outside the touch-target measurement.
Every control owned by `.product-detail` meets 44px.

## 7. Critical end-to-end journey

Admin staff uploads a valid product image, sees processing complete, creates a product draft, publishes it, verifies it on Storefront HTML and UI, unpublishes it, and verifies public access is removed. Invalid/private assets never become public.

## 8. Exit gate

- Asset and catalog APIs documented in OpenAPI/client.
- Worker failure and retry are observable.
- Draft content is never public.
- Storefront is SSR/SEO-valid.
- E2E passes with real persistence/object-storage test adapters.

## 9. Handoff

APP3 receives published products, validated assets, and publication/read-model patterns for templates and studio bootstrapping.
