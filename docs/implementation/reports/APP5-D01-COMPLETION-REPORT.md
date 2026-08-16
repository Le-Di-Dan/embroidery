# `APP5-D01` — Completion Report

**Checkpoint:** `APP5-D01` — One complete APP5 design package
**Date:** 2026-08-16 · **Branch:** `production` · **HEAD at entry:** `c9d9a46`
**Checkpoint type:** design + registry. No runtime code, schema, migration, API
contract or generated artifact was changed.

---

## A. Verdict

```text
APP5-D01 = COMPLETE
```

One coherent, implementation-ready design package covering `APP5-S01`,
`APP5-S02`, `APP5-A01` and `APP5-A02`. No stop condition was met. No alternative
concepts were produced.

---

## B. Design authority inspected

### B.1 Canonical resolution

| Question | Resolution | Source |
|---|---|---|
| Canonical file | `FIG-FILE-PRODUCT` — `BQwqV8GdfUIELvsQDB1UQE` | `FIGMA_DESIGN_INDEX.md` §3 |
| APP5 write target | page **`APP_05` `641:3`** — verified live as a page with **zero children** | `get_metadata` on `641:3` |
| Package anchor | new root section **`644:3`** | created by this checkpoint |

The node id supplied in the checkpoint brief was **not assumed**: `641:3` was
resolved live before any write and confirmed to be the `APP_05` page, consistent
with the `APP_01` `371:3` → `APP_04` `620:3` page-per-phase convention the
registry already records.

### B.2 Pre-draw registry audit (mandatory, before any Figma write)

| Search term | Rows found |
|---|---|
| `APP5` | **0** |
| `APP_05` | **0** |
| `641:3` / `641-3` | **0** |
| `/yeu-cau` | **0** |
| `/requests` | **0** |
| `APP5-S01`, `APP5-S02`, `APP5-A01`, `APP5-A02` | **0** |

Outcome:

```text
NO_EXISTING_APP5_DESIGN
```

Confirmed from two directions, exactly as `APP4-D01` did: the registry held no
APP5 authority, and the canvas itself was empty. Reuse, in-place supplement and
stale-row repair are therefore all inapplicable. This independently matches
`APP5-R00` §8, which recorded `DESIGN_REQUIRED_BEFORE_UI_ONLY` on the ground that
the registry carried zero APP5 rows.

### B.3 Authority documents read

- `docs/implementation/audits/APP5_G01_SUBMISSION_MODERATION_AUTHORITY.md` (§§1–12, all fourteen `G01-D**` rules)
- `docs/implementation/audits/APP5_PHASE_ENTRY_AUDIT.md` (§5.1, §5.3, §5.4, §5.5, §5.6, §8)
- `docs/implementation/phases/APP5-CUSTOM-REQUESTS.md` (§10 audited roadmap)
- `docs/design/FIGMA_DESIGN_INDEX.md` (§2 usage rules, §3 catalog, §4.1–§4.10, §6 DS catalog, §9 approval workflow, §10 audit metadata)
- `CLAUDE.md` §3 (Figma registry gate), `docs/implementation/VALIDATION_GOVERNANCE.md` §3

### B.4 Existing nodes inspected live before drawing

| Purpose | Nodes read |
|---|---|
| Frame/section/spec-strip convention, layout grid | `621:3` (+ its 8 sub-sections), `623:3`, `628:3`, `631:45` |
| Token and text-style bindings actually in use | `623:3` sub-tree — `Color/*` variable aliases, `Typography/*` style ids |
| Design-system inventory | 3 variable collections (Primitive 16 / Semantic 17 / Foundation 19), 11 text styles, 0 effect styles, 0 paint styles |

### B.5 Repository surfaces inspected (route naming)

`apps/storefront/src/app/**` (7 routes) and `apps/admin/src/app/**` (12 routes)
were read so the APP5 routes follow the established Vietnamese-slug storefront
convention (`/kham-pha`, `/san-pham/[slug]`, `/san-pham/[slug]/thiet-ke`,
`/truy-cap`, `/xac-minh-lien-he`) and the English admin convention
(`/products`, `/design-templates`, `/support/customer-access`).

---

## C. Figma target and package structure

```text
fileKey:      BQwqV8GdfUIELvsQDB1UQE
APP_05 page:  641:3
root section: 644:3   (4800 × 31480)
```

No new Figma file was created. Nothing was drawn on any other page.

| Sub-section | Node | Frames |
|---|---|---|
| `00 — APP5 Overview / Flow Map` | `644:4` | 1 |
| `01 — S01 · Request Creation · Catalog Branch · Desktop` | `644:5` | 3 |
| `02 — S01 · Request Creation · Customer-Owned Product · Desktop` | `644:6` | 3 |
| `03 — S01 · Verification, Upload & Submission States · Desktop` | `644:7` | 17 |
| `04 — S01 · Request Creation · Mobile` | `644:8` | 5 |
| `05 — S02 · Confirmation & Grant-scoped Status` | `644:9` | 9 |
| `06 — A01 · Admin Request Queue` | `644:10` | 6 |
| `07 — A02 · Admin Request Detail & Moderation` | `644:11` | 14 |
| `08 — Shared · Rules, State & Responsive Matrices` | `644:12` | 6 |
| `09 — Handoff / Dependency Notes` | `644:13` | 1 |
| **Total** | | **65** |

The single-section anchor with numbered sub-sections matches
`APP1-D01` / `APP2-D01` / `APP3-D01` / `APP4-D01`.

### C.1 Routes locked by this package

| Route | Surface | Checkpoint |
|---|---|---|
| `/yeu-cau/moi` | Request creation and submission, both branches, steps 1–3 | `APP5-S01` |
| `/yeu-cau/da-gui` | Post-submission confirmation | `APP5-S02` |
| `/truy-cap` | Grant-scoped single-request status — **fills the APP4-S02 handoff slot; no new route** | `APP5-S02` |
| `/requests` | Admin request queue | `APP5-A01` |
| `/requests/{requestId}` | Admin request detail and moderation | `APP5-A02` |

`/truy-cap` deserves emphasis: `APP4-D01` drew an explicitly labelled dashed
handoff slot on `629:20` / `629:70` for exactly this content. Reusing it means
APP5 introduces **no second secure-access surface** and inherits the APP4
non-enumeration contract unchanged.

---

## D. Final APP5 package map

| Surface / flow | Exact Figma node(s) | Authority status | Consumed by |
|---|---|---|---|
| Overview / flow map | `645:3` | `REVIEW_REQUIRED` | all |
| Customer request creation — catalog branch | `650:3` · `650:94` · `650:187` | `REVIEW_REQUIRED` | `APP5-S01` |
| Subject chooser (catalog XOR customer-owned) | `651:3` | `REVIEW_REQUIRED` | `APP5-S01` |
| Customer request creation — COP branch | `651:40` · `651:138` | `REVIEW_REQUIRED` | `APP5-S01` |
| Verification states (step 2) | `652:3` · `652:55` · `652:115` · `652:175` · `652:229` | `REVIEW_REQUIRED` | `APP5-S01` |
| Upload / attachment states (step 3) | `654:3` · `654:66` · `654:138` · `654:214` · `654:309` · `654:397` | `REVIEW_REQUIRED` | `APP5-S01`, `APP5-B02` |
| Submission, retry & duplicate-safe outcomes | `656:3` · `656:74` · `656:119` · `656:166` · `656:213` | `REVIEW_REQUIRED` | `APP5-S01`, `APP5-B01` |
| Request creation — loading / context restore | `656:258` | `REVIEW_REQUIRED` | `APP5-S01` |
| Mobile 390 — creation, verification, upload, review | `658:3` · `658:59` · `658:114` · `658:160` · `658:222` | `REVIEW_REQUIRED` | `APP5-S01` |
| Confirmation | `660:3` (desktop) · `660:53` (mobile) | `REVIEW_REQUIRED` | `APP5-S02` |
| Grant-scoped status — five APP5 states | `661:3` · `661:67` · `661:131` · `661:199` · `661:267` | `REVIEW_REQUIRED` | `APP5-S02`, `APP5-B03` |
| Grant-scoped status — loading, mobile | `661:335` · `661:352` | `REVIEW_REQUIRED` | `APP5-S02` |
| Admin request queue | `662:3` · `662:112` · `662:182` · `662:243` · `662:306` · `663:9` | `REVIEW_REQUIRED` | `APP5-A01`, `APP5-B04` |
| Admin request detail — both branches | `665:3` · `665:115` · `672:3` | `REVIEW_REQUIRED` | `APP5-A02`, `APP5-B04` |
| Admin detail — loading, not-found/unauthorized | `667:3` · `667:30` | `REVIEW_REQUIRED` | `APP5-A02` |
| Moderation interaction — action matrix | `667:56` | `REVIEW_REQUIRED` | `APP5-A02`, `APP5-B05` |
| Moderation dialogs (clarify / reject / cancel / validation / submitting) | `669:3` · `669:60` · `669:119` · `669:173` · `670:3` | `REVIEW_REQUIRED` | `APP5-A02`, `APP5-B05` |
| Moderation outcomes — success, stale conflict | `670:46` · `670:104` | `REVIEW_REQUIRED` | `APP5-A02`, `APP5-B05` |
| Append-only moderation note | `670:148` | `REVIEW_REQUIRED` | `APP5-A02`, `APP5-B05` |
| Rule & state matrices | `673:3` · `673:65` · `673:139` · `674:3` · `674:69` · `675:3` | `REVIEW_REQUIRED` | all |
| Handoff / dependency notes | `674:158` | `REVIEW_REQUIRED` | all |

`675:3` — **Frame Index & State Coverage** — was generated by reading the live
node tree rather than transcribed, so it cannot drift from the real node ids.

---

## E. `APP5-G01` traceability

| G01 rule | Where the design represents it |
|---|---|
| **Subject XOR** (§3) | Chooser `651:3` makes the branches mutually exclusive with an explicit "changing type clears the other branch's data" warning; each branch screen shows the unselected option greyed; matrix `673:3` tabulates every field as required / must-be-NULL per branch. No state exists in which both or neither is selected. `SUBMISSION_SUBJECT_INVALID` never appears as customer copy. |
| **Catalog needs a variant** (`G01-D08`) | `650:3` shows product **and** variant as read-only context from the Studio session; the quantity table keys every line to that variant. |
| **`submitted_session_id` server-set** (`G01-D09`) | `650:3` carries the note "product, variant and design come from the Studio session — you enter no code here"; no input exists for it. Admin `665:3` shows it as a server-written provenance value. |
| **Quantity rules** (§3) | Catalog: required, ≥1 line, per-variant (`650:3`, invalid state `650:94`). COP: optional, size-label only, `product_variant_id` NULL (`651:40`, Admin `665:115`). Tabulated on `673:3`. |
| **COP image requirement** (`G01-D10`) | `654:3` blocks submit with "at least one item photo is required"; `651:40` shows the uploader locked until step 2 completes; summary rail shows `0/10 · need ≥ 1` in red. |
| **Asset roles and caps** (`G01-D13`, `G01-D14`) | Two separate uploaders — item photos vs reference — with 10-per-role counters; cap state `654:397`. `ATTACHMENT` appears on **no** frame; `673:65` records it as "not exposed in APP5". |
| **Media and rejection classes** (§7) | JPEG/PNG/WebP and ≤10 MB stated on every dropzone; `654:309` shows exactly the three bounded classes; `673:65` lists what is never disclosed (detected MIME, file signature, scanner output, storage key, internal path). |
| **Verification before APP5 upload** (§7, `G01-D01`) | The step rail marks step 3 locked until step 2 succeeds (`652:3`–`652:175`); `652:229` is the only frame that unlocks it; `651:40` renders a "locked until step 3" chip instead of an active uploader. The flow map `645:3` marks step 4 as the gate. |
| **Submit-once** (§4) | `656:3` review → `656:74` submitting with the action disabled → `656:119` uncertain-outcome safe retry → `656:213` idempotent replay showing the *same* code → `656:166` failure with nothing created. `673:139` tabulates all five outcomes. No idempotency-key field is drawn anywhere. |
| **Server-owned provenance** (§4.1, §5) | `673:139` lists request code, `submitted_session_id`, `customerId`, idempotency key and grant token as server-owned, with "customer sees it: never" except the display-only code. |
| **Request code policy** (§5) | Shown only after success (`660:3`), display-only, with the explicit line "this code does not open the request — only the link in your email does". |
| **Grant-scoped single-request status** (§10, `G01-D04`) | `661:*` render one request reached through `/truy-cap`. No list, no account, no profile. `674:3` states why. |
| **Customer-visible vs internal reason** (§8, §9.1) | `661:131` / `661:199` / `661:267` show only the customer-facing text, with the line "internal workshop notes are not shown here". The Admin dialogs keep the two as separate fields. |
| **Five Admin transitions** (§2, `G01-D07`) | `667:56` draws the allowed action set per status: NEW → 2 actions, UNDER_REVIEW → 3, NEEDS_CLARIFICATION → 3, REJECTED/CANCELLED → **"no moderation actions remain"**. `TR-LC11-05…09` appear on no frame in any state. |
| **Reason / note requirements** (§2) | `669:3` (reason + CLARIFY note, both required), `669:60` (reason + REJECT/SPAM), `669:119` (reason required, note optional), `669:173` (validation error blocks the CTA). Summarised in the table on `667:56`. |
| **Cancellation is S1-only, Admin-only** (`G01-D06`) | `669:119` states cancellation implies no refund, no production halt and no inventory release. No customer-facing cancel control exists on any frame; `674:3` records the omission and its reason. |
| **Creation writes no transition row** (`G01-D05`) | Admin history cards on `665:3` / `665:115` show creation as a timestamp with the note "creating a request writes no transition row — the creation time is the evidence". |
| **Append-only notes** (§11) | `670:148` and both detail rails label notes "internal · append only, no edit, no delete"; no edit or delete control is drawn. |
| **APP6+ exclusions** (§10) | Stated on `645:3`, `656:3`, `660:3`, `661:*`, `665:*` and `674:3`. No quotation, design-review, pricing, deposit, payment, order, production, inventory, refund, CRM or customer-account surface exists in the package. |

---

## F. Reuse

| Reused pattern | Source node(s) | Used by |
|---|---|---|
| Storefront shell — header / nav | `APP1-D02` `405:2225`, `405:3786` | every customer frame |
| Contact entry, 6-digit code, resend cooldown, attempt counter | `APP4-D01` `623:3`, `625:36`, `625:70`, `628:25` | step 2 |
| Challenge expired / attempt lockout / issuance rate limit | `APP4-D01` `625:106`, `625:140`, `625:173` | `652:175` |
| Verification success | `APP4-D01` `625:193` | `652:229` |
| Secure-link bootstrap, authorized shell, unavailable, network error | `APP4-D01` `629:3`, `629:20`, `629:37`, `629:53`, `629:70`, `629:87` | `/truy-cap` status frames — **referenced, not redrawn** |
| Masked-contact treatment, non-enumeration copy | `APP4-D01` `634:38`, `634:59` | customer + admin |
| Product context and design preview | `APP3-D01` `604:5`, `606:3` | `650:3`, `665:3` |
| Upload / processing / rejected asset states | `APP2-D01` `429:89`, `430:12`, `430:98`; `APP3-D01` `608:343` | step 3 uploaders |
| Admin shell — sidebar, topbar, content column | `APP1-D01` `385:10`; `APP2-D01` `439:100` | `A01`, `A02` |
| Admin list, filter chips, cursor "load more" | `APP2-D03` `439:100`, `498:272` | `662:*` |
| Dialog composition + `Color/Overlay/Scrim` | `APP3-D01-C1` `FIG-DS-SCRIM-TOKEN` `78:2` | every A02 dialog |
| Skeleton loading bars | `APP2-D01` / `APP3-D01` | all loading frames |

The full map is drawn on `674:69`.

---

## G. New APP5-specific design semantics

Only three, and each carries genuinely new domain meaning:

1. **Role-labelled asset tile** — the *item photo* vs *reference* distinction
   ("what you own" vs "what you want") has no precedent; APP2/APP3 uploads have a
   single undifferentiated role.
2. **Size-keyed quantity breakdown** — TBL-039 intake, with two shapes: variant +
   size on the catalog branch, size label only on the COP branch.
3. **Status-scoped moderation action panel** — renders the legal transition set
   for the current status rather than the full lifecycle.

**No new design-system asset was created**: 0 component masters, 0 instances, 0
new variables, 0 new text styles, 0 new effect styles, 0 new paint styles. Every
frame composes existing `Primitive`/`Semantic`/`Foundation` variables and
`Typography/*` text styles. Form fields are layer-named `Label` / `Field` /
`Value` / `Help text` / `Error message` so the frontend can wire `<label for>`
and `aria-describedby` structurally — the `APP2-D01` / `APP4-D01` precedent,
which exists because `FIG-DS-INPUT` is still unpublished
(`FU-DESIGN-PUBLISH-DS-INPUT-01`, unchanged and still open).

---

## H. Validation ledger

| Tool / command / check | Purpose | Result | Reruns |
|---|---|---|---:|
| `get_metadata` on `641:3` | Resolve the write target and prove the canvas empty | `APP_05`, zero children | 0 |
| `use_figma` read — pages, variables, text styles | Inventory the design system before drawing | 3 collections / 52 variables / 11 text styles / 0 effect styles | 0 |
| `use_figma` read — `621:3`, `623:3`, `631:45` | Learn the frame, spec-strip and token conventions | conventions captured | 1 (first read threw on a `characters` access) |
| `get_screenshot` × 12 | Visual inspection of each newly drawn group | 3 defects found and fixed (see below) | 0 |
| `use_figma` integrity audit | Prove no new components/tokens/styles and no instances | 0 / 0 / 0; counts identical to pre-draw | 0 |
| `use_figma` anchor re-read | Prove APP1–APP4 + BRD0 nodes unmodified | 8/8 anchors unchanged | 0 |
| `node tools/check-figma-design-index.mjs` | Registry integrity after the index change | **PASS** — 278 registry IDs / 278 node rows / 17 tables | 0 |
| `git diff --check` | Whitespace / conflict-marker hygiene | clean | 0 |

Defects found by visual inspection and fixed in place:

1. Catalog frames at 1440×900 clipped their own content and the step-rail note
   collided with the step-3 label — rebuilt at 1440×1240 with the note moved
   below the rail.
2. Asset-tile captions overlapped their action row — tile height raised
   130×140 → 130×170 and the card grid relaid out across all six upload frames.
3. The Admin queue side rail was positioned outside the content column — removed,
   with the open-request count moved into the topbar; the 1280 reference was
   rebuilt with a narrower column set so no column is dropped and nothing scrolls
   horizontally.

**No runtime regression, test, build, typecheck, OpenAPI, generated-client,
database or SonarQube command was run.** `APP5-D01` changes design and
documentation authority only, so per `VALIDATION_GOVERNANCE.md` §3 the justified
scope is the Figma registry gate plus formatting hygiene. No valid result was
rerun on an unchanged artifact.

---

## I. Figma index update

`docs/design/FIGMA_DESIGN_INDEX.md`, same checkpoint:

1. **§3** — added the `APP_05` write target (`641:3`) alongside `APP_01`–`APP_04`.
2. **§4.11** — new section `APP5-D01 — Custom Requests & Customer-Owned Products`
   with the pre-draw audit outcome, sub-section anchors, the policy-authority
   pointer, the access-state non-duplication ruling, and **65 rows**, all
   `REVIEW_REQUIRED`.
3. **§10** — live count corrected to `278 / 278 / 17` (was `213 / 213 / 16` at
   `APP4-D01`), and an `APP5-D01` coverage entry added.

Row groups added (all `REVIEW_REQUIRED`, owning phase `APP5-D01`, last verified
2026-08-16):

| Group | Rows | Registry ID prefix |
|---|---:|---|
| Overview | 1 | `FIG-APP5-OVERVIEW-FLOWMAP` |
| `S01` catalog branch | 3 | `FIG-APP5-S01-CATALOG-*` |
| `S01` subject chooser + COP branch | 3 | `FIG-APP5-S01-SUBJECT-CHOOSER-*`, `FIG-APP5-S01-COP-*` |
| `S01` verification | 6 | `FIG-APP5-S01-VERIFY-*` |
| `S01` attachment intake | 7 | `FIG-APP5-S01-UPLOAD-*` |
| `S01` submission | 6 | `FIG-APP5-S01-SUBMIT-*` |
| `S01` loading | 1 | `FIG-APP5-S01-DESKTOP-LOADING` |
| `S02` confirmation | 2 | `FIG-APP5-S02-CONFIRM-*` |
| `S02` grant-scoped status | 7 | `FIG-APP5-S02-STATUS-*` |
| `A01` queue | 6 | `FIG-APP5-A01-QUEUE-*` |
| `A02` detail | 5 | `FIG-APP5-A02-DETAIL-*` |
| `A02` moderation | 9 | `FIG-APP5-A02-ACTION-*`, `-DIALOG-*`, `-MODERATION-*`, `-NOTE-*` |
| Shared matrices | 6 | `FIG-APP5-MATRIX-*`, `FIG-APP5-FRAME-INDEX` |
| Handoff | 1 | `FIG-APP5-HANDOFF-DEPENDENCY` |

Traceability for the four consuming checkpoints is explicit: every `S01`, `S02`,
`A01` and `A02` surface has a named registry ID and an exact node id. No later
checkpoint depends on an unnamed visual region or a screenshot.

---

## J. Files / artifacts changed

**Figma** (`BQwqV8GdfUIELvsQDB1UQE`)

- page `APP_05` `641:3` — 1 new root section `644:3`, 10 sub-sections, 65 frames.
- Nothing else. No other page, section, component, variable or style was created,
  modified, moved, renamed or deleted; the DS library file `hsxSjwkqQKM9vuyRgWSesU`
  was not opened for writing.

**Documentation**

- `docs/design/FIGMA_DESIGN_INDEX.md` — §3, new §4.11, §10.
- `docs/implementation/phases/APP5-CUSTOM-REQUESTS.md` — §10.1 status table, new §10.5.
- `docs/implementation/reports/APP5-D01-COMPLETION-REPORT.md` — this file.

**Not changed:** `apps/**`, runtime tests, database schema or migrations,
OpenAPI, generated clients, package files, worker code. No unrelated visual
cleanup was bundled.

---

## K. Roadmap update

| Checkpoint | Status | Note |
|---|---|---|
| `APP5-R00` | `COMPLETE` | Phase-entry audit and roadmap reconciliation |
| `APP5-G01` | `COMPLETE` | Submission, moderation and intake-abuse authority locked |
| `APP5-D01` | `COMPLETE` | One APP5 design package registered — 65 nodes |
| `APP5-B01` | `INCOMPLETE` | **Next** — request submission backend |
| `APP5-B02` | `INCOMPLETE` | Customer attachment intake |
| `APP5-B03` | `INCOMPLETE` | Grant-scoped request status read |
| `APP5-B04` | `INCOMPLETE` | Admin request queue & detail |
| `APP5-B05` | `INCOMPLETE` | Admin notes & guarded transitions |
| `APP5-S01` | `INCOMPLETE` | Request creation & submission |
| `APP5-S02` | `INCOMPLETE` | Confirmation & grant-scoped status |
| `APP5-A01` | `INCOMPLETE` | Admin request queue |
| `APP5-A02` | `INCOMPLETE` | Admin request detail & moderation |
| `APP5-E01` | `INCOMPLETE` | Cross-layer acceptance |
| `APP5-X01` | `INCOMPLETE` | Phase closure |

`APP5-B01` was **not** started.

---

## L. Residual risks

1. **All 65 rows are `REVIEW_REQUIRED`.** `APP5-S01`, `APP5-S02`, `APP5-A01` and
   `APP5-A02` are blocked until a human reviewer promotes the rows their
   checkpoint consumes. The backend checkpoints `B01`–`B05` are not blocked.
2. **Two reason fields, one G01 rule.** The moderation dialogs make the internal
   reason **and** the customer-visible text separately required on
   `NEEDS_CLARIFICATION`, `REJECTED` and `CANCELLED`. `APP5-G01` §2 marks only
   `reason` required (`R`); the second field is a UI-level requirement derived
   from SE-004/SE-012 carrying `customer_visible_reason` /
   `cancelled_customer_reason`. **`APP5-B05` must confirm or correct this** rather
   than inherit it silently — it is the one place this package asserts something
   stricter than the authority states.
3. **`NEEDS_CLARIFICATION` has no customer reply surface.** APP5 builds only a
   read surface for the customer (`B03`), so the status view tells the customer
   the workshop will contact them directly. If APP6 later adds an in-app reply,
   `661:131` and `661:352` need revisiting — the copy is deliberately worded so it
   does not have to be *retracted*, only extended.
4. **Draft state lives only on the device.** With no server-side request draft
   (`APP5-R00` §5.1), a customer who leaves mid-flow loses their input. The
   verification-expiry and context-restore frames state this explicitly; it is a
   product consequence of the locked lifecycle, not a design gap.
5. **`FU-DESIGN-PUBLISH-DS-INPUT-01` remains open.** Form fields are local
   compositions, not `FIG-DS-INPUT` instances, because the DS library still needs
   a manual publish. This does not block code, which consumes token and component
   semantics rather than a Figma instance.
6. **The COP / `design_versions` schema limitation is untouched.** It remains an
   APP6-entry issue; this package creates no new implication for it, since APP5
   produces only the design-case header.

---

```text
NEXT CHECKPOINT: APP5-B01 — Request submission backend
```
