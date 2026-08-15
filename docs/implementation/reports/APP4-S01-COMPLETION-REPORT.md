# APP4-S01 — Storefront contact verification · Completion report

## A. Verdict

```text
BLOCKED_BY_AUTHORITY — STOREFRONT_MASKED_DESTINATION_SOURCE_ABSENT
```

The Product Owner's `APP4-D01` approval **was applied in full** (48/48 rows, §B/§C
below) and the mandatory source audit was completed. Implementation of
`/xac-minh-lien-he` then stopped at the §9 authority gate, before any Storefront
source file was created:

- the approved code-entry design **materially requires** a canonical masked
  destination, and states the requirement three independent ways;
- **no** canonical frontend-consumable source for it exists — not in the
  `APP4-B03` contract, not in the generated client, not in any shared
  frontend-safe package;
- **no** approved Figma annotation permits a generic non-identifying phrase in
  its place;
- the only implementation of the rule is `APP4-P01`'s `maskContact`, which lives
  inside `apps/api` and which `APP4-S01` is forbidden to import or duplicate.

No Storefront route, feature, hook, style, test or checker was written. No
backend, worker, database, schema, migration, OpenAPI or generated-client source
was touched. `APP4-S02` was not started.

**No full regression/test chain was run.**

---

## B. Entry + Product Owner D01 approval

### B.1 Accepted entry

| Item | State at entry |
|---|---|
| `APP4-D01` | COMPLETE — PRODUCT_OWNER_APPROVED (applied by this checkpoint) |
| `APP4-B03` | PASS |
| `APP4-B04` | PASS |
| `APP4-S01` | READY — NOT STARTED |
| Working tree at entry | clean, `production` @ `8552d86` |

### B.2 The approval, as applied

Registry: `docs/design/FIGMA_DESIGN_INDEX.md` §4.10.

Pre-promotion state, measured from the file rather than assumed:

```text
APP4-D01 rows              48
status                     REVIEW_REQUIRED × 48
approval evidence          — × 48
last verified              2026-08-14 × 48
```

Live re-resolution of the delivered nodes against `621:3` before promotion
(`get_metadata`, file `BQwqV8GdfUIELvsQDB1UQE`, page `APP_04` / `620:3`):

```text
sub-sections               8   (621:4 … 621:11)
top-level frames           48
node-id ↔ registry match   48 / 48
```

Post-promotion state:

```text
APPROVED_FOR_IMPLEMENTATION | FIG-APPROVAL-APP4-D01-PO-001 | 2026-08-15   × 48
```

Scope proof: the diff is exactly `48 insertions(+), 48 deletions(-)` in one
file. Of the registry's other rows, none changed status, evidence or
last-verified; 38 distinct non-`APP4-D01` state combinations are unchanged.

One narrow registry note was added above the §4.10 table recording that the
Product Owner approved the complete package, that `S01`/`S02`/`A01` may consume
their registered nodes, and that this is a reviewer-recorded promotion rather
than design self-approval.

**No Figma node was created, deleted, redrawn, moved, renamed or restyled.** The
Figma session was read-only: `get_metadata` and `get_design_context` only. No
non-APP4 row was promoted.

Gate: `node tools/check-figma-design-index.mjs` → **passed** (213 registry IDs,
213 node rows, 16 registry tables; canonical files, statuses, deep links and
composites verified). Run once, after the registry update.

---

## C. Exact approved registry rows / nodes consumed

All rows below are `APPROVED_FOR_IMPLEMENTATION` with evidence
`FIG-APPROVAL-APP4-D01-PO-001` as of this checkpoint. Nodes marked ✓ were opened
and read during the audit.

### C.1 S01 desktop 1440 — sub-section `01` (`621:5`)

| Registry ID | State | Node | Read |
|---|---|---|---|
| FIG-VERIFY-CONTACT-DESKTOP-DEFAULT | Contact entry — default | `623:3` | |
| FIG-VERIFY-CONTACT-DESKTOP-INVALID | Invalid contact input | `623:27` | |
| FIG-VERIFY-CONTACT-DESKTOP-SUBMITTING | Request submitting | `623:51` | |
| FIG-VERIFY-CODE-DESKTOP-SENT | Code sent / code entry | `623:75` | ✓ (incl. `623:80`, `623:105`) |
| FIG-VERIFY-CODE-DESKTOP-VERIFYING | Code verification submitting | `623:108` | |
| FIG-VERIFY-CODE-DESKTOP-MISMATCH | Code mismatch | `625:3` | |
| FIG-VERIFY-CODE-DESKTOP-COOLDOWN | Resend cooldown active | `625:36` | ✓ (structure) |
| FIG-VERIFY-CODE-DESKTOP-RESENT | Resend available / resent | `625:70` | ✓ (structure) |
| FIG-VERIFY-CODE-DESKTOP-EXPIRED | Challenge expired | `625:106` | ✓ (structure) |
| FIG-VERIFY-CODE-DESKTOP-LOCKOUT | Maximum-attempt lockout | `625:140` | ✓ (structure) |
| FIG-VERIFY-CONTACT-DESKTOP-RATELIMITED | Rate limited / unavailable | `625:173` | |
| FIG-VERIFY-CODE-DESKTOP-SUCCESS | Verification success | `625:193` | |
| FIG-VERIFY-CONTACT-DESKTOP-ERROR | Recoverable network/server error | `625:211` | |

### C.2 S01 mobile 390 — sub-section `02` (`621:6`)

| Registry ID | State | Node | Read |
|---|---|---|---|
| FIG-VERIFY-CONTACT-MOBILE-DEFAULT | Contact entry | `628:3` | |
| FIG-VERIFY-CODE-MOBILE-SENT | Code entry | `628:25` | ✓ (structure) |
| FIG-VERIFY-CODE-MOBILE-COOLDOWN | Cooldown | `628:57` | |
| FIG-VERIFY-CODE-MOBILE-LOCKOUT | Lockout | `628:90` | |
| FIG-VERIFY-CODE-MOBILE-SUCCESS | Success | `628:121` | |

### C.3 Shared annotations read in full

| Registry ID | Node | Bearing on the block |
|---|---|---|
| FIG-APP4-SECURITY-UX-RULES | `634:38` | Carries the deterministic masking rule and the "never display" list |
| FIG-APP4-NON-ENUMERATION | `634:59` | Forbidden/permitted Storefront copy; grants no generic-phrase permission |
| FIG-APP4-ACCESSIBILITY-NOTES | `634:134` | Labelling/live-region expectations; silent on the destination |
| FIG-APP4-HANDOFF-DEPENDENCY | `634:154` | S01 depends on B03+B04; policy values single-sourced; silent on the destination |

---

## D. The block, in full

### D.1 The approved design materially requires the canonical mask

Three independent statements on approved nodes, not one incidental label:

1. **Structure.** Frame `623:83` is named **`Masked destination`** and is a
   distinct token-bound chip (`Color/Background/Secondary`, radius 12,
   padding 14/10) holding text `623:84` = `b***@vidu.com`.
2. **Sentence.** The card body `623:82` reads
   *"Chúng tôi đã gửi một mã gồm 6 chữ số tới:"* — it ends in a colon and the
   chip is its grammatical object. Removing the chip leaves the approved
   sentence pointing at nothing.
3. **Spec strip on that very frame.** `623:107` states
   *"Đích đến chỉ hiển thị dạng che."* — the destination is displayed **only**
   in masked form.

It is also load-bearing rather than decorative: a `Masked destination` frame
appears in **every** code-entry-family frame across both viewports — `623:75`
(`623:83`), `625:36` (`625:44`), `625:70` (`625:81`), `625:106` (`625:117`),
`625:140` (`625:151`) and mobile `628:25` (`628:32`).

The rule it must satisfy is specified as an algorithm on `634:48`
("Che liên hệ — quy tắc tất định"):

- `634:50` — email: keep the first code point of the local part, replace the
  rest with `***`, keep the domain;
- `634:51` — phone: keep the country code and the last 4 digits, mask the
  middle;
- `634:52` — the same input always produces the same masked string.

And `634:46` forbids the obvious workaround: displaying the recipient address
in full "khi hợp đồng chỉ cho phép dạng che" — when the contract permits only
the masked form.

### D.2 No canonical frontend-consumable source exists

| Candidate source | Finding |
|---|---|
| `APP4-B03` issue response | `VerificationChallengeResponse` = `challengeId`, `expiresAt`, `resendAvailableAt`. Its own doc comment lists **"no masked recipient"** as part of the contract (`verification-challenge.response.ts`). |
| `APP4-B03` resend response | Same component, by design ("Issue and resend return the same shape"). |
| `APP4-B04` attempt / status response | `VerificationChallengeStatusResponse` = `challengeId`, `expiresAt`, `state`. No destination of any form. |
| Request body | `IssueVerificationChallengeBody.contact` is documented "never echoed back". |
| Generated client | `packages/api-client/src/generated/embroidery-api.schemas.ts` — the only `maskedValue` fields belong to **Admin** components (`APP4-B07`/`B08` support surfaces), reachable from no public operation. |
| Shared frontend-safe package | None. A repository-wide search for a mask primitive outside `apps/api` returns nothing. |
| `APP4-P01` `maskContact` | `apps/api/src/modules/customer/domain/contact/mask-contact.ts` — inside the API application, not a workspace package. |

### D.3 No annotation permits a generic phrase

`634:38`, `634:59`, `634:134` and `634:154` were read end to end. None contains
a permission to substitute a generic non-identifying phrase for the canonical
mask. `634:59` enumerates permitted Storefront copy — neutral, action-oriented
messages, identical rate-limit answers, bounded internal audit classes — and
none of those clauses reaches the destination summary.

### D.4 Why this is not resolvable inside S01

Every available route is closed by an explicit rule:

| Route | Closed by |
|---|---|
| Import `maskContact` from `apps/api` | §9 (and the app-to-app import boundary) |
| Re-implement the mask in Storefront | §9, §21 rule 16, acceptance criterion 41 |
| Show the contact the visitor typed, unmasked | Figma `634:46`; spec strip `623:107` |
| Drop the chip / substitute a generic phrase | No approving annotation exists (§D.3) |
| Add the field to `APP4-B03` | §2 (no API change in S01) and §9 (not without Product Owner review) |

Hence the named stop condition rather than a judgement call.

---

## E. What was audited but not built

The §4 source audit was completed in full, so a follow-up can resume without
repeating it.

| Question | Answer found in source |
|---|---|
| Generated operations | `publicVerificationIssue`, `publicVerificationResend`, `publicVerificationSubmitAttempt`, `publicVerificationReadStatus` (`packages/api-client/src/generated/embroidery-api.ts`) |
| Public boundary | **None of the four is exported** from `packages/api-client/src/index.ts`; a follow-up must widen that boundary (not the generated tree) as APP1/APP2 did |
| Error envelope | `NormalizedApiError { code, message, httpStatus?, requestId?, fieldErrors? }` via `normalizeApiClientError` |
| Error codes | The verification exceptions attach **no business `code`**, so `api-error-mapper.ts` falls back to the status-derived code — 422-mismatch and 422-not-answerable share a code, as do 429-lockout and 429-rate-limited |
| Consequence | Terminal state must be resolved through `publicVerificationReadStatus` (`ISSUED`/`EXPIRED`/`FAILED`/`VERIFIED`/`CANCELLED`) after a refusal — exactly the narrow status read §16 permits, and never by parsing a message |
| TanStack | v5.101.2; `useMutation().variables` survives settlement, so the code must live in a ref with `mutate()` carrying no variables (or an explicit `reset()`), per §15 |
| Route-local provider | `discover-query-provider.tsx` — client scoped per route, created in `useState`, `retry: false` |
| Service pattern | Feature service calls a generated operation with `{ instance: getBrowserApiClient() }`; no ad-hoc Axios, no endpoint literal |
| Feature layout | `features/<name>/{components,hooks,model,services,styles}` + `index.ts` |
| Tests | Jest + `next/jest` + jsdom; `test/components`, `test/boundary` (`@jest-environment node`, source-fact assertions), `test/smoke` |
| Checkers | `tools/check-*.mjs` + `tools/check-*.test.mjs`, pure read-only Node, large ones split into a `*.sources.mjs` |
| Storefront route surface | No existing checker freezes it; only `tools/check-app3-s01.test.mjs` references the app directory, and it does not enumerate routes — so publishing `/xac-minh-lien-he` reconciles nothing |
| Policy values | `634:177`–`634:181` restate 600 s / 6 digits / 5 attempts / 60 s / 5-per-900 s and require them read from config, never hard-coded in UI — consistent with §11 and satisfied by `expiresAt` + `resendAvailableAt` |

Sections F–R of the prescribed template (contact entry, state model, timers,
resend, code secrecy proof, error mapping, fidelity, accessibility, component
tests, runtime proof, S01 checker) have **no content to report**: the checkpoint
stopped before any of that source existed.

---

## S. Validation ledger

| # | Command | Scope | Result | Runs |
|---|---|---|---|---|
| 1 | `node tools/check-figma-design-index.mjs` | Figma registry integrity after the D01 promotion | **PASS** — 213 registry IDs, 213 node rows, 16 tables | 1 |

Not run, and why: every remaining command in §26 covers Storefront source,
tests, checkers or a runtime route that this checkpoint did not create. Running
them would have produced evidence about nothing. Nothing in the prohibited list
was run.

**No full regression/test chain was run.**

---

## T. Files changed

| File | Change |
|---|---|
| `docs/design/FIGMA_DESIGN_INDEX.md` | 48 `APP4-D01` rows promoted to `APPROVED_FOR_IMPLEMENTATION` with evidence `FIG-APPROVAL-APP4-D01-PO-001` and Last Verified `2026-08-15`; one narrow §4.10 note recording the Product Owner approval |
| `docs/implementation/reports/APP4-S01-COMPLETION-REPORT.md` | This report |

No source, test, checker, schema, migration, OpenAPI or generated file changed.

---

## U. Git evidence

| Commit | Subject |
|---|---|
| `3dfede5` | `docs(design): record Product Owner approval of APP4-D01` |
| B | `docs(app4): record APP4-S01 authority block` |

Nothing pushed. Nothing amended or squashed.

Commit A deliberately carries no `feat(storefront)` subject: no Storefront
source exists in it.

---

## V. Follow-ups

**`FU-APP4-S01-MASKED-DESTINATION-01` (blocking `APP4-S01`).** Give the
Storefront a canonical, frontend-consumable masked destination, or approve its
removal from the design. Three candidate resolutions, none of which S01 may
choose on its own:

1. **Extend the `APP4-B03` contract** — add a masked-destination field to
   `VerificationChallengeResponse`, produced by the existing `APP4-P01`
   `maskContact` on the server. Keeps one masking authority and one algorithm.
   Requires Product Owner review because the B03 DTO currently documents the
   omission as deliberate, and because a mask returned on issue is a new
   (if deterministic and one-way) disclosure on a public, unauthenticated
   endpoint — that trade-off is the reviewer's to make, not S01's.
2. **Promote `maskContact` into a shared frontend-safe workspace package** and
   have Storefront mask the contact the visitor just typed. No API change and no
   new disclosure, but it moves a security primitive into browser-shipped code.
3. **Approve a design change** replacing the `Masked destination` chip with an
   annotation-backed generic phrase across all ten affected frames, and adjust
   the body sentence `623:82` that currently ends in a colon.

Resolution 1 or 2 also needs the four public verification operations exported
from `packages/api-client/src/index.ts`; that is ordinary boundary work, not a
decision.

**`FU-APP4-S01-ERROR-CODE-GRANULARITY-01` (non-blocking).** The verification
refusals carry no business error code, so the client cannot distinguish
mismatch from expiry (both 422) or lockout from rate limiting (both 429) without
a follow-up status read. The status read is sufficient and is what §16
prescribes, so this is recorded as an observation rather than a defect — but a
future checkpoint adding stable codes would remove a round trip.

---

## W. Next checkpoint

`APP4-S01` remains **NOT COMPLETE**. It resumes once
`FU-APP4-S01-MASKED-DESTINATION-01` is resolved by a Product Owner ruling.

`APP4-S02` was **not** started and must not start ahead of `APP4-S01`.
