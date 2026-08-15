# APP4-A01 — Admin customer access support · Completion report

## A. Verdict

```text
PASS — delivered after a Product Owner authority unblock
```

`/support/customer-access` is delivered against the approved `APP4-D01` A01
design as amended under `FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001`, using the
existing Admin shell, the generated Axios client and handwritten TanStack hooks.

This checkpoint has two phases, both recorded here because the second only
became possible through the first:

1. **The authority block.** `APP4-A01` first stopped at three gates —
   `ADMIN_CUSTOMER_CONTEXT_SOURCE_ABSENT`,
   `ADMIN_NOTIFICATION_CUSTOMER_BINDING_ABSENT` and
   `ADMIN_REPLAY_OUTCOME_SOURCE_ABSENT` — before any Admin source existed.
2. **The Product Owner unblock.** All three were resolved by narrow contract
   extensions plus a scoped A01 design amendment, and A01 then completed
   against them.

A01 correction count remains `0`: this is an authorized unblock, not a
correction. `NO_APP4_MIGRATION` still holds — no schema, no migration.

**No full regression/test chain was run.**

---

## B. The three blocks, and the rulings that resolved them

### B.1 What was blocked, and why it was correct

| Gate | The gap |
| --- | --- |
| Customer context | The approved screen asked the operator for an email or a phone, but contained no control to enter one and no contract to resolve one. Enumerating every layer name in section `621:8` showed exactly two `Field` layers, both the revoke reason; `apps/admin/src` had no customer-bearing screen. The entry mechanism was named only in the *not-found* copy (`633:272`), and it was contact lookup — forbidden by §7 and deliberately absent from B07. |
| Notification binding | D01 presented the notification card inside the loaded Customer's screen, rendering one notification whose `Người nhận` equalled that Customer's primary mask. `AdminNotificationIntentResponse` carried no `customerId`; the only join was `recipientMasked`, which §8 forbids. |
| Replay outcome | `633:86` asserts "no second replay was created" — a created-vs-existing claim. `NotificationReplayResponse` was `replayIntentId` plus a single-valued `PENDING`, byte-identical for a first replay and a duplicate. |

### B.2 What the Product Owner ruled

- One narrow authenticated **exact verified-contact resolver**,
  `POST /api/admin/customers/resolve`, body-only.
- One optional **`customerId` filter** on the B08 list, bound through the
  persisted `recipient_contact_point_id`.
- An explicit **`CREATED` / `EXISTING`** replay outcome.
- B07 Customer detail may publish the Customer's own **`displayName`**.
- A scoped amendment to the 18 A01 Figma frames, re-approved under
  `FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001`.

### B.3 §27 feasibility, verified against source before any edit

| Condition that would have re-blocked | Verified |
| --- | --- |
| Verified-contact exact lookup inexpressible with P01/B02 | **False** — `CustomerRepository.findByVerifiedContact(kind, normalizedValue)` exists and already filters `verified_at IS NOT NULL` and `deactivated_at IS NULL`, exactly the §4 semantics |
| `recipient_contact_point_id` unjoinable to Customer | **False** — the column exists (G-DB7-48) and `customer_contact_points` was already imported by the same repository |
| Idempotent outcome unavailable at the HTTP seam | **False** — `ReplayNotificationDeliveryResult.created` was already returned by the use case and dropped by the controller's projection |

No new blocker arose.

---

## C. B07 exact-contact resolver — the delivered contract

```text
POST /api/admin/customers/resolve   → adminCustomerSupport_resolve
body: { contactKind: 'EMAIL' | 'PHONE', contact: string }   (.strict())
200:  { customerId }
404:  unknown, unverified, deactivated and malformed alike
```

**Body-only, and that is the point.** The contact never enters a path segment,
query parameter or header, so it cannot reach a gateway access log, a browser
history entry or a `Referer`. POST is the transport, not a claim that anything
is written: the operation opens no transaction and appends no audit event, since
a support read is none of the five audited grant actions (`ADR-DB3-004` r11).

**It is a lookup, not a search.** The value is normalized by `APP4-P01`'s own
`normalizeEmail`/`normalizePhone` — called, not reimplemented, so an operator and
a customer typing the same address reach the same row — then matched **whole** by
`findByVerifiedContact`, an equality lookup on the `(kind, normalized_value)`
uniqueness arbiter. No `LIKE`, no prefix, no trigram, no similarity, no result
list, no paging.

**One answer for four causes.** Unknown, unverified, deactivated and malformed
all return a 404 whose `error` object is byte-identical (proved in §G). A finer
answer would report not "why did my lookup fail" but "does this address exist",
which the phase refuses whoever asks. The malformed case is deliberately *not* a
400: a caller who learns `a@b` is malformed and `a@b.com` is merely unknown has
been told something about the second value.

**The response is one id.** Not the contact raw, normalized or *masked* —
echoing even the mask would confirm which value matched. Not the
`contactPointId`, `displayName`, contacts or `verifiedAt`; not a count, score or
hint.

Guards are APP1's, unchanged: `AuthenticatedAdminGuard`, plus `StaffOriginGuard`
and `StaffJsonBodyGuard` following the revoke route's precedent. `no-store`,
because a cached response would associate a contact with a Customer id in a
shared proxy.

---

## D. B07 `displayName`

`AdminCustomerDetailResponse` now publishes `displayName` from
`customers.display_name` alone — no Business Profile join, no fallback to a
contact, omitted rather than nulled when the Customer never supplied one. It is
authorized because it appears on every approved A01 Customer card: an operator
about to kill somebody's access has to confirm they have the right person, and a
bare UUID does not let them. Every other withheld field stays withheld.

---

## E. B08 Customer binding

```text
GET /api/admin/notification-intents?status=FAILED&customerId={uuid}
```

Binding is a persisted relationship and nothing else:

```sql
notification_intents.recipient_contact_point_id = customer_contact_points.id
AND customer_contact_points.customer_id = :customerId
```

An **inner join**, which makes the null case correct for free: an intent with no
`recipient_contact_point_id` produces no joined row and drops out. Nothing
compares `recipient_masked`, `template_key`, `channel` or `created_at` for
ownership. The global list is untouched when the filter is absent.

**A truthful limitation, reported rather than hidden.** No production path
writes `recipient_contact_point_id` today — the column exists and the replay
path copies it forward, but `APP4-B01`'s intake does not populate it. So the
Customer filter matches nothing for real notifications until intake binds it, and
the A01 card will show "no delivery failure" for every live Customer. The
Product Owner's §8 anticipated exactly this ("that limitation is deliberate and
truthful… do not retrofit historical rows or add schema"), and changing B01
intake is outside this ruling's scope. Recorded as
`FU-APP4-A01-INTENT-BINDING-COVERAGE-01`. The integration suite writes the
binding directly so the filter's behaviour on a bound row is still proved.

---

## F. B08 replay outcome

```ts
{ replayIntentId, status: 'PENDING', outcome: 'CREATED' | 'EXISTING' }
```

The controller maps the use case's own `created` boolean, total and
boolean-to-enum, so there is no third state to misread. The field was previously
dropped as an idempotency detail; A01 has two approved states differing by
exactly this fact, and the guesses available to a browser — elapsed time, a
remembered id, the `PENDING` status — are all wrong for a replay raised
concurrently by another operator. Replay lifecycle and idempotency are untouched:
the origin stays `FAILED`, the dead-letter row is unchanged, and the deterministic
key is unaltered.

---

## G. Backend evidence

| Claim | Proof |
| --- | --- |
| EMAIL and PHONE exact verified contacts resolve | `admin-customer-resolve.integration.spec.ts` |
| P01 normalization, not string comparison | `0912345678` and a whitespace-padded upper-cased email both resolve |
| Unverified, deactivated, unknown, malformed → one 404 | four `error` objects collected; `new Set(bodies).size === 1` |
| Cannot be made to search | prefix, fragment, other domain, truncated/extended/neighbouring phone all miss; `limit`, `q`, `includeUnverified`, `prefix` all 400 via `.strict()` |
| No contact echoed | body searched for raw, normalized **and masked** forms |
| Admin auth + Origin guard | 401 without cookie, 401 with dead cookie, 403 cross-origin |
| `displayName` published, Business Profile not | a `business_profiles` row is seeded on the same Customer and its company name and tax code are absent from the response |
| Bound notification returned, another Customer's withheld | `admin-notification-customer-binding.integration.spec.ts` |
| **Same mask, no binding → excluded** | two intents share `recipientMasked`; only the bound one returns |
| Null binding excluded; global list unchanged | both asserted |
| First replay `CREATED`, duplicate `EXISTING`, one row | outcome plus a `count(*)` on `source_outbox_event_id` |

Suites: 30 passed (B07 resolve + detail), 10 passed (B08 binding + outcome), 23
passed (delivered B08 replay + list, re-run because the response shape changed).

---

## H. OpenAPI and generated client

```text
paths      47 → 48   (+1, the resolver)
operations 52 → 53   (+1, exactly as predicted)
schemas          101
```

`openapi:check` and the generated-client drift check both pass; nothing was
hand-edited. Six operations and their types were added to
`packages/api-client/src/index.ts`, including three enums exported as **values**
(`ResolveCustomerByContactBodyContactKind`, `AdminNotificationIntentListStatus`,
`NotificationReplayResponseOutcome`) because the screen branches on each and a
mistyped literal is a comparison that is never true.

---

## I. Checker reconciliation — narrowed, never weakened

**B07** (`check-app4-b07-contract.mjs`): operation count 52 → 53; four canonical
routes; the blanket `@Post(` ban on the customer controller became "the only
permitted POST is `'resolve'`", so a *second* one still fails; `displayName`
joined an exhaustive field list that still refuses a second identity field;
`findByVerifiedContact` stays banned in every B07 file except the support query.
A new `checkContactResolver` proves body-only transport, P01 reuse, no
pattern/fuzzy/paged match, and a one-field response. Prohibitions on a customer
list, an email/phone query search, customer mutation, merge and grant
issue/reissue are unchanged. **59 tests pass**, 7 new.

**B08** (`check-app4-b08-contract.mjs`, `check-app4-b08-replay.mjs`): the B07
baseline moved 50 → 51 so B08's own delta stays exactly two; the query-parameter
list is exhaustively `[customerId, status]` and still refuses every
recipient/template/search name, with `customerId` required to be uuid-shaped so a
free-text filter cannot wear the name. A new `checkReplayOutcome` pins the
three-field response, the two enum values, and that the controller maps the use
case's boolean rather than reading a clock. **66 tests pass**, 4 new.

Old completion reports were not edited.

---

## J. The A01 design amendment

Only the 18 frames under `621:8` were touched. A persistent
`Tra cứu khách hàng` control (kind selector, contact input, action, exactness
hint) was added above the support cards in **all 18**, built from the file's
existing `Color/*` variables and the same 16/14/12 sizes the surrounding cards
use — no new design-system master, token or style. It tracks the content width,
so the 1280 reference gets 976 where the 1440 frames get 1136. Columns were
re-seated; nothing overflows the 740px content area (max 682) or the 96px spec
strip (max 78).

Not-found copy now describes the lookup the control performs and stops naming
the cause. The spec strips of frames carrying a notification card record that it
shows only the most recent terminal failure **explicitly bound** to the loaded
Customer; `633:3` and `633:86` record the `outcome = CREATED` / `EXISTING`
mapping. `Tên hiển thị` was already drawn and is now backed by `displayName`.

All 18 rows remain `APPROVED_FOR_IMPLEMENTATION` with unchanged node ids, now
under `FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001`. No S01, S02 or other row changed;
the remaining 30 keep `FIG-APPROVAL-APP4-D01-PO-001`.
`check-figma-design-index` passes: 213 registry IDs, 213 node rows.

---

## K. The Admin screen

Route `/support/customer-access`, a thin page over
`features/customer-access-support/` (model, services, hooks, components,
styles). The existing Admin shell, navigation, auth and session behaviour are
reused unchanged; the nav entry imports the capability's own route constant so
there is one spelling.

**Customer context.** The lookup is a mutation, not a query — a query would have
to key on the contact, which is how the value would become readable in devtools.
The draft lives in component state, goes out in a body, and is cleared the moment
an id returns. `autoComplete="off"` keeps it out of the browser's profile. A
failed lookup clears the previous Customer: answering a question about somebody
else with the person still on screen is the worst possible answer.

**Customer region.** `maskedValue` rendered exactly as it arrives — there is no
masking function anywhere in the feature, and no transform of an already-masked
value. Verified and primary are words, not colours alone. No edit, merge, verify
or primary-rotation control exists, because no operation does.

**Grant region.** `resolveGrantLiveness` reads `status` and `expiresAt`
together: a row stored `ACTIVE` past its expiry is labelled expired and its
revoke button withheld, while `status` keeps saying what the database says. No
persisted `EXPIRED` is invented. No token, hash or digest can be rendered — the
response type has no field for one.

**Revoke.** Confirmed in an `alertdialog`, reason required, trimmed and bounded,
both controls disabled in flight, no optimistic success. Success **and** conflict
both invalidate `customerAccessKeys.grants(customerId)` and nothing else.

**Notification region.** The list is narrowed server-side to `status=FAILED` and
`customerId`, so other customers' delivery records never reach this browser. The
timeline renders instant, outcome and bounded `errorClass` only.

**Replay.** Confirmed in a plain `dialog` with no field — the path id is the
whole input. `CREATED` and `EXISTING` are keyed on the server's `outcome`, never
on timing, a remembered id, the status or list length. Only
`customerAccessKeys.notifications(customerId)` is invalidated. No polling:
accepted for transport is not delivered, and `APP4-W01` owns that.
`REISSUE_REQUIRED` is its own state and a statement, not a button.
`REPLAY_NOT_APPLICABLE` and `REPLAY_SOURCE_UNAVAILABLE` get their own messages,
matched by published code — a 409 whose *message* says "REISSUE_REQUIRED" but
whose code says otherwise is read by its code, and a test proves it.

---

## L. Component and security tests

50 tests across four suites: lookup/customer (15), grant/revoke (13),
notification/replay (15), security (7). Covered: loading, loaded, masked
EMAIL/PHONE, verified/primary, absent display name, not found, load error and
retry, no grant, active grant, time-expired grant, revoked grant, revoke
confirm, blank and whitespace reason, in-flight disabling, success, conflict with
refetch, cancel, no failure, terminal failure with timeline, replay confirm,
submitting, `CREATED`, `EXISTING`, refetch scope, origin history preserved, no
polling, and all three replay refusals.

The decisive pair sends a byte-identical response differing only in `outcome`
and requires two different screens; if the duplicate were inferred from anything
else, both assertions could not pass.

Security assertions search the whole DOM, `localStorage`, `sessionStorage`, the
URL and every console level for a raw contact, code, token, digest, ciphertext
and provider body. The fixtures deliberately over-supply the screen with fields
a future contract might add (`tokenHash`, `params`, `providerResponse`,
`envelopeCiphertext`, `normalizedRecipient`) and none reaches the markup.

---

## M. Runtime / browser proof

`FU-APP4-DEV-API-IMAGE-01` is unresolved — the dev API container answers **502**
— so per §29 the journey ran in the real Admin shell against **scoped B07/B08
interception**: a scratchpad stub serving exactly the six operations plus the
staff session, with the real Next.js Admin app, real shell, real router and real
generated client. **No live cross-layer claim is made from it; `APP4-E01` owns
that.** The stub was never committed.

At **1440**:

| Fact | Observed |
| --- | --- |
| shell, nav entry, route | real Admin shell; `Hỗ trợ truy cập khách hàng` current |
| `<main>` / `<h1>` count | `1` / `1` |
| lookup → three regions | customer id, display name, both masks, live grant, terminal failure with 2 attempts |
| lookup field after resolve | `""` |
| raw contact in DOM / URL / storage | `false` / `false` / `localStorage` empty, `sessionStorage` only Next dev channels |
| revoke dialog | `alertdialog`, `aria-modal`, focus moved to the reason field |
| blank reason | `role="alert"`, `aria-invalid="true"`, **server state still `ACTIVE`** |
| revoke success | banner shown, screen reads `Đã thu hồi`, **server reads `REVOKED`**, revoke button gone, still on `/support/customer-access` |
| replay dialog | `dialog`, focus inside, **0 inputs** |
| first replay | `CREATED` banner, server `replayCalls = 1`, origin still `Thất bại kết thúc` |
| second replay | `EXISTING` banner, server `replayCalls = 2` |
| forced `REISSUE_REQUIRED` | its own state; page buttons are only `☰`, `Đăng xuất`, `Tra cứu`, `Gửi lại thông báo` — no reissue control |

At **1280** (`633:277`): `documentOverflowX: false`
(`scrollWidth === clientWidth === 1265`), zero elements past the right edge, the
timeline scrolls inside its own container, all three regions visible, and the
dialog fits both axes. `Escape` dismissed it and focus returned to the trigger.

**Application console errors on the clean pass: 0.**

**One real defect was found here and nowhere else:** the screen rendered a second
`<main>` inside the shell's, giving the document two landmarks. It is a
`<section>` now, and the component suites and checker were re-run after the fix.

---

## N. Validation ledger

Every command ran once on success; a rerun happened only where a covered file
changed afterwards.

| # | Command | Result |
| --- | --- | --- |
| 1 | `jest admin-customer-resolve + admin-customer-support` (API) | 30 passed |
| 2 | `jest admin-notification-customer-binding` (API) | 10 passed |
| 3 | `jest admin-notification-replay + admin-notification-list` (API) | 23 passed |
| 4 | `tsc --noEmit` (API) | clean |
| 5 | `openapi:generate` → `openapi:check` | 48 paths / 53 operations; up to date |
| 6 | `api-client generate` → `check:generated` | tree hash matches |
| 7 | `tsc --noEmit` (api-client) | clean |
| 8 | `jest public-api.smoke` (api-client) | 12 passed |
| 9 | `check-app4-b07-contract` + tests | pass; 59 tests |
| 10 | `check-app4-b08-contract` + tests | pass; 66 tests |
| 11 | `check-app4-b08-replay` | pass (untouched by the change) |
| 12 | `eslint` (customer + notification + logging) | clean |
| 13 | `check-figma-design-index` | 213 IDs / 213 rows |
| 14 | `jest customer-access-*` (Admin, ×4) | 50 passed |
| 15 | `tsc --noEmit` (Admin) | clean |
| 16 | `eslint` (A01 feature, route, nav, tests) | clean |
| 17 | `check-app4-a01` + tests | pass; 31 tests |
| 18 | one A01-only browser journey at 1440 and 1280 | §M |
| 19 | `prettier` (scoped) | clean |
| 20 | `check-report-secrets` | pass |
| 21 | `git diff --cached --check` | clean |

Not run, deliberately: full API Jest, full Admin Jest, Playwright, P01, worker,
DB, S01/S02, G01, historical APP4 checkers, Sonar, repo-wide chains.

**No full regression/test chain was run.**

---

## O. Report secret boundary

No real raw contact, verification code, token, digest, ciphertext, Admin session
credential or secret environment value appears here. Masked strings
(`b***@vidu.test`, `+84 ***** 4821`) are design placeholders or fixture masks and
are not reversible; `bay.nguyen@vidu.test` is a synthetic fixture that exists to
be searched for.

---

## P. Files changed

```text
apps/api/src/modules/customer/                  6 files (+1 spec)
apps/api/src/modules/notification/              6 files (+1 spec)
apps/api/src/platform/logging/log-redaction.ts
packages/api-client/src/index.ts + generated    3 files
packages/contracts/openapi/openapi.generated.json
tools/check-app4-b07/b08 (3 checkers + 2 tests)
docs/design/FIGMA_DESIGN_INDEX.md
apps/admin/src/features/customer-access-support/ 15 files
apps/admin/src/app/(protected)/support/customer-access/page.tsx
apps/admin/src/features/admin-shell/model/admin-shell-nav.ts
apps/admin/src/styles/main.scss
apps/admin/test/ (4 suites + 1 fixture)
tools/check-app4-a01.mjs + .test.mjs
```

Commits (not pushed, not amended):

```text
96a7c8d  feat(api): apply the APP4-A01 authority unblock to B07 and B08
bc259c2  design(app4): amend the A01 frames for the authority unblock
97d11a9  feat(admin): implement APP4 customer access support
```

---

## Q. Follow-ups

**Raised here:**

- `FU-APP4-A01-INTENT-BINDING-COVERAGE-01` — no production path writes
  `recipient_contact_point_id`, so the Customer notification filter matches
  nothing for real notifications until `APP4-B01` intake binds it. The screen is
  correct and truthful today; it will simply show "no delivery failure".

**Carried forward unchanged** (§31), not broadened:

- `FU-APP4-B02-GATE-SCOPE-01` — B02 stale checker; **not** repaired here.
- `FU-APP4-DEV-API-IMAGE-01` — dev API image 502; **not** repaired here, and the
  reason the browser journey used scoped interception.
- `FU-ADMIN-SHARED-DIALOG-01` — this is now the **fifth** hand-rolled Admin
  dialog. Still unowned, and still the right place to resolve all five at once.
- S01 follow-ups; S02 live-journey and live-region follow-ups; the B08
  worker-journey follow-up — all E01-owned live-journey items, undeduplicated
  because A01 produced no live journey to merge them against.

---

## R. Status and next checkpoint

```text
APP4-A01 = COMPLETE
APP4-E01 = READY — NOT STARTED
```

`APP4-E01` owns the complete API + worker + both-frontends journey, including the
live B07/B08 lifecycle this checkpoint deliberately did not claim. It was not
started, and neither were `APP4-X01` or `APP5`–`APP7`.
