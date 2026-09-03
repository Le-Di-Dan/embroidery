# APP12-S03-C1 — ORDER_ACCESS Notification Routing Correction

## A. Verdict

```text
APP12-S03-C1     = COMPLETE
PARENT_APP12-S03 = COMPLETE_AFTER_C1

CORRECTION_USED  = 1 / 1
NEXT_CHECKPOINT  = APP12-A01
```

A bounded cross-boundary integration correction. One decision moved: **which
Storefront surface a secure link points at**. Nothing else about the secure-link
system changed — not the token, not its entropy, not its digest, not the
fragment carrier, not grant issuance, expiry, revocation or supersession, not
the outbox's atomicity, not the worker's retry semantics, not recipient
resolution, not envelope encryption, and not one HTTP operation.

The S03 payment/status surface was accepted and is not reimplemented. This
correction adds no route, no component, no hook and no style.

---

## B. Original defect

The delivered notification composed one path for every secure link:

```text
ORDER_ACCESS  →  <STOREFRONT_PUBLIC_ORIGIN>/truy-cap#t=<token>
```

`/truy-cap` mounts `CustomRequestStatusScreen`, which resolves a token against
`REQUEST_ACCESS` only. A Ready-Made customer's real link therefore opened APP5's
custom-request surface, where their own token was refused as wrong-scope and they
saw the same indistinguishable unavailable card as a forged link.

The failure mode is the worst shape a defect can take here: nothing errors,
nothing is logged as a fault, and the customer is shown a screen that is
*correct* for the request it received. It is invisible to every unit and
component test, and it surfaced only when a browser opened the exact URL the
notification produced.

**Wave-1 release blocker.** Every Ready-Made order issues one of these links, and
it is the customer's only way to reach their order.

---

## C. Root cause

Not a typo — a missing fact in a contract. Four delivered files, each correct on
its own terms:

| file | what it says | why the gap follows |
|---|---|---|
| `apps/worker/…/config/storefront-origin.config.ts` | `SECURE_LINK_LANDING_PATH = '/truy-cap'` | one constant, written when one scope existed |
| `apps/worker/…/domain/secure-link.renderer.ts` | `renderSecureLinkUrl(origin, rawToken)` | no scope parameter, so no branch is expressible |
| `packages/notification-delivery/…/delivery-envelope.contract.ts` | `DeliveryPayload` carries channel, recipient, secret kind, secret, issue/expiry | no scope, so the worker could not learn one even if it wanted to |
| `apps/api/…/customer/application/secure-grant.notifier.ts` | one `SECURE_LINK_TEMPLATE_KEY` for both scopes | nothing downstream distinguishes them |

APP4 delivered one grant scope and named one landing, which was right.
`APP12-DB01` added the second and last scope, `ORDER_ACCESS`, and `APP12-B04`
began issuing grants in it — but the *delivery* contract between API and worker
was never widened, so the renderer kept answering the only question it could.

The worker deliberately consults no grant table (`ADR-APP4-001` §6.5: the
business validity of a secret belongs to the checkpoint that issued it), so it
could not have recovered the scope by querying for it. The fact had to be
**given** to it.

---

## D. Secure-link notification preflight

Read before changing anything:

```text
apps/api/src/modules/customer/application/secure-grant.notifier.ts
apps/api/src/modules/customer/application/secure-grant.issuer.ts
apps/api/src/modules/customer/application/order-access-grant.issuer.ts
apps/api/src/modules/notification/application/request-notification.use-case.ts
apps/api/src/modules/notification/domain/notification-request.ts
apps/api/src/modules/customer/domain/repositories/secure-access-grant.repository.ts
packages/database/src/schema/customer/secure-access-grants.ts
packages/notification-delivery/src/*.ts
apps/worker/src/jobs/notification-delivery/**
docs/adr/backend/ADR-APP4-001-…-AUTHORITY.md §4, §6, §11, §14.1
```

Findings that decided the design:

1. **Exactly two callers** reach `SecureGrantNotifier.notify` — `SecureGrantIssuer`
   (`REQUEST_ACCESS`) and `OrderAccessGrantIssuer` (`ORDER_ACCESS`). There is no
   third, and no HTTP route reaches either.
2. **The scope is already persisted and already authoritative.**
   `secure_access_grants.scope_kind` is a closed two-value column, with
   `ck_secure_access_grants__scope_subject` binding each scope to its own typed
   subject. Nothing had to be added to hold it — only to *read* it.
3. **The notifier already receives the `grantId`** and already runs inside the
   issuing transaction, so the row is visible to it.
4. **The envelope is ciphertext in `outbox_events.payload`.** Adding a field to
   the sealed payload is not a schema change and needs no migration.
5. **No template text is scope-specific.** `secure_access.link` renders a link
   and a deadline; only the URL differs. §7's condition for a second template key
   is not met, so none was created.

---

## E. Scope source of truth

```text
secure_access_grants.scope_kind   — the persisted row, read by grant id
```

`SecureGrantNotifier` now injects `SECURE_ACCESS_GRANT_REPOSITORY` and calls
`findById(input.grantId)` inside the caller's transaction. It takes **no scope
parameter**, which is the same structural rule the class already applies to the
recipient: a caller holding a grant id cannot say where the link lands, for
exactly the reason it cannot say who receives it.

The read is not redundant with the issuer's own literal. The issuer knows what it
*asked* the database to write; this reads what the database **holds** — the value
every later authorization decision (the public resolver, the surface's scope
guard, `GrantScopeReleaseGate`) is made against. If the two could ever disagree,
the link must follow the row.

Nothing infers scope from the token, the reference, the recipient, the template
prose, the order code, a URL, a grant-id prefix or client input. **The token is
never parsed.**

A grant that cannot be read, or whose `scope_kind` is not one of the two, refuses
the delivery with the existing bounded `GRANT_DELIVERY_TARGET_UNAVAILABLE`. That
cannot arise from the two issuers; `scope_kind` is nevertheless a text column, and
this is the one place where guessing would mint a link that looks right and opens
nothing.

---

## F. Landing-route mapping

Locked, closed, and stated in exactly two places — one per side of the boundary.

**API side** (`secure-grant.notifier.ts`) — grant scope to delivery landing:

```ts
const LANDING_OF: Readonly<Record<GrantScopeKind, SecureLinkLanding>> = {
  REQUEST_ACCESS: 'REQUEST_ACCESS',
  ORDER_ACCESS: 'ORDER_ACCESS',
};
```

**Worker side** (`storefront-origin.config.ts`) — landing to path:

```ts
export const SECURE_LINK_LANDING_PATHS: Readonly<Record<SecureLinkLanding, string>> = {
  REQUEST_ACCESS: '/truy-cap',
  ORDER_ACCESS: '/truy-cap/don-hang',
};
```

Both are `Record` over a closed union, so a third grant scope cannot be added
anywhere in the repository without both files failing to compile until somebody
decides where its links land. Neither has a default: a default would route a new
scope to whichever surface happened to be listed first, which is the exact defect
being replaced.

The two vocabularies are kept distinct — a grant scope is an authorization fact,
a landing is a delivery destination — even though today they read alike. The
alternative is a cast, and a cast would let a future divergence pass unnoticed.

**No path string crosses the boundary.** The API names a landing; only the worker
knows what URL that is. `arbitrary_path_input = false`.

Carrier unchanged for both:

```text
<origin><landing-path>#t=<opaque-token>
```

---

## G. Renderer / notifier changes

```ts
// before
export function renderSecureLinkUrl(origin: string, rawToken: string): string

// after
export function renderSecureLinkUrl(
  origin: string,
  rawToken: string,
  landing: SecureLinkLanding,
): string
```

The landing is re-guarded at runtime rather than trusted: it reached the process
as JSON, and an unknown value throws instead of composing `undefined` into a
path.

### The delivery contract

`DeliveryPayload` gains one field:

```ts
readonly secureLinkLanding?: SecureLinkLanding;
```

- **`sealDeliveryEnvelope` refuses** a `SECURE_LINK_TOKEN` with no landing, and a
  `VERIFICATION_CODE` *with* one. The seal is the last moment anything can still
  know what the secret is for, so both mistakes stop there.
- **`openDeliveryEnvelope` accepts** an absent landing and rejects a
  present-but-unknown one. Absent is accepted deliberately: an `APP4-B08` manual
  replay copies historical ciphertext byte-identically, and a required field
  would turn every pre-correction replay into
  `NOTIFICATION_ENVELOPE_UNREADABLE`. A link with no landing is refused at
  **rendering** time instead, where the refusal can name what is missing.
- **The envelope version is unchanged (1).** The field is additive and optional
  on the read side, so no existing envelope becomes unreadable.

### Fail-closed at the render seam

A new bounded failure class, `NOTIFICATION_LINK_LANDING_UNAVAILABLE`, mapped to
the worker class `JOB_PAYLOAD_INVALID` and **not** retryable — the ciphertext is
immutable, so a later attempt finds the same gap. It is deliberately separate
from `NOTIFICATION_LINK_ORIGIN_UNAVAILABLE`: a missing origin is configuration an
operator can publish; a missing landing is a payload sealed by an older build.
Reporting the second as the first would send an operator to
`STOREFRONT_PUBLIC_ORIGIN`, which is already correct.

The use case now takes the failure *class* from the thrown error and its
retryability from the taxonomy, so the two can no longer disagree.

### Not changed

Grant issuance, hashing, expiry, revoke, supersession, the token minter, the
peppered digest, recipient resolution, masking, intent idempotency, the intent-key
tuple, `notification_intents.params`, outbox atomicity, the delivery policy, the
retry budget, dead-lettering, `originNotificationIntentId` lineage semantics, the
template key and version, and the contact-kind → channel mapping.

**No duplicate notification, no second grant, no second bearer.** The landing
rides inside the one envelope that already existed.

---

## H. REQUEST_ACCESS preservation

`REQUEST_ACCESS` → `/truy-cap`, byte-identical to what APP4 delivered.

| proof | where |
|---|---|
| the renderer composes `<origin>/truy-cap#t=<token>` | `secure-link.renderer.spec.ts` |
| a real `SecureGrantIssuer.issue({notify:true})` seals `REQUEST_ACCESS` | `secure-grant-landing.integration.spec.ts` |
| the sealed landing equals the grant row's own `scope_kind` | same suite, read back from `secure_access_grants` |
| a real delivery renders `/truy-cap` end to end | `notification-delivery-success.integration.spec.ts` |
| the two scopes take **different** paths | asserted separately, so a future "simplification" back to one constant fails here |

Not all secure links became order links: the `REQUEST_ACCESS` case is asserted in
every tier alongside its sibling, and the identity of the two paths is asserted to
be false.

The Wave-2 release model is untouched — Wave 2 withholds the `REQUEST_ACCESS`
**runtime** (`GrantScopeReleaseGate` refuses that scope at resolution), never the
link. See §Q.

---

## I. ORDER_ACCESS delivery proof

```text
ORDER_ACCESS  →  <STOREFRONT_PUBLIC_ORIGIN>/truy-cap/don-hang#t=<token>
```

Three tiers, each proving a different half, and only together an end-to-end
claim:

1. **Producer** — `secure-grant-landing.integration.spec.ts` (API, disposable
   PostgreSQL). A real `OrderAccessGrantIssuer.ensure({ notify: true })` against a
   real `READY_MADE` order seals a delivery whose landing is `ORDER_ACCESS`, and
   the assertion compares it against the grant row's persisted `scope_kind` rather
   than a literal the test chose. One customer, one contact point, one channel,
   one template key — the *only* thing that differs between the two deliveries is
   the grant, so a landing derived from anything else in that picture would make
   both match. It does not.
2. **Consumer** — `notification-delivery-success.integration.spec.ts` (worker,
   disposable PostgreSQL). An envelope carrying `ORDER_ACCESS` produces
   `<origin>/truy-cap/don-hang#t=<token>` at the recording channel, with the token
   after the `#` and nothing before it.
3. **End to end** — the `app12-s03` disposable browser project: a real order, a
   real grant, a real worker delivery, and `page.goto()` on the delivered string
   itself (§K).

The two integration tiers are separate because **no app imports another**; the
browser project is where they meet.

The origin is never hard-coded. It remains `STOREFRONT_PUBLIC_ORIGIN`, validated
and normalized by `loadStorefrontPublicOrigin` exactly as before.

---

## J. Harness workaround removal

Removed from `packages/e2e-testing/specs/app12/support/s03-world.ts`:

- the `DELIVERED_LANDING_PATH = '/truy-cap'` constant;
- the assertion that pinned the defect;
- the re-composition of origin + S03's route + the delivered fragment.

Now:

```ts
expect(delivered.pathname, '…lands on the Ready-Made order surface').toBe(ORDER_ACCESS_PATH);
expect(delivered.hash.startsWith('#t='), 'the carrier is the #t= fragment').toBe(true);
expect(delivered.search === '', 'the delivered link carries no query').toBe(true);
expect(
  delivered.pathname.includes(delivered.hash.slice(3)) === false,
  'the delivered link carries no token in its path',
).toBe(true);

await page.goto(secureUrl);
```

```text
path_substitution_removed = true
exact_delivered_URL_used  = true
```

The pathname is named in a failure message because it is not a secret and
discloses nothing. The token is never an assertion **value**: both carrier checks
are booleans, so a failure prints `true`/`false` and never the URL.

The regression guard is now structural rather than commented. If notification
routing regresses, **every journey in the project fails at its first
navigation** — which is exactly what the first C1 run did before the worker
`dist` was rebuilt (§X.2).

---

## K. Exact delivered-URL proof

Every one of the eight journeys begins the same way, and it is the assertion the
whole correction exists for:

```text
read the delivered secure URL out of the recording adapter
assert pathname === '/truy-cap/don-hang'
assert hash starts with '#t='
assert search === ''                      (boolean — prints no value)
assert the path contains no token          (boolean — prints no value)
page.goto(secureUrl)                       ← the delivered string itself
```

Not a reconstruction, not a re-composition, not a repair. The string the
customer's own notification carries is the string the browser opens.

The strip is then asserted once, for every journey, before any screenshot:

```text
location.hash === ''      polled as a boolean
pathname === '/truy-cap/don-hang'
search === ''
```

So no artifact any journey produces can observe the fragment, and no failing
assertion can print it.

---

## L. 8/8 live rerun

```text
command   pnpm --filter @embroidery/e2e-testing e2e:app12:s03
result    8 passed (6.4m), playwright exited with code 0
topology  ephemeral PostgreSQL + MinIO · real API (dist) · real worker (dist,
          in-process) · real Storefront (next start) · real Nginx gateway ·
          real Chromium
```

```text
✓ 1  Journey B — a lapsed reservation renders the EXPIRED variant        (24.1s)
✓ 2  Journey C — a fee correction replaces the amount and strands the attempt (25.4s)
✓ 3  Journey D — a real upload is stored and still means nothing about payment (3.2s)
✓ 4  one order's credential reaches no part of another order             (4.5s)
✓ 5  a revoked grant clears every authorized fact from the screen        (41.8s)
✓ 6  full Ready-Made lifecycle at 1440                                    (1.5m)
✓ 7  full Ready-Made lifecycle at 1024                                    (1.5m)
✓ 8  full Ready-Made lifecycle at 390                                     (1.5m)
```

Three fresh orders were created and walked end to end — `ORD-NKEFZBP2QT`,
`ORD-45WNRHE4H7`, `ORD-C3KXQJ538V` — plus four more for the journey and security
cases. Nothing is mocked and nothing is seeded but the catalog: the customer, the
verification, the order, its reservation, its grant, its **notification**, its
obligation, its attempt and every transition are produced by the delivered
application.

The run's own teardown reported
`cleanup verified: all E2E ports closed, disposable database dropped`.

---

## M. Three-viewport full lifecycle

Each viewport opens the exact delivered `ORDER_ACCESS` URL and walks the whole
tail:

```text
AWAITING_SHIPPING_FEE → AWAITING_PAYMENT → STEP_UP / FULL initiate
                      → READY_FOR_DELIVERY → DELIVERED → COMPLETED
```

| viewport | order | step-up branch taken | lifecycle |
|---|---|---|---|
| 1440 | `ORD-NKEFZBP2QT` | yes | PASS |
| 1024 | `ORD-45WNRHE4H7` | yes | PASS |
| 390 | `ORD-C3KXQJ538V` | yes | PASS |

No browser-route repair at any step. Every state's assertions are unchanged from
S03 — the pill, the next-action line, the absence of a total before the fee, the
exact obligation amount read back from the database, the single QR image, the
textual fallback, the attempt at the obligation's exact amount, the absence of
any tracking word after dispatch, exactly one `h1`, and no horizontal overflow.

Screenshots: `evidences/app_12/s03/live-c1/` — 18 lifecycle frames, all taken
after the fragment strip.

---

## N. Expiry rerun

From the exact delivered URL:

```text
create order → real ORDER_ACCESS link → AWAITING_SHIPPING_FEE on screen
make the reservation due (one timestamp, the documented bounded seam)
run ExpireReadyMadeReservationsUseCase from the real worker context
→ orders.status             = CANCELLED
→ reservation.status        = EXPIRED
→ surface                   = "Hết hạn giữ hàng"
                              "Đơn đã huỷ vì quá hạn giữ hàng 24 giờ."
→ CANCELLED pill            absent
→ QR / initiate / evidence  absent
```

The only thing the harness writes is `expires_at`, on one row of a disposable
database. Everything after it — the claim, the release, the cancellation and the
`RESERVATION_EXPIRED` classification the surface reads — is delivered code inside
the delivered transaction.

Screenshot: `evidences/app_12/s03/live-c1/journey-b-expired.png`.

---

## O. Fee-correction rerun

From the exact delivered URL:

```text
Admin sets fee A → AWAITING_PAYMENT, FULL A → STEP_UP → attempt A opened
Admin sets fee B → FULL A SUPERSEDED, FULL B PENDING
                   (the order status does not move)
surface refetch  → amount = B, QR = B, "số tiền đã thay đổi" shown
                 → attempt A is not presented as B's
                 → payment_attempts for this order = 1, still bound to the
                   SUPERSEDED obligation
```

The two fees are chosen so a screen that **summed** the order's own subtotal and
fee rows would print A while the server owed B.

Screenshot: `evidences/app_12/s03/live-c1/journey-c-fee-correction.png`.

---

## P. Evidence rerun

From the exact delivered URL, a real PNG through the delivered attempt-scoped
operation into this run's real MinIO:

```text
upload             → payment_transfer_evidence rows for this order = 1
surface            → one evidence row, stating the image's own status
no payment claim   → no "đã thanh toán thành công" / "thanh toán hoàn tất" /
                     "đã nhận tiền" anywhere on the page
order              → still AWAITING_PAYMENT
obligation         → still PENDING
attempt            → still PENDING
new endpoint added → none
```

Screenshot: `evidences/app_12/s03/live-c1/journey-d-evidence.png`.

---

## Q. Cross-order and wrong-scope security

### Q.1 Cross-order

Two disposable orders. Five probes, sequential, each carrying a syntactically
valid 43-character token no grant was ever minted for — including one naming a
**real** attempt id belonging to the other order:

```text
publicReadyMadeOrder_current      refused
publicOrderFullPayment_current    refused
publicOrderFullPayment_qr         refused
evidence status (real attempt id) refused
evidence status (fictional id)    refused

no probe answered 200
no probe returned the other order's code
404 → SECURE_LINK_UNAVAILABLE, byte-identical
429 → the limiter answering before evaluation, which discloses nothing
```

### Q.2 Wrong scope, both directions

This is where the correction could have created a new hole, and did not. The two
surfaces are now genuinely reachable by two different links, so "what happens if
a token arrives at the wrong one?" became answerable rather than theoretical.

Measured, not argued. Three cases in
`secure-grant-landing.integration.spec.ts` issue **real** grants through the real
issuers and present their **real peppered digests** to the delivered
`resolveActiveByTokenDigest(hash, scopes, now)` — the same call each surface
makes, with the same scope set each surface supplies:

| case | own scope | the other scope |
|---|---|---|
| a live `ORDER_ACCESS` grant | resolves | **undefined** |
| a live `REQUEST_ACCESS` grant | resolves | **undefined** |
| wrong-scope versus a digest no grant was ever minted for | — | **the same `undefined`** |

The third case is the non-enumeration claim: a wrong-scope token and an unknown
one produce the identical value, so nothing downstream can branch on which cause
it met. At the HTTP boundary both become the one
`404 SECURE_LINK_UNAVAILABLE`.

Nothing was relaxed to let the two landings coexist: the scope predicate is a
**query argument** the calling surface supplies, and each surface still supplies
exactly one. That refusal is the pre-correction behaviour — it is, in fact,
precisely what made the routing defect customer-visible — and it is unchanged.

**No client-side scope discovery exists.** `publicSecureLinkResolve` is called
zero times by either surface; the boundary suite asserts it, and the landing is
decided before delivery rather than after arrival.

Screenshot (grant revoked mid-session, every authorized fact cleared):
`evidences/app_12/s03/live-c1/security-link-death.png`.

### Q.3 Wave-2 regression

```text
Wave2 OFF (the state the live run executed in — release.gate.configured
           enabled=false, logged by the real API at boot):
  ORDER_ACCESS delivered route = /truy-cap/don-hang        PASS (8/8 journeys)
  S03 works                                                 PASS
  REQUEST_ACCESS customer runtime withheld                  unchanged

Wave2 ON:
  REQUEST_ACCESS delivered route = /truy-cap                PASS
  ORDER_ACCESS delivered route  = /truy-cap/don-hang        PASS
  custom secure route works                                 unchanged

release matrix = 28 STATIC_DENY / 18 STATIC_ALLOW / 3 SCOPE_GATED   unchanged
```

Composition is a pure function of origin, token and landing: it reads no
environment and consults no release gate. `secure-link.renderer.spec.ts` asserts
this directly — it composes both URLs with `CUSTOM_EMBROIDERY_RELEASE_ENABLED`
set to `false` and then to `true`, and the two results are equal.

That separation is deliberate rather than incidental. Wave 2 withholds the
`REQUEST_ACCESS` **runtime** — `GrantScopeReleaseGate` refuses that scope at
resolution, which is why the three secure-token operations are `SCOPE_GATED`
rather than `DENY` — and a link that composed differently by wave would mean a
customer's saved message stopped working when a flag moved.

The release-gate contract suite passes with the matrix untouched: no operation
was added, removed or reclassified.

---

## R. Secret hygiene

```text
token_logged            = false
token_in_query          = false
token_in_path           = false
secret_trace_HAR_video  = 0
```

- **The renderer's contract is unchanged**: the token appears only after `#t=`.
  Both landings are asserted for it — the part a server, gateway or proxy could
  log carries neither the token nor a `?`.
- **The new field is not a secret but is treated as one**: the landing is sealed
  *with* the token and appears in no column. `notification_intents.params` stays
  the closed reference union, and the API integration suite asserts the string
  `ORDER_ACCESS` appears in neither the intent rows nor the outer envelope JSON.
- **No new log line** was added anywhere on the delivery path. The failure
  taxonomy gained one class name, which is a bounded classification written to
  `notification_delivery_attempts.error_class` exactly like the eight before it.
- **The harness prints no URL.** The two carrier assertions are booleans
  (`search === ''`, `pathname.includes(...) === false`), so a failure message
  names no value. The only string compared directly is `pathname`, which carries
  no credential.
- **`trace: 'off'`, `video: 'off'`, `screenshot: 'off'`** on the `app12-s03`
  project, unchanged from S03. Every screenshot is taken by an explicit call
  *after* `openSecureOrder` has confirmed `location.hash === ''`.
- **No secret-bearing environment variable was read, echoed or written.** `.env`
  was not modified (§28).

---

## S. API / DB / release freeze

```text
NEW_HTTP_OPERATIONS = 0
OpenAPI             = 125 paths / 138 operations / 277 schemas   (unchanged)
public operations   = 49                                          (unchanged)
generated client    = unchanged
migrations          = 38                                          (unchanged)
DB schema           = unchanged
release matrix      = 28 DENY / 18 ALLOW / 3 SCOPE_GATED          (unchanged)
Figma               = unchanged
Storefront routes   = 20                                          (unchanged)
```

`git diff` touches no file under `packages/contracts`, `packages/api-client`,
`packages/database/migrations` or `packages/database/src/schema`. No controller,
DTO, `@ApiOperation` or route was added, removed or edited; no landing-resolver
or grant-scope endpoint exists.

The grant scope was **already** persisted — `secure_access_grants.scope_kind`,
added by `APP12-DB01` in migration 0038 — so this correction had nothing to
migrate. `BLOCKED_DB_GAP` does not apply.

The one field added anywhere is inside AES-256-GCM ciphertext in
`outbox_events.payload`, a `jsonb` column whose shape is owned by the envelope
contract and not by the schema. The envelope version stays `1` because the change
is additive and optional on the read side.

---
## T. Disposable DB / MinIO hygiene

```text
disposable_db_used                  = true
disposable_db_removed               = true
disposable_minio_used               = true   (the evidence journey uploads a real image)
disposable_minio_removed            = true   (dropped with its compose project)

shared_dev_READY_MADE_orders        = 0
databases matching '%e2e%'          = 0
e2e containers remaining            = 0
G03_data_created                    = false
```

Verified directly against the shared dev stack **after** the run:

```text
select count(*) from orders where origin='READY_MADE'            →  0
select count(*) from pg_database where datname like '%e2e%'      →  0
docker ps -a | grep e2e                                          →  0
```

Every commercial row this correction's rerun created — 7 orders across the eight
journeys, their reservations, obligations, attempts, evidence, `ORDER_ACCESS`
grants and **notifications** — was written to the run's own ephemeral database
and dropped with it. The run's own teardown reported
`cleanup verified: all E2E ports closed, disposable database dropped`, and the
`finally` block plus signal handlers make that true on failure and interrupt too.

`s03-order-fixture.mjs` still refuses any database whose name does not begin
`embroidery_db7_`, so pointing the run at the shared stack is a hard failure
rather than something to notice afterwards.

**No `.env` write, and no dev-stack change this time.** §28's requirement was met
without one: the run injects `STOREFRONT_PUBLIC_ORIGIN` into its own API and
worker processes from `config.baseUrls.storefront`, which is the run's own
ephemeral gateway origin. `FU-APP12-S03-06` stays open against `APP12-H02`.

The API integration tier is equally disposable — `createGrantContext` provisions
its own PostgreSQL per suite and drops it — and the one `orders` row it seeds is
fixture scaffolding in a database that does not outlive the test file.

---

## U. Focused regressions

The correction touches one seam that four delivered capabilities sit on, so the
regressions were chosen by **who shares the seam**, not by proximity in the tree.

### Who actually shares it

```text
SecureGrantNotifier.notify   ← SecureGrantIssuer        (APP4-B05, REQUEST_ACCESS)
                             ← OrderAccessGrantIssuer   (APP12-B04, ORDER_ACCESS)
```

Exactly two callers, both in-process, neither reachable over HTTP. APP6, APP7 and
APP9 **consume** secure links — they resolve a token against a grant — but none
of them renders one, and none seals a delivery. Their suites seed grants directly
and are structurally untouched by a rendering change; they were run anyway
because the claim "untouched" is worth measuring rather than asserting.

### Results

| suite | scope | result |
|---|---|---|
| `packages/notification-delivery` unit | envelope contract, codec, key | **41 passed** |
| `apps/worker` — `notification-delivery/domain` | renderer, failure taxonomy, policy | **34 passed** |
| `apps/worker` — `notification-delivery/tests` | delivery integration, disposable PG | **15 passed** |
| `apps/worker` — full suite | every worker job and runtime | **60 suites / 1056 passed** |
| `apps/api` — `modules/customer/tests/integration` | APP4 grants, verification, identity, merge, admin support, **the new landing suite** | **25 suites / 291 passed** |
| `apps/api` — `modules/notification/tests/integration` | B01 intake, B08 replay, binding, refusal | **7 suites / 74 passed** |
| `apps/api` — `platform/release-gate` | Wave-2 classification matrix | **passed, 28/18/3** |
| `apps/api` — `modules/order/.../request-intake-binding` | APP5 `REQUEST_ACCESS` intake binding | **passed** |
| `app12-s03` disposable browser project | the eight live journeys | §L |

### Pre-existing failures this correction exposed, and what was done

The APP4/APP12 customer integration suites **could not boot at all** before this
correction, and had not been able to since `APP12-G02`:

```text
Nest can't resolve dependencies of the Symbol(CUSTOM_EMBROIDERY_RELEASE_CONFIG) (?).
Please make sure that the argument StructuredLogger at index [0] is available in
the ReleaseGateModule module.
```

`LoggingModule` is `@Global()`, but a global module is global only once something
in the graph has imported it. The running application imports it from
`AppModule`, so the omission was invisible there — while every integration
context that boots `CustomerModule` without the whole application failed to
compile. Confirmed pre-existing by re-running an **untouched** suite with all C1
changes stashed: identical failure.

That had to be fixed to produce the notifier evidence §16 requires. The fix is
one line — `ReleaseGateModule` now imports `LoggingModule` — which is a no-op for
the running application and makes the module self-sufficient wherever it is
composed.

Repairing it un-masked three genuine defects that had never executed:

| defect | cause | action |
|---|---|---|
| 4 merge suites: `INSERT has more expressions than target columns` | `customer-merge-queries.ts` put the `orders.origin` value `'CUSTOM'` in the **`approval_snapshots`** statement above it, leaving that one with 20 values for 19 columns and the `orders` one with 9 for 10 | fixed — the value moved to the statement it belongs to |
| `verification-and-grants`: grant summary key list | `APP12-B04` added `orderId` to `SecureAccessGrantSummary`; the APP4-era assertion still listed five keys | fixed — `orderId` added, with the reason |
| 5 notification suites: `A secure-link delivery must name its landing` | correct: those fixtures seal `SECURE_LINK_TOKEN` deliveries directly and now must name a landing | fixed — the shared `seedTerminalDelivery` names `REQUEST_ACCESS`, and the intake suite asserts both the landing and the refusal |

All 32 suites are green afterwards.

### Explicitly not run

`tools/check-app4-g01.mjs` reports 9 failures on this branch and every one is an
**authority-era** assertion that the checkpoint implements nothing —
"`apps/worker/src/jobs/notification-delivery` exists; APP4-G01 implements no
runtime feature", "the repository has 38 migrations; APP4-G01 adds none". It has
been structurally unsatisfiable since APP4-B01 shipped and is not a gate for any
post-implementation change. The part of it that *is* still meaningful — the
ADR §14.1 fact table — reconciles clean, and the §Z amendment does not disturb a
single checked row.

A repository-wide `apps/api` run is deliberately **not** cited. It is a
prohibited aggregate (`CLAUDE.md` §9, `VALIDATION_GOVERNANCE.md` §1.1), and it is
also not evidence: run in one batch, unrelated suites fail on environment
ordering (`DESIGN_SESSION_SECRET_PEPPER is required`) and pass individually. The
suites above were run scoped, which is what the governance asks for.

---
## V. Files changed

### Runtime source (7)

| file | change |
|---|---|
| `packages/notification-delivery/src/delivery-envelope.contract.ts` | `SECURE_LINK_LANDINGS`, `SecureLinkLanding`, `isSecureLinkLanding`; `DeliveryPayload.secureLinkLanding` |
| `packages/notification-delivery/src/delivery-envelope.codec.ts` | seal refuses a link with no landing and a code with one; open accepts absent, rejects unknown |
| `packages/notification-delivery/src/index.ts` | three exports |
| `apps/api/src/modules/notification/domain/notification-request.ts` | `secureLinkLanding?` on `NotificationRequest` |
| `apps/api/src/modules/notification/application/request-notification.use-case.ts` | passes the landing into the seal, and nowhere else |
| `apps/api/src/modules/customer/application/secure-grant.notifier.ts` | reads the grant by id, maps `scope_kind` to a landing, fails closed |
| `apps/api/src/platform/release-gate/release-gate.module.ts` | imports `LoggingModule` (pre-existing DI defect, §U) |

### Worker source (4)

| file | change |
|---|---|
| `apps/worker/…/config/storefront-origin.config.ts` | `SECURE_LINK_LANDING_PATH` becomes the `SECURE_LINK_LANDING_PATHS` closed table |
| `apps/worker/…/domain/secure-link.renderer.ts` | takes a landing; looks it up; refuses an unknown one |
| `apps/worker/…/domain/delivery-failure.ts` | `NOTIFICATION_LINK_LANDING_UNAVAILABLE`, deterministic, `JOB_PAYLOAD_INVALID` |
| `apps/worker/…/application/notification-delivery.usecase.ts` | carries the landing through; takes failure class and retryability from the taxonomy |

### Tests (8)

| file | change |
|---|---|
| `packages/notification-delivery/test/unit/delivery-envelope.spec.ts` | landing round-trip per scope, three seal refusals, legacy open, guard set |
| `apps/worker/…/domain/secure-link.renderer.spec.ts` | both landings, their difference, two refusals, wave-independence, carrier rules per scope |
| `apps/worker/…/tests/notification-delivery-context.ts` | `secureLinkLanding` seed option; a test-only sealer for pre-correction ciphertext |
| `apps/worker/…/tests/notification-delivery-success.integration.spec.ts` | `ORDER_ACCESS` delivery; a landing-less link refused terminally |
| `apps/api/…/customer/tests/integration/secure-grant-landing.integration.spec.ts` | **new** — both issuers, landing versus persisted `scope_kind`, secrecy, code has none, three wrong-scope refusals |
| `apps/api/…/customer/tests/integration/secure-grant-context.ts` | seeds a `READY_MADE` order; exposes `OrderAccessGrantIssuer` |
| `apps/api/…/notification/tests/integration/admin-notification-context.ts` | secure-link fixtures name `REQUEST_ACCESS` |
| `apps/api/…/notification/tests/integration/notification-intake.integration.spec.ts` | landing sealed and secret-free; omission refused |

### Pre-existing test defects repaired (2)

| file | change |
|---|---|
| `apps/api/…/customer/tests/integration/customer-merge-queries.ts` | the `'CUSTOM'` value moved from the `approval_snapshots` insert to the `orders` insert it belongs to |
| `apps/api/…/customer/tests/integration/verification-and-grants.integration.spec.ts` | grant-summary key list gains `orderId` (`APP12-B04`) |

### Harness (1)

| file | change |
|---|---|
| `packages/e2e-testing/specs/app12/support/s03-world.ts` | substitution removed; navigates the delivered URL; carrier asserted as booleans |

### Documentation (3)

| file | change |
|---|---|
| `docs/adr/backend/ADR-APP4-001-…-AUTHORITY.md` | §4 and §11 amendments (§Z) |
| `docs/implementation/reports/APP12-S03-COMPLETION-REPORT.md` | correction notice, verdict, `FU-09` closure |
| `docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md` | `S03 = COMPLETE_AFTER_C1`, the `S03-C1` row, `NEXT = APP12-A01` |

**Not changed:** any Storefront source, any controller or DTO, any OpenAPI or
generated-client file, any migration, any schema file, any Figma artifact.

---

## W. File-size evidence

```text
node tools/check-file-size.mjs --paths
  apps/worker/src/jobs/notification-delivery
  packages/notification-delivery/src
  packages/notification-delivery/test
  apps/api/src/modules/customer/application
  apps/api/src/modules/notification
  apps/api/src/platform/release-gate
  apps/api/src/modules/customer/tests/integration
  packages/e2e-testing/specs/app12

Scoped file-size check passed.
```

Hard limits (400 source / 600 test): **no violation.**

| file | lines | limit |
|---|---|---|
| `notification-delivery.usecase.ts` | 345 | 400 — review threshold crossed (was 322) |
| `secure-grant.notifier.ts` | 194 | 400 |
| `storefront-origin.config.ts` | 117 | 400 |
| `secure-link.renderer.ts` | 81 | 400 |
| `delivery-failure.ts` | 133 | 400 |
| `delivery-envelope.contract.ts` | 137 | 400 |
| `delivery-envelope.codec.ts` | 166 | 400 |
| `notification-request.ts` | 124 | 400 |
| `release-gate.module.ts` | 85 | 400 |
| `notification-delivery-context.ts` | 423 | 600 |
| `delivery-envelope.spec.ts` | 316 | 600 |
| `secure-grant-landing.integration.spec.ts` | 258 | 600 |
| `s03-world.ts` | **397** | 400 |

Two notes on the review-threshold entries, since both are deliberate:

- `notification-delivery.usecase.ts` at 345 is prose, not branching. The added
  code is one guard and one failure mapping; the rest explains *why* a missing
  landing is terminal while a missing origin is not. Splitting a class whose
  method ordering **is** the security model would cost more than it buys.
- `s03-world.ts` reached 403 and was brought back to 397 by condensing the
  history paragraph in `openSecureOrder`'s doc block — that history belongs in
  this report, and the comment now states the rule rather than retelling the
  incident. No assertion, guard or helper was removed to fit.

---

## X. Validation

Every command below was run for this correction and its result is what is
recorded. Selected from `VALIDATION_GOVERNANCE.md` §3 by what the change actually
touches; no repository-wide aggregate was used.

| # | command | result |
|---|---|---|
| 1 | `git diff --check` / `git diff --cached --check` | clean |
| 2 | `pnpm --filter @embroidery/notification-delivery typecheck` | pass |
| 3 | `pnpm --filter @embroidery/notification-delivery lint` | pass |
| 4 | `pnpm --filter @embroidery/notification-delivery test` | **41 passed** |
| 5 | `pnpm --filter @embroidery/notification-delivery build` | pass |
| 6 | `pnpm --filter @embroidery/worker typecheck` | pass |
| 7 | `pnpm --filter @embroidery/worker lint` | pass |
| 8 | `pnpm --filter @embroidery/worker build` (clean `dist`) | pass |
| 9 | `apps/worker` full jest suite | **60 suites / 1056 passed** |
| 10 | `pnpm --filter @embroidery/api typecheck` | pass |
| 10b | `pnpm --filter @embroidery/api lint` | **4 pre-existing errors**, none in a file this correction touches (see below) |
| 11 | `pnpm --filter @embroidery/api build` (clean `dist`) | pass |
| 12 | `apps/api` — `src/modules/customer/tests/integration` | **291 tests passed**; 25/25 suites green when the machine is not also running the browser project (see below) |
| 13 | `apps/api` — `src/modules/notification/tests/integration` | **7 suites / 74 passed** |
| 14 | `apps/api` — `src/platform/release-gate` | pass (28 / 18 / 3) |
| 15 | `apps/api` — `request-intake-binding.integration.spec.ts` | pass |
| 16 | `pnpm --filter @embroidery/e2e-testing typecheck` | pass |
| 17 | `pnpm --filter @embroidery/e2e-testing lint` | pass |
| 18 | `pnpm --filter @embroidery/e2e-testing check:e2e` | clean |
| 19 | `node tools/check-e2e-boundaries.mjs` | clean, 4800 built files scanned |
| 20 | `node tools/check-storefront-route-authority.mjs` | pass |
| 21 | `node tools/check-file-size.mjs --paths …` | pass |
| 22 | `node tools/check-report-secrets.mjs` | 2 pre-existing findings only (`FU-APP12-S03-08`); the C1 and S03 reports are clean |
| 23 | `npx prettier --check <changed files>` | pass |
| 24 | `pnpm --filter @embroidery/e2e-testing e2e:app12:s03` | **8/8 passed (6.4m), exit 0** |
| 25 | disposable teardown and shared-dev hygiene queries | §T |

### Two failures that were not this correction's, and how that was established

| observation | how it was tested | conclusion |
|---|---|---|
| `admin-shipping-detail.integration.spec.ts` — 2 failures (a customer shipping-fee acknowledgement answering 404) | re-run with **all** C1 API changes stashed | identical failure — pre-existing |
| `admin-order.contract.spec.ts`, `actor-context.integration.spec.ts`, `catalog-placement-boundary.spec.ts` — one assertion each | same method | identical failures — pre-existing |
| `apps/api` ESLint — 4 errors in `jest.app10-e01.config.mjs` and `approve-design-version.use-case.ts` | same method | identical failures — pre-existing, and neither file is touched here |

Both are recorded in §Y for the owning phase rather than fixed here: they are
outside this correction's boundary, and §13 forbids altering unrelated semantics.

### One measurement artefact, not a defect

The final `modules/customer/tests/integration` sweep reports **291 tests passed,
291 total** with four *suites* marked failed. Every failure is at suite level —
teardown, after the tests themselves passed — and the same four suites took 185
to 239 seconds in that sweep against 60 to 70 seconds normally, because it
overlapped the tail of the browser project on one machine. Re-run alone with
`--runInBand`: **4 suites / 47 tests, all passing.** Recorded rather than
quietly re-run, because a green number obtained on the second attempt is worth
less than one whose first attempt is explained.

### A rebuild trap worth recording

The first C1 live run failed at the first navigation with the *old* path while
the source was already correct. `nest build` had reused a stale
`dist/tsconfig.build.tsbuildinfo` and re-emitted the previous output. Both apps
are now built with `rm -rf dist` first, because the harness runs
`apps/api/dist/main.js` and requires `apps/worker/dist` — a stale `dist` produces
a green source tree and a red browser, which is exactly the class of failure this
correction exists to catch.

---

## Y. Follow-up closure

```text
FU-APP12-S03-09 = CLOSED_BY_APP12_S03_C1
```

The delivered `ORDER_ACCESS` link now lands on `/truy-cap/don-hang`, proved from
the exact delivered URL in all eight live journeys (§K, §L).

Unchanged:

| id | owner |
|---|---|
| `FU-APP12-S03-01` | `APP12-V02` |
| `FU-APP12-S03-02` | `APP12-V02` |
| `FU-APP12-S03-04` | `APP12-V02` |
| `FU-APP12-S03-03` | `APP12-H01` |
| `FU-APP12-S03-05` | `APP12-H01` |
| `FU-APP12-S03-08` | `APP12-H01` |
| `FU-APP12-S03-06` | `APP12-H02` |
| `FU-APP12-S03-07` | closed by `APP12-S03` |

New, recorded rather than fixed — both pre-existing, both proven so by stashing
every C1 change and re-running (§X):

| id | statement | owner |
|---|---|---|
| `FU-APP12-S03-C1-01` | `admin-shipping-detail.integration.spec.ts` fails 2 of 8: the customer shipping-fee acknowledgement route answers 404 where the suite expects 201. `APP9-B04-C1` behaviour, untouched by this correction. | **`APP12-H01`** |
| `FU-APP12-S03-C1-02` | `admin-order.contract.spec.ts`, `actor-context.integration.spec.ts` and `catalog-placement-boundary.spec.ts` each fail one assertion. Unrelated drift, exposed by scoped runs rather than introduced by them. | **`APP12-H01`** |
| `FU-APP12-S03-C1-03` | `pnpm --filter @embroidery/api lint` reports 4 errors — one `no-useless-escape` in `jest.app10-e01.config.mjs` and three `no-unnecessary-type-assertion` in `approve-design-version.use-case.ts`. Neither file is touched by this correction. | **`APP12-H01`** |

No new checkpoint id was created.

---

## Z. Parent report correction notice

Added to the top of `docs/implementation/reports/APP12-S03-COMPLETION-REPORT.md`,
verbatim as §30 requires:

> The first final live tier discovered that real ORDER_ACCESS notifications
> landed on /truy-cap. The harness temporarily substituted the path only to
> isolate and prove the S03 surface.
>
> Product Owner rejected the substituted bootstrap as final customer acceptance.
>
> APP12-S03-C1 made notification routing scope-aware and reran the live project
> from the exact delivered URLs with no substitution.

The discovery history is **preserved**. §Y.1 of that report — the evidence that
identified the gap from delivered source — stands as written; the two statements
in it that C1 supersedes are named in the notice and corrected here rather than
edited there. Its verdict block now reads `COMPLETE_AFTER_C1` /
`CORRECTION_USED = 1 / 1`, with the delivery-time values recorded beneath it, and
`FU-APP12-S03-09` is struck through and marked `CLOSED_BY_APP12_S03_C1`.

### ADR amendments

`ADR-APP4-001` gains two scope-qualifying notes and loses nothing:

- **§4 route authority** — the `/truy-cap` row is unchanged and remains the
  `REQUEST_ACCESS` landing; an APP12 amendment records `ORDER_ACCESS` →
  `/truy-cap/don-hang` and names APP12 as its owner.
- **§11 secure-link browser transport** — records that the path is chosen from
  the grant's persisted `scope_kind`, that the scope travels inside the sealed
  payload so the delivery job still consults no grant table, and that everything
  below the amendment applies to both landings.

**No row of the machine-checked §14.1 fact table was altered.** Those values are
APP4's, they remain literally true for the scope APP4 delivered, and reopening a
locked authority table is not this correction's business. `factTable()`
reconciliation in `check-app4-g01-authority.mjs` is unaffected.

---

## AA. Roadmap

```text
ROADMAP_STATUS = LOCKED
ROADMAP_LOCK   = LOCKED
CHECKPOINTS    = 38

APP12-S03    = COMPLETE_AFTER_C1
APP12-S03-C1 = COMPLETE   (1 / 1 — NO C2)
APP12-A01    = NEXT
```

Exactly one NEXT. `APP12-A01` was **not** started: no Admin UI, no category
management screen, no route, no component. No `S03-C2` and no `B04-C2` was
created, no checkpoint id was invented, and the 38 are unchanged.

Nothing was committed and nothing was pushed.
