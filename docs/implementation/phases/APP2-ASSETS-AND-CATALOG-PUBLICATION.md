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
> `APP2-B01` (map now **18 checkpoints**, §6.1).
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
> **`FU-APP2-CATEGORY-MANAGEMENT-01` = `DEFERRED_BEYOND_CATALOG_ALPHA`** —
> mutable category management (create/rename/reorder/archive, Admin UI and API)
> is deliberately out of APP2 and **nonblocking** for `B02`/`A02`/`A03`.
>
> **`FU-APP2-THUMBNAIL-01` = `ROUTED_TO_APP2-T01`**, `NONBLOCKING_FOR_APP2-B02/A02/A03`.
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
- **APP2-B03 — Publication backend:** Implement lifecycle checks, visibility, audit, cache/revalidation consequence and tests.
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
| 8 | APP2-B02 | backend | Catalog draft backend + OpenAPI/client (≤5) — **entry gate `APP2-B02-G01` closed**, canonical five-operation scope unchanged | B01, B02-G01 |
| 9 | APP2-A02 | frontend | Admin product list | B02, D01 |
| 10 | APP2-A03 | frontend | Admin product form/detail | B02, D01 |
| 11 | APP2-B03 | backend | Publication backend + OpenAPI/client (≤3) | B02 |
| 12 | APP2-A04 | frontend | Admin publication interaction | B03, D01 |
| 13 | APP2-B04 | backend | Public catalog queries + OpenAPI/client (≤2) | B03 |
| 14 | APP2-S01 | frontend | Storefront product list | B04, D01 |
| 15 | APP2-S02 | frontend | Storefront product detail | B04, D01 |
| 16 | APP2-E01 | E2E | publication cross-layer journey | S01, S02 |
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
> D02_RECONCILED`. It still applies verbatim to **A02–A04**, whose rows remain
> `REVIEW_REQUIRED` with no approval evidence, and to every Storefront row.

**Gate for every row below — `BLOCKED_BY_APP2_D01_PRODUCT_OWNER_APPROVAL`.** Each row
is `REVIEW_REQUIRED`; a frontend checkpoint must block until it is promoted to
`APPROVED_FOR_IMPLEMENTATION` with an approval evidence ID, and must record the
registry IDs it used in its completion report.

| Checkpoint | Registry IDs (states delivered) | Responsive evidence |
|---|---|---|
| **A01** Admin asset library | `FIG-ADMIN-ASSETS-DESKTOP-{DEFAULT,EMPTY,UPLOADING,PROCESSING,REJECTED}`, `FIG-ADMIN-ASSETS-MOBILE-{DEFAULT,UPLOAD}` (all `APPROVED_FOR_IMPLEMENTATION`), plus `FIG-ADMIN-ASSETS-CONTINUATION-IDENTITY` (`484:272`, annotation) and `FIG-APP2-ASSET-CATALOG-NOTES` (`450:404`) | 1440 desktop (5 states) + 390 mobile (2 states); 1024 by annotation. Desktop Default is **1440×1092** since `APP2-D02` so the continuation control is visible, not clipped |
| **A02** Admin product form/detail | `FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-{DEFAULT,VALIDATION,SAVING}`, `FIG-ADMIN-PRODUCT-DRAFT-MOBILE-DEFAULT`, `FIG-ADMIN-PRODUCT-MEDIA-SELECT-DESKTOP` | 1440 desktop (3 states + dialog) + 390 mobile |
| **A03** Admin product list | `FIG-ADMIN-CATALOG-DESKTOP-{DEFAULT,EMPTY}`, `FIG-ADMIN-CATALOG-MOBILE-DEFAULT` | 1440 desktop table + 390 mobile card list |
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
