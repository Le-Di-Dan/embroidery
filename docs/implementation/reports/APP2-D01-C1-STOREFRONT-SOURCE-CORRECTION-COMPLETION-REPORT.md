# APP2-D01-C1 — Storefront Source-of-Truth Correction — Completion Report

**Checkpoint:** `APP2-D01-C1` — correct Storefront discovery authority and remove rejected card-grid screens
**Type:** Design governance correction · **Verdict:** `PASS`
**Date:** 2026-07-26 · **Correction Commit A:** `c40e5c4058ec05ea0976104f9341ded48a9662df`

---

## A. Preflight

- **Branch:** `production`.
- **Initial HEAD:** `6b2006fc92e711cb538a1a257c06f1cfac9ca87a` — `docs(app2): record APP2-D01 design evidence`.
- **Working tree:** clean at start.
- **Prior status:** `APP2-D01 = DELIVERED_FOR_PRODUCT_OWNER_REVIEW` (69 registry IDs; 27 screen
  frames + 2 annotations + 1 DS supplement on Figma page `APP_02` / section `423:3`).
- **Product Owner ruling treated as authoritative and binding**, without re-litigation:
  Admin approved and frozen; Storefront Product List rejected; Product Detail withheld;
  `APP2-D01 = PARTIAL_PRODUCT_OWNER_APPROVAL`.
- Figma write access confirmed before any mutation. Every target node ID was resolved and
  **name-asserted** before deletion; the deletion script was written to throw `BLOCKED` on any
  name or parent mismatch. No mismatch occurred, so no `BLOCKED` condition arose.

## B. Figma before-state

**Rejected Storefront Product List nodes** (all present, all children of section `423:3`):

| Node | Name | Size | Descendants | Grid container | Cards |
|---|---|---|---|---|---|
| `444:204` | APP2-D01 / Storefront / Product List / Desktop / 1440 | 1440×1505 | 90 | `Product grid (published only)` HORIZONTAL/WRAP gap 32 | 6 × **365×394** |
| `445:204` | APP2-D01 / Storefront / Product List / Tablet / 1024 | 1024×1507 | 63 | same, gap 28 | 4 × **414×419** |
| `445:210` | APP2-D01 / Storefront / Product List / Mobile / 390 | 390×2162 | 50 | same, gap 24 | 4 × **350×371** |
| `446:223` | APP2-D01 / Storefront / Product List / Desktop / Empty | 1440×920 | 57 | — (empty state) | 0 |

Every card in a given frame had **identical dimensions** — objective evidence of the rejected
uniform equal-height ecommerce grid. A screenshot of `444:204` was captured before deletion.

**UI02 authority nodes** (read-only; measured, not assumed):

| Node | Name | Size | Measured masonry |
|---|---|---|---|
| `208:538` | UI02 – Discover Feed – Draft (SECTION) | 4880×10726 | 15 children |
| `208:2002` | UI02 / Discover / Desktop / Draft | 1440×7241 | `Discover Feed` 1280w → **5 columns × 237px** |
| `224:871` | UI02 / Discover / Tablet / Draft | 1024×5137 | 928w → **3 columns × 293px** |
| `226:1038` | UI02 / Discover / Mobile / Draft | 390×4533 | 342w → **2 columns × 163px** |

Card heights vary (441 / 298 / 503 / 534 desktop), confirming the editorial masonry rhythm. The 59
cards are DS `StudioWorkCard` instances (`Type=Default` `fbd88487…`, `Type=Compact` `3e83d331…`)
named **`StudioWorkCard · TEMP_ASSET`** — direct evidence that UI02's *content* is draft while its
*architecture* is authoritative. **UI01 supporting nodes:** `183:7` (1440×5416), `189:266`
(1024×5148), `191:412` (390×6136).

**Frozen Admin roots (20):** `426:13`, `429:6`, `429:89`, `430:12`, `430:98`, `432:18`, `433:19`,
`434:20`, `436:37`, `436:140`, `438:90`, `437:73`, `439:100`, `440:102`, `440:191`, `441:106`,
`442:110`, `442:205`, `443:121`, `424:35`.

**Product Detail withheld (4):** `447:204`, `448:204`, `448:210`, `449:357`.

## C. Figma mutations

**Deleted — exactly four frames, nothing else:**

| Deleted node | Name | Descendants removed with parent |
|---|---|---|
| `444:204` | APP2-D01 / Storefront / Product List / Desktop / 1440 | 90 |
| `445:204` | APP2-D01 / Storefront / Product List / Tablet / 1024 | 63 |
| `445:210` | APP2-D01 / Storefront / Product List / Mobile / 390 | 50 |
| `446:223` | APP2-D01 / Storefront / Product List / Desktop / Empty | 57 |

Post-delete existence probe: all four return `REMOVED`. Section `423:3` child count **40 → 36**.
Only descendants that disappeared naturally with their parent frames were removed; no shared
component, no instance outside those subtrees, and no Admin-referenced node was touched.

- **No replacement frames created.** UI02 was not cloned, not moved, not copied into the APP2
  section. No new components, variants, tokens or styles were created. Nothing was drawn.
- **UI02 / UI01 not mutated** — `208:538`, `208:2002`, `224:871`, `226:1038`, `183:7`, `189:266`,
  `191:412` all verified identical after the deletion.
- **Product Detail not mutated** — `447:204`, `448:204`, `448:210`, `449:357` verified identical.
- **Admin not mutated** — all 20 frozen roots verified identical.

**Immutability proof.** A before/after snapshot compared 31 nodes on nine fields each — id, name,
parent id, x, y, width, height, direct child count, visible, locked:

```text
checked: 31   identical: 31   drifted: 0   missing: 0
verdict: ALL_FROZEN_NODES_UNCHANGED
```

No new repository tool was introduced for this comparison; it ran as an ad-hoc read-only script.

## D. Documentation corrections

Files changed in Commit A (5):

| File | Change |
|---|---|
| `docs/design/FIGMA_DESIGN_INDEX.md` | PO ruling banner in §4.3; four Product List rows **removed**; Product Detail rows re-labelled withheld; new §4.3.1 historical removal record; new §4.4 authority map + §4.4.1 UI02 rows + §4.4.2 status vocabulary + §4.4.3 invariants; §10 coverage rewritten |
| `docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md` | Status block for the PO ruling; §6.2 S01/S02 handoff rows corrected; new §6.2.1 correction section |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | APP2 status transitions |
| `docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md` | APP2 status transitions |
| `docs/implementation/reports/APP2-D01-COMPLETION-REPORT.md` | Non-destructive superseding banner only; **no historical line rewritten** |

**Authority map added** (`FIGMA_DESIGN_INDEX.md` §4.4):

| Capability | Primary authority | Supporting | Reuse policy | Status |
|---|---|---|---|---|
| APP2-S01 Product List / Discover | UI02 `208:538`; desktop `208:2002`; tablet `224:871`; mobile `226:1038` | UI01 `183:7`, `189:266`, `191:412`; APP1-D02 shell | `REUSE_AND_SUPPLEMENT_ONLY` | Blocked on backend; rejected nodes removed |
| APP2-S02 Product Detail | UI03 `261:1290`; desktop `262:1291`; tablet `273:1409`; mobile `279:1504` | UI01/UI02 where documented | `SEPARATE_RECONCILIATION_REQUIRED` | `NOT_APPROVED` / `NOT_IMPLEMENTATION_AUTHORITY` |

**Visual invariants recorded:** image-led Pinterest-inspired discovery; masonry **5 desktop /
3 tablet / 2 mobile**; varying card heights, editorial rhythm, artwork dominant, minimal catalog
chrome; masonry is presentation only — **DOM/source reading order stays linear**.

**Forbidden patterns recorded:** equal-height ecommerce card grid; uniform 3-column desktop /
2-column tablet / single-column mobile retail cards; generic marketplace treatment; redesigning a
covered capability because a registry title lacks the words "Product List"; treating `DRAFT`
content status as absence of visual authority.

**Visual authority vs content maturity** (§4.4.2) documents five independent axes — approval
status, visual authority, structural/interaction authority, content/asset maturity, reuse policy —
with the explicit rule that `DRAFT` describes content only and never licenses a new screen.

**Status transitions recorded:**

```text
APP2-D01-ADMIN                     = COMPLETE — PRODUCT_OWNER_APPROVED — FROZEN
APP2-D01-STOREFRONT-PRODUCT-LIST   = REJECTED_NODE_SET_REMOVED
                                     SOURCE_AUTHORITY_CORRECTED_TO_UI02
APP2-D01-STOREFRONT-PRODUCT-DETAIL = NOT_APPROVED
                                     WITHHELD_PENDING_UI03_RECONCILIATION
APP2-D01                           = PARTIAL_PRODUCT_OWNER_APPROVAL
                                     CORRECTION_COMPLETE (APP2-D01-C1)
```

**Registry-row handling for removed nodes.** The four rows were **removed**, not restatused. The
validator requires every non-`MISSING` row to carry a file key, page, node id and matching deep
link; any retained row would therefore have had to keep a **dangling link to a deleted node**.
Removal plus the §4.3.1 historical record satisfies both "no active handoff path" and "preserve
history". The four registry IDs are marked retired and must not be re-created.

**Product Detail withholding statement** appears in three places: the §4.3 banner, the Approval
Evidence cell of all four rows (`NOT_APPROVED — WITHHELD_PENDING_UI03_RECONCILIATION —
NOT_IMPLEMENTATION_AUTHORITY`), and phase plan §6.2/§6.2.1. UI02 is explicitly **not** the Product
Detail authority.

## E. Validation evidence

| Command | Exit | Result |
|---|---|---|
| `pnpm check:figma-design-index` | **0** | 69 registry IDs, 69 node rows, 9 tables |
| `node --test tools/check-figma-design-index.test.mjs` | **0** | tests 19, pass 19, fail 0, skipped 0 |
| `pnpm quality` | **0** | full gate incl. styles, e2e, spike boundaries, openapi, api-client, db manifest |
| `node tools/check-file-size.mjs` | **0** | passed; 10 pre-existing files above review threshold, none new |
| `git diff --check` | **0** | clean |
| `pnpm check:openapi` | 0 | artifact up to date |
| `pnpm check:api-client` | 0 | tree hash `89c1aace328eef1ee05a74950faa48bf907babece025a6abb9ca1baa1574502f` unchanged |
| `pnpm db:check:manifest` | 0 | 78 tables / 833 columns / 84 IDX rows unchanged |

**Retries: 0** — no command failed. One reporting defect was self-corrected: the first pass read
`$?` after a pipe to `tail` (reporting `tail`'s status), so every command was re-run capturing true
exit codes; the values above are from that second run.

`git diff --name-only -- apps packages infra tools .env.example pnpm-lock.yaml` returned **0
files**: no production code, tooling, schema, migration, dependency, OpenAPI, generated client or
Design System change.

## F. Git evidence

**Commit A** — `c40e5c4058ec05ea0976104f9341ded48a9662df` — `design(app2): correct storefront discovery authority`

```text
docs/design/FIGMA_DESIGN_INDEX.md                             | 145 ++++++++++++---
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md          |   2 +-
docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md      |   2 +-
docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md | 51 +++++-
docs/implementation/reports/APP2-D01-COMPLETION-REPORT.md      |  17 ++
5 files changed, 200 insertions(+), 17 deletions(-)
```

**Commit B** — `docs(app2): record D01 storefront correction evidence` — single file:
`docs/implementation/reports/APP2-D01-C1-STOREFRONT-SOURCE-CORRECTION-COMPLETION-REPORT.md`.
This report references Commit A's exact hash in the header and in §F above.

Exactly two commits exist after the initial HEAD `6b2006fc…`; no squash, no amend of Commit A after
Commit B began, no third commit, working tree clean, **nothing pushed**.

## G. Acceptance matrix

| ID | Criterion | Result |
|---|---|---|
| C1-01 | Admin remains PO approved and frozen | PASS — status recorded; no Admin mutation |
| C1-02 | All approved Admin root nodes unchanged | PASS — 20/20 identical on 9 fields |
| C1-03 | `444:204` removed | PASS — probe `REMOVED` |
| C1-04 | `445:204` removed | PASS — probe `REMOVED` |
| C1-05 | `445:210` removed | PASS — probe `REMOVED` |
| C1-06 | `446:223` removed | PASS — probe `REMOVED` |
| C1-07 | No replacement Product List screen created | PASS — section 40→36, no node added |
| C1-08 | UI02 `208:538` documented as S01 primary authority | PASS — §4.4 / §4.4.1 |
| C1-09 | UI02 desktop/tablet/mobile mapped exactly | PASS — `208:2002`, `224:871`, `226:1038` |
| C1-10 | UI01 supporting nodes mapped exactly | PASS — `183:7`, `189:266`, `191:412` |
| C1-11 | Masonry 5/3/2 documented | PASS — measured, not assumed |
| C1-12 | Equal-height grid forbidden for S01 | PASS — §4.4.3 |
| C1-13 | Draft maturity separated from visual authority | PASS — §4.4.2 |
| C1-14 | Deleted nodes hold no canonical authority | PASS — rows removed; no active handoff path |
| C1-15 | Product Detail nodes unmodified | PASS — 4/4 identical |
| C1-16 | Product Detail documented unapproved/withheld | PASS — three locations |
| C1-17 | UI02/UI01 unmodified | PASS — 7/7 identical |
| C1-18 | No code/schema/dependency/DS change | PASS — 0 files outside `docs/` |
| C1-19 | Validators and `pnpm quality` pass | PASS — all exit 0 |
| C1-20 | Exactly two commits with required subjects | PASS |
| C1-21 | Commit B references exact Commit A hash | PASS — header + §F |
| C1-22 | Clean tree, nothing pushed | PASS |
| C1-23 | Report complete and within line cap | PASS — ≤240 lines |
| C1-24 | S01 unimplemented; authority-only correction | PASS |

## H. Deviations and follow-ups

**Deviations:** none from the checkpoint spec. Two judgement calls are recorded for review:

1. **Registry rows removed rather than restatused.** §9.4 permits either; retaining rows was not
   viable because the validator would force a dangling link to a deleted node (§D).
2. **Withheld Product Detail rows keep status `REVIEW_REQUIRED`.** `WITHHELD` is not in the
   validator's status enum, and adding it would mean editing `tools/check-figma-design-index.mjs`
   — outside scope. The withholding is carried in the Approval Evidence cell and three narrative
   locations instead; making `WITHHELD` first-class is a separate small tooling checkpoint.

**Follow-ups (genuine):**

- **`APP2-S02` UI03 reconciliation** — required before Product Detail may be designed or built.
- **Band label `423:13` "D · Storefront Product List" remains** with no frames beneath it. It was
  not in the delete list and §6.1 forbade removing anything else, so it was left untouched.
- **Public product URL pattern** (`/san-pham/<slug>`) remains a proposal, unchanged here.

**During review the Product Owner asked whether the remaining Storefront screens had been
deleted.** Verification confirmed the four Product List frames were already gone and only the
withheld Product Detail frames remained; the Product Owner then confirmed those should be **left
unchanged**. No further deletion was performed.

**APP2 engineering implementation has not started as part of this correction.** This checkpoint
changed design authority and removed rejected nodes only. `APP2-S01` remains unimplemented and
must read UI02 directly when its backend prerequisites clear.
