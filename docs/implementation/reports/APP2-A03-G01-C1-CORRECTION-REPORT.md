# APP2-A03-G01-C1 — Registry Integrity Correction Report

**Checkpoint:** `APP2-A03-G01-C1` — repair the A03 Product Form registry approval rows and
harden the Figma index gate
**Type:** Correction to an accepted entry gate. Documentation + validation tooling only.
**Date:** 2026-07-31
**Verdict:** `PASS`

---

## A. Preflight and exact G01 A/B chain

`APP2_A03_G01_C1_PREFLIGHT = PASS`

| Check | Result |
|---|---|
| Branch | `production` |
| HEAD at entry | `e9a9b769c98840da620b7721c9e168b594ea8e0b` |
| HEAD subject | `docs(app2): record A03 form-gate evidence` |
| HEAD is the exact `APP2-A03-G01` evidence Commit B | yes |
| `git status --short` | empty (clean tracked/staged tree) |
| `APP2-A03` implementation source | absent — `apps/admin/src/app/(protected)/products/` contains only `page.tsx`; no `new/`, no `[productId]/` |
| `APP2-D04` artifact | none — every `APP2-D04` occurrence in `docs/` is a prohibition ("must not be created"), not an artifact |
| `evidences/` | present but empty; not created, deleted, staged or claimed |

The G01 chain as committed:

| Commit | Hash | Subject |
|---|---|---|
| G01 Commit A | `56992076f6dfd3261adfeb39ad367a54736a9b31` | `docs(design): reconcile Admin Product Form contract` |
| G01 Commit B | `e9a9b769c98840da620b7721c9e168b594ea8e0b` | `docs(app2): record A03 form-gate evidence` |

G01 Commit A touched 5 files, +358/−6:

```
docs/design/FIGMA_DESIGN_INDEX.md                              |  30 ++-
docs/design/approvals/APP2-A03-G01-PRODUCT-FORM-CONTRACT-APPROVAL.md | 300 +++++
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md           |   2 +-
docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md     |   1 +
docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md |  31 ++-
```

---

## B. False original evidence and reproduced defect

### B.1 The false claim

The `APP2-A03-G01` completion report and the phase-plan status block both stated that the
five Product Form rows were promoted to `APPROVED_FOR_IMPLEMENTATION` under
`FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001`. **The committed registry did not support that
claim.** The canonical rows were never modified.

This is recorded plainly rather than quietly repaired: the reviewer accepted `APP2-A03-G01`
partly on the strength of a statement about file contents that the file did not bear.

### B.2 Reproduced — malformed pre-table content and corrupted H1

`git show 56992076f6dfd3261adfeb39ad367a54736a9b31 -- docs/design/FIGMA_DESIGN_INDEX.md`
opens with a single-line replacement of the document title:

```diff
@@ -1,4 +1,4 @@
-# FIGMA_DESIGN_INDEX.md
+| FIG-ADMIN-PRODUCT-MEDIA-SELECT-DESKTOP | … | 2026-07-31 || FIG-ADMIN-PRODUCT-DRAFT-MOBILE-DEFAULT | … | 2026-07-31 || FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-SAVING | … || FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-VALIDATION | … || FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-DEFAULT | … | 2026-07-31 |# FIGMA_DESIGN_INDEX.md
```

Measured on the committed file: line 1 was 2 008 characters, the canonical title began at
offset 1 976, and `|| FIG-` occurred 4 times. The document therefore had **no H1 at all** —
the title was trailing text on a malformed table row.

### B.3 Reproduced — five untouched `REVIEW_REQUIRED` canonical rows

Lines 198–202 of the committed file, unchanged from before G01:

```
| FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-DEFAULT    | Admin | Product draft | Product Draft | Default          | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | … | 434:20  | … | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-VALIDATION | Admin | Product draft | Product Draft | Validation Error | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | … | 436:37  | … | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-SAVING     | Admin | Product draft | Product Draft | Saving           | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | … | 436:140 | … | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-PRODUCT-DRAFT-MOBILE-DEFAULT     | Admin | Product draft | Product Draft | Default          | Mobile 390   | high-fidelity | REVIEW_REQUIRED | … | 438:90  | … | APP2-D01 | — | — | 2026-07-26 |
| FIG-ADMIN-PRODUCT-MEDIA-SELECT-DESKTOP     | Admin | Product draft | Media Select Dialog | Default     | Desktop 1440 | high-fidelity | REVIEW_REQUIRED | … | 437:73  | … | APP2-D01 | — | — | 2026-07-26 |
```

Status `REVIEW_REQUIRED`, approval evidence `—`, route/capability still `Product draft`.

### B.4 Reproduced — the checker blind spot

`tools/check-figma-design-index.parse.mjs` opens a table only when a line starting with `|`
is **followed by a separator row**:

```js
if (lines[i].trim().startsWith('|') && !isSeparatorRow(lines[i])) {
  const sepLine = lines[i + 1];
  if (sepLine && isSeparatorRow(sepLine)) { /* … parse table … */ }
}
i += 1;   // otherwise the line is skipped entirely
```

Line 1 started with `|` but line 2 was blank, so the five promoted rows were never parsed as
rows. Every downstream rule — unique registry ID, allowed status, approval evidence on
`APPROVED*` rows, canonical composite uniqueness — operates on parsed rows only, so all five
were invisible. The registry ID count stayed at exactly 72 (71 + the one new annotation)
rather than rising to 77, which is why nothing looked anomalous.

---

## C. Corruption mechanism

The G01 splice was performed by a script that located the insertion point by string offset
and wrote the new rows immediately **before** the matched title text instead of at the start
of the target table rows. Because each recovered row already ended with `|` and the next
began with `|`, the concatenation produced the `… 2026-07-31 || FIG-…` signature, and the
title was carried along as the tail of the same line.

The failure is a *placement* error, not a content error: the five replacement rows
themselves were well-formed and carried the correct 16 columns, the correct node IDs, the
correct statuses and the correct evidence ID. C1 recovers them verbatim from the corrupted
line rather than re-authoring them, so no naming decision is re-litigated.

---

## D. Canonical H1 repair

The first line of `docs/design/FIGMA_DESIGN_INDEX.md` is again exactly:

```markdown
# FIGMA_DESIGN_INDEX.md
```

Verified:

```
$ head -n 5 docs/design/FIGMA_DESIGN_INDEX.md
# FIGMA_DESIGN_INDEX.md

**Status:** Canonical Figma registry — authoritative
**Owner:** Design governance (created at `APP1-D01`, 2026-07-25)
**Consistency gate:** `pnpm check:figma-design-index` (static, in `pnpm quality`)

$ grep -c '|| FIG-' docs/design/FIGMA_DESIGN_INDEX.md
0
$ head -1 docs/design/FIGMA_DESIGN_INDEX.md | grep -c '^| FIG-'
0
```

No registry fragment remains before the title or outside a table. Nothing else in the
preamble was touched.

---

## E. Five in-place registry-row repairs

The five intended rows were recovered from the corrupted line by splitting on `||`, then
applied **in place** over the existing canonical rows. A guard aborted the rewrite unless the
node ID of the recovered row matched the node ID already on the canonical row, so the repair
could not silently relocate a registry entry.

| Line | Registry ID | Node | Status before → after | Evidence after |
|---|---|---|---|---|
| 198 | `FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-DEFAULT` | `434:20` | `REVIEW_REQUIRED` → `APPROVED_FOR_IMPLEMENTATION` | `FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001` |
| 199 | `FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-VALIDATION` | `436:37` | `REVIEW_REQUIRED` → `APPROVED_FOR_IMPLEMENTATION` | `FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001` |
| 200 | `FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-SAVING` | `436:140` | `REVIEW_REQUIRED` → `APPROVED_FOR_IMPLEMENTATION` | `FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001` |
| 201 | `FIG-ADMIN-PRODUCT-DRAFT-MOBILE-DEFAULT` | `438:90` | `REVIEW_REQUIRED` → `APPROVED_FOR_IMPLEMENTATION` | `FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001` |
| 202 | `FIG-ADMIN-PRODUCT-MEDIA-SELECT-DESKTOP` | `437:73` | `REVIEW_REQUIRED` → `APPROVED_FOR_IMPLEMENTATION` | `FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001` |

Screen/state naming applied from the intended rows, matching the live Figma node names:

| Registry ID | Route/Capability | Screen/Asset | State |
|---|---|---|---|
| `…DRAFT-DESKTOP-DEFAULT` | Product form | Product Form | Edit/Detail — Default |
| `…DRAFT-DESKTOP-VALIDATION` | Product form | Product Form | Edit/Detail — Validation Error |
| `…DRAFT-DESKTOP-SAVING` | Product form | Product Form | Edit/Detail — Saving |
| `…DRAFT-MOBILE-DEFAULT` | Product form | Product Form | Edit/Detail — Default |
| `…MEDIA-SELECT-DESKTOP` | Product form | Media Select Dialog | Default |

No new rows were added, no registry ID renamed, no node ID or owning phase changed. Each of
the five IDs now occurs exactly once as a table row.

---

## F. Approval-record consistency

`docs/design/approvals/APP2-A03-G01-PRODUCT-FORM-CONTRACT-APPROVAL.md` was read and verified
**consistent — and therefore left unmodified**:

| Item | Occurrences |
|---|---|
| `FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001` | 1 |
| Each of the five registry IDs | 1 each |
| Node IDs `434:20` / `436:37` / `436:140` / `438:90` | 2 each |
| Node ID `437:73` | 3 |

No Product Owner decision or design semantic was changed.

---

## G. Checker blind spot

Root cause, stated as an invariant: **the gate validated the contents of tables but never
validated that registry content was inside a table.** Any registry row placed outside a
parsed table — before the title, between prose paragraphs, or after a blank line — bypassed
every content rule while leaving the ID count untouched.

This is why a green `pnpm check:figma-design-index` was not evidence that a row edit landed.

---

## H. Title / row-placement gate hardening

New module `tools/check-figma-design-index.structure.mjs` (174 lines), invoked from
`checkFigmaDesignIndex` before the content rules.

**Rule `document-title`** — the first nonblank, non-BOM line must be exactly
`# FIGMA_DESIGN_INDEX.md`. When the canonical title is found *inside* a longer first line,
the violation names the splice explicitly and reports the character offset:

```
document-title line 1 :: Registry content is spliced onto the title line: the title
"# FIGMA_DESIGN_INDEX.md" appears after 1976 characters of other content. Restore the
title to its own line and put registry rows inside a table.
```

A leading UTF-8 BOM is tolerated.

**Rule `row-placement`** — structural, not a substring ban:

- `/^\|\s*`?FIG-[A-Z0-9][A-Z0-9-]*`?\s*\|/` on a line **outside** every parsed table
  (table membership computed from each table's header line, separator line and row line
  numbers);
- `/\|\|\s*`?FIG-/` anywhere in the document, since two rows concatenated on one line are
  never legitimate.

Prose that mentions a registry ID in backticks does not match either pattern, and a
dedicated test asserts that.

---

## I. Exact A03 approval regression

**Rule `a03-approval`** asserts the named A03 implementation authority directly. For each of
the five IDs it requires: exactly one row, the exact node ID, status
`APPROVED_FOR_IMPLEMENTATION`, and approval evidence containing
`FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001`.

The rule engages only for a document that already carries A03 authority (any of the five IDs
present, or the evidence ID present anywhere), so unrelated registries and small fixtures are
unaffected. With four rows present, deleting the fifth still trips the rule.

Tests grew 19 → 31. New cases:

| Test | Asserts |
|---|---|
| canonical title is required as the first nonblank line | `document-title` |
| a UTF-8 BOM before the canonical title is tolerated | no `document-title` |
| **the actual APP2-A03-G01 corruption is rejected** | `document-title` + `row-placement` + `a03-approval`, and the message matches `/spliced onto the title line/` |
| a registry row before the title is rejected even with a valid title line | `row-placement` |
| a registry row after the title but outside any table is rejected | `row-placement` |
| prose mentioning a registry ID in backticks is allowed | no `row-placement` |
| a clean promoted A03 registry passes | zero violations |
| reverting one A03 row to `REVIEW_REQUIRED` is rejected | `a03-approval` |
| an A03 row with the wrong approval evidence is rejected | `a03-approval` |
| an A03 row pointing at the wrong node is rejected | `a03-approval` |
| a missing A03 authority row is rejected | `a03-approval`, message matches `/is missing/` |
| registries with no A03 authority are unaffected | no `a03-approval` |

The corruption fixture builds the five rows and joins them with `''`, so that each row's
trailing `|` meets the next row's leading `|` — reproducing the committed `|| FIG-` signature
exactly rather than approximating it.

### I.1 Proof against the real corrupted file

The hardened checker was run against the actual file content from commit `5699207`, restored
into a disposable fixture directory:

```
violations against the REAL corrupted commit: 12
 - document-title line 1 :: Registry content is spliced onto the title line…
 - row-placement  line 1 :: Two registry rows are concatenated on one line ("|| FIG-")…
 - a03-approval   line 198 :: …DESKTOP-DEFAULT must be APPROVED_FOR_IMPLEMENTATION (found "REVIEW_REQUIRED")…
 - a03-approval   line 198 :: …DESKTOP-DEFAULT must carry approval evidence FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001…
 - a03-approval   line 199 :: …DESKTOP-VALIDATION (status + evidence)
 - a03-approval   line 200 :: …DESKTOP-SAVING (status + evidence)
 - a03-approval   line 201 :: …MOBILE-DEFAULT (status + evidence)
 - a03-approval   line 202 :: …MEDIA-SELECT-DESKTOP (status + evidence)
```

The same checker passes on the repaired file. This is the load-bearing evidence that the
gate would have caught the original defect.

### I.2 An existing test was silently passing

`a personal email in the index is rejected` injected its fixture email by string-replacing
the old fixture title `# Figma Design Index`. Once fixtures adopted the canonical title, the
replacement matched nothing and the test asserted against a body containing no email at all.
It now injects through an explicit `preamble` option and asserts the email is present before
running the checker. No existing check was weakened; one was made real.

---

## J. Registry count and unrelated-authority preservation

```
$ pnpm check:figma-design-index
Figma Design Index check passed (72 registry IDs, 72 node rows, 9 registry table(s);
canonical files + statuses + deep links + composites verified).
```

Registry count unchanged at **72**. The diff against `docs/design/FIGMA_DESIGN_INDEX.md` is
confined to two hunks — `@@ -1 +1 @@` and `@@ -198,5 +198,5 @@` — 6 insertions, 6 deletions.
Filtering the diff for changed registry rows outside the A03 set returns nothing:

| Preserved | Status |
|---|---|
| `FIG-ADMIN-PRODUCT-FORM-CONTRACT-HANDOFF` (`521:284`) | untouched, still `REVIEW_REQUIRED` handoff annotation — not promoted as screen authority |
| Publication rows (`441:106`, `442:110`, `442:205`, `443:121`) | untouched |
| Storefront Product Detail rows (`447:204`, `448:204`, `448:210`) | untouched |
| Admin Assets rows | untouched |
| Admin Product List rows | untouched |
| All other APP2 / APP1 rows | untouched |

---

## K. Frozen engineering artifacts

| Artifact | Baseline | After C1 |
|---|---|---|
| OpenAPI | `c4d1fef8ecc54c330aa8cf8e130582c92e4e6af9dd3643664cc020757da72d0b` | unchanged (`pnpm check:openapi` EXIT 0) |
| Generated API client | `3e3e267dc3c76bd630138bcb21f1500006ecf38dec2d088c5bc4d4c2133acfdb` | unchanged (`pnpm check:api-client` EXIT 0) |
| Database | 33 migrations / 78 tables / 833 columns / 190 CHECKs, fingerprint `82864268…` | unchanged (`pnpm db:check:manifest` EXIT 0) |
| Figma registry | 72 IDs | 72 IDs |
| Figma canvas | — | **no mutation**; nodes were read during the A03 audit only |
| Dependencies / lockfile | — | unchanged |
| `apps/**`, `packages/**` | — | unchanged |

---

## L. Commit C evidence

```
7a42677e2911acbc097d478bdb65f91b955fa90c
fix(design): repair A03 registry approval integrity
```

4 files changed, 320 insertions(+), 13 deletions(−):

| File | Change |
|---|---|
| `docs/design/FIGMA_DESIGN_INDEX.md` | +6 / −6 — H1 restored, five rows promoted in place |
| `tools/check-figma-design-index.mjs` | +13 — imports the structure module, runs `checkDocumentStructure` first, collects `rowsById`, runs `checkA03Approval` last |
| `tools/check-figma-design-index.structure.mjs` | +174 — **new**; `document-title`, `row-placement`, `a03-approval` |
| `tools/check-figma-design-index.test.mjs` | +134 / −7 — canonical-title fixtures, 12 new tests, repaired email test |

---

## M. Validation matrix

| Command | Result |
|---|---|
| `pnpm check:figma-design-index` | EXIT 0 — 72 registry IDs, 72 node rows, 9 tables |
| `node --test tools/check-figma-design-index.test.mjs` | **31/31 pass**, 0 fail (was 19) |
| hardened checker vs. the real corrupted `5699207` file | **12 violations** — correctly rejected |
| hardened checker vs. the repaired file | 0 violations |
| `pnpm check:openapi` | EXIT 0 — artifact up to date |
| `pnpm check:api-client` | EXIT 0 — tree hash `3e3e267d…` |
| `pnpm db:check:manifest` | EXIT 0 — all checks passed |
| `node tools/check-file-size.mjs` | EXIT 0 — no file over the hard limit |
| `pnpm quality` | **EXIT 0** |
| `git diff --check` | clean |
| `npx prettier --check` (all 4 changed files) | all match Prettier style |

File sizes: `check-figma-design-index.mjs` 376, `.structure.mjs` 174, `.parse.mjs` 69 (all
< 400 source limit); `.test.mjs` 377 (< 600 test limit). The main checker is above the 300
review threshold, as it already was before C1 — the new rules were placed in a separate
module rather than growing it further.

---

## N. Acceptance matrix

| # | Criterion | Result |
|---|---|---|
| 1 | Exact clean G01 evidence entry | PASS |
| 2 | Original defect reproduced | PASS (§B.2–B.4) |
| 3 | False G01 report claim disclosed | PASS (§B.1, phase-plan pointer) |
| 4 | No A03 implementation exists | PASS |
| 5 | No `APP2-D04` artifact | PASS |
| 6 | H1 restored exactly | PASS |
| 7 | No content before H1 except optional BOM/blank | PASS |
| 8 | Malformed promoted fragments removed | PASS |
| 9 | No `\|\| FIG-` corruption remains | PASS (count 0) |
| 10 | Five canonical IDs each occur exactly once | PASS |
| 11 | Five node IDs unchanged and exact | PASS (guarded rewrite) |
| 12 | Five statuses `APPROVED_FOR_IMPLEMENTATION` | PASS |
| 13 | Five evidence cells use the exact approval ID | PASS |
| 14 | Intended screen/state names applied | PASS |
| 15 | Annotation row preserved | PASS |
| 16 | Publication rows untouched | PASS |
| 17 | Storefront rows untouched | PASS |
| 18 | Admin Assets / List rows untouched | PASS |
| 19 | Registry count remains 72 | PASS |
| 20 | Checker validates exact H1 | PASS |
| 21 | Checker rejects registry rows before H1 | PASS |
| 22 | Checker rejects registry-like rows outside tables | PASS |
| 23 | Checker rejects the actual concatenated corruption fixture | PASS (§I, §I.1) |
| 24 | Checker rejects a reverted A03 `REVIEW_REQUIRED` row | PASS |
| 25 | Checker verifies exact A03 evidence ID | PASS |
| 26 | Existing registry tests remain green | PASS — 19 retained, 1 repaired from a silent no-op, none weakened |
| 27 | Approval record remains consistent | PASS (unmodified) |
| 28 | No Figma mutation | PASS |
| 29 | OpenAPI unchanged | PASS |
| 30 | Generated client unchanged | PASS |
| 31 | Database unchanged | PASS |
| 32 | No application/package source change except checker tools | PASS |
| 33 | No dependency | PASS |
| 34 | Full quality passes | PASS |
| 35 | Commit C repair/tests only | PASS |
| 36 | Commit D evidence only | PASS |
| 37 | Exactly two commits | PASS |
| 38 | Complete correction report | PASS |
| 39 | Final tracked tree clean | PASS |
| 40 | Nothing pushed | PASS |
| 41 | `APP2-A03` not started | PASS |
| 42 | `APP2-A03-G01-C2` not created | PASS |

No criterion is deferred or hidden behind a follow-up.

---

## O. A03 implementation handoff

`APP2-A03` may now proceed. Its §3 design-authority precondition is satisfied in the
canonical registry itself, not merely in a report:

| Registry ID | Node | Status | Evidence |
|---|---|---|---|
| `FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-DEFAULT` | `434:20` | `APPROVED_FOR_IMPLEMENTATION` | `FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001` |
| `FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-VALIDATION` | `436:37` | `APPROVED_FOR_IMPLEMENTATION` | same |
| `FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-SAVING` | `436:140` | `APPROVED_FOR_IMPLEMENTATION` | same |
| `FIG-ADMIN-PRODUCT-DRAFT-MOBILE-DEFAULT` | `438:90` | `APPROVED_FOR_IMPLEMENTATION` | same |
| `FIG-ADMIN-PRODUCT-MEDIA-SELECT-DESKTOP` | `437:73` | `APPROVED_FOR_IMPLEMENTATION` | same |
| `FIG-ADMIN-PRODUCT-FORM-CONTRACT-HANDOFF` | `521:284` | normative handoff annotation | — |

The Figma design content itself was never in doubt: during the A03 audit all five frames
were re-read live and confirmed reconciled — renamed to `… / Product / Edit-Detail / …`,
carrying `Giá cơ bản`, `Lưu thay đổi`, `Di chuyển trước` and `Ảnh PNG`, with zero occurrences
of `Sản phẩm mới`, `Phiên bản`, `SKU`, `Điều kiện xuất bản`, `Tới bước xuất bản` or
`Lưu bản nháp`. Only the markdown record was wrong.

Unchanged by C1: IMP-D034 stays `LOCKED`;
`FU-APP2-PRODUCT-VARIANTS-SKU-01 = DEFERRED_BEYOND_APP2_CATALOG_ALPHA`;
`FU-APP2-PRODUCT-ARCHIVE-UI-01 = DEFERRED_PENDING_PRODUCT_OWNER_SURFACE_DECISION`;
publication remains `APP2-B03` / `APP2-A04`; thumbnail delivery remains `APP2-T01`.

### Final state

```text
APP2-A03-G01 = COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW
APP2-A03     = READY — NOT STARTED
APP2-B03     = BLOCKED_BY_APP2-A03
APP2-A03-G01-C2 = MUST_NOT_BE_CREATED
```
