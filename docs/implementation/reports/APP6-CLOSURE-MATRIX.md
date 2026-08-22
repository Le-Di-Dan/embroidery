# APP6 — Canonical Closure Matrix

Built by `APP6-X01` from repository truth: Git history, the committed OpenAPI
artifact, the migration directory, the Figma registry and the accepted
completion reports. Where this matrix and older planning prose disagree, **this
matrix is the current world**.

```text
APP6     = COMPLETE — PASS_WITH_FOLLOW_UPS
APP6-E01 = COMPLETE (E01-C1 incorporated)
APP6-X01 = COMPLETE
blocking follow-ups = 0
APP7 = NOT_STARTED
```

---

## 1. Canonical checkpoint count

```text
canonical delivered checkpoints = 20
closure checkpoint              = APP6-X01 (this one)
canonical total                 = 21
corrections incorporated        = 3 (G01-C1, A01-C1, E01-C1)
```

`APP6-R00` removed the four contract slices `APP6-C01…C04` and re-split the
original backend slices; §11.2 of the phase plan holds that disposition and is
not restated here. No checkpoint was added or cancelled after `R00`.

---

## 2. Checkpoint ledger — 21 canonical checkpoints in 22 rows

| # | ID | Type | Final status | Acceptance | Commit(s) | Primary outcome / evidence pointer | Blocking FU | Nonblocking FU |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | APP6-R00 | phase entry | COMPLETE | accepted | `c7d0b9b`, `0da79ae` | Phase-entry audit; `APP6_SCHEMA_DISPOSITION = MIGRATION_REQUIRED`, design gate `DESIGN_REQUIRED_BEFORE_UI_ONLY`; `C01…C04` removed — [`APP6-R00-COMPLETION-REPORT.md`](./APP6-R00-COMPLETION-REPORT.md) | 0 | 0 |
| 2 | APP6-G01 | authority | COMPLETE | accepted | `fc1a346`, `a893490` | APP6 authority locked (`IMP-D051`), `ADR-APP6-001`; a COP request has no Design Session — [`APP6-G01-COMPLETION-REPORT.md`](./APP6-G01-COMPLETION-REPORT.md) | 0 | 0 |
| 3 | APP6-G01-C1 | authority correction | COMPLETE | accepted | `decfe8b`, `eef9232` | Agreement authority aligned to the required type set `[PAYMENT_POLICY, RETURN_POLICY]` — [`APP6-G01-C1-COMPLETION-REPORT.md`](./APP6-G01-C1-COMPLETION-REPORT.md) | 0 | 0 |
| 4 | APP6-DB01 | database change | COMPLETE | accepted | `b7b0dfe`, `a4f9212` | Migration `0036_add_app6_cop_design_context` — COP design context physically representable, Catalog/COP XOR — [`APP6-DB01-COMPLETION-REPORT.md`](./APP6-DB01-COMPLETION-REPORT.md) | 0 | 2 |
| 5 | APP6-D01 | design | COMPLETE — PRODUCT_OWNER_APPROVED | PO-approved | `0ac6953`, `636b2a2`; approval recorded at `1f5ba22` | 56 rows on `APP_06` `678:3`, `FIGMA_DESIGN_INDEX.md` §4.12, all `APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP6-D01-PO-001` — [`APP6-D01-COMPLETION-REPORT.md`](./APP6-D01-COMPLETION-REPORT.md) | 0 | 0 |
| 6 | APP6-B01 | backend | COMPLETE | accepted | `1f5ba22`, `f1ab02b` | `adminQuotation_create` / `_addVersion` — TR-LC12-01, DB4 round-half-up deposit split, APP6 policy publication — [`APP6-B01-COMPLETION-REPORT.md`](./APP6-B01-COMPLETION-REPORT.md) | 0 | 3 |
| 7 | APP6-B02 | backend | COMPLETE | accepted | `6c63f1a`, `58d8b93` | `adminQuotation_versionHistory` / `_versionDetail` — the domain projection, not the schema, was the blocker — [`APP6-B02-COMPLETION-REPORT.md`](./APP6-B02-COMPLETION-REPORT.md) | 0 | 1 |
| 8 | APP6-B03 | backend | COMPLETE | accepted | `0d08be5`, `0bf822d` | `adminQuotation_sendVersion` — supersedes every prior sent version, not only n-1; closes the `current_quotation_id` pointer — [`APP6-B03-COMPLETION-REPORT.md`](./APP6-B03-COMPLETION-REPORT.md) | 0 | 2 |
| 9 | APP6-B04 | backend | COMPLETE | accepted | `cef99b7`, `f4c2591`, `63393e9` | `publicQuotation_current` — grant-scoped customer read; the pointer was unreachable through both existing Ordering contracts — [`APP6-B04-COMPLETION-REPORT.md`](./APP6-B04-COMPLETION-REPORT.md) | 0 | 1 |
| 10 | APP6-B05 | backend | COMPLETE | accepted | `4d18ee3`, `fb653fb` | `publicQuotation_accept` / `_reject` — `update quotations` key-share-locks the parent request row, so the request is locked first — [`APP6-B05-COMPLETION-REPORT.md`](./APP6-B05-COMPLETION-REPORT.md) | 0 | 2 |
| 11 | APP6-B06 | backend | COMPLETE | accepted | `bf7e6fa`, `613e6c0` | Digitizing transition, **0 new operations** — `GRD-005` is the allow-list row itself, so there is no override branch — [`APP6-B06-COMPLETION-REPORT.md`](./APP6-B06-COMPLETION-REPORT.md) | 0 | 1 |
| 12 | APP6-B07 | backend | COMPLETE | accepted | `052e1d7`, `34bdef7` | `adminCustomRequestSubmittedDesign_get` — the exactness rule is bidirectional (`submitted_request_id`), so foreign substitution is unreachable — [`APP6-B07-COMPLETION-REPORT.md`](./APP6-B07-COMPLETION-REPORT.md) | 0 | 0 |
| 13 | APP6-B08 | backend | COMPLETE | accepted | `8debf9f`, `23305b4` | `adminCustomRequestDesignVersion_create` / `_list` — authoring onto an existing case — [`APP6-B08-COMPLETION-REPORT.md`](./APP6-B08-COMPLETION-REPORT.md) | 0 | 1 |
| 14 | APP6-B09 | backend | COMPLETE | accepted | `4b1bb17`, `198fddc` | `adminCustomRequestDesignVersion_send` — a current-version guard would have made `CC-03` unreachable — [`APP6-B09-COMPLETION-REPORT.md`](./APP6-B09-COMPLETION-REPORT.md) | 0 | 1 |
| 15 | APP6-B10 | backend | COMPLETE | accepted | `863765c`, `afd656c` | `publicDesignReview_current` + agreement publication — [`APP6-B10-COMPLETION-REPORT.md`](./APP6-B10-COMPLETION-REPORT.md) | 0 | 1 |
| 16 | APP6-B11 | backend | COMPLETE | accepted | `1033880`, `77d4b71` | `publicDesignReview_approve` / `_requestRevision` — the AGG-11 adapter was still Catalog-only despite migration 0036 — [`APP6-B11-COMPLETION-REPORT.md`](./APP6-B11-COMPLETION-REPORT.md) | 0 | 0 |
| 17 | APP6-A01 (+C1) | admin | COMPLETE | accepted after C1 | `7762543`; C1 `19f17e3`, `0e22b49` | `/requests/{requestId}/quotation` — the locator comes from the relation, never `current_quotation_id`; C1 closed the browser acceptance — [`APP6-A01-COMPLETION-REPORT.md`](./APP6-A01-COMPLETION-REPORT.md), [`APP6-A01-C1-COMPLETION-REPORT.md`](./APP6-A01-C1-COMPLETION-REPORT.md) | 0 | 2 |
| 18 | APP6-A02 | admin | COMPLETE | accepted | `7d031aa`, `8656ea5` | `/requests/{requestId}/design` + `adminCustomRequestDesignVersion_detail` — a controller had diverged from its own published envelope with every suite green — [`APP6-A02-COMPLETION-REPORT.md`](./APP6-A02-COMPLETION-REPORT.md) | 0 | 1 |
| 19 | APP6-S01 | storefront | COMPLETE | accepted | `42cbb0d`, `d387639` | `/truy-cap/bao-gia` — a pending flag cannot detect that an async re-read finished; the bootstrap needed a monotonic `resolveCount` — [`APP6-S01-COMPLETION-REPORT.md`](./APP6-S01-COMPLETION-REPORT.md) | 0 | 3 |
| 20 | APP6-S02 | storefront | COMPLETE | accepted | `7573ccd`, `5cb00ad` | `/truy-cap/duyet-thiet-ke` — consent keyed by the signature of the set it was given for, so there is no reset to delete — [`APP6-S02-COMPLETION-REPORT.md`](./APP6-S02-COMPLETION-REPORT.md) | 0 | 1 |
| 21 | APP6-E01 (+C1) | cross-layer | **COMPLETE — PASS** | accepted | `33f8747`, `46d3bff`; C1 `fdb0e9a` | 6 serial cases, 54 API acceptance tests, Catalog + COP → `APPROVED`; C1 withdrew the design-case-origin false positive — [`APP6-E01-COMPLETION-REPORT.md`](./APP6-E01-COMPLETION-REPORT.md) §22 | 0 | 0 opened |
| 22 | APP6-X01 | closure | **COMPLETE** | this document | `ccd946a` (see §7) | Phase closure — [`APP6-X01-COMPLETION-REPORT.md`](./APP6-X01-COMPLETION-REPORT.md) | 0 | 0 |

`G01-C1`, `A01-C1` and `E01-C1` are **corrections to their parent checkpoint**,
not separate roadmap checkpoints, so the canonical count of 21 counts each
parent once and adds `APP6-X01`. `G01-C1` occupies its own row (3) because it
carries its own commit pair and completion report; `A01-C1` and `E01-C1` are
folded into rows 17 and 21. That is why the ledger has 22 rows for 21
checkpoints.

---

## 3. Follow-up disposition matrix

Every follow-up id that appears anywhere in an APP6 phase document, audit or
completion report. **22 are APP6-owned**; a further 2 are inherited ids that
APP6 documents carried and are listed in §4.

### 3.1 Disposition vocabulary

Existing repository vocabulary is preserved where a checkpoint already used a
stronger accepted term (`CLOSED_BY_B03`, `CLOSED_ON_ARRIVAL`,
`NOT_REQUIRED_BY_B08_QUERY_SHAPE`, `CLOSED_BY_DESIGN_AUTHORITY_AT_APP6_S01`,
`NONBLOCKING_PREEXISTING`). The **Final disposition** column normalises each to
one closure class so the counts in §3.3 are computable.

### 3.2 The matrix

| Follow-up | Origin | Final disposition | Owner | Blocking? | Evidence / rationale |
|---|---|---|---|---:|---|
| `FU-APP6-DB01-01` | DB01 | `DEFERRED_NONBLOCKING` | next real database-change checkpoint | 0 | `drizzle-kit generate` re-emits a spurious `DROP`/`ADD` of `ck_approval_snapshots__preview_hash_format` with a truncated expression on every run (DB01 §3.1). The committed migration `0036` is correct; the defect is in regeneration, and no APP6 checkpoint after DB01 ran generation. Carried untouched through B08, B09, B10, B11. Repairing it requires generating a migration, which `X01` forbids. |
| `FU-APP6-DB01-02` | DB01 | `CLOSED` — `NOT_REQUIRED_BY_B08_QUERY_SHAPE` | closed at B08 | 0 | No COP-lookup index existed. B08 established the real query shapes and proved every access is a PK/UQ/FK-supported point lookup (`custom_requests` by PK, `customer_owned_products` by `custom_request_id` under CST-027/IDX-029, `design_cases` by PK, `design_sessions` by PK, `design_versions` by `design_case_id`, `design_reviews` by `design_version_id`). No scan, so no DDL was added "to be safe". `ADR-APP6-001` §4.2 anticipated exactly this resolution. |
| `FU-APP6-B01-CURRENT-QUOTATION-POINTER-01` | B01 | `CLOSED` — `CLOSED_BY_B03` | closed at B03 | 0 | B01 deliberately left `custom_requests.current_quotation_id` NULL because no accepted authority assigns that pointer to `TR-LC12-01`. B03's send transaction assigns it, with real integration evidence (B03 §7). |
| `FU-APP6-B01-CODE-GENERATOR-PROMOTION-01` | B01 | `DEFERRED_NONBLOCKING` | `LATER_IF_THIRD_CONSUMER` — the checkpoint that adds a third consumer | 0 | `quotation-code.ts` mirrors `request-code.ts` rather than importing (which would couple CTX-QUO to CTX-ORD's domain for a string generator) or promoting (which would rewrite an accepted APP5 file for a second consumer). No third consumer appeared through B11/A01/A02/S01/S02/E01. Maintenance debt; no delivered journey depends on it. `X01` explicitly does not clean it. |
| `FU-APP6-B01-APP4-POLICY-CHECKER-MIGRATION-COUNT-01` | B01 | `HISTORICAL_SCOPED` | the checkpoint owning the APP4 policy checker | 0 | An APP4-era scoped checker pins a migration count that DB01's `0035`/`0036` moved past. A stale constant in a prior phase's scoped tool. No product behavior. `X01` routes rather than repairs — sweeping another phase's gate is outside closure scope. |
| `FU-APP6-B02-NULLABLE-OBJECT-TYPE-DEBT-01` | B02 | `HISTORICAL_SCOPED` | a dedicated contract-hygiene checkpoint | 0 | Roughly 18 nullable properties in **older** schemas publish `type: object` instead of an explicit scalar type. Historical debt inherited from before APP6. Every APP6 checkpoint that touched a schema (B03, B04, B05, A01) **added none to it** and asserted so in its contract suite; none repaired the history, which would require regenerating OpenAPI. |
| `FU-APP6-B03-REQUOTE-AFTER-ACCEPTANCE-01` | B03 | `DEFERRED_NONBLOCKING` | a dedicated lifecycle-authority decision (post-APP6) | 0 | `ADR-DB3-001` rule 4 requires re-acceptance after a post-acceptance revision, but LC-11 has **no edge** back into `QUOTED` from `QUOTE_ACCEPTED` or beyond. Nothing is broken: acceptance reopens nothing, no reopen path exists to guard, B03 send eligibility is unaffected, and A01 correctly offers no re-quote control in the accepted state. This is an **absent future capability**, not a defect in a delivered journey. B04 and B05 both recorded it `NONBLOCKING`. |
| `FU-APP6-B03-ORDER-AGGREGATE-SUITE-RED-01` | B03 | `HISTORICAL_SCOPED` | the checkpoint owning the order aggregate suites | 0 | `order.integration.spec.ts`, `order-outbox.integration.spec.ts` and `order-races.integration.spec.ts` fail identically (36 tests) at pristine `58d8b93`, i.e. **before** B03. Proved pre-existing against a stashed pristine tree. Not caused by APP6 and not repaired by it; B04 and B05 recorded `NONBLOCKING_PREEXISTING — not run, not repaired`. `X01` does not run or repair them. |
| `FU-APP6-B04-CUSTOMER-ADJUSTMENT-EXPLANATION-01` | B04 | `CLOSED` — `CLOSED_BY_DESIGN_AUTHORITY_AT_APP6_S01` | closed at S01 | 0 | The customer saw a `manualAdjustmentAmount` with no explanation; the only stored reason is an internal note. S01 closed it by design authority: the amount is shown truthfully under a neutral label and `adjustmentReason` does not exist as a string in the feature, proved live against a seeded version carrying a conspicuous internal note. |
| `FU-APP6-B05-AGG14-LOCK-ORDER-01` | B05 | `CLOSED_BY_AUTHORITY_ROUTING` | recorded here; a convention update belongs to the next backend-conventions checkpoint | 0 | `update quotations` key-share-locks the parent `custom_requests` row, so every AGG-14 write path must reach the request row **first**. Both delivered writers do, proved by the B05 race suite. The property is recorded in the B05 report and the race-suite header but not in `BACKEND_CONVENTIONS.md` or DB7. Nothing was changed to work around it. Documentation-only; **§5 of this matrix carries it forward as the canonical statement** so the next AGG-14 writer does not have to learn it by deadlocking. |
| `FU-APP6-B05-B04-FROZEN-SURFACE-DRIFT-01` | B05 | `CLOSED` — `CLOSED_ON_ARRIVAL` | closed at B05 | 0 | Four assertions in the B01/B02 contract suites had been red since `cef99b7` because B04 widened the `publicQuotation` surface without reconciling them. Reconciled in B05 §19 and recorded so the closure is auditable rather than silent. |
| `FU-APP6-B06-POLICY-FILE-REVIEW-THRESHOLD-01` | B06 | `DEFERRED_NONBLOCKING` | the next checkpoint editing those files | 0 | `request-moderation.policy.ts` at 313 lines and `request-moderation.spec.ts` at 528 sit above the **review** thresholds (300 / 500) and **under** the hard limits (400 / 600). Both are single-responsibility. `CLAUDE.md` §6 requires splitting by responsibility, not by line range, so a split here would be arbitrary. No violation exists to fix. |
| `FU-APP6-B08-P01-GATE-01` | B08 | `HISTORICAL_SCOPED` | a database-owning checkpoint | 0 | `tools/check-app3-p01.mjs` asserts `highest migration is 34` and an APP3-era `_journal.json` tag. DB01's `0035`/`0036` invalidated both, so the gate has been red at HEAD since DB01 — 2 failures, identical before and after B08 (proved against a stashed pristine tree). Its DesignDocument assertions, including `CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION must be exactly 1`, **all pass**. The stale constants belong to a DB-owning checkpoint. Carried `DO NOT REPAIR` through B09, B10, B11, A01-C1, S02, E01. |
| `FU-APP6-B09-CASE-REPO-SIZE-01` | B09 | `CLOSED` | closed at B10, not reopened | 0 | `drizzle-design-case.repository.ts` reached **399** lines against the 400-line hard maximum. B10 added no method to it — the read went to a new narrow port (B10 §12). A02 kept it closed: the AGG-10 adapter is untouched at 399 lines and A02's exact-version read is a new four-SELECT `DESIGN_VERSION_DETAIL_PORT`. |
| `FU-APP6-B10-AGREEMENT-ACTOR-01` | B10 | `DEFERRED_NONBLOCKING` | a future database-change checkpoint | 0 | `agreement_versions` records no publishing Admin, unlike `policy_configuration_versions.created_by_admin_id`. B10 requires a resolved Admin id in the publisher signature but **cannot persist it without a schema change**, which `X01` forbids. Attribution in the record is a wanted future property, not a delivered-journey failure: publication itself works and is proved by B10, S02 and E01. |
| `FU-APP6-A01-BROWSER-REVIEW-01` | A01 | `CLOSED` — `CLOSED_BY_APP6_A01_C1` | closed at A01-C1 | 0 | A01 could not run the 1440/1280 browser pass until the operator supplied a credential; it was recorded **open and blocking acceptance** at the time. `APP6-A01-C1` (`19f17e3`) executed the pass and closed it. This is the one APP6 follow-up that was ever genuinely blocking, and it was closed by a delivered correction before the phase closed. |
| `FU-APP6-A01-C1-REQUEST-STATUS-COPY-DUPLICATION-01` | A01-C1 | `CLOSED` — `CLOSED_BY_APP6_A02` | closed at A02 | 0 | Request-status copy was duplicated across two Admin copy catalogs. A02 extracted `shared/presentation/request-status.ts` and deleted both duplicate blocks (A02 §6). |
| `FU-APP6-A02-LOADING-FRAME-BROWSER-OBSERVATION-01` | A02 | `DEFERRED_NONBLOCKING` | a future Admin browser pass | 0 | `698:3` (loading) is asserted in the A02 component suite and renders; the frame could not be **held open** long enough for a recorded browser observation. A tool/environment limitation, not a known runtime defect — the state is proved to exist by executable evidence. Untouched by S01 and S02 as instructed. |
| `FU-APP6-S01-STEPUP-BROWSER-OBSERVATION-01` | S01 | `DEFERRED_NONBLOCKING` | later notification/infrastructure ownership (external provider) | 0 | Three S01 frames (`701:147`, `705:3`, accept-side `702:65`) and four S02 frames cannot be observed in dev because a completed step-up requires a verification code and **APP4's only dev notification channel is memory-only by design** — no plaintext OTP is exposed. Product Owner routing: real 403 entry is browser-proved; E01 proves sensitive accept/approve through the **real production guard** using a committed `VERIFIED` `STEP_UP` challenge row (`GRD-003` executes, nothing is bypassed). **The verification architecture was deliberately not weakened to obtain browser proof**, and no fake dev channel was added. |
| `FU-APP6-S01-STEPUP-CONTACT-PREFILL-01` | S01 | `DEFERRED_NONBLOCKING` | revisit only if a contract change makes a masked destination available to this surface | 0 | `701:66` implies a known destination, but B04 returns no contact, so the customer names it. Current behavior is **truthful**: the customer names the contact and the server validates ownership and eligibility. A masked-contact contract is a UX convenience, not required for APP6 closure. S02 inherits it verbatim. |
| `FU-APP6-S02-WATERMARK-DRAWN-VS-DELIVERED-01` | S02 | `CLOSED_BY_AUTHORITY_ROUTING` | closed at X01 (documentation) | 0 | `APP6-D01` §5 measured the Figma reproduction at **18°** with a **160 × 130** tile; the delivered `APP3-S09` runtime rotates **−30°** and tiles a **5 × 7 percentage grid**. `APP6-S02` correctly followed the delivered runtime — following the drawing would have shown the customer a *different* watermark from the one the Studio shows on the same artwork. `X01` resolved the **documentation ambiguity only**: see §6. `APP6_WATERMARK_RUNTIME_AUTHORITY = DELIVERED_APP3_S09`. No runtime change, no Figma mutation. |
| `FU-APP6-E01-DESIGN-CASE-ORIGIN-01` | E01 | `CLOSED_FALSE_POSITIVE` | closed at E01-C1; delivered owner **APP5-B01 / TR-LC11-01** | 0 | E01 inferred from its own fixture that no delivered operation creates a `design_cases` row. A phase-scoped fixture seeding a row proves only that the seeding phase does not produce it **inside its own execution window**. The delivered creator is `SubmitCustomRequestUseCase` → `DesignCaseRepository.createForRequest`, inside the idempotent W1 submission transaction, proved by APP5-B01 against real PostgreSQL (1 case on first submission, on replay, and under the CC-18 concurrent duplicate). E01 seeds it because it starts at the APP6 prerequisite boundary with the request already `UNDER_REVIEW`. **No design-case creation work is routed to APP6 or APP7.** Corrected in `fdb0e9a`; E01 report §22. |

### 3.3 Counts by final disposition

| Final disposition | Count |
|---|---:|
| `CLOSED` (incl. the accepted stronger vocabulary of §3.1) | 7 |
| `CLOSED_BY_AUTHORITY_ROUTING` | 2 |
| `CLOSED_FALSE_POSITIVE` | 1 |
| `DEFERRED_NONBLOCKING` | 8 |
| `HISTORICAL_SCOPED` | 4 |
| `ENVIRONMENT_NONBLOCKING` | 0 (see §4) |
| `ACTIVE_SCOPED` | 0 |
| **APP6-owned total** | **22** |

```text
BLOCKING FOLLOW-UPS = 0
```

Resolved: **10 of 22** — 7 closed during APP6 execution, 1 closed as a false
positive at `E01-C1`, and 2 closed by authority routing at `X01`. The **12** that
remain open are all either deferred future capability, historical debt predating
or outside APP6, or a deliberate architectural choice (OTP secrecy) — none of
them means a delivered APP6 journey cannot work.

---

## 4. Inherited follow-ups carried by APP6 documents

These are **not APP6-owned**; they appear in APP6 reports because APP6
checkpoints encountered or carried them. Recorded so the closure is complete.

| Follow-up | Origin phase | Final disposition | Owner | Blocking for APP6? | Rationale |
|---|---|---|---|---:|---|
| `FU-APP4-DEV-ENVELOPE-KEY-UNSET-01` | APP4, re-observed at S01 | `ENVIRONMENT_NONBLOCKING` | the operator (environment provisioning) | 0 | `NOTIFICATION_DELIVERY_ENVELOPE_KEY` was unset in the dev `.env`, so challenge issuance answered `500`. The operator provisioned it during S01 — **no secret was read, echoed or committed, and nothing was written to `.env` by this phase**. Environment configuration, not APP6 product work. |
| `FU-ADMIN-SHARED-DIALOG-01` | APP3-A01; routed to APP6 by `APP4-X01` | `DEFERRED_NONBLOCKING` — **re-routed** | the next phase that owns shared Admin UI consolidation | 0 | `APP4-X01` routed this to "APP6 — Admin Operations (earliest phase owning shared Admin UI)". **APP6 is not that phase**: its canonical title is *Design Review, Approval and Quotation*, and the routing rested on a phase-title assumption. APP6-A01 and A02 each carry their own hand-rolled dialog and carried the item unchanged, so it is now the **seventh**. Recorded honestly: **APP6 was the routed owner and did not consolidate it.** Consolidating means editing accepted APP2/APP3 components and their tests — a shared-Admin-UI refactor, which `X01` (`RECONCILIATION_ONLY`) forbids. Not blocking: every Admin dialog works and is proved by its own checkpoint's browser acceptance. Re-routed to the next phase that owns shared Admin UI. |

Various `FU-APP5-*` ids also appear in APP6 reports as carried prior-phase
items; they were closed or routed by `APP5-X01` and are not reopened here.

---

## 5. AGG-14 lock-order property (carried forward from `FU-APP6-B05-AGG14-LOCK-ORDER-01`)

Recorded here because the closure matrix is the document a later AGG-14 writer
will read, and the property is otherwise only in the B05 report:

```text
update quotations  key-share-locks the parent custom_requests row.
=> Every AGG-14 write path must reach the custom_requests row,
   and must reach it FIRST.
```

Both delivered writers (`APP6-B03` send, `APP6-B05` accept/reject) do, proved by
the B05 race suite. Nothing was changed to work around it. Promoting this into
`BACKEND_CONVENTIONS.md` or DB7 is a conventions edit outside `X01` scope.

---

## 6. Watermark authority routing

```text
APP6_WATERMARK_RUNTIME_AUTHORITY = DELIVERED_APP3_S09
RUNTIME_CANONICAL                = APP3-S09  (−30°, 5 × 7 percentage grid)
D01 / Figma numeric treatment    = design-reference discrepancy,
                                   NON-RUNTIME AUTHORITY  (18°, 160 × 130)
FU-APP6-S02-WATERMARK-DRAWN-VS-DELIVERED-01 = CLOSED_BY_AUTHORITY_ROUTING
NO RUNTIME CHANGE · NO FIGMA MUTATION
```

Verified by targeted source read at HEAD — both models are literally identical
in geometry:

```text
apps/storefront/src/features/design-studio/model/studio-watermark.ts
  WATERMARK_ANGLE_DEG = -30 · WATERMARK_ROWS = 7 · WATERMARK_COLUMNS = 5
apps/storefront/src/features/secure-design-review/model/review-watermark.ts
  REVIEW_WATERMARK_ANGLE_DEG = -30 · _ROWS = 7 · _COLUMNS = 5
```

`X01` removed the ambiguity **in documentation only**, at the two places that
stated the drawn measurement as the *exact delivered treatment*:

| File | What changed |
|---|---|
| `docs/design/FIGMA_DESIGN_INDEX.md` §4.12 prose | The 18° / 160 × 130 figures are now explicitly labelled *as measured on the Figma reproduction*, with runtime authority routed to `APP3-S09`. **No registry row, node id, link, status or approval evidence was touched.** |
| `docs/implementation/reports/APP6-D01-COMPLETION-REPORT.md` §5 | A superseding note added **beneath** the original paragraph. The historical measurement is preserved verbatim, not rewritten as though it never existed. |

The `APP6-S02` report already recorded the discrepancy correctly and needed no
correction. No Figma redraw is required to close APP6.

---

## 7. Closure commits

```text
fdb0e9a  docs(app6): correct the APP6-E01 design-case origin evidence (E01-C1)
ccd946a  docs(app6): close APP6 at X01
```

Local commits only. Nothing pushed.
