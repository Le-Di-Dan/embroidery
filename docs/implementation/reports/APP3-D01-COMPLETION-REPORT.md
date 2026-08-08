# APP3-D01 — phase-level Figma design package

`STATUS = COMPLETE — REVIEW_DELIVERED`
`COMMIT_A = e7c022d docs(design): deliver APP3 phase design package`

## A. Figma file and page

| | |
|---|---|
| File | `embroidery` — `FIG-FILE-PRODUCT` |
| File key | `BQwqV8GdfUIELvsQDB1UQE` |
| Page | **`APP_03`** — node `592:3` (the page named in the operator's instruction) |
| Root section | **`596:3`** — [APP3-D01 · Design Templates & 2D Studio](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=596-3) |
| Sub-sections | 19 |
| Frames | **66** |
| Registry rows added | **66**, all `REVIEW_REQUIRED` |

The page existed and was empty; all content in it is this checkpoint's.

## B. Sections created

The directive's 19 section names are used verbatim, as **nested** Figma sections
inside one top-level section. That is the one structural judgment worth stating:
`APP1-D01` and `APP2-D01` each register a *single* section node as the anchor for
their row set, and the registry's link rules are built around that. Nesting keeps
both — one parent anchor for the registry, and the 19 named sections the
directive asks for.

| Section | Node | Frames |
|---|---|---|
| 00 — APP3 Overview / Flow Map | `596:6` | 1 |
| 01 — Admin Placement Authoring | `596:7` | 4 |
| 02 — Admin Template List | `596:8` | 5 |
| 03 — Admin Template Editor | `596:9` | 5 |
| 04 — Admin Template Lifecycle | `596:10` | 5 |
| 05 — Studio Shell / Template Selection | `596:11` | 5 |
| 06 — Studio Stage / Selection | `596:12` | 3 |
| 07 — Studio Transform Controls | `596:13` | 3 |
| 08 — Studio Layers | `596:14` | 3 |
| 09 — Studio Text | `596:15` | 3 |
| 10 — Studio Image / Asset | `596:16` | 4 |
| 11 — Studio Zoom / Pan / Safe Area | `596:17` | 3 |
| 12 — Studio Undo / Redo | `596:18` | 2 |
| 13 — Studio Watermark | `596:19` | 4 |
| 14 — Studio Autosave / Conflict / Resume | `596:20` | 6 |
| 15 — Studio Mobile / Touch | `596:21` | 6 |
| 16 — Shared APP3 Components / States | `596:22` | 2 |
| 17 — Responsive Reference | `596:23` | 1 |
| 18 — Handoff / Dependency Notes | `596:24` | 1 |

## C. Admin coverage (A01–A04)

**A01 · Placement authoring** — Product → Side → Area hierarchy as an explicit
three-level tree, a placement preview showing the side background with the
embroidery-area rectangle, its resize handles and a separate dashed safe
boundary, and a numeric inspector. Retired rows appear in the tree with a
`retired` badge rather than disappearing, because `IMP-D041` retires without
deleting. States: default, area editing, validation error (out-of-bounds width,
flagged at the field, on the preview and in a form-level bar), loading.

**A02 · Template list** — `DRAFT`/`PUBLISHED`/`ARCHIVED` badges, scope column,
version, updated. Filters are **only** status and product, with the constraint
written on the toolbar: `APP3-B03` offers no text search, no sort and no total
count. Pagination is keyset — "Trang sau", never page numbers. States: default,
loading skeleton, empty, API error, mobile card list.

**A03 · Template editor** — layers, stage with the area and its safe boundary,
and a context-sensitive inspector. The save-state chip carries the four states
(saved / unsaved / saving / conflict). The **conflict dialog** is the piece worth
reviewing: it names `409 · STALE_WRITE`, says plainly that the server was *not*
overwritten, offers exactly two choices, and warns that keeping the local draft
is browser-only. No automatic merge and no real-time collaboration anywhere.
Mobile is a deliberate read-only notice.

**A04 · Lifecycle** — the publish-readiness panel enumerates **all seven**
`GRD-T01` conditions with per-condition detail; the failure frame shows two
failing and two unevaluable, states that the server changed nothing, and says
the guard cannot be reduced. Archive requires a bounded reason and uses a
destructive-styled confirm. Restore is drawn, disabled, and annotated
`BLOCKED_BY_APP3-B04A`.

## D. Studio coverage (S01–S11)

`S01` shell and picker (default, preview-pending, empty, session expired,
mobile) · `S02` stage with nothing selected / element selected / empty document ·
`S03` move, resize, rotate with eight handles and a live mm read-out · `S04`
layers list, drag-reorder with drop indicator, empty · `S05` text editing, font
picker restricted to the `APP3-F01` registry, validation plus font-loading
fallback · `S06` upload, normalizing, ready-and-placed, failed inspection · `S07`
fit / zoomed-and-panned / safe-area hidden with a legend · `S08` undo-redo with a
history list, disabled state and keyboard hints · `S09` watermark over light and
dark imagery plus mobile and a policy note · `S10` saved, saving, offline,
stale-revision conflict, resume, expired · `S11` mobile stage and the transform,
layers, text, image and conflict bottom sheets.

`APP3-S12` and `APP3-S13` are **not** designed. They are named once, in section
00, as `LATER_APP3`.

## E. Responsive coverage

Admin desktop 1440, Admin mobile 390, Studio desktop 1440, Studio mobile 390 are
drawn as real frames. Section 17 states all six breakpoint behaviours including
Admin narrow laptop 1280 and Studio tablet 1024, which are specified rather than
drawn — recorded here as a known limitation (§K).

## F. Tokens and components reused

Every fill is a **bound variable**, not a literal: `Color/Background/*`,
`Color/Surface/*`, `Color/Text/*`, `Color/Border/*`, `Color/Action/Primary`,
`Color/Status/{Success,Warning,Error,Info}` from the `Semantic` collection, over
the `Primitive` and `Foundation` collections. Type follows the
`Typography/{Display,Heading,Body,Caption}` ramp on Inter. Brand mark is the
existing `Nét Thêu` wordmark; the logo was not redesigned, reinterpreted or
restyled, and no `N` monogram was invented.

No token was derived from a wireframe, and no APP3-local colour, radius or
spacing value was introduced.

## G. Design-system gaps

Section 16 carries a frame recording both gaps from the directive's §22:

- **`FIG-DS-INPUT`** — inputs are used across A01/A03/S05 and are composed from
  existing tokens here; the canonical component still belongs in the DS file.
- **`FIG-DS-SCRIM-TOKEN`** — there is still no token for the dialog scrim. Every
  dialog in this package uses black at 40–50%, which is a literal, and is
  disclosed as such.

Both are **reported, not written**. `FIG-FILE-DS` is registered *Read-only —
repair only via reported deviation*, and this checkpoint treats that as binding
rather than as permission. Completing them is a design-system owner's action.

## H. Backend dependency annotations

Section 18 carries the full table; each capability frame repeats its own
dependency inline. Accepted and implementable: `A01→B01`, `A02→B03`,
`A03→B03A`, `A04→B04`, `S01→B05`, `S01→B07`, `S02–S05→P01/P02/B07`, `S06→B06B`,
`S10→B08`.

Not yet available, drawn disabled with the reason visible:

| Capability | Owner | Status |
|---|---|---|
| A04 restore | `APP3-B04A` | `READY — NOT STARTED` |
| S01 Template preview media | `APP3-B05A` | `READY — NOT STARTED` |
| S06 private editor preview | `APP3-B06C` | `READY — NOT STARTED` |
| Store `TEMPLATE_SOURCE` creation | `FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01` | `OPEN — OWNER_NOT_YET_ASSIGNED` |

No endpoint is invented anywhere in the package, and no placeholder asset URL is
fabricated for `B05A` — the picker card shows an explicit empty preview slot.

## I. Key design decisions

1. **Disabled-with-a-reason, never hidden.** A capability whose backend has not
   shipped is drawn, disabled, and labelled with the checkpoint that owns it.
   Hiding it would let a frontend checkpoint quietly wire it up later.
2. **The publish guard is shown whole.** All seven `GRD-T01` conditions are
   visible even when passing, so the screen cannot drift into a reduced guard.
3. **Conflict is a decision, never a merge.** Both A03 and S10 present the two
   choices explicitly and state that the server was not overwritten.
4. **The watermark is an overlay, and the design says so.** Ink at ~13% over
   light imagery, white at ~22% over dark. It is never part of the document,
   there is no toggle, there is no download or export control anywhere, and the
   policy note explicitly does *not* claim screenshots can be prevented.
5. **No autosave cadence.** `AUTOSAVE_CADENCE` stays `OPEN` — it is `APP3-S10`'s
   to decide. S10's frames describe behaviour, never an interval.
6. **Admin editing is desktop-only** and mobile says so, rather than degrading
   silently. The touch surface is the customer Studio (S11).

## J. Evidence

| Check | Result |
|---|---|
| `node tools/check-figma-design-index.mjs` | **passed** — 162 registry IDs, 162 node rows, 14 tables |
| APP3 gates `b05 b04 b03a b03 g01 g02 g04 db01 b01` | all exit 0 |
| `pnpm format:check` | clean |
| Frames verified by screenshot | flow map, A01 default + validation, A02 default, A03 conflict, A04 guard failure, S02 selected, section 01 after normalisation |

Three real defects were found by screenshot and fixed, not left:

- A01's three-column layout overflowed the 1440 frame; columns were refitted to
  296/520/280 and the screens set to clip.
- Disabled buttons rendered **white text on white fill** — invisible. The button
  helper now only uses inverse text on a solid fill.
- The Studio watermark was white-on-white and therefore absent; selection handles
  and the size label were clipped by the element frame; the zoom control sat
  below the frame edge. All three fixed and re-verified.

A fourth was structural: section children take **section-relative** coordinates,
so all 66 frames initially sat outside their own sections and the root section
was ~75 000 px tall. Every frame was normalised into its section and the sections
re-flowed; the root is now 29 484 px.

## K. Intentional non-scope and limitations

1. **No frontend implementation.** No runtime source, API, worker, schema,
   OpenAPI or generated client was touched. `git status` covered only
   `docs/design/FIGMA_DESIGN_INDEX.md`, the phase plan and the roadmap.
2. **`APP3-S12`/`S13` not designed.**
3. **Admin 1280 and Studio 1024 are specified, not drawn.** Section 17 states the
   behaviour for both; neither has its own frame. If review wants them drawn,
   that is a bounded addition.
4. **Prototype links are not wired.** Frames are static; interaction is carried
   by annotation.
5. **`FIG-DS-INPUT` / `FIG-DS-SCRIM-TOKEN` remain open** in the DS file (§G).
6. Pre-existing debts disclosed by `APP3-B05` are unchanged and untouched.

## L. Review checklist

- [ ] Brand reads as *Nét Thêu* — luxury youthful, quiet, artwork-first — and the
      logo is untouched.
- [ ] Every colour, type and spacing value resolves to a DS variable/style.
- [ ] A01 makes Product → Side → Area unmistakable, and retired rows are visible
      rather than hidden.
- [ ] A02 exposes no filter `APP3-B03` cannot serve.
- [ ] A03's conflict dialog can never be read as "your change won".
- [ ] A04 shows all seven `GRD-T01` conditions and never implies restore exists.
- [ ] S01 shows no fabricated preview URL.
- [ ] The watermark is legible on both light and dark imagery and cannot be
      mistaken for design content.
- [ ] S10 states no autosave interval.
- [ ] S11 touch targets are ≥ 44 px and no autosave ownership moved there.

## M. Checkpoint readiness

| Frontend checkpoint | Design ready? | Backend ready? | Remaining blocker |
|---|---|---|---|
| `APP3-A01` | **YES** | **YES** (`B01`) | D01 design approval |
| `APP3-A02` | **YES** | **YES** (`B03`) | D01 design approval |
| `APP3-A03` | **YES** | **YES** (`B03A`) | D01 design approval |
| `APP3-A04` | **YES** | Partial — `B04` accepted, `B04A` not started | D01 approval; restore stays disabled |
| `APP3-S01` | **YES** | Partial — `B05`/`B07` accepted, `B05A` not started | D01 approval; preview media |
| `APP3-S02`–`S05`, `S07`–`S10` | **YES** | **YES** | D01 approval; sequenced behind `S01` |
| `APP3-S06` | **YES** | Partial — `B06B` accepted, `B06C` not started | D01 approval; private preview delivery |
| `APP3-S11` | **YES** | n/a (frontend only) | D01 approval; sequenced behind `S01` |

**One deviation from the directive's §29 to flag explicitly.** §29 asks to record
`NEXT_ELIGIBLE_FRONTEND_CHECKPOINTS = APP3-A01, APP3-A02, APP3-A03`. The package
genuinely covers all three — but `FIGMA_DESIGN_INDEX.md` §2 blocks any frontend
checkpoint whose registry row is not `APPROVED_FOR_IMPLEMENTATION`, and §2 also
forbids a design checkpoint from approving its own frames. Recording the three as
flatly eligible would contradict the registry rule this same checkpoint just
wrote 66 rows into. The status block therefore records:

```text
NEXT_ELIGIBLE_FRONTEND_CHECKPOINTS =
  APP3-A01 APP3-A02 APP3-A03 — CONDITIONAL_ON_APP3-D01_DESIGN_APPROVAL
FRONTEND_GATE = APP3-D01 — DELIVERED, AWAITING_DESIGN_APPROVAL
```

Approving the rows is the operator's action and unblocks all three immediately.

## N. Forward state

```text
APP3-D01 = COMPLETE — REVIEW_DELIVERED

APP3-B05A = READY — NOT STARTED
APP3-B04A = READY — NOT STARTED
APP3-B06C = READY — NOT STARTED

FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = OPEN — OWNER_NOT_YET_ASSIGNED
AUTOSAVE_CADENCE = OPEN — UNTIL_APP3-S10
```

Per the directive's §31 this checkpoint **stops here**. Implementation does not
continue automatically; human review chooses the first frontend checkpoint from
`APP3-A01`, `APP3-A02`, `APP3-A03` after approving the design rows.

## O. Clean tree and no push

```text
branch                 = production
git status --porcelain = 0 entries
Commit A               = e7c022d docs(design): deliver APP3 phase design package
Commit B               = this report only, immediately after Commit A
pushed                 = nothing
amend / squash / rebase = none
```
