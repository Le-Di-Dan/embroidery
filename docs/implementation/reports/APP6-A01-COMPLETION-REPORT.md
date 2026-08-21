# APP6-A01 — Admin Quotation Workbench — Completion Report

**Checkpoint:** `APP6-A01`
**Phase:** APP6 — Design Review and Quotation
**Surface:** `apps/admin` (one screen) + one PO-authorized narrow read-contract unblock in `apps/api`
**New HTTP operations:** **0** (78 → 78)
**Database migration:** **none** (36)
**Status:** delivered for human review

---

## A. What was built

One Admin route — `/requests/{requestId}/quotation` — covering the twelve
approved states of the quotation workbench: request context, the no-quotation
empty state, creating the first quotation and its first `DRAFT`, appending an
immutable version, the exact line breakdown, manual adjustment with its reason,
the exact totals, validity, version history, an exact version's detail, sending
one exact `DRAFT`, the accepted outcome, and the loading / validation / error /
in-progress states, at 1440 and at the narrow 1280 reference.

Plus the one thing the screen could not exist without: a durable way to get from
a request id to its quotation.

---

## B. The §4 bridge

```
A01_DRAFT_QUOTATION_DISCOVERY = NARROW_CONTRACT_UNBLOCK
```

### B.1 It was proved necessary before it was built

The §4 preflight was executed rather than assumed. Two facts closed it:

1. **`adminCustomRequest_detail` excluded every APP6 fact by design.** Its own
   response DTO doc block said so in as many words — the detail payload carried
   request, subject, quantities, assets, transitions and moderation notes, and
   nothing from the quotation context.
2. **None of the five accepted Admin quotation operations is addressable by
   `requestId`.** `adminQuotation_create` takes the request id in its *body*
   and returns a receipt; the other four are addressed by `quotationId`. There
   is no read that answers "which quotation belongs to this request".

So an operator who created a `DRAFT` and reloaded the page had no way back to
it. Every forbidden substitute (§4) was rejected: no in-memory mutation result,
no `localStorage`/`sessionStorage`, no history state, no hidden global store, no
guessed id, and **no parsing of `QUOTATION_ALREADY_EXISTS`**.

### B.2 What was added: exactly one nullable field

`GET /api/admin/custom-requests/{requestId}` gained:

```jsonc
"quotationId": { "type": "string", "nullable": true, "format": "uuid" }
```

`@ApiProperty({ type: String, nullable: true })` is deliberate rather than
decorative. A bare `string | null` union publishes as `type: object` and Orval
types it as an index signature — the debt
`FU-APP6-B02-NULLABLE-OBJECT-TYPE-DEBT-01` records. This field is declared
correctly rather than inheriting it.

### B.3 It is resolved from the relation, **not** from `current_quotation_id`

`custom_requests.current_quotation_id` is the *customer-current / send*
authority. It is `NULL` until a version is sent — which is precisely the state
an Admin workbench exists to work in. Deriving the locator from it would make an
unsent `DRAFT` undiscoverable, i.e. it would fail at the only job it has.

The locator resolves from the unique `quotations.custom_request_id` relation
instead.

### B.4 A new narrow port, not the existing repository

`QUOTATION_REPOSITORY` already had `findByRequest` and would have answered the
question with no new code. It was not used, because it also carries `send`,
`accept`, `reject`, `expire`, `addVersion` and `setCurrentVersion` — and
`QuotationReadModule`'s own stated principle is that *what a module can inject
is what its routes can eventually do*. Injecting it into a read module would put
sending and accepting one line of code away from a `GET`.

So Quotation publishes a port whose entire surface is:

```ts
export interface QuotationLocatorPort {
  findQuotationIdForRequest(customRequestId: string): Promise<string | undefined>;
}
```

It returns an **id**, not a quotation, so no amount, version, history or
`currentVersionId` can travel through it. `custom-request-admin.module.ts`
imports `QuotationModule` for this symbol alone, and its doc block says why not
the repository.

Constraints held: Admin-only read, 0 new operations, no mutation, no pointer
write, no lifecycle change, no schema change, no queue/list change, no versions,
amounts or history embedded, and no `currentVersionId` exposure.

---

## C. Exact money (§8)

Currency is VND. Money crosses HTTP as a **string** and stays one.

The feature contains **no** `Number(...)`, `parseFloat`, `parseInt` on an amount,
unary `+`, `Math.round`, or arithmetic operator applied to money. `exact-money.ts`
does string work only: it groups integer digits from the right and inserts
separators, and it returns its input **verbatim** when it cannot parse it or when
the fraction is non-zero — because hiding a fraction this system never wrote is
the one way a formatter can misreport a figure.

The two `Number.parseInt` calls in the feature are `quantityTotal` and
`stitchCount`, which the contract types as integers and which are not money.

The server owns the line totals, subtotal, total, deposit split, round-half-up
and remainder. The authoring body carries **no** derived figure — it is
`.strict()`, so a computed field would be a `400` naming it even if the value
were right.

This is enforced by a source-shape guard, not only by output assertions: a test
walks every `.ts`/`.tsx` file in the feature, strips comments (the doc blocks
discuss the forbidden calls by name), and fails on any numeric-coercion call.

---

## D. Catalog / COP (§9)

`lineKindsFor` returns `['PRODUCT', 'EMBROIDERY', 'DIGITIZING_FEE', 'OTHER']`
for a Catalog request and `['EMBROIDERY', 'DIGITIZING_FEE', 'OTHER']` for a
customer-owned one. An **unreadable** subject gets the narrower offer: pricing a
garment nobody can name is the failure worth avoiding.

`SHIPPING` and `ADJUSTMENT` are excluded from both, on an arithmetic ground
rather than a stylistic one — they have dedicated body fields
(`shippingFeeAmount`, `manualAdjustmentAmount`) that feed CST-064 directly, so
offering them *also* as priced lines is how a shipping fee gets counted twice.

---

## E. The adjustment-reason rule is mirrored in both directions

`computeDraftPricing` refuses a non-zero adjustment without a reason **and** a
reason with no adjustment to explain. Client validation mirrors both halves.
Mirroring only the first would let an operator submit a form the server rejects
for a rule the screen never mentioned. An explicit `0.00` is treated exactly as
the server treats it — as no adjustment.

Validation guides; it never adjudicates. The server re-validates everything and
remains the only authority on `QUOTATION_PRICING_INVALID`.

---

## F. Send (§15)

- **Bodyless.** `sendQuotationVersion(quotationId, versionId)` has two
  parameters and no third. The generated operation is invoked with no payload
  argument — proved by asserting the call's transport options object has exactly
  one key, `instance`.
- **Bound to one exact version.** The dialog captures the version id it was
  opened for and hands that same value to the confirm handler. Nothing
  re-derives "the current draft" between the operator reading the version number
  in the sentence and the request going out.
- **Duplicate activation blocked.** `disabled` is one render behind a fast
  double-click, so an `inFlight` ref set synchronously guards the handler ahead
  of the event. Three clicks in one tick produce **one** request.
- **A replay is reported as a replay.** `replayed: true` gets its own wording;
  the screen never claims a second send happened.
- **A stale refusal re-reads and stops.** Both queries are invalidated, what is
  now true is rendered, and a **new** explicit operator decision is required.
  There is no "send anyway" and no path that substitutes a different version.

---

## G. Accepted outcome (§16)

The banner claims a customer accepted a price. It claims **no** payment, **no**
Order and **no** reserved inventory — APP6 stops before all three.

There is no re-quote control, because `APP6-B03` refuses a re-quote after
acceptance and no `QUOTE_ACCEPTED → QUOTED` reopen edge exists
(`FU-APP6-B03-REQUOTE-AFTER-ACCEPTANCE-01`). Offering one would offer an action
the API cannot perform.

The next lifecycle step (`DIGITIZING`) is a **link** to the request detail
screen, which owns that guard and dialog — not a duplicate trigger here.

---

## H. Disclosure (§17)

No raw server `message`, business `code`, SQL fragment, stack, `requestId` or
Axios internal reaches the operator. Every sentence comes from the copy catalog,
selected by a **classification** computed from the normalized envelope. Nothing
in the catalog interpolates a value that came from an error.

The one place an error code is read is telling `QUOTATION_ALREADY_EXISTS` from
the other 409 — and it is read, never rendered.

Three assertions cover this from the DOM side: a 404, a pricing 400 and a stale
409 each check that the injected message, the code and the fabricated request id
are absent from `document.body.textContent`.

---

## I. Bootstrap: three states that never collapse

```
route requestId
  → request context (APP5-B04)      → quotationId
      null      → the approved empty state
      non-null  → version history (APP6-B02) → the selected version's detail
```

The history query is **enabled only once a locator exists**, so while the
context is loading there is no history request in flight to fail. A pending
bootstrap can therefore never be mistaken for an empty quotation, and a failed
history read is reported as a failure and not as "no quotation yet".

Quotation existence is never inferred from the request status.

`QUOTATION_ALREADY_EXISTS` is **reconciled**: the context is re-read, the
durable locator taken from it, and the history loaded. Proved with a refusal
whose message contains a *different* quotation id — a screen that scraped the
message would open the wrong quotation and the test would catch it.

---

## J. Selected version ≠ customer-current version

`quotation.currentVersionId` is what the customer sees; it is `null` before the
first send. The **selected** version is an Admin authoring concern. They are
computed separately and labelled separately, and the selected version is never
described as what the customer is looking at. Two versions can both be non-`DRAFT`;
only the pointer says which one is current.

---

## K. Files

### K.1 API (the §4 bridge)

| File | Change |
| --- | --- |
| `apps/api/src/modules/quotation/domain/repositories/quotation-locator.port.ts` | **new** — the narrow read-only port |
| `apps/api/src/modules/quotation/infrastructure/persistence/drizzle-quotation-locator.adapter.ts` | **new** — one `SELECT id FROM quotations WHERE custom_request_id = $1 LIMIT 1` |
| `apps/api/src/modules/quotation/quotation.module.ts` | provider + export for `QUOTATION_LOCATOR_PORT` |
| `apps/api/src/modules/order/custom-request-admin.module.ts` | imports `QuotationModule` for that symbol alone |
| `apps/api/src/modules/order/application/admin/read-admin-request-detail.query.ts` | `quotationId` on the view; one more parallel statement, no join |
| `apps/api/src/modules/order/presentation/schemas/admin-custom-request-detail.response.ts` | the one new nullable field |
| `apps/api/src/modules/order/presentation/admin-custom-request.controller.ts` | `quotationId: view.quotationId ?? null` |
| `apps/api/src/modules/order/tests/integration/admin-request-quotation-locator.integration.spec.ts` | **new** — 6 cases |

### K.2 Contract and client

`packages/contracts/openapi/openapi.generated.json` regenerated once;
`packages/api-client/src/generated/*` regenerated once;
`packages/api-client/src/index.ts` gained a curated block re-exporting the five
Admin quotation operations, four enums and eleven types.

### K.3 Admin

`apps/admin/src/app/(protected)/requests/[requestId]/quotation/page.tsx` (thin
route) and 18 files under `apps/admin/src/features/request-quotation/`
(`model/`, `services/`, `hooks/`, `components/`, `styles/`, `index.ts`), plus
`apps/admin/src/styles/main.scss` (one `@use`, placed in the import block).

Every source file is within the 400-line limit; the largest is the workbench
orchestrator at 352. The feature stylesheet is 507 lines, in line with every
delivered Admin feature stylesheet (`custom-request-detail.scss` 712,
`product-form.scss` 753).

### K.4 Admin tests

| File | Tests |
| --- | --- |
| `apps/admin/test/model/request-quotation-model.test.ts` | 41 |
| `apps/admin/test/components/request-quotation-bootstrap.test.tsx` | 21 |
| `apps/admin/test/components/request-quotation-send.test.tsx` | 20 |
| `apps/admin/test/support/request-quotation-fixture.ts` | shared fixture |

**82 focused Admin tests, all green.**

The fixture is deliberately hostile to a screen that recomputes: its line total
is **not** `quantity × unitPrice`, its total carries a fraction no round trip
reproduces, its `depositPercent` is not today's policy, `quotationId` defaults
to `null` and `currentVersionId` defaults to `null`.

---

## L. Validation actually run

Scoped per `VALIDATION_GOVERNANCE.md` §3 — no repository-wide aggregate.

| Command | Result |
| --- | --- |
| `npx jest src/modules/order/tests/integration/admin-request-quotation-locator.integration.spec.ts` (in `apps/api`) | **6/6** |
| `npx jest src/modules/order/tests/integration/admin-request-detail.integration.spec.ts` | **15/15** |
| `npx jest src/modules/order/presentation/admin-custom-request.contract.spec.ts` | **10/10** |
| `apps/api` `tsc --noEmit` | clean |
| OpenAPI generate + `openapi:check` | 71 paths / **78 operations** / 163 schemas — unchanged counts |
| client generate + `check:generated` + typecheck + tests | clean, **7/7** |
| `npx jest test/model/request-quotation test/components/request-quotation` (in `apps/admin`) | **82/82** |
| `apps/admin` `tsc --noEmit` | clean |
| `npx eslint` on the changed Admin paths | clean |
| `npx prettier --write` on the changed paths | applied |
| `next build` (Admin production build) | succeeded; `/requests/[requestId]/quotation` registered |

The production build matters beyond the route: **jsdom never compiles SCSS**, so
82 green component tests prove nothing about the stylesheet. `next build`
compiles it for real.

Deliberately **not** run, per §20: the B11/B10/B09/B08/B05 suites, the full
quotation module, full API regression, the worker, Storefront, full Playwright,
the DB manifest gates, migration generation, the APP3 suites, the Figma registry
checker (the registry is unchanged) and full SonarQube.

---

## M. The OpenAPI delta, verified semantically

Not "the counts match" — the artifact was diffed structurally:

- operations **78 → 78**; zero added, zero removed, zero moved;
- exactly **one** schema changed (`AdminCustomRequestDetailResponse`);
- that schema gained exactly **one** property;
- it publishes as `{"type":"string","nullable":true,"format":"uuid"}` — not
  `type: object`.

---

## N. Mutation proofs

A test that passes is not yet a test that discriminates. Four mutations were
applied to delivered source and each was caught by exactly the test that claims
the property:

| Mutation | Result |
| --- | --- |
| Locator derived from `current_quotation_id` instead of the relation | **4 of 6** API tests fail, including the defining unsent-`DRAFT`-with-`NULL`-pointer case |
| History read failure renders the empty state | *"keeps a failed history read distinct from having no quotation"* fails |
| Line total recomputed as `quantity × unitPrice` in the browser | *"renders the frozen line total rather than quantity × unit price"* fails |
| `inFlight` ref guard removed from the send hook | *"fires once for a double-click"* fails with **3** calls |
| `Number(amount)` added to `exact-money.ts` | the source-shape guard fails, naming the file and the pattern |

All sources were restored and the full set re-run green afterwards.

---

## O. Figma registry rows consumed

Read from `docs/design/FIGMA_DESIGN_INDEX.md`; all twelve are
`APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP6-D01-PO-001`, file
`BQwqV8GdfUIELvsQDB1UQE`, page `APP_06`. **Figma was not mutated**, and the
registry is unchanged — so `check-figma-design-index.mjs` was not run.

| Registry id | Node |
| --- | --- |
| `FIG-APP6-A01-DRAFT-CATALOG-DESKTOP` | `682:3` |
| `FIG-APP6-A01-DRAFT-COP-DESKTOP` | `684:3` |
| `FIG-APP6-A01-VALIDATION-DESKTOP` | `684:144` |
| `FIG-APP6-A01-LOADING-DESKTOP` | `686:3` |
| `FIG-APP6-A01-EMPTY-DESKTOP` | `686:62` |
| `FIG-APP6-A01-ERROR-DESKTOP` | `686:104` |
| `FIG-APP6-A01-SENT-READONLY-DESKTOP` | `687:3` |
| `FIG-APP6-A01-SEND-CONFIRM-DESKTOP` | `687:144` |
| `FIG-APP6-A01-SEND-INPROGRESS-DESKTOP` | `689:3` |
| `FIG-APP6-A01-ACCEPTED-DESKTOP` | `689:162` |
| `FIG-APP6-A01-VERSION-HISTORY-DESKTOP` | `690:3` |
| `FIG-APP6-A01-NARROW1280` | `690:92` |

Responsive rules followed: desktop 1440, narrow 1280, 240px sidebar, 336px right
rail wrapping below main under 1360px, tables scrolling inside their own frame,
no mobile Admin product.

---

## P. Limitations — read this before accepting

### P.1 The browser review has not been run

**This is the one §20 obligation not met.** The screen has not been opened in a
real browser at 1440 and 1280.

The Admin `(protected)` layout performs a **server-side** session check, so the
route cannot be reached without a real staff login, and the credential is
protected under CLAUDE.md §8a — it may not be read from `.env` and must be
requested from the operator for the run. It was not requested during this
session, so the pass was not performed.

What this leaves unproven: visual fidelity against the twelve frames, the rail
wrap at 1360px, table scroll containment, dialog fit at 1280, and horizontal
overflow at either width. `APP5-A02` found a real stylesheet defect this way
that no jsdom test could have caught — the production build here does compile
the SCSS, which closes that specific class of failure, but not the layout ones.

**To close it:** provide the Admin operator credential (through the prompt, not
a file) and the pass can be run against the dev stack, which is up.

### P.2 The dev API container predates the bridge

`embroidery-dev-api-1` has been running for 33 hours and has not been restarted
since the locator was added, so a live browser pass will need it rebuilt before
`quotationId` appears in the detail response.

### P.3 Scope held

A02, S01, S02, E01 and X01 were not started. Nothing was pushed.

---

## Q. Follow-ups

| Id | Note |
| --- | --- |
| `FU-APP6-A01-BROWSER-REVIEW-01` | **Open, blocking acceptance** — run the 1440/1280 browser pass once the operator supplies the credential (§P.1) |
| `FU-ADMIN-SHARED-DIALOG-01` | **Carried** — this is now the third hand-rolled Admin dialog; still unowned |
| `FU-APP6-B02-NULLABLE-OBJECT-TYPE-DEBT-01` | **Carried, not inherited** — the new field declares `type: String` explicitly |
| `FU-APP6-B03-REQUOTE-AFTER-ACCEPTANCE-01` | **Carried** — the accepted state offers no re-quote, matching the recorded position |
