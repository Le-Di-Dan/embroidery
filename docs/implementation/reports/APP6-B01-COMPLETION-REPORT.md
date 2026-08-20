# APP6-B01 — Quotation Drafting Backend + APP6 Policy Publication — Completion Report

```text
APP6-D01 PRODUCT OWNER APPROVAL = RECORDED
APP6-B01 = COMPLETE
HTTP OPERATIONS ADDED = 2
QUOTATION CREATE + FIRST DRAFT = DELIVERED
TR-LC12-01 ADD DRAFT VERSION = DELIVERED
APP6 POLICY DATASET READER = DELIVERED
APP6 POLICY PUBLICATION = DELIVERED
POLICY KEYS PUBLISHED = 3
EXACT MONEY = STRING END TO END
REQUEST PROJECTED TO QUOTED = NO
QUOTATION.SENT EMITTED = NO
DATABASE MIGRATION = NONE
B02/B03/B04/B05 = NOT STARTED
NEXT CHECKPOINT = APP6-B02
```

---

## 1. Entry state

Verified from Git, not from the brief.

| Fact | Value |
|---|---|
| Branch | `production` |
| Entry HEAD | `636b2a2` — `docs(app6): correct the APP6-D01 working-tree note` |
| Working tree at entry | **Clean** — `git status --porcelain` empty |
| `APP6-D01` commit reachable | Yes — `0ac6953` `design(app6): deliver the APP6-D01 Figma package for Product Owner review`, second from HEAD |
| Prerequisites | `APP6-R00`, `APP6-G01`, `APP6-G01-C1`, `APP6-DB01`, `APP6-D01` all `COMPLETE` |
| Prior APP6-B01 work under another name | None. `apps/api/src/modules/quotation/` held the DB7-CP4 persistence layer only: repository port, Drizzle implementation, row mapper, context module, one integration suite. **No controller, no use case, no HTTP surface.** |
| Pushed | **No.** One local commit; nothing pushed. |

---

## 2. Product Owner design approval — recorded (preflight)

```text
APP6-D01 = PASS
PRODUCT_OWNER_DESIGN_APPROVAL = COMPLETE_PACKAGE
APPROVAL_ID = FIG-APPROVAL-APP6-D01-PO-001
```

| Requirement | Evidence |
|---|---|
| Promote exactly the 56 `APP6-D01` rows | Rows matching `\| APP6-D01 \| — \| — \| 2026-08-20 \|` numbered **56** before the edit and **56** after; `REVIEW_REQUIRED` rows carrying `\| APP6-D01 \|` went **56 → 0** |
| No row outside `APP6-D01` promoted | File-wide `REVIEW_REQUIRED` count went **90 → 34**; 90 − 56 = 34, so every other row is untouched |
| Approval evidence set | All 56 rows now read `\| APP6-D01 \| — \| FIG-APPROVAL-APP6-D01-PO-001 \| 2026-08-20 \|` |
| Approval note added beside §4.12 | Yes — states the promotion, the evidence id, that it is a registry edit only, and why `Last Verified` is unchanged |
| Node IDs / deep links / page / section / visual content | **Unchanged.** The edit touched only the Status and Approval-Evidence columns |
| `Last Verified` | **Unchanged at `2026-08-20`.** It records when a row was last checked against the live file, which a human approving the design does not re-perform |
| Figma opened for mutation | **No.** No MCP call of any kind was made this checkpoint |
| Registry checker | `node tools/check-figma-design-index.mjs` — **run once**, green: `334 registry IDs, 334 node rows, 18 registry table(s)` |

The UI implementation gate is now open for those 56 rows; `APP6-A01`/`A02`/`S01`/`S02` may resolve them when they run.

---

## 3. The two HTTP operations

Exactly two, and no third.

| # | Method + path | Operation ID | Success |
|---|---|---|---|
| A | `POST /api/admin/quotations` | `adminQuotation_create` | `201 QUOTATION_DRAFTED` |
| B | `POST /api/admin/quotations/{quotationId}/versions` | `adminQuotation_addVersion` | `201 QUOTATION_VERSION_DRAFTED` |

Both are `AuthenticatedAdminGuard` at controller level plus `StaffOriginGuard` and
`StaffJsonBodyGuard` per handler — the exact combination every Admin mutation in
this repository already uses. Operation IDs derive from the class name under the
default `createOperationId` policy; **no `CONTROLLER_DOMAIN_KEYS` entry was
needed or added**, so no accepted operation id anywhere was reissued.

### Route-shape decision

`POST /admin/quotations` with `customRequestId` in the body, rather than nesting
the create under `admin/custom-requests/{id}/quotations`. A quotation is its own
resource family with its own id, and every later operation in this domain
(`APP6-B02` history and detail, `APP6-B03` send) addresses a quotation, not a
request; nesting the create alone would put one member of the domain under a
different root. `customRequestId` is a **subject**, never an authority — §8 below
records what the contract refuses to accept.

### What the two operations deliberately do not do

- no request lifecycle mutation, and no path to `transition()` — the use cases
  hold the AGG-13 port for **one read** and inject no recorder;
- no `QUOTED` projection, no SE-004, no `quotation.sent`, no outbox row at all;
- no `current_version_id` advance — a `DRAFT` is not the price the customer is
  looking at, and `APP6-G01` §4 puts that pointer inside the send transaction;
- no `custom_requests.current_quotation_id` write — nothing in accepted authority
  assigns that pointer to `TR-LC12-01`, and writing it would make drafting a
  write on CTX-ORD's aggregate root. Left for whichever checkpoint authority
  assigns it (recorded as a follow-up, §12);
- no send, accept, reject, expiry, secure grant, order, obligation, attempt,
  collection, reservation or stock hold.

---

## 4. Exact money — the load-bearing part

### Ownership

```text
currency            VND, fixed by CHECK
storage             numeric(14,2), returned by the driver as a string
in memory           bigint hundredths of a đồng (never a JS number)
HTTP / OpenAPI      string
generated client    string
```

`apps/api/src/modules/quotation/domain/pricing/vnd-amount.ts` is the only
arithmetic. It parses a bounded decimal **string** by scanning it — never
`parseFloat`, never `Number()` — into `bigint` hundredths, and the only way back
out is `formatVndAmount`. `numeric(14,2)` values are exact at every magnitude a
`bigint` holds, so nothing on the path can lose a unit.

The single place a `number` legitimately appears is the deposit **rate** read
from published policy. `parsePercentHundredths` converts it via its decimal
string (`String(40.7)` → `'40.7'` → `4070n`) precisely because `40.7 * 100` is
`4070.0000000000005` in IEEE-754. It is a rate, not an amount, and it becomes
exact hundredths of a percent before it can touch a total.

### Derivation, and what the client may not send

```text
lineTotal = unitPrice × quantity
subtotal  = Σ lineTotal
total     = subtotal + manualAdjustment + shippingFee     (CST-064)
deposit   = round-half-up(total × depositPercent)         (DB4; policy data)
remaining = total − deposit                               (CST-064)
```

Every one of those is derived server-side. `lineTotalAmount`, `subtotalAmount`,
`totalAmount`, `depositPercent`, `depositAmount` and `remainingAmount` are
**absent from the request contract** — a client that could send a total could
send one its lines do not explain, and a client that could send a deposit could
quote a share the business never published.

### The rounding rule is accepted authority, not a choice made here

`DB4_MONEY_QUANTITY_MEASUREMENT_MODEL.md` specifies, for exactly this split:
*"round-half-up on deposit; remaining = total − deposit"*. Both
`ck_quotation_versions__deposit_currency_scale` and its `remaining` twin require
whole đồng (VND has no minor unit), so the deposit is rounded half up to a whole
đồng and the complement is computed by **subtraction** — never by applying
`remainingPercent`. That is what keeps
`deposit_amount + remaining_amount = total_amount` true for *every* total rather
than only the ones that divide evenly.

`remainingPercent` is still validated: a dataset whose two shares do not sum to
100 % is refused rather than priced against.

### Proof

| Property | Where proved |
|---|---|
| No precision loss at `numeric(14,2)` magnitude | `quotation-pricing.spec.ts` — `999999999999.99` round-trips exactly |
| Percentage parse has no float drift | `parsePercentHundredths(40.7) === 4_070n` |
| Round-half-up on the deposit | 40 % of 1001 → `400.00`; of 1004 → `402.00`; 50 % of 1001 → `501.00` |
| CST-064 holds for every total | 17-total sweep at **33.33 %** (a share that almost never divides evenly): `deposit + remaining === total` and both end `.00` at each one |
| Strings survive to persistence | Drafting integration suite reads the row back: `typeof total_amount === 'string'`, and each stored amount `===` the amount in the response |
| Strings survive to the contract | Contract suite: every money leaf of all three APP6 schemas is `type: string` in the committed OpenAPI |
| Strings survive to the client | Contract suite: each money field matches `: string;` and **does not** match `: number;` in the generated client |
| Deposit comes from policy, not a constant | `depositPercent` is `40.00` under the published dataset and `33.33`/`50.00` when the test publishes those — the same code path, no literal |
| No policy value hard-coded | No `0.4`, `40`, `60` or `7` appears in quotation runtime code; the reader spec asserts the dataset reader carries no `depositPercent`/`validityDays`/`requiredAgreementTypes` token |
| A fractional đồng is refused before the DB has to | `QUOTATION_PRICING_INVALID` naming the figure, not a constraint |

---

## 5. APP6 policy reader + publisher

### Architecture

Follows the delivered `APP4-B01-C1` seam exactly; **no second policy platform**.

| Layer | Artifact |
|---|---|
| Value source (unchanged, `APP6-G01`) | `packages/database/seed/app6-policy-configuration.seed.json` |
| Reader (new) | `packages/database/src/seed/app6-policy-dataset.ts`, exported from the package index |
| Publisher (new) | `apps/api/src/platform/policy/publish-app6-policy.use-case.ts` |
| Shared mechanic (extracted) | `apps/api/src/platform/policy/policy-version-comparison.ts` |
| Module | The **existing** `PolicyModule` — second provider, not a second module |
| Bootstrap trigger | The **existing** `staff-bootstrap` `runEnsure`, immediately after the APP4 publish, on the same resolved `result.adminId` |
| HTTP endpoint | **None.** Publication is a bootstrap action, not a request |

**Reuse vs. sibling.** The genuinely shared mechanic — the canonical,
order-insensitive drift comparison and the publication result types — was
extracted into `policy-version-comparison.ts` and **both** publishers now use it.
The rest stayed split: merging them into one "publish every dataset" service
would need a dataset registry and an ordering rule, which is precisely the seed
framework both checkpoints were told not to build. The APP4 publisher's public
API is unchanged (it re-exports the moved types), and its integration suite
passes untouched at 8/8.

**Admin attribution.** `policy_configuration_versions.created_by_admin_id` is
`NOT NULL`; the id is the Admin the staff bootstrap just created or reused,
gated on `result.adminId !== undefined` exactly as the APP4 call is.

### The three keys

`quotation.validity`, `quotation.deposit`, `design_approval.agreements` — all
three published. `quotation.deposit` is consumed by B01 for the split;
`quotation.validity` is **published but not consumed** here, because its
send-time use is `APP6-B03`'s.

### This publishes configuration, not legal content

`design_approval.agreements` names the required agreement **types**. The wording
a customer accepts is versioned agreement content and remains `APP6-B10`'s. The
integration suite asserts `agreement_versions` is still empty after publication.

### Idempotency, proved against a real database

| Behaviour | Result |
|---|---|
| Missing key → publish | 3 keys at version 1, attributed to the resolved Admin |
| Identical value + same schema version → do nothing | Second run: all three `unchanged`, still exactly 3 version rows |
| JSONB key order differs → still unchanged | Values rewritten with keys reversed; the next run is all `unchanged` and appends nothing |
| Drift → append a new immutable version | Drifted key goes to version 2; **version 1 still holds the hand-written value** and the other two keys stay `unchanged` |
| History rewritten | **Never** — the drift test asserts version 1's value survives verbatim |

---

## 6. Transaction boundaries

| Operation | Boundary |
|---|---|
| A — create | The eligibility read, the duplicate check, the header insert and the first version + its line items are **one** `runInTransaction`. Proved: forcing the version insert to fail (`quantityTotal: 0`, against `ck_quotation_versions__quantity_positive`) leaves **0 quotations and 0 versions** — the header rolled back with it |
| B — add version | One transaction: locate + draftability check + `addVersion` (which itself takes `FOR UPDATE` on the quotation before reading the next version number, then writes the version and its lines together) |
| Policy read | **Outside** the transaction, per the delivered policy-consumer convention. An unpublished policy refuses before anything is written — proved: `QUOTATION_POLICY_UNAVAILABLE` with 0 quotations created |
| Policy publish | One transaction **per key**. Two drifted keys are two independent appends, not one atomic policy swap |

**Concurrency.** Two simultaneous `addVersion` calls on one quotation produce
versions **2 and 3**, never a collision on
`uq_quotation_versions__quotation_version` — the row lock serialises them.
Two simultaneous creates for one request: the read-first check gives the ordinary
case a clean `QUOTATION_ALREADY_EXISTS`, and `uq_quotations__request` (CST-035)
remains the arbiter, its catalogued
`QUOTATION_ALREADY_EXISTS_FOR_REQUEST` classified into the same refusal.
A `DUPLICATE_QUOTATION_CODE` (≈1 in 2^49) retries the whole transaction, bounded
at 3 attempts — the `SubmitCustomRequestUseCase` precedent.

---

## 7. Request-state / lifecycle boundary

`TR-LC12-01`'s guard is DB3's, enforced verbatim: **"request ≥ UNDER_REVIEW"**.

LC-11 describes a progression `NEW → UNDER_REVIEW → NEEDS_CLARIFICATION →
QUOTED → QUOTE_ACCEPTED → DIGITIZING → DESIGN_REVIEW → APPROVED`, with
`REJECTED` and `CANCELLED` marked **terminal** — off that scale rather than above
its top. "≥ UNDER_REVIEW" therefore admits the seven progression states from
`UNDER_REVIEW` onward, and refuses `NEW` (below it) and the two terminal
outcomes (not on it). Written as an explicit set rather than an index comparison
against `CUSTOM_REQUEST_STATES`, so a future reordering of that array cannot
silently change an authorization rule. A spec asserts every declared request
state is classified, so a tenth state cannot be admitted by omission.

The rule is neither tightened nor loosened: quoting an already-`QUOTED` or
`QUOTE_ACCEPTED` request is **allowed**, because ADR-DB3-001 rule 4 re-prices by
adding a new version and refusing it would make the documented re-quote path
unreachable.

Quotation draftability refuses only the two terminal LC-12 header states
(`REJECTED`, `CANCELLED`). `EXPIRED` is admitted because LC-12 calls it
"re-activatable by new version", and `ACCEPTED` because rule 4 needs it.

Negatives proved against a real database:

- after both operations the request is still `UNDER_REVIEW`;
- `custom_request_transitions` has **0 rows**;
- `outbox_events` has **0 rows**;
- `quotations.current_version_id` is **NULL**;
- the contract publishes no `/send`, `/accept`, `/reject`, `/status` or
  `/expire` route on any quotation path.

---

## 8. API contract

- staff protected, both operations;
- bodies validated through the project's Zod→DTO boundary and both `.strict()`
  — proved `additionalProperties: false` in the committed document, so an
  unrecognised key is a `400` rather than a silent drop;
- **no `adminId`, `customerId`, `actorKind` or `createdByAdminId`** in either
  body — asserted by the contract suite. The operator is bound by the guard and
  read from the request context inside the use case; there is no argument
  through which a caller could supply one. Proved by running a command with no
  actor bound: it throws and writes nothing;
- **no derived figure** accepted — asserted for `subtotalAmount`, `totalAmount`,
  `depositAmount`, `remainingAmount`, `depositPercent`, `code`, `version`,
  `status`, `currencyCode`, `validUntil`, `sentAt`, and `lineTotalAmount` on the
  line schema;
- money is `string` in OpenAPI and in the generated client (§4);
- **no new nullable string property** was introduced, so the APP6
  `@ApiProperty({ type: String, nullable: true })` rule has no instance to apply
  to here and none of the `FU-APP5-S02-NULLABLE-STRING-CONTRACT-01` debt is
  added;
- responses use the standard envelope via `envelopeSchemaOf` / `ApiSuccessCode`;
- error codes are bounded and derived from real refusal conditions:

| Code | Status | Cause |
|---|---|---|
| `REQUEST_NOT_FOUND` | 404 | No such custom request |
| `QUOTATION_NOT_FOUND` | 404 | No such quotation |
| `REQUEST_NOT_QUOTABLE` | 409 | Below `UNDER_REVIEW`, or terminal |
| `QUOTATION_ALREADY_EXISTS` | 409 | CST-035 — one quotation per request |
| `QUOTATION_NOT_DRAFTABLE` | 409 | Terminal LC-12 header state |
| `QUOTATION_PRICING_INVALID` | 400 | Fractional đồng, overflow, total below zero, adjustment without reason |
| `QUOTATION_POLICY_UNAVAILABLE` | 503 | `quotation.deposit` unpublished or unusable — the APP4 precedent for an unpublished policy; the message names no value |

No internal database, storage or provider detail reaches a response: anything
that is not a `QuotationDraftingError` propagates to the platform filter, which
sanitises it.

---

## 9. OpenAPI / generated client — one controlled cycle

Run in order, **once each**, only after the surface typechecked clean.

| Step | Command | Result |
|---|---|---|
| 1 | `pnpm --filter @embroidery/api typecheck` | clean (after two local type fixes, before generation) |
| 2 | `pnpm --filter @embroidery/api openapi:generate` | paths 58 → **60**, operations 63 → **65**, schemas 132 → **135** |
| 3 | diff inspection | exactly two APP6 operations added; three schemas — `CreateQuotationDraftBody`, `AddQuotationVersionBody`, `QuotationDraftedResponse` |
| 4 | `pnpm --filter @embroidery/api openapi:check` | up to date |
| 5 | `pnpm --filter @embroidery/api-client generate` | 2 files, 4567 lines, tree hash `79424eb1…` |
| 6 | `pnpm --filter @embroidery/api-client check:generated` | up to date, same tree hash |
| 7 | `pnpm --filter @embroidery/api typecheck` + `pnpm --filter @embroidery/database typecheck` | both clean |

No decorator, path, operation id, DTO or response schema changed after step 2, so
no regeneration loop occurred and the generated evidence above stands.

---

## 10. Test ledger

Change-impact scoped. Every rerun below follows a **real input change**.

| Suite | Command | Tests | Runs | Why more than once |
|---|---|---|---|---|
| APP6 dataset reader | `pnpm --filter @embroidery/database exec jest src/seed/app6-policy-dataset.spec.ts` | 8 | 2 | lint fix removed a `require` from the spec |
| APP6 policy publication (integration) | `… jest src/platform/policy/tests/publish-app6-policy.integration.spec.ts` | 6 | 2 | first run failed on `result.rows`; fixed, rerun |
| APP4 policy publication (integration) | `… jest src/platform/policy/tests/publish-app4-policy.integration.spec.ts` | 8 | 1 | its publisher was refactored onto the shared comparison |
| Exact money + pricing | `… jest src/modules/quotation/domain/pricing/quotation-pricing.spec.ts` | 17 | 1 | — |
| Drafting rules (eligibility, policy parse, code) | `… jest src/modules/quotation/domain/drafting/quotation-drafting-rules.spec.ts` | 12 | 1 | — |
| Published surface (contract) | `… jest src/modules/quotation/presentation/admin-quotation.contract.spec.ts` | 18 | 1 | — |
| Drafting (integration) | `… jest src/modules/quotation/tests/integration/quotation-drafting.integration.spec.ts` | 21 | 2 | first run failed on an FK ordering in one fixture; fixed, rerun |
| Final confirmation | `… jest src/modules/quotation src/platform/policy` | **95 / 7 suites** | 1 | Prettier reformatted two spec files after their last run |
| Figma registry gate | `node tools/check-figma-design-index.mjs` | — | 1 | 334 / 334 / 18 green |

**Totals: 103 focused tests, all green** (95 API across 7 suites — including the
pre-existing DB7-CP4 quotation persistence suite, which still passes — plus 8 in
the database package).

Also run: `lint` and `typecheck` on `@embroidery/api` and `@embroidery/database`
(both clean), and `prettier --check` over the changed files (clean).

### Explicitly not run

Full repository suite; full API regression; worker tests; Admin/Storefront tests;
Playwright/E2E; APP3/APP4/APP5 historical gate sweeps; database live
baseline/fingerprint/index/manifest suites; migration checksum checks; Figma
checker unit tests; SonarQube; unrelated lint/typecheck packages. No B01 change
touches their owning inputs.

---

## 11. Files changed

**New — quotation module (14)**

```text
apps/api/src/modules/quotation/quotation-drafting.module.ts
apps/api/src/modules/quotation/domain/pricing/vnd-amount.ts
apps/api/src/modules/quotation/domain/pricing/quotation-pricing.ts
apps/api/src/modules/quotation/domain/pricing/quotation-deposit-policy.ts
apps/api/src/modules/quotation/domain/pricing/quotation-pricing.spec.ts
apps/api/src/modules/quotation/domain/drafting/quotation-code.ts
apps/api/src/modules/quotation/domain/drafting/quotation-eligibility.ts
apps/api/src/modules/quotation/domain/drafting/quotation-drafting.errors.ts
apps/api/src/modules/quotation/domain/drafting/quotation-drafting-rules.spec.ts
apps/api/src/modules/quotation/application/drafting/draft-version.command.ts
apps/api/src/modules/quotation/application/drafting/quotation-actor.ts
apps/api/src/modules/quotation/application/drafting/quotation-version.drafter.ts
apps/api/src/modules/quotation/application/drafting/create-quotation-draft.use-case.ts
apps/api/src/modules/quotation/application/drafting/add-quotation-version.use-case.ts
apps/api/src/modules/quotation/infrastructure/policy/quotation-deposit-policy.reader.ts
apps/api/src/modules/quotation/presentation/admin-quotation.controller.ts
apps/api/src/modules/quotation/presentation/admin-quotation.contract.spec.ts
apps/api/src/modules/quotation/presentation/schemas/admin-quotation.request.ts
apps/api/src/modules/quotation/presentation/schemas/admin-quotation.response.ts
apps/api/src/modules/quotation/tests/integration/quotation-drafting.integration.spec.ts
```

**New — policy (4)**

```text
packages/database/src/seed/app6-policy-dataset.ts
packages/database/src/seed/app6-policy-dataset.spec.ts
apps/api/src/platform/policy/policy-version-comparison.ts
apps/api/src/platform/policy/publish-app6-policy.use-case.ts
apps/api/src/platform/policy/tests/publish-app6-policy.integration.spec.ts
```

**Modified (7)**

```text
packages/database/src/index.ts                              APP6 reader exports
apps/api/src/platform/policy/policy.module.ts               second publisher provider
apps/api/src/platform/policy/publish-app4-policy.use-case.ts onto the shared comparison
apps/api/src/cli/staff-bootstrap.ts                         APP6 publish on the same seam
apps/api/src/bootstrap/app.module.ts                        QuotationDraftingModule registered
packages/contracts/openapi/openapi.generated.json           generated
packages/api-client/src/generated/…                         generated
```

**Documentation (3)**

```text
docs/design/FIGMA_DESIGN_INDEX.md                           56-row PO approval promotion
docs/implementation/phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md  B01 COMPLETE, next B02
docs/implementation/reports/APP6-B01-COMPLETION-REPORT.md   this report
```

`apps/api/src/modules/quotation/quotation.module.ts` is **unchanged**: the
context module keeps publishing the AGG-14 port and stays free of controllers,
and the drafting surface composes around it — the shape APP5 settled on, which is
what will let `APP6-B02`'s reads compose their own module without a write
repository in reach.

### File sizes

Every source file is under the 400-line limit (largest: the controller at 239)
and every test under 600. One test crosses the 500-line review threshold —
`quotation-drafting.integration.spec.ts` at **529** — which is noted rather than
split, because it is one subject (the two commands against real rows) and
splitting it would duplicate a 100-line fixture block.

### `SCOPED_COMMAND_INDEX.md`

**Not modified.** B01 introduced no new scoped command or checker: the properties
that would justify one — exactly two operations, string money end to end, nothing
derived accepted — are proved cleanly by the contract suite against the committed
artifacts, and a bespoke checker would only restate it.

---

## 12. Judgement calls and follow-ups

| # | Call | Rationale |
|---|---|---|
| 1 | Eligibility written as an explicit state set, terminal states excluded | §7. DB3 marks `REJECTED`/`CANCELLED` terminal, i.e. not on the ordinal scale "≥ UNDER_REVIEW" measures |
| 2 | `custom_requests.current_quotation_id` left NULL | No accepted authority assigns that pointer to `TR-LC12-01`, and writing it would make drafting a write on CTX-ORD's root. **Follow-up `FU-APP6-B01-CURRENT-QUOTATION-POINTER-01`**: whichever checkpoint authority assigns it (likely `APP6-B03`, whose send transaction already touches the request) should set it |
| 3 | `quotation-code.ts` mirrors `request-code.ts` rather than importing or promoting it | Importing would couple CTX-QUO to CTX-ORD's domain for a string generator; promoting would rewrite an accepted APP5 file for a reason APP5 did not ask for. Two consumers is not the third that justifies a shared home. **Follow-up `FU-APP6-B01-CODE-GENERATOR-PROMOTION-01`**: promote to app-shared when a third code appears |
| 4 | Subtotal derived from lines rather than accepted and cross-checked | A derived subtotal cannot disagree with its lines. The operator keeps the dedicated `shippingFeeAmount` and `manualAdjustmentAmount` fields for anything outside the priced lines |
| 5 | Drift comparison extracted; the two publishers otherwise kept separate | §5 |

### Pre-existing debt observed, not touched

`tools/check-app4-b01-policy.mjs` asserts the repository holds **34** migrations;
it has held 36 since `APP6-DB01` (`0036`) and 35 since `APP5-DB01`. The rule is
therefore stale independently of this checkpoint — B01 adds no migration. The
file is a library with no CLI entry point, so it is driven by its own
`.test.mjs`, which §10 excludes as an APP4 historical gate. Recorded as
**`FU-APP6-B01-APP4-POLICY-CHECKER-MIGRATION-COUNT-01`** rather than fixed here:
correcting an APP4 gate's expectations is APP4's business, not a quotation
checkpoint's.

---

## 13. Scope guard — what was not touched

No database schema, table, column or constraint; no migration (`0036` and every
earlier one untouched); no DB fingerprint or manifest; no Figma node; no frontend
source; no worker runtime; no design-document COP widening (`APP6-B08`); no
agreement content or publication (`APP6-B10`); no quotation send, read, accept or
reject surface (`APP6-B02`–`B05`). `packages/design-document` is untouched.

---

## 14. Verdict

```text
APP6-B01 = COMPLETE
COMMIT = 1f5ba22 (local only — not pushed)
NEXT CHECKPOINT = APP6-B02
```

`APP6-B02` (quotation read — version history and one version's detail with its
line items, 2 operations) is named as next and **was not executed** in this
session.
