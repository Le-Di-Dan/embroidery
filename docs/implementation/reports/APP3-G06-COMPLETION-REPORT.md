# APP3-G06 — Completion Report

**Checkpoint:** `APP3-G06` — Normalization dispatch and raster/SVG staging authority
**Date:** 2026-08-04
**Branch:** `production`
**Entry HEAD:** `8f49c29` (`docs(app3): record APP3-B01 correction evidence`)
**Commit A:** `aa5ff2016165171b50fee3f50acae009659dacf9`
**Directive:** CLAUDE MANUAL INTERVENTION DIRECTIVE — APP3-G06

---

## 1. Accepted entry

```text
APP3-G01/G02/G03/G04 = COMPLETE — REVIEW_ACCEPTED
APP3-DB01 = COMPLETE — REVIEW_ACCEPTED
APP3-F01 = COMPLETE — REVIEW_ACCEPTED
APP3-P01 = COMPLETE — REVIEW_ACCEPTED
APP3-G05/G05-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-P02/P02-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-B01/B01-C1 = COMPLETE — REVIEW_ACCEPTED
```

Branch `production`, clean tree at entry, `check-app3-g04`, `check-app3-db01` and
`check-app3-b01` PASS, worker typecheck and build PASS, `format:check` and `lint`
PASS. `IMP-D041`…`IMP-D045`, `ADR-APP0-001`, `ADR-APP2-001` and `ADR-DB1-012` are
preserved and unmodified. `asset.inspection.requested` keeps owning original Asset
inspection and the APP2 `THUMBNAIL` / `CATALOG_PREVIEW` outputs.

## 2. The clean `APP3-W01` stop

```text
APP3-W01 = FAILED — MANUAL INTERVENTION REQUIRED
PRIMARY_CAUSE   = JOB_CONTRACT_INSUFFICIENT
SECONDARY_CAUSE = SVG_SANITIZER_NOT_SELECTED
```

No implementation was written, no file changed, no commit was created, the tree
stayed clean and nothing was pushed. `APP3-G06` does **not** resume it.

## 3. Measured cause, recomputed

| Measurement | Finding | Evidence |
|---|---|---|
| Asset job event vocabulary | one type only | `asset.inspection.requested` |
| Its payload | `{ schemaVersion, assetId }`, unknown fields terminal | `asset-inspection.payload.ts` |
| Where it is appended | inside the upload transaction, `UPLOADED → INSPECTING` | `upload-transactions.service.ts:119` |
| Whole outbox vocabulary | 3 types | `asset.inspection.requested`, `product.published`/`unpublished`, `order.created` |
| `product_sides.background_asset_id` at that moment | cannot exist | `APP3-B01` refuses any Asset not already `ACCEPTED` — which that job produces |
| `design_template_assets` writer | none reachable | repository exists; `DesignModule` **not** composed into `AppModule` |
| `design_session_assets` writer | none reachable | same |
| Outbox event appended by either design repository | none | no `outbox` reference in either |
| SVG sanitizer / ADR / contract | none anywhere | `dompurify`, `svgo`, `sanitize-svg`, `xmldom` absent; `jsdom` hits are the Jest frontend env (IMP-D024) |

So the processing profile was underivable at the only moment the worker ran, and
Template SVG had no approved sanitizer. Both stop conditions were real.

**What was *not* blocked**, measured at the same time: the three association
tables all exist with stable opaque primary keys
(`pk_product_sides`, `pk_design_template_assets`, `pk_design_session_assets`), so
`associationRef` is representable and the §4 stop condition on association
identity did **not** fire.

## 4. The architecture premise, verified

The `§22` stop condition did not fire either:

- `outbox_events.event_type` is `text('event_type').notNull()` with **no CHECK**
  — the only CHECK on the table is `ck_outbox_events__status_allowed`;
- the worker resolves handlers from `JobHandlerRegistry`, a map keyed on event
  type, whose claim filter is exactly the registered types;
- `ASSET_PROCESSING` is already a member of the closed `BACKGROUND_JOB_KINDS`
  set.

A new event type therefore needs **no migration, no new table, no new job kind,
no queue and no scheduler** — only a handler registration and a producer append.
The gate asserts the CHECK-free premise, because if a later change closed that
set the ruling would be describing a database that no longer exists.

## 5. `IMP-D046` — twelve rulings

Verified free before allocation (the register ran to `IMP-D045`), now present
exactly once and `LOCKED`.

| Ruling | Locked content |
|---|---|
| PO-01 | one new event `asset.normalization.requested`, existing Outbox/dispatcher/claim/retry/dead-letter and `ASSET_PROCESSING`; no second queue, scheduler, sweep, claim table, retry framework or cron reconciler; `asset.inspection.requested` unchanged |
| PO-02 | schema version 1; `assetId` + `normalizationPolicyVersion = 1` + `associationRef`; never a profile, ownership claim, storage key, URL, session secret, customer id or raw SVG |
| PO-03 | the worker re-reads association and Asset at claim time and maps exactly; a discriminator is a lookup key, not authorization; no MIME-only derivation; no association scan |
| PO-04 | append in the association transaction, ordered write → append → commit; no event on a read, a no-op, a removal without replacement, or an upload; the old Asset's derivative survives |
| PO-05 | `APP3-B01N` (Product Side, zero HTTP), `APP3-B03` (Template), `APP3-B06` (Session); no endpoint exists merely to enqueue |
| PO-06 | `APP3-W01` replanned into raster-only `APP3-W01A` and Template-SVG `APP3-W01B`; never marked complete |
| PO-07 | `APP3-G07` owns sanitizer selection and its deterministic contract; SVG stays authorized and operationally unavailable; no Sharp rasterization, regex sanitization, browser-DOM sanitizer or extension-based reinterpretation |
| PO-08 | identity = `assetId` + policy version + `NORMALIZED`; one authoritative row; no profile or association id on `asset_derivatives` |
| PO-09 | stale association → bounded non-retryable `NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE`, no derivative, no owner data |
| PO-10 | order `W01A → B01N → G07 → W01B`, never combined |
| PO-11 | `APP3-B02 = BLOCKED_BY_APP3-W01A_AND_APP3-B01N`; B06 is not the SIDE_BACKGROUND trigger owner; `FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01` stays open |
| PO-12 | `FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01` stays open; `createZodDto` not repaired here |

### Event payload

```text
schemaVersion              1
assetId                    the Asset to normalize
normalizationPolicyVersion 1
associationRef             PRODUCT_SIDE_BACKGROUND { productSideId }
                         | DESIGN_TEMPLATE_ASSET  { designTemplateAssetId }
                         | DESIGN_SESSION_ASSET   { designSessionAssetId }
```

### Association → profile

```text
PRODUCT_SIDE_BACKGROUND → SIDE_BACKGROUND
DESIGN_TEMPLATE_ASSET   → TEMPLATE_ASSET
DESIGN_SESSION_ASSET    → SESSION_UPLOAD
```

The event states which committed association triggered work. It does not assert
that the association is still valid — that is PO-03's proof and PO-09's failure
mode.

## 6. Raster-first rationale

`APP3-W01A` is deliverable **today**: raster processing needs only Sharp (already
a worker dependency at `0.35.3`), the ruled event, and the disposable harness —
the event can be inserted directly, so the consumer can be built and accepted
before any producer exists. Template SVG needs a sanitizer nobody has chosen, and
choosing one inside a worker checkpoint would make a security decision as a side
effect of an implementation task. Splitting the two lets the safe half ship
without the unsafe half being rushed, and keeps `IMP-D044`'s SVG authorization
intact rather than quietly deleting it.

## 7. Gate

| File | Lines |
|---|---|
| `tools/check-app3-g06.mjs` | 363 |
| `tools/check-app3-g06-events.mjs` | 237 |
| `tools/check-app3-g06.test.mjs` | 529 |

The checker recomputes 27 machine-checked facts and 13 dependency rows from the
phase plan, verifies `IMP-D046` is present once, `LOCKED` and carries all twelve
rulings, and chains `check-app3-b01` (and through it P02 → G05 → P01 → F01/DB01 →
G04 → G03 → G02 → G01).

Its distinguishing checks are **negations**, because every convenient shortcut
would make `APP3-W01A` easier to start and would undo the reason G06 exists:

- a second queue, sweep, scheduler, claim table, retry framework or cron
  reconciler named without a refusal;
- a second `asset.*.requested` event authorized alongside the one;
- a payload carrying `processingProfile`, an ownership claim, a storage key, a
  session secret or a customer id;
- the discriminator described as authorization, or a worker permitted to scan
  associations and pick one;
- a persisted profile column or a new derivative enum value;
- a sanitizer package selected before `APP3-G07`;
- SVG removed from scope rather than staged;
- B01N gaining an HTTP operation, or B02 still blocked by B06;
- the platform Zod/OpenAPI follow-up closed here;
- **any** implementation: the checker walks `apps/api/src` and `apps/worker/src`
  and fails if either mentions `asset.normalization.requested` or
  `NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE`.

**43 gate regressions**, all passing, including the three that would otherwise be
vacuous: the two application trees are copied into the throwaway root so the
no-implementation walk has something real to fail on.

Two checks were tightened while writing the tests, both because the first form
would have passed a mutated document: the association-scan check now requires the
**refusal** (`never scans …`) rather than accepting the bare phrase a proposal
would also contain, and the B01N zero-HTTP check uses `[\s\S]` because the
sentence contains `product_sides.background_asset_id` and a period-excluding
class stops at the dot in a column name.

## 8. Documentation

| File | Change |
|---|---|
| `14-IMPLEMENTATION-DECISION-REGISTER.md` | `IMP-D046`, LOCKED |
| `phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md` | §6.16 (facts, twelve rulings, dependency table) and the status block |
| `10-MASTER-APPLICATION-ROADMAP.md` | APP3 row: the stop, the replan, the new blockers |
| `11-TRACEABILITY-AND-STATUS-MATRIX.md` | APP3 row records association-bound normalization |
| `13-PHASE-SOURCE-MAP.md` | IMP-D046 added to APP3 authority |
| `audits/APP3_PRE_IMPLEMENTATION_AUDIT.md` | forward note: the W01 row is superseded |
| `09-SECURITY-AND-ABUSE-PREVENTION.md` | SVG implementation status; association-bound normalization |
| `10-NON-FUNCTIONAL-REQUIREMENTS.md` | association-bound, idempotent normalization |
| `SCOPED_COMMAND_INDEX.md` | `CMD-CHECK-APP3-G06`, `CMD-TEST-APP3-G06` |

Two stale planning tokens that now contradicted accepted status were removed from
the phase status block: a leftover `APP3-B01 = READY — NOT STARTED` (B01 is
accepted) and `APP3-B04 = BLOCKED_BY_APP3-B06` (PO-11 removes B06 from that
role). No historical W01, B01, G04 or APP2 report was rewritten.

## 9. Status

```text
APP3-G06 = COMPLETE — REVIEW_DELIVERED
IMP-D046 = LOCKED
APP3-W01 FIRST_ATTEMPT = FAILED — MANUAL_INTERVENTION_REQUIRED
APP3-W01 = REPLANNED — REPLACED_BY_APP3-W01A_AND_APP3-W01B
APP3-W01A = BLOCKED_BY_APP3-G06_REVIEW_ACCEPTANCE
APP3-B01N = BLOCKED_BY_APP3-W01A
APP3-G07 = BLOCKED_BY_APP3-G06_REVIEW_ACCEPTANCE
APP3-W01B = BLOCKED_BY_APP3-W01A_AND_APP3-G07
APP3-B02 = BLOCKED_BY_APP3-W01A_AND_APP3-B01N
APP3-B03 = BLOCKED_BY_APP3-W01A_AND_PLATFORM_ZOD_OPENAPI_FOLLOW_UP
APP3-B06 = BLOCKED_BY_APP3-W01A_AND_PLATFORM_ZOD_OPENAPI_FOLLOW_UP
FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 = OPEN — FINAL_OWNER_APP3-B02
FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 BLOCKED_BY = APP3-W01A_AND_APP3-B01N
FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN — BLOCKS_NEXT_SCHEMA_BACKED_HTTP_CHECKPOINT
APP3 = IN PROGRESS — NORMALIZATION_DISPATCH_AUTHORITY_DELIVERED_FOR_REVIEW
```

On human acceptance `APP3-W01A` and `APP3-G07` become `READY — NOT STARTED`;
the execution recommendation is `APP3-W01A` first.

Human review owns:

```text
APP3-G06 = COMPLETE — REVIEW_ACCEPTED
```

## 10. Scoped validation

```text
node tools/check-app3-g06.mjs                → PASS (27 facts, 13 dependency rows)
node --test tools/check-app3-g06.test.mjs    → 43/43
node tools/check-app3-g04.mjs                → PASS
node tools/check-app3-db01.mjs               → PASS
node tools/check-app3-b01.mjs                → PASS
pnpm --filter @embroidery/worker typecheck   → PASS
pnpm --filter @embroidery/worker build       → PASS
pnpm format:check                            → PASS
pnpm lint                                    → PASS (23 tasks)
git diff --check                             → clean
```

Worker typecheck and build are in scope precisely because this gate asserts that
**no** worker implementation occurred: they confirm the clean accepted starting
point `APP3-W01A` will begin from. `pnpm quality` was not run, and no API, worker,
database, root, E2E, OpenAPI, client, Figma, benchmark or regression command was
run. Nothing was backgrounded.

## 11. What did not change

- **No application code.** No `apps/api/**`, `apps/worker/**`, `apps/admin/**`,
  `apps/storefront/**` or `packages/**` file was modified; all were read-only
  evidence.
- **No database schema, no migration**, no OpenAPI artifact, no generated client.
- **No dependency**: `package.json` files and `pnpm-lock.yaml` untouched, and no
  sanitizer was selected. Root scripts remain **30**.
- No Figma, `docs/design/**`, `spikes/**` or `infrastructure/**` change.
- `IMP-D041`…`IMP-D045` and the named ADRs are unmodified, and `IMP-D044`'s SVG
  authorization is intact — staged, not deleted.

The working tree is clean and nothing has been pushed; `origin/production`
remains at `8b5f3b0`. No `APP3-W01A`, `APP3-B01N`, `APP3-G07`, `APP3-W01B`,
`APP3-B02`, `APP3-B03` or `APP3-B06` work was started.
