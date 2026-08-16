# APP5-B04 — Admin Request Queue & Detail — Completion Report

**Date:** 2026-08-16\
**Checkpoint:** `APP5-B04` — Admin request queue & detail (2 Admin read endpoints)\
**Phase:** APP5 — Custom Requests and Customer-Owned Products

---

## Verdict

```text
APP5-B04 = COMPLETE
```

No blocker. The two Admin read operations are delivered, focused evidence
passes, the generated artifacts are fresh with exactly two added operations, and
no migration, worker or Figma change was made.

---

## A. Baseline

| Item | Value |
|---|---|
| Branch | `production` |
| Entry HEAD | `bd3b20d` — *feat(app5): read one request through its secure grant* (`APP5-B03`) |
| Prior APP5 endpoint surface | 4 operations — `publicCustomRequest_submit`, `publicCustomRequestAsset_upload`, `publicCustomRequestAsset_status`, `publicCustomRequest_status` |
| Published document at entry | **52 paths / 57 operations / 115 schemas** |
| Accepted predecessors | `R00`, `G01`, `D01` (PO-approved), `B01`, `DB01`, `B02`, `B03` |

Design authority consulted, not redrawn: `FIGMA_DESIGN_INDEX.md` §4.11 rows
`FIG-APP5-A01-QUEUE-DESKTOP-DEFAULT` (`662:3`), `-LOADING` (`662:112`),
`-EMPTY` (`662:182`), `-FILTEREMPTY` (`662:243`), `-ERROR` (`662:306`),
`-NARROW-1280` (`663:9`), and `FIG-APP5-A02-DETAIL-DESKTOP-CATALOG` (`665:3`),
`-COP` (`665:115`), `-NARROW-1280` (`672:3`) — all
`APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP5-D01-PO-001`. B04 is a
**backend** checkpoint, so the `CLAUDE.md` §3 Figma gate for *frontend UI*
checkpoints does not apply and no Figma file was opened, read live or modified.
The queue/detail rows above are the registry authority `APP5-A01` and `APP5-A02`
will build against; this checkpoint only had to keep the read model sufficient
for them.

---

## B. Endpoints

```text
GET /api/admin/custom-requests              — adminCustomRequest_list
GET /api/admin/custom-requests/{requestId}  — adminCustomRequest_detail
```

Two, and no third. Moderation notes and the transition history are returned
**inside** the detail rather than as separate collections (§3): they are evidence
read with the request, not resources addressed on their own, and publishing
`/notes` now would fix a URL `APP5-B05` must write to before it knows what
appending one looks like.

`AdminCustomRequestController` is one class, so the two operations derive their
ids from the default `<domain>_<method>` policy. No `CONTROLLER_DOMAIN_KEYS`
entry was needed and none was added.

---

## C. Admin authorization

| Concern | Reused path |
|---|---|
| Guard | `apps/api/src/modules/identity/presentation/guards/authenticated-admin.guard.ts` — the exact guard `GET /api/staff/me`, the Admin catalogue, template, and customer-support routes use |
| Composition | `IdentityModule` imported by `CustomRequestAdminModule`, exactly as `CustomerAdminSupportModule` composes it |
| Actor context | APP0-B04 actor context; the request log records `actor.kind=ADMIN` with the guard-derived id (visible in the integration run output) |
| Correlation | APP0-B02 request context, unchanged; the platform `X-Request-ID` parameter is the only header parameter on either operation |

No new auth mechanism, no role model invented (APP1-B01 is a binary
authenticated-admin gate), and **no `adminId` is accepted** — the contract spec
asserts neither `adminId` nor `actorId` exists as a parameter. Unauthenticated
and unknown-token callers are refused 401 by the real guard in the integration
suite; no guard was overridden anywhere.

---

## D. Queue contract

**Row fields** — `requestId`, `code`, `status`, `subjectKind`, `subjectSummary`,
`customerId`, `customerDisplayName`, `submittedAt`, `totalQuantity`. Plus the
page members `nextCursor`, `hasNext`, and `appliedStatuses`.

`appliedStatuses` echoes the statuses actually used, so the screen can state what
it is triaging instead of implying the queue is the whole table.

**Filters (§6)**

| Filter | Semantics |
|---|---|
| `status` | Repeatable; any of the ten canonical LC-11 states |
| `subjectKind` | `CATALOG` / `CUSTOMER_OWNED`, decided by `product_id` presence — the XOR as the row expresses it |
| `code` | **Exact**, uppercased, whole-value match on `uq_custom_requests__code`. A partial code is a 400, not a prefix scan |
| `submittedFrom` / `submittedTo` | Inclusive range on `created_at`; an inverted range is a 400 |
| `contactKind` + `contact` | **Exact** normalized contact → one customer id, through Customer's existing capability. Both halves or neither |

**Status default.** With no `status` the page carries the pre-quotation triage
set `NEW`, `UNDER_REVIEW`, `NEEDS_CLARIFICATION` — the states APP5 owns a
transition into or out of. A specifically requested canonical status is honoured
truthfully, `QUOTED` included: the queue reports the stored value and offers no
action in any of them. No APP6 mutation semantics are exposed.

**Pagination and ordering (§7).** The repository-wide keyset model, reused
unchanged: `buildPage`, `decodeCursor`, `resolveLimit` from
`@embroidery/persistence` (default 20, max 100). Ordering is
`created_at DESC, id DESC` — the unique tie-breaker DB5 requires — and the
predicate matches `ix_custom_requests__status_created_id`. A malformed cursor is
a 400, never a silent restart. No APP5-only pagination was invented.

**Search semantics (§8).** The request code is a display/search field and never
an authorization input. Customer search reuses APP4's exact-lookup capability
through the new port: the canonical `normalizeEmail` / `normalizePhone` are
called, not reimplemented, and the match is whole-value on the
`(kind, normalized_value)` verified-and-current uniqueness arbiter. There is no
partial, prefix, fuzzy or multi-result form, and nothing about this behaviour is
exposed publicly. A contact matching nobody returns an **empty page**, not a 404
— a 404 would make the endpoint answer whether a contact exists.

**No N+1.** A page costs four batched statements — product labels, COP names,
quantity totals (summed in the database), customer names — whatever the page
size.

---

## E. Detail contract

| Section | Fields |
|---|---|
| Root | `requestId`, `code`, `status`, `submittedAt`, `updatedAt`, `customerNote`, `internalReason`, `customerVisibleReason` |
| Customer | `customerId`, `displayName`, `verifiedAt`, `contacts[]` — masked, current only, primary first |
| Subject — CATALOG | `productId`, `productVariantId`, `productName`, `productSlug`, `variantColorName`, `variantSizeLabel`, `designSessionId` |
| Subject — CUSTOMER_OWNED | `name`, `description`, `physicalWidthMm`, `physicalHeightMm` |
| Quantities | `quantities[]` (`productVariantId`, `sizeLabel`, `quantity`) + `totalQuantity` |
| Assets | `assetId`, `role`, `linkedAt`, `mimeType`, `sizeBytes`, `status` |
| Transitions | `sequence`, `fromStatus`, `toStatus`, `actorKind`, `actorAdminId`, `actorCustomerId`, `internalReason`, `customerVisibleReason`, `occurredAt` |
| Moderation notes | `sequence`, `kind`, `note`, `adminId`, `createdAt` |

Subject discrimination is a truthful `oneOf` with a `kind` discriminator and **no
shared base**, so a consumer cannot read a catalog field off a customer-owned
subject.

`designSessionId` is `G01-D09` server-written provenance, published to an
authenticated operator as the approved detail frame shows it. `design_sessions`
records that the raw session id is never an authorization input on its own, and
`session_secret_hash` is not selected by any statement behind this response.

Transition history is ordered by TBL-042's append sequence (IDX-100), not by
timestamp — two moves in one transaction can share an instant. **Creation writes
no transition row** (`G01-D05`), so an unmoderated request has a genuinely empty
history and no synthetic entry is added. Moderation notes are read-only and
ordered by the same append sequence.

No `availableActions` (§11): `APP5-B05` owns lifecycle enforcement, and a
transition table computed in a read DTO would be a second authority that could
disagree with the guard that actually runs. No `sortValue`-free APP6 field —
quotation, price, design version, payment, order, production — appears anywhere.

---

## F. Reason-field separation (§10)

Two names, on every type, at every layer:

```text
custom_request_transitions.reason                    → internalReason
custom_request_transitions.customer_visible_reason   → customerVisibleReason
custom_requests.cancelled_reason                     → internalReason        (CANCELLED)
custom_requests.cancelled_customer_reason            → customerVisibleReason (CANCELLED)
```

`selectCurrentReasons` is a pure function whose result type has two separately
named members; the transition projection writes them field by field; both
response schemas declare both and neither declares a merged `reason`. The
contract spec asserts the absence of a merged field on the root **and** on each
history entry, and the unit and integration suites both prove an internal reason
recorded without a customer-facing one leaves `customerVisibleReason` absent
rather than filled from the internal text.

Both are scoped to the latest move **into the current status**, so an earlier
clarification message cannot resurface as the explanation of a later rejection.
On `CANCELLED` the request row's own columns win, with the transition as the
fallback.

---

## G. Read architecture

| Concern | Owner | Seam |
|---|---|---|
| Request root, quantities, COP, asset links, transitions, notes | Ordering (AGG-13, TBL-037…042) | `CUSTOM_REQUEST_ADMIN_REPOSITORY` — a **third**, read-only contract beside the write repository and B03's customer projection |
| Product / variant labels | Catalog | `CATALOG_SUBJECT_PORT` — existing port, one batch method added (`findProductLabels`) |
| Customer name, masked contacts, exact contact resolution | Customer | `ADMIN_CUSTOMER_SUMMARY_PORT` — **new** port, implemented by a read-only Drizzle adapter inside Customer |
| Attachment metadata | Asset | `ASSET_REPOSITORY.findScopedByIds` — the existing non-locking batch read, in the `CUSTOMER_UPLOAD` / `CUSTOMER_PRIVATE` scope |

No foreign context's tables are joined from Ordering. The new Customer port
exists rather than reusing the already-exported `CUSTOMER_REPOSITORY` because
`ContactPoint` carries `normalizedValue` and `displayValue` — the real address
and phone number — and masking inside Customer is what makes the raw value
unrepresentable in Ordering rather than merely unmapped.

`CustomRequestAdminModule` imports `IdentityModule`, `CatalogModule`,
`CustomerModule`, `AssetModule` and `DatabaseModule`. It does **not** import
`OrderModule`: that module holds the AGG-13 write repository, and importing it
would hand a read surface a `transition()` it must never call.

---

## H. Focused evidence

### Unit / schema (Docker-free)

`admin-request.projection.spec.ts` — 15 tests. Subject discrimination on both
branches, the unnamed-catalog case, the triage default and de-duplication, the
truthful explicit status, the reason split in four shapes, and the
latest-move-into-the-current-status selector including the empty history.

`admin-custom-request.request.spec.ts` — 9 tests. Single-versus-repeated status
normalization, refused non-canonical status, uppercased whole code, refused
partial code, the paired contact filter, the inverted range, limit coercion and
bounds, and a refused unknown parameter.

`admin-custom-request.contract.spec.ts` — 10 tests, building the real OpenAPI
document in process before the generation slot is spent. Exactly two `GET`
operations with the expected ids; **no mutation route anywhere beneath
`/api/admin/custom-requests`**; nine query parameters and no body, with no
`adminId`; the full LC-11 enum on the status filter; the exact queue row property
list; a truthful `oneOf` discriminator with a provenance field on the catalog
branch only; two distinct reason fields on the root and each transition; asset
metadata with no locator; and no credential or storage vocabulary in any owned
schema.

### PostgreSQL / HTTP integration — queue (22 tests)

Real HTTP, real guard, disposable database with every migration.

| Requirement (§15.2) | Result |
|---|---|
| 1. Authenticated Admin reads the queue | PASS |
| 2. Unauthenticated / unknown-token refused | PASS — 401 from the real guard, twice |
| 3. Default ordering deterministic | PASS — three rows sharing one `created_at` return in identical `id DESC` order across two reads |
| 4. Status filter | PASS — triage default, explicit `QUOTED`, repeated `status` |
| 5. Subject-kind filter | PASS — both branches |
| 6. Request-code search | PASS — exact, case-insensitive; partial refused 400 |
| 7. Time range | PASS |
| 8. Customer/contact search | PASS — by email, by phone, normalized input, unmatched → empty page, half-filter → 400 |
| 9. Page 1 → page 2 without duplicate or skip | PASS — five rows at one identical instant, `limit=2`, three pages, 5 distinct ids and no loss |
| 10. Catalog and COP summaries truthful | PASS — including `totalQuantity` 20 / 3 / 0 |
| 11. No grant, storage or session secret | PASS — marker, raw contacts, `token`, `storage` all absent; `Cache-Control: no-store` |

### PostgreSQL / HTTP integration — detail (15 tests)

| Requirement (§15.3) | Result |
|---|---|
| 1. Catalog request detail | PASS — product, variant, labels, provenance |
| 2. COP request detail | PASS — name, description, both dimensions as strings |
| 3. Quantity correct | PASS — lines and total, both branches |
| 4. Request asset metadata correct | PASS — role, mime, `sizeBytes` as a decimal string, state; no `storageKey`, `checksum` or `url` key |
| 5. Transition history ordered and complete | PASS — two moves, ascending sequence, actor and both reasons |
| 6. Moderation notes read-only and ordered | PASS |
| 7. Internal and customer-visible reasons distinct | PASS — including the internal-only case and the CANCELLED column preference |
| 8. No fake creation transition | PASS — empty history on a `NEW` request |
| 9. Unknown request | PASS — 404; malformed id 400 |
| 10. No mutation side effect | PASS — two reads leave `status`, `updated_at`, the transition count (0) and the note count (0) unchanged |

### B03 privacy cross-check (§15.4)

One assertion, inside B04's own contract spec: `CustomRequestStatusResponse`
still carries `customerVisibleReason` and carries **none** of `internalReason`,
`moderationNotes`, `transitions`, `customerNote`, `designSessionId`. The B03
suite itself was **not** rerun.

---

## I. Privacy / credential proof

| Claim | How it is proved |
|---|---|
| No grant token or digest | The fixture seeds `token_hash = digest-app5-b04-secret-marker-…`; both suites assert the marker appears nowhere in the serialized response, and the contract spec forbids `tokenHash`/`tokenDigest` in any owned schema |
| No session secret | `design_sessions.session_secret_hash` is not selected by any statement; only the session **id** is published, which `design_sessions` records is never an authorization input on its own |
| No storage key or path | The fixture writes `storage_key = private/app5-b04-secret-marker/…`; the same marker assertion covers it, and `AdminRequestAssetResponse` has exactly six properties, none of them a locator |
| No correlation id | The fixture writes `correlation_id = corr-app5-b04-secret-marker-…`; the transition SELECT does not name the column and the response omits it |
| No raw or normalized contact | Contacts are masked inside Customer by `maskContact`; both suites assert the raw email and phone strings are absent, and the detail suite asserts the exact `APP4-P01` masks |
| Internal ≠ customer-visible | See §F |
| No caching | Both routes send `Cache-Control: no-store` |

---

## J. Validation ledger

| Command | Impact reason | Result | Reruns |
|---|---|---|---:|
| `pnpm --filter @embroidery/api typecheck` | New module, ports, adapters, controller and schemas in the API workspace | **PASS** | 1 (after the specs were added) |
| `pnpm --filter @embroidery/api test -- --testPathPatterns "admin-request.projection\|admin-custom-request"` | The three Docker-free B04 suites — projection, filter schema, published contract | **PASS** — 3 suites / 34 tests | 1 (after Prettier) |
| `pnpm --filter @embroidery/api test -- --testPathPatterns "admin-request-queue.integration\|admin-request-detail.integration"` | The two live-database suites for the endpoints this checkpoint adds | **PASS** — 2 suites / 37 tests | 1 (after Prettier) |
| `pnpm --filter @embroidery/api openapi:generate` | Two new operations changed the published contract | **PASS** — 54 paths / 59 operations / 126 schemas | 0 |
| `pnpm --filter @embroidery/api openapi:check` | Freshness of the committed artifact | **PASS** — up to date | 0 |
| `pnpm --filter @embroidery/api-client generate` | The client must carry the two new operations | **PASS** — 2 files, tree hash `141399d4…` | 0 |
| `pnpm --filter @embroidery/api-client check:generated` | Generated-client drift gate | **PASS** — up to date | 0 |
| `pnpm --filter @embroidery/api-client typecheck` | The regenerated client must compile | **PASS** | 0 |
| `npx eslint <changed API files>` | Lint scoped to the files this checkpoint touched | **PASS** — no findings | 0 |
| `npx prettier --write <changed files>` then `--check` | Formatting hygiene on changed files only | **PASS** | 0 |

**Not run, deliberately.** Full Jest; the full API integration suite; the `B01`
submission and race suites; the `B02` upload, quota and cleanup suites; the `B03`
status suite; `DB01` suites; worker tests; Playwright/E2E; Admin and Storefront
tests; full database regression; APP3/APP4 historical gates; SonarQube; and any
all-workspace build or typecheck. `tools/check-app3-p03.mjs`,
`tools/check-app4-b05.mjs` and `tools/check-app4-b06-contract.mjs` were **not**
run and **not** repaired — their frozen surface counts are known stale, and B04
adds two operations, which would fail them for a reason that is not a defect.

Per `VALIDATION_GOVERNANCE.md` §4 a closed checkpoint is not rerun merely because
a later one exists; B04 touched none of their owned inputs beyond the operation
count those three gates freeze.

---

## K. OpenAPI / client

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| Paths | 52 | 54 | +2 |
| Operations | 57 | 59 | **+2** |
| Schemas | 115 | 126 | +11 |

Generation run **once**, after the route and schema freeze. Operation-id diff
over the committed artifact:

```text
+ adminCustomRequest_detail
+ adminCustomRequest_list
```

Nothing else changed: no accepted operation was deleted, renamed or reissued.
The eleven new components are the two queue classes, the detail response, the
customer and contact views, the two subject branches, the quantity line, the
asset, the transition and the moderation note. None declares a token,
token-digest, grant secret, session secret, object-storage key or path — asserted
mechanically by the contract spec before generation ran.

---

## L. Files changed

**New runtime (13)**

```text
apps/api/src/modules/customer/domain/repositories/admin-customer-summary.port.ts
apps/api/src/modules/customer/infrastructure/persistence/drizzle-admin-customer-summary.adapter.ts
apps/api/src/modules/order/domain/admin/admin-request-read.errors.ts
apps/api/src/modules/order/domain/repositories/custom-request-admin.repository.ts
apps/api/src/modules/order/infrastructure/persistence/drizzle-custom-request-admin.repository.ts
apps/api/src/modules/order/application/admin/admin-request.projection.ts
apps/api/src/modules/order/application/admin/read-admin-request-queue.query.ts
apps/api/src/modules/order/application/admin/read-admin-request-detail.query.ts
apps/api/src/modules/order/presentation/admin-custom-request.controller.ts
apps/api/src/modules/order/presentation/schemas/admin-custom-request.request.ts
apps/api/src/modules/order/presentation/schemas/admin-custom-request-queue.response.ts
apps/api/src/modules/order/presentation/schemas/admin-custom-request-detail.response.ts
apps/api/src/modules/order/custom-request-admin.module.ts
```

**Modified runtime (4)**

```text
apps/api/src/modules/catalog/domain/repositories/catalog-subject.port.ts        (+ findProductLabels)
apps/api/src/modules/catalog/infrastructure/persistence/drizzle-catalog-subject.adapter.ts
apps/api/src/modules/customer/customer.module.ts                                (+ port provider/export)
apps/api/src/bootstrap/app.module.ts                                            (+ module registration)
```

**Tests (6)**

```text
apps/api/src/modules/order/application/admin/admin-request.projection.spec.ts
apps/api/src/modules/order/presentation/schemas/admin-custom-request.request.spec.ts
apps/api/src/modules/order/presentation/admin-custom-request.contract.spec.ts
apps/api/src/modules/order/tests/integration/admin-request-context.ts
apps/api/src/modules/order/tests/integration/admin-request-queue.integration.spec.ts
apps/api/src/modules/order/tests/integration/admin-request-detail.integration.spec.ts
```

**Generated (3)**

```text
packages/contracts/openapi/openapi.generated.json
packages/api-client/src/generated/embroidery-api.ts
packages/api-client/src/generated/embroidery-api.schemas.ts
```

**Docs (3)**

```text
docs/implementation/phases/APP5-CUSTOM-REQUESTS.md
docs/implementation/SCOPED_COMMAND_INDEX.md          (CMD-TEST-APP5-B04-ADMIN)
docs/implementation/reports/APP5-B04-COMPLETION-REPORT.md
```

**No migration. No worker change. No Figma change. No Admin or Storefront UI.**

File sizes: every runtime source ≤ 400 lines (largest: the detail response schema
at 379 and the read repository at 351) and every test ≤ 600 (largest: the detail
integration suite at 415).

---

## M. Roadmap

```text
APP5-R00  = COMPLETE
APP5-G01  = COMPLETE
APP5-D01  = COMPLETE
APP5-B01  = COMPLETE
APP5-DB01 = COMPLETE
APP5-B02  = COMPLETE
APP5-B03  = COMPLETE
APP5-B04  = COMPLETE
APP5-B05  = INCOMPLETE  NEXT
APP5-S01  = INCOMPLETE
APP5-S02  = INCOMPLETE
APP5-A01  = INCOMPLETE
APP5-A02  = INCOMPLETE
APP5-E01  = INCOMPLETE
APP5-X01  = INCOMPLETE
```

---

## N. Residual risks

1. **`FU-APP5-B04-COP-ASSET-DELIVERY-01`** — the detail describes attachments but
   publishes no way to open one. An operator judging a photo needs the image, and
   `APP5-A02` will need a private Admin delivery route. B04 deliberately added no
   binary endpoint (§9.4); the route is `APP5-A02`'s or a dedicated slice's to
   define, together with the delivery authority it sits behind.
2. **`FU-APP5-B04-DESIGN-PREVIEW-01`** — the catalog subject carries the design
   session **id** only. No safe Admin preview metadata was published because no
   authorized port for one exists today; §9.3 makes it conditional on
   availability. Adding one is an APP6-era decision, not a gap in this read.
3. **Queue plan not measured.** §13 forbids speculative index work, and
   `ix_custom_requests__status_created_id` matches the query's shape exactly, so
   no plan was inspected and no migration added. If the table grows large enough
   for the `contact`-filtered form to matter, `custom_requests.customer_id` has no
   dedicated index — a future observation, not a present defect.
4. **`appliedStatuses` is a contract an operator's screen must honour.** The
   default triage set is a server decision; a screen that ignores the echoed list
   could imply the queue is the whole table. `APP5-A01` owns rendering it.

---

## O. Commit

```text
feat(app5): read the admin request queue and one request
```

Committed on `production`. Not pushed.

---

```text
NEXT CHECKPOINT: APP5-B05 — Admin moderation notes & guarded transitions
```
