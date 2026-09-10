# APP12-E01 — Completion Report

## A. Verdict

```text
APP12-E01 = CORRECTION_REQUIRED
APP12-R01 = NOT_AUTHORIZED
NEXT      = PO_REVIEW_REQUIRED

WAVE1_RUNTIME_REGRESSION            = PASS_WITH_ONE_BLOCKER
READY_MADE_RUNTIME_BLOCKERS_OWNED_BY_E01 = 1

E01_CORRECTION_USED = 0/1
PRODUCTION_DEPLOYED = false
PUSHED              = false
ROADMAP_CHECKPOINTS = 41
```

Every routed follow-up in §3 is closed, and the whole negative/recovery matrix
passes. One blocker was **found by this regression** and is the reason the
verdict is not `COMPLETE`:

> **`FU-APP12-E01-01` — an `ORDER_ACCESS` link does not survive the SMTP
> transport.** `SmtpNotificationChannelAdapter` has a single render path,
> `renderVerificationEmail`, and no `secretKind` branch. A `SECURE_LINK_TOKEN`
> delivery is therefore sent as **“Mã xác thực email”**, with the 43-character
> bearer grant token printed in the position of a six-digit code, its 72-hour
> window rendered as “4320 phút”, and **no link anywhere in the message**.
> Measured on the wire (§R). Over the only production-capable transport, a
> Ready-Made customer cannot reach their own order.

This is not proposed for in-checkpoint repair. The fix is a new customer-facing
Vietnamese message, and message copy is product and design authority, not an
engineering invention at the final regression gate (§23 forbids material
redesign here). §25 routes a newly discovered material defect to a correction,
which is a separate authorized step.

## B. U01 / N01 / N02 reconciliation

The Product Owner's §0 acceptance is carried forward and **not re-litigated**.
No Human-PO action was requested by this checkpoint and no OTP was asked for.

```text
APP12-N01 = COMPLETE — PO CLOSED        carried
APP12-N02 = COMPLETE — PO CLOSED        carried
APP12-U01 = COMPLETE_AFTER_C1 — PO PASS carried
F1 F2 F3 F4 = PASS                      carried, and re-guarded (§V)
REAL_BANK_TRANSFER_SUBMITTED   = false  unchanged by this checkpoint
REAL_PAYMENT_SUBMITTED         = false  unchanged
PHONE_SMS_VERIFICATION_PRESENT = false  re-measured, still false (§F)
```

`U01-C1`'s continuation work was committed at the head of this checkpoint
(`fix(app12): the four things the live UAT saw that the money was not`).

## C. Entry baseline

Measured at entry and again at exit. Nothing drifted.

| Fact | Entry | Exit |
|---|---|---|
| OpenAPI paths | 129 | 129 |
| OpenAPI operations | 143 | 143 |
| OpenAPI schemas | 284 | 284 |
| migrations | 39 | 39 |
| Admin routes | 26 | 26 |
| Storefront routes | 20 | 20 |
| migration 0040 | absent | absent |

The §3.8 correction changed nine **property metadata** entries inside two
existing schemas. It added no schema, no operation and no path, which is why
the three counts are unchanged while the artifact diff is non-empty.

## D. Routed follow-up preflight

Each was verified as still open **before** being worked, rather than assumed
from the report that filed it.

| Follow-up | Preflight finding |
|---|---|
| `FU-APP12-H07-02` | Open. `staging-scaffolding/postgres.yaml` probed `-d embroidery` while `POSTGRES_DB` is `embroidery_db7_h02_staging`. |
| `FU-APP12-H07-03` | Open, and reproduced at the process boundary (§Q). |
| `FU-APP12-H07-05` | Superseded by N01 as stated; the adapter half re-proved in §R. |
| `FU-APP12-H08-04` | Open. `startEnvironment` ran `next start` against whatever `.next` was on disk. |
| `FU-APP12-H08-06` | Open. No dedicated `PAYMENT_UNDER_REVIEW` scan existed. |
| `FU-APP12-H02-01` | Open, and **worse than filed** — see §R. |
| `FU-APP12-H02-03` | Open. `/mua-hang/[slug]` absent from the H02 Chromium CSP pass. |
| `FU-APP12-B03-01` | Open, and broader than filed: **nine** untyped nullable scalars in that file, not four. Confirmed by reading the committed artifact. |
| `FU-APP12-G03-01` | Open. Gate red on two rows; cause confirmed as unfollowed supersession. |

## E. E01 topology and fresh-build authority

```text
real PostgreSQL (disposable)   real MinIO        real API
real worker                    real Admin        real Storefront
real Nginx gateway             real generated client
real Chromium                  SMTP transport (commerce project)
```

**Fresh-build authority is now mechanical (§3.4).** `startEnvironment` builds
Admin and Storefront before it starts them
(`support/orchestration/next-build.mjs`), and returns each `BUILD_ID`. The
browser tier then asks the *server* which build it loaded, by requesting
`/_next/static/<BUILD_ID>/_ssgManifest.js` and requiring 200, with a bogus id
required to 404 as the control. The App Router publishes no `__NEXT_DATA__`, so
the identifier is deliberately not read out of the document.

This closes the hazard that cost `APP12-H08` two runs and was re-confirmed by
`APP12-N02-A01`: a run could pass against source nobody had compiled, and report
success.

## F. Positive lifecycle (§7)

`CMD-TEST-APP12-E01-API` journey **J1**, on one composed application.

```text
PUBLISHED Product → checkout → EMAIL verification → READY_MADE order
→ AWAITING_SHIPPING_FEE → fee → AWAITING_PAYMENT → FULL initiate
→ Admin verification → READY_FOR_DELIVERY → dispatch → DELIVERED
→ complete → COMPLETED
```

The exactly-once truth table, asserted as one settled fact after the walk rather
than step by step — a defect that created a second reservation and consumed the
first passes every step-wise assertion on the way past:

| Required | Observed |
|---|---|
| orders | 1 |
| order_items | 1 |
| FULL obligation, terminal satisfied | 1, `SATISFIED`, `450000.00` |
| successful payment | 1 attempt, 1 reconciliation |
| reservations | 1 |
| consumed | 1 |
| inventory decrement | exactly once (`CONSUMED −2`, no `RESERVATION_RELEASED`, no `RESERVATION_EXPIRED`) |
| shipping snapshots | 1 |
| DELIVERED transition | 1 |
| COMPLETED transition | 1 |
| CUSTOM chain | 0 production jobs, 0 DEPOSIT, 0 REMAINING |
| payment provider events | 0 |

Transitions walked: `AWAITING_PAYMENT → READY_FOR_DELIVERY → DELIVERED →
COMPLETED`, each exactly once. No real bank transfer occurred and none could:
Admin verification is the whole payment authority in Wave 1.

`PHONE_SMS_VERIFICATION_PRESENT = false` re-measured in J3: every
`contact_verification_challenges` row for the journey's customer is `EMAIL`.

## G. Authorization denial (§8)

| Required | Result |
|---|---|
| anonymous Admin denied | 401 on the order list, the order detail and `payment-attempts/{id}/verify` |
| customer capability cannot invoke Admin operations | an `ORDER_ACCESS` token presented as a session authenticates nothing (401) |
| `ORDER_ACCESS` cannot read another order | the token names its own order server-side; the body carries no order id to tamper with |
| `ORDER_ACCESS` cannot escape its scope | the neighbour order remains readable only by its own token |
| malformed / unknown / revoked → safe indistinguishable state | one refusal for three causes (§M) |
| private payment evidence not publicly readable | the deposit-evidence surface refuses a live Ready-Made credential and echoes nothing |
| Wave-2 withheld operations remain withheld | release flag `false` throughout; `CMD-E2E-APP12-H01-WAVE2` unchanged and not re-run |

The matrix runs against the order J1 has just completed, so every denial is
measured against something real.

## H. Duplicate order submit (§9)

Two concurrent submissions under one idempotency key, then a third replay after
both settled — the double-clicked button and the retried request, which are
different shapes in production.

```text
statuses            201 / {201|409} / {201|409}, never a uniqueness error
orders              1
order_items         1
inventory_reservations 1
shipping_details    1
reserved quantity   1  (the quantity of one submission, not three)
```

## I. Duplicate FULL initiation (§10)

A second and third initiation, concurrent, under **different** idempotency keys
— the shape a customer produces with two tabs, where the key cannot be what
saves it.

```text
live FULL obligations   1, at the exact payable total
reservations            1, still RESERVED
order status            AWAITING_PAYMENT (unmoved)
first attempt           still PENDING and still the one the operator will verify
```

## J. Duplicate payment verification (§11)

```text
second verification    deterministic (replay of committed truth)
reservation            CONSUMED, exactly one row
stock                  decremented exactly once
READY_FOR_DELIVERY     recorded once; no duplicate transition anywhere
payments               1 attempt, 1 reconciliation
```

## K. Shipping-fee correction (§12)

**Before satisfaction** — the correction supersedes rather than edits:

```text
supersededObligationId == the first write's fullObligationId
live obligations        1, at the corrected total
frozen line subtotal    unmoved (recomposed from the lines, never adjusted,
                        so two corrections cannot compound)
order total             subtotal + new fee, exactly
AWAITING_PAYMENT        entered once across both writes
payment window          reset once by the first confirmation; the correction
                        does not extend it again
```

**After satisfaction** — the edit is refused, and the refusal changes nothing:
the total, the satisfied obligation and its amount are all exactly as they were.
Money a customer has already paid does not become editable by being asked twice.

## L. PAYMENT_UNDER_REVIEW and step-up (§13)

API side (J3), on a mis-keyed operator reconciliation:

```text
attempt      REQUIRES_REVIEW
order        AWAITING_PAYMENT (unmoved)
duplicates   0 orders, 0 extra reservations
stock        untouched — 0 CONSUMED ledger entries
customer     still holds a payable order, not a dead end
operator     the review route exists and is behind the operator guard (401 anon)
step-up      EMAIL only; no PHONE challenge exists on the customer
```

Browser side is §W.

## M. Expired verification and access (§14)

Each cause covered separately, as required:

```text
expired verification challenge   refused at checkout; nothing reserved on the
                                 way to refusing
expired ORDER_ACCESS grant  ┐
revoked ORDER_ACCESS grant  ├─ one identical refusal for all three
never-existed token         ┘   (a status that varied by cause would be an oracle)
missing token / fragment        cause-neutral: the body names no expiry and no
                                revocation
live grant                      still works — the negatives are about those
                                grants, not about a broken resolver
disclosure                      no order id of any order appears in any refusal
```

## N. Stock race (§16)

Available stock 1, two concurrent submissions carrying **different verified
challenges** — two genuinely separate purchases, so only the stock anchor can
arbitrate. (One challenge is single-use, so two submissions carrying it are one
idempotent submission, which is §9's case and not this one.)

```text
winners                 1 (201)
losers                  1 (422 INSUFFICIENT_STOCK — named exactly, because
                        "some 4xx" would also accept a validation failure that
                        never reached the anchor)
stock                   on hand 1, reserved 1, available 0 — never negative
reservations            1, no phantom second
orders                  1, no orphan behind the refusal
public availability     settles sold out; the loser priced no obligation
```

## O. Reservation expiry (§15)

The real sweep, as the built worker in its own process. Nothing in the suite
cancels, releases or writes a ledger entry.

```text
reservation             EXPIRED, one row
inventory release       exactly one RESERVATION_EXPIRED entry; stock whole again
order                   CANCELLED in the same settlement
replayed pass           expired: 0 — no double release
stale payment           refused against released inventory; stock unchanged
hold                    initial → reset once by the first fee → a later
                        correction does not extend it
```

## P. Worker retry / reclaim (§17)

Revalidated from the delivered suites rather than re-implemented:

```text
persistence job-queue claim/lease/reclaim    19 passed
worker runtime integration                   10 passed
```

Covers retryable failure, lease expiry and reclaim, completed replay,
notification retry and reservation-expiry retry, with no duplicate business
effect.

## Q. Worker bootstrap-failure proof (§18, §3.2) — CLOSED

`FU-APP12-H07-03` (**HIGH**) is closed with a runtime correction and a
process-level proof measured in **both** directions.

**The defect.** `NestFactory.createApplicationContext` runs every
`onApplicationBootstrap` hook, three of which start self-rearming work: the job
poll loop, the APP5 intake-cleanup sweep and the Ready-Made reservation-expiry
sweep. A throw *after* that point logged one line and set `process.exitCode = 1`
— which nothing ever read, because those timers hold the event loop open. The
pod stayed `Running 1/1`, `0` restarts, no failing probe and **no metrics
listener bound**, so the two gauges any worker diagnosis starts from were absent
in exactly the state that needed them.

**The correction.** `apps/worker/src/main.ts` now wraps every fallible start step
in one guarded region whose failure path names the error, attempts a bounded
close (5 s, mirroring `FATAL_EXIT_SAFETY_MS`'s reasoning), and then calls
`process.exit(1)`. The exit is deliberate rather than a convenience: when the
throw comes out of the factory itself there is no context handle to close, so
the started timers are unreachable from `main` and the process boundary is the
only mechanism that can stop them.

**The proof.** `CMD-TEST-APP12-E01-WORKER-BOOTSTRAP` spawns the built
`dist/main.js` as its own OS process against a disposable PostgreSQL, with
`METRICS_PORT=0` — a real operator mistake, rejected by `resolveMetricsPort`
*before* `bootstrapMetricsListener` opens its own `try`, which places it exactly
in the window after every bootstrap hook and before readiness is reported.

```text
pre-fix build   killed = true   (SIGKILL at the 30 s budget — still polling)
fixed build     killed = false, signal = null, code = 1, ~200 ms
                half-started window genuinely reached (both sweeps logged start)
                readiness never reported; no metrics listener bound
4 cases passed
```

The invariant §3.2 requires — *bootstrap failure before readiness → the process
exits deterministically* — holds, in its preferred form.

## R. SMTP and origin composition (§3.1, §3.7) — the blocker

**§3.1 is proved.** The E01 commerce world starts a disposable SMTP capture
listener *before* composing the worker, and the resolved adapter is read out of
the composed DI graph rather than from the environment — the guard
`APP12-N01.S01` learned to need after two runs in which the environment said
`SMTP` and a stale `dist` had bound the recording adapter.

```text
resolvedChannelAdapterName() = SmtpNotificationChannelAdapter    PASS
smtpTransportIsLive()        = true                              PASS
FU-APP12-H07-05 = CLOSED_SUPERSEDED_BY_APP12_N01, adapter re-proved here
```

**§3.7 fails, and the cause is a Wave-1 runtime blocker.**

`FU-APP12-H02-01` asked whether the delivered `ORDER_ACCESS` link uses the
configured `STOREFRONT_PUBLIC_ORIGIN`. The question could not be reached,
because there is no link in the message. Every browser run before this one read
the link back from the **recording adapter** — the same component that composed
it — so the composition could only ever agree with itself.

The evidence is the wire, captured over a real SMTP session by
`CMD-TEST-APP12-E01-SMTP-SECURE-LINK`. Sending a `SECURE_LINK_TOKEN` delivery
(`secretKind = SECURE_LINK_TOKEN`, `secureLinkUrl` composed and present on the
port) produces:

```text
Subject/heading   Mã xác thực email
Body              “Mã xác thực của bạn là:”
                  Ab3dEf6hIj9lMn2pQr5tUv8xYz1cDe4gHi7kLm0nOp3     ← the grant token
                  “… sẽ hết hạn sau 4320 phút …”                   ← the 72-hour window
Link              absent
```

Three consequences, in order of severity:

1. **The customer cannot reach their order.** `/truy-cap/don-hang` is only
   reachable from the link, and no link is sent.
2. **A bearer credential is presented as an OTP.** The customer is shown a
   43-character `ORDER_ACCESS` grant, told it is their verification code, and
   invited to type it into a field that will never accept it.
3. **The expiry statement is wrong for the artifact it describes** — a grant
   window rendered in the vocabulary of a code.

Root cause, read in the source: `SmtpNotificationChannelAdapter.send` has one
render path, `renderVerificationEmail(delivery.secret, …)`, and no `secretKind`
branch. `APP12-N01`'s scope was the verification code and it delivered exactly
that; the `SECURE_LINK_TOKEN` half was never carried across to the production
transport, and no suite before this one sent one over it.

Filed as **`FU-APP12-E01-01`**, severity **BLOCKING**, owner `APP12-E01-C1`.

`ORDER_ACCESS` origin composition therefore stays **open**:

```text
FU-APP12-H02-01 = BLOCKING — superseded in substance by FU-APP12-E01-01
```

## S. Evidence and storage boundary (§19)

Bounded, as instructed — the H04 storage experiments are not repeated.

```text
ready-made-full-payment-evidence   4 passed
```

Optional evidence upload, private Admin read and the safe application-owned
error path are unchanged from `APP12-B06`/`APP12-H04`.

## T. CSP and security headers (§20, §3.6) — CLOSED

Real Chromium, production-like policy, listener installed through an init script
so a violation caused by hydration itself is caught rather than missed.

| Surface | Executable-inline violations |
|---|---|
| `/san-pham/[slug]` | 0 |
| `/mua-hang/[slug]` (purchasable SKU) | **0** |
| `/truy-cap/don-hang` | 0 |

Run proofs, verbatim:

    [app12-e01-public] {"csp:product-detail":0,"csp:checkout":0,
                        "csp:secure-order-entry":0,"offerCurrency":"VND",
                        "missingProductStatus":404,"ambiguousCheckoutStatus":200}

The policy is asserted positively — `default-src 'self'`, `object-src 'none'`,
`base-uri 'self'`, `frame-ancestors 'self'`, and **no** `script-src
'unsafe-inline'` — so a future relaxation fails here rather than passing
silently. CSP was not weakened to make any page work.

Also proved: no public response names its framework (`x-powered-by` absent) or
its server version; `nosniff` and `strict-origin-when-cross-origin` on every
surface; and both private surfaces remain `noindex`. Admin `/orders` cookie and
header semantics are `APP12-H01`'s and are unchanged — not re-run.

`FU-APP12-H02-03 = CLOSED`.

## U. SEO and public truth (§21)

```text
in-stock Product      200; Product/Offer structured data in VND, availability
                      InStock, and the page really does render a buying control
                      that agrees with it (not the sold-out presentation)
nonexistent Product   real 404 at the transport, not a soft one
ambiguous variant     checkout reachable (200) and offering nothing to act on —
                      the structurally malformed historical shape has no buyable
                      control
```

The full offer matrix — `AggregateOffer`, single `Offer`, no offer, `noindex`,
`DRAFT`, `ARCHIVED`, the ambiguous exclusion — is `APP12-H06`'s, against its own
seven-Product fixture. It is E01 evidence by being run from its own command, not
by being copied here.

## V. U01 F1–F4 regression (§22)

**F1 (Admin goods subtotal).** The contract half is guarded in J1: the Admin
order read publishes a frozen line subtotal (`420000.00`) that is **not** the
order total (`450000.00`) once a fee exists, so the card has a frozen goods
figure to display and no client arithmetic is needed. The component half stays
in `apps/admin/test/components/order-ready-made-branch.test.tsx`.

**F1 (no compounding).** J2 proves the frozen line total does not move across a
fee correction, and that the new total is recomposed from the lines rather than
adjusted from the previous total.

**F2 (settled-total truth).** The customer projection reports the same frozen
subtotal the operator sees, in `COMPLETED`. The three terminal-state screen
assertions remain `APP12-S03`'s lifecycle suite's and are unchanged.

**F3 (no false payment link).** No delivered operation sends a payment link on a
fee correction, and E01 adds no notification. The Admin copy assertion stays in
its component suite.

**F4 (cause-neutral unavailable copy).** J3 proves the server half: a missing
token yields a refusal whose body names neither expiry nor revocation.

```text
F1 = PASS   F2 = PASS   F3 = PASS   F4 = PASS
```

## W. PAYMENT_UNDER_REVIEW accessibility (§3.5)

Run on the recording topology in its own project, deliberately: the state is
reached through the delivered `ORDER_ACCESS` link, and §R found that no link
survives the SMTP transport. Scanning it from that world would report a delivery
defect as an accessibility gap.

```text
state reached   through delivered operations only — real checkout, real
                operator fee confirmation, real attempt opened from the
                customer's own screen
copy            truthful; the transfer instructions stay on screen and the page
                claims no payment it has not received
actions         exactly one payment action; no second control to transfer twice
step-up         demanded and completed with the delivered code (GRD-003), so
                the attempt opened through the real gate rather than around it
axe 390         serious/critical = 0
axe 1440        serious/critical = 0
overflow        0 horizontal document overflow at both

Run proofs, verbatim:

    [app12-e01-review] {"e01-reviewStepUp":true,"e01-reviewOrder":"ORD-P5KRWYSYZJ",
                        "e01-reviewDuplicateActions":0,
                        "e01-axe:payment-under-review-390":0,
                        "e01-axe:payment-under-review-1440":0}
```

`FU-APP12-H08-06 = CLOSED`.

## X. Product Detail design-authority gate (§3.9) — CLOSED

The gate had been **red since `APP12-M01.D1`**, which is worse than useless: a
permanently failing gate is one nobody reads. It demanded
`APPROVED_FOR_IMPLEMENTATION` on all ten reconciled roots, and two of them —
the Product Detail lightbox pair — had correctly become `SUPERSEDED` when
authority moved to `FIG-APP12-M01-D1-SF-LIGHTBOX`.

The gate now **follows** supersession rather than ignoring or forgiving it. A
`SUPERSEDED` root is accepted only when the registry names a successor, that
successor is recorded as current, is itself `APPROVED_FOR_IMPLEMENTATION`, and
belongs to the same route. Five new regressions prove that a root which is
merely unapproved, superseded by nothing, superseded by something unapproved, or
superseded onto another screen all still fail.

```text
node tools/check-storefront-product-detail-authority.mjs   PASS
node --test tools/check-storefront-product-detail-authority.test.mjs   39 passed
PRODUCT_DETAIL_AUTHORITY_GATE = PASS
FU-APP12-G03-01 = CLOSED
```

The registry half was split into
`tools/check-storefront-product-detail-authority.registry.mjs`, because the
addition would otherwise have carried the gate from 398 to 444 lines and past
the hard limit (§24).

## Y. U01 Figma-copy reconciliation (§3.10)

**Not performed, and not lost.** The `figma-desktop` MCP server refused
connection for the whole of this session (`ConnectionRefused`), so no live frame
could be opened and no current-authority copy could be compared. The prompt's
own instruction for that case applies:

```text
U01_FIGMA_COPY = PRE_R01_DESIGN_RECONCILIATION_REQUIRED
```

`FIG-APPROVAL-APP12-E01-U01-COPY-PO-001` is therefore **unused**; no Figma node
was created, modified or superseded, and `FIGMA_DESIGN_INDEX.md` is byte-identical.

This is a non-runtime prerequisite for `APP12-R01`. It blocks nothing in this
checkpoint and must not be dropped.

## Z. B03 DTO metadata disposition (§3.8) — CLOSED

Still open at preflight, and **broader than filed**: the follow-up named four
nullable string fields on `AdminShippingFeeOutcomeResponse`; the committed
artifact carried nine untyped nullable scalars across the two DTOs in that one
file — three on the outcome and six on `AdminShippingDetailResponse`, including
the frozen shipping fee and the frozen-at stamp that E01's own §K regression
reads.

All nine now state `type: 'string'`. They are stated rather than reflected
because each property's TypeScript type is a union, which gives the metadata
reader no scalar to infer.

```text
before   remainingAmount / remainingObligationId / supersededObligationId
         carrierName / district / feeAmount / frozenAt / trackingCode / ward
           → "type": "object", nullable
after    → "type": "string",  nullable

generated client   { [key: string]: unknown } | null  →  string | null
paths 129 · operations 143 · schemas 284   unchanged
```

`pnpm --filter @embroidery/api openapi:check` and
`pnpm --filter @embroidery/api-client check:generated` both green; API, worker,
Admin, Storefront and api-client typechecks all clean, so no consumer was
relying on the wrong shape.

**Disclosed scope widening.** §3.8 named one DTO. The sibling in the same file,
in the same response body of the same Ready-Made operation, carried the
identical defect class; fixing one and leaving the other would have left the
regression's own §K evidence reading an `object` where a money string lives. The
remaining **eleven** schemas elsewhere in the document with the same pattern
(some of them nullable object refs that lost their `$ref`, which is a different
defect) are **not** touched and are filed as `FU-APP12-E01-02`, non-blocking.

## AA. Files changed

**Runtime**

```text
apps/worker/src/main.ts                                       §3.2 correction
apps/api/src/modules/order/presentation/schemas/
  admin-order-shipping.response.ts                            §3.8 metadata
packages/contracts/openapi/openapi.generated.json             regenerated
packages/api-client/src/generated/embroidery-api.schemas.ts   regenerated
```

**Infrastructure**

```text
infrastructure/kubernetes/staging-scaffolding/postgres.yaml   §3.3
```

**Tooling and gates**

```text
tools/check-storefront-product-detail-authority.mjs           §3.9
tools/check-storefront-product-detail-authority.registry.mjs  new (§24 split)
tools/check-storefront-product-detail-authority.test.mjs      +5 regressions
```

**Harness**

```text
packages/e2e-testing/support/orchestration/next-build.mjs     new (§3.4)
packages/e2e-testing/support/orchestration/environment.mjs    builds before start
packages/e2e-testing/support/orchestration/run-modes.mjs      new (§24 split)
packages/e2e-testing/scripts/run-e2e.mjs                      −139 lines, +E01 mode
packages/e2e-testing/playwright.projects.e01.ts               new (§24 split)
packages/e2e-testing/playwright.config.ts                     spreads the E01 projects
packages/e2e-testing/package.json                             e2e:app12:e01[:headed]
apps/api/test/support/worker-expiry-process.ts                harness fix (§AC)
```

**Tests**

```text
apps/api/jest.app12-e01.config.mjs                                    new
apps/api/test/acceptance/app12-e01/app12-e01-context.ts               new
apps/api/test/acceptance/app12-e01/j1-lifecycle-and-authorization…    new
apps/api/test/acceptance/app12-e01/j2-duplicates-and-fee…             new
apps/api/test/acceptance/app12-e01/j3-expiry-race-and-review…         new
apps/worker/test/process/worker-bootstrap-abort.process.spec.ts       new
apps/worker/src/jobs/notification-delivery/infrastructure/channel/
  smtp-secure-link.spec.ts                                            new (red)
packages/e2e-testing/specs/app12/e01-commerce.acceptance.spec.ts      new (red)
packages/e2e-testing/specs/app12/e01-review.acceptance.spec.ts        new
packages/e2e-testing/specs/app12/e01-public.acceptance.spec.ts        new
packages/e2e-testing/specs/app12/support/e01-world.ts                 new
packages/e2e-testing/support/app12/e01-secure-link.mjs                new
```

**Documentation**

```text
docs/implementation/SCOPED_COMMAND_INDEX.md            +4 rows, 1 amended
docs/implementation/phases/APP12-HARDENING-…           status
docs/implementation/reports/APP12-E01-COMPLETION-REPORT.md   this file
```

No migration. No `.env` write. No credential rotated, echoed, logged or passed
as an argument. Every credential in every new file is synthetic and minted per
run.

## AB. File size

Every file this checkpoint owns is inside `CLAUDE.md` §6.

```text
node tools/check-file-size.mjs --paths <the 20 files E01 touches or created>
→ passed, 0 over limit
```

Two pre-existing over-limit harness files were touched, and §24 was honoured by
splitting rather than growing:

| File | Before | After |
|---|---|---|
| `scripts/run-e2e.mjs` | 1329 | **1190** (−139, while gaining a mode) |
| `playwright.config.ts` | 601 | 606 |
| `check-storefront-product-detail-authority.mjs` | 398 | **367** |

**Disclosed:** `playwright.config.ts` grew by 5 lines. Its three E01 projects
live in their own module (`playwright.projects.e01.ts`, following the existing
`playwright.projects.v01.ts` precedent); the residue is one import and a
two-line spread with its reason. The file was already 201 lines over the hard
limit before this checkpoint and is not a file E01 can bring under it.

## AC. Validation

Every command below was run and its result is stated. Selected from
`VALIDATION_GOVERNANCE.md` §3; no repository-wide aggregate was used.

| What | Command | Result |
|---|---|---|
| whitespace | `git diff --check` | clean |
| API typecheck | `pnpm --filter @embroidery/api typecheck` | pass |
| worker typecheck | `pnpm --filter @embroidery/worker typecheck` | pass |
| Admin typecheck | `pnpm --filter @embroidery/admin typecheck` | pass |
| Storefront typecheck | `pnpm --filter @embroidery/storefront typecheck` | pass |
| api-client typecheck | `pnpm --filter @embroidery/api-client typecheck` | pass |
| e2e typecheck | `pnpm --filter @embroidery/e2e-testing exec tsc --noEmit` | pass |
| e2e lint | `pnpm --filter @embroidery/e2e-testing exec eslint …` | clean |
| OpenAPI generate | `CMD-OPENAPI-GENERATE` | 129/143/284 |
| OpenAPI drift | `CMD-OPENAPI-CHECK` | up to date |
| client generate | `CMD-API-CLIENT-GENERATE` | 2 files |
| client drift | `CMD-API-CLIENT-CHECK` | up to date |
| E01 API regression | `CMD-TEST-APP12-E01-API` | **55 passed** |
| worker bootstrap proof | `CMD-TEST-APP12-E01-WORKER-BOOTSTRAP` | **4 passed** |
| SMTP secure link | `CMD-TEST-APP12-E01-SMTP-SECURE-LINK` | **1 passed, 2 failed — the blocker** |
| Ready-Made focused suites | `jest --testPathPatterns="ready-made-(commerce-journey\|order-concurrency\|full-verification\|shipping-fee-concurrency\|full-payment-races\|verification-race\|expiry-race)"` | 7 suites, **51 passed** |
| evidence boundary | `jest --testPathPatterns=ready-made-full-payment-evidence` | 4 passed |
| job queue / reclaim | `CMD-TEST-WORKER-RUNTIME-INTEGRATION` | 19 + 10 passed |
| Product Detail authority | `CMD-CHECK-STOREFRONT-PRODUCT-DETAIL-AUTHORITY` | **pass** |
| its regressions | `node --test tools/check-storefront-product-detail-authority.test.mjs` | 39 passed |
| i18n static text | `CMD-CHECK-I18N-STATIC-TEXT` | pass |
| i18n message keys | `CMD-CHECK-I18N-MESSAGE-KEYS` | pass |
| e2e boundary | `node tools/check-e2e-boundaries.mjs` | clean |
| release config (staging) | `node tools/check-release-config.mjs staging` | fails on external R01 inputs only (§AG) |
| file size (scoped) | `CMD-CHECK-FILE-SIZE-SCOPED` | pass |
| format | `prettier --check` on every changed file | clean |
| report secrets | `CMD-CHECK-REPORT-SECRETS` | see below |
| browser regression | `CMD-E2E-APP12-E01` | **11 passed, 1 failed (the blocker), 3 did not run** |

No Wave-2 regression was run.

**Harness fix, disclosed (§25).** Every API suite that spawns the built worker
had been red since `APP12-N01.B01` made `NOTIFICATION_TRANSPORT` mandatory:
nothing on the API side ever stated it, so the child died before printing
`READY` and the parent reported only *“the expiry child said nothing within
120000ms”*. `ready-made-expiry-race` was 13 failures and 126 s of timeouts.
`apps/api/test/support/worker-expiry-process.ts` now states `RECORDING` for the
child it spawns — the honest answer for a sweep that sends nothing — and the
suite is 13/13 in 6 s. This weakens no assertion and changes no product
behaviour; it makes execution faithful, which is exactly what §25 permits fixing
in place.

## AD. Shared-dev integrity

```text
shared_dev_mutations        0
G03 persistent catalog      unchanged
shared commercial counts    unchanged
```

Every commercial write in this checkpoint landed in a disposable database that
the harness created and dropped. No suite opened the shared development
database; the API acceptance context asserts the disposable name before it
proceeds, and the browser fixtures refuse any database not named
`embroidery_db7_*`.

## AE. Disposable teardown

```text
[e2e] cleanup verified: all E2E ports closed, disposable database dropped
```

The final browser run:

| Project | Result |
|---|---|
| `app12-e01-commerce-chromium` | 2 passed, **1 failed** (`FU-APP12-E01-01`), 3 did not run |
| `app12-e01-review-chromium` | **1 passed** — the whole §W journey |
| `app12-e01-public-chromium` | **8 passed** |

Teardown is reported by the orchestrator's `finally` on every run of this
checkpoint, including the failing ones. Disposable worlds are dropped wholesale; no
immutable row was deleted individually.

## AF. Final baseline

```text
OpenAPI paths       = 129        migrations = 39
OpenAPI operations  = 143        no migration 0040
OpenAPI schemas     = 284        Admin routes = 26
public operations   = 49         Storefront routes = 20
publication readiness criteria = 10
```

## AG. Follow-up closure matrix

| Follow-up | Disposition | Evidence |
|---|---|---|
| `FU-APP12-H07-02` | **CLOSED** | §D; probe reads `$POSTGRES_USER`/`$POSTGRES_DB` |
| `FU-APP12-H07-03` | **CLOSED** | §Q, both directions at the process boundary |
| `FU-APP12-H07-05` | **CLOSED_SUPERSEDED** by `APP12-N01`; adapter re-proved | §R |
| `FU-APP12-H08-04` | **CLOSED** | §E, mechanical build + served-`BUILD_ID` proof |
| `FU-APP12-H08-06` | **CLOSED** | §W |
| `FU-APP12-H02-01` | **BLOCKING** — superseded in substance by `FU-APP12-E01-01` | §R |
| `FU-APP12-H02-03` | **CLOSED** | §T, 0 violations on `/mua-hang/[slug]` |
| `FU-APP12-B03-01` | **CLOSED** (and wider than filed) | §Z |
| `FU-APP12-G03-01` | **CLOSED** | §X |
| `FU-APP12-U01-LOW-STOCK-AUTHORITY` | **R01_PREREQUISITE** — classified, not implemented; no threshold API or UI exists or was added | §1 scope |
| U01 Figma-copy reconciliation | **PRE_R01_DESIGN_RECONCILIATION_REQUIRED** | §Y |
| `FU-APP12-N01-OPS-01..03` | **CARRIED_NONBLOCKING** — operational, unchanged by this checkpoint | — |
| `FU-APP12-H02-05` / `FU-APP12-H07-04` | **R01_PREREQUISITE** — production topology and backup/restore ADR | §4 scope |
| **`FU-APP12-E01-01`** (new) | **BLOCKING** — `ORDER_ACCESS` link absent over SMTP; a bearer grant rendered as an OTP | §R |
| **`FU-APP12-E01-02`** (new) | **CARRIED_NONBLOCKING** — 11 further schemas with untyped nullable properties | §Z |

The staging release-config gate's failures (`SMTP_HOST`, `EMAIL_FROM_ADDRESS`,
placeholder image tags) are the external R01 inputs §4 forbids inventing. They
are unchanged by this checkpoint and are not E01's to fill.

## AH. Wave-1 runtime blocker count

```text
READY_MADE_RUNTIME_BLOCKERS_OWNED_BY_E01 = 1
  FU-APP12-E01-01   ORDER_ACCESS undeliverable over SMTP   BLOCKING
```

## AI. R01 handoff

`APP12-R01` is **NOT_AUTHORIZED**. It may not be reconsidered until:

1. `FU-APP12-E01-01` is corrected and re-proved — the SMTP adapter renders a
   secure-link message, `CMD-TEST-APP12-E01-SMTP-SECURE-LINK` is green, and the
   commerce project's origin/fragment cases run and pass, closing
   `FU-APP12-H02-01` with them;
2. `PRE_R01_DESIGN_RECONCILIATION_REQUIRED` is discharged against live Figma;
3. the external R01 inputs in §4 are supplied by the Product Owner.

Everything else E01 owns is green. The correction is bounded and its shape is
known: one render branch in one adapter, plus the message copy that branch needs
— which is why it is a correction and not a new checkpoint.

```text
APP12-E01 = CORRECTION_REQUIRED
APP12-R01 = NOT_AUTHORIZED
NEXT      = PO_REVIEW_REQUIRED

E01_CORRECTION_LIMIT = 1     E01_CORRECTION_USED = 0/1     NO_E01_C2 = true
ROADMAP_CHECKPOINTS  = 41
PRODUCTION_DEPLOYED  = false
PUSHED               = false
```
