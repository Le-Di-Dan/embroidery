# `APP4-D01` — Completion Report

**Checkpoint:** `APP4-D01` — Complete APP4 phase design package
**Date:** 2026-08-14 · **Branch:** `production`

---

## A. Verdict

**`PASS`**

One coherent, implementation-ready design package covering `APP4-S01`, `APP4-S02`
and `APP4-A01`. No stop condition was met. No runtime code was written.

---

## B. Pre-draw Design Index audit (mandatory)

**Performed before any Figma write.** No Figma tool was called until the audit
below was complete; the first Figma call of the checkpoint was a read
(`get_metadata` on `620:3`), and the first write came after both the registry and
the canvas had been shown empty of APP4 content.

### B.1 What `FIGMA_DESIGN_INDEX.md` contained

The registry (837 lines, 16 tables) was searched for every APP4-owned term the
directive names:

| Search term | Rows found |
|---|---|
| `APP4` | **0** |
| `APP_04` | **0** |
| `620:3` / `620-3` | **0** |
| `xac-minh` / `/xac-minh-lien-he` | **0** |
| `truy-cap` / `/truy-cap` | **0** |
| `customer-access` / `/support/customer-access` | **0** |
| `APP4-S01`, `APP4-S02`, `APP4-A01` | **0** |

Registered page write targets before this checkpoint were `APP_01` `371:3`,
`APP_02` `419:3`, `APP_03` `592:3`. **`APP_04` was not registered at all.**

### B.2 Outcome

```text
NO_EXISTING_APP4_DESIGN
```

**Pre-existing APP4 node IDs or deep links discovered: none.** Outcomes A
(reuse), B (supplement in place) and C (repair stale rows) are therefore all
inapplicable — there was nothing to reuse, supplement or repair.

This independently matches `APP4-P00` §D.1, which classified APP4 design as `NEW`
on the ground that "the Figma registry carries zero APP4 rows".

### B.3 Was a Figma write necessary?

**Yes.** Confirmed twice, from two directions:

1. the registry held no APP4 authority (§B.1);
2. the canonical canvas itself was **empty** — `get_metadata` on `620:3` returned
   `<canvas id="620:3" name="APP_04" x="0" y="0" width="0" height="0" />` with no
   children, and the first write script re-confirmed `pageWasEmpty: true`.

A frontend checkpoint blocked on a missing row would have had nothing to open, so
`§1.2` applies and the full package was created.

---

## C. Figma target

```text
fileKey:      BQwqV8GdfUIELvsQDB1UQE
APP_04 node:  620:3
root section: 621:3
```

No new Figma file was created. Nothing was drawn on another page.

| Sub-section | Node | Frames |
|---|---|---|
| `00 — APP4 Overview / Flow Map` | `621:4` | 1 |
| `01 — S01 · Contact Verification · Desktop` | `621:5` | 13 |
| `02 — S01 · Contact Verification · Mobile` | `621:6` | 5 |
| `03 — S02 · Secure-Link Landing` | `621:7` | 6 |
| `04 — A01 · Admin Customer Access Support` | `621:8` | 18 |
| `05 — Shared · Security UX Rules` | `621:9` | 2 |
| `06 — Shared · Responsive & Accessibility` | `621:10` | 2 |
| `07 — Handoff / Dependency Notes` | `621:11` | 1 |
| **Total** | | **48** |

The single-section anchor with named numbered sub-sections follows the
`APP1-D01` / `APP2-D01` / `APP3-D01` convention already in the file.

---

## D. Surface coverage

### D.1 `APP4-S01` — Storefront contact verification · `/xac-minh-lien-he`

Desktop 1440 (13) and Mobile 390 (5). All 13 required states are drawn:

| # | State | Node | Deep link |
|---|---|---|---|
| 1 | Contact entry — default | `623:3` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=623-3) |
| 2 | Invalid contact input | `623:27` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=623-27) |
| 3 | Request submitting | `623:51` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=623-51) |
| 4 | Code sent / code entry | `623:75` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=623-75) |
| 5 | Code verification submitting | `623:108` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=623-108) |
| 6 | Code mismatch | `625:3` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=625-3) |
| 7 | Resend cooldown active | `625:36` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=625-36) |
| 8 | Resend available / resent | `625:70` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=625-70) |
| 9 | Challenge expired | `625:106` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=625-106) |
| 10 | Maximum-attempt lockout | `625:140` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=625-140) |
| 11 | Rate limited / temporarily unavailable | `625:173` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=625-173) |
| 12 | Verification success | `625:193` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=625-193) |
| 13 | Recoverable network/server error | `625:211` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=625-211) |

Mobile 390: contact entry `628:3`, code entry `628:25`, cooldown `628:57`,
lockout `628:90`, success `628:121`.

Both contact kinds are supported through one tab control (`Email` /
`Số điện thoại`); the phone field shows a Vietnam-default national number and
never exposes normalization mechanics. No provider is named anywhere.

**No account-login or registration state was drawn.**

### D.2 `APP4-S02` — Storefront secure-link landing · `/truy-cap`

| State | Node | Deep link |
|---|---|---|
| Bootstrap / resolving | `629:3` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=629-3) |
| Valid grant — authorized shell | `629:20` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=629-20) |
| **Unavailable — one state for six causes** | `629:37` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=629-37) |
| Transient network error | `629:53` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=629-53) |
| Valid grant — mobile | `629:70` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=629-70) |
| Unavailable — mobile | `629:87` | [open](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=629-87) |

The transient-error state is drawn as materially distinct on purpose and its
spec strip says why: an infrastructure failure asserts **nothing** about the
link, whereas the unavailable state is a verdict. Collapsing them would either
turn a network blip into "your link is dead", or turn the unavailable screen into
a retry loop.

Each frame carries an **address-bar annotation** showing `netheu.vn/truy-cap`
with **no fragment** — the visual proof that `#t=` is gone by the time the page
renders.

### D.3 `APP4-A01` — Admin verification & delivery support · `/support/customer-access`

All 17 required states plus a narrow-desktop reference:

| # | State | Node |
|---|---|---|
| 1 | Initial loading | `631:3` |
| 2 | Customer/contact loaded | `631:45` |
| 3 | No active grant | `631:124` |
| 4 | Active grant | `631:189` |
| 5 | Revoke confirmation (reason required) | `631:251` |
| 6 | Revoking | `631:326` |
| 7 | Revoke success | `632:3` |
| 8 | Revoke conflict | `632:59` |
| 9 | No notification failure | `632:108` |
| 10 | Terminal notification failure | `632:169` |
| 11 | Manual replay confirmation | `632:246` |
| 12 | Replay submitting | `632:329` |
| 13 | Replay success | `633:3` |
| 14 | Duplicate/concurrent replay — canonical current state | `633:86` |
| 15 | `REISSUE_REQUIRED` | `633:147` |
| 16 | Data-load error | `633:226` |
| 17 | Empty / not-found | `633:253` |
| — | Narrow desktop reference (1280) | `633:277` |

Deep links for every row are in `FIGMA_DESIGN_INDEX.md` §4.10.

The Admin shell, sidebar and navigation follow the existing Admin conventions;
no second Admin application was invented. State 14 is deliberately **not** an
error: a duplicate replay resolves to the current replay, so the screen shows
that state with an informational note rather than a conflict banner.

### D.4 Components reused / created

**Reused (existing DS + product-file tokens):** `Typography/Heading/S`,
`Typography/Body/L·M·S`, `Typography/Caption`; `Color/Text/{Primary,Secondary,Tertiary}`,
`Color/Background/{Primary,Secondary}`, `Color/Surface/Primary`,
`Color/Border/{Primary,Secondary}`, `Color/Action/Primary`,
`Color/Status/{Success,Warning,Error,Info}`, `Color/Neutral/White`,
**`Color/Overlay/Scrim`** (the `APP3-D01-C1` token, used by both APP4 dialogs);
`Radius/*` and `Space/*` values; the Storefront header/footer and Admin
shell/sidebar patterns established by `APP1-D02` and `APP2-D01`.

**New components created: none.** `0` component masters, `0` component instances,
`0` new variables, `0` new text styles, `0` new effect styles — measured live in
the integrity audit.

Form fields, OTP digit boxes, badges, alerts, dialogs and the attempt table are
**local compositions bound to approved tokens**, not new components. This follows
the `APP2-D01` precedent for the same reason it applied there: `FIG-DS-INPUT`
(`76:29`) exists but is **not published**, so it cannot be instanced cross-file
until an operator republishes the DS library (`FU-DESIGN-PUBLISH-DS-INPUT-01`,
still open). Every field in this package is layer-named `Label` / `Field` /
`Value` / `Help text` / `Error message` so the frontend can wire `<label for>`
and `aria-describedby` structurally, exactly as `FIG-DS-INPUT-APP2` did.

---

## E. Security UX evidence

| Requirement | Evidence |
|---|---|
| Customer contact ownership is not enumerated | Rate-limit state `625:173` says only "you have requested a code too many times"; its spec strip and the shared frame `634:59` state the rule. No screen distinguishes a known from an unknown contact. |
| Secure-link unavailable causes share one rejection state | One frame per viewport (`629:37`, `629:87`). Frame `634:59` tabulates all six backend causes against the same customer-facing screen with "Phân biệt được? Không" on every row. |
| Token is never visually exposed | No token input, copy control, debug readout, query parameter or path segment exists in any frame. The address-bar annotation shows a clean `/truy-cap`. |
| Admin never displays secret/hash/ciphertext | Every A01 frame shows `b***@vidu.com`; each card carries an explicit masking/redaction note; the attempt table shows only bounded `error_class` values (`CHANNEL_TIMEOUT`, `CHANNEL_UNAVAILABLE`). Forbidden-display list is drawn on `634:38`. |
| `REISSUE_REQUIRED` is Admin-only support semantics | Appears only in `633:147`, in the Admin surface, with the replay action disabled and a handoff to `APP4-B03` / `APP4-B05`. It appears in no Storefront frame. |
| No APP5/APP6/APP7 business action was invented | The S02 authorized shell renders a **dashed, explicitly labelled handoff slot** ("Nội dung yêu cầu sẽ hiển thị tại đây … thuộc APP5 trở đi") instead of inventing quotation, approval or payment content. Scope boundaries are restated on `634:3` and `634:154`. |

Two further security facts are drawn rather than assumed: plaintext code and
token never appear in any frame (there is no state in which a real code is shown
to an operator), and the terminal-failure frame states that the old failed record
stays as evidence while a replay creates a **new** record — the UI expression of
the `DEAD_LETTER`-is-terminal ruling.

**Copy boundary:** no backend term (`challenge`, `intent_key`, `DEAD_LETTER`,
`aggregate_id`, `payload_schema_version`, `SECURE_LINK_UNAVAILABLE`,
`REISSUE_REQUIRED`) appears in Storefront-facing copy. `REISSUE_REQUIRED` and the
`FAILED_*` outcome labels appear only in Admin frames and spec strips, which is
consistent with the existing Admin product surfacing operational vocabulary.

---

## F. Design-system evidence

Reused, in full, from the approved system:

- **Text styles (5 of 11):** `Typography/Heading/S`, `Typography/Body/L`,
  `Typography/Body/M`, `Typography/Body/S`, `Typography/Caption`.
- **Variables (13):** the `Semantic` collection colours listed in §D.4 plus
  `Color/Neutral/White` from `Primitive` and `Color/Overlay/Scrim`.
- **Patterns:** Storefront header/nav (`APP1-D02`), Admin sidebar + topbar +
  content shell (`APP1-D01`, `APP2-D01`), card/alert/badge/dialog composition and
  scrim usage (`APP3-D01`), skeleton loading bars (`APP2-D01` / `APP3-D01`).

**New components: none, and reuse was never impossible.** The one genuine DS gap
encountered — an unpublished `FIG-DS-INPUT` — is pre-existing, already tracked as
`FU-DESIGN-PUBLISH-DS-INPUT-01`, and was handled by composition rather than by
duplicating a component with an `APP4` prefix.

---

## G. Design Index reconciliation

`docs/design/FIGMA_DESIGN_INDEX.md` updated in this same checkpoint:

1. **§3** — added the `APP_04` write target (`620:3`), alongside `APP_01`/`APP_02`/`APP_03`.
2. **§4.10** — new section `APP4-D01 — Customer Identity, Verification, Secure
   Access & Notification (NEW, this checkpoint)` with the pre-draw audit outcome,
   sub-section anchors, the policy-authority pointer, and **48 rows**:

| Group | Rows | Registry ID prefix |
|---|---|---|
| S01 desktop | 13 | `FIG-VERIFY-CONTACT-DESKTOP-*`, `FIG-VERIFY-CODE-DESKTOP-*` |
| S01 mobile | 5 | `FIG-VERIFY-CONTACT-MOBILE-*`, `FIG-VERIFY-CODE-MOBILE-*` |
| S02 | 6 | `FIG-SECURELINK-{DESKTOP,MOBILE}-*` |
| A01 | 18 | `FIG-ADMIN-CUSTOMERACCESS-*`, `FIG-ADMIN-GRANT-*`, `FIG-ADMIN-DELIVERY-*` |
| Shared annotations | 6 | `FIG-APP4-*` |

3. **§10** — added an `APP4-D01` audit-metadata entry; corrected the product-file
   page count (6 → **8**, it predated `APP_03` and `APP_04`) and recorded the
   gate-measured registry total.

**Status of every new row: `REVIEW_REQUIRED`. Approval evidence: `—`.**

### G.1 A conflict I did not resolve silently

The directive's §14 asks for "the canonical equivalent of
`APPROVED_FOR_IMPLEMENTATION`". The registry's own mandatory rules say the
opposite in three places — §2 rule 4 ("New frames enter as `REFERENCE_ONLY`;
**never self-approve**"), §8 step 3 ("Set new rows `REVIEW_REQUIRED`") and §9
("New design lands `REVIEW_REQUIRED`. A human reviewer promotes to
`APPROVED_FOR_IMPLEMENTATION` … in a later evidence update").

The same §14 also requires the status to "reflect the actual final state expected
by repository convention", and convention is unambiguous. `APP3-D01` — the
directly comparable package — entered **every** row as `REVIEW_REQUIRED`, and
rows were promoted later, scoped to the checkpoint consuming them, each with a
named operator-review evidence id.

The gate enforces it mechanically as well: `APPROVED_FOR_IMPLEMENTATION` requires
a non-empty Approval Evidence value, and a design checkpoint cannot author
evidence for its own review.

So the rows are `REVIEW_REQUIRED`, and the design is complete but **not**
self-approved. Promotion is the Product Owner's, and `APP4-S01`/`S02`/`A01` are
blocked until it lands — which is precisely the gate this registry exists to be.

---

## H. Integrity evidence

Verified live after the last write, not asserted from memory:

| Check | Result |
|---|---|
| All 48 APP4 frames exist under `621:3` | **PASS** — inventory returned 48 across 8 sub-sections |
| Every frame fits inside its sub-section | **PASS** — 0 overflow |
| Annotation content fits its frame | **PASS** — max content bottom 688 of 900 |
| No stale/clipped text nodes | **PASS** — 0 nodes left at `textAutoResize: 'NONE'` |
| Registry node IDs resolve and links match | **PASS** — gate verifies file key, node and deep link agree on all 213 rows |
| `APP1-D01` section `375:11` | intact — 19 children |
| `APP1-D02` section `405:2224` | intact — 9 children |
| `APP2-D01` section `423:3` | intact — 37 children |
| `APP2-S02-G01` section `529:2224` | intact — 10 children |
| `APP3-D01` section `596:3` | intact — 21 children |
| `APP3-D01-C1` section `596:23` | intact — 4 children |
| `BRD0-F01` section `546:3` | intact — 1 child |
| `FIG-FILE-DS` (`hsxSjwkqQKM9vuyRgWSesU`) | **not opened for writing at all** |
| Duplicate APP4 package | none — `APP_04` was empty and exactly one root section was created |

Pages in the product file after the checkpoint: Information Architecture,
**APP_04**, APP_03, APP_02, APP_01, Wireframe, User Interface, LOGO_SYSTEM — the
seven pre-existing ones unchanged, plus the APP4 content on the already-existing
`APP_04` canvas.

---

## I. Validation ledger

| # | Command | Why | Result | Rerun? |
|---|---|---|---|---|
| 1 | `node tools/check-figma-design-index.mjs` | The only validation this checkpoint's changes justify: 48 new registry rows, a new page write target and edited audit metadata. | **PASS** — 213 registry IDs, 213 node rows, 16 tables | Yes — once, after the §10 metadata edit changed a covered file. Both runs passed. |
| 2 | `pnpm exec prettier --check docs/design/FIGMA_DESIGN_INDEX.md docs/implementation/reports/APP4-D01-COMPLETION-REPORT.md` | Both changed files are Markdown that Prettier owns. Explicit paths only. | **PASS** | No |
| 3 | `git diff --check` | Whitespace/conflict-marker safety on the changed documentation. | clean | No |

```text
No runtime/unit/integration/E2E regression was run.
```

Not run, and why: Jest, API/worker integration, frontend component tests and
Playwright (no runtime source changed); repository typecheck and app builds (no
TypeScript changed); OpenAPI and API-client generation/check (no HTTP surface);
DB manifest and migrations (no schema); `check-app4-g01.mjs` (its inputs — the
ADR, the seed dataset, `.env.example`, the register — were not touched by this
checkpoint, so re-running it would be the reassurance repeat §17 forbids);
SonarQube; `pnpm quality`; any aggregate chain.

**Figma call discipline (§17).** Reads were targeted rather than exploratory: one
`get_metadata` to prove the canvas empty, one to learn the `APP3-D01` frame
convention, two `get_variable_defs` to resolve real token names, and four
screenshots — each taken to verify a distinct newly-built pattern, one of which
caught a real defect. No frame was redrawn after it satisfied the authority; the
two repair scripts amended only the specific broken property.

### I.1 One real defect, found by screenshot and fixed at the source

The first S01 batch rendered with the resend link **clipped** at the card edge.
The first repair guess — that the card was not hugging vertically — was wrong: it
already was. The measurement showed the true cause: `resize()` on a Figma TEXT
node silently flips `textAutoResize` from `HEIGHT` to `NONE`, freezing the node
at the 10px placeholder height it was given, so the auto-layout parent hugged to
a height ~7px short of the real glyphs.

That is why the first repair pass reported `recomputed: 0` — it only touched
nodes already at `HEIGHT`, which was exactly the wrong set. The corrected pass
restored `HEIGHT` on all 120 affected nodes, and the helper used for every later
section sets width **before** re-asserting `textAutoResize`, so the bug could not
recur. The final integrity audit confirms 0 stale nodes across all 48 frames.

---

## J. Files changed

**Created (1)**

- `docs/implementation/reports/APP4-D01-COMPLETION-REPORT.md`

**Modified (1)**

- `docs/design/FIGMA_DESIGN_INDEX.md` — §3 `APP_04` write target, new §4.10 with
  48 rows, §10 audit metadata

**Figma (external to git):** `BQwqV8GdfUIELvsQDB1UQE` page `APP_04` (`620:3`) —
1 root section, 8 sub-sections, 48 frames created.

No runtime source, schema, migration, OpenAPI artifact, generated client,
package manifest, lockfile or root script was touched.

---

## K. Git evidence

| Item | Value |
|---|---|
| Branch | `production` |
| Entry HEAD | `0e1b53b433cc92fc7a5d8989b5037399f1ed31d9` |
| Commit | `da5500812bc67e1a35d0157107f0dd2391826f5e` |
| Subject | `docs(app4): deliver APP4-D01 phase design package and reconcile the Figma registry` |
| Evidence commit | `docs(app4): record APP4-D01 commit evidence` — substitutes the hash above and changes nothing else |
| Final HEAD | the evidence commit, the second and last of the two |
| Working tree after both commits | clean |
| Pushed | **no** |

A commit cannot contain its own hash, so the package commit's hash is written by
the one-line evidence commit that follows it — the same two-step `APP4-P00` and
`APP4-G01` used. Recover the final HEAD with `git rev-parse HEAD`.

---

## L. Next checkpoint

**`APP4-P01`** — contact normalization, masking and opaque-secret primitives.

It is the correct next step because it depends on `APP4-G01` only (which is
`PASS`) and on no design row at all, so it can proceed while this package is in
review. `APP4-S01`, `APP4-S02` and `APP4-A01` remain **blocked** until a reviewer
promotes the §4.10 rows out of `REVIEW_REQUIRED`.

`APP4-P01` was **not** started here.

---

## M. Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Index inspected before any Figma write | **MET** — §B; first Figma call was a read |
| 2 | Existing APP4 design reused/supplemented if it existed | **MET (vacuously)** — none existed; §B.2 |
| 3 | New drawing only because the index did not satisfy D01 | **MET** — `NO_EXISTING_APP4_DESIGN` |
| 4 | All new work in the canonical file | **MET** — `BQwqV8GdfUIELvsQDB1UQE` only |
| 5 | Package under `APP_04` / `620:3` | **MET** — root section `621:3` |
| 6 | S01 covers all required verification states | **MET** — 13/13 desktop + 5 mobile |
| 7 | S02 has one non-enumerating unavailable state | **MET** — `629:37` / `629:87`; matrix on `634:59` |
| 8 | S02 invents no APP5–APP7 content | **MET** — dashed handoff slot |
| 9 | A01 covers verification, grants, failures, revoke, replay | **MET** — 17 states |
| 10 | A01 represents `REISSUE_REQUIRED` | **MET** — `633:147` |
| 11 | No plaintext code/token/hash/ciphertext exposed | **MET** — §E |
| 12 | Customer-identity existence not enumerated | **MET** — §E |
| 13 | Existing design system reused wherever valid | **MET** — §F; 0 new components |
| 14 | Storefront desktop/mobile intent clear | **MET** — both viewports drawn; `634:103` |
| 15 | Accessibility expectations implementation-ready | **MET** — `634:134` + structural layer naming |
| 16 | Exact node IDs/deep links registered | **MET** — §4.10, 48 rows |
| 17 | Registered nodes resolve correctly | **MET** — gate PASS on all 213 rows |
| 18 | APP1–APP3 design intact | **MET** — §H, 7 anchors re-read |
| 19 | Only design-scoped validation run | **MET** — §I |
| 20 | No runtime implementation performed | **MET** — §J |
| 21 | Report records the pre-draw index audit | **MET** — §B |
| 22 | Next checkpoint is `APP4-P01` | **MET** — §L |

---

## N. Stop conditions — all four checked, none met

| # | Stop condition | Finding |
|---|---|---|
| 1 | Index points to APP4 design conflicting with locked `APP4-G01` semantics | **Not met.** The index pointed to no APP4 design at all, so there was nothing to conflict with. |
| 2 | Canonical Figma file/node inaccessible or read-only | **Not met** — after authorization. The MCP server was initially unauthenticated, which made every write and read tool unavailable; that was a transient credential state, not a read-only file. Once authorized, `620:3` resolved as a writable canvas in the writable product file (`FIG-FILE-PRODUCT`, "Write" authority per §3). No write was attempted before this was established. |
| 3 | Required APP4 UI cannot be designed without inventing an APP5–APP7 action | **Not met.** The one place it could have bitten — the S02 authorized shell — is resolved exactly as `APP4-P00` §F anticipated: render the authorized shell and mark the seam. The dashed slot is a design decision, not an invented product action. |
| 4 | Design-system authority contains an unresolved contradiction | **Not met.** The unpublished `FIG-DS-INPUT` is a known, tracked publication gap (`FU-DESIGN-PUBLISH-DS-INPUT-01`), not a contradiction, and `APP2-D01` already established composition-from-tokens as the accepted response. |
