# APP5-S01 — Customer Request Creation & Submission — Completion Report

## Verdict

```text
BLOCKED — CATALOG_VARIANT_PUBLIC_READ_REQUIRED
```

`APP5-S01` stopped at its design-and-contract audit. The approved catalog branch
requires a `productVariantId` that **no delivered public API can provide**, and
every way of proceeding without one either fabricates a value the database will
refuse or changes a contract this frontend checkpoint has no authority to change.

The Product Owner accepted the blocker on 2026-08-16 and routed it to a new
backend checkpoint:

```text
APP5-B07 — Public catalog variant selection
then APP5-S01 resumes unchanged in product scope
```

**Nothing was partially implemented.** No Storefront runtime source, no API, no
worker, no migration, no OpenAPI document, no generated client and no Figma node
was changed. The COP branch was deliberately **not** built: `S01` is one screen
whose first interaction is the catalog-XOR-COP chooser (`651:3`), and delivering
half of that fork would have produced a screen no approved frame draws, plus a
second review boundary for the half left behind.

---

## 1. Baseline

| Fact | Value |
|---|---|
| Branch | `production` |
| Entry HEAD | `5f000989d29d59f3eb914a99a1ca26befbad23b8` — *feat(app5): moderate a custom request with notes and guarded transitions* |
| Working tree at entry | clean |
| Accepted predecessors | `APP5-R00`, `G01`, `D01`, `B01`, `DB01`, `B02`, `B03`, `B04`, `B05` = `COMPLETE` |
| Design authority | `FIG-APPROVAL-APP5-D01-PO-001`, 2026-08-16 |
| Design gate | released — all 65 `APP5-D01` rows `APPROVED_FOR_IMPLEMENTATION` |

### 1.1 Approved design rows resolved for S01

All 28 `S01` rows in `docs/design/FIGMA_DESIGN_INDEX.md` §4.11 were resolved and
confirmed `APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP5-D01-PO-001`,
file `BQwqV8GdfUIELvsQDB1UQE`, page `APP_05`, route `/yeu-cau/moi`:

| Section | Nodes |
|---|---|
| Subject chooser | `651:3` |
| Catalog branch — default / quantity-invalid / session-expired | `650:3` · `650:94` · `650:187` |
| COP branch — default / validation | `651:40` · `651:138` |
| Verification (step 2) — contact / sent / mismatch / expired / verified | `652:3` · `652:55` · `652:115` · `652:175` · `652:229` |
| Upload (step 3) — empty / uploading / inspecting / accepted / rejected / cap | `654:3` · `654:66` · `654:138` · `654:214` · `654:309` · `654:397` |
| Submission — review / submitting / uncertain / failed / replay | `656:3` · `656:74` · `656:119` · `656:166` · `656:213` |
| Loading / context restore | `656:258` |
| Mobile 390 — catalog / COP / code-sent / upload-mixed / review | `658:3` · `658:59` · `658:114` · `658:160` · `658:222` |

The registry was **read only**. No row was added, edited or re-approved, and no
Figma node was opened for modification.

---

## 2. The blocker

### 2.1 What the catalog branch must send

`SubmitCustomRequestBody.catalog` (`CustomRequestCatalogSubject`, generated
contract) requires three ids, all `NOT NULL`:

```text
productId          — Published Product the request is for
productVariantId   — "Exact Product Variant. Required — a request without one cannot be quoted."
designSessionId    — the ACTIVE Design Session to submit
```

### 2.2 What the Storefront can obtain today

| Field | Obtainable? | From |
|---|---|---|
| `productId` | yes | `publicProductPlacementGet` → `PublicProductPlacementResponse.productId` |
| `designSessionId` | yes | the APP3 resume handle (`studio-resume-handle.ts`) / session bootstrap |
| `productVariantId` | **no** | — nothing publishes it |

### 2.3 Evidence that no public read yields a variant

Taken from the delivered artefacts, not from documentation prose:

1. **The published document has no variant surface.** Enumerating
   `packages/contracts/openapi/openapi.generated.json`: **56 paths**, of which 23
   are public. No path matches `/variant/i`. Enumerating every public operation's
   response schemas for `productVariantId` returns **zero operations**.

2. **The only schemas carrying `productVariantId` are post-submission reads or
   the write itself** — `AdminCatalogSubjectResponse`,
   `AdminRequestQuantityLineResponse`, `CatalogRequestSubjectResponse`,
   `RequestQuantityLineResponse` and `CustomRequestCatalogSubject`. The first four
   describe a request that already exists; they cannot inform the submission that
   creates it.

3. **The catalog read deliberately excludes variants.**
   `PublicProductDetailResponse` publishes `category`, `description`,
   `isDisplayOutOfStock`, `media`, `name`, `price`, `seo`, `slug` — no ids at all.
   `apps/api/src/modules/catalog/presentation/public-product.contract.spec.ts`
   asserts that `variant` is among the query parameters the public list
   **must reject**, so the omission is an enforced product decision, not an
   oversight to be patched from the frontend.

4. **A fabricated id is refused by the database, not merely unvalidated.**
   `migration 0012_create_request_and_design_case_tables.sql` adds
   `fk_custom_requests__product_variant_id` and
   `fk_custom_request_quantity_breakdowns__product_variant_id`, both
   `REFERENCES product_variants(id) ON DELETE restrict`. Any invented UUID fails
   at insert.

5. **The design's stated source for the variant does not carry one.**
   `APP5-D01` §E records `G01-D08` as *"`650:3` shows product **and** variant as
   read-only context from the Studio session"*, and `G01-D09` as *"`650:3` carries
   the note 'product, variant and design come from the Studio session — you enter
   no code here'; no input exists for it."* But:
   - `design_sessions.product_variant_id` is **nullable**, and no public
     design-session application service sets it — grepping
     `apps/api/src/modules/design/application/` for `productVariantId` returns
     nothing, so every anonymously-created session stores `NULL`;
   - `DesignSessionSnapshotResponse` and `DesignSessionScopeResponse` publish no
     `productVariantId` — and no `productId` either, only `productSlug`.

6. **The backend's own coherence check confirms the fact is absent.**
   `submit-custom-request.use-case.ts` `loadSubmittable()` compares the submitted
   variant to the session's only when the session has one:

   ```ts
   (session.productVariantId !== undefined &&
     session.productVariantId !== subject.productVariantId)
   ```

   Because public sessions always store `NULL`, that guard is inert for every
   Storefront-created session — the variant is not derived from the session, it
   is simply expected to arrive from somewhere that does not exist.

### 2.4 Why this is a §20 hard blocker

`APP5-S01` §20 permits a hard block on three conditions. **Two** are met at once:

| Condition | Met | How |
|---|---|---|
| 1 — approved D01 S01 needs data no delivered APP5/APP3/APP4 API can provide | **yes** | §2.3 items 1–3 |
| 2 — Storefront cannot carry APP3 design-session context into S01 without a new backend contract | **yes** | §2.3 items 5–6 |
| 3 — APP4 verification cannot produce a `SUBMISSION` challenge | no | APP4-S01 issues `IssueVerificationChallengeBodyPurpose.SUBMISSION` and reaches a verified state; only the *retention* of the verified challenge id needs work, which is ordinary frontend scope |

§20 also requires exhausting current capability before blocking. That was done:
the whole published document, every public controller, the catalog presentation
layer, the design-session application layer, the generated client and the
migration set were each checked for a route to a variant id. There is none.

---

## 3. Capability audit performed (no code written)

The audit went beyond the blocking field, so `B07` and the `S01` resume start
from a known state rather than re-deriving it.

| Area | Finding |
|---|---|
| `publicCustomRequestAsset_upload` | Generated as `publicCustomRequestAssetUpload(challengeId, body, params, options)`. The controller marks `Idempotency-Key` **required** (`@ApiHeader … required: true`), but Orval emits no parameter for it — the resume must pass it through `options.config.headers`, which `apiRequest` merges over the request config. |
| `publicCustomRequestAsset_status` | `CustomRequestAssetStatusResponse` carries `state` (`UPLOADED`/`INSPECTING`/`ACCEPTED`/`REJECTED`) **and** `bindable`, described as "true exactly when this id would be accepted in a submission". `bindable` — not a state comparison — is the correct gate for enabling submit. |
| `publicCustomRequest_submit` | Needs no idempotency header: the `challengeId` **is** the idempotency scope. No visible key field is therefore required, matching `656:213`. |
| APP4 verification reuse | `apps/storefront/src/features/contact-verification/` exposes only `VerificationQueryProvider`. More importantly, `verificationReducer`'s `VERIFIED` case sets `challenge: undefined` by design — APP4-S01 had no use for the id and dropping it was deliberate. `S01` needs that id for both B02 and B01, so the resume must add an explicit retained `verifiedChallengeId` rather than reinstate the whole challenge object (nothing downstream may answer it again). In-memory only; §5 forbids `localStorage`. |
| API-client boundary | The four APP5 public operations are generated but **not** re-exported from `packages/api-client/src/index.ts`. The repository's rule is that features never deep-import the generated tree, so the resume adds re-exports there — a handwritten boundary file, not generated output. |
| Storefront stack | No Zod and no form library are installed; APP4-S01 validates by hand through a reducer. `S01` follows that precedent rather than introducing a dependency. |

None of this was acted on. It is recorded so the resume does not repeat it.

---

## 4. What was explicitly **not** done

| Refused | Why |
|---|---|
| Ship a COP-only `S01` | The chooser `651:3` is the screen's first interaction; half a fork is a screen no approved frame draws |
| Permanently narrow `S01` to COP | Would silently delete approved scope (`650:3`, `650:94`, `650:187`, `658:3`) on a frontend checkpoint's authority |
| Make `productVariantId` optional | A backend contract change, and `G01-D08` requires the variant because a request without one cannot be quoted |
| Derive a default/first variant | No authority defines one; it would guess what the customer ordered |
| Add variant semantics to `publicProductPlacementGet` | Placement answers product → side → area; variants are a different axis |
| Set `design_sessions.product_variant_id` from the Studio | Mutating APP3 to carry a fact it never owned, to work around a missing read |
| Implement the variant API here | A backend operation inside a frontend checkpoint, past its review boundary |
| Use `650:187` ("design session expired") as a permanent fallback | The session has not expired; the copy would misattribute a platform gap to the customer's session |

---

## 5. The unblock

```text
APP5-B07 — Public catalog variant selection
```

One public read that lets an anonymous Storefront caller obtain a
request-selectable `productVariantId` for a published product, with whatever
display attributes the approved frames need to render the variant as context
(`650:3` shows it read-only; `673:3` keys every catalog quantity line to it).

Scope notes for whoever executes it — not decisions, and not binding:

- it is a **read**, and the public catalog is publication-gated, so it must not
  become a lifecycle-visibility parameter (see the `public-product.contract.spec.ts`
  rejection list);
- `CustomRequestQuantityLine` carries only `quantity` + `sizeLabel` and B01 sets
  the variant server-side from the subject, so `B07` decides how a **size label**
  relates to a variant — that question is `B07`'s, not `S01`'s;
- it is an **addition** to the eight-operation APP5 budget, like `APP5-B06`.

`APP5-S01` then resumes **unchanged in product scope**: both branches, all 28
approved rows, no re-approval needed.

---

## 6. Validation ledger

No runtime source changed, so no test, build, typecheck, lint, generation or gate
is justified. Running any would produce evidence about code this checkpoint did
not write.

| Command | Impact reason | Result | Reruns |
|---|---|---|---:|
| `git status --short` | confirm the tree was clean at entry and carries documentation only at exit | PASS — clean at entry; 2 documentation files at exit | 0 |
| `git rev-parse HEAD` | record the entry baseline | PASS — `5f00098` | 0 |
| `git diff --check` | documentation changed; catch whitespace defects | PASS — no findings | 0 |

Contract and source reads used as evidence (read-only, no execution):
`packages/contracts/openapi/openapi.generated.json`,
`packages/api-client/src/generated/embroidery-api.{ts,schemas.ts}`,
`packages/api-client/src/index.ts`,
`packages/api-client/src/clients/api-request.mutator.ts`,
`apps/api/src/modules/order/presentation/public-custom-request-asset.controller.ts`,
`apps/api/src/modules/order/application/submit-custom-request.use-case.ts`,
`apps/api/src/modules/catalog/presentation/public-product.contract.spec.ts`,
`apps/api/src/modules/design/application/**`,
`packages/database/migrations/0012_create_request_and_design_case_tables.sql`,
`apps/storefront/src/features/contact-verification/**`,
`apps/storefront/src/features/design-studio/model/studio-resume-handle.ts`,
`docs/design/FIGMA_DESIGN_INDEX.md`,
`docs/implementation/reports/APP5-D01-COMPLETION-REPORT.md`.

**Not run, and correctly so:** frontend tests, backend tests, DB tests, full
monorepo Jest, Playwright/E2E, OpenAPI generation, API-client generation, the
Figma registry checker, historical APP3/APP4 gates, SonarQube, and any
all-workspace build or typecheck.

---

## 7. Files changed

| File | Change |
|---|---|
| `docs/implementation/phases/APP5-CUSTOM-REQUESTS.md` | §10.1 — `APP5-B07` inserted before `S01`; `S01` → `BLOCKED`. New §10.6 recording the blocker, its evidence, the routing decision and the refused unblocks |
| `docs/implementation/reports/APP5-S01-COMPLETION-REPORT.md` | this report (new) |

Documentation only. Zero runtime files.

---

## 8. Roadmap

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
APP5-B07  = INCOMPLETE  NEXT
APP5-S01  = BLOCKED     waits for B07
APP5-S02  = INCOMPLETE
APP5-A01  = INCOMPLETE
APP5-B06  = INCOMPLETE  before A02
APP5-A02  = INCOMPLETE
APP5-E01  = INCOMPLETE
APP5-X01  = INCOMPLETE
```

---

## 9. Residual risks

1. **`B07` decides a product question, not only a technical one.** The public
   catalog deliberately publishes no ids and rejects `variant` as a query
   parameter. `B07` opens a variant surface for the first time and should say
   explicitly what a customer may see and select, rather than inheriting the
   answer from whatever the frame happens to render.

2. **The size-label ↔ variant relationship is unresolved.**
   `CustomRequestQuantityLine` carries `sizeLabel` and no variant; B01 sets the
   variant from the subject. If a catalog product's sizes *are* its variants,
   `650:3`'s per-variant quantity table and the flat breakdown contract describe
   the same data twice. `B07` should settle it before `S01` renders it.

3. **`650:187` has no cause left once `B07` lands.** It is drawn for a stale or
   missing design session. It was not repurposed here; the resume should confirm
   it still has a reachable trigger.

4. **Two APP5 checkpoints have now been discovered by their consumer** — `B06`
   by `B04`, `B07` by `S01`. Both are reads a frontend needed that no
   authority-level table inventory would have surfaced. `APP5-X01` should carry
   this to the APP6 phase-entry audit: audit the **reads a surface will need**,
   not only the tables and policies it will write.

5. **A verified challenge is short-lived.** Whenever `S01` resumes, the flow
   holds a verified `SUBMISSION` challenge across contact entry → uploads →
   review → submit. Its expiry is the real budget for that whole path, and the
   approved frames cover expiry during verification but should be re-checked for
   expiry *after* it.

---

NEXT CHECKPOINT: APP5-B07 — Public catalog variant selection
