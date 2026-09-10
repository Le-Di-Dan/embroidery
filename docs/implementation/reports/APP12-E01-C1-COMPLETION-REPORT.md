# APP12-E01-C1 — Completion Report

SMTP `ORDER_ACCESS` secure-link delivery correction. The single authorized
correction of `APP12-E01` (2026-09-10).

## A. Verdict

```text
APP12-E01-C1 = COMPLETE — AWAITING_PO_REVIEW
APP12-E01    = COMPLETE_AFTER_C1 — AWAITING_PO_REVIEW

WAVE1_RUNTIME_REGRESSION                 = PASS
READY_MADE_RUNTIME_BLOCKERS_OWNED_BY_E01 = 0

FU-APP12-E01-01 = CLOSED
FU-APP12-H02-01 = CLOSED

E01_CORRECTION_USED = 1/1
NO_E01_C2           = true

APP12-R01           = NOT_EXECUTED
PRODUCTION_DEPLOYED = false
PUSHED              = false
```

Changes made: the SMTP adapter now picks a renderer by `secretKind`, and there
is a second renderer for the secure-order-link email. The E01 browser harness
also had a defect that had not been reachable before this fix, and it is
corrected here (§J). No API, migration, route, lifecycle or grant semantics
changed.

## B. Base E01 blocker reconciliation

| Item | At E01 | After C1 |
|---|---|---|
| `FU-APP12-E01-01` — `ORDER_ACCESS` link not delivered over SMTP | BLOCKING | **CLOSED** (§D, §I, §J) |
| `FU-APP12-H02-01` — delivered-link origin composition | BLOCKING, superseded by E01-01 | **CLOSED** (§H) |
| `CMD-TEST-APP12-E01-SMTP-SECURE-LINK` | red (1 of 3 cases failed) | **15/15** |
| `app12-e01-commerce-chromium` | 2 passed, 1 failed, 3 did not run | **7/7**, and the 3 cases that had not run now pass |

The root cause was the one E01 measured. `SmtpNotificationChannelAdapter.send`
called `renderVerificationEmail` for every delivery. So a `SECURE_LINK_TOKEN`
went out as "Mã xác thực email" with the bearer token shown as a code, the
window shown as "4320 phút", and no link.

## C. Product-copy authority

`APP12-E01-C1` §2 is the canonical PO copy authority. The strings are
transcribed verbatim into `SECURE_ORDER_LINK_COPY`:

| Element | Copy |
|---|---|
| Subject | `Liên kết theo dõi đơn hàng Nét Thêu` |
| Heading | `Theo dõi đơn hàng của bạn` |
| Body | `Đơn hàng của bạn đã được tạo.` / `Mở liên kết bảo mật bên dưới để xem trạng thái đơn hàng và tiếp tục các bước cần thiết.` |
| CTA | `Mở đơn hàng` |
| Expiry (72 h) | `Liên kết có hiệu lực trong 72 giờ.` |
| Safety | `Nếu bạn không nhận ra đơn hàng này, hãy bỏ qua email.` |

The message has no marketing copy. The wire suite copies these strings from
the prompt as its own literals. It does not import them from the renderer, so
a copy regression in the renderer would fail the suite.

The worker does not depend on `@embroidery/i18n`. The verification email
(`APP12-N01`, PO-closed) also keeps its copy inside its own renderer, and this
change follows that precedent. `check-i18n-static-text` scans only
`apps/storefront/src` and `apps/admin/src`, so the i18n gates do not apply to
this change.

## D. SMTP render dispatch

`smtp-notification-channel.adapter.ts` → `renderMessage(delivery)`:

```text
VERIFICATION_CODE                  → renderVerificationEmail(...)
SECURE_LINK_TOKEN + secureLinkUrl  → renderSecureOrderLinkEmail(...)
SECURE_LINK_TOKEN, no URL          → undefined → FAILED, retryable=false, nothing sent
any other kind                     → undefined → FAILED, retryable=false, nothing sent
```

- The dispatch reads only `secretKind`. It does not look at token length, TTL
  or shape. The two kinds are `satisfies DeliverySecretKind` constants, the
  same pattern `notification-delivery.usecase` uses.
- There is no default branch. The old defect was a default branch.
- The refusal is permanent. The use case already turns an origin gap into the
  retryable `NOTIFICATION_LINK_ORIGIN_UNAVAILABLE` before it calls the port. So
  a link-less `SECURE_LINK_TOKEN` can only reach the adapter through an
  upstream defect, and retrying will not fix that.
- The refusal log line names only the kind, which comes from a closed set. It
  never includes the secret, the recipient or the link.

## E. Verification-email preservation

`renderVerificationEmail` output did not change. The only edit moves
`BRAND_NAME` and `escapeHtml` into `domain/email-content.ts`. `BRAND_NAME` is
re-exported, and `VerificationEmailContent` is an alias of the shared
`EmailContent`. The existing `verification-email.renderer.spec.ts` passes
unchanged.

New SMTP regression cases (`smtp-notification-channel.adapter.spec.ts`,
"verification-email preservation"):

- the subject is still `Mã xác thực Nét Thêu`;
- the body is still `Mã xác thực email` and shows the code;
- the window is still `10 phút` with no `giờ`, so the OTP TTL wording is
  unchanged;
- the message contains no `Mở đơn hàng`, no secure-order heading, no
  `/truy-cap/don-hang` and no `<a` anchor;
- a `VERIFICATION_CODE` that somehow carries a `secureLinkUrl` still renders as
  an OTP, which proves the dispatch uses the kind and not field presence.

The adapter suite passes 18/18.

## F. Secure-link email renderer

`domain/secure-order-link-email.renderer.ts` (158 lines) is a separate
renderer, not a template framework. `domain/email-content.ts` (51 lines) holds
three shared low-level pieces: `BRAND_NAME`, `EmailContent` and `escapeHtml`.
It has no shared layout function, on purpose, per §12.

- The HTML CTA is `<a href="{secureLinkUrl}">Mở đơn hàng</a>`. The full URL is
  also printed as text under the CTA.
- The plain-text part prints the full URL on a line of its own.
- `secureLinkValidity(issuedAt, expiresAt)` returns hours, rounded up, for any
  window of an hour or more, and minutes only below an hour. 72 h renders as
  `72 giờ`, 90 min as `2 giờ`, 15 min as `15 phút` and 0 as `1 phút`. It holds
  no TTL of its own.
- The renderer escapes the `href`. A crafted `"><script>` URL comes out inert,
  and a test covers that.

The renderer spec passes 10/10.

## G. Bearer-token security

| Rule (§6) | Evidence |
|---|---|
| The token appears only inside the authoritative URL | wire case: every token occurrence has a `#t=` prefix, and there is at least one |
| The token is never labelled as an OTP/code | no `Mã xác thực` in the subject or body |
| The token is not in the subject or heading | wire case |
| No standalone fallback token | missing URL → `FAILED`, 0 messages captured |
| The token and SMTP password are not in logs | wire case captures stdout and stderr across a successful send and a refused send: no token, no link, no password, no recipient |

ORDER_ACCESS grant issuance, TTL, scope and fragment semantics are unchanged.
No file under `apps/api` was modified.

## H. Origin/path/fragment proof (`FU-APP12-H02-01`)

The link comes from the SMTP message the capture listener received. The
composed worker resolved `SmtpNotificationChannelAdapter`, which was read from
the DI graph and not from the environment.

```text
[app12-e01-commerce] {"smtpCaptureListening":true,
  "channelAdapter":"SmtpNotificationChannelAdapter",
  "orderAccessOrigin":"http://embroidery.local:8090", ... }
```

| Assertion | Result |
|---|---|
| origin = configured `STOREFRONT_PUBLIC_ORIGIN` | pass |
| pathname = `/truy-cap/don-hang` | pass |
| fragment carrier `#t=` present | pass |
| no query string (`carriesQuery=false`) | pass |

The adapter does not compose URLs. It places the string that
`notification-delivery.usecase` → `renderSecureLinkUrl` built.

## I. SMTP wire evidence

`CMD-TEST-APP12-E01-SMTP-SECURE-LINK` sends the delivery over a real loopback
SMTP session with synthetic credentials. It passes **15/15**:

- the message reaches the recipient, and it carries the link;
- the token is not rendered as an OTP;
- subject = `Liên kết theo dõi đơn hàng Nét Thêu`;
- the heading, body and safety line are present;
- one anchor carries **both** `href = exact secureLinkUrl` and the text
  `Mở đơn hàng`;
- the isolated `text/plain` part contains the full URL;
- `Liên kết có hiệu lực trong 72 giờ.` is present, and no `4320 phút` or
  `\d+ phút` appears;
- the message has no verification wording, has both parts, and is sent once;
- the token appears only inside the URL, and not in the subject;
- a missing URL fails closed and sends nothing;
- an unknown kind fails closed and sends nothing;
- logs contain no token, link, password or recipient.

## J. Browser ORDER_ACCESS proof

Disposable production-like world: real API, in-process worker on
`NOTIFICATION_TRANSPORT=SMTP`, freshly built Storefront and Admin, real Nginx
gateway, disposable PostgreSQL and MinIO, and the SMTP capture listener.

1. A normal Ready-Made order is placed through the delivered checkout. The OTP
   is read from the SMTP message.
2. The worker emits the `SECURE_LINK_TOKEN` notification.
3. The capture listener receives the secure-order email.
4. `secureLinkFrom` parses the URL from that message.
5. Chromium opens that exact string.
6. The claim succeeds: the `Đang chờ phí giao hàng` heading renders.
7. The fragment is stripped: `location.hash === ''`.
8. The correct order renders: `.secure-order__order-line` contains the placed
   order code. This assertion is new.

**A harness defect found and fixed.** This path had never run before. On its
first run, steps 3–5 passed, and step 6 landed on
"Liên kết không sử dụng được". The cause: quoted-printable encodes `=` as
`=3D`, so the delivered carrier travels as `#t=3D<token>`.
`support/app12/e01-secure-link.mjs` only removed soft breaks, so it recovered
`#t=3D…`. That URL passes every shape check (origin, path, fragment) and holds
a token the resolver rejects. The reader now decodes quoted-printable fully:
soft breaks and `=XX` bytes. The product was correct, and a real mail client
decodes this. The verification lane never hit this problem because a six-digit
code has nothing to escape. The new step-8 order-code assertion means a
mangled token can no longer pass silently.

## K. Cross-order isolation

A new case places a **second** real order, and opens each delivered link in
its own fresh browser context:

- link B renders order B and does not contain order A's code;
- link A, opened afterwards, renders order A and does not contain order B's
  code.

```text
"crossOrderIsolation": true
```

The first version of this case opened both links in the same page and failed.
That was expected: `APP12-U01-C1` recorded that a second `goto` on this route
is only a same-document fragment change, so the claim never re-runs. Separate
contexts are the right model, because these are two different recipients.
Grant scope was not changed. The API tier's expired, revoked and non-existent
grant denial matrix (`CMD-TEST-APP12-E01-API`, J3) is unaffected, and I did
not rerun it because no API code changed.

## L. E01 commerce rerun

`CMD-E2E-APP12-E01` (`pnpm --filter @embroidery/e2e-testing e2e:app12:e01`),
final run:

| Project | Result |
|---|---|
| `app12-e01-commerce-chromium` | **7 passed** |
| `app12-e01-review-chromium` | **1 passed** |
| `app12-e01-public-chromium` | **8 passed** |
| total | **16 passed** in 49.4 s |

The runner has no project filter, so the review and public projects ran too.
I added a `--only=` filter to `run-e2e.mjs` and then reverted it, because it
pushed that file (already 1 190+ lines) further over the 400-line hard limit.
The mode ran three times in total:

| Run | commerce | review | public |
|---|---|---|---|
| 1 | 7/7 | 1/1 | 7/8 — checkout response carried no CSP header |
| 2 | 7/7 | 0/1 — `locator.fill` timeout, email input still disabled (pre-hydration) | 8/8 |
| 3 | 7/7 | 1/1 | 8/8 |

Commerce passed on all three runs. The review failure and the public failure
never happened in the same run. Each passed on the other two runs. Neither
project touches any line this correction changed: review runs on the
RECORDING transport, and public is anonymous. I record them as intermittent
harness timing failures (see §W), not as regressions. I am not claiming a root
cause for either.

## M. Prior E01 closure guard

| Closure | Status after C1 |
|---|---|
| worker bootstrap (`FU-APP12-H07-03`) | unchanged; `apps/worker/src/main.ts` not touched |
| fresh-build authority (`FU-APP12-H08-04`) | re-proved in commerce case 2: served `BUILD_ID` matches the fresh build, and the bogus-ID control returns 404 |
| checkout CSP (`FU-APP12-H02-03`) | public project: 0 executable-inline violations on the final run |
| `PAYMENT_UNDER_REVIEW` a11y (`FU-APP12-H08-06`) | review project passed on the final run |
| B03 DTO metadata | OpenAPI check up to date |
| Product Detail design-authority gate | not touched |

## N. Figma/design disposition

`FIGMA_DESIGN_INDEX.md` registers Storefront and Admin screens only. No
current frame models any email message, ORDER_ACCESS or otherwise.

```text
FIGMA_SECURE_LINK_EMAIL_RECONCILIATION = NOT_REQUIRED
FIG-APPROVAL-APP12-E01-C1-SECURE-LINK-EMAIL-PO-001 = not applied (no frame to reconcile)
Registry changed = no
```

The carried U01 Figma-copy item remains a pre-R01 item. This correction did not
touch it.

## O. Files changed

Runtime:

- `apps/worker/src/jobs/notification-delivery/domain/email-content.ts` (new)
- `apps/worker/src/jobs/notification-delivery/domain/secure-order-link-email.renderer.ts` (new)
- `apps/worker/src/jobs/notification-delivery/domain/verification-email.renderer.ts`
  (shared primitives only; output unchanged)
- `apps/worker/src/jobs/notification-delivery/infrastructure/channel/smtp-notification-channel.adapter.ts`
  (dispatch)

Tests and harness:

- `apps/worker/src/jobs/notification-delivery/domain/secure-order-link-email.renderer.spec.ts` (new)
- `apps/worker/src/jobs/notification-delivery/infrastructure/channel/smtp-secure-link.spec.ts`
- `apps/worker/src/jobs/notification-delivery/infrastructure/channel/smtp-notification-channel.adapter.spec.ts`
- `packages/e2e-testing/specs/app12/e01-commerce.acceptance.spec.ts`
- `packages/e2e-testing/support/app12/e01-secure-link.mjs`

Docs:

- `docs/implementation/SCOPED_COMMAND_INDEX.md` (`CMD-E2E-APP12-E01` and
  `CMD-TEST-APP12-E01-SMTP-SECURE-LINK` descriptions: red → green)
- `docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md`
  (row 31)
- this report

## P. File-size

`node tools/check-file-size.mjs --paths apps/worker/src/jobs/notification-delivery packages/e2e-testing/specs/app12/e01-commerce.acceptance.spec.ts packages/e2e-testing/support/app12/e01-secure-link.mjs`
→ **passed**, 40 files, 1 above the review threshold. The one file over is
`notification-delivery.usecase.ts` at 362 lines, which was already over and
was not modified. Adapter: 248 lines. Renderer: 158 lines. All changed tests
are under 500 lines.

## Q. Validation

| Command | Result |
|---|---|
| `git diff --check` | clean |
| `pnpm --filter @embroidery/worker exec tsc --noEmit` | clean |
| `pnpm --filter @embroidery/worker lint` | clean |
| `pnpm --filter @embroidery/e2e-testing exec tsc --noEmit` | clean |
| `pnpm --filter @embroidery/e2e-testing lint` | clean |
| `CMD-TEST-APP12-E01-SMTP-SECURE-LINK` | **15/15** |
| verification-email SMTP regression (`smtp-notification-channel.adapter.spec.ts`) | **18/18** |
| renderer spec (`secure-order-link-email.renderer.spec.ts`) | **10/10** |
| `pnpm --filter @embroidery/worker test` (Docker-free unit tier) | **72 suites, 1 183 tests passed** |
| `CMD-E2E-APP12-E01` | **16/16** (final run; §L) |
| `pnpm --filter @embroidery/api openapi:check` | up to date |
| `pnpm --filter @embroidery/api-client check:generated` | up to date |
| `prettier --check` (changed files) | clean |
| scoped file-size | pass (§P) |
| `node tools/check-report-secrets.mjs` | pass |
| i18n gates | not applicable (§C) |
| Figma design-index gate | not run; registry unchanged (§N) |

## R. Shared-dev integrity

```text
shared_dev_mutations   0
shared dev database    embroidery — 79 tables, orders = 0 (read only)
```

Every commercial write went to a disposable `embroidery_db7_e2e_*` database
that the orchestrator created and dropped. No command in this checkpoint
connected to the shared `embroidery` database except the read-only census
above. I did not write to `.env` or rotate any credential. I did not use any
secret-bearing variable; the orchestrator generates ephemeral material for
each run.

## S. Disposable teardown

Every browser run, including the failing ones, ended with:

```text
[e2e] cleanup verified: all E2E ports closed, disposable database dropped
```

After the last run, no `embroidery_db7_e2e_*` database remains. The listing
still shows older `embroidery_db7_*` leftovers (`app6_b05_race_*`,
`app12_e01_j1_*`, `db10_*`). Earlier checkpoints created those; this one did
not create or touch them.

## T. Final baseline

```text
OpenAPI            129 paths / 143 operations / 284 schemas   unchanged
public operations  49                                         unchanged (no API change)
migrations         39  (last 0039; no 0040)                   unchanged
DB tables          79                                         unchanged
Admin routes       26                                         unchanged (no route file touched)
Storefront routes  20                                         unchanged (no route file touched)
readiness criteria 10                                         unchanged
```

## U. Follow-up closure

```text
FU-APP12-E01-01 = CLOSED   (§D, §I, §J)
FU-APP12-H02-01 = CLOSED   (§H)
```

No new blocking follow-up was opened.

## V. E01 final status

```text
APP12-E01    = COMPLETE_AFTER_C1 — AWAITING_PO_REVIEW
APP12-E01-C1 = COMPLETE — AWAITING_PO_REVIEW
E01_CORRECTION_USED = 1/1
NO_E01_C2 = true
```

## W. R01 prerequisites still outstanding

- PO review of this correction and of E01 as a whole.
- The carried U01 Figma-copy item (pre-R01).
- The real-inbox manual check: whether a real provider accepts and files this
  new message. It was captured, not delivered, per `APP12-N01`, and it needs
  the operator's credentials and a human.
- Watch item, not blocking: the two intermittent E01 harness failures in §L
  (review pre-hydration fill timeout; missing CSP header on one checkout
  response).

`APP12-R01` was not executed. Nothing was deployed. Nothing was pushed.
