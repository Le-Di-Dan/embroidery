# APP3-F01 — Completion Report

**Checkpoint:** `APP3-F01` — Controlled Inter font acquisition and authority
**Date:** 2026-08-04
**Branch:** `production`
**Entry HEAD:** `c40e497` (`docs(app3): record APP3-DB01 evidence`)
**Commit A:** `8fb31d8310d4456fe9ae404cf88acdb9b1503d12`
**Directive:** CLAUDE MANUAL INTERVENTION DIRECTIVE — APP3-F01

---

## 1. Why this checkpoint exists

`APP3-P01` was directed to deliver the Design Document font registry as
**concrete, file-backed entries**: `IMP-D044` PO-10 requires each `fontId` to
resolve to an approved family, approved styles and weights, a controlled WOFF2
asset, a SHA-256 integrity value, licence metadata, Vietnamese glyph coverage and
a fallback policy.

The first attempt stopped:

```text
APP3-P01 = FAILED — MANUAL INTERVENTION REQUIRED
```

No implementation was written, no file was changed, no commit was created, the
working tree stayed clean and nothing was pushed. The measured absence that
produced the stop:

| Probe | Result |
|---|---|
| `git ls-files` matching `\.(woff2?\|ttf\|otf\|eot)$` | **0 files** |
| `git ls-files` matching `font` | **0 paths** |
| filesystem font binaries outside `node_modules` | **0 files** |
| tracked licence artifact of any kind | **0 files** |
| font tooling or font package in any manifest | **none** |

`packages/styles/src/settings/_typography.scss` names General Sans and Inter, but
a CSS family list is a browser-resolution instruction — exactly what PO-10
forbids a document from storing. The nearest tempting near-miss,
`node_modules/.pnpm/next@16.2.10/…/next-devtools/server/font/geist-*.woff2`,
fails on four independent counts: untracked, third-party dev-tool property, no
licence record here, and subsetted `latin`/`latin-ext` — the wrong subset for
Vietnamese.

The human intervention split font acquisition and licensing evidence from Design
Document implementation. This checkpoint is that split, and nothing more.

---

## 2. Selection and acquisition

| Item | Value |
|---|---|
| Family | Inter |
| Upstream | `https://github.com/rsms/inter` |
| Tag | `v4.1` |
| **Resolved commit** | `e3a3d4c57d5ecc01453a575621882a384c1995a3` |
| Licence | SIL Open Font License 1.1 (`OFL-1.1`) |

Acquisition method, run once into a directory outside every tracked path:

```bash
git clone --depth 1 --branch v4.1 https://github.com/rsms/inter.git <temp>
git -C <temp> rev-parse HEAD        # e3a3d4c57d5ecc01453a575621882a384c1995a3
git -C <temp> tag --points-at HEAD  # v4.1
git -C <temp> remote get-url origin # https://github.com/rsms/inter.git
git -C <temp> status --short        # (empty — clean working tree)
```

The resolved full commit matches the short hash `e3a3d4c` the directive
identified for the official v4.1 release. All four acquisition requirements —
resolved tag, clean tree, official remote, recorded commit — were satisfied
before any file was copied.

Exactly three files were copied:

| Upstream path | Vendored as |
|---|---|
| `docs/font-files/InterVariable.woff2` | `InterVariable.woff2` |
| `docs/font-files/InterVariable-Italic.woff2` | `InterVariable-Italic.woff2` |
| `LICENSE.txt` | `LICENSE.txt` |

Nothing came from a CDN, a mirror, an unpinned URL, `node_modules` or a system
font directory. No font was downloaded outside the pinned tag clone.

**Canonical location:** `packages/design-document/assets/fonts/inter/4.1/` — with
the registry authority that governs it, not under `apps/**`, `public/**`,
`packages/styles/**`, `spikes/**` or `docs/**`.

---

## 3. Binary integrity

| File | Style | Weight range | SHA-256 | Bytes |
|---|---|---|---|---|
| `InterVariable.woff2` | `normal` | `100..900` | `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3` | 352 240 |
| `InterVariable-Italic.woff2` | `italic` | `100..900` | `e564f652916db6c139570fefb9524a77c4d48f30c92928de9db19b6b5c7a262a` | 387 976 |
| `LICENSE.txt` | — | — | `b3195af0fb14368d1b3b10fb9d3fe503b7163ea083859d2ee553bc74da07c320` | 4 472 |

Every hash was **computed from the committed bytes**, never transcribed from a
website. Each was verified identical to the upstream file in the pinned clone
before that clone was deleted, so "unmodified" is a measurement, not a claim.

### 3.1 A real hazard found and fixed: line-ending normalization

The repository root `.gitattributes` sets `* text=auto eol=lf` — added during
DB6-S27 for a good reason (CRLF leaking into dollar-quoted PL/pgSQL bodies broke
the schema fingerprint). Upstream Inter's `LICENSE.txt` ships with **CRLF**, and
`git add` warned that it would be converted.

Left alone, this would have been a silent integrity failure of exactly the class
this checkpoint exists to prevent: the recorded SHA-256 is of the upstream CRLF
bytes, so a clean checkout would produce a file that hashes differently while
every diff still looked untouched, and the gate would fail on CI for reasons no
one could see in the history.

Fix: `packages/design-document/assets/fonts/inter/4.1/.gitattributes` with
`* -text`, disabling all conversion for that directory. The WOFF2 binaries were
already safe by content detection; this makes the guarantee explicit rather than
incidental. The gate asserts the override is present, and a test proves removing
it fails.

**Proof it holds.** A fresh `git clone` of the committed repository was made and
hashed:

```text
b3195af0…  LICENSE.txt
693b77d4…  InterVariable.woff2
e564f652…  InterVariable-Italic.woff2
node tools/check-app3-f01-font-assets.mjs → EXIT 0
```

All three reproduce, and the gate passes in the clone. The verification clone was
then deleted.

---

## 4. Licence evidence

The exact upstream `LICENSE.txt` from tag `v4.1` is committed verbatim — not
rewritten, not summarised in place.

`README.md` in the asset directory records: the licence is SIL Open Font License
1.1; the family is Inter; the upstream tag and resolved commit; that the font
files are redistributed **with the software**; that they **may not be sold by
themselves**; that the **Reserved Font Name** remains **Inter**; and that this
repository has **not modified the font binaries** — which is what keeps the
Reserved Font Name correct.

The README states plainly that it records licence facts and provenance, is **not
legal advice**, and claims no proprietary licence exception. The `APP3-P01`
registry must reference the committed licence **path**, not merely the SPDX
string, so the licence travels with the asset.

---

## 5. Font metadata measurement

Measured from the committed bytes with pinned FontTools:

| Property | `InterVariable.woff2` | `InterVariable-Italic.woff2` |
|---|---|---|
| Container flavor | `woff2` | `woff2` |
| Variable | `true` | `true` |
| Name family | `Inter Variable` | `Inter Variable` |
| Name subfamily | `Regular` | `Italic` |
| Weight axis | `wght 100 / 400 / 900` | `wght 100 / 400 / 900` |
| `OS/2 fsSelection` italic bit | `false` | `true` |
| `head macStyle` italic bit | `false` | `true` |
| cmap subtable formats | `4`, `12` | `4`, `12` |

Every §7 requirement holds: both are WOFF2, both resolve to Inter, the upright
file is not italic, the italic file is italic, and both expose a weight axis
covering 100 through 900.

**Disclosed:** Inter v4.1 ships italic as a **separate file** rather than as an
`ital` axis on one file, so `italicAxis` is `null` in both. Italic identity
therefore rests on the `fsSelection` and `macStyle` bits and the `Italic` name
subfamily — all three separate the two files cleanly, and the gate asserts the
bits rather than assuming an axis. No internal font metadata was renamed.

---

## 6. Vietnamese coverage

Coverage was measured from the real `cmap` tables of the committed WOFF2 files.
It was **not** inferred from the family name, a CSS fallback declaration, an
upstream marketing statement, a filename or a unicode-range comment.

### 6.1 Required repertoire — 156 code points

| Group | Count | Contents |
|---|---|---|
| Basic Vietnamese letters, upper | 23 | `A B C D Đ E G H I K L M N O P Q R S T U V X Y` |
| Basic Vietnamese letters, lower | 23 | `a b c d đ e g h i k l m n o p q r s t u v x y` |
| Vowel bases | 12 | `Ă Â Ê Ô Ơ Ư ă â ê ô ơ ư` |
| Combining marks | 8 | `U+0300`, `U+0301`, `U+0302`, `U+0303`, `U+0306`, `U+0309`, `U+031B`, `U+0323` |
| `D` with stroke | 2 (deduplicated) | `U+0110`, `U+0111` |
| Precomposed block | 90 | every assigned code point in `U+1EA0..U+1EF9` |
| **Union** | **156** | |

Assignment inside `U+1EA0..U+1EF9` was determined by `unicodedata.name()` lookup
rather than assumed; all 90 are assigned.

### 6.2 Result

| File | Required | Covered | Missing |
|---|---|---|---|
| `InterVariable.woff2` | 156 | **156** | `[]` |
| `InterVariable-Italic.woff2` | 156 | **156** | `[]` |

A code point counts as covered only when a Unicode cmap subtable **in that file**
maps it to a glyph. Fallback coverage from another installed font is not coverage
and is not observable here, because the file is parsed rather than rendered.

The coverage manifest is bound by SHA-256 to the same bytes the provenance
manifest records, so the evidence cannot describe a different file than the one
committed.

### 6.3 Verification environment

| Item | Value |
|---|---|
| Tool | `fonttools` **4.55.3** (with `brotli` 1.1.0 for WOFF2 decompression) |
| Python | **3.11.8** |
| Location | throwaway virtualenv in the session scratchpad, outside every tracked path |
| Repository dependency added | **none** |
| Committed venv / cache / wheel | **none** |

Network access was used only to install the pinned verification tool. Font bytes
came exclusively from the official Inter tag.

**Removal proof.** Both temporary directories — the upstream clone and the
verification environment — were deleted before Commit A, and their absence was
asserted:

```text
clone exists: NO
venv exists:  NO
```

No upstream Git metadata was committed.

---

## 7. Runtime registry — reserved for `APP3-P01`

`APP3-F01` writes **no TypeScript**. It supplies evidence. The registry entry
`APP3-P01` must deliver is locked in phase §6.9.4:

| Key | Value |
|---|---|
| `fontId` | `inter` |
| `family` | `Inter` |
| `registryVersion` | `1` |
| `styles` | `normal`, `italic` |
| `weights` | `100` through `900` |
| `normalFile` | `packages/design-document/assets/fonts/inter/4.1/InterVariable.woff2` |
| `italicFile` | `packages/design-document/assets/fonts/inter/4.1/InterVariable-Italic.woff2` |
| `license` | `packages/design-document/assets/fonts/inter/4.1/LICENSE.txt` |
| `fallbackPolicy` | `REJECT_IF_CONTROLLED_FONT_UNAVAILABLE` |

P01 may normalize the TypeScript shape; it may not change the family, files,
licence, styles, weight range or fallback semantics without a new authority
decision. Fonts stay outside the Design Document asset budget, and no font bytes
and no font URL ever enter a Design Document.

---

## 8. UI styling versus Design Document font authority

| Key | Value |
|---|---|
| UI CSS family stack | may name General Sans, Inter, `sans-serif` under UI styling authority |
| Design Document `fontId` | resolves only through the controlled registry, beginning with Inter v4.1 |
| General Sans | `NOT_CONTROLLED` |
| `packages/styles/src/settings/_typography.scss` | **unchanged** |

General Sans was **not** removed from the CSS stack merely because P01 does not
control it. A browser-resolved fallback for chrome type is a different question
from what a customer may embroider, and conflating them would have been an
unrequested styling change.

---

## 9. Changed files

**Commit A — 14 files, +1 407 / −7**

| File | Change |
|---|---|
| `packages/design-document/assets/fonts/inter/4.1/InterVariable.woff2` | new — 352 240 B binary |
| `packages/design-document/assets/fonts/inter/4.1/InterVariable-Italic.woff2` | new — 387 976 B binary |
| `packages/design-document/assets/fonts/inter/4.1/LICENSE.txt` | new — exact upstream OFL-1.1 |
| `packages/design-document/assets/fonts/inter/4.1/FONT-PROVENANCE.json` | new — provenance + measured metadata |
| `packages/design-document/assets/fonts/inter/4.1/VIETNAMESE-COVERAGE.json` | new — repertoire + per-file result |
| `packages/design-document/assets/fonts/inter/4.1/README.md` | new — asset authority and licence facts |
| `packages/design-document/assets/fonts/inter/4.1/.gitattributes` | new — `* -text`, byte preservation |
| `tools/check-app3-f01-font-assets.mjs` | new — 400 lines |
| `tools/check-app3-f01-font-assets.test.mjs` | new — 352 lines |
| `docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md` | new §6.9, row `5a`, §10 statuses |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | APP3 status + F01 record |
| `docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md` | F01 record |
| `docs/implementation/13-PHASE-SOURCE-MAP.md` | font assets as APP3-owned frozen evidence |
| `docs/implementation/SCOPED_COMMAND_INDEX.md` | `CMD-CHECK-APP3-F01-FONT-ASSETS`, `CMD-TEST-APP3-F01-FONT-ASSETS` |

Nothing under `packages/design-document/src/**`, no package manifest, no
`pnpm-lock.yaml`, no root `package.json`, no new dependency, no `apps/**`, no
`packages/database/**`, no `packages/styles/**`, no OpenAPI artifact, no
generated client, no worker, no `docs/design/**`, no Figma, no `spikes/**`, no
`infrastructure/**`.

---

## 10. Checker behaviour

`tools/check-app3-f01-font-assets.mjs` (400 lines) verifies all thirteen ruled
properties without parsing WOFF2 internals: required files present; no extra font
binary in the Inter directory; both font SHA-256 values and byte sizes match the
provenance; provenance tag, commit, repository, family and licence exact; licence
file hash matches; both coverage entries reference the same font hashes; both
report zero missing code points; upright and italic distinct in both recorded
style and measured italic bits; the README points to the exact provenance and
licence and states the binaries are unmodified; no forbidden source string
anywhere in the provenance and no font binary anywhere else in the tree; the
phase plan records F01 as the P01 prerequisite with the failure cause; and
`packages/design-document/src/index.ts` is still an empty stub.

Two design points are worth stating, because they are what make the gate more
than a checksum:

1. **It re-derives the mandated Vietnamese repertoire itself.** Checking only
   "0 missing" would accept a manifest that quietly shrank its required set to
   three code points — every claim inside it true, the thing it proves worthless.
   Two tests exercise exactly that attack.
2. **It does not re-measure glyph coverage.** Coverage was measured once by a
   pinned, specified tool; re-implementing a WOFF2 parser inside the gate would
   replace that with an unreviewed one and quietly move the authority.

---

## 11. Test matrix

`tools/check-app3-f01-font-assets.test.mjs` — **35 / 35 pass** (352 lines).

| Group | Cases | Covers |
|---|---|---|
| Committed repository passes | 2 | real root and throwaway copy both clean |
| Binaries present and unmodified | 7 | each missing binary, modified binary (hash **and** size), wrong byte size, rewritten licence, lost `.gitattributes` protection, extra binary, binary outside the directory |
| Provenance pinned | 7 | drifted family / repository / tag / commit / licence, `node_modules` source, CDN source |
| Roles distinct | 3 | style collapse, upright measured italic, italic measured upright |
| Coverage evidence | 8 | hash mismatch, a missing Vietnamese code point (`U+1EC7`), short covered count, shrunk repertoire, dropped combining marks, count/list disagreement, unnamed tool, mandate is 156 not a sample |
| README | 3 | dropped provenance link, dropped Reserved Font Name, no unmodified claim |
| Phase authority | 4 | P01 not blocked, cause forgotten, P01 marked complete, P01 implementation started |

Every case breaks exactly one property in a throwaway copy; nothing writes into
tracked authority and nothing talks to a network or a database.

---

## 12. Scoped validation

`pnpm quality` was **not** run. No root script was added.

| Command | Result |
|---|---|
| `node tools/check-app3-f01-font-assets.mjs` | **PASS** (exit 0) |
| `node --test tools/check-app3-f01-font-assets.test.mjs` | **35 / 35 pass**, 0 fail |
| one-time FontTools metadata + coverage verifier (`fonttools 4.55.3`, Python 3.11.8) | **156 / 156** both files, 0 missing |
| `node tools/check-app3-db01.mjs` | **PASS** |
| `node tools/check-app3-g04.mjs` | **PASS — DERIVATIVE_METADATA_IMPLEMENTED** |
| `pnpm format:check` | **PASS** — all matched files use Prettier style |
| `pnpm lint` | **PASS** — 21 / 21 tasks |
| `git diff --check` | **clean** |
| fresh-clone hash + gate re-run | **3 / 3 hashes reproduce**, gate exit 0 |

DB01 and G04 were in scope because the APP3 phase authority and the font/media
dependency map changed; neither implementation was touched. Design-document
tests, the P01 checker, P02, root tests, E2E, smoke, the database suite, OpenAPI,
Figma, spike and full-regression suites were **not** run — no owned input of any
of them changed. Nothing was backgrounded and nothing was polled.

### Line counts

| File | Lines | Limit |
|---|---|---|
| `tools/check-app3-f01-font-assets.mjs` | 400 | ≤ 400 |
| `tools/check-app3-f01-font-assets.test.mjs` | 352 | ≤ 600 |

---

## 13. Deviations and disclosures

1. **Phase table row numbered `5a`.** Inserting `APP3-F01` between `APP3-G04`
   (row 5) and `APP3-P01` (row 6) would have renumbered thirty subsequent rows —
   a large unrelated diff across the whole checkpoint map. The row is `5a` and
   `APP3-P01`'s predecessor list gained **F01**.
2. **`.gitattributes` added inside the asset directory.** Not named in the
   directive's file list, but within `packages/design-document/assets/fonts/inter/4.1/**`,
   which is allowed. Without it the recorded hashes would not survive a clean
   checkout (§3.1). Disclosed because it is a file the directive did not
   anticipate.
3. **§6.7 locked-fact table left unchanged.** The `IMP-D044` ruling table still
   reads `Font registry delivery checkpoint = APP3-P01`. That remains true of the
   *runtime registry*; F01 delivers the *asset authority*. Editing a locked
   ruling table would rewrite `APP3-G04` authority and break its gate, so the
   split is recorded forward in §6.9 instead.
4. **`italicAxis` is `null` in both files.** Inter ships italic as a separate
   file, not an `ital` axis. Recorded in the provenance with an explicit note; the
   gate asserts the `fsSelection` bits rather than an axis (§5).
5. **Historical first-attempt record not rewritten.** The failed `APP3-P01`
   attempt produced no commit and no report, so there is nothing to rewrite; its
   outcome, cause and resolution are recorded forward in §6.9.6 and §10.

---

## 14. Status

```text
APP3-F01 =
COMPLETE — REVIEW_DELIVERED

APP3-P01 =
BLOCKED_BY_APP3-F01_REVIEW_ACCEPTANCE

APP3-P01 FIRST_ATTEMPT =
FAILED — MANUAL_INTERVENTION_REQUIRED

CAUSE =
NO_CONTROLLED_FONT_ASSET_OR_LICENSE_EVIDENCE

RESOLUTION =
APP3-F01

APP3-P02 =
READY — NOT STARTED

APP3 =
IN PROGRESS — FONT AUTHORITY DELIVERED_FOR_REVIEW
```

On human acceptance, `APP3-P01` becomes
`READY_FOR_MANUAL_INTERVENTION_RESUME`.

Human review owns `APP3-F01 = COMPLETE — REVIEW_ACCEPTED`.

---

## 15. Confirmations

- **Commit A:** `8fb31d8310d4456fe9ae404cf88acdb9b1503d12`.
- **Working tree clean** after Commit A; Commit B adds only this report.
- **Nothing pushed.** `origin/production` remains at `8b5f3b0`.
- **No `APP3-P01` implementation.** `packages/design-document/src/index.ts` is
  still `export {}`; no schema, validation, canonicalization, quantization,
  hashing, migration or registry code was written.
- **No `APP3-P02`, backend, API, OpenAPI, generated-client, worker, database,
  Figma or UI change.**
- **No root `package.json` script**, no workspace manifest change, no
  `pnpm-lock.yaml` change, no new dependency.
- **`pnpm quality` not run**; no repository-wide aggregate validation.
- **No credential read, written, echoed or rotated;** `.env` untouched.
