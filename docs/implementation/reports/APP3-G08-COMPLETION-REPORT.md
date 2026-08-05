# `APP3-G08` — Design Session upload architecture and authorization staging authority

**Status:** `COMPLETE — REVIEW_DELIVERED`
**Branch:** `production`
**Entry HEAD:** `0aed5cf3fd6bfae1f7ac2a428ef3efc1df5ab7fb`
**Commit A:** `8fdbf2b`
**Decision:** `IMP-D048` — `LOCKED`

---

## 1. What this checkpoint answers

`APP3-B06` stopped at `BLOCKED — ENTRY_ARCHITECTURE_PRESUPPOSITION_ABSENT`
having written nothing and committed nothing. The stop is accepted as a correct
refusal rather than an implementation failure: the prompt described an upload
lane built from parts this repository does not have, and the alternative to
stopping was to invent a public anonymous upload surface and call it a reuse.

`APP3-G08` supplies the missing authority as `IMP-D048`, nine locked rulings,
and implements nothing.

---

## 2. The measured cause

Every fact below was recomputed from the repository, not restated from the B06
report.

| Fact | Value | Evidence |
|---|---|---|
| Server upload-intent operation | `NONE` | `admin-asset.controller.ts` publishes three operations: `upload`, `detail`, `list` |
| Upload-completion proof operation | `NONE` | no completion route exists in any controller |
| `ObjectStoragePort` presign method | `NONE` | port header: "there is **no** presign operation" |
| `ObjectStoragePort` method count | `6` | `putObjectStream`, `getObjectStream`, `headObject`, `deleteObject`, `listObjectsByPrefix`, `ensurePrivateBuckets` |
| Delivered APP2 upload architecture | `API_OWNED_MULTIPART_STREAMING` | `asset-intake.service.ts` + busboy parser |
| Delivered durable steps | `TX_A_UPLOADED_THEN_TX_B_INSPECTING` | `upload-transactions.service.ts` |
| Admin "upload intent" | `BROWSER_STATE_MACHINE_ONLY` | `apps/admin/src/features/assets/model/upload-intent.ts` — one file, one idempotency key |
| Session cookie verifier in API | `NONE` | `__Host-nettheu_ds_` appears in docs only; no occurrence in `apps/api/src` |
| `DesignModule` in `AppModule` | `ABSENT` | `app.module.ts` imports eleven modules; design is not among them |
| Session association writer result | `VOID` | `attachAsset(id, assetId): Promise<void>` — a bare insert |
| Session asset lane | `CUSTOMER_UPLOAD + CUSTOMER_PRIVATE` | `assets.ts:57,67`, both under existing CHECKs |
| Session asset lane migration | `NONE` | both values already admitted |
| Session bootstrap owner | `APP3-B07` | phase checkpoint table row 21 |
| Normalization required asset status | `ACCEPTED` | `association-resolution.service.ts:54` |
| Normalization verdict while `INSPECTING` | `TERMINAL_NON_RETRYABLE` | `normalization-outcome.ts` — "A terminal, non-retryable outcome carried as data" |

### 2.1 Why presign was rejected

The three missing upload facts are one fact seen three times, and the reason is
recorded in the port itself:

> there is **no** presign operation — APP2 has no browser-credential or
> stable-public-URL flow (ADR §4.7/§4.8), so exposing one would create a
> delivery path that bypasses the publication check

`packages/object-storage/**` is read-only to this phase and `check-app3-b02.mjs`
already fails the build on the token `presign` in the delivery path. So the
intent operation had no upload target to return, the completion operation had no
provider proof to verify, and the two non-empty JSON bodies the plan required
could exist only if the bytes travelled out of band — which is the presign lane
again. Adding it would have reopened a locked security decision to save a
checkpoint's work.

---

## 3. The rulings

`IMP-D048`, `LOCKED`, nine rulings. Summarised; the register row is authority.

- **PO-01 — API-owned streaming.** One multipart operation receives the bytes,
  streams them to private storage and commits. No browser direct-to-storage
  upload, presigned URL, upload-intent/completion pair, browser upload token or
  `ObjectStoragePort` change.
- **PO-02 — B06 replanned, not failed.** `REPLANNED — REPLACED_BY_APP3-B06A_AND_APP3-B06B`;
  the first attempt survives as historical evidence. Order `B06A → B06B`, never
  combined.
- **PO-03 — B06A owns authorization only.** Cookie extraction and name
  derivation, `HMAC-SHA-256` under the runtime pepper, constant-time comparison,
  `ACTIVE`/expiry checks, one non-enumerating failure, cookie clearing, `Origin`
  and `Sec-Fetch-Site`, credentialed cross-origin refusal, `IMP-D043` PO-07 rate
  limits, the expected-revision guard, the `DesignModule` seam. It uploads no
  bytes, creates no Asset and appends no event.
- **PO-04 — B06B boundary.** `POST /api/public/design-sessions/:sessionId/assets`,
  `multipart/form-data`, `paths 19 → 20`, `operations 23 → 24`; schema count
  measured at delivery, never pre-invented.
- **PO-05 — media and limits.** JPEG/PNG/WebP only; SVG, GIF, animated,
  multi-page, unknown and `application/octet-stream` rejected; 10 MiB enforced by
  the APP2 streaming counter; never buffered, never resized into compliance;
  lane `CUSTOMER_UPLOAD` + `CUSTOMER_PRIVATE`, no migration.
- **PO-06 — transaction staging.** Authorize, validate, allocate/claim, stream
  and verify **outside** the transaction; revision CAS, claim verification, Asset
  transition, association, inspection event, normalization event and one revision
  advance **inside** it. No object-storage network call inside the transaction.
- **PO-07 — exact event.** `asset.normalization.requested`, `schemaVersion 1`,
  `normalizationPolicyVersion 1`, `associationRef.kind = DESIGN_SESSION_ASSET`,
  `designSessionAssetId` = the committed association PK. No profile, ownership,
  storage key, secret, URL, customer identity or bytes. No association scan.
- **PO-08 — ordering routed to `APP3-W01C`.** See §4.
- **PO-09 — association identity.** Insert-or-confirm on
  `uq_design_session_assets__session_asset`, returning `designSessionAssetId`,
  idempotent, refusing a foreign Session, never a bare `void` for producer use.
  No migration.

---

## 4. The two findings that changed the plan

### 4.1 Bootstrap is not reassigned

The directive offered `APP3-B06A` as a bounded home for one Session bootstrap
operation, **conditional on no accepted checkpoint already owning it**. One does:
phase checkpoint table row 21, `APP3-B07` — "session bootstrap (blank + clone)
and resume", two operations, owner of the `__Host-nettheu_ds_<session-id>`
cookie.

Taking the offered assignment would have produced two issuers of the same
credential in one phase. B06A therefore owns the reusable *verifier* and nothing
that mints a secret, and `APP3-B06B` carries an explicit runtime dependency on
`APP3-B07`. The gate recomputes this from the checkpoint table rather than
trusting the ruling's prose.

### 4.2 Inspection/normalization ordering is not provable — and the failure is silent

`APP3-B06` asked whether inspection is guaranteed to complete before
normalization is claimable. Measured against the accepted worker, **neither**
admissible mechanism holds:

- **Mechanism A is false.** B06B would commit both events in one transaction, so
  they become visible together. Nothing orders the two claims, and created-at
  order is not a concurrency guarantee.
- **Mechanism B is false.** `AssociationResolutionService` requires
  `REQUIRED_ASSET_STATUS = 'ACCEPTED'` and raises
  `NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE` for anything else — a
  `NormalizationRejection`, which the use case *records and completes*. The
  source comment is explicit that an Asset still `INSPECTING` is "a stale
  context, not something to wait for".

So a session upload that lost the race would end with no normalized derivative,
no retry and no error surfaced to anyone. This never appeared in `APP3-B01N`
because a Product Side background associates an Asset whose inspection finished
long before; association and inspection are far apart there and simultaneous
here.

`IMP-D048` PO-08 routes **`APP3-W01C`** ahead of `APP3-B06B`: a not-yet-inspected
Asset under a `DESIGN_SESSION_ASSET` reference becomes retryable and converges
under the existing lease, backoff and dead-letter policy, while `REJECTED`,
deleted and missing Assets stay terminal. No polling, cron, second event family
or blind normalization is admissible as a substitute. The gate asserts the
premise against the real worker, so if `REQUIRED_ASSET_STATUS` ever changes the
ruling must be re-derived rather than quietly kept.

---

## 5. Dependency map

| Checkpoint | Status after `APP3-G08` |
|---|---|
| `APP3-G08` | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-B06` first attempt | `BLOCKED — ENTRY_ARCHITECTURE_PRESUPPOSITION_ABSENT` |
| `APP3-B06` disposition | `REPLANNED — REPLACED_BY_APP3-B06A_AND_APP3-B06B` |
| `APP3-B06A` | `BLOCKED_BY_APP3-G08_REVIEW_ACCEPTANCE` |
| `APP3-W01C` | `BLOCKED_BY_APP3-G08_REVIEW_ACCEPTANCE` |
| `APP3-B06B` | `BLOCKED_BY_APP3-B06A_APP3-W01C_AND_APP3-B07` |
| `APP3-B07` | `READY — NOT STARTED` |
| `APP3-B03` | `READY — NOT STARTED` |
| `APP3-S06` | `BLOCKED_BY_APP3-B06B_AND_APP3-D01` |

`APP3-B06A` and `APP3-W01C` become `READY — NOT STARTED` on acceptance; they are
independent, and `APP3-W01C` is the smaller change.

---

## 6. Changed files

Commit A, 13 files.

**Documentation (8):** `14-IMPLEMENTATION-DECISION-REGISTER.md` (`IMP-D048`),
`phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md` (§6.22 with fact and dependency
tables, checkpoint-table replan marker, status block),
`10-MASTER-APPLICATION-ROADMAP.md`, `11-TRACEABILITY-AND-STATUS-MATRIX.md`,
`13-PHASE-SOURCE-MAP.md`, `SCOPED_COMMAND_INDEX.md`,
`09-SECURITY-AND-ABUSE-PREVENTION.md` (§4 streaming-upload authority),
`10-NON-FUNCTIONAL-REQUIREMENTS.md` (§4 converge-don't-strand rule).

**Tooling (3 new):** `tools/check-app3-g08.mjs` (331 lines),
`tools/check-app3-g08-architecture.mjs` (204), `tools/check-app3-g08.test.mjs`
(582). Split on responsibility — "has the architecture moved" versus "has it been
recorded" — after the single file measured 504 lines against the 450 soft cap.

**Tooling (2 modified, disclosed):** `tools/check-app3-p03.mjs`,
`tools/check-app3-p03.test.mjs`. See §8.

Zero application, package, schema, migration, OpenAPI, generated-client,
dependency, lockfile, infrastructure or Figma change. Root scripts remain 30.

---

## 7. Validation

| Command | Result |
|---|---|
| `node tools/check-app3-g08.mjs` | PASS |
| `node --test tools/check-app3-g08.test.mjs` | 56/56 |
| `node tools/check-app3-p03.mjs` | PASS |
| `node --test tools/check-app3-p03.test.mjs` | 52/52 |
| `node tools/check-app3-g03.mjs` | PASS |
| `node tools/check-app3-g06.mjs` | PASS |
| `node tools/check-app3-w01a.mjs` | PASS |
| `node tools/check-app3-w01b.mjs` | PASS |
| `pnpm --filter @embroidery/api exec tsc --noEmit` | PASS |
| `pnpm --filter @embroidery/api build` | PASS |
| `pnpm format:check` | PASS |
| `pnpm lint` | PASS (24/24) |
| `git diff --check` | clean |

`pnpm quality` was not run. No API, worker, integration, E2E, OpenAPI-generation
or client-generation command was run — none is justified by a documentation and
tooling change.

---

## 8. Disclosed deviations

**`P03_GATE_MADE_REPLAN_AWARE_ON_G08`.** §16 allows `tools/check-app3-g08*.mjs`
only, and two P03 tooling files were edited:

- `check-app3-p03.mjs` asserted `APP3-B06 = READY` once P03 was delivered, which
  §6's mandated replan contradicts. The check now accepts either READY **or** the
  replan with both successors recorded. Its actual intent — that P03 must not
  leave B06 blocked on *this* follow-up — is unchanged and still enforced.
- `check-app3-p03.test.mjs` pinned the literal `APP3-P03 = COMPLETE — REVIEW_DELIVERED`
  in two fixtures, which §2's mandated `REVIEW_ACCEPTED` invalidated.

Both edits follow the precedent `PREDECESSOR_GATES_MADE_MODE_AWARE_ON_P03`. The
alternative was to leave two accepted gates red.

**`STALE_DUPLICATE_B07_B08_STATUS_LINES_REMOVED`.** The phase status block
carried `APP3-B07`/`APP3-B08` twice with contradictory values —
`READY_BY_P01_AND_P02 — NOT STARTED` and `BLOCKED_BY_APP3-P02`, the latter stale
since P02 completed. Because `APP3-B06B` now depends on `APP3-B07`, an ambiguous
B07 status would have made the new dependency unreadable. The stale duplicates
were removed and the surviving lines left untouched. `APP3-B04`'s blocker was
retargeted from `APP3-B06` to `APP3-B06B` for the same reason.

---

## 9. Command ledger

Condensed. Fingerprint = HEAD + `git diff --name-only` + the files each command
reads.

| # | Command | Fingerprint | Result | Decision derived |
|---|---|---|---|---|
| L1 | `git branch` / `rev-parse` / `status --short` | `0aed5cf`, clean | `production`, clean | entry recorded |
| L2 | five predecessor gates | `0aed5cf`, clean | all PASS | entry accepted |
| L3 | `tsc --noEmit`, `build`, `openapi:check`, `check:generated` | `0aed5cf`, clean | PASS; 19/23/45 | baseline recorded |
| L4–L9 | audit reads (asset module, storage port, asset enums, session schema/repo, `app.module.ts`, presign sweep) | `0aed5cf`, clean | see §2 | architecture cause established |
| L10 | register + checkpoint-table read | `0aed5cf`, clean | `IMP-D048` free; B07 owns bootstrap | bootstrap **not** reassigned |
| L11–L13 | normalization worker reads, `W01C` availability | `0aed5cf`, clean | terminal verdict; `W01C` free | ordering routed to `APP3-W01C` |
| L14–L15 | document/gate structure reads | `0aed5cf`, clean | templates | authoring shape fixed |
| L16 | `node tools/check-app3-g08.mjs` | docs + gate written | 4 failures | four targeted fixes |
| L17 | P03 readiness-assertion read | as L16 | line 215 | replan-aware edit |
| L18 | `node tools/check-app3-g08.mjs` | after fixes + split | PASS | rerun condition **C** |
| L19 | `node --test check-app3-g08.test.mjs` | as L18 | 53/56 | three fixture bugs, mine |
| L20 | failure-detail reads | as L19 | prefix match; unformatted JSON | targeted fixes |
| L21 | batch: g08 tests, six gates, line counts | after fixes | 56/56; all PASS | rerun condition **C** |
| L22 | P03 test failure detail | as L21 | stale fixture strings | targeted fix |
| L23 | batch: p03 tests, tsc, build, format, lint, diff, status | after fix | all PASS except format | rerun condition **C** |
| L24 | `prettier --write` + `format:check` + g08 gate | after formatting | PASS | rerun condition **C** |

### 9.1 Reused results and skipped duplicates

`REUSED_RESULT_FROM = L1, L2, L3` — the §17 preflight is **the same command set
on the same fingerprint** as the `APP3-B06` attempt in this session: HEAD
`0aed5cf`, clean tree, no file changed between. Under §1.3 it was skipped
entirely rather than re-run, saving five gate invocations plus a typecheck and a
build.

`REUSED_RESULT_FROM = L4–L9` — the §4 architecture audit reuses the B06 audit of
the same files at the same fingerprint; only the four gaps B06 did not cover
(L10–L13) were newly read.

Skipped duplicate attempts: no rerun of preflight after it passed; no rerun of
`tsc` or `build` beyond one final invocation each; no rerun of any gate on an
unchanged fingerprint; no API, worker or integration suite run at all.

Every rerun in the ledger is condition **C** — a targeted fix was made and the
command is the narrowest one proving it. No long command was run twice
consecutively on unchanged relevant files, and every returned result was consumed
and recorded before the next command was issued.

---

## 10. Status

```text
APP3-G08 = COMPLETE — REVIEW_DELIVERED
IMP-D048 = LOCKED
APP3-B06 = REPLANNED — REPLACED_BY_APP3-B06A_AND_APP3-B06B
APP3-B06A = BLOCKED_BY_APP3-G08_REVIEW_ACCEPTANCE
APP3-W01C = BLOCKED_BY_APP3-G08_REVIEW_ACCEPTANCE
APP3-B06B = BLOCKED_BY_APP3-B06A_APP3-W01C_AND_APP3-B07
FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = COMPLETE — CLOSED_BY_APP3-P03
FU-PLATFORM-ZOD-DTO-OPENAPI-PARAMETERS-01 = OPEN — NONBLOCKING_EXISTING_SURFACE_CLEANUP
APP3 = IN PROGRESS — SESSION_UPLOAD_ARCHITECTURE_REPLANNED_FOR_REVIEW
```

Human review owns `APP3-G08 = COMPLETE — REVIEW_ACCEPTED`.

Working tree clean. Nothing pushed.
