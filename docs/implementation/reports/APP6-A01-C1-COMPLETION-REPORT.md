# APP6-A01-C1 — Completion Report

**Correction 1 of 1** for `APP6-A01` — Admin Quotation Workbench.

Closes the one obligation the first attempt admitted it had not met: the
real-browser acceptance review at **1440** and **1280**. Adds the Git/commit
evidence the first report omitted.

---

## A. Preflight

| Fact | Value |
| --- | --- |
| Branch | `production` |
| C1 entry HEAD | `77625439256a75eb513bb2f291b3bec410a8a178` |
| Entry working tree | **clean** — `git status --porcelain` empty |
| Unrelated user changes at entry | **none** |
| `1033880` reachable from HEAD | **yes** (`git merge-base --is-ancestor` → 0) |
| First A01 source committed? | **yes** — Case B |
| A01 implementation commit | `7762543` *feat(app6): deliver APP6-A01 Admin quotation workbench* |

The A01 commit is HEAD's tip, `77d4b71` behind it, `1033880` (APP6-B11) behind
that. Nothing was reset, stashed or restored.

---

## B. Secret handling

The Admin `(protected)` layout performs a **server-side** session check, so the
route cannot be reached without a real staff login. The dev database holds
exactly one `ACTIVE` staff account.

The credential was **requested from the operator once, through the prompt**, at
the start of C1 — after the Git and dev-stack inspection and before any browser
step. It was not read from `.env`, from any source file, from shell history,
from a log, from browser storage or from a committed fixture.

It was used only to establish the temporary staff session. **Its value does not
appear in this report, in source, in tests, in screenshots, in shell scripts, in
`.env`, in console output or in any commit**, and it was never passed as a
command-line argument.

`.env` was not written at any point in C1. No credential was rotated or
re-seeded. Re-running the `staff-bootstrap` one-shot (§C.2) returned
`REUSED_EXISTING`, which is the idempotent create-or-reuse path — it resolved the
existing admin and did not touch its credential.

A DOM/URL/storage probe at the end of the pass (§F.5) confirms no credential
material reached the page.

---

## C. Dev runtime refresh

### C.1 The API container

The first report noted the running API predated the `quotationId` bridge. Verified
before touching anything — the live `GET /api/docs-json` contained no
`quotationId` anywhere.

```text
node tools/docker-dev.mjs build api
node tools/docker-dev.mjs up -d --no-deps api
```

Only `embroidery-dev-api-1` was rebuilt and recreated. The whole stack was not
recreated. After restart:

```text
live OpenAPI operations = 78
AdminCustomRequestDetailResponse.quotationId = { type: string, nullable: true, format: uuid }
```

### C.2 The `staff-bootstrap` one-shot — an unplanned second stale runtime

The first live send returned **503 `QUOTATION_POLICY_UNAVAILABLE`**. Root cause
was **not** an A01 defect and not the locator bridge: `quotation.validity` was
**unpublished** in the dev database.

```text
policy_configurations before: worker.runtime only
```

`APP6-B01` publishes that policy through `PublishApp6PolicyUseCase`, which runs
inside the `staff-bootstrap` Compose one-shot. That one-shot last ran 34 hours
earlier, on an image built before APP6 shipped. The API was refusing correctly —
`quotation-validity-policy.ts` states that a fallback would put a validity window
in front of a customer that nothing published.

```text
node tools/docker-dev.mjs up --build --no-deps staff-bootstrap
→ [StaffBootstrap] result=REUSED_EXISTING staff reused admin=019f980f-…
```

```text
policy_configurations after: design_approval.agreements, notification.delivery,
quotation.deposit, quotation.validity, secure_grant, secure_link.resolve,
verification.challenge, worker.runtime   (8 keys, all published)
```

No policy value was invented. `validityDays = 7` comes from `ADR-APP6-001` §6.1 /
`IMP-D051` PO-03 and was published by the repository's own publication path, not
by a hand-written row.

### C.3 The Admin dev server

The route 404'd on first navigation although
`app/(protected)/requests/[requestId]/quotation/page.tsx` was present **inside**
the container. The dev server had been running for 34 hours and never registered
a route directory added after boot. `docker restart embroidery-dev-admin-1`
resolved it. The Admin service bind-mounts `apps/admin/src` and
`packages/api-client/src`, so no image rebuild was needed — but a **new App Router
route requires a dev-server restart**, consistent with the `APP1-S01B` finding.

---

## D. Live locator smoke — PASS

Seeded the exact discriminating case:

```text
custom_requests.code            = CR-A01C1-0001
custom_requests.current_quotation_id = NULL      ← the pointer
quotations.custom_request_id    → 019f9900-…-020 ← the relation
quotations.status               = DRAFT (never sent)
```

The screen **found and opened the quotation**. A pointer-derived locator returns
`null` for this row, so the bridge is proved on the exact case it exists for —
an unsent draft found again after a reload — against the live API, not a fixture.

---

## E. Browser environment

| | |
| --- | --- |
| Entry point | `http://admin.embroidery.local` via `embroidery-dev-gateway-1` (real hostname routing, not a direct app port) |
| Session | real staff login through `/login`, server-side `(protected)` check satisfied |
| Route | `/requests/{requestId}/quotation` — the actual protected route |
| Widths | 1440×900 and 1280×900 |
| Isolated component page used as acceptance | **no** |

Where the live database could not conveniently hold a state, the accepted
deterministic stub boundary was used **at the network layer, behind the
authenticated protected route** — never by bypassing the layout. States 4 and 6
were stubbed; every other state is live data.

---

## F. Desktop 1440 — 11 / 11 PASS

| # | State | Source | Result |
| --- | --- | --- | --- |
| 1 | Catalog draft | live (seeded product + variant) | **PASS** |
| 2 | COP draft | live | **PASS** |
| 3 | Validation error | live | **PASS** |
| 4 | Loading | stubbed delay | **PASS** |
| 5 | Empty — no quotation | live | **PASS** |
| 6 | Load error | stubbed 500 | **PASS** |
| 7 | Sent — immutable read-only | live (real send) | **PASS** |
| 8 | Send confirmation | live | **PASS** |
| 9 | Send in progress | live + delayed route | **PASS** |
| 10 | Accepted outcome | live | **PASS** |
| 11 | Version history + exact selected detail | live (two versions) | **PASS** |

Detail worth recording:

**1 vs 2 — the §9 contrast, proved live on both branches.** The catalog request
offers line kinds `[Sản phẩm, Thêu, Phí số hoá, Khác]`; the COP request offers
`[Thêu, Phí số hoá, Khác]`. **COP publishes no `PRODUCT` line.**

**3 — validation is local.** Three field messages, `aria-invalid` on the three
offending inputs, and the network log for the interaction shows **three GETs and
no POST**: the bad form never reached the server.

**4 vs 5 — loading is not empty.** Under a 4s delay the screen showed
`Đang tải báo giá…` with `aria-busy`, and *not* `Yêu cầu này chưa có báo giá`.
The empty state renders only when the locator is known to be absent.

**7 — a real send.** Committed live: version `SENT`, `valid_until = sent_at + 7
days` (the published policy, not a hard-coded 7), `quotations.current_version_id`
set, request projected to `QUOTED`. The screen then re-read the context and the
rail changed to **Đã báo giá** — proof the post-send refresh is real and the
status is never synthesized.

**8 / 9 — the dialog names the exact version.** *"Phiên bản 1 sẽ được gửi…"*, and
at 1280 later, *"Phiên bản 2"* — the selected draft, not the newest or the sent
one. During flight the open button carried `disabled` + `aria-busy="true"` and
the confirm button read `Đang gửi…`.

**10 — accepted claims nothing it cannot.** No send action, **no new-version
action** (no unsupported post-acceptance re-quote), no authoring form, and a scan
for `thanh toán` / `đơn hàng` / `tồn kho` / `hoá đơn` returned **nothing**.

**11 — the two pointers stayed distinct on screen.** History rendered v1
`Đã gửi` + **Khách đang xem** and v2 `Bản nháp` + **Đang chọn** — customer-current
and selected on *different rows*. Selecting v1 rendered v1's own frozen figures
(`1.200.000 ₫` line, `1.234.567 ₫` total) and not v2's `1.354.567 ₫`, with the
immutability notice and no send action.

**Exact money, live.** `1.234.567 ₫` rendered from the stored string; v2's
server-computed `1.354.567 ₫` (12 × 110.000 + 34.567) appeared only after the
round trip. The browser computed no subtotal, total, deposit or remainder.

### F.5 §17 — proved live, and unplanned

The 503 in §C.2 was a genuine server failure carrying an exception name, a source
file path, a line number, a stack and a raw server message. The screen rendered:

> **Không gửi được báo giá** — Chưa có gì được gửi đi. Hãy thử lại.

A scan for `HttpException`, `/app/apps`, `503`, `QUOTATION_POLICY_UNAVAILABLE`,
`requestId` and the server message returned **zero hits**. The wording was also
*true*: nothing had been sent.

The state-6 stub repeated the test deliberately, with a payload carrying SQL
(`relation "custom_requests" does not exist`), a file path, an error code and a
request id. Rendered heading: **Không tải được báo giá**, with a retry action.
**Zero leaks.**

---

## G. Narrow 1280 — PASS (`690:92`)

Measured on the protected route, sent read-only state:

| Requirement | Measurement | Result |
| --- | --- | --- |
| Admin sidebar preserved | `nav` present and visible, 264px, unchanged | **PASS** |
| Right rail wraps below main (<1360 rule) | rail `top = 2109` vs panel `top = 242`, `height = 647` → rail sits below | **PASS** |
| Rail spans the column when wrapped | rail `857px` = panel `857px` | **PASS** |
| Main content usable | main `1001px`, panel `857px` | **PASS** |
| Tables scroll inside their own container | see below | **PASS** |
| Send dialog fits viewport | `480×190` at `(393, 355)` → `fitsFully = true`, confirm reachable | **PASS** |
| Primary actions reachable | 0 of the visible buttons/links fall outside the viewport | **PASS** |
| Page-wide horizontal overflow | `scrollWidth − clientWidth = 0`, `body.scrollWidth = 1265` | **NONE** |
| Mobile Admin redesign | none — no layout below the accepted narrow rule was introduced | **NONE** |

**Table containment was proved, not merely configured.** Both scrollers carry
`overflow-x: auto` and at 1280 their content fits (`scrollWidth 823 = clientWidth
823`), which on its own proves nothing. Forcing the history table to
`min-width: 2000px`:

```text
scroller scrollWidth 2000 > clientWidth 823   → the scroller scrolls
page scrollWidth − clientWidth = 0            → the page does not
```

The overflow is absorbed by the container and never reaches the page.

**Dialog focus.** Focus moved into the dialog on open (`Huỷ`), and `Escape`
closed it and returned focus to the invoking control — verified by identity at
both widths (`document.activeElement === [data-testid="quotation-send-open"]`).

**Overlap.** An automated pairwise box check flagged `header × sidebar` and
`header × panel`. Both are the Admin shell's `position: sticky` header over
scrolled content. At `scrollTop = 0` the sidebar (`top 69`) and the panel
(`top 242`) both begin at or below the header's bottom edge (`69`) — **no real
overlap**, and the sticky header is pre-existing shell behaviour, not A01's.

---

## H. Console and network review

All messages captured across the whole session:

| Message | Verdict |
| --- | --- |
| `favicon.ico` 404 | pre-existing Admin shell, not A01 |
| `/requests/…/quotation` 404 | the first navigation, *before* the dev-server restart of §C.3; resolved |
| `webpack-hmr` WebSocket 502 ×2 | Next dev HMR through the gateway, which does not proxy the WS upgrade — dev tooling only, absent from the production build |
| `…/send` 503 | the unpublished-policy refusal of §C.2; resolved, and its handling is the §17 proof |
| `…/custom-requests/…` 500 | **the deliberate state-6 stub** |

```text
React errors            = 0
Hydration errors        = 0
Application errors      = 0
Unexpected A01 request failures = 0
```

Every A01 read observed on the wire returned 200: the context read, the version
history, and the exact-version detail — in that order, addressed by the route id
and then by the resolved locator.

### Credential leak probe

```text
URL query/hash        = none (clean path URL)
password inputs with value = 0
DOM mentions of a password field = false
localStorage/sessionStorage = only Next dev debug channels
document.cookie (JS-visible) = empty  → the session cookie is HttpOnly
```

**No secret or credential appears in the URL, DOM or console.**

---

## I. Defects found and fixed

The browser pass found **two real copy defects**. Both are narrow presentation
fixes; no redesign, no backend change, no Figma mutation.

### I.1 The context rail rendered a raw server enum

`quotation-request-context.tsx` rendered `{detail.status}` directly, putting
**`UNDER_REVIEW`** in front of an operator on an otherwise fully Vietnamese
screen — the one place on the page a server token leaked into the UI.

The neighbouring `APP5-A02` feature states this exact rule in its own
`request-detail-presentation.ts`: *"An unmapped enum member degrades to a neutral
label rather than putting `NEEDS_CLARIFICATION` in front of an operator."* A01
had a presenter for version status and line kind but none for request status.

**Fix.** `REQUEST_STATUS_LABELS` + `presentRequestStatus()` in
`quotation-presentation.ts`, alongside the existing `presentVersionStatus` /
`presentLineKind`, using the same total-function shape (unmapped or non-string →
neutral label). Copy strings match the ones `APP5-A02` already renders for the
same statuses, because the operator moves between the two screens and a request
must not change its name in transit.

The labels are **not local invention**: the ten statuses are the
`ck_custom_requests__status_allowed` allow-list, and the Vietnamese strings are
`APP5-A02`'s approved `CUSTOM_REQUEST_DETAIL_COPY.status` values.

Verified live: the rail now reads **Đang xem xét**, and after the real send
**Đã báo giá**, and in the accepted state **Đã nhận báo giá**.

### I.2 The version-history column borrowed the wrong label

`quotation-version-history.tsx` used `COPY.context.status` — *"Trạng thái yêu
cầu"*, the **request's** status — as the header for a column that renders the
**version's** status. The same page named two different things identically, and
the browser exposed it because both strings were on screen at once contradicting
each other.

**Fix.** `COPY.versionStatus.column = 'Trạng thái'`, and the header now uses it.

Figma could not be consulted directly — the Figma MCP server is unauthenticated
in this session. This is **not** stop-condition 4: registry evidence resolves the
node (`FIG-APP6-A01-VERSION-HISTORY-DESKTOP`, `690:3`,
`APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP6-D01-PO-001`), and no
business copy was invented — a column was given a label describing its own
contents instead of an unrelated one. `FIGMA_DESIGN_INDEX.md` was not modified.

### I.3 A test that encoded the defect

`request-quotation-bootstrap.test.tsx` asserted
`toHaveTextContent('UNDER_REVIEW')` — it **locked in** the defect rather than
catching it. This is why 82 green tests coexisted with a raw enum on screen: the
suite asserted the wrong thing, confidently. Corrected to assert the
operator-facing label *and* that the token is absent.

---

## J. Non-defects deliberately not "fixed"

| Observation | Why it is not an A01 defect |
| --- | --- |
| 503 on the first live send | `quotation.validity` unpublished in the dev DB. Environment data, resolved through the repository's own publication path (§C.2). The API's refusal is correct behaviour. |
| Sticky-header box overlap | Pre-existing Admin shell behaviour; no overlap at `scrollTop = 0` (§G). |
| HMR WebSocket 502 | Dev tooling through the gateway; absent from the production build. |
| `favicon.ico` 404 | Pre-existing shell. |

---

## K. Tests

| Suite | Before C1 | After C1 |
| --- | --- | --- |
| `test/model/request-quotation-model.test.ts` | 41 | **44** |
| `test/components/request-quotation-bootstrap.test.tsx` | 21 | **21** (1 corrected) |
| `test/components/request-quotation-send.test.tsx` | 20 | **20** |
| **Total** | 82 | **85 passing, 3 suites** |

Three new tests:

1. **every** request status the lifecycle can hold gets a label that is neither
   the raw token nor the neutral fallback — all ten, not one sample, because the
   defect *was* a missing mapping and a single-value test is exactly what misses
   it;
2. an unmapped or non-string status degrades instead of echoing;
3. the history column label is distinct from the request-status label.

**Mutation-proved.** Deleting the `UNDER_REVIEW` row from `REQUEST_STATUS_LABELS`
fails exactly one test — *"labels every request status the lifecycle can hold"* —
and nothing else. Source restored and re-run green.

---

## L. Checks run, and the changed input justifying each

| Command | Why it was justified |
| --- | --- |
| `npx jest test/model/… test/components/…` (×3 suites) | the owning A01 tests; source and tests changed |
| mutation run of the same model suite | to prove the new tests discriminate |
| `npx tsc --noEmit -p tsconfig.json` (`apps/admin`) | TS/TSX changed → clean |
| `npx eslint` over the A01 feature, route and three suites | same files changed → clean |
| `npx prettier --write` over the six changed files | formatting gate → all already formatted |
| `git diff --check` | whitespace → clean |
| `npx next build` (`apps/admin`) | components changed; re-proves the route registers and the stylesheet compiles for real → green, `/requests/[requestId]/quotation` listed |
| live `GET /api/docs-json` | confirms the refreshed API publishes `quotationId` and still exposes **78** operations |

**No backend source was changed by C1**, so no API test suite was re-run: the
first attempt's locator 6/6, request-detail 15/15 and contract 10/10 stand on
unchanged inputs. Re-running them would have been a successful command on
unchanged inputs.

### Deliberately not run (§8)

B11 races/decisions; B10 public review; B09/B08 design suites; B05 quote decision
suites; full B03 send; the full quotation module; full API regression; the full
repository suite; worker; Storefront; full Playwright/E2E; DB
manifest/fingerprint/checksum/index gates; migration generation; APP3 P01/P02/
session suites; historical APP3/APP4/APP5 gate sweeps; the Figma checker; full
SonarQube.

None of their owned source was touched.

---

## M. Invariants re-confirmed

```text
FIGMA MUTATION            = NONE
NEW HTTP OPERATIONS       = 0
OPENAPI OPERATIONS        = 78   (verified against the live refreshed API)
DATABASE MIGRATION        = NONE (36)
GENERATED FILES EDITED    = NONE
BACKEND SOURCE CHANGED    = NONE
.env WRITTEN              = NO
CREDENTIAL ROTATED        = NO
```

Dev-database rows were seeded for the browser pass (three requests, one
quotation with two versions, one category/product/variant, one customer). These
are development fixtures in a disposable database — no migration, no schema
change, no repository file.

---

## N. Git closure

| Fact | Value |
| --- | --- |
| A01 implementation commit | `7762543` *feat(app6): deliver APP6-A01 Admin quotation workbench* |
| C1 commit | `19f17e3` *fix(app6): close APP6-A01 browser acceptance* |
| Final HEAD | `19f17e3` |
| `git status --porcelain` at completion | **empty** |
| Pre-existing unrelated changes | **none** |
| Pushed | **no** |

History was not amended. C1 is a separate commit on top of `7762543`, because C1
changed source — the `docs(...)`-only variant did not apply.

---

## O. Follow-ups

```text
FU-APP6-A01-BROWSER-REVIEW-01 = CLOSED_BY_APP6_A01_C1
```

Carried unchanged and **not** repaired by C1:

```text
FU-ADMIN-SHARED-DIALOG-01
FU-APP6-B02-NULLABLE-OBJECT-TYPE-DEBT-01
FU-APP6-B03-REQUOTE-AFTER-ACCEPTANCE-01
FU-APP6-B10-AGREEMENT-ACTOR-01
FU-APP6-B08-P01-GATE-01
FU-APP6-DB01-01
FU-APP6-B03-ORDER-AGGREGATE-SUITE-RED-01
FU-APP6-B01-APP4-POLICY-CHECKER-MIGRATION-COUNT-01
FU-APP6-B01-CODE-GENERATOR-PROMOTION-01
```

One new, non-blocking:

```text
FU-APP6-A01-C1-REQUEST-STATUS-COPY-DUPLICATION-01
```

`APP5-A02` and `APP6-A01` now each own a private map of the same ten request-status
labels. Promoting one to Admin-shared scope is the right end state, but it edits a
delivered APP5 feature and is outside a correction's boundary. Recorded, not done.

---

## P. Acceptance

```text
APP6-A01-C1 = COMPLETE

ADMIN SESSION = REAL / PROTECTED ROUTE
CREDENTIAL WRITTEN TO REPO/REPORT/LOG = NO

STALE DEV API FOR LOCATOR BRIDGE = REFRESHED
STALE STAFF-BOOTSTRAP POLICY PUBLICATION = REFRESHED
QUOTATION LOCATOR LIVE SMOKE = PASS

BROWSER 1440 = PASS
  Catalog draft = PASS
  COP draft = PASS
  validation = PASS
  loading = PASS
  empty = PASS
  error = PASS
  sent readonly = PASS
  send confirm = PASS
  send pending = PASS
  accepted = PASS
  version history/detail = PASS

BROWSER 1280 = PASS
RIGHT RAIL WRAP = PASS
TABLE INTERNAL SCROLL = PASS
DIALOG FIT = PASS
PAGE-WIDE HORIZONTAL OVERFLOW = NONE
MOBILE ADMIN REDESIGN = NONE

CONSOLE HYDRATION/APPLICATION ERRORS = NONE
UNEXPECTED A01 NETWORK FAILURES = NONE
SECRET LEAK IN URL/DOM/CONSOLE = NONE

DEFECTS FOUND = 2 (both copy) + 1 test encoding a defect
DEFECTS FIXED = 3

FIGMA MUTATION = NONE
NEW HTTP OPERATIONS = 0
DATABASE MIGRATION = NONE
OPENAPI OPERATIONS = 78

FU-APP6-A01-BROWSER-REVIEW-01 = CLOSED

LOCAL COMMIT EVIDENCE = RECORDED
FINAL TREE = CLEAN
PUSHED = NO

APP6-A01 = COMPLETE
NEXT CHECKPOINT = APP6-A02
```

`APP6-A02` was not started.
