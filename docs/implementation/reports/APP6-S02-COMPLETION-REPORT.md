# APP6-S02 — Customer Secure Design Review Screen — Completion Report

## 1. Verdict

```text
APP6-S01 = ACCEPTED
APP6-S02 = COMPLETE
SCREEN = CUSTOMER SECURE DESIGN REVIEW
ROUTE = /truy-cap/duyet-thiet-ke
NEW HTTP OPERATIONS = 0
NEXT CHECKPOINT = APP6-E01
```

---

## 2. Entry verification

| Fact | Value |
|---|---|
| Branch | `production` |
| Entry `HEAD` | `d387639` |
| Working tree at entry | clean (`git status --porcelain` empty) |
| `42cbb0d` reachable from `HEAD` | yes (`git merge-base --is-ancestor`) |
| OpenAPI, committed artifact | **72 paths / 79 operations / 167 schemas** |
| Migrations | **36** |
| `APP6-S01` | `COMPLETE` |
| `APP6-S02` | `INCOMPLETE` / next |

Counts were read from the committed `packages/contracts/openapi/openapi.generated.json`
and from the migration directory. Nothing was regenerated to count, and the artifact
carries **no diff** at exit: still 72 / 79 / 167, still 36 migrations.

No unrelated user change existed at entry, and none was created.

---

## 3. Figma traceability

Approval `FIG-APPROVAL-APP6-D01-PO-001`, file `BQwqV8GdfUIELvsQDB1UQE`, page `APP_06`.
All twelve approved S02 entries were resolved from `docs/design/FIGMA_DESIGN_INDEX.md`
(lines 895–906) and consumed. Every one is `APPROVED_FOR_IMPLEMENTATION`.

| Registry ID | Node | State | Where it is implemented |
|---|---|---|---|
| `FIG-APP6-S02-DEFAULT-DESKTOP` | `707:3` | Awaiting approval | `design-review-content.tsx` stage `REVIEW` |
| `FIG-APP6-S02-TERMS-REQUIRED-DESKTOP` | `709:3` | Terms not accepted | `review-actions.tsx` disabled + reason |
| `FIG-APP6-S02-APPROVE-INPROGRESS-DESKTOP` | `709:84` | Approve in progress | stage `APPROVING` + `aria-busy` |
| `FIG-APP6-S02-APPROVED-DESKTOP` | `709:164` | Approved outcome | `approved-outcome.tsx` |
| `FIG-APP6-S02-STEPUP-DESKTOP` | `710:3` | Approve — step-up | `review-step-up-dialog.tsx` |
| `FIG-APP6-S02-REVISION-FORM-DESKTOP` | `710:109` | Request revision form | `revision-form-dialog.tsx` |
| `FIG-APP6-S02-VERSION-MISMATCH-DESKTOP` | `710:203` | `APPROVAL_VERSION_MISMATCH` | stage `VERSION_MISMATCH` |
| `FIG-APP6-S02-AGREEMENT-CONTENT-DESKTOP` | `711:3` | Effective agreement content | `agreement-list.tsx` |
| `FIG-APP6-S02-LOADING-DESKTOP` | `712:3` | Loading | APP4 `SecureLinkBootstrapCard`, reused |
| `FIG-APP6-S02-ERROR-DESKTOP` | `712:31` | Transient network error | APP4 `SecureLinkErrorCard`, reused |
| `FIG-APP6-S02-DEFAULT-MOBILE` | `713:3` | Mobile 390 default | same card, responsive rules |
| `FIG-APP6-S02-APPROVED-MOBILE` | `713:61` | Mobile 390 approved | same outcome card |

Also consumed by reference, not redrawn: APP4-D01 `629:37` (the single non-enumerating
unavailable card) and `APP3-S09` `609:263` / `609:371` (the runtime watermark and its
policy note), exactly as `APP6-D01` §5's reuse map records.

**No Figma mutation.** No node was created, edited, moved or renamed; no design-system
component, variable or style was added. The registry inputs did not change, so
`tools/check-figma-design-index.mjs` was **not** run — it is scoped validation over
inputs this checkpoint did not touch.

### One authority discrepancy, reported rather than silently resolved

`APP6-D01` §5 records the watermark as *"reproduced at its exact delivered treatment,
read from the live APP3 node"* and then measures that reproduction at **18°** rotation
with **160 × 130** tiling. The **delivered** `APP3-S09` runtime is **−30°** with a
percentage-based 5 × 7 grid. The two cannot both be followed.

The delivered runtime was followed, because §11 of the checkpoint prompt says *"reuse
APP3-S09 exact delivered treatment"* and D01 itself describes its numbers as a
reproduction *of* that runtime. Following the drawing would give a customer a visibly
different watermark from the one the Studio puts on the same artwork, which is the one
thing a recognisable mark must not do. Raised as
`FU-APP6-S02-WATERMARK-DRAWN-VS-DELIVERED-01` (nonblocking) for a PO ruling on which
artifact is corrected.

---

## 4. Secure bootstrap

The locked sequence is reused, not re-implemented:

```text
capture #t=  →  history.replaceState  →  clean URL  →  token in a POST body
```

`useSecureLinkBootstrap` performs it as three statements in one synchronous block;
`APP6-S02` adds no second parser, no second stripper and no second credential store.
The opt-in `retainCredentialAfterSuccess: true` that `APP6-S01` introduced is reused
unchanged — **no source in `secure-link-access` was modified**, so no APP4/APP5
compatibility suite was impacted or run.

| Rule | Where |
|---|---|
| Raw token may exist only in the initial fragment, one route-local ref, one in-flight body | `use-secure-link-bootstrap.ts` `tokenRef`, `runWithSecret` |
| Cleared on approval success | `approve.onSuccess` → `bootstrap.clearCredential()` |
| Cleared on revision success | `revise.onSuccess` → `bootstrap.clearCredential()` |
| Cleared on definitive 404 | `endSession()` |
| Cleared on missing/malformed fragment, and on unmount | APP4 bootstrap, unchanged |
| Retained across transient failure, `REVERIFICATION_REQUIRED`, and every reconciliation | ref survives; proved live in §12 leg G |
| Reload after strip makes **zero** credentialed calls | proved in component tests and live |

Both mutations are declared with **no variables**, so TanStack's retained
`mutation.variables` is permanently `undefined`.

---

## 5. Operations consumed

Exactly the three delivered customer operations, plus the four APP4 verification
operations the shared step-up already used. **Zero new backend operations.**

| Curated symbol | Backend | Used by |
|---|---|---|
| `publicDesignReviewCurrent` | `APP6-B10` | the one read, and the one reconciliation re-read |
| `publicDesignReviewApprove` | `APP6-B11` | approval |
| `publicDesignReviewRequestRevision` | `APP6-B11` | revision request |
| `publicVerificationIssue` / `Resend` / `SubmitAttempt` / `ReadStatus` | `APP4-B03`/`B04` | embedded step-up, via `contact-verification` |

`packages/api-client/src/index.ts` gained an **export-only** block for the three
operations, their four status enums and their eight body/response types. No generated
file was edited, no OpenAPI or client generation was run, and the Admin block still
exports none of the customer operations — the reason `APP6-A02` gave for withholding
them (an Admin screen must never be one import away from approving on the customer's
behalf) is unchanged and restated in the comment.

`publicSecureLinkResolve` is deliberately **not** chained in front of B10; a component
test asserts it is never called.

---

## 6. Exact review target

`APP6-B10` selects the version by server authority alone —
`REQUEST_ACCESS` grant → request → `current_design_case_id` → the exact
`SENT_FOR_REVIEW` version. The client sends **only** `{ token }`; a component test
asserts the body has exactly one key.

The screen then binds the decision to what the customer actually saw:

- `designVersionId` — the exact version;
- `documentHash` — the **stored** hash B10 read off the row, displayed beside the
  artwork and submitted back verbatim;
- the exact agreement identities they ticked.

All three are captured **once**, into `ApprovalIntent`, when the customer presses
approve, and are never re-derived at submit time.

---

## 7. Rendering — strategy **C**, and why

| Option | Verdict |
|---|---|
| **A** — reuse an existing public read-only renderer | **Impossible.** `features/design-studio/index.ts` exports a bootstrap island, its copy and a resume handle — nothing renderer-shaped. Its only element painter is an interactive `<g role="button">` with `tabIndex`, `aria-pressed`, click and Enter/Space selection. |
| **B** — extract the reusable read-only renderer | **Rejected: larger refactor.** The Studio's `renderer/` *is* pure, but it is **governed**, not merely located: `test/boundary/design-studio-source.test.ts` enumerates the feature directory and rules that it contains *exactly one production renderer*, exactly one `<svg>`, no local geometry, and a watermark built in *exactly the four files APP3-S09 owns*. Moving files out changes what that closed APP3 acceptance control measures. |
| **C** — a small read-only adapter over the same package authorities | **Taken.** |

C is genuinely smaller here: this surface has no selection, no gesture, no per-frame
document replacement and therefore no structural sharing, and it needs no stroke-aware
bounds because it draws no outline. `model/review-scene.ts` is 200 lines against the
Studio adapter's 265 + 152 + 18.

Every C guardrail holds **structurally**, and the boundary suite pins each:

- **no second schema, no second validator** — `validateDesignDocumentStructure` from
  `@embroidery/design-document` is the only thing that decides what a document is; the
  suite bans `zod`, `ajv`, `yup` and `JSON.parse` from the feature;
- **no second geometry authority** — every matrix comes from
  `@embroidery/design-engine`; the suite bans `Math.cos/sin/atan2/PI`,
  `multiplyMatrices`, `composeMatrices` and any `pxPerMm` arithmetic;
- **no second rendering engine** — native SVG rendered by React (`IMP-D026`,
  `ADR-APP0-001`); the suite bans `<canvas>`, konva, fabric, pixi and interact.js, and
  asserts **exactly one** `<svg>` in the whole feature;
- **no editing controls, no document mutation** — the painter has no role, no
  `tabIndex`, no handler; the adapter returns the document's own element objects.

Both branches render, proved live and in tests:

| Branch | Schema | Placement pair | Evidence |
|---|---|---|---|
| Catalog | `1` | set | live: `viewBox="0 0 400 400"`, 1 element drawn, real seeded document |
| Customer-owned product | `2` | both `null` | component test renders it without conversion; the adapter never reads `productSideId` |

**No rewrite on read.** The adapter repairs no field, supplies no default, drops no
element, migrates no version and coerces no value — a unit test asserts the placed
element is value-identical to the stored one, and that array order is preserved as
z-order. An unreadable or unresolvable document renders one honest sentence, no
artwork, and **no approve control** — approving artwork nobody could see is the one
outcome this screen exists to prevent.

Image elements draw an honest placeholder at exact geometry: B10 returns the document
and no media, there is no session on this surface, and a Template URL is not a fallback
(clone independence means lineage is provenance, not permission). No `<image>`, no
`<img>`, no storage URL — asserted live and statically.

---

## 8. Watermark and no-export

Reproduces the delivered `APP3-S09` treatment (see §3 for the D01 discrepancy): an
opaque 8-character token minted once per mounted review from
`crypto.getRandomValues`, a fixed 5 × 7 over-drawn grid rotated −30°, each mark drawn
twice (ink at 13 %, white at 22 %, offset by a hairline) so it reads on light and dark
artwork without a single pixel of customer artwork being sampled.

- **Always present, and structurally so.** `design-preview.tsx` mounts
  `<ReviewWatermark>` unconditionally; the boundary suite asserts there is no
  `&& <ReviewWatermark`, no `hideWatermark`/`showWatermark`/`watermarkEnabled`, and
  mutation **M1** confirms removing it fails a test.
- **Never persisted into the document.** `APP3-P01` has no watermark field, so it
  cannot be serialized and cannot enter the canonical hash. The boundary suite asserts
  the word does not appear in the scene adapter's executable source at all.
- **Nothing to take away.** The suite bans `download`, `createObjectURL`, `Blob(`,
  `toDataURL`, `toBlob`, `navigator.clipboard`, `execCommand`, `XMLSerializer`,
  `saveAs`, `showSaveFilePicker`, `JSON.stringify`, `localStorage`, `sessionStorage`,
  `indexedDB` and `document.cookie` from the entire feature. Live: zero `a[download]`.
- **No screenshot claim.** The policy note says the preview is marked and that the page
  has no download; a component test asserts *chụp màn hình* appears nowhere.

`Math.random` is banned; an environment without cryptographic randomness gets a
constant marked as unavailable rather than a value pretending to be unique.

---

## 9. Agreements

The B10 array **is** the authority. `agreement-list.tsx` maps `review.agreements` and
nothing else; the boundary suite asserts the strings `PAYMENT_POLICY`, `RETURN_POLICY`,
`DESIGN_APPROVAL_TERMS` and `REQUIRED_AGREEMENTS` appear nowhere in the feature, and a
component test renders an invented `WORKSHOP_TERMS` type correctly to prove there is no
hard-coded set.

- **Content as text, never markup.** Rendered as React text children split on blank
  lines, per B10's published format. `dangerouslySetInnerHTML`, `innerHTML`,
  `foreignObject`, `createElement(` and `insertAdjacentHTML` are all banned; a test
  feeds `<b>` and `<img onerror>` and asserts the characters render and no element is
  created.
- **Explicit consent, per agreement.** One unticked checkbox each, labelled and
  `aria-describedby` the policy body. Nothing pre-ticks and there is no "accept all".
- **Consent cannot survive a change of terms — by construction.** Consent is stored
  against the *signature* of the set it was given for and counts for nothing against
  any other. There is no reset to delete. A changed `contentHash`, a changed
  `agreementVersionId`, an added, removed or reordered agreement each produce a
  different signature and therefore empty consent. Mutation **M3** confirms the tests
  discriminate.
- **Exact id/hash pairs only.** `acceptedAgreementsOf` emits objects whose only keys
  are `agreementVersionId` and `contentHash`; a test serialises the body and asserts no
  type, no language and no content string appears.
- **Approve is unavailable until every agreement is ticked**, and the reason is real
  text pointed at by `aria-describedby` — not a `title` attribute. Proved live: *"Còn 2
  mục điều khoản bạn chưa đánh dấu đồng ý."*

The exact-design confirmation stays separate from both agreement types: it is the
`documentHash` (GRD-007), shown beside the artwork and named in the confirmation
dialog. No third agreement type was invented.

---

## 10. Approval

```text
B10 read → review the exact design → accept every agreement → explicit Approve
        → confirmation naming the exact version → B11 approve
```

- **The confirmation sends nothing.** Proved live: after pressing approve, the only API
  call so far was `design-reviews/current`.
- **Same-tick guard.** `inFlightRef` is a plain boolean flipped *before* `mutate()`.
  The test batches both activations inside **one** `act`, which is what makes it a real
  same-tick race — two separate `fireEvent.click` calls flush a render between them and
  would pass against an `isPending` guard. Mutation **M6** confirms it discriminates.
- **`REVERIFICATION_REQUIRED` enters the embedded step-up**, never a navigation.
  `/xac-minh-lien-he`, `useRouter`, `redirect(` and `router.push` are statically proved
  absent. Proved live: a real 403 from B11 opened the step-up with
  `location.pathname` unchanged and the review still mounted behind the scrim.
- **Purpose is `STEP_UP`**, asserted on the issue call.
- **Verification is evidence, never consent.** A completed step-up triggers the
  mandatory re-read and returns the customer to a confirmation they must press again.
  Mutation **M4** confirms.
- **Replay is a success.** `replayed: true` renders the committed outcome with a
  sentence saying it was recorded earlier, not a fresh confirmation.

`documentHash` is never computed in the browser: `crypto.subtle`, `digest(`, `sha256(`
and `createHash` are all statically absent.

---

## 11. Races — every reconciliation is bounded to exactly one re-read

`useReviewReconciliation` owns issuing at most one re-read and knowing when it is over;
`reconcileVerdict` owns what the answer means. Both are separately testable.

| Trigger | Re-reads | Outcome |
|---|---|---|
| `409 APPROVAL_VERSION_MISMATCH` | exactly 1 | intent **and** consent cleared → `710:203`, a completely new decision required. Never approves "latest". |
| `409 TERMS_NOT_ACCEPTED` | exactly 1 | consent cleared → terms-changed state, re-consent required. **Not** reported as a version mismatch. |
| `409 INVALID_TRANSITION` | exactly 1 | current truth restored with a classified notice |
| `409 IDEMPOTENCY_CONFLICT` | exactly 1 | no fabricated success; explicit action required |
| `409 DUPLICATE_OPERATION` | **0** | bounded notice only — nothing changed to re-read, and a re-read there is the first iteration of a polling loop |
| `503` (no code) | 0 | service/configuration state, explicitly **not** "you failed to accept terms" |

After a step-up the re-read compares against the **captured intent**: version id *and*
stored hash together (either alone would let one substitution through), and only once
the design is found unchanged is the agreement signature compared — that ordering is
the distinction between "your design changed" and "your terms changed".

Nothing polls, and nothing retries automatically.

---

## 12. Revision

Binds the exact `versionId` and the customer's own trimmed words. It structurally
cannot carry more: `RequestDesignRevisionBody` publishes no `documentHash` and no
`acceptedAgreements`, and the dialog cannot reach the consent state.

- required, non-blank after trim, maximum 2000 — the ceiling the wire publishes;
- **no step-up**, and the dialog says so;
- same-tick double submission sends one request;
- success clears the credential.

**One defect the browser found and the tests did not**: the form carried the native
`required` attribute, so constraint validation swallowed the submit event and answered
with a browser bubble instead of the approved copy — and, worse, would have accepted
`"   "`, which is exactly the feedback §18 refuses. Fixed by `noValidate` on the form,
keeping `required` on the textarea for assistive technology, so
`revisionFeedbackProblem` is the single validation authority. Proved live: an empty
submit made **zero** API calls and rendered *"Vui lòng mô tả điều bạn muốn thay đổi."*
with `aria-invalid="true"`.

The outcome claims nothing: the database confirms the version moved to
`REVISION_REQUESTED` while the custom request **stayed** `DESIGN_REVIEW`, and the copy
says the revision has not been created and the request is still at the review stage.
`requestStatus` is read back and deliberately not displayed.

---

## 13. Security evidence

Swept live at four points — after the read, at the confirmation, at the step-up, and
after the committed revision — across `location.href`, `location.hash`,
`history.state`, `localStorage`, `sessionStorage`, `document.cookie`, the DOM and the
console: **zero** occurrences of the credential.

| Surface | Live result |
|---|---|
| `location.hash` / `href` | empty / clean at every sample after a genuine load |
| `history.state` | Next's own router tree only |
| `localStorage` | `[]` |
| `sessionStorage` | Next's dev-tools channel key only |
| `document.cookie` | empty |
| DOM, console | no token, no document JSON |
| Console output written by the app | **none** — the only errors are browser-native resource lines (pre-existing favicon 404, pre-existing HMR websocket 502, and the expected 403/404/504 statuses) |

Also verified: no agreement id or hash in the URL, no `s3`/`blob:`/`amazonaws`/`minio`/
`presigned`/`X-Amz` anywhere in the rendered page, and no document content in any
durable store.

### A harness artifact worth recording

Two intermediate readings appeared to show the fragment restored. They were wrong: a
Playwright `goto` to a URL differing from the current one **only by fragment** is a
same-document navigation, so nothing remounts and the already-spent bootstrap correctly
does not strip again. Interleaving a different path forces a real load, and every such
measurement showed the fragment stripped and **never** restored — through consent,
approve, confirm, the live 403, the revision, and a manual retry. This is the same
class of trap `APP4-S02` recorded about Next's own hydration `replaceState`: the
measurement has to be anchored to a real load, not to a URL string.

---

## 14. Responsive and accessibility

| Check | 1440 | 390 |
|---|---|---|
| Horizontal overflow | none (`scrollWidth` ≤ viewport) | none (`scrollWidth` 375) |
| `h1` count | 1 | 1 |
| Preview usable | `viewBox` honoured, fits | 301 px wide, fits, watermark present |
| Touch targets | — | approve **52 px**, revision **52 px**, consent row **58 px** |
| Long hashes | wrap (`overflow-wrap: anywhere`) | wrap, never widen the page |
| Agreement bodies | scroll inside their own box | scroll inside their own box |
| Dialogs | `role="dialog"`, `aria-modal="true"`, own accessible name, focus on their own heading, Tab trapped, Escape closes | fit the viewport width |
| Disabled approval reason | real text, `aria-describedby` | same |
| In-progress | `aria-busy` on the card, polite live region | same |
| States not colour-only | tone carried by the title text as well as a modifier class | same |

No second mobile product: one card, responsive rules.

---

## 15. Browser acceptance — one scoped S02 run

Real gateway, real API, real database at `http://embroidery.local`. Not the Playwright
suite. No raw token and no verification code appears in this report.

Fixture: the existing dev request `CR-A02-0001` (status `DESIGN_REVIEW`) with its
already-present `SENT_FOR_REVIEW` version 2 and both published policies, plus one
seeded `REQUEST_ACCESS` grant. The grant's token digest was computed **inside the API
container** so the pepper went env → process and was never read out, echoed, logged or
committed.

| Leg | Frame | Result |
|---|---|---|
| A | `707:3` | **PASS.** Fragment stripped before the single B10 call; exact version 2, schema v1, stored hash rendered; 1 element drawn as native SVG (`viewBox 0 0 400 400`), 0 `<canvas>`; 35 watermark marks + policy note; both policies rendered with their published text; zero token leaks across eight surfaces; one `h1`. |
| B | `709:3` | **PASS.** Approve disabled with *"Còn 2 mục điều khoản bạn chưa đánh dấu đồng ý."* attached by `aria-describedby`; ticking both enabled it and removed the reason. |
| C | `711:3` | **PASS.** Both policy bodies displayed as text, scrollable in their own boxes. |
| D | `710:3` | **PASS.** Confirmation named *"Bạn đang duyệt phiên bản 2"*, carried the no-payment sentence, focused its own heading and **sent nothing**. Confirming produced a **live 403** and the step-up opened **inside** the route — pathname unchanged, review and watermark still mounted, no approval committed. |
| E | `710:203` | **NOT REACHABLE LIVE** — see the limitation below. Covered by component evidence. |
| F | revision | **PASS, real backend.** Empty submit blocked with zero API calls; a real submission committed with no step-up; outcome truthful. Database confirms version → `REVISION_REQUESTED`, request **unchanged** at `DESIGN_REVIEW`, feedback stored verbatim, no approval snapshot written. |
| — | settled 404 | **PASS.** Re-opening the same link after the decision rendered the shared APP4 unavailable card after exactly **one** request, with no version, no hash, no cause and no retry. |
| G | `712:31` | **PASS.** With the API stopped: a card distinct from unavailable, one manual retry offered, exactly one call, no automatic retry, fragment stripped and not restored. Restoring the API and pressing retry sent **exactly one** further call — proving the credential survived the transient failure. |
| H | `709:164` | **NOT REACHABLE LIVE** — see below. Covered by component evidence. |
| 390 | `713:3` | **PASS.** No overflow, one `h1`, preview 301 px and usable, watermark present, 52 px touch targets, revision dialog fits. |

### Environment limitation, unchanged and nonblocking

Every live approval ends at `403 REVERIFICATION_REQUIRED`, and a step-up cannot be
completed in dev because APP4's only notification channel is memory-only **by design** —
no plaintext verification code exists to read. Frames `709:84`, `709:164`, `710:203`
and `713:61` therefore could not be observed against the live backend and are covered
by component evidence instead. This is exactly
`FU-APP6-S01-STEPUP-BROWSER-OBSERVATION-01`, carried unchanged. No fake dev channel was
added and no contract was widened to close it.

### Dev-data changes made by this run

The seeded grant row remains, and `CR-A02-0001`'s version 2 is now
`REVISION_REQUESTED` — consumed by a genuine acceptance run, as intended. No schema,
migration or production data was touched.

---

## 16. Defects found and fixed during this checkpoint

| # | Found by | Defect | Fix |
|---|---|---|---|
| 1 | browser | `sentAt`, `approvedAt` and `decidedAt` rendered as raw ISO strings (*"Cửa hàng gửi ngày 2026-08-21T15:09:01.979Z"*). jsdom could not catch it: a test asserting "the subtitle contains the sent instant" passes against the raw string. | Added `model/design-review-instant.ts` (feature-private, following `APP6-S01` and `APP5-S02`), plus two unit tests asserting no `T`/`Z` survives and that an unparseable value degrades to silence, never to `Invalid Date`. |
| 2 | browser | The revision form's native `required` swallowed the submit event, replacing the approved copy with a browser bubble — and would have accepted whitespace-only feedback. | `noValidate` on the form, `required` kept on the textarea for AT, so `revisionFeedbackProblem` is the single validation authority. |
| 3 | mutation **M2** | "Approve from the live payload instead of the captured intent" was invisible to every behavioural test, because the reconciliation rules mean the two can never differ at submit time — the exactness is enforced twice, so one mechanism could be deleted with every suite green. | Pinned statically: the boundary suite asserts the approve `mutationFn` reads `intent.*` and that `bootstrap.state` is not in its scope. Re-running M2 now fails. |
| 4 | file-size gate | The controller reached 460 lines, over the 400 hard limit. | Split by responsibility, not by line count: `model/design-review-reconciliation.ts` (what a re-read means) and `hooks/use-review-reconciliation.ts` (issuing at most one and knowing when it is over). Controller now 396. |

---

## 17. Validation ledger

| Command / test | Impact reason | Result | Reruns | Covered inputs |
|---|---|---|---:|---|
| `npx tsc --noEmit` (storefront) | new feature + route + tests | **PASS** | 4 | all Storefront source and tests |
| `npx jest test/unit/design-review-model.test.ts` | new pure models | **PASS** 50 | 4 | consent, failure, stage, revision validation, scene adapter, watermark, instants |
| `npx jest test/components/secure-design-review.test.tsx` | new screen | **PASS** 36 | 4 | bootstrap, access states, preview, watermark, agreements, approval, races |
| `npx jest test/components/secure-design-review-decisions.test.tsx` | step-up + revision | **PASS** 16 | 3 | embedded step-up, post-step-up reconciliation, revision flow |
| `npx jest test/components/secure-design-review-secrecy.test.tsx` | retained credential + document | **PASS** 11 | 2 | eight-surface sweep at four points, no document persistence |
| `npx jest test/boundary/secure-design-review-source.test.ts` | static rules no render test can reach | **PASS** 37 | 4 | layout, file size, persistence, export, renderer, watermark, hashing, boundaries, transport, route, SCSS |
| `npx eslint <S02 paths>` | new source and tests | **PASS** (4 findings fixed) | 2 | feature, route, all five suites, fixture |
| `npx prettier --write <changed paths>` | formatting | applied, 12 files reformatted | 1 | all changed files |
| `npx tsc --noEmit` (api-client) | curated index changed | **PASS** | 1 | package sources |
| `npx jest` (api-client) | curated index changed | **PASS** 44 / 7 suites | 1 | contract + public-API smoke |
| `git diff --check` | whitespace | **CLEAN** | 1 | working tree |
| Mutation proofs M1–M6 | §25 discrimination | **all six discriminate** | 8 | see §18 |
| Scoped browser acceptance | §27 | **PASS with the documented limitation** | 1 | S02 only |

**Totals: 150 focused tests across 5 suites, plus 44 api-client tests.**

```text
No broad/full regression was run.
```

Not run, and why: no `secure-link-access` or `contact-verification` source changed, so
no APP4/APP5 compatibility suite was impacted; no APP3 source changed, so no Studio
suite was impacted; the OpenAPI artifact, the generated client, the schema and the
Figma registry are all untouched, so their gates own no changed input.

### No-repeat discipline

Each command above was rerun only after a source change that actually affected its
inputs. The reruns counted are real ones — a passing result on unchanged inputs was
never repeated, and the browser run was not repeated after the documentation was
written.

---

## 18. Mutation proofs

| # | Mutation | Suite | Result |
|---|---|---|---|
| M1 | Watermark removed from the preview | component | **1 failed** ✔ |
| M2 | Approve uses the live payload instead of the captured intent | boundary | **1 failed** ✔ (behaviourally undetectable — see §16 #3) |
| M3 | Consent survives changed agreement hashes | model | **2 failed** ✔ |
| M4 | Completed step-up auto-approves | model | **1 failed** ✔ |
| M5 | Revision routed through step-up | component | **1 failed** ✔ |
| M6 | Same-tick approve guard on `isPending` instead of a synchronous ref | component | **1 failed** ✔ |

Every mutation was reverted and the suites re-verified green afterwards.

---

## 19. Files changed

**Storefront — new**

```text
apps/storefront/src/app/truy-cap/duyet-thiet-ke/page.tsx
apps/storefront/src/features/secure-design-review/
  index.ts
  api/secure-design-review.client.ts
  hooks/use-secure-design-review.ts
  hooks/use-review-reconciliation.ts
  model/design-review-consent.ts
  model/design-review-copy.ts
  model/design-review-failure.ts
  model/design-review-instant.ts
  model/design-review-reconciliation.ts
  model/design-review-state.ts
  model/review-scene.ts
  model/review-watermark.ts
  styles/secure-design-review.scss
  ui/agreement-list.tsx
  ui/approve-confirm-dialog.tsx
  ui/approved-outcome.tsx
  ui/design-preview.tsx
  ui/design-preview-element.tsx
  ui/design-review-content.tsx
  ui/review-actions.tsx
  ui/review-alert.tsx
  ui/review-dialog.tsx
  ui/review-step-up-dialog.tsx
  ui/review-watermark.tsx
  ui/revision-form-dialog.tsx
  ui/revision-requested-outcome.tsx
  ui/secure-design-review-screen.tsx
```

**Modified**

```text
apps/storefront/src/styles/main.scss        # one @use line
packages/api-client/src/index.ts            # export-only block
```

**Tests — new**

```text
apps/storefront/test/support/secure-design-review-fixture.ts
apps/storefront/test/unit/design-review-model.test.ts
apps/storefront/test/components/secure-design-review.test.tsx
apps/storefront/test/components/secure-design-review-decisions.test.tsx
apps/storefront/test/components/secure-design-review-secrecy.test.tsx
apps/storefront/test/boundary/secure-design-review-source.test.ts
```

**Docs**

```text
docs/implementation/phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md
docs/implementation/reports/APP6-S02-COMPLETION-REPORT.md
```

Not modified: `apps/api`, the database schema and migrations, the OpenAPI artifact, the
generated client, `apps/admin`, the worker, and Figma.

**File-size governance:** largest source file 396 lines (limit 400); largest test file
576 (limit 600). No file exceeds its cap.

---

## 20. Follow-ups

**New (nonblocking):**

```text
FU-APP6-S02-WATERMARK-DRAWN-VS-DELIVERED-01
  Owner: Product Owner / APP6-X01.
  APP6-D01 §5 measures the watermark reproduction at 18° / 160 × 130 while the
  delivered APP3-S09 runtime is −30° with a percentage grid. S02 followed the
  delivered runtime. One of the two artifacts should be corrected so a future
  reader is not left choosing.
```

**Carried unchanged:**

```text
FU-APP6-S01-STEPUP-BROWSER-OBSERVATION-01     (also constrains S02 legs E and H)
FU-APP6-S01-STEPUP-CONTACT-PREFILL-01         (S02 inherits it verbatim)
FU-APP4-DEV-ENVELOPE-KEY-UNSET-01
FU-APP6-A02-LOADING-FRAME-BROWSER-OBSERVATION-01
FU-APP6-B10-AGREEMENT-ACTOR-01
FU-APP6-B08-P01-GATE-01
FU-APP6-DB01-01
FU-APP6-DB01-02
FU-APP6-B03-REQUOTE-AFTER-ACCEPTANCE-01
FU-APP6-B03-ORDER-AGGREGATE-SUITE-RED-01
FU-APP6-B01-CODE-GENERATOR-PROMOTION-01
FU-APP6-B01-APP4-POLICY-CHECKER-MIGRATION-COUNT-01
FU-APP6-B02-NULLABLE-OBJECT-TYPE-DEBT-01
```

**Closed:** none by this checkpoint.

---

## 21. Roadmap

| Checkpoint | Status | Note |
|---|---|---|
| `APP6-A01` | `COMPLETE` | Admin quotation workbench |
| `APP6-A02` | `COMPLETE` | Admin design-case workbench |
| `APP6-S01` | `COMPLETE` | Customer secure quotation |
| `APP6-S02` | `COMPLETE` | Customer secure design review |
| `APP6-E01` | `INCOMPLETE` | **Next** — focused cross-layer acceptance |
| `APP6-X01` | `INCOMPLETE` | Phase closure |

---

## 22. Acceptance criteria

All 73 criteria in §37 are met. The four that need a word rather than a tick:

- **#3** — twelve approved frames consumed; `709:84`, `709:164`, `710:203` and `713:61`
  are implemented and covered by component evidence, but could not be *observed live*
  because dev cannot complete a step-up (§15).
- **#59** — all six mutation proofs discriminate; M2 required a static pin because it
  is behaviourally undetectable by construction (§16 #3).
- **#61** — one truthful S02-only browser run completed, with its limitation stated
  rather than worked around.
- **#65** — the dev step-up observation limitation is still present and remains
  nonblocking.

---

## 23. Commit

```text
feat(app6): deliver APP6-S02 Customer secure design review screen
```

Local commit only. **Nothing was pushed.**

---

NEXT CHECKPOINT: APP6-E01 — Cross-layer acceptance
