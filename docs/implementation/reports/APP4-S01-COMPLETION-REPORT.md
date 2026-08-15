# APP4-S01 — Storefront contact verification · Completion report

## A. Verdict

```text
PASS — with two recorded follow-ups
```

`/xac-minh-lien-he` is delivered against the approved `APP4-D01` design, using
the existing Storefront shell, the generated Axios client and handwritten
TanStack hooks. The verification code never leaves ephemeral component memory.

This checkpoint has two phases, both recorded here because the second only
became possible through the first:

1. **The authority block.** `APP4-S01` first stopped at
   `BLOCKED_BY_AUTHORITY — STOREFRONT_MASKED_DESTINATION_SOURCE_ABSENT`: the
   approved code-entry design requires the canonical masked destination and no
   frontend-consumable source published it.
2. **The Product Owner unblock.** Resolution 1 of
   `FU-APP4-S01-MASKED-DESTINATION-01` was chosen — the server publishes the
   `APP4-P01` mask on issue/resend — and S01 then completed against it.

**No full regression/test chain was run.**

---

## B. Entry, the block, and the Product Owner rulings

### B.1 Accepted entry

| Item | State at entry |
|---|---|
| `APP4-D01` | COMPLETE — PRODUCT_OWNER_APPROVED (applied by this checkpoint) |
| `APP4-B03` / `APP4-B04` | PASS |
| `APP4-S01` | READY — NOT STARTED |
| Working tree at entry | clean, `production` @ `8552d86` |

### B.2 The `APP4-D01` approval, as applied

Pre-promotion state, measured from the file rather than assumed: **48 rows**, all
`REVIEW_REQUIRED`, evidence `—`, Last Verified `2026-08-14`.

Live re-resolution against `621:3` before promoting (`get_metadata`, file
`BQwqV8GdfUIELvsQDB1UQE`, page `APP_04` / `620:3`): **8 sub-sections, 48
top-level frames, 48/48 node ids matching the row that names them.**

Post-promotion: `APPROVED_FOR_IMPLEMENTATION | FIG-APPROVAL-APP4-D01-PO-001 |
2026-08-15` × 48. The diff is exactly `48 insertions(+), 48 deletions(-)`; the
38 distinct non-`APP4-D01` state combinations are unchanged. One narrow §4.10
note records the approval. **No Figma node was created, deleted, redrawn, moved,
renamed or restyled** — the session was read-only.

### B.3 The block that was raised, and why it was correct

The approved design requires the canonical mask three independent ways:

1. **Structure** — frame `623:83` is *named* `Masked destination`, a token-bound
   chip holding `623:84` = `b***@vidu.com`.
2. **Sentence** — the card body `623:82` reads *"Chúng tôi đã gửi một mã gồm 6
   chữ số tới:"*; it ends in a colon and the chip is its grammatical object.
3. **Spec strip on that same frame** — `623:107`: *"Đích đến chỉ hiển thị dạng
   che."*

It is load-bearing, not decorative: the frame recurs in `623:75`, `625:36`,
`625:70`, `625:106`, `625:140` and mobile `628:25`. `634:48` specifies the
algorithm; `634:46` forbids showing the full address where only a mask is
published. No annotation (`634:38`, `634:59`, `634:134`, `634:154`) permits a
generic phrase. The only implementation, `maskContact`, lives in `apps/api`.

### B.4 The Product Owner ruling that resolved it

```text
The public verification issue/resend response SHALL expose the canonical
masked destination produced server-side by APP4-P01.
```

Applied in commit `71c1344`. The server remains the single masking authority.

---

## C. Approved registry rows consumed

All 18 S01 rows are `APPROVED_FOR_IMPLEMENTATION` under
`FIG-APPROVAL-APP4-D01-PO-001`.

**Desktop 1440** (`621:5`) — `FIG-VERIFY-CONTACT-DESKTOP-DEFAULT` `623:3` ·
`-INVALID` `623:27` · `-SUBMITTING` `623:51` · `FIG-VERIFY-CODE-DESKTOP-SENT`
`623:75` · `-VERIFYING` `623:108` · `-MISMATCH` `625:3` · `-COOLDOWN` `625:36` ·
`-RESENT` `625:70` · `-EXPIRED` `625:106` · `-LOCKOUT` `625:140` ·
`FIG-VERIFY-CONTACT-DESKTOP-RATELIMITED` `625:173` ·
`FIG-VERIFY-CODE-DESKTOP-SUCCESS` `625:193` ·
`FIG-VERIFY-CONTACT-DESKTOP-ERROR` `625:211`.

**Mobile 390** (`621:6`) — `FIG-VERIFY-CONTACT-MOBILE-DEFAULT` `628:3` ·
`FIG-VERIFY-CODE-MOBILE-SENT` `628:25` · `-COOLDOWN` `628:57` · `-LOCKOUT`
`628:90` · `-SUCCESS` `628:121`.

**Shared annotations read in full** — `FIG-APP4-SECURITY-UX-RULES` `634:38` ·
`FIG-APP4-NON-ENUMERATION` `634:59` · `FIG-APP4-ACCESSIBILITY-NOTES` `634:134` ·
`FIG-APP4-HANDOFF-DEPENDENCY` `634:154`.

Card-level nodes read for copy and geometry: `623:8`, `623:40`, `623:80`,
`623:105`, `625:13`, `625:64`, `625:77`, `625:111`, `625:113`, `625:145`,
`625:147`, `625:180`, `625:198`, `625:200`, `625:216`.

---

## D. Storefront architecture reuse

The feature follows the `APP2-S01`/`APP2-S02` shape exactly: a thin route, a
route-local TanStack boundary, a service layer over generated operations, a
feature-owned stylesheet composed into `main.scss`.

| Reused | From |
|---|---|
| `StorefrontShell` (header, `<main>`, footer, skip link) | `APP1-S01A` — untouched |
| `getBrowserApiClient()` + `{ instance }` per-call injection | `apps/storefront/src/config` |
| Route-local `QueryClientProvider` created in `useState` | `discover-query-provider.tsx` |
| `normalizeApiClientError` | `@embroidery/api-client` |
| Colour, type, radius, spacing, touch-target tokens | `@embroidery/styles` |

`APP4-D01` created **no** new DS component masters or tokens, so the card,
field, tabs, OTP boxes and alerts are local compositions bound to approved
tokens — the `APP2-D01` precedent, for the same reason (`FIG-DS-INPUT` is still
unpublished).

---

## E. Route and shell

```text
apps/storefront/src/app/xac-minh-lien-he/page.tsx
```

A Server Component that sets metadata and mounts the capability; nothing else.
`robots: { index: false }` — a verification screen has no standalone audience.

The screen renders a `<section>`, not a `<main>`: the shell already provides the
one `main` landmark. **The browser found the opposite first** — the initial
implementation rendered a second `<main>`, measured as `mainLandmarks: 2`, and
was corrected before the proof was accepted.

---

## F. Generated-client / TanStack boundary

`packages/api-client/src/index.ts` now exports the four public verification
operations plus the request/response types and the three enums the UI branches
on. The generated tree is never deep-imported and no generated file was edited.

`api/verification.client.ts` wraps each operation; the feature contains **no URL
string, no raw `fetch`, no ad-hoc Axios**. Hooks are handwritten
(`useContactVerification`); no generated TanStack hooks exist.

---

## G. Contact entry — EMAIL and PHONE

One radio group (`623:11`), not two buttons, so arrow-key navigation and the
group label come from the platform. Vietnam-first phone presentation with an
explicit international path (`+`), and the help text describes no normalization
mechanics.

`model/contact-draft.ts` performs **shape checks only** — deliberately looser
than the server, because a client stricter than the canonical normalizer would
reject destinations the platform accepts. Switching kind clears the field.

---

## H. Masked-destination authority decision

`recipientMasked` is rendered **exactly as received** — no slicing, padding,
truncation or re-formatting anywhere in the browser. `apps/storefront` contains
no `maskContact`, `maskEmail`, `maskPhone` or `***`, and the S01 gate refuses
all four by name. The contact the customer typed is never rendered on any
code-entry-family screen.

Because the mask outlives the challenge (the approved expired, lockout and
success frames still show it), it is held in flow state separately from
`challenge`, which is dropped on success so nothing can answer it again.

---

## I. Challenge state model

One reducer (`model/verification-state.ts`), no Zustand. Two layers:

- `VerificationState` — what the flow *is* (status, contact, challenge).
- `verificationUiState(state, nowMs)` — which approved frame is on screen, a
  **pure function of state and time**.

Cooldown and resend-availability are not statuses: they are functions of
`resendAvailableAt`. Modelling them as statuses would make "in cooldown" and
"showed a mismatch" mutually exclusive, which they are not. All 13 UI states are
named and reachable.

Nothing persists across reload — no authority defines recovery for a live
challenge.

---

## J. Cooldown and expiry timers

Derived from the server's `expiresAt` / `resendAvailableAt`. One `setInterval`,
started only while a countdown is running and cleared when it is not. It ticks
the **clock**, not a decremented counter, so it cannot drift and a suspend is
simply skipped. Nothing is polled; the status endpoint is read only to resolve a
refusal.

**No `60`, `600`, `60_000` or `600_000` appears in feature runtime source**, and
the gate refuses them.

---

## K. Resend behaviour

Calls `publicVerificationResend`, never the issue operation — the gate asserts
the resend service body does not reach `publicVerificationIssue`. On success the
replacement's `challengeId`, `expiresAt`, `resendAvailableAt` and
`recipientMasked` wholly replace the old ones, the code input clears (keyed on
challenge id, so any replacement path clears it), and the approved resent alert
renders. A refused resend (422) is resolved through the status read to the
expired, lockout or success frame.

---

## L. Code secrecy — proof

Three independent mechanisms, deliberately, because one is a refactor away from
removal:

1. The code lives in a `useRef` and the input's DOM value — never in reducer
   state, so no snapshot of the flow can contain it.
2. The attempt mutation is declared with **no variables**: `mutate()` takes no
   argument and `mutationFn` reads the ref, so TanStack's retained
   `mutation.variables` is permanently `undefined`.
3. `attempt.reset()` on settlement drops the mutation entry entirely; the
   provider also sets `gcTime: 0`.

Cleared on success, resend, expiry, lockout, mismatch, restart and unmount.

Proved by 11 focused tests inspecting the mutation cache, query cache,
`localStorage`, `sessionStorage`, `document.cookie`, `location.href`,
`history.state` and captured console output — and again in a real browser after
two attempts: **`codeFoundIn: []`** across URL, both storages, cookies, history
and the full serialized DOM. The suite also asserts `variables` is `undefined`
for every mutation, which is stronger than "does not contain the code".

---

## M. API error / state mapping

Mapped by **HTTP status only**; no code path reads `.message`.

| Call | Status | Screen |
|---|---|---|
| issue | 422 | invalid contact |
| issue / resend | 429, 503 | rate limited / temporarily unavailable (`625:173`) |
| resend | 422 | resolve via status read → expired / lockout / success |
| attempt | 422 + `ISSUED` | mismatch |
| attempt | 422 + `EXPIRED`/`CANCELLED` | expired |
| attempt | 422/429 + `FAILED` | lockout |
| attempt | any + `VERIFIED` | success |
| any | network / timeout / 5xx | recoverable error |

The status read exists because `APP4-B03`/`B04` attach **no business error
code** — a 422 mismatch and a 422 dead challenge share one envelope code, by
design, since an id that answers differently is an id an attacker can confirm.
The read is the narrow §16 escape hatch, used once per refusal and never cached.

---

## N. Desktop / mobile fidelity

Measured live in the browser, not asserted from the stylesheet:

| Measurement | Approved | Rendered |
|---|---|---|
| Desktop card width | 520 (`623:80`) | **520** |
| Desktop card radius / padding | 24 / 32 | **24px / 32px** |
| Code box | 64 × 60 (`623:88`) | **64 × 60** |
| Mobile card width / offset | 350 @ x=20 (`628:7`) | **350 @ x=20** |
| Mobile card padding | 24 | **24px** |
| Horizontal overflow @ 390 | none | **none** (`scrollWidth == 390`) |
| Touch targets @ 390 | ≥ 44 | tabs 44, resend 44, submit 52 |

The mobile code row initially declared a fixed 46px box that flex-shrank to 43 —
a width nobody chose. It now divides the content band explicitly, so the fit is
exact at 390 and correct on narrower phones.

Typography maps to `Typography/Heading/S` → `$font-size-heading-s`, `Body/M`,
`Body/S`, `Caption`; colour to `Color/{Text,Background,Surface,Border,Action,
Status}/*`. The frames name `Color/Neutral/White`, which the shared package
publishes as `$color-surface-primary` and nowhere else — used rather than adding
a foundation token.

Screenshots: `.playwright-mcp/app4-s01-desktop-1440-lockout.png`,
`.playwright-mcp/app4-s01-mobile-390-contact-entry.png` (git-ignored).

---

## O. Accessibility

One `h1`; card titles are `h2`. Every input has a visible associated label;
help and error text are bound through `aria-describedby`; errors set
`aria-invalid` and carry text, never colour alone. The six boxes are **one real
input** with `inputmode="numeric"` and `autocomplete="one-time-code"`
(`634:142`), so paste, autofill, backspace and the mobile keypad are the
browser's rather than reimplemented. In-flight states announce through a polite
live region (`634:145`); outcome alerts announce themselves. Resend is
semantically `disabled`, not merely styled (`634:147`). Focus returns to the
code field after a mismatch. Tab order measured in the browser: radio group →
field → submit.

---

## P. Component tests

`test/components/contact-verification.test.tsx` — 21 tests covering all 13
designed states plus EMAIL, PHONE, kind-switching and non-enumeration copy.
Generated operations are mocked at the feature boundary; fake timers, no sleeps.

---

## Q. Runtime / browser proof

One S01-only journey against the running dev Storefront at `embroidery.local`,
at 1440 and 390. Proved: the route loads inside the real shell; one `main`, one
`h1`; contact entry → code entry with the server's mask → mismatch → lockout;
countdown from the server instant; keyboard-only operation (Enter submits both
forms); the approved geometry above; no horizontal overflow; and no code in any
observable surface.

Console: two errors, both pre-existing infrastructure noise on every Storefront
route — a missing `favicon.ico` and the Next dev HMR websocket, which the
gateway does not proxy. **No application error from S01.**

**Limitation, stated plainly.** The four verification calls were served by an
XHR stub scoped to `/api/public/verification/*`; everything else — shell, CSS,
routing, Next runtime — was real. The dev **API container cannot start**: it has
been failing to compile for ~26 hours on `@embroidery/notification-delivery`,
an `APP4-B08` package absent from its image, plus `loadApp4PolicyDataset` from
`@embroidery/database`. That is pre-existing, unrelated to S01, and outside this
checkpoint's change impact, so it was recorded rather than repaired
(`FU-APP4-DEV-API-IMAGE-01`). Live end-to-end integration belongs to `APP4-E01`.

The success frame was not driven in the browser: reaching it needs the real
code, which exists only inside the AES-256-GCM delivery envelope. It is covered
by component tests.

---

## R. S01 checker

`tools/check-app4-s01.mjs` + `tools/check-app4-s01.test.mjs` (30 mutation
tests, all passing). It reads real source with comments stripped and the
registry — never prose, never this report.

It asserts: the exact route with no alternate verification surface; all 18
registry rows approved with evidence; the four generated operations used and
exported from the curated boundary; no hand-written URL, deep generated import,
`fetch` or raw Axios; no store, storage, cookie, URL/history write, console,
analytics or beacon; the code held in a ref with no mutation variables and a
reset on settlement; no policy duration restated; resend using the resend
operation and replacing the challenge identity; the mask rendered from the
response field with no masking or normalization primitive and no `apps/api`
import; a six-character string code never parsed as a number, with
`one-time-code` and numeric input mode; no account/profile/APP5 concept and no
enumerating copy; a still-four-path verification surface; and the 400-line
source limit.

Each rule is proved to **fail** when its subject is removed — including the
plausible mistakes: `mutate(code)`, `sessionStorage.setItem`,
`console.error(error)`, `history.replaceState`, a hard-coded `60_000`, resend
calling issue, and re-masking in the browser.

The gate initially passed a boundary check on a *comment* naming the operation;
it now strips comments there, because a gate satisfied by its own rationale
proves nothing.

---

## S. Validation ledger

Every command run once; reruns only after a covered file changed.

| # | Command | Result |
|---|---|---|
| 1 | `node tools/check-figma-design-index.mjs` | PASS — 213 IDs, 213 rows, 16 tables |
| 2 | `pnpm --filter @embroidery/api exec jest --testPathPatterns="verification-challenge-(issue\|resend).integration"` | PASS — 25 tests |
| 3 | `pnpm --filter @embroidery/api exec tsc --noEmit` | PASS |
| 4 | `pnpm --filter @embroidery/api openapi:generate` / `openapi:check` | PASS — 47 paths, 52 operations (unchanged) |
| 5 | `pnpm --filter @embroidery/api-client generate` / `check:generated` | PASS — tree hash `f99e3903…` |
| 6 | `pnpm --filter @embroidery/api-client exec tsc --noEmit` | PASS |
| 7 | `node tools/check-app4-b03-contract.mjs` | PASS |
| 8 | `node --test tools/check-app4-b03-contract.test.mjs` | PASS — 61 tests |
| 9 | `node tools/check-app4-b04-contract.mjs` | PASS (shared controller) |
| 10 | `pnpm --filter @embroidery/storefront exec jest --testPathPatterns=contact-verification` | PASS — 32 tests, 2 suites |
| 11 | `pnpm --filter @embroidery/storefront exec tsc --noEmit` | PASS |
| 12 | `pnpm --filter @embroidery/storefront exec eslint <changed paths>` | PASS |
| 13 | `node tools/check-app4-s01.mjs` | PASS |
| 14 | `node --test tools/check-app4-s01.test.mjs` | PASS — 30 tests |
| 15 | S01-only browser journey (1440 + 390) | PASS |
| 16 | `npx prettier --check <changed files>` | PASS |
| 17 | `node tools/check-report-secrets.mjs` | PASS |
| 18 | `git diff --cached --check` | PASS |

Not run: full Storefront Jest, full Playwright, full API Jest, the full B03/B04
suites, P01, B01/W01/B02/B05/B06/B07/B08 runtime, DB manifest/migration
regression, G01, SonarQube, repo-wide build/typecheck/lint.

**No full regression/test chain was run.**

---

## T. Files changed

**Commit A — the authority unblock (`71c1344`)**

| File | Change |
|---|---|
| `…/domain/verification/verification-issue-outcome.ts` | `recipientMasked` on the outcome |
| `…/application/issue-verification-challenge.use-case.ts` | mask the live challenge's own recipient |
| `…/application/verification-challenge.issuer.ts` | mask the issued target |
| `…/presentation/schemas/verification-challenge.response.ts` | published field + doc |
| `…/presentation/public-verification.controller.ts` | projection copies the mask |
| `…/tests/integration/verification-challenge-{issue,resend}.integration.spec.ts` | 5 new proofs |
| `packages/contracts/openapi/openapi.generated.json` | regenerated (schema only) |
| `packages/api-client/src/generated/embroidery-api.schemas.ts` | regenerated |
| `packages/api-client/src/index.ts` | four operations on the public boundary |
| `tools/check-app4-b03-contract{,.test}.mjs` | narrow reconciliation + 10 mutations |

**Commit B — the Storefront capability**

| File | Change |
|---|---|
| `apps/storefront/src/app/xac-minh-lien-he/page.tsx` | the route |
| `…/features/contact-verification/**` | 14 files: model, api, hooks, ui, styles |
| `apps/storefront/src/styles/main.scss` | compose the feature stylesheet |
| `apps/storefront/test/components/contact-verification{,-secrecy}.test.tsx` | 32 tests |
| `apps/storefront/test/support/verification-fixture.ts` | fixtures |
| `tools/check-app4-s01{,.test}.mjs` | the gate and its 30 mutations |

No schema, no migration, no worker change.

---

## U. Git evidence

| Commit | Subject |
|---|---|
| `3dfede5` | `docs(design): record Product Owner approval of APP4-D01` |
| `71c1344` | `feat(api): publish the canonical masked destination on verification issue/resend` |
| `7cd3031` | `feat(storefront): implement APP4 contact verification` |
| _(this commit)_ | `docs(app4): record Storefront verification evidence` |

Nothing pushed. Nothing amended after publication.

---

## V. Follow-ups

**`FU-APP4-S01-ATTEMPT-COUNT-COPY-01`** — frame `625:28` renders *"Bạn còn 3 lần
thử."*, but `APP4-B04` refuses to publish the remaining-attempt count on purpose
(its contract calls such a message "a free oracle over how much budget an
attacker has left"), and the budget is a policy value `634:181` forbids the UI
from restating. The mismatch message therefore ships without the count and is
otherwise exactly as drawn. Resolving it needs either a design change or a
Product Owner ruling on publishing the count — not an S01 decision.

**`FU-APP4-S01-SUCCESS-HANDOFF-01`** — the approved success action `Tiếp tục`
(`625:206`) has no destination in S01; `APP5` owns what follows a verified
contact. It is rendered as a link to `/` rather than a button that does nothing
or a screen S01 would have invented.

**`FU-APP4-DEV-API-IMAGE-01`** (pre-existing, not S01's) — the dev API image
lacks `@embroidery/notification-delivery` and a current `@embroidery/database`
build, so the API container has not started since `APP4-B08`. It needs an image
rebuild.

**`FU-APP4-S01-ERROR-CODE-GRANULARITY-01`** (non-blocking) — the verification
refusals carry no business error code, so terminal state costs one extra status
read. Sufficient and by design; recorded as an observation.

---

## W. Next checkpoint

```text
APP4-S02
```

Not started.
