# APP5-S01 — Customer Request Creation & Submission — Completion Report

## Verdict

```text
APP5-S01 = COMPLETE
```

The Storefront capability at `/yeu-cau/moi` creates and submits a custom
embroidery request on **both** subject branches: a catalog product with one
explicitly chosen Product Variant and its APP3 Design Session, or a
customer-owned product with at least one accepted item photo. Contact
verification is APP4's own flow embedded as step 2; uploads go through
`APP5-B02` and are gated on its `bindable` flag; submission goes through
`APP5-B01` and hands off to the `APP5-S02` destination without implementing any
of it.

---

## 1. Baseline and unblock

**Entry `HEAD`:** `0f0275d` (*feat(app5): publish the selectable variants of a
public product*).

**The previous S01 verdict was a genuine blocker, and it is preserved here as
history.** This checkpoint's first attempt stopped at its design-and-contract
audit with:

```text
BLOCKED — CATALOG_VARIANT_PUBLIC_READ_REQUIRED
```

`SubmitCustomRequestBody.catalog.productVariantId` was required and **no
delivered public API produced one**: 56 paths / 23 public, no path matching
`variant`, no public response schema carrying it, and
`fk_custom_requests__product_variant_id` is `ON DELETE restrict`, so a fabricated
id would have failed at insert. The Product Owner refused every workaround — no
COP-only S01, no optional `productVariantId`, no derived default, no variant
semantics grafted onto the APP3 session — and inserted a new backend checkpoint
instead. **Nothing was partially built**, because the subject chooser (`651:3`)
is the screen's first interaction and half that fork is a screen no approved
frame draws.

**Closed by `APP5-B07` (`COMPLETE`, commit `0f0275d`):**

```text
GET /api/public/products/{slug}/variants
operationId: publicProductVariant_list   (generated: publicProductVariantList)
returns:     productId + [{ productVariantId, colorName, sizeLabel }]
```

The blocker was **consumed, not re-audited**: this checkpoint read the generated
operation and its response schema and built the catalog branch on them. No
question about whether a public variant contract exists was reopened.

**Figma approval evidence used.** `docs/design/FIGMA_DESIGN_INDEX.md` §4.11 was
read at entry. All 31 `APP5-S01` rows (26 desktop + 5 mobile) are
`APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP5-D01-PO-001`, file
`BQwqV8GdfUIELvsQDB1UQE`, page `APP_05`, `Last Verified 2026-08-16`. No Figma
node was opened for writing, and **no registry row was added, edited or
promoted** — S01 consumes the registry and does not change it, so
`CMD-CHECK-FIGMA-DESIGN-INDEX` is not owed
(`VALIDATION_GOVERNANCE.md` §3: the gate is justified by a *change* to design or
registry authority).

---

## 2. Design traceability

Every implemented surface maps to an approved node. The registry id is the
authority; the node id is repeated for readability.

| Surface / state | Registry id | Node | Where it is implemented |
|---|---|---|---|
| Subject chooser (XOR) | `FIG-APP5-S01-SUBJECT-CHOOSER-DESKTOP` | `651:3` | `ui/subject-chooser.tsx` |
| Catalog step 1 — default | `FIG-APP5-S01-CATALOG-DESKTOP-DEFAULT` | `650:3` | `ui/catalog-subject-section.tsx` + `ui/variant-selector.tsx` |
| Catalog step 1 — quantity invalid | `FIG-APP5-S01-CATALOG-DESKTOP-QTYINVALID` | `650:94` | `ui/quantity-breakdown-section.tsx` |
| Catalog step 1 — design session expired | `FIG-APP5-S01-CATALOG-DESKTOP-SESSIONEXPIRED` | `650:187` | `ui/catalog-subject-section.tsx` (`sessionUnusable`) |
| COP step 1 — default | `FIG-APP5-S01-COP-DESKTOP-DEFAULT` | `651:40` | `ui/customer-owned-section.tsx` |
| COP step 1 — validation | `FIG-APP5-S01-COP-DESKTOP-VALIDATION` | `651:138` | `ui/customer-owned-section.tsx` (`showValidation`) |
| Step 2 — contact entry | `FIG-APP5-S01-VERIFY-DESKTOP-CONTACT` | `652:3` | `ui/verification-step.tsx` → APP4 `ContactEntryCard` |
| Step 2 — code sent | `FIG-APP5-S01-VERIFY-DESKTOP-CODESENT` | `652:55` | APP4 `CodeEntryCard` |
| Step 2 — code mismatch | `FIG-APP5-S01-VERIFY-DESKTOP-MISMATCH` | `652:115` | APP4 `CodeEntryCard` (`notice`) |
| Step 2 — expired / lockout / rate limited | `FIG-APP5-S01-VERIFY-DESKTOP-EXPIRED` | `652:175` | APP4 `VerificationOutcomeCard` |
| Step 2 — verified, step 3 unlocked | `FIG-APP5-S01-VERIFY-DESKTOP-SUCCESS` | `652:229` | `ui/verification-step.tsx` + `hooks/use-verified-challenge.ts` |
| Step 3 — empty, COP image required | `FIG-APP5-S01-UPLOAD-DESKTOP-EMPTY` | `654:3` | `ui/upload-role-panel.tsx` |
| Step 3 — uploading | `FIG-APP5-S01-UPLOAD-DESKTOP-UPLOADING` | `654:66` | `ui/upload-slot-tile.tsx` (`phase: 'UPLOADING'`) |
| Step 3 — inspection pending | `FIG-APP5-S01-UPLOAD-DESKTOP-INSPECTING` | `654:138` | `ui/upload-slot-tile.tsx` (`INSPECTING`) |
| Step 3 — accepted + reference | `FIG-APP5-S01-UPLOAD-DESKTOP-ACCEPTED` | `654:214` | `ui/upload-slot-tile.tsx` (`ACCEPTED`) |
| Step 3 — rejected (three reason classes) | `FIG-APP5-S01-UPLOAD-DESKTOP-REJECTED` | `654:309` | `ui/upload-slot-tile.tsx` + `CUSTOM_REQUEST_COPY.uploadFailure` |
| Step 3 — cap reached (10 per role) | `FIG-APP5-S01-UPLOAD-DESKTOP-CAP` | `654:397` | `ui/upload-role-panel.tsx` (`capReached` / `quotaReached`) |
| Step 3 — review & submit | `FIG-APP5-S01-SUBMIT-DESKTOP-REVIEW` | `656:3` | `ui/review-section.tsx` |
| Step 3 — submitting (duplicate-safe) | `FIG-APP5-S01-SUBMIT-DESKTOP-SUBMITTING` | `656:74` | `ui/submit-panel.tsx` (`isSubmitting`) |
| Step 3 — uncertain outcome, safe retry | `FIG-APP5-S01-SUBMIT-DESKTOP-UNCERTAIN` | `656:119` | `model/submission-outcome.ts` → `UNCERTAIN` |
| Step 3 — submission failed | `FIG-APP5-S01-SUBMIT-DESKTOP-FAILED` | `656:166` | `model/submission-outcome.ts` → `FAILED` |
| Step 3 — idempotent replay | `FIG-APP5-S01-SUBMIT-DESKTOP-REPLAY` | `656:213` | `hooks/use-request-submission.ts` (`onSuccess`) |
| Loading / context restore | `FIG-APP5-S01-DESKTOP-LOADING` | `656:258` | `ui/catalog-subject-section.tsx` (`LOADING`) + the entry-context effect |
| Mobile 390 — catalog | `FIG-APP5-S01-CATALOG-MOBILE-DEFAULT` | `658:3` | `styles/custom-request.scss` (base, stacked) |
| Mobile 390 — COP | `FIG-APP5-S01-COP-MOBILE-DEFAULT` | `658:59` | `styles/custom-request.scss` |
| Mobile 390 — code sent | `FIG-APP5-S01-VERIFY-MOBILE-CODESENT` | `658:114` | APP4 `contact-verification.scss` (reused) |
| Mobile 390 — accepted & rejected | `FIG-APP5-S01-UPLOAD-MOBILE-MIXED` | `658:160` | `styles/custom-request.scss` (tile wrap) |
| Mobile 390 — review & submit | `FIG-APP5-S01-SUBMIT-MOBILE-REVIEW` | `658:222` | `styles/custom-request.scss` |
| Rule matrices — subject, assets, submit-once, responsive | `673:3` · `673:65` · `673:139` · `674:69` | — | `model/custom-request-flow.ts`, `model/request-asset-slot.ts`, `model/submission-outcome.ts` |

**One reading of `650:3` is deliberately not literal, and it is the Product
Owner's locked decision (`APP5-S01` §3.1).** The frame carries the note
*"product, variant and design come from the Studio session — you enter no code
here"* and draws the variant as read-only context. `APP5-B07` marks **no variant
as a default**, so there is nothing for the screen to display read-only; the
approved section becomes an explicit chooser instead. The frame's actual
requirement — that the customer types no id — is honoured exactly: the product
slug, side and area arrive in the URL, the Design Session id is read from APP3's
own placement-keyed handle, and no id is an editable field anywhere on the
screen. The Figma registry states that it does not override business, lifecycle
or database authority, and this is that case.

---

## 3. Catalog semantics

Stated explicitly, as `APP5-S01` §29 requires:

- **One Product.** `productId` comes from the same `APP5-B07` response that
  published the variants, never from a second read that could disagree with it.
- **One explicitly selected real Variant.** The customer must click one option
  from the published list. `subjectReady()` returns `false` while
  `selectedVariantId` is `undefined`, and the quantity table is disabled until
  then.
- **No default, primary, fallback or first-row Variant.** No `defaultChecked`,
  no selecting effect, and no function in `model/variant-option.ts` returns "the"
  variant — `selectionStillEligible()` only answers whether a choice the customer
  already made survives a refetch.
- **Quantity breakdown is scoped to that one Variant.**
  `CustomRequestQuantityLine` is `{ quantity, sizeLabel? }` and carries no
  variant id; the props of `QuantityBreakdownSection` have nowhere to put one.
  A second variant per request is unrepresentable rather than merely unrendered.
- **`product_variants.sizeLabel` is *not* treated as equivalent to
  `CustomRequestQuantityLine.sizeLabel`.** Nothing copies, defaults, locks,
  rewrites or validates one against the other. The catalog journey test proves it
  by choosing the variant labelled `L` and typing `XL` on the quantity line.
- **An empty variant list is not a stale Design Session.** `variants: []` is a
  200 about a published product and renders its own in-step treatment with
  progression disabled and no auto-switch to the COP branch; `650:187` is
  reserved for a Design Session that is actually missing or unusable. Two
  independent gates (§6.4), asserted separately.

The four catalog outcomes §17 forbids collapsing are four values of one union in
`hooks/use-catalog-variants.ts` — `READY`, `EMPTY`, `PRODUCT_UNAVAILABLE`,
`FAILED` — with the session gate orthogonal to all four. The
`PRODUCT_UNAVAILABLE` copy says only that the product was not found: draft,
archived and non-public-category are one indistinguishable answer at the API and
read identically on screen.

---

## 4. API usage

Every call goes through a **generated operation**. No path string exists in the
feature, and no endpoint was hand-written or duplicated.

| Purpose | Generated operation | Checkpoint |
|---|---|---|
| Catalog variant list | `publicProductVariantList` | `APP5-B07` |
| Issue verification challenge | `publicVerificationIssue` | `APP4-B03` |
| Resend challenge | `publicVerificationResend` | `APP4-B03` |
| Submit verification attempt | `publicVerificationSubmitAttempt` | `APP4-B04` |
| Read challenge status (refusal disambiguation only) | `publicVerificationReadStatus` | `APP4-B04` |
| Upload one customer image | `publicCustomRequestAssetUpload` | `APP5-B02` |
| Read one image's inspection state | `publicCustomRequestAssetStatus` | `APP5-B02` |
| Submit the request | `publicCustomRequestSubmit` | `APP5-B01` |

The four APP4 operations are reached through the existing
`contact-verification` feature, unchanged — S01 imports its hook and its three
approved cards rather than re-implementing the flow.

**The one thing the generated layer cannot express.** `APP5-B02` requires an
`Idempotency-Key` header and Orval emits no parameter for it, so it travels
through the operation's own per-call config (`ApiRequestOptions.config.headers`)
— the same seam `APP3-B06B`'s session upload already uses. `Content-Type` is
deliberately left unset there so Axios derives the multipart boundary from the
`FormData`; a literal `multipart/form-data` would overwrite it with a value that
has no boundary. The key is minted once per customer action and **reused by every
retry of that action**, which is what stops one retry from creating a second
stored asset.

**The design-session credential is not in any payload.** `catalog.designSessionId`
is documented as authorized by the host-only `HttpOnly` session cookie the
browser attaches to the same-origin submission; nothing in this feature reads or
could read it.

---

## 5. Api-client boundary

`packages/api-client/src/index.ts` — curated exports added, following the file's
existing per-checkpoint convention:

```text
operations  publicProductVariantList
            publicCustomRequestAssetUpload
            publicCustomRequestAssetStatus
            publicCustomRequestSubmit
enums       PublicCustomRequestAssetUploadRole
            CustomRequestAssetStatusResponseState
types       PublicProductVariantListResponse · PublicProductVariantResponse
            CustomRequestAssetIntakeResponse · CustomRequestAssetStatusResponse
            CustomRequestAssetBinding · CustomRequestCatalogSubject
            CustomRequestCustomerOwnedProduct · CustomRequestQuantityLine
            CustomRequestSubmissionResponse · SubmitCustomRequestBody
```

**Deliberately withheld:** `publicCustomRequestStatus` (`APP5-B03`). Its consumer
is `APP5-S02` and it is a grant-scoped read, not part of creation — it is
released when that screen exists, on its own terms. No Admin APP5 operation was
exported.

**No generated file was edited and nothing was regenerated.**
`packages/api-client/src/generated/**` and the committed OpenAPI artifact are
byte-identical to `HEAD`.

Two Storefront feature boundaries were also widened, consumer-driven and
read-only:

- `features/contact-verification/index.ts` — the flow hook, its type, the three
  approved cards and the UI-state helpers. The **screen** is still not exported:
  it owns the `h1` and page layout of its own route, which is exactly what an
  embedded step must not bring with it.
- `features/design-studio/index.ts` — `readResumeHandle` and `StudioResumeScope`.
  The **reader only** — not the writer, not the clearer — so Session ownership
  stays with APP3. The id authorizes nothing on its own; the `HttpOnly` secret
  that does is unreadable to both features alike.

---

## 6. Flow coverage

```text
/yeu-cau/moi
├── subject XOR (651:3) — neither preselected; choosing clears the other branch
├── CATALOG
│   ├── placement from the URL (san-pham / mat / vung), no id typed
│   ├── Design Session from APP3's placement-keyed handle → 650:187 when absent
│   ├── publicProductVariantList → READY / EMPTY / UNAVAILABLE / FAILED
│   ├── one explicit variant; withdrawal on refetch returns to step 1
│   └── quantity breakdown, required, scoped beneath that variant
├── CUSTOMER_OWNED
│   ├── name (required), description, width/height mm against the contract pattern
│   └── quantity breakdown, permitted
├── step 2 — APP4 verification, embedded
│   └── verifiedChallengeId retained in S01 flow state
├── step 3 — APP5-B02 uploads
│   ├── COP_IMAGE (COP branch, ≥1 bindable required) + REFERENCE (both branches)
│   ├── ATTACHMENT is not a value of any type here
│   └── bounded polling: terminal state · 60-attempt budget · unmount · challenge
├── review (656:3) — labels and masks only, no ids, no quote/payment language
├── submit — APP5-B01
└── → /yeu-cau/da-gui?ma=<code>
```

**The retained challenge id, and why it is not a session.** APP4's
`verificationReducer` clears `challenge` on `VERIFIED` on purpose. S01 observes
the id while it is on screen and reads it once at the success edge
(`hooks/use-verified-challenge.ts`); APP4 is untouched — same reducer, same
actions, same moment of forgetting. The id lives in the S01 flow reducer only:
no `localStorage`, no `sessionStorage`, no cookie, no URL. It is cleared on
`VERIFICATION_RESET` and on `FLOW_RESET` after a successful hand-off, so it dies
with the screen.

**S02 is not implemented.** `/yeu-cau/da-gui` exists as a route module that
renders nothing and deliberately does not read the `ma` parameter — the code
treatment, the secure-link explanation and the status entry are `APP5-S02`'s
frames (`660:3`, `661:*`). A route test asserts the segment renders an empty
container.

---

## 7. Submission safety

| Requirement | Mechanism |
|---|---|
| No double-fire | Two mechanisms. The action is `disabled` while in flight, **and** `useRequestSubmission` refuses a second `submit()` before the first settles via a synchronous ref — `isPending` is state, so two clicks in one tick would both read the pre-render value. |
| Replay is success | A replay returns the original result with the same request code and a 201, so it arrives in `onSuccess` and is treated as exactly what it is. |
| Recoverable network failure | Maps to `UNCERTAIN` (`656:119`). Nothing is reset; the retry re-sends the **identical body**, which the challenge-scoped idempotency turns into a replay. Asserted by comparing the two recorded call arguments. |
| Idempotency conflict | `IDEMPOTENCY_CONFLICT` → `CONFLICT`. No retry control is rendered and **no fresh challenge is issued automatically**; the only action is an explicit "verify again". |
| Concurrent attempt | `DUPLICATE_OPERATION` → `IN_PROGRESS`, retryable. |
| No client idempotency key | `SubmitCustomRequestBody` has no such field; the challenge id *is* the scope. No idempotency control is drawn or built. |

Outcomes are mapped from `NormalizedApiError.code` and the HTTP status, never
from `message`. A 4xx whose body failed to parse still normalizes to the client
code `MALFORMED_RESPONSE`, so the status is checked **first** — treating that as
"never happened" would offer a retry for a request the server already rejected.

**Upload rejection privacy (§12).** `AssetSlot.failure` is a union of six bounded
classes; it is not a string and cannot carry server prose. A test supplies a
refusal whose message contains `fk_custom_requests__product_variant_id` and
asserts the whole document body never contains it.

---

## 8. Focused validation ledger

| Command / test | Impact reason | Result | Reruns |
|---|---|---|---:|
| `pnpm --filter @embroidery/storefront exec jest --testPathPatterns="custom-request"` (`CMD-TEST-APP5-S01-STOREFRONT`) | The checkpoint's own model, component and route suites | **PASS** — 4 suites / 57 tests | 0 |
| `npx jest test/unit/custom-request-model.test.ts` | Decision layer, during development | **PASS** — 26 tests | 0 |
| `npx jest test/components/custom-request-catalog.test.tsx` | Catalog branch, during development | **PASS** — 12 tests | 3 |
| `npx jest test/components/custom-request-cop.test.tsx` | COP branch, uploads, submit-once | **PASS** — 16 tests | 3 |
| `npx jest test/components/custom-request-route.test.tsx` | New App Router segments | **PASS** — 3 tests | 0 |
| `npx tsc --noEmit` (`apps/storefront`) | New feature, new routes, widened feature boundaries | **PASS** (exit 0) | 2 |
| `npx tsc --noEmit` (`packages/api-client`) | Curated exports changed | **PASS** (exit 0) | 0 |
| `npx eslint` on the changed Storefront source and test files | Changed frontend files | **PASS** (exit 0) | 2 |
| `npx eslint packages/api-client/src/index.ts` | Curated boundary changed | **PASS** (exit 0) | 0 |
| `npx prettier --write` on every changed file | Formatting hygiene | applied; suites and typecheck re-run green afterwards | 0 |

The three catalog reruns were a Jest hoist-TDZ error in the navigation mock, two
label collisions between a section's `aria-label` and a field's `<label>`, and a
missing refetch trigger — each fixed at its cause. Two of those collisions were
**real accessibility defects**, not test artefacts: the step-1 continue button
shared its accessible name with the rail's step-2 button, and the two file inputs
on the COP branch shared one name; both now have distinct copy.

**Explicitly not run**, per `APP5-S01` §22 and `VALIDATION_GOVERNANCE.md` §3 — no
API runtime, database, worker, OpenAPI document, generated client or Figma
artefact changed, so none of these is justified:

```text
APP5-B01/B02/B03/B04/B05 suites · APP5-B07 suite · APP5-DB01 · any backend test
full Storefront suite · full monorepo Jest · Playwright / E2E · Admin · worker
DB regression · OpenAPI generation or check · generated-client generation
Figma registry checker · APP3/APP4 historical gates · SonarQube
all-workspace build or typecheck
```

No Storefront production build was run: the new route segments are proved by
typecheck plus `custom-request-route.test.tsx`, which imports both page modules
and asserts their metadata and rendered output — the §23 condition for skipping
the build. No green result was re-run on an unchanged tree.

---

## 9. Responsive and accessibility

Implemented against `658:3` · `658:59` · `658:114` · `658:160` · `658:222`
(mobile 390) and the desktop 1440 frames, using the existing Storefront
breakpoint (`$bp-shell-wide: 768px`, mirrored from the shell exactly as
`contact-verification.scss` mirrors it) and `@embroidery/styles` tokens. Base
styles are the mobile stack; the step rail moves beside the content column at the
breakpoint. Three local literals (10, 14, 20 px) are documented in the sheet,
following the `APP2-S02` / `APP4-S01` precedent — inventing shared scale steps to
suit one screen would change a foundation. **No new design-system asset was
created.**

Accessibility, asserted by the suites rather than described:

- the subject choice and the variant choice are native radio **groups** in
  `<fieldset>`/`<legend>` — one tab stop, arrow-key navigation, and a state
  announced as "n of m" without any ARIA of our own;
- every field is associated by `<label for>`, with `aria-invalid` and
  `aria-describedby` pointing at its own error (the layer-naming contract
  `APP5-D01` §G records for exactly this);
- upload status is **text first** (`role="status"`), never colour alone, and the
  file inputs are ordinary keyboard-operable `<input type="file">` with distinct
  accessible names per role;
- the submitting state is announced through a polite live region, because the
  approved frame replaces the button label and a screen reader would otherwise
  experience a button that simply stopped responding;
- one `<h1>` for the page and `<h2>`/`<h3>` for sections — the shell keeps the
  single `main` landmark, and the screen adds no second one.

---

## 10. Files changed

**Added — Storefront feature** (`apps/storefront/src/features/custom-request/`):

```text
api/custom-request.client.ts
hooks/use-catalog-variants.ts · use-request-submission.ts
      use-request-uploads.ts · use-verified-challenge.ts
model/catalog-entry-context.ts · custom-request-copy.ts · custom-request-flow.ts
      custom-request-query-keys.ts · customer-owned-draft.ts
      quantity-breakdown.ts · request-asset-slot.ts · step-readiness.ts
      submission-outcome.ts · submission-payload.ts · variant-option.ts
ui/catalog-subject-section.tsx · custom-request-query-provider.tsx
   custom-request-screen.tsx · customer-owned-section.tsx
   quantity-breakdown-section.tsx · review-section.tsx · step-rail.tsx
   subject-chooser.tsx · submit-panel.tsx · upload-role-panel.tsx
   upload-slot-tile.tsx · variant-selector.tsx · verification-step.tsx
styles/custom-request.scss
index.ts
```

**Added — routes:** `src/app/yeu-cau/moi/page.tsx`,
`src/app/yeu-cau/da-gui/page.tsx`.

**Added — tests:** `test/unit/custom-request-model.test.ts`,
`test/components/custom-request-{catalog,cop,route}.test.tsx`,
`test/support/custom-request-fixture.ts`.

**Modified:** `apps/storefront/src/styles/main.scss` (feature sheet composed),
`apps/storefront/src/features/contact-verification/index.ts` (flow exports),
`apps/storefront/src/features/design-studio/index.ts` (resume-handle reader),
`packages/api-client/src/index.ts` (curated APP5 public exports),
`docs/implementation/phases/APP5-CUSTOM-REQUESTS.md`,
`docs/implementation/SCOPED_COMMAND_INDEX.md`, this report.

**Unchanged, and verified so:** API runtime, database and migrations, worker,
the committed OpenAPI artifact, `packages/api-client/src/generated/**`, and every
Figma node and registry row.

Largest runtime file: `ui/custom-request-screen.tsx` at 372 lines (limit 400).
Largest test file: `custom-request-cop.test.tsx` at 391 lines (limit 600).

---

## 11. Roadmap

```text
APP5-R00  = COMPLETE
APP5-G01  = COMPLETE
APP5-D01  = COMPLETE
APP5-B01  = COMPLETE
APP5-DB01 = COMPLETE
APP5-B02  = COMPLETE
APP5-B03  = COMPLETE
APP5-B04  = COMPLETE
APP5-B05  = COMPLETE
APP5-B07  = COMPLETE
APP5-S01  = COMPLETE
APP5-S02  = INCOMPLETE  NEXT
APP5-A01  = INCOMPLETE
APP5-B06  = INCOMPLETE  before A02
APP5-A02  = INCOMPLETE
APP5-E01  = INCOMPLETE
APP5-X01  = INCOMPLETE
```

`APP5-B06` (Admin private request-asset delivery) is carried forward unchanged
and still precedes `APP5-A02`. It does not affect S01 and was not implemented.

---

## 12. Residual risks

Real, unresolved, and none of them reopens the closed variant contract.

1. **No entry point into the catalog branch exists yet.** `/yeu-cau/moi` reads
   the placement from `?san-pham=…&mat=…&vung=…`, but nothing links to it: the
   `APP3` Studio has no "request this design" control, and `APP5-D01` draws none
   on any S01 frame. Reaching the catalog branch today means arriving with the
   query string already set. Adding the control would mean changing an APP3
   surface with no approved frame for it, which is outside this checkpoint.
   → **`FU-APP5-S01-STUDIO-ENTRY-01`**, for `APP5-E01` to route.
2. **The COP branch has no entry point either**, for the same reason — no
   navigation surface links to `/yeu-cau/moi` at all. Same follow-up.
3. **Upload quota classes are inferred from HTTP status.** `APP5-B02` publishes
   no distinct business code for a per-challenge quota refusal, so a 429 is shown
   as the quota class and a 422 as processing-failed. Both are truthful bounded
   classes and neither leaks server prose, but a customer who has hit the
   challenge-wide cap may read a slightly generic sentence. Narrowing it needs a
   backend error code, not a frontend change.
4. **Polling has no visible "we stopped asking" state.** After the 60-attempt
   budget (~2 minutes) a slot stops polling and stays on its last known state.
   The customer can remove and re-upload, but no frame draws an explicit
   timed-out treatment and none was invented.
5. **`650:187` is reached from the browser's own storage, not from the server.**
   A Design Session whose handle is present but which the server has since
   expired is only discovered at submit, where `SESSION_EXPIRED` maps to the same
   approved copy. Pre-validating would mean calling
   `publicDesignSessionResume`, which **rotates the session secret** and would
   break a Studio tab the customer still has open — so it is deliberately not
   done.
6. **The review step shows counts, not thumbnails.** `APP5-B02` publishes no
   customer-facing binary read for an unbound asset, so accepted images are
   summarised numerically. `APP5-B06` delivers the Admin-side binary and is not a
   customer surface.

---

## 13. Commit

```text
feat(app5): create and submit a custom request from the storefront
```

Committed on `production`. **Not pushed.**

---

NEXT CHECKPOINT: APP5-S02 — Confirmation & grant-scoped status
