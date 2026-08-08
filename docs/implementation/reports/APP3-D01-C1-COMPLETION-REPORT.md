# APP3-D01-C1 — close the two D01 implementation-readiness gaps

`STATUS = COMPLETE — REVIEW_DELIVERED`
`COMMIT_A = b831a22 fix(design): close APP3 D01 implementation-readiness gaps`

## A. Entry state

```text
APP3-D01    = COMPLETE — REVIEW_DELIVERED — CORRECTION_REQUIRED
APP3-D01-C1 = READY — NOT STARTED

D01 Commit A = e7c022d docs(design): deliver APP3 phase design package
Figma file   = FIG-FILE-PRODUCT / embroidery (BQwqV8GdfUIELvsQDB1UQE)
page         = APP_03 (592:3)
root section = 596:3
frames       = 66
registry     = 162 rows
```

## B. Correction scope

Exactly the two findings, and nothing else. APP3 was not redrawn, D01 was not
restarted, and no screen unrelated to the two gaps was touched.

## C. DS repair authorization

`FIG-FILE-DS` is registered *Read-only — repair only via reported deviation*.
`APP3-D01-C1` writes to it under the operator's explicit
`D01_C1_DS_REPAIR_AUTHORIZATION`, scoped to `FIG_DS_INPUT` and
`FIG_DS_SCRIM_TOKEN` only.

What was **not** done under that authorization: no existing component, token,
style or brand value renamed, restyled or re-scoped; no component semantics
changed outside the two gaps; no Design System redesign.

## D. `FIG-DS-INPUT` — result

| | |
|---|---|
| Node | `76:29` — [Input](https://www.figma.com/design/hsxSjwkqQKM9vuyRgWSesU/DS-Core-Components-WF06?node-id=76-29) |
| Page | `HF01 · Components · Forms` (new, matching `HF01 · Components · …`) |
| Property | `State` |
| Variants | `Default`, `Focus`, `Filled`, `Error`, `Disabled` |

Structure is label + field + helper/error text — only features the DS already
supports. No leading/trailing affordance was invented, because no existing DS
convention establishes one.

Every visual property binds to existing tokens: `background/surface` and
`background/secondary` (disabled), `text/primary` · `secondary` · `tertiary`,
`border/primary`, `action/primary` (focus), `status/error`, `radius/sm`, and the
`Body/S` · `Body/M` · `Caption` text styles. **No APP3-only colour and no
wireframe-derived value.**

Variant naming follows `Button`'s existing syntax (`State=Default`), so the two
sets read identically in the picker.

**Not a duplicate identity.** `FIG-DS-SEARCHBAR` remains a search affordance. The
index had recorded it as the *"login Input pattern source"* — a search component
standing in for a form field because none existed. That stand-in is what this
component replaces; SearchBar itself is unchanged.

`FIG-DS-INPUT-APP2` (the APP2 product-file supplement) is now marked `SUPERSEDED`
and points at the canonical component.

## E. `FIG-DS-SCRIM-TOKEN` — result

One semantic token, in the existing `Color` collection under the existing
lowercase-slash convention:

```text
overlay/scrim = ink/900 at 45%
scopes        = FRAME_FILL, SHAPE_FILL
```

One token deliberately — no 40/45/50 alpha family, as the directive requires. A
swatch at `78:2` on `HF01 · Foundations` demonstrates it: content behind, scrim
over, dialog above. That swatch also gives the registry row a real node, which
matters because the APP1 phase plan references this registry ID and the index
gate requires every referenced ID to resolve.

**Consumption in `APP_03`.** The product file mirrors DS semantics locally — every
existing APP3 frame binds `Color/Background/Primary` and friends from the product
file's own `Semantic` collection, not the DS variable directly. The scrim follows
that same established path: `Color/Overlay/Scrim` was added to the product
`Semantic` collection mirroring the DS token, and all **9** dialog and
bottom-sheet scrims now bind it.

```text
APP_03 dialog/sheet scrim fills = 0 literal black-alpha fills
scrims bound to the variable    = 9 / 9
```

## F. Literal-colour audit

The D01 report claimed every fill was variable-bound except the disclosed scrims.
**That claim was wrong**, and the audit this correction required is what found it.

| | count |
|---|---|
| Unbound fills at C1 entry | **513** |
| Watermark texts rebound (ink) | 668 |
| Watermark texts rebound (white, dark imagery) | 24 |
| Package title / scope note rebound | 2 |
| **Product-UI literals remaining** | **0** |
| Figma `SECTION` chrome remaining | 19 |

Cause: D01's own legibility repair replaced the watermark's bound fill with a
literal ink value in order to make it visible, and never rebound it. The count is
larger than the frame count because each watermark tiles ~20 text nodes per
canvas.

The 19 remaining are Figma's `SECTION` node background — editor chrome that is not
product UI and cannot carry a library variable. That is the only exception, and it
is named here rather than left implicit.

## G. Admin 1280 reference

| Frame | Node |
|---|---|
| `A03 · Template Editor — Admin Narrow Desktop · 1280` | `618:3` |
| `A01 · Placement Authoring — Admin Narrow Desktop · 1280` | `618:74` |

The canonical project breakpoint is **1280** — `DESIGN_SYSTEM_FOUNDATION.md` §10
sets desktop container 1440 / content 1280.

`A03` is the densest Admin layout and exercises layers, stage, inspector, save and
version status, and the toolbar together. Annotated: layers hold 240px and the
inspector 260px as minimums, the stage takes the remaining 780px and is the only
elastic region, the topbar drops its secondary version label, all three regions
stay simultaneously visible with nothing collapsing to a drawer, and the inspector
scrolls vertically while the stage never scrolls horizontally.

`A01` is drawn too, on the directive's own condition. Its collapse rule genuinely
cannot be inferred from `A03`: `A01`'s middle column is a **fixed-aspect** placement
preview that scales proportionally, where `A03`'s stage reflows freely. `A01` is
also the only Admin screen in the package carrying the application sidebar, which
narrows 240 → 200px.

Desktop-only Admin authoring is preserved. No mobile Admin editing was invented.

## H. Studio 1024 reference

`S02–S11 · Studio Editing — Tablet · 1024` — `618:140`.

The real editing surface, not the entry screen. It shows the stage, safe area and
background, an element selected with handles and a live mm read-out, the tool
rail, layer access, the zoom/pan control, the watermark and the save chip.

Annotated: the tool rail stays permanently visible at 48px touch targets; the
inspector becomes a right drawer toggled from the topbar and does not push the
stage; layers merge into that same drawer because 1024 cannot hold three regions;
stage width is prioritised; selection handles grow to 16px for fingers; watermark
and safe-area semantics are unchanged; and **autosave ownership stays with S10** —
the tablet does not own cadence.

Studio mobile was not redesigned.

## I. Responsive Reference update

Section 17 (`596:23`) now carries all five required references plus Admin mobile,
and each breakpoint card points at its concrete frame:

| Breakpoint | Reference |
|---|---|
| Admin 1440 | section 03 |
| **Admin 1280** | **`618:3`, `618:74`** |
| Admin 390 | `600:236`, `601:204` (read-only) |
| Studio 1440 | section 06 |
| **Studio 1024** | **`618:140`** |
| Studio 390 | section 15 |

No breakpoint is prose-only after this correction.

## J. Registry changes

```text
162 → 165 rows
```

- **New §4.8** — the three responsive frames, `REVIEW_REQUIRED`, owning phase
  `APP3-D01-C1`.
- **§6.1** — `FIG-DS-INPUT` now a real `component-set` row at `76:29`.
- **§6.1** — `FIG-DS-SCRIM-TOKEN` now a real `foundation` row at `78:2`.
- **§6.2** — `Color` collection 19 → 20 semantic variables, documenting
  `overlay/scrim` and its product-file mirror.
- **§6.1b** — `FIG-DS-INPUT-APP2` → `SUPERSEDED`, `Supersedes/By = FIG-DS-INPUT`.
- **§7** — the two `MISSING` gap rows removed; GAP-D01/GAP-D02 recorded as closed
  in the coverage summary, with the historical note retained.

The 66 original D01 rows are untouched and remain traceable. No node has two rows.
Nothing is self-approved.

## K. Screenshot / visual verification

Every item was rendered and inspected, not merely created:

| Evidence | Result |
|---|---|
| DS `Input` variants (`76:29`) | all five states legible; focus shows brand border + caret, error shows red border + red helper, disabled is dimmed but readable |
| DS scrim swatch (`78:2`) | scrim visibly recedes the content behind while the dialog stays crisp |
| `APP_03` dialog using the token (`602:152`) | archive dialog renders correctly through `Color/Overlay/Scrim` |
| Admin 1280 (`618:3`) | no overflow; save button, both panels and the stage all fully inside 1280; no clipped control |
| Studio 1024 (`618:140`) | stage remains the dominant region; drawer, tool rail, zoom and watermark all usable and unclipped |
| Section 17 | pointer lines render on all six breakpoint cards |

One defect was found and fixed during the work: a `strokeWeight:2` typo (colon for
equals) failed the tablet script. `use_figma` is atomic, so nothing partial was
written; the corrected script ran clean.

## L. Design-index validation

```text
node tools/check-figma-design-index.mjs
  → passed (165 registry IDs, 165 node rows, 15 registry tables;
    canonical files + statuses + deep links + composites verified)
pnpm format:check → clean
```

Two violations were surfaced and fixed rather than worked around:

1. `Duplicate registry ID "FIG-DS-INPUT"` — the ID already existed as a `MISSING`
   gap row. Resolved by closing the gap row instead of minting a second ID.
2. `APP1 phase plan references registry ID "FIG-DS-SCRIM-TOKEN" that is absent` —
   deleting the gap row broke a live reference. Resolved by giving the token a
   real swatch node so its row can exist with a node and deep link.

Also verified: no duplicate component identity (`Input` vs `SearchBar` are
distinct), no duplicate token semantic name (one `overlay/scrim`), no APP3-local
replacement for the DS Input, and no literal APP3 scrim after token creation. No
unrelated DS registry row was modified.

## M. Unchanged D01 semantics

Verified untouched: A01 Product → Side → Area hierarchy · A02 supported filters
and keyset pagination · A03 optimistic conflict UX · A04 full `GRD-T01`
visibility · A04 restore disabled with its `B04A` dependency · S01's `B05A`
preview dependency · S06's `B06C` dependency · S10 autosave ownership with cadence
`OPEN` · S11 mobile/touch ownership · watermark policy · no download or export ·
no 3D · *Nét Thêu* branding · the BRD0 · C3 logo.

The only pre-existing frames modified are the 9 scrims (fill rebound to the
token), the watermark and heading texts (fills rebound to variables), and the
section 17 cards (pointer lines added). No layout changed anywhere.

## N. Changed docs and Figma nodes

**Docs:** `docs/design/FIGMA_DESIGN_INDEX.md`,
`docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md`.

**Figma — `FIG-FILE-DS`:** `HF01 · Components · Forms` page, `Input` set `76:29`
(+5 variants), `overlay/scrim` variable, swatch `78:2`.

**Figma — `FIG-FILE-PRODUCT` / `APP_03`:** frames `618:3`, `618:74`, `618:140`;
`Color/Overlay/Scrim` added to the `Semantic` collection; 9 scrims rebound; 694
fills rebound; 7 pointer texts in section 17.

## O. Commit A

```text
b831a22 fix(design): close APP3 D01 implementation-readiness gaps
```

## P. Clean tree and no push

```text
branch                 = production
git status --porcelain = 0 entries
Commit A               = b831a22
Commit B               = this report only, immediately after Commit A
pushed                 = nothing
amend / squash / rebase = none
repository scope       = design/docs only — no runtime, API, worker, database,
                         OpenAPI, generated client, manifest or dependency change
```

## Q. Frontend readiness awaiting human approval

Both review findings are closed. The remaining gate is human design approval,
which this correction may not grant itself — all new and corrected rows are
`REVIEW_REQUIRED`.

| Checkpoint | Design | Backend | Remaining blocker |
|---|---|---|---|
| `APP3-A01` | READY | READY (`B01`) | D01 design approval |
| `APP3-A02` | READY | READY (`B03`) | D01 design approval |
| `APP3-A03` | READY | READY (`B03A`) | D01 design approval |

On approval, expected state:

```text
APP3-D01 = COMPLETE — REVIEW_ACCEPTED     (human action, not this correction)
APP3-A01 = READY — NOT STARTED
APP3-A02 = READY — NOT STARTED
APP3-A03 = READY — NOT STARTED
NEXT_ELIGIBLE_FRONTEND_CHECKPOINTS = APP3-A01 APP3-A02 APP3-A03
```

Unchanged just-in-time backend blockers:

```text
APP3-B04A → A04 restore
APP3-B05A → S01 Template preview / media
APP3-B06C → S06 private preview
FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 → production Template image intake
```

One new follow-up, recorded in the phase status block:

```text
FU-DESIGN-PUBLISH-DS-INPUT-01 = OPEN — OWNER_DESIGN_SYSTEM
```

The DS `Input` component and `overlay/scrim` token exist and are canonical, but
Figma library publishing is a manual UI action that no API can perform. Until an
operator republishes `DS – Core Components (WF06)`, the new assets cannot be
instanced cross-file into `APP_03`. This is why the `APP_03` inputs are not yet
swapped to component instances — the directive's own *"where Figma component
architecture allows it"* condition is not satisfiable until that publish happens,
and creating a parallel APP3-local input to work around it is explicitly
forbidden. The canonical authority the gap asked for now exists either way.
