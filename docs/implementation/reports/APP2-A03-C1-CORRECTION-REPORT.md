# APP2-A03-C1 — Security & conflict-classification correction

**Verdict: PASS.**

Two blocking defects closed: a plaintext development credential recorded in A03 evidence, and
an update failure classifier that treated every HTTP `409` as a stale-version conflict.

No credential value, hash, cookie or session token appears anywhere in this report. Where a
value had to be searched for, matching was count-only so no command output could carry it.

---

## A. Preflight and original A/B chain

| Fact | Value |
|---|---|
| A03 implementation Commit A | `02fa373124badfefb0876bb0f67487cf31d183fc` |
| A03 evidence Commit B (as found) | `381bf4ac651b7c8af942ee28238d4cfac071e6a5` |
| HEAD at entry | `7e744b4069034a40f2980822e1c918a17fd8e911` |
| Branch | `production`, ahead of `origin/production` (`8775734…`) by 35 |
| Refs containing Commit B | local `production` only — never pushed, no tag |
| Tracked/staged tree | clean (only the user-owned, ignored `evidences/` untracked) |
| B03 / A04 / T01 | not started |

### A.1 Entry-state deviation — disclosed, not silently resolved

§2 requires `HEAD = Commit B`. It was not. Three commits sat on top, all created after A03
delivery and all at the Product Owner's explicit direction in the session preceding this
correction:

| Commit (before rewrite) | Subject |
|---|---|
| `c80a1dd` | `chore: add evidences/ to .gitignore` (authored by the operator) |
| `a2ad5ae` | `fix(admin): make the product form’s exits work` |
| `7e744b4` | `fix(admin): show the product form’s actions only when there is a change` |

`git commit --amend` only rewrites `HEAD`, so §4.2 could not be executed literally. Rather than
block a security correction on a precondition that had already lapsed, Commit B was amended on
a detached checkout and the three later commits were replayed unchanged onto it
(`git rebase --onto`, no conflicts, no content change). The substitution is recorded in §L, the
resulting chain in §L.2, and every rewritten hash is listed. Nothing was pushed at any point.

### A.2 Frozen-artifact preflight

All four A03 entry artifacts were re-measured and are unchanged — see §K.

---

## B. Plaintext-credential defect

### B.1 What was actually disclosed

The reviewer's finding is confirmed, with two corrections of fact that materially change the
remediation:

1. **The disclosure is in the *pre-amend* revision of Commit B, not in Commit B as found.**
   The evidence commit had already been amended once, in the session before this correction,
   when the credential paragraph was rewritten. The reviewer read the superseded revision.
2. **The disclosed value is the disposable credential created for the live review**, not the
   value the environment was bootstrapped with. It had already been superseded by a later
   rotation before this correction began, so it could not authenticate at entry either.

| Fact | Value |
|---|---|
| Commit carrying the disclosure | `0bce9565` (pre-amend revision of Commit B) |
| File | `docs/implementation/reports/APP2-A03-COMPLETION-REPORT.md` |
| Line | 430 |
| Reachable from any branch or tag at entry | **no** |

Reproduced without reprinting it: the pre-amend blob was piped through the new detector, which
returned exactly one finding — `{ line: 430, keyword: "password" }`. The detector returns the
line and the keyword and deliberately never the matched value (§G).

### B.2 Why it was still a blocker

The value was unreachable but recoverable: it survived in the local object database, and the
report it came from was the checkpoint's own committed evidence. Nothing prevented the same
sentence from being written again — no gate existed that could see it. Both halves are closed
here: the value no longer authenticates (§E), and the shape can no longer be committed (§G).

### B.3 The multiple-live-row claim

The pre-amend revision also stated that repeated rotations had left three live credential rows.
That claim was wrong at the time and is corrected in §F. The honest disclosure that repeated
rotation attempts occurred is preserved in the rewritten report.

---

## C. Evidence Commit B security rewrite

The credential paragraph of `APP2-A03-COMPLETION-REPORT.md` was rewritten to:

- state that the credential was rotated through the sanctioned bootstrap path for live
  verification, and that **its value is intentionally not recorded**;
- record that an earlier revision disclosed one in plaintext and is superseded;
- keep the honest disclosure that repeated rotation attempts left more than one live row before
  this correction reconciled the state;
- remove the now-false claim that the original credential authenticates — after §E it does not;
- state that no revision of the report contains values, hashes, cookies or session tokens.

Constraints honoured:

| Rule | Result |
|---|---|
| Commit A untouched | ✅ `02fa373…` unchanged |
| Commit B subject preserved | ✅ `docs(app2): record Admin Product Form evidence` |
| Evidence-only file boundary preserved | ✅ same 3 files (roadmap, phase plan, A03 report) |
| Amend performed before report authoring | ✅ |
| Old and rewritten hashes recorded | ✅ §L |
| Destructive gc / reflog expiry | ✅ **not performed** |

---

## D. Reachable-history proof

Method: count-only matching (`git grep -c`, `git log -S | wc -l`). No command printed a
matched line, so the value never entered captured output.

| Surface | Scope | Matches |
|---|---|---|
| Working tree (tracked) | `git grep` | **0** |
| Staged index | `git grep --cached` | **0** |
| All reachable commits | 230 commits from all refs | **0** files |
| All commit messages | `git log --all -S` | **0** |
| Untracked, non-ignored files | `git ls-files --others --exclude-standard` | 0 files exist |
| Refs containing `0bce9565` | branches + tags | **0** |
| Tags in repository | — | 0 |

A whole-object-database sweep was also run during preflight: **2,649 blobs**, of which the only
one carrying the value belongs to the unreachable pre-amend commit. That object remains in the
local object database until normal Git expiry, which §4.3 permits and §14.9 requires be left
alone. Nothing has been pushed.

`.env*` is ignored (`.gitignore` line 5, with `!.env.example`) and no `.env` file is tracked.

---

## E. Credential rotation and authentication proof

A new high-entropy development credential was generated locally, written **only** into the
ignored environment file, and applied with one controlled rotation through the sanctioned
`staff-bootstrap --rotate` path. No raw SQL touched credentials. The value was never printed,
echoed into a command argument, committed, or written into any fixture, test or report; the
transient files used to carry it were created under `umask 077` and deleted immediately after.

Proof through the development gateway (`POST /api/staff/session`, status codes only):

| Credential | Result |
|---|---|
| Replacement | **204** ✅ |
| The disclosed review credential | **401** ✅ |
| The earlier bootstrap value | **401** ✅ |
| An unrelated wrong value | **401** ✅ |

Unrelated session behaviour, verified in the same pass:

| Step | Result |
|---|---|
| `POST /api/staff/session` with the replacement | 204 |
| `GET /api/staff/me` with the session cookie | 200, payload keys `id,email,displayName` |
| `DELETE /api/staff/session` | 204 |
| `GET /api/staff/me` after logout | **401** |

### E.1 Standing-instruction conflict, disclosed

The Product Owner had previously forbidden rotating this credential without restoring it. §5 of
this correction requires a rotation whose replacement must persist. The conflict is resolved in
favour of this prompt's explicit instruction, and the operator is not locked out: the
replacement is in the ignored local environment file under `STAFF_BOOTSTRAP_PASSWORD`, which is
where the bootstrap path reads it from.

### E.2 Residual dev session — disclosed

One live row remains in `admin_sessions`, created by the very first credential probe above. Its
opaque token was written to `/dev/null` and retained by no client, so it cannot be presented by
anyone; it expires under the configured session policy. It was not deleted, because raw SQL
cleanup is out of scope and a second rotation to clear it would have violated §5's
one-rotation rule.

---

## F. Credential-row semantics and final invariant

Audited: `DrizzleAdminAccountRepository` (`findActiveCredential`, `rotateCredential`,
`attachCredential`) and `BootstrapStaffUseCase` (`bootstrap`, `ensure`, `rotate`).

| Question | Finding |
|---|---|
| Can every live row authenticate? | **No.** `findActiveCredential` filters `rotated_at IS NULL AND revoked_at IS NULL`, orders `created_at DESC` and takes **one** row. Only the newest live credential can ever authenticate. |
| Does a sanctioned cleanup exist? | **Yes** — `rotateCredential` supersedes **every** live row (no `LIMIT`) and inserts one, inside the caller's transaction. Rotation is itself the cleanup. |
| Production defect or test misuse? | **Test misuse.** The contract is self-repairing: any rotation collapses the live set to one. No code path in the current source can leave two live rows behind a successful rotation. |
| Production auth code changed? | **No** — §10 permits it only if a contract defect is proven, and none was. |

Measured state after §E, by count only (no values, no hashes):

| Metric | Before rotation | After rotation |
|---|---|---|
| `admin_credentials` rows | 6 | 7 |
| Live rows (`rotated_at IS NULL AND revoked_at IS NULL`) | 1 | **1** |
| Active admin accounts | 1 | 1 |
| Live sessions | 2 | 1 (see §E.2 — rotation revoked both pre-existing ones) |

**Final invariant: exactly one credential authenticates for the development Admin account, and
the disclosed value is not it.** Superseded rows carry `rotated_at` and are the audit trail the
model intends, not residue.

---

## G. Secret-checker gap and regression tests

### G.1 Audit of existing checks

| Existing check | Covers | Gap |
|---|---|---|
| `check-figma-design-index.mjs` | `access_token` / `client_secret` substrings and personal emails — **in one file**, the Figma registry | Cannot see any other document |
| `check-file-size.mjs` | file length | — |
| `check-styling-boundaries`, `check-frontend-*`, `check-e2e`, `check-spike-boundaries` | structural boundaries | — |
| `.gitignore` | keeps `.env*` untracked | Not a gate; nothing fails if the ignore is bypassed |

No canonical checker covered completion-report safety or tracked secret material. The Figma
checker was **not** widened, because its rules are scoped to one file and one schema; widening
it would have made a registry gate responsible for the whole repository. `check-report-secrets`
is therefore the narrowest new canonical owner of documentation and tracked-file secret safety,
and the two do not overlap.

### G.2 Detection model

Structural, three-part: a secret **keyword** (`password`, `credential`, `secret`, `token`,
`api key`, `private key`, `mật khẩu`, …), a **disclosure connective** (`:`/`=`, or a bounded
chain of `is`/`was`/`now`/`changed`/`to`/`là`/`thành`, so `password is now X` and
`secret was changed to X` both match), and a **secret-shaped value**.

A value is secret-shaped when it is 8–256 characters, unspaced, and mixes a digit with
upper-and-lower case or a password symbol (`!#$%^&*+=?@`). That is precisely what separates a
credential from the identifiers these documents are made of: `PRODUCT_VERSION_CONFLICT`,
`expectedUpdatedAt`, `ADR-APP1-001`, `STAFF_BOOTSTRAP_PASSWORD`, ISO timestamps and UUIDs all
fail the test and stay writable.

Any line containing an explicit redaction marker (`[REDACTED]`, `<redacted>`, `not recorded`,
`intentionally not …`, `not persisted`, …) is cleared, so the honest way to write about a
secret is also the way that passes. The checker reports **line and keyword only** — echoing the
matched value would publish it into CI output, which is the failure it exists to prevent.

Also enforced: no tracked `.env*` (except `.env.example`), `.pem`, `.key`, `.p12`, `.pfx`,
`.keystore` or `.jks`.

### G.3 Regression tests — `tools/check-report-secrets.test.mjs`, 9 tests, all passing

| Required case | Test |
|---|---|
| Synthetic version of the disclosed sentence fails | `rejects every plaintext disclosure shape` — 8 forms including ``password is now `…` `` |
| Redacted equivalent passes | `a redacted equivalent of a rejected sentence passes` |
| Normal security prose passes | `accepts ordinary security prose and explicit redaction` — 11 lines |
| The sanitized A03 report passes | `the sanitized A03 completion report passes` |
| A secret in another completion-report path fails | `catches a disclosure in any completion report, not just the A03 one` |
| Value never echoed | `reports the line but never the matched value` |
| Identifier vs secret discrimination | `distinguishes secret-shaped values from identifiers` |
| Tracked secret files | `rejects tracked secret-bearing files but allows the example env` |
| Rule is livable | `every tracked document in the repository passes` — 346 documents |

No fixture contains a real credential.

**Proven against the real defect, not only its fixtures:** run against the pre-amend blob
`0bce9565:…/APP2-A03-COMPLETION-REPORT.md`, the detector returns exactly one finding at line
430; run against the sanitized revision, zero; run across all 346 tracked documents, zero.

Registered as `pnpm check:secrets` and inserted into `pnpm quality` after `check:file-size`.

---

## H. HTTP-409 conflict-classification defect

`isVersionConflict` returned true for `normalized.code === 'PRODUCT_VERSION_CONFLICT'`
**or** `normalized.httpStatus === 409`.

`adminProduct_update` legitimately answers `409` for several distinct outcomes:

| Domain code | Status | Meaning |
|---|---|---|
| `PRODUCT_VERSION_CONFLICT` | 409 | the `expectedUpdatedAt` token is stale |
| `PRODUCT_NOT_EDITABLE` | 409 | the product left the state this screen may edit |
| `PRODUCT_MEDIA_ASSET_UNAVAILABLE` | 409 | a selected Asset is not eligible catalog media |
| `PRODUCT_SLUG_CONFLICT` | 409 | slug collision |
| `PRODUCT_ARCHIVE_NOT_ALLOWED` | 409 | archive refusal |

Every one of them opened the stale-version dialog. That dialog is **destructive advice**: its
primary action reloads the authoritative record, replacing the operator's unsaved edits. For a
lifecycle refusal or an ineligible image, reloading cannot fix anything — so the screen was
inviting operators to discard work to solve a problem the discard does not address.

---

## I. Exact domain-code correction

`classifySaveFailure(error)` now returns one of four outcomes from the **domain code alone**:

| Classification | Trigger | UI |
|---|---|---|
| `version-conflict` | exactly `PRODUCT_VERSION_CONFLICT` | approved reload dialog |
| `not-editable` | exactly `PRODUCT_NOT_EDITABLE` | approved lifecycle wording, no dialog |
| `media-unavailable` | exactly `PRODUCT_MEDIA_ASSET_UNAVAILABLE` | selection guidance, no dialog |
| `generic` | anything else — unknown code, missing code, bare 409, transport failure | existing safe message, no dialog |

`isVersionConflict` is now defined as `classifySaveFailure(error) === 'version-conflict'`, so
the dialog has exactly one gate. HTTP status is no longer consulted for conflict
classification at all; `isNotFound` still reads status `404`, unchanged.

The lifecycle wording reuses the already-approved `detail.notEditableTitle/Body` rather than
inventing copy. One new pair was needed for the media outcome, phrased in the vocabulary the
approved media help already uses (`Sẵn sàng`).

In every non-version case the operator's edits stay on screen, no reload is forced, and no
backend message, code or request id is rendered.

### I.1 Test matrix — `apps/admin/test/components/product-save-failures.test.tsx`

| Case | Expected | Result |
|---|---|---|
| `PRODUCT_VERSION_CONFLICT` + 409 | conflict dialog, edits preserved | ✅ |
| `PRODUCT_NOT_EDITABLE` + 409 | lifecycle guidance, no dialog, edits preserved | ✅ |
| `PRODUCT_MEDIA_ASSET_UNAVAILABLE` + 409 | media guidance, no dialog, edits preserved | ✅ |
| unknown code (`PRODUCT_SLUG_CONFLICT`) + 409 | generic safe error, no dialog | ✅ |
| **missing** code + 409 | generic safe error, no dialog | ✅ |
| any failure | no backend message, code or request id rendered | ✅ |

**The suite was proven to fail against the defect**: with the classifier temporarily reverted to
the `|| httpStatus === 409` behaviour, 4 of 6 fail; with the correction in place, 6 of 6 pass.

---

## J. Preserved A03 behavior

Re-verified by the full 420-test Admin suite and the 143-test focused A03 suite (twice):

create fields and the one-POST flow · detail/edit routes · changed-fields-only PATCH ·
description clear semantics · whole-VND string handling · Asset cursor continuation ·
server-backed media identity · ordered media and keyboard controls · dirty-state protection ·
the authoritative conflict reload · A02 create/edit entry points · desktop/mobile layout ·
global Sass · accessibility.

No publication, archive, delete, variants/SKU or thumbnail-delivery work was performed;
`adminProductArchive` remains off the client boundary. The duplicated media-identity formatter
is untouched and remains a nonblocking observation. The two honestly named development Product
rows remain, since no sanctioned delete or archive surface belongs to this checkpoint.

---

## K. Frozen artifacts

| Artifact | Required | Measured | Status |
|---|---|---|---|
| OpenAPI sha256 | `c4d1fef8ecc54c330aa8cf8e130582c92e4e6af9dd3643664cc020757da72d0b` | identical | ✅ |
| Generated client tree hash | `3e3e267dc3c76bd630138bcb21f1500006ecf38dec2d088c5bc4d4c2133acfdb` | identical | ✅ |
| Migrations | 33 | 33 files, 33 applied | ✅ |
| Tables / columns / CHECKs | 78 / 833 / 190 | 78 / 833 / 190 | ✅ |
| DB fingerprint | `82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf` | manifest check passed, no schema change | ✅ |
| Figma registry | 72 IDs / 72 node rows | 72 / 72 | ✅ |

No dependency or lockfile change. `apps/api`, `apps/worker`, `apps/storefront`, database
schema/migrations and object storage are untouched.

---

## L. Rewritten Commit B evidence

| | Hash |
|---|---|
| Commit B before rewrite | `381bf4ac651b7c8af942ee28238d4cfac071e6a5` |
| Commit B after rewrite | `d68e6ff5f0271a4e5ee7ae3c2f4fc7b2ad039d46` |
| Subject | `docs(app2): record Admin Product Form evidence` (unchanged) |

Files (unchanged boundary — evidence/status only):

```
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md                       |  2 +-
docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md          | 25 +-
docs/implementation/reports/APP2-A03-COMPLETION-REPORT.md                  | 649 +++++
```

### L.1 Replayed commits (content identical, hashes changed by the rewrite)

| Before | After | Subject |
|---|---|---|
| `c80a1dd` | `5dcde4b695cb28a31c096826360048d9b9301511` | `chore: add evidences/ to .gitignore` |
| `a2ad5ae` | `7e3e4987cda5f4cd63c7a0ca1af9d889c5f3d54d` | `fix(admin): make the product form’s exits work` |
| `7e744b4` | `2d921513132039db57a61dd42863cfded4036412` | `fix(admin): show the product form’s actions only when there is a change` |

A safety tag was taken before the rewrite and removed after verification, so the repository
carries no tags and no stale ref. The pre-rewrite chain remains in the local reflog only.

### L.2 Resulting chain

```
02fa373  feat(admin): implement product form and detail          (A, untouched)
d68e6ff  docs(app2): record Admin Product Form evidence          (B, rewritten)
5dcde4b  chore: add evidences/ to .gitignore                     (operator, replayed)
7e3e498  fix(admin): make the product form’s exits work          (replayed)
2d92151  fix(admin): show the product form’s actions only …      (replayed)
b6bdb3b  fix(admin): secure A03 evidence and conflict handling   (C)
```

---

## M. Commit C evidence

```
b6bdb3bb52c9a878b1864cce78bd8108d7dbb967
fix(admin): secure A03 evidence and conflict handling
7 files changed, 587 insertions(+), 22 deletions(-)
```

| File | Change |
|---|---|
| `apps/admin/src/features/products/model/product-conflict.ts` | exact-code classification; `ProductSaveFailure`; status no longer implies conflict |
| `apps/admin/src/features/products/model/product-form-copy.ts` | `PRODUCT_SAVE_FAILURE_COPY` — one message per classified outcome |
| `apps/admin/src/features/products/components/product-edit-form.tsx` | failure banner resolves from the classification |
| `apps/admin/test/components/product-save-failures.test.tsx` | **new** — the §8 matrix (6 tests) |
| `tools/check-report-secrets.mjs` | **new** — canonical secret-disclosure gate |
| `tools/check-report-secrets.test.mjs` | **new** — 9 regression tests |
| `package.json` | `check:secrets` script, added to `quality` |

No production authentication source changed.

---

## N. Validation matrix

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/admin lint` | ✅ clean |
| `pnpm --filter @embroidery/admin typecheck` | ✅ clean |
| `pnpm --filter @embroidery/admin test` | ✅ 41 suites, **420 tests** |
| `pnpm --filter @embroidery/admin build` | ✅ 8 routes |
| Focused A03 suite (7 files) — run 1 | ✅ **143 tests** |
| Focused A03 suite (7 files) — run 2 | ✅ **143 tests** |
| `node tools/check-report-secrets.mjs` | ✅ 346 documents, 1,594 tracked files |
| `node --test tools/check-report-secrets.test.mjs` | ✅ 9/9 |
| `pnpm --filter @embroidery/frontend-testing test` | ✅ |
| `pnpm check:styles` | ✅ 4 apps, 554 files |
| `pnpm check:frontend-boundaries` | ✅ clean |
| `pnpm check:frontend-build-boundary` | ✅ 2,507 built files |
| `pnpm check:e2e` | ✅ 32 tests collect, Playwright pinned |
| `pnpm check:openapi` | ✅ artifact up to date |
| `pnpm check:api-client` | ✅ tree hash matches |
| `pnpm check:figma-design-index` | ✅ 72/72 |
| `node --test tools/check-figma-design-index.test.mjs` | ✅ 31/31 |
| `pnpm db:check:manifest` | ✅ all checks passed |
| `node tools/check-file-size.mjs` | ✅ passed (21 review-threshold notices, pre-existing) |
| **`pnpm quality`** | ✅ **exit 0**; tools tests 122/122; secret gate ran inside it |
| `git diff --check` | ✅ clean |

### N.1 Command substitutions

| §11 command | Actually run | Why |
|---|---|---|
| `pnpm check:frontend-test-boundaries` | `pnpm check:frontend-boundaries` | No script by that name exists; `check:frontend-boundaries` is the script that runs `tools/check-frontend-test-boundaries.mjs`. |
| “the canonical secret/leak checker” | `pnpm check:secrets` | Created by this correction — none existed (§G.1). |

### N.2 Credential proofs (no values recorded)

| Claim | Evidence |
|---|---|
| Disclosed credential rejected | `POST /api/staff/session` → **401** |
| Replacement accepted | `POST /api/staff/session` → **204** |
| One authenticating credential | 1 live row; lookup takes the newest live row only; earlier bootstrap value → 401 |
| Disclosed value absent from every reachable ref | §D — 0 matches across 230 commits, messages, tree and index |
| Sanitized report passes the new checker | §G.3 — 0 findings |

---

## O. Acceptance matrix

| # | Criterion | Result |
|---|---|---|
| 1 | Original A03 evidence entry verified | ✅ (§A; deviation disclosed in §A.1) |
| 2 | Branch confirmed unpushed | ✅ |
| 3 | Plaintext disclosure reproduced without reprinting | ✅ §B.1 |
| 4 | Commit A untouched | ✅ |
| 5 | Commit B sanitized and rewritten | ✅ §C, §L |
| 6 | Rewritten B preserves scope and subject | ✅ |
| 7 | Disclosed value absent from all reachable refs | ✅ §D |
| 8 | Absent from tracked/staged/current files | ✅ §D |
| 9 | No destructive gc | ✅ |
| 10 | Replacement generated securely | ✅ §E |
| 11 | Stored only in ignored local state | ✅ |
| 12 | Never printed or committed | ✅ |
| 13 | Disclosed credential cannot authenticate | ✅ 401 |
| 14 | Replacement can authenticate | ✅ 204 |
| 15 | Exactly one credential authenticates | ✅ §F |
| 16 | Multiple-row semantics audited | ✅ §F |
| 17 | No raw SQL credential cleanup | ✅ |
| 18 | Production auth changed only if defect proven | ✅ unchanged; no defect |
| 19 | Canonical secret checker reused/extended | ✅ §G.1 rationale |
| 20 | Synthetic plaintext disclosure fails | ✅ |
| 21 | Redacted wording passes | ✅ |
| 22 | Normal security prose passes | ✅ |
| 23 | Sanitized A03 report passes | ✅ |
| 24 | Secret checker runs in full quality | ✅ |
| 25 | Only exact code opens the dialog | ✅ §I |
| 26 | Generic 409 does not | ✅ |
| 27 | `PRODUCT_NOT_EDITABLE` does not | ✅ |
| 28 | `PRODUCT_MEDIA_ASSET_UNAVAILABLE` does not | ✅ |
| 29 | Unknown/missing-code 409 safe generic | ✅ |
| 30 | Local edits preserved for non-version errors | ✅ |
| 31 | Authoritative reload flow correct | ✅ |
| 32 | Create/edit/media behavior preserved | ✅ §J |
| 33 | A02 integration preserved | ✅ |
| 34 | Desktop/mobile/accessibility preserved | ✅ |
| 35 | No publication/archive/delete/thumbnail work | ✅ |
| 36 | OpenAPI unchanged | ✅ §K |
| 37 | Generated client unchanged | ✅ §K |
| 38 | Database unchanged | ✅ §K |
| 39 | Figma unchanged | ✅ §K |
| 40 | No dependency | ✅ |
| 41 | Focused A03 tests pass twice | ✅ 143 × 2 |
| 42 | Admin build passes | ✅ |
| 43 | Full quality passes | ✅ exit 0 |
| 44 | No secret in logs or reports | ✅ |
| 45 | Commit C implementation/checker only | ✅ |
| 46 | Commit D evidence only | ✅ |
| 47 | Exactly two correction commits after rewritten B | ✅ C and D |
| 48 | Complete correction report | ✅ this document |
| 49 | Final tracked tree clean | ✅ |
| 50 | Nothing pushed | ✅ |
| 51 | B03/A04/T01 not started | ✅ |
| 52 | `APP2-A03-C2` not created | ✅ |

---

## P. B03 handoff and scope closure

```
APP2-A03   = COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW
APP2-A03-C2 = MUST_NOT_BE_CREATED
APP2-B03   = READY — NOT STARTED
APP2-A04   = BLOCKED_BY_APP2-B03
APP2-T01   = ROUTED — NOT PLANNED_FOR_EXECUTION
```

Carried forward for `APP2-B03`:

- The conflict classifier is code-exact. A new publication-lifecycle 409 will fall to the
  generic safe message until B03 classifies it deliberately — `classifySaveFailure` and
  `PRODUCT_SAVE_FAILURE_COPY` are the two places to extend, together.
- `PRODUCT_SLUG_CONFLICT` and `PRODUCT_ARCHIVE_NOT_ALLOWED` are unclassified on purpose: no A03
  surface owns them.
- `pnpm check:secrets` now gates every tracked document. Report credential handling as prose
  plus an explicit redaction marker.
- One residual development session row (§E.2) and the two honestly named development Product
  rows remain as disclosed development data.
