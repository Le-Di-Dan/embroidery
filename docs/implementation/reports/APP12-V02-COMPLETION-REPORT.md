# APP12-V02 — Systemic UI/UX Correction, i18n Foundation & Live Re-verification (Wave 1)

**Checkpoint:** `APP12-V02` · **Phase:** APP12 (LOCKED at 38 checkpoints)
**Branch:** `feat/app11-s04-seo-infrastructure` · **Not pushed.**

---

## A. Verdict

**COMPLETE — ready for Product Owner review.**

All **2 CRITICAL** and all **15 HIGH** `APP12-V01` findings are closed. All 32
findings carry exactly one disposition. Every claim below was measured against a
production build through the real Nginx gateway with a disposable Postgres and
MinIO behind it — the same harness that produced the V01 baseline.

```text
V01 audit harness, re-run          29/29   (21 audit + 8 performance)
H08 accessibility & compatibility  26/26   Chromium · Firefox · WebKit
axe violations, every route/state       0
contrast token pairs                15/15
apps/storefront jest              2533/2533
apps/admin      jest              1930/1930
packages/i18n   jest                24/24
tools (node:test)                   26/26
```

**Two things are recorded rather than fixed, and both are named to the Product
Owner rather than buried:**

1. `/kham-pha` at 1024 keeps three columns. §27 preserves the locked 5/3/2
   direction and the audited UI02 **tablet frame is 1024**, so the fourth column
   V01 asks for is a change to an approved frame. That is a design decision, not
   a runtime one.
2. `admin/login/1024` overflows horizontally by 292px — in the V01 capture and in
   this one. It is not one of the 32 findings and this checkpoint did not touch
   it.

**Not done, by instruction:** `APP12-G03` is not started, nothing is deployed,
and nothing is pushed.

---

## B. V01 PO reconciliation

`APP12-V01 = COMPLETE — PO PASS` is unchanged: nothing here reopens, re-scores or
re-litigates a V01 finding.

Two places where the Product Owner **overrode** V01's own remediation direction,
and both overrides were followed:

| finding | V01 proposed | §42/§21.4 disposed | what was built |
|---|---|---|---|
| `V01-UX-032` | fall back to the most recent order's recipient name as the customer's display name | `FIX_UI_WITHOUT_IDENTITY_FABRICATION` — `recipient != customer identity` | no name invented anywhere; the queue drops the column, the merge explains the absence and prints a reference |
| `V01-UX-024` | one more column at 1024 on both grids | `MUST_FIX`, but §27 preserves the locked 5/3/2 for `/kham-pha` | the gallery half is closed (6.4 → 3.1 phone screens); the Discover half is deferred to design authority with the reason recorded |

The PO was right about the first. A recipient is a property of an order, not the
identity of a person, and relabelling one as the other would have been a
business-semantic fabrication dressed as a UX fix — precisely what §43 forbids.

One V01 measurement was **superseded by a better one taken here**: V01 recorded
the Admin order-detail rail at ~300px. The V02 capture measures the pre-change
rail at 348px and the frozen column at 660px. The conclusion is unchanged and
the correction is the same; the number in this report is the measured one.

---

## C. Correction strategy

Ten themes, executed in order and without stopping for approval between them
(§34), each committed on its own so a reviewer can read the diffs separately.

`T0` was first and non-negotiable: no copy correction could be made until there
was one place to make it. Every subsequent theme edited **JSON**, not TSX.

The architectural decision that shaped everything after it: the existing
`*-copy.ts` catalogs **survive as typed views over the JSON** rather than being
replaced by ~600 rewritten call sites. Each catalog entry becomes
`message.text('key')`, keeping the JSDoc rationale that explains *why the key
exists* — reasoning JSON cannot hold and a reviewer needs at the point of use —
while the Product Owner changes wording by editing one JSON file.

Three rules held throughout:

1. **No commercial semantics were invented.** No client-side total, no inferred
   fee, no identity derived from a shipping recipient, no payment state read off
   an image (§43).
2. **Wave-2 content is marked, not deleted.** `release: 'wave2'` on the content
   model means `APP12-W01` restores reviewed sentences rather than rewriting them
   from business rules.
3. **One string, one home.** Where a string was branched by origin, the original
   was *removed* from the shared catalog rather than left beside its twin —
   recreating the `FU-APP12-H06-01` two-sources defect while closing another
   finding would have been a poor trade.

---

## D. T0 — i18n architecture and the default Vietnamese authority

`packages/i18n` is the canonical message repository: **12 namespaces, 4,196
messages**, one locale.

```text
locale.ts          DEFAULT_LOCALE = 'vi'  ·  SUPPORTED_LOCALES = ['vi']
                   LOCALE_POLICY: routePrefix false · languageSwitcher false
                                  browserDetection false · cookie false
messages.ts        the 12 JSON namespaces; getMessages() throws on anything else
message-view.ts    messageView(root, prefix) → { text, list, group, scope }
hydrate.ts         {brand} substitution without mutating VI_MESSAGES
formats.ts         DISPLAY_TIME_ZONE 'Asia/Ho_Chi_Minh' · dd/MM/yyyy · HH:mm
request-config.ts  next-intl registration; onIntlError throws outside production
```

**next-intl 4.14.2**, registered in both applications through a three-line
`src/i18n/request.ts` and `NextIntlClientProvider` in each root layout.

The policy is enforced structurally, not by convention: `SUPPORTED_LOCALES` has
one member, `getMessages` throws for anything else, and there is no route
prefix, no switcher, no cookie and no browser detection to remove — none was
built. `HTML_LANG` is `vi` and is the only value `<html lang>` can take.

**Fail-visible outside production (§5A.13):** a missing key throws in
development and in test rather than rendering a key name or an empty string, so
a gap is a red test rather than a blank space someone eventually notices in
production.

`{brand}` is deliberately **not** the brand string. The JSON holds the
placeholder and the catalogs hydrate from `@embroidery/ui`'s `BRAND_NAME`, so
"Nét Thêu" has exactly one definition in the repository — the same defect
`FU-APP12-H06-01` recorded when it had two.

---

## E. Static-text inventory and JSON migration

| namespace | what it holds |
|---|---|
| `common` | shared frontend text — brand, actions, generic states |
| `storefront` · `checkout` · `orders` · `content` · `seo` | the customer's applications |
| `admin` · `admin-orders` · `admin-support` · `admin-wave2` | the operator's |
| `studio` · `custom` | Wave-2 surfaces, migrated so they are not left behind |

Moved: every human-facing string, including **static metadata and accessibility
labels** — `aria-label`, `alt`, `title`, `placeholder`, page `title` and
`description` — which §5A.10 requires and which is where a copy migration
usually leaks.

**Not moved, deliberately (§5A.4/§5A.5):** anything the database or the API is
the authority for. Product names, category labels, order codes, amounts,
recipient names, transfer references and every server-published message stay
dynamic and are rendered from the response. A category slug in a locale file
would be a second source of truth for a value `APP12-C01` made dynamic on
purpose.

**Keys are semantic and stable** (§5A.6): `orderAccess.deadlines.holdLabel`, not
the sentence. Nothing is keyed by its own English or Vietnamese text, so a
wording change is a value change.

**No injected HTML** (§5A.7). Rich text is composed from parts in the component;
no message is passed to `dangerouslySetInnerHTML` and none contains markup.

---

## F. Hard-coded-copy enforcement

Two gates, both TypeScript-AST based, both with their own focused tests.

### `tools/check-i18n-static-text.mjs` (+ 15 tests)

Three rules over the compiler's own AST rather than over regexes:

1. JSX text nodes;
2. human-facing JSX attributes (`HUMAN_FACING_ATTRIBUTES` — `aria-label`, `alt`,
   `title`, `placeholder`, …);
3. **any** string literal containing a Vietnamese diacritic, anywhere.

The third is the one that matters: the first two can be walked around by moving
a sentence into a constant, and the third cannot.

Exemptions are explicit and must carry a reason:
`// i18n-exempt: <reason>`.

### `tools/check-i18n-message-keys.mjs` (+ 11 tests)

Missing keys, computed keys, and **orphans** — a key no catalog reads. The
orphan rule is what caught the seven strings T7 branched by origin and left
behind, and it is why they were removed rather than duplicated.

Both are indexed in `docs/implementation/SCOPED_COMMAND_INDEX.md` as
`CMD-CHECK-I18N-STATIC-TEXT`, `CMD-CHECK-I18N-MESSAGE-KEYS`, `CMD-TEST-I18N-GATES`
and `CMD-TEST-I18N`. Neither is a repository-wide aggregate
(`VALIDATION_GOVERNANCE.md` §1.1).

```text
check-i18n-static-text    OK — no hard-coded human-facing text
check-i18n-message-keys   OK — every referenced key exists and every key is read
```

---

## G. V01 finding disposition matrix

Full ledger: `evidences/v02/FINDING-DISPOSITIONS.md` · data:
`evidences/v02/findings-after.json`.

| status | count |
|---|---:|
| `CLOSED` | 29 |
| `CLOSED_AS_ACCEPTED_DEVIATION` | 1 — `V01-UX-028`, exactly as §42 disposed |
| `PARTIALLY_CLOSED` | 1 — `V01-UX-024`, Discover half deferred to design authority |
| `NO_ACTION_REQUIRED` | 1 — `V01-UX-030`, the observation of what to preserve |
| **total** | **32** |

By severity: **2/2 CRITICAL** and **15/15 HIGH** closed.

---

## H. T1 — content truth and compression

The public content described a commission service on a build that sells
ready-made goods, and the payment policy sold a 40/60 deposit **no Wave-1 order
uses** — the release gate had withheld the routes and the CTAs but never the
promise.

| route | chars before | after | |
|---|---:|---:|---|
| `/dich-vu` | 2,225 | **904** | −59% |
| `/faq` | 2,490 | **1,495** | −40% |
| `/cua-hang` | 1,224 | **813** | −34% |
| `/chinh-sach/van-chuyen` | 1,535 | **1,319** | −14% |

`content-page-release.ts` resolves a page for the active release; Wave-2 prose is
marked, not deleted.

**One thing §7.1 permits that was deliberately not done:** the "commissions open
later" line. `APP12-RELEASE-WAVE-AUTHORITY` §7 forbids publishing the roadmap
publicly, and an existing e2e assertion enforces that the site publishes no
release plan. Two authorities disagreed; the stricter one was followed and the
disagreement is recorded rather than silently resolved.

`V01-UX-027` closed **without inventing a store fact**: what the workshop has not
published is simply not claimed.

---

## I. T2 — the Product Detail fold

The single most measurable correction in the checkpoint.

| | 1440 before | after | 1024 before | after | 390 before | after |
|---|---:|---:|---:|---:|---:|---:|
| `h1` top | 1045 | **238** | 1041 | **234** | 708 | **700** |
| `h1` size | 40px | 40px | 40px | **34px** | 40px | **24px** |
| Price top | 1236 | **403** | 1232 | **382** | 953 | **789** |
| CTA top | 1494 | **661** | 1490 | **640** | 1211 | **1047** |
| Above-fold chars | 77 | **237** | 52 | **234** | 95 | **122** |
| Page height | 2330 | **1639** | 2503 | **1716** | 2687 | **2564** |

A two-column hero above `1024px` with the media stage capped at
`min(58vh, 620px)` split / `min(46vh, 420px)` stacked. At 390 the price is inside
the 844px fold; the CTA sits immediately beneath the fold line rather than 367px
past it.

No new data, no new API and no new route: the same projection, arranged so the
purchase decision is where a purchase decision belongs.

---

## J. T3 — the action hierarchy

There was no rule for what the accent meant: the consequential action was loud on
one screen, silent on the next and outranked by a lookup on a third.

`@embroidery/styles/tools/_action.scss` declares five mixins — `action-primary`,
`action-secondary`, `action-tertiary`, `action-destructive`, `action-disabled` —
assigned **by consequence**, not by screen. The purchase CTA, the payment
verification and the merge execution are now the loudest control on their own
screens; lookups are secondary; the merge's irreversible commit carries the
destructive tone while its reversible refusal is secondary, and neither relies on
colour alone — both carry their own verb.

`V01-UX-025`, measured: the disabled purchase CTA went from
`rgb(214,211,209)` on `rgb(156,163,175)` — **1.5:1**, 574px wide, the largest
control on the panel — to `rgb(245,243,239)` on `rgb(95,102,114)` at **5.22:1**
and 431px, with the reason stated in a prompt beneath it. A disabled control is
legible and quiet; it is no longer the loudest thing on the panel.

---

## K. T4 — typography, contrast and focus

### Typography as roles

`packages/styles/src/tools/_typography.scss` — seven named roles, each a
`clamp()` between the two audited widths:

```text
$type-display        heading-m → display-l    (32 → 64px)
$type-page-title     heading-s → heading-l    (24 → 40px)
$type-section-title  heading-s → heading-m
$type-card-title     heading-s               (no step needed)
$type-body           body-m                  (never scaled — §26)
$type-secondary      body-s
$type-caption        caption
```

`clamp()` rather than a breakpoint, and the reason is stated in the file: the
design foundation **defers** a shared breakpoint scale, so inventing one here
would make a type file the de-facto owner of a decision the design system has not
taken. Both endpoints are values from the locked scale — this layer chooses which
approved size applies at which width and invents no size. The floor is an
absolute length, so a `vw` term does not create the WCAG 1.4.4 zoom failure a
purely viewport-sized heading would.

### Contrast, under `PO-APP12-004`

**15 / 15 pairs pass.** The brand `#e8475f` is **unchanged** — what changed is
which token a *control* uses.

| pair | before | after | target |
|---|---:|---:|---:|
| text-secondary on background-secondary | 4.36 | **5.22** | 4.5 |
| text-tertiary on background-secondary | 2.29 | **4.56** | 4.5 |
| text-tertiary on background-primary | 2.40 | **4.77** | 4.5 |
| white on the primary action fill | 3.82 | **4.59** | 4.5 |
| status-success on background-secondary | 2.97 | **4.60** | 4.5 |
| status-warning on background-secondary | 2.87 | **4.54** | 4.5 |
| status-error on background-secondary | 4.36 | **4.82** | 4.5 |
| focus ring on background-primary | 3.60 | **6.32** | 3 |

`PO-APP12-004`'s three enumerated tokens, plus the CTA pair `APP12-H08` measured
at 3.82, plus `FU-APP12-H08-01`'s **fourth** locked token — the warning colour on
the screen a customer whose payment link has died actually lands on — plus the
success and error pairs that live in the same alert component and were measured
alongside it.

Live confirmation across four routes × three viewports:
`contrast.*.failures = 0`, `beyond_po_004 = none`.

### Focus stops looking like a refusal (`V01-UX-007`)

`$color-focus-ring: #1d4ed8` — a dedicated token at 6.32:1 / 6.05:1. The ring was
drawn in the brand red, which on the payment surface landed on the page title and
read as an error.

`$color-border-strong` was added for the same reason: the non-text roles that
needed a 3:1 boundary were borrowing a text token.

---

## L. T5 — the transactional shell and the secure order surface

### The header offers only what works (`V01-UX-008`)

```text
before   Khám phá · Bộ sưu tập · Studio(dead) · Đặt thêu(404) · Nhật ký(dead) · search(inert)
after    Khám phá · Bộ sưu tập · Dịch vụ · Cửa hàng
```

`Đặt thêu` is **omitted** while its route is withheld rather than drawn grey, and
returns unchanged when the capability is released — asserted in both states. The
inert search affordance was deleted, not hidden.

### Two shells (`V01-UX-022`)

The variant is a request header the proxy stamps and the **root layout** reads —
not the shell itself, because the feature barrel is imported by client components
for its route constants and `next/headers` there pulls a server-only API into
their bundles, which the build caught.

The reduced shell keeps the brand, the escape path, the contact dock and **all
four** policies plus the FAQ: §10 protects information a paying person might
need, so the set is complete rather than curated.

| screen | before | after |
|---|---:|---:|
| checkout 1440 | 1,840px | **1,544px** |
| checkout 390 | 3,060px | **2,288px** |
| secure order 390 · transfer open | 3,736px | **2,864px** |
| secure order 1440 · awaiting fee | 1,300px | **955px** |

### The secure order surface

- **`V01-UX-012`** — nine state-aware headings. The page said "Thanh toán đơn
  hàng" in all nine states, including the four with nothing left to pay.
- **`V01-UX-013`** — an open transfer no longer claims the workshop is already
  reconciling; it says the details are ready and reconciliation follows the
  transfer.
- **`V01-UX-014`** — still a real `<input type="file">` with its `accept` list,
  label association and focus, clipped behind a label wearing the secondary
  action treatment and reading `Chọn ảnh chuyển khoản`, with the chosen file
  named by the surface.
- **`V01-UX-029`** — the transfer reference at 16px, selecting in one gesture.

---

## M. T6 — the Admin dashboard, queue and vocabulary

### The landing stopped denying its own product (`V01-UX-015`)

A placeholder said products, orders, designs and requests "sẽ xuất hiện trong
các giai đoạn tiếp theo" on a build where all of them had shipped and were two
clicks away. `AdminHomeLaunchpad` offers six cards to routes that exist.

Two things §19 recommends and this deliberately does not do:

- **No inventory card.** §19 lists `Tồn kho`; the only inventory route is
  `/kho/skus/[skuId]`, which needs a SKU the launchpad cannot choose. Inventing
  `/kho` is a new route, which §5 forbids more strongly than §19 recommends the
  card.
- **No counts.** §19 forbids new dashboard APIs and counters, and a stale number
  is worse than none because an operator plans around it. A test asserts the page
  renders no digit at all.

### The queue (`V01-UX-009`, `V01-UX-026`)

Thirteen statuses and two origins were a three-column grid of full-width labels,
each printing its stored contract value beside it — y=240→565 of a 900px fold,
above data starting at y=687. Wrapping chips now, tokens gone, **no filter
semantics removed**: every backend-supported state is still selectable, so Wave 2
re-expands the block rather than re-deriving it.

The checkbox stays a real checkbox — clipped, not replaced — so it keeps its
role, its checked state and its tab position, and selection is carried by the
control as well as by the fill. The H08 compat gate now asserts exactly that:
focusable, operable by <kbd>Space</kbd>, state exposed.

Two of eight columns carried nothing. `Yêu cầu` was a full column of em dashes
and renders only when a loaded row has a request — driven by the data, not by a
release flag the Admin deliberately does not have.

| | before | after |
|---|---:|---:|
| queue text @1024 with orders | 917 chars | **551** |
| queue text @1440 default | 851 chars | **489** |
| queue height @1024 | 1,177px | **964px** |

### Human identity, without fabricating any (`V01-UX-032`)

**The queue loses the column.** No human-readable customer field exists in the
list projection, so §21.4's second branch applies. `customerShortId` and
`customerId` left the row model with it: the model no longer carries what the
screen may not show.

**The merge case** was the sharper problem — both participants rendered "Chưa
có" beside two masked addresses, so the operator confirming the one operation the
screen itself calls irreversible was choosing between two blanks. Three changes,
none of them a name:

- the empty state says *why* it is empty and names the already-shipped screen
  that can set a display name (`APP10-B01`'s patch at `/support/customer-access`);
- the masked contact stays the identity authority, rendered exactly as sent;
- the customer reference is printed — because `maskContact` is deterministic and
  lossy, so two different addresses can mask to the same string, which without a
  reference leaves the two cards of an irreversible decision indistinguishable.

**Cost, stated:** the five merge screens are 14–126px taller. That is the trade,
and it is the right one.

### Vocabulary (`V01-UX-005`)

Swept in T1, finished here and in T7. Wave-2 message files still carry status
tokens in their bodies; those surfaces are withheld from this release and are
recorded rather than silently rewritten.

---

## N. T7 — the Admin order detail and payment workbench

### The commercial decision took the wide column (`V01-UX-010`)

`APP12-A02-C1` filled the delivered two-column layout with the Ready-Made
composition, which was right. What it inherited was a split sized for the
*custom* lifecycle, where the rail carries short summaries.

```text
before   frozen 660 · payment rail 348
after    payment 560 · frozen rail 448
```

The payment column also comes **first in the DOM**, so the operator meets the
required action before the record of what was bought — and a screen reader reads
them in that order too.

**The first attempt at this was wrong, and the harness said so.** Sizing the
*payment* column let the frozen column collapse to 288px — narrower than the
348px rail it replaced — which made the items table 970px tall and pushed eight
of twelve states *taller*. Sizing the rail instead produced this:

| state @1440 | before | after |
|---|---:|---:|
| awaiting shipping fee | 1,063 | **959** |
| awaiting payment | 1,204 | **1,037** |
| payment review | 1,646 | **1,369** |
| verify dialog | 1,646 | **1,369** |
| delivered | 1,781 | **1,550** |

All twelve are shorter. Text on the payment-review state fell 2,046 → 1,655
chars, paragraphs 11 → 9, mean paragraph 86 → 72 characters.

Three explanations were **removed**, not reworded: the evidence list already says
which images can be opened and that a rejected one is not a failed payment, and
the panel repeated the second underneath it and then restated the one-payment
rule below an obligation the operator was looking at.

### Ready-Made payment vocabulary (`V01-UX-006`)

Reusing the APP7 workbench brought its words with it, and a Ready-Made order has
no deposit. **Ten** strings now branch on the order's own `origin` in
`payment-terminology.ts`. §24 requires the branch to be explicit and it is:
nothing infers it from the obligation kind, from a missing `customRequestId`,
from the status, or from which component happens to be mounted. Custom-origin
deposit terminology is unchanged.

The strings were **removed** from `ORDER_DETAIL_COPY` rather than left beside
their branched twins.

**Three of the ten were found by the live journey, not by a unit test.** After
every visible payment string had been branched, the H08 admin journey read the
settled announcement off a real Ready-Made order and it still said "Đã xác nhận
tiền cọc" — the outcome panel was the one payment surface the component tests
never rendered in that state. The journey now asserts the announcement matches
no form of the word.

Two raw enums also reached the operator here: the `FULL` workbench rendered
`obligation.status` and `attempt.status` as their own labels, because the panel
had no presenter to reach for. `presentDepositStatus` was always the *obligation*
vocabulary rather than the deposit's, so it is `presentObligationStatus` now.

### The payment dialog (`V01-UX-016`)

Two independent defects.

**The title was cut in half on open.** Focus moves to the first field on mount
and the whole panel was one scroll container. The header is outside the scrolling
region now, the body is the only thing that scrolls, and the panel is bounded at
`calc(100dvh - 64px)` — `dvh` rather than `vh` because on a short window the two
differ by exactly the strip the submit button was falling into. `min-height: 0`
on the body is load-bearing: a flex child's default `min-height: auto` refuses to
shrink below its content.

**The scrim left the shell lit.** The backdrop was `z-index: 1` and the Admin
header is sticky at 99. It sits at 250 now — above the shell's own highest veil
(session-expired at 200) and below the skip link at 300, which is only reachable
when focus can leave the page and this dialog traps it.

Re-verified as §25 requires: `dialog` role, 5 tab stops, focus restored to the
trigger, 0 axe violations.

---

## O. T8 — responsive scale, grid and control sizing

**Type scale (`V01-UX-023`)** — closed by T4's role-based `clamp()`. The Product
Detail `h1` steps 40 → **24px** at 390 and 40 → **34px** at 1024; the Homepage
hero interpolates 32 → 64px instead of sitting at 64 on a phone. Body copy is
deliberately unscaled.

**Gallery (`V01-UX-024`, closed)** — `/bo-suu-tap` at 390 was 5,366px, **6.4
viewports** for nine entries, on a feed whose whole purpose is scanning. Two
columns now, with the editorial paragraph clamped to three lines at that width
only: **2,655px, 3.1 viewports**. The card is *shortened to earn the narrower
measure* — the paragraph is what made it tall — rather than the copy being
deleted or the title truncated. Above 640 the card has the measure UI05 drew it
at and the clamp is lifted entirely.

This departs from the approved UI05 390 frame, which draws one column, and is
recorded as a departure rather than presented as fidelity.

**Discover (`V01-UX-024`, deferred)** — V01 asks for a fourth column at 1024.
§27 preserves the locked direction — desktop 5, tablet 3, mobile 2 — and the
audited UI02 **tablet frame is 1024**. Adding a column there changes the locked
tablet count, which §27 forbids in the same paragraph that raises the finding.
Deferred to design authority, with the reason recorded.

The invariant `APP11-E01` defends — the two feeds never share one density — still
holds (5/3/2 against 3/2/2) and its acceptance test is unchanged.

**Control sizing (`V01-UX-026`)** — queue row links measured 125×**16** CSS
pixels and now carry `$size-touch-target-min`; the category list's row name,
painted exactly like the plain text beside it, is underlined at rest with the
same target. Live: `targets.*@390.undersized = 0` across 78 measured targets.

---

## P. T9 / T10 — small defects and consistency

**`V01-UX-011`, the only outright runtime defect in the audit.** Pressing "Đặt
hàng" before verifying set a refusal that completing the verification did not
clear, so the contact card rendered "verify your contact" directly above "✓ Đã
xác minh" — at all three viewports, at the moment the customer decides whether it
is safe to press the button. The cause was that the *message* was stored. What is
stored now is the fact that an order was attempted unverified — true about the
past, and stays true — and the refusal is derived from it together with the
current verification state, so it disappears exactly when it stops being true.

**`V01-UX-028`** — one line under `Giao hàng`: *Tất cả các mục đều bắt buộc.* No
per-field markers; `aria-required` unchanged. A test asserts both halves.

**`V01-UX-021`** — one declared format, `dd/MM/yyyy · HH:mm`, in
`@embroidery/i18n`. **28 files** across both applications reach it, 26 of them
through the Admin's single import site; five hand-rolled `Intl` /
`toLocaleString` variants are gone. The zone is the workshop's rather than the
viewer's, which is the point: an operator on the phone to a customer must be
reading the same clock. Presentation only — §30 forbids changing stored instants
and nothing here does.

**`V01-UX-017`** — six bordered callouts around one bank transfer became two.
The reference note is helper text for the field above it; the two deadlines are
one labelled group with two rows. Merging the *presentation* is not merging the
*meaning*: §25 forbids conflating the two facts, each row keeps its own label and
instant, the stock hold still vanishes when no live reservation stands, and the
test that guarded §25 now also asserts the two values are distinct.

**`V01-UX-019`** — the grid declared its 420px QR aside unconditionally, so
every state without a QR reserved it for nothing. Measured, top-level card widths
on `awaiting-shipping-fee`: `1152 · 708` → **`1152`**. The QR is still one
mounted panel that is *placed*, never two that are hidden.

---

## Q. Figma reconciliation

**`FIGMA_SYNC = DEFERRED_TOOLING_ONLY`.**

The `figma-desktop` MCP server is `ConnectionRefused` for the whole of this
session. That is a connection failure, not a missing capability, and it is
reported rather than worked around: no Figma node was read, created or modified,
and `docs/design/FIGMA_DESIGN_INDEX.md` is **unchanged** — writing registry
entries for nodes that were never opened would corrupt the one artifact whose
value is that it is trustworthy.

Three runtime corrections are known departures from an approved frame and are
listed here so the design pass has an agenda rather than a diff to reverse:

| frame | departure | finding |
|---|---|---|
| UI05 Collections Index @390 | one column → **two**, with clamped card copy | `V01-UX-024` |
| APP7-A01 order detail | the column split is reversed on the Ready-Made branch | `V01-UX-010` |
| `910:335` / `910:336` | two deadline callouts → one labelled group | `V01-UX-017` |

Each is a `FIGMA_DESIGN_DEFECT` or `BOTH_RUNTIME_AND_FIGMA` in V01's own
classification — the frame and the runtime disagreed with the product, not with
each other.

---

## R. Before/after evidence

`evidences/v02/BEFORE-AFTER.md` — 137 screens, measured twice.

```text
total document height    247,245px → 214,901px   (−13.1%)
total main-region text   121,676   → 106,899     (−12.1%)
shorter 87 · unchanged 44 · taller 6
horizontal overflow      1 → 1  (admin/login/1024, pre-existing, 292px)
```

All six taller screens are accounted for: five are `V01-UX-032`'s deliberate
identity correction and the sixth is the queue at +3px while its text fell 40%.

---

## S. Full route recapture

`E2E_EVIDENCE_DIR=v02 node scripts/run-e2e.mjs --app12-v01` — **29 / 29**.

- 13 Storefront routes and 16 Admin routes, at 1440 / 1024 / 390 as each surface
  declares
- **137 screens**, the same 137 the V01 baseline captured — none dropped, added
  or renamed, which is what makes the comparison a comparison
- **260 screenshots** under `evidences/v02/storefront/` and `evidences/v02/admin/`
- 4 measurement ledgers under `evidences/v02/data/`

The harness change needed for this was one environment variable:
`evidenceDirectory()` reads `E2E_EVIDENCE_DIR` (validated
`/^[a-z0-9][a-z0-9-]*$/u`), defaulting to the V01 path. The specs, routes,
viewports and states are untouched.

---

## T. Accessibility regression

`node scripts/run-e2e.mjs --app12-h08` — **26 / 26**, Chromium + Firefox + WebKit.

```text
axe violations, every audited route and state       0
axe serious/critical                                0
reflow overflow @1440 · @1024 · @390 · @200% zoom    0 everywhere
undersized targets @390 (78 measured)               0
animations under prefers-reduced-motion             0
verify dialog: role · tab stops · focus return      dialog · 5 · restored
storefront drawer tab stops                         6
admin drawer tab stops                              10
```

`APP12-H08`'s critical regression count is **0**.

Two H08 assertions were strengthened rather than merely repaired:

- the compat gate clicked the filter checkbox directly, which the chip pattern
  clips. It clicks the label an operator clicks, and now also asserts the control
  underneath is focusable, operable by <kbd>Space</kbd> and exposes its own
  checked state — the properties a clipped control most easily loses;
- the admin journey now asserts the settled payment announcement carries no form
  of `tiền cọc` on a Ready-Made order.

---

## U. Performance regression

A new bounded spec, `specs/app12/v02-performance.regression.spec.ts`, drives the
**delivered `APP12-H05` measurement runner** over the four public surfaces V02
changed, at desktop and mobile, three cold runs each after a warm-up.

Thresholds are `PO-APP12-005`'s own, quoted and not reinterpreted.

| surface | viewport | CLS (min/med/max) | LCP median | TTFB median |
|---|---|---|---:|---:|
| home | desktop | 0 / 0 / **0** | 144 ms | 14.7 ms |
| product-detail | desktop | 0 / 0 / **0** | 352 ms | 17.9 ms |
| gallery-feed | desktop | 0 / 0 / **0** | 124 ms | 17.9 ms |
| services | desktop | 0 / 0 / **0** | 132 ms | 18.6 ms |
| home | mobile | 0 / 0 / **0** | 120 ms | 15.0 ms |
| product-detail | mobile | 0 / 0 / **0** | 108 ms | 17.9 ms |
| gallery-feed | mobile | 0 / 0 / **0** | 128 ms | 17.1 ms |
| services | mobile | 0 / 0 / **0** | 136 ms | 14.9 ms |

Budgets: CLS 0.10 · LCP 2,500 ms · TTFB 800 ms. **8 / 8 within budget.**

CLS is asserted on the **max** rather than the median: a layout that shifts on one
load in three is still a layout that shifts, and `APP12-H05-C1` left these
surfaces with zero variance, so variance itself is the signal. Every surface
reports 0.0000 on every run — better than the ≤ 0.0008 H05-C1 achieved, and the
rebuilt product fold, the two-column mobile gallery and the fluid type scale cost
nothing measurable.

The authenticated surfaces are deliberately not in this spec: a probe of a live
`ORDER_ACCESS` page needs an authenticated context, and `APP12-S03`/`APP12-H01`
are explicit that traces of one write secret-bearing material to disk. Their
layout changes are covered by the geometry ledger instead, which measures document
height, surface widths and overflow directly.

`FU-APP12-H05-02/-03/-04` were routed to V02 by `APP12-H05-C1`. They are
**responsive-image and media-weight work**, which is not one of the ten
correction themes §5 authorises, and no new identifier was created for them; they
remain open and are listed in AB.

---

## V. Functional regression

```text
apps/storefront   tsc --noEmit clean · eslint clean · jest 2533/2533 · build OK
apps/admin        tsc --noEmit clean · eslint clean · jest 1930/1930 · build OK
packages/i18n     tsc --noEmit clean · jest 24/24
packages/e2e-testing  tsc --noEmit clean · eslint clean
tools             node:test 26/26 (6 suites)
apps/api          release-gate contract spec 15/15
```

**Live journeys, end to end, on a real stack:** the V01 commerce audit places an
order, opens the transfer, uploads evidence and watches the secure surface; the
V01 admin-order audit drives fee → payment → verification → dispatch →
completion across both screens; the H08 journeys complete the purchase and the
verification by keyboard alone. All pass.

**36 test files changed: 28 test blocks added or rewritten, 13 of them replacing
one that encoded behaviour the Product Owner has now superseded, and +49 net
assertions.** Every superseded assertion was rewritten rather than deleted, and
several were strengthened in the process:

- the queue test went from *"the customer id is shortened"* to *"no customer
  identifier appears at all, and no recipient name is substituted"*;
- the §25 deadline test now also asserts the two instants are **distinct**, which
  the two-callout version never checked — that is the property §25 is actually
  about;
- the H08 compat gate went from *"the checkbox can be clicked"* to *"the label an
  operator clicks toggles it, and the control underneath is focusable, operable by
  Space and exposes its own state"*;
- the checkout boundary test went from *"these two modules may hold a literal"* to
  *"no file in the feature does"*.

No test was disabled, skipped or deleted to make a gate pass.

---

## W. Files changed

```text
322 files changed, 18,192 insertions(+), 6,231 deletions(-)
```

Nine commits, one per theme:

```text
a92145dc  T0    one message repository
a47a224b  T1    public content true of the released product
0bb2ba7b  T2·T3·T4  the purchase fold, the accent rule, the tokens under both
cd2e4671  T5    transactional chrome, the order page says its state
80a78176  T6    the operator landing, the queue, identity without invention
1e4d6f26  T7    the payment decision in the wide column, and not a deposit
7fe983b8  T8·T9 the mobile gallery, the checkout contradiction
ee72b64c  T10   six callouts to two, the void closed
7ada0889  re-verification: three things only the live journeys caught
```

New packages and modules of note:

```text
packages/i18n/                          the canonical message repository
packages/styles/src/tools/_typography.scss   seven responsive roles
packages/styles/src/tools/_action.scss       five action tones
tools/check-i18n-static-text.mjs (+tests)
tools/check-i18n-message-keys.mjs (+tests)
tools/check-design-token-contrast.mjs
apps/*/src/i18n/request.ts              next-intl registration
storefront: content-page-release · shell-variant · transactional footer
admin:      admin-home-launchpad · admin-home-destinations · payment-terminology
e2e:        v02-performance.regression.spec.ts
```

Deleted: `storefront-search-affordance.tsx` (an inert control) and
`admin-home-placeholder.tsx` (a page that denied its own product).

---

## X. File-size

Hard limits hold: **400** for source, **600** for tests. No file this checkpoint
created or grew exceeds either.

§41 — the touched-oversized-stylesheet rule — applied four times, and in every
case the touched responsibility came out whole rather than lines being appended:

| stylesheet | before | after | what moved out |
|---|---:|---:|---|
| `storefront-shell.scss` | 456 | **342** | `_shell-footer.scss`, `_shell-tokens.scss` |
| `admin-shell.scss` | 652 | **634** | `_admin-home.scss` (the launchpad, which never entered it) |
| `order-queue.scss` | 392 | **21** | `_order-queue-tokens/-page/-table.scss` |
| `customer-merge.scss` | 501 | **400** | `_customer-merge-participant.scss` |

`storefront-shell.scss` is now **under** the limit for the first time.
`admin-shell.scss` and `customer-merge.scss` are smaller than they were; both were
legacy-oversized before this checkpoint and neither grew. `order-queue.scss` was
under the limit at 392 and would have crossed it — the split happened *before* it
did, which is the point of the rule.

Also split by responsibility rather than by line count:
`secure-ready-made-order`'s evidence copy (`order-access-evidence-copy.ts`) and
the product-detail hero (`_product-detail-hero.scss`).

No unrelated Wave-2 styling was refactored, as §41 requires.

---

## Y. Validation

Selected from `VALIDATION_GOVERNANCE.md` §3 by what this change actually
justifies. No repository-wide aggregate was run; none exists.

```text
node tools/check-i18n-static-text.mjs                        OK
node tools/check-i18n-message-keys.mjs                       OK
node --test tools/check-i18n-*.test.mjs                      26/26
node tools/check-design-token-contrast.mjs --report          15/15

apps/storefront  tsc --noEmit · eslint . · jest · next build  clean · clean · 2533 · OK
apps/admin       tsc --noEmit · eslint . · jest · next build  clean · clean · 1930 · OK
packages/i18n    tsc --noEmit · jest                          clean · 24
packages/e2e-testing  tsc --noEmit · eslint .                 clean · clean
apps/api         jest src/platform/release-gate               15/15

packages/e2e-testing:
  E2E_EVIDENCE_DIR=v02 node scripts/run-e2e.mjs --app12-v01   29/29
  node scripts/run-e2e.mjs --app12-h08                        26/26

prettier --write over every touched path
```

Four new commands are indexed in `docs/implementation/SCOPED_COMMAND_INDEX.md`.

**Two flakes, named rather than hidden.** The V01 harness failed twice across six
runs, both at the Admin login step (`Đăng xuất` not visible within 10s) or the
order-creation step, and passed on re-run with no code change between. They are
timing in the harness's own setup, not in the product; the final capture is a
clean 29/29 and the flakes are recorded so nobody re-discovers them as a defect.

---

## Z. Hygiene

- **No push.** Nine local commits on `feat/app11-s04-seo-infrastructure`.
- **No `.env` write of any kind**, and no secret-bearing variable read. The e2e
  stack provisions its own disposable Postgres and MinIO with synthetic values;
  no credential was rotated, echoed, logged or passed as an argument.
- **No shared-dev commercial residue.** Every live journey ran against a
  disposable database that the harness drops on teardown — the run log ends
  `cleanup verified: all E2E ports closed, disposable database dropped` on every
  run. The shared dev database was never written to.
- **No generated file edited by hand.** `openapi.generated.json` and the
  generated client are untouched.
- Evidence screenshots carry no credential: `v01-evidence.mjs` refuses to
  photograph a page whose URL still holds one, and that guard is unchanged.

---

## AA. Frozen baseline

Every frozen count verified after the change, not assumed:

```text
OpenAPI paths            125    unchanged
OpenAPI operations       138    unchanged
OpenAPI schemas          278    unchanged
Public operations         49    unchanged
Release matrix     28 DENY / 18 ALLOW / 3 SCOPE_GATED   unchanged (spec 15/15)
Migrations                38    unchanged
DB tables                 79    unchanged
Admin routes              26    unchanged
Storefront routes         20    unchanged
Brand accent         #e8475f    unchanged
```

No new business HTTP operation, no new route, no migration 0039, no new
lifecycle state, no new customer-name field, no new notification provider, no new
payment model, no new search feature, no new customer/account capability, no new
custom-embroidery capability. No server-calculated value moved to the client and
no commercial figure is inferred in a browser.

---

## AB. Remaining non-blocking findings

| id | what | why it is not closed here |
|---|---|---|
| `V01-UX-024` (Discover half) | a fourth column at 1024 | changes the locked UI02 tablet frame; §27 preserves 5/3/2 in the same paragraph that raises it. Design authority. |
| `FU-APP12-H05-02` | above-the-fold `lazy`/`fetchpriority` | media-weight work, not one of the ten themes §5 authorises |
| `FU-APP12-H05-03` | Product Detail thumbnail-strip rendition (~672 KiB) | same |
| `FU-APP12-H05-04` | Admin order-detail CLS 0.1316 | the operator surface needs an authenticated probe; its layout was corrected here and the geometry ledger records the result, but the CWV number was not re-measured |
| `FU-ADMIN-SHARED-DIALOG-01` | seven hand-rolled Admin dialogs | still open and still unowned; §25 was closed inside the payment dialog rather than by unifying all seven, which would be the unrelated refactor §41 forbids |
| *(new, not a V01 finding)* | `admin/login/1024` overflows horizontally by 292px | present in the V01 capture and this one; outside the 32 and untouched here |

None blocks the Wave-1 release. The last row is written down so it stops being
invisible.

---

## AC. Roadmap

```text
ROADMAP_LOCK        LOCKED
CHECKPOINTS         38
APP12-V01           COMPLETE — PO PASS   (unchanged)
APP12-V02           COMPLETE — this checkpoint
APP12-G03           NEXT  — NOT STARTED
CORRECTION_USED     0/1
G03 data            false
PRODUCTION DEPLOYED false
PUSHED              false
```

Exactly one `NEXT`, and it is `APP12-G03`. Nothing in this checkpoint touched it.

---

## AD. Correction notice — `APP12-V02-C1`

*Appended after the fact. Nothing above this line was edited: the evidence,
counts, history and finding ledger are as this checkpoint recorded them.*

The Product Owner accepted the overwhelming majority of this report and returned
it as `CORRECTION_REQUIRED` for exactly two acceptance defects, both now closed
by `APP12-V02-C1` (`docs/implementation/reports/APP12-V02-C1-COMPLETION-REPORT.md`):

| § here | what the PO rejected | closed by |
|---|---|---|
| **D** — `{brand}` hydrated from `@embroidery/ui`'s `BRAND_NAME` | for the web applications `Nét Thêu` **is** human-facing static text, so a presentation package may not be its authority | the name and descriptor moved to `common.brand.name` / `common.brand.descriptor`; `@embroidery/ui` publishes the approved geometry and no brand text at all; the five generated icon files regenerate byte-identical |
| **F** — the static-text gate's three rules | an ASCII sentence parked in a constant (`const LABEL = "Order"`) is neither a JSX text node nor a diacritic literal, and walks straight through | rule 4: a literal that *reaches* a JSX child or a human-facing attribute through constants, properties, destructuring or an import. It found one live escape — an Admin table header — on its first run |
| **A**/**R** — `admin/login/1024` recorded at 292px and left | not acceptable in the checkpoint whose purpose is runtime UI/UX correction | root cause is arithmetic (780 + 96 + 440 = 1316 against a 1024 breakpoint); the brand panel now yields with `flex: 0 1 780px`. Measured 0px at 1440 · 1024 · 768 · 390 and both 200 % viewports, with 1440 still exactly 780 + 440 |

`APP12-H08`'s "0px overflow on every audited route" and this report's 292px do
**not** contradict each other: `h08-admin-shell` case B measures `ORDERS_PATH` at
each viewport and visits `/login` only as 1440-wide setup inside `openOperator`.
The login page was never in that reflow assertion. `APP12-V02-C1` §I carries the
full reconciliation.

```text
APP12-V02        COMPLETE_AFTER_C1
APP12-V02-C1     COMPLETE
CORRECTION_USED  1 / 1        (no V02-C2)
APP12-G03        NEXT — still NOT STARTED
```

---

## Correction notice — `APP12-V02-C2`

The block above closed as `COMPLETE_AFTER_C1` with `CORRECTION_USED 1 / 1`. The
Human Product Owner subsequently tested live, found a release-critical media
defect, and authorised a **one-time exception** raising `V02_MAX_CORRECTIONS` to
2. Nothing in V02's or V02-C1's evidence changes; this notice records what came
after it.

`APP12-V02-C2` — *Media Upload, Processing & Image Delivery Reliability
Correction*. Full account:
`docs/implementation/reports/APP12-V02-C2-COMPLETION-REPORT.md`.

The reported symptom — an Admin image upload answering *"Dịch vụ lưu trữ ảnh tạm
thời không khả dụng"* — was never object storage. MinIO was healthy throughout.
Four defects and two non-defects:

| | Finding |
|---|---|
| D1 | Identity sequences behind their rows, so the upload failed on the **primary key** — which the business-scoped `ON CONFLICT` does not cover — and escaped as a 500 in ~4 ms. `db-restore` verified row counts and the migration journal and never sequence parity. |
| D2 | Any unrecognised 5xx rendered as a storage outage. That one fallback is what pointed the investigation at MinIO. |
| D3 | No Admin binary preview contract for catalog assets, so four Admin surfaces drew a permanent placeholder — including the dialog where an operator *chooses* a product image. |
| D4 | The encoder measured every derivative and the promotion discarded it, so `APP12-H05-C1`'s intrinsic-dimension publication was inert for the whole catalog lane. |
| — | Storefront product cards: `LEGITIMATE_NO_MEDIA_DATA`, not a defect. |
| — | Gallery: never broken; serving real pixels throughout. |

```text
APP12-V02        COMPLETE_AFTER_C2
APP12-V02-C2     COMPLETE
CORRECTION_USED  2 / 2        (no V02-C3)
OpenAPI          126 paths · 139 operations · 278 schemas · 49 public (+1 Admin operation)
migrations       38 · tables 79 · both unchanged
APP12-G03        NEXT — still NOT STARTED
```
