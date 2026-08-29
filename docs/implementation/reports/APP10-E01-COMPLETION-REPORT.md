# APP10-E01 — Customer Operations Cross-Boundary Acceptance — Completion Report

## A. Verdict

```text
APP10-E01 = COMPLETE
PO_DECISION_REQUIRED = NONE
JOURNEYS = 4
CASES = 11
PASSED = 11
FAILED = 0
NEXT_CHECKPOINT = APP10-X01
```

**Two deviations from the prompt, both directed or forced, both recorded in full
in §O.** The prompt set `PRODUCT_RUNTIME_DELTA = 0`. The delivered figure is
**6 files**, for two reasons: live browser verification (directed by the operator,
overriding §10's "no browser automation") found that **the Admin and Storefront
applications were both returning HTTP 500 on every route at `HEAD`**, which is a
`BLOCKING_ACCEPTANCE_FAILURE` under §14 and had to be repaired before any
acceptance run could happen; and the operator directed a placement change to the
`APP10-I01` contact handoff during the run. Neither was discovered by, nor
discoverable by, the test suites.

---

## B. Acceptance matrix

| Case | Journey | Behavior | Boundaries | Result | Evidence |
|---|---|---|---|---|---|
| `E01-01` | J1-C1 | Exact-contact resolve → one Customer; masked detail; no enumeration | HTTP → guard → resolver → Customer module → PostgreSQL | PASS | EXECUTED_IN_E01 (+ live) |
| `E01-02` | J1-C2 | One bounded profile patch, read back from the authority | Admin screen → generated client → HTTP → PATCH → re-read → audit row | PASS | EXECUTED_IN_E01 (+ live) |
| `E01-03` | J2-C1 | Explicit survivor/loser; mandatory reason; read-only preview | HTTP → open → detail+preview → 9-category ownership snapshot | PASS | EXECUTED_IN_E01 (+ live) |
| `E01-04` | J2-C2 | Business-profile collision refuses execution, destroys nothing | HTTP → execute → policy → transaction refusal | PASS | EXECUTED_IN_E01 |
| `E01-05` | J2-C3 | Atomic merge; live ownership moves, frozen evidence does not | HTTP → one transaction → 6 tables + merge events + audit | PASS | EXECUTED_IN_E01 (+ live) |
| `E01-06` | J2-C4 | Execute replay is duplicate-safe | HTTP → execute → `ALREADY_EXECUTED` | PASS | EXECUTED_IN_E01 (+ live) |
| `E01-07` | J3-C1 | Failed notification inspectable, recipient and provider redacted | HTTP → guard → notification list → sealed envelope boundary | PASS | EXECUTED_IN_E01 |
| `E01-08` | J3-C2 | Notification replay duplicate-safe via the delivered idempotency | HTTP → replay → outbox + intent rows | PASS | EXECUTED_IN_E01 |
| `E01-09` | J4-C1 | Unauthenticated and stale-cookie denial; no destructive write | HTTP → `AuthenticatedAdminGuard` (no override) | PASS | EXECUTED_IN_E01 (+ live) |
| `E01-10` | J4-C2 | Configured Zalo/Messenger stays an external handoff; no new route | Real shell render + App Router tree on disk | PASS | EXECUTED_IN_E01 (+ live) |
| `E01-11` | J4-C3 | Missing/malformed configuration is safe | Real shell render | PASS | EXECUTED_IN_E01 (+ live) |

"(+ live)" means the case was **additionally** driven through the running Docker
stack in a real browser via Playwright, against `admin.embroidery.local` and
`embroidery.local` through the Nginx gateway, with a real `admin_sessions` row.

---

## C. Journey J1 — customer support and bounded maintenance

**`E01-01`.** `POST /api/admin/customers/resolve` answered `200` with exactly one
`customerId` for the seeded EMAIL and again for the PHONE — one identity, two
doors. An unowned contact answered `404`, indistinguishable from a malformed one,
so the operation answers *which Customer owns this* and never *does anybody own
this*. `GET /api/admin/customers` answered `404`: no list endpoint exists and none
was added.

The detail read published `b***@vidu-b07.test` and `+84 ***** 5678` and nothing
else. The whole raw body was searched for both raw values as whole strings and for
the keys `tokenhash`, `codehash`, `pepper`, `normalizedvalue`, `displayvalue` —
all absent.

**`E01-02`.** `PATCH /api/admin/customers/{id}` with `{displayName, notes}`
answered `204`; the authoritative re-read carried both. Four unsupported bodies
(`verifiedAt`, `contacts`, `mergedIntoCustomerId`, `customerId`) and the empty
patch each answered `400` — a `.strict()` refusal, not a silent drop. `verified_at`,
`merged_into_customer_id` and `anonymized_at` were unchanged afterwards. Exactly
one `customer.profile_updated` audit row exists, `actor_kind = ADMIN`, naming
`changedFields: ["displayName","notes"]` and **not** quoting the note text.

The Admin half drove the real `/support/customer-access` screen: the resolver was
called with the operator's typed value, the patch body was
`{displayName: 'Nguyễn Minh An', notes: 'Ưu tiên liên hệ buổi chiều.'}` —
byte-identical to what the API journey committed — and the screen rendered the
re-read, not its own draft (the pre-save render was asserted to still show the old
name). No list, search or directory control exists on the screen.

**Live.** The same journey ran in Chrome against the running stack. The resolved
card showed `a***@vidu-e01-live.test` / `+84 ***** 0101`; the raw address and
number appeared nowhere in `document.body.innerHTML`. The profile save produced
`Đã lưu hồ sơ khách hàng.` and the database showed
`Nguyễn Minh An | Ưu tiên liên hệ buổi chiều.` with the matching
`customer.profile_updated` audit row.

---

## D. Journey J2 — guarded merge

**`E01-03`.** Both participants were resolved by exact contact. Opening without a
reason, with a whitespace reason, and with survivor == loser each answered `400`.
The opened case was `REQUESTED`, `requestedByAdminId` from the session, `decidedAt`
absent, `survivor`/`loser` exactly as stated and not swapped.

The preview read exactly:

```text
contactPoints              2
activeSecureAccessGrants   1
customRequests             2
orders                     1
uploadedAssets             2
businessProfile            { loser: true, survivor: false, conflict: false }
```

A nine-category ownership snapshot taken before and after the open+preview was
byte-identical for both participants, and `customer_merge_events` held **0** rows:
the preview is derived on read and writes nothing. All four contact values of both
Customers were absent from the raw body, as were `tokenhash` and `companyname` —
this is the one screen showing two people's contacts at once.

**`E01-04`.** On a second, independent pair with a business profile on **both**
sides, the preview published `conflict: true` before any confirmation. `POST
…/execute` answered `409`. Afterwards: both ownership snapshots byte-identical,
`merged_into_customer_id` still null, the loser's ACTIVE grant still `ACTIVE`,
`customer_merge_events` unchanged, the case still `REQUESTED` with `decided_at`
null, and the audit trail holding only `customer.merge_case_opened` — no execution
audit for an execution that did not happen.

**`E01-05`.** Execution answered `{status: EXECUTED, outcome: EXECUTED}`.

**`E01-06`.** A second execute answered `{status: EXECUTED, outcome:
ALREADY_EXECUTED}`, and the full row sets — ownership snapshots, every merge event,
every grant, every contact, the audit rows and the frozen-evidence owner lists —
compared byte-identical to the moment before.

---

## E. Journey J3 — notification operations

APP10 delivered no notification code; `APP10-G01` recorded APP4-B08/A01 as
`ALREADY_DELIVERED`. E01 proves the capability remains viable, on the delivered
APP4-B08 harness — a real AES-GCM envelope sealed by the production intake and
real attempts driven terminal by the same `markFailed`/`markDeadLetter` the worker
calls. No status column was written directly.

**`E01-07`.** The failed intent published exactly
`attempts, channel, createdAt, intentId, recipientMasked, status, templateKey,
templateVersion` and each attempt exactly `attemptedAt, channel, errorClass,
outcome`. The recipient appeared only as `t***@vidu-b08.test`; every attempt
carried a non-empty bounded `errorClass`; the timeline was chronological and ended
`FAILED_TERMINAL`. The raw body contained neither the address nor the sealed code,
and none of fourteen envelope/transport keys (`ciphertext`, `authtag`, `"iv"`,
`payload`, `envelope`, `providermessageref`, `providerresponse`, `stack`,
`contactpointid`, `sourceoutboxeventid`, `intentkey`, `params`, `reference`,
`challengeid`).

**`E01-08`.** The first replay answered `CREATED` with a new `PENDING` intent id;
the global intent count rose by exactly one. The equivalent repeat answered
`EXISTING` with the **same** `replayIntentId` and the count did not move. The
origin remained the only `FAILED` intent, so the evidence of what went wrong
survives its own replay, and the replay's own row is masked identically.

---

## F. Journey J4 — authorization and Storefront handoff

**`E01-09`.** With no cookie and again with a cookie resolving to no session, all
seven surfaces answered `401`: resolve, detail, grants, profile patch, merge open,
merge execute, merge detail. Afterwards the Customer's `notes`, `display_name`,
`updated_at` and `merged_into_customer_id` were unchanged, the global audit count
was unchanged, and `customer_merge_cases` held zero rows — a refused open brings no
case into existence. Live, the same probe through the gateway returned `401` for
all of them and `404` for `GET /api/admin/customers`.

**`E01-10` / `E01-11`.** See §J.

---

## G. Merge integrity evidence

Post-merge facts, read from the rows (integration run):

| Fact | Value |
|---|---|
| Case status / `decided_at` | `EXECUTED` / non-null |
| Loser `merged_into_customer_id` | the survivor |
| Loser live categories | contacts 0, requests 0, orders 0, assets 0, profiles 0, ACTIVE grants 0 |
| Survivor contacts | previous + 2 |
| Survivor requests / orders / assets | the preview's 2 / 1 / 2 |
| Survivor business profiles | 1 |
| Survivor primary contacts | exactly 1 (CST-006) |
| Moved contact fields | `normalized_value`, `verified_at`, `verified_source`, `deactivated_at` all unchanged |
| Loser grant | `REVOKED` with a non-null reason |
| Frozen evidence | approval snapshots, quotation acceptances, order transitions and request transitions **all still name the loser**, and the four owner lists compare byte-identical before/after |
| Merge event step kinds | `{OWNERSHIP_TRANSFER, CONTACT_MOVE, GRANT_REVOKE, TOMBSTONE}` exactly |
| PII in merge events | none — all four contact values searched |
| Audit rows | `customer.merge_case_opened`, then `customer.merge_case_executed`, `actor_kind = ADMIN` |

The live run produced the same shape, with per-step counts visible:

```text
CONTACT_MOVE       customer_contact_points  affectedCount 2, primaryDemoted true
GRANT_REVOKE       secure_access_grants     affectedCount 0
OWNERSHIP_TRANSFER custom_requests          affectedCount 0
OWNERSHIP_TRANSFER orders                   affectedCount 0
OWNERSHIP_TRANSFER assets                   affectedCount 0
OWNERSHIP_TRANSFER business_profiles        affectedCount 0
TOMBSTONE          customers                affectedCount 1
```

7 events, 2 audit rows, survivor 4 contacts, loser 0. After the live replay:
**still** 7 events, 2 audit rows, 4 contacts, 1 case.

---

## H. Privacy / authorization evidence

Asserted absent across the relevant cases: raw e-mail; raw phone; normalized
contact value; display contact value; verification code; peppered digest / token
hash; session token; provider raw response; stack trace; envelope members
(`ciphertext`, `authtag`, `iv`, `payload`); `companyName`. Masked contacts are the
only representation published anywhere. Every fixture value is synthetic; no
`.env` value was read, written or echoed at any point, and the live Admin session
was minted per-run and **revoked at the end of the run** (verified: the revoked
cookie then answered `401`).

---

## I. Notification duplicate-safety evidence

`CREATED` → new `PENDING` intent, global count +1, origin untouched.
`EXISTING` → same `replayIntentId`, global count unchanged. Both outcomes are
distinguishable by the client, so an operator is never shown a confirmation for
work a request did not do.

---

## J. Handoff boundary evidence

**Integration.** Both CTAs carry the configured absolute URLs byte-for-byte —
asserted as an exact array equality, not a `startsWith` — with no `?`, no `#`, and
none of `@`, `token`, `customer`, `order`, `grant`, `+84` anywhere in the href.
Both carry `target="_blank"` and `rel="noopener noreferrer"`. Rendering fetched
nothing (a throwing `fetch` was installed), injected no `script`, `iframe`, `embed`
or `object`, and the group holds zero buttons, textboxes and dialogs. The App
Router tree on disk holds **12** `page.tsx` files, unchanged, and no route file
mentions `zalo`, `messenger`, `m.me` or `facebook`. An unusable value omits that
channel with no disabled stand-in; both unusable omits the whole group, leaving the
shell landmarks, the approved footer and no dead or `javascript:` href.

**Live.** With both channels configured, the two CTAs rendered at the configured
URLs with the correct rel/target, zero provider network requests were recorded, and
the footer markup contained no token, id, address or phone. With neither
configured, the served HTML contained zero `handoff-dock` occurrences and the
footer held exactly one anchor.

---

## K. Reused evidence — intentionally not rerun

| Prior evidence | Why not rerun |
|---|---|
| `APP10-B03` controlled-rollback proof | Needs fault injection; not a cross-boundary claim |
| `APP10-B03` concurrent-execute race | Same; the ordered-lock proof is B03's |
| Every `APP10-B01` contact refusal (`CONTACT_IS_PRIMARY`, `CONTACT_IS_LAST_VERIFIED`, `CONTACT_NOT_VERIFIED`, `CONTACT_NOT_ACTIVE`, `CUSTOMER_MERGED`) | One representative mutation is the E01 scope |
| Every `APP10-A01` dialog state | `customer-access-profile.test.tsx` owns them |
| Every `APP10-A02` refusal-mapping UI state | `customer-merge-*.test.tsx` own them |
| All malformed `APP10-I01` URL variants | `storefront-contact-handoff.test.tsx` keeps all eight |
| The entire historical `APP4-B08` matrix | Status filters, unknown-filter refusal, cache headers, concurrent-replay collapse, outbox rollback, eligibility refusals, 404/400 targets |
| The `APP1` auth matrix | E01 proves only that *these* routes sit behind the guard |

---

## L. Test commands

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/api exec jest --config jest.app10-e01.config.mjs` | **PASS** — 3 suites, 9 tests |
| `pnpm --filter @embroidery/admin exec jest test/acceptance` | **PASS** — 3 tests (plus the delivered APP8-E01 cases on the same path) |
| `pnpm --filter @embroidery/storefront exec jest test/acceptance` | **PASS** — 3 tests |
| `npx jest test/components/storefront-contact-handoff.test.tsx storefront-shell-footer …` (5 suites) | **PASS** — 43 tests (regression for the directed handoff change) |
| `npx jest test/components/{customer-access-*,customer-merge-*}` (Admin, 6 suites) | **PASS** — 52 tests (regression for the duplicate-key fix) |
| `npx jest test/components/custom-request-detail-*` (Admin, 3 suites) | **PASS** — 55 tests (regression for the APP5 duplicate-key fix) |
| `node tools/check-figma-design-index.mjs` | **PASS** — 491 IDs, 491 node rows, 22 tables |
| `npx tsc --noEmit` (api, admin, storefront) | **PASS** |
| `npx eslint` (changed feature and test directories) | **PASS** |
| `npx prettier --check` (every changed file) | **PASS** |
| `npx sass main.scss` (storefront + admin) | **PASS** — both compile; previously both failed |

```text
FULL_MONOREPO_TEST   = NOT_RUN
FULL_PRODUCT_E2E     = NOT_RUN
FULL_API_TEST        = NOT_RUN
FULL_ADMIN_TEST      = NOT_RUN
FULL_STOREFRONT_TEST = NOT_RUN
```

---

## M. Quality validation

Global quality mechanisms remain Prettier, ESLint and SonarQube. Everything above
is scoped evidence, not a global gate. One **inherited, unrelated** ESLint error
stands and was not fixed: `apps/admin/test/components/request-quotation-bootstrap.test.tsx:35`
— `'UNKNOWN_REQUEST_STATUS_LABEL' is defined but never used`, introduced by
`APP6-A02` (`7d031aa`), in a file this checkpoint did not touch.

---

## N. Files changed

**New — acceptance only (10):**

```text
apps/api/jest.app10-e01.config.mjs
apps/api/test/acceptance/app10-e01/j1-support-and-maintenance.acceptance.spec.ts
apps/api/test/acceptance/app10-e01/j2-guarded-merge.acceptance.spec.ts
apps/api/test/acceptance/app10-e01/j3-notification-operations.acceptance.spec.ts
apps/admin/test/acceptance/app10-e01-customer-maintenance.test.tsx
apps/storefront/test/acceptance/app10-e01-contact-handoff.acceptance.test.tsx
```

**Modified — product runtime (6):** see §O.

**Modified — tests and docs (5):**

```text
apps/storefront/test/components/storefront-contact-handoff.test.tsx   (rewritten to the directed composition)
docs/design/FIGMA_DESIGN_INDEX.md                                     (four I01 rows demoted + note)
docs/implementation/SCOPED_COMMAND_INDEX.md                           (three new ACTIVE_SCOPED rows)
docs/implementation/phases/APP10-CUSTOMER-OPERATIONS-AND-COMMUNICATION.md
docs/implementation/reports/APP10-E01-COMPLETION-REPORT.md            (this file)
```

---

## O. Baseline / scope delta

```text
PRODUCT_RUNTIME_DELTA = 6 files   (expected 0)
ENDPOINTS   = 0
MIGRATIONS  = 0
ROUTES      = 0
OPENAPI     = 0 (unchanged)
```

### O.1 Six blocking SCSS defects — both applications were down at `HEAD`

Live verification found `embroidery.local` and `admin.embroidery.local` returning
**HTTP 500 on every route**, including `/login` and `/healthz`. Sass halts at the
first error, so each app reported only one; a static sweep of every `styles.$var`
against the tokens the package defines, and every `styles.spacing(N)` against the
approved scale, found all six.

| File | Defect | Fix | Origin |
|---|---|---|---|
| `apps/admin/.../customer-merge/styles/customer-merge.scss:73` | `$color-text-link` — **never defined anywhere**; sole occurrence in the repository | → `$color-action-primary`, the `job-page__back` precedent (APP8) | **`APP10-A02` — this phase** |
| same, `:180`, `:189` | `$color-text-inverse` — never defined | → `$color-surface-primary`, the repository-wide precedent for text on a filled action button, including A01's own sibling file | **`APP10-A02` — this phase** |
| same, `:472` | `spacing(20)` — off the approved base-4 scale | → `spacing(24)` | **`APP10-A02` — this phase** |
| `apps/storefront/.../_final-payment-tokens.scss:54` | `spacing(14)` — off-scale | → `14px`, the documented-local-literal convention the file's own header prescribes | `APP9-S01` (`FU-APP10-I01-01`) |
| `apps/storefront/.../_final-payment-evidence.scss:163` | `spacing(20)` — off-scale | → `tokens.$stack-gap` (20px), already defined in that feature | `APP9-S01` |
| `apps/storefront/.../_final-payment-transfer.scss:107` | `$font-family-mono` — never defined | → new `tokens.$mono-family` in the feature's own token file, not the shared package | `APP9-S01` |

Classification: **`BLOCKING_ACCEPTANCE_FAILURE`.** §14 permits fixing an inherited
item that actually blocks the run; three of the six are this phase's own
regression, not inherited at all. No design change: the storefront fixes preserve
the approved measurements exactly.

**Why no suite caught this:** `next/jest` mocks SCSS, so component tests render
without compiling a stylesheet. The repository has no SCSS compile gate;
`tools/check-file-size.mjs` scans `.ts/.tsx/.js/.jsx/.mjs/.cjs` only. Recorded as
`FU-APP10-E01-02`.

### O.2 Duplicate React key — proven live, then fixed in three places

Executing the merge in the browser raised:

```text
Encountered two children with the same key, `EMAIL-a***@vidu-e01-live.test`.
Non-unique keys may cause children to be duplicated and/or omitted.
```

`maskContact` is deterministic and lossy, so two addresses at one domain sharing a
first character mask **identically** — and a merge survivor holds precisely that
pair, because a merge exists when two records are the same person. Three lists were
keyed on `kind + maskedValue`:

| File | Fix |
|---|---|
| `customer-access-support/components/customer-contact-panel.tsx` | → `contact.contactId`; `APP10-B01` publishes it here because it addresses two operations by it |
| `customer-merge/components/merge-participant-card.tsx` | → index; `APP10-B02` deliberately publishes no `contactId` on a merge participant, so no server identity exists |
| `custom-request-detail/components/request-customer-panel.tsx` | → index; same projection gap. **APP5, outside this phase's surface** — included because an APP10 merge is what makes it reachable |

Verified live after the fix: the survivor's card renders all four contacts,
including both identical EMAIL masks, with zero console errors.

### O.3 Directed change — `APP10-I01` handoff relocated to a floating dock

The operator reviewed the running Storefront and rejected the approved footer
placement: a customer had to scroll the whole page before the contact affordance
existed. Directed change, confirmed twice: move to a floating circular dock at the
bottom-right, and **remove the CTAs from the footer entirely** so one URL is not
published twice per page.

Delivered: `StorefrontContactHandoff` moved out of `StorefrontFooter` and rendered
by `StorefrontShell` as a sibling of `<main>`; `position: fixed`, bottom-right,
`z-index: 90` (below `$z-drawer: 100`, so an open mobile drawer's scrim covers it —
verified live); two 56px circles filled with `$color-action-primary`, stacked
`column-reverse` so Zalo sits nearest the thumb; 16px inset on mobile and 24px on
desktop with `env(safe-area-inset-*)`; the accessible name is real text inside the
link, not an `aria-label`; the channel mark is an `aria-hidden` initial, because the
design system holds no licensed provider artwork.

**Every I01 boundary is unchanged and still asserted**: configured URLs verbatim,
external navigation only, no provider SDK, no network call, malformed or missing
configuration omitting the channel. Only the placement moved.

**Design authority.** The four `FIG-APP10-I01-*` frames (`842:3`, `842:48`, `843:3`,
`843:44`) draw the footer rectangles and are now stale. They are demoted to
`REVIEW_REQUIRED` with their approval evidence cleared, keeping node and link as
the historical record, and are blocked from authorizing further work until
redrawn. The redraw could not happen here: the `figma-desktop` MCP server was
`ConnectionRefused` for the whole session. Tracked as `FU-APP10-E01-01`.

---

## P. Follow-ups

### Blocking

None.

### Non-blocking

| Id | Item | Classification |
|---|---|---|
| `FU-APP10-E01-01` | Redraw the four `FIG-APP10-I01-*` frames as the floating dock and re-approve; the rows sit at `REVIEW_REQUIRED` until then | `NONBLOCKING_INHERITED_FOLLOWUP` (new) |
| `FU-APP10-E01-02` | No SCSS compile gate exists; six fatal stylesheet defects reached `production` and took both apps down. A per-app `sass main.scss` check belongs in the scoped command index | `NONBLOCKING_INHERITED_FOLLOWUP` (new) |
| `FU-APP10-E01-03` | The merge participant card renders **no `customerId`**, and two customers' masked contacts can be byte-identical. When display names also collide — the situation that *produces* a merge case — an operator has no way to tell the two cards apart. Needs a design decision plus, probably, publishing `customerId` on `MergeParticipantResponse` | `NONBLOCKING_INHERITED_FOLLOWUP` (new) |
| `FU-APP10-I01-01` | `spacing(14)` Storefront bundle failure | **CLOSED** by §O.1 |
| `FU-APP10-A01-01` | B01 refusals carry no business `code`; five causes share one 409 | Carried forward |
| `FU-APP10-B02-03` | The declining reason has no column and is not published by the detail read | Carried forward |
| `FU-APP10-B03-01` | `tools/check-app4-b02.mjs` superseded (70 → 74 failures) | Carried forward |
| `FU-APP10-B01-02` | 3 pre-existing ESLint errors in `approve-design-version.use-case.ts` (APP6) | Carried forward |
| — | `request-quotation-bootstrap.test.tsx:35` unused-var ESLint error (APP6-A02) | Recorded, not fixed |
| — | No DB append-only trigger for `customer_merge_events` | Carried forward |
| — | No merge-event read API, no historical rejection-reason read API | Carried forward |
| — | Production Zalo/Messenger URLs not configured | Carried forward |
| — | Storefront `/favicon.ico` returns 404 | Observed live; cosmetic |
| — | Synthetic customers and one executed merge case remain in the **development** database from the live run. Not deleted: `customer_merge_events` and `audit_events` are append-only evidence tables | Recorded |

---

## Q. Exit criteria matrix

| Exit criterion | Case | Source |
|---|---|---|
| Guarded preview before execution | `E01-03` | New |
| Atomic merge | `E01-05` | New |
| Immutable merge events, one canonical sequence | `E01-05` | New |
| Frozen evidence unchanged | `E01-05` | New |
| Loser ACTIVE grants revoked | `E01-05` | New |
| Execute replay duplicate-safe | `E01-06` | New |
| Controlled rollback | — | **REUSED** — `APP10-B03` guards suite |
| Concurrent execute | — | **REUSED** — `APP10-B03` guards suite |
| Failed notification visible and redacted | `E01-07` | New |
| Notification replay safe / idempotent | `E01-08` | New |
| Masked customer projection | `E01-01`, `E01-03` | New |
| Unauthorized negative path | `E01-09` | New |
| No raw PII leakage | `E01-01`, `E01-03`, `E01-05`, `E01-07` | New |
| External links only, no provider workflow | `E01-10` | New |
| Malformed / missing config safe | `E01-11` | Partly **REUSED** — the eight malformed variants stay in the I01 suite |
| Authorized staff finds masked customer | `E01-01` | New |
| Representative maintenance across UI + API | `E01-02` | New |
| Execution evidence exists | `E01-05` | New |
| Unauthorized caller cannot access or merge | `E01-09` | New |

---

## R. Roadmap

| Checkpoint | Capability | Status |
|---|---|---|
| `APP10-G01` | Phase-entry baseline & roadmap audit | `COMPLETE` |
| `APP10-B01` | Customer profile & contact maintenance | `COMPLETE` |
| `APP10-B02` | Merge lifecycle & preview | `COMPLETE` |
| `APP10-B03` | Merge execution & immutable events | `COMPLETE` |
| `APP10-D01` | APP10 design package | `COMPLETE` / `PO APPROVED` |
| `APP10-A01` | Admin customer profile maintenance UI | `COMPLETE` |
| `APP10-A02` | Admin customer merge workflow | `COMPLETE` |
| `APP10-I01` | Zalo/Messenger simple handoff | `COMPLETE` |
| `APP10-E01` | Customer operations cross-boundary acceptance | `COMPLETE` |
| `APP10-X01` | Phase closure | **`NEXT`** |

```text
APP10-X01 = NEXT
```
