# APP12-G02 — Wave-2 Fail-Closed Release Isolation Gate — Completion Report

Phase: `APP12 — Hardening, UAT and Production Readiness`
Type: `RUNTIME RELEASE CONTROL` · `SHARED STOREFRONT + API CAPABILITY`
Date: 2026-09-01
Branch: `feat/app11-s04-seo-infrastructure`

---

## A0. Correction notice — superseded in two places (`APP12-G02-C1`, 2026-09-01)

Product Owner review returned `CORRECTION_REQUIRED` on this checkpoint. The core
implementation below was accepted in full and is unchanged; two statements in it
are superseded by [`APP12-G02-C1-COMPLETION-REPORT.md`](./APP12-G02-C1-COMPLETION-REPORT.md).
The evidence below is left exactly as recorded.

```text
APP12-G02       = COMPLETE_AFTER_C1
CORRECTION_USED = 1 / 1   (no C2)
```

**1 — The surface count in §N and §R was wrong, in both directions.** The prose
said "seven further surfaces" and the list beneath it named eight. A mechanical
inventory of the rendered Storefront found neither figure, and found a site
neither number included — the Homepage **hero**'s second commission action,
beside the commission *section* this report did name. The measured figures are:

```text
SOURCE_OCCURRENCES  = 9    Wave-1 source sites emitting an active Wave-2 CTA
RUNTIME_SURFACES    = 11   released route patterns that rendered one
ACTIVE_LINKS_BEFORE = 22   rendered anchors, over 14 crawled URLs
```

The three are different numbers for a reason: the footer store-presentation block
is **one** source site that renders on **every** route, and the Homepage is one
route carrying three separate links. Conflating a component count with a page
count is what produced the miscount here.

**2 — The reason for deferring them did not hold.** §N judged that suppressing
those surfaces would require new copy and layout that §27 freezes. It did not.
Every one was corrected by omitting the offer, with zero copy changes, zero SCSS
lines, no new component and no disabled-state design; `WAVE2_ACTIVE_LINKS_ON_WAVE1_PAGES = 0`
is now verified in Chromium against the gateway. `FU-APP12-G02-01` is therefore
**`CLOSED_BY_APP12_G02_C1`**, not routed to `APP12-S01`.

Unaffected by the correction and still current: the release variable and its
five-case table, `proxy.ts` and the 7-route matrix, the API guard and its 31/12
operation authority, the `publicSecureLink_resolve` whole-operation denial, the
staff/Admin and worker audits, and every baseline freeze figure.

---

## A. Verdict

```text
APP12-G02 = COMPLETE          (superseded: COMPLETE_AFTER_C1 — see §A0)
CORRECTION_USED = 0 / 1       (superseded: 1 / 1 — see §A0)
NEXT_CHECKPOINT = APP12-D01
```

Entry authority held: `APP12-P01 = COMPLETE`, `APP12-G01 = COMPLETE`,
`ROADMAP_STATUS = LOCKED`, `ROADMAP_LOCK = LOCKED`, `CHECKPOINTS = 38`.

No contradiction was found between the `APP12-G01` classification and the
running system. The 43/31/12 operation split and the 7-route Storefront set were
consumed verbatim from
[`APP12-RELEASE-WAVE-AUTHORITY.md`](../APP12-RELEASE-WAVE-AUTHORITY.md) §2, §3,
§4, §5 and §7 and were **not** reclassified.

---

## B. Release flag authority

```text
name        = CUSTOM_EMBROIDERY_RELEASE_ENABLED
class       = SERVER_SIDE · NON_SECRET · SHARED_SEMANTIC_AUTHORITY
aliases     = none
NEXT_PUBLIC = none
default     = withheld
```

Parse table, identical in both applications:

| Value | Result | `malformed` |
|---|---|---|
| `"true"` | released | `false` |
| `"false"` | withheld | `false` |
| missing | withheld | `false` |
| `""` | withheld | `false` |
| anything else (`1`, `yes`, `on`, `TRUE`, `True`, `" true"`, …) | **withheld** | `true` |

Only an exact lowercase `true` releases the capability. `1`, `yes`, `on` and
`TRUE` are rejected: no repository-wide boolean convention establishes them —
the one delivered precedent, `parseDocsEnabled` in `apps/api/src/config/app-config.ts`,
accepts exactly `"true"`/`"false"` — and a gate that guesses at intent is a gate
a typo can open.

**Invalid values return `false` rather than throwing**, and this is a deliberate
deviation from `parseDocsEnabled`, documented in both config modules. A throw
there is safe (refusing to start beats serving docs by accident). Here the same
choice would be unsafe in the other direction: these processes serve the
**released Wave-1** business, and a typo in a variable governing an *unreleased*
capability must not take the released shop down with it. Withholding the
capability is the fail-closed outcome; refusing to boot is an outage.
`APP12-RELEASE-WAVE-AUTHORITY.md` §4 rule 1 asks for the former. A malformed
value is still reported — `malformed: true` drives a startup `warn` — so an
operator who typed `True` is told, rather than silently watching nothing happen.

The name carries none of the `CLAUDE.md` §8a secret markers (`PASSWORD`,
`PASSWD`, `SECRET`, `TOKEN`, `KEY`, `CREDENTIAL`, `PRIVATE`), holds no
credential, and its state is inferable by anyone who requests a withheld route.
It is nonetheless server-side only in both apps: a release gate the browser can
read is a release gate the browser can be told to ignore.

### Why the parser is expressed twice

One semantic contract read by two applications would naturally live in a
workspace package. It cannot at this checkpoint, for a concrete reason: the
development Storefront container bind-mounts `packages/contracts/src`, and the
API container bind-mounts only `apps/api/src`. A shared package would reach one
runtime and not the other without **rebuilding the API image**, which §23
forbids (image reproducibility is `APP12-H02`'s). Each application therefore
validates the variable in its own configuration layer — exactly as
`STOREFRONT_PUBLIC_ORIGIN` is validated separately by the worker and the
Storefront — and each side proves the same five cases in its own suite.

---

## C. Configuration implementation

| File | Role |
|---|---|
| `apps/api/src/config/custom-embroidery-release.config.ts` | API parser + DI token |
| `apps/api/src/platform/release-gate/release-gate.module.ts` | Composition, startup log, `APP_GUARD` registration |
| `apps/storefront/src/config/custom-embroidery-release.ts` | Storefront parser |
| `.env.example` | Documented, `CUSTOM_EMBROIDERY_RELEASE_ENABLED=false` |
| `infrastructure/compose/docker-compose.dev.yml` | `api` and `storefront` env pass-through, `${…:-}` so unset = withheld |

`.env` was **not** written. The Compose pass-through defaults to empty, which is
the withheld state, so the gate works with the variable entirely absent.

The Storefront reads the value through a bracket lookup on a named constant
(`env[CUSTOM_EMBROIDERY_RELEASE_ENABLED_ENV]`) rather than as a literal
`process.env.CUSTOM_EMBROIDERY_RELEASE_ENABLED` member access. This is the
delivered `public-origin.ts` pattern and it matters here: a literal member access
is the shape a bundler can inline at build time, which would turn a
configuration-driven gate into build-time dead code — precisely what §4 rules
out. Verified live: the same running image changed behaviour between the two
runs with **no rebuild and no code change**.

---

## D. Storefront route gate

Implemented as `apps/storefront/src/proxy.ts` — the Next 16 canonical name for
the middleware convention (`middleware.ts` is deprecated in this version and
Next errors if both exist).

**The exact seven withheld routes:**

| # | Route | Owner | Live status, withheld |
|---|---|---|---|
| 1 | `/yeu-cau/moi` | APP5-S01 | `404` |
| 2 | `/yeu-cau/da-gui` | APP5-S02 | `404` |
| 3 | `/san-pham/[slug]/thiet-ke` | APP3-S01 | `404` |
| 4 | `/truy-cap/bao-gia` | APP6-S01 | `404` |
| 5 | `/truy-cap/duyet-thiet-ke` | APP6-S01 | `404` |
| 6 | `/truy-cap/thanh-toan` | APP7-S01 | `404` |
| 7 | `/truy-cap/thanh-toan-con-lai` | APP9-S01 | `404` |

**Explicitly not blocked:** `/`, `/kham-pha`, `/san-pham/[slug]`, `/bo-suu-tap`,
`/bo-suu-tap/[slug]`, `/dich-vu`, `/cau-hoi-thuong-gap`, `/cua-hang`,
`/chinh-sach/[slug]`, `/xac-minh-lien-he`, **`/truy-cap` (the landing itself)**,
`/healthz`, `/robots.txt`, `/sitemap.xml`.

### Why the proxy rather than a page-level `notFound()`

Three properties the page-level alternative cannot give:

1. **The refusal precedes the surface.** The proxy runs before routing resolves,
   so no Server Component for a withheld route is invoked and no server-side
   read is issued. A `notFound()` inside a page has already run that page's
   module.
2. **The transport is actually a denial.** This repository carries an open
   finding, `FU-APP2-DETAIL-NOT-FOUND-STATUS-01`, that a `notFound()` from a
   dynamic route can answer `200`. §7 asks for a verified transport status, so
   the gate must not be built on the mechanism known to under-report.
3. **One decision, one place.** Seven page guards are seven chances for the
   eighth Wave-2 route to arrive unguarded.

### `/truy-cap` and `/san-pham` are matched exactly, never by prefix

These are the two traps §2.1 and §2.2 name. The `matcher` narrows the proxy to
three prefixes for cost only; the authority is `isWithheldWave2Route`, which is
still asked for every path that arrives. Asserted as explicit non-denials:
`/truy-cap` → allowed, `/san-pham/<slug>` → allowed, and the future Wave-1
routes `/truy-cap/don-hang` and `/mua-hang/<slug>` → allowed. The four withheld
secure-access surfaces are listed as **segments beneath the landing**, so adding
`/truy-cap/don-hang` at `APP12-S03` is a matter of *not* listing it.

The Studio route is shape-matched (`/san-pham/<slug>/thiet-ke`, exactly three
segments) because the slug is the customer's. Trailing-slash and case
differences normalize to the same address.

---

## E. API operation gate

Implemented as one global `APP_GUARD`,
`apps/api/src/platform/release-gate/custom-capability-release.guard.ts`, with the
matrix in `wave2-operation-authority.ts`.

```text
public operations published = 43
DENY  (withheld in Wave 1)  = 31
ALLOW (released)            = 12
```

**Identity is the canonical `operationId`**, derived at request time with the
same `createOperationId` that `SwaggerModule` uses to mint the published ids.
The gate and the contract therefore cannot drift: a controller rename that would
reissue an id also moves the route out of the withheld set, and the suite fails.
No path pattern is parsed twice, and no prefix rule exists — a prefix is exactly
how `publicProductPlacement_get` (custom) and `publicProduct_detail` (Wave-1
catalog) end up on the same side of a gate.

The guard is registered before every feature module. Nest runs global guards
ahead of controller- and route-scoped ones, so a withheld operation is refused
**before any delivered authorization guard and before any business execution** —
no session authorized, no request created, no payment attempt opened, no row
read.

### The 31 withheld operations

| Family | Ops | Operation ids |
|---|---|---|
| Placement / side background | 2 | `publicProductPlacement_get`, `publicProductSideBackground_get` |
| Design templates | 3 | `publicDesignTemplate_list`, `_detail`, `publicDesignTemplateAsset_get` |
| Design sessions | 6 | `publicDesignSession_create`, `_resume`, `_autosave`, `publicDesignSessionAsset_create`, `_get`, `_status` |
| Custom requests | 4 | `publicCustomRequest_submit`, `_status`, `publicCustomRequestAsset_upload`, `_status` |
| Quotations | 3 | `publicQuotation_current`, `_accept`, `_reject` |
| Design reviews | 3 | `publicDesignReview_current`, `_approve`, `_requestRevision` |
| Deposit + evidence | 5 | `publicOrderDeposit_current`, `_qr`, `_initiate`, `publicOrderDepositEvidence_upload`, `_status` |
| Final payment | 3 | `publicOrderFinalPayment_current`, `_qr`, `_initiate` |
| Shipping-fee acknowledgement | 1 | `publicOrderShippingFee_acknowledge` |
| Secure link | 1 | `publicSecureLink_resolve` (§F) |
| **Total** | **31** | |

### The 12 released operations

| Family | Ops | Operation ids |
|---|---|---|
| Public catalog | 4 | `publicProduct_list`, `_detail`, `publicProductMedia_get`, `publicProductVariant_list` |
| Public gallery | 3 | `publicGalleryEntry_list`, `_detail`, `_asset` |
| Sitemap inventory | 1 | `publicSitemapEntry_list` |
| **Contact verification** | 4 | `publicVerification_issue`, `_resend`, `_submitAttempt`, `_readStatus` |
| **Total** | **12** | |

Contact verification is released deliberately (§3.1). Its contract carries
`contactKind` and `purpose` and no custom-request coupling, and `APP12-P01` locks
it as the shared identity primitive Ready-Made checkout depends on. **Denying it
would deny Wave 1.** Every one of the four was live-exercised and none was
release-gated.

Both sets are written out in full so one test can assert that their union is
exactly the 43 public operations the application publishes. That is what makes a
later checkpoint's unclassified operation a test failure rather than either a
hole in the gate or a false denial.

---

## F. `publicSecureLink_resolve` — temporary whole-operation denial

```text
now (before DB01/B04):  publicSecureLink_resolve = DENY, whole operation
after B04 ships:        gate by scopeKind, not by operation
                        ORDER_ACCESS   = ALLOW  in Wave 1
                        REQUEST_ACCESS = DENY   until Wave 2
```

Withheld as a whole operation today because `SecureLinkResolutionResponse`
returns `customRequestId` and a `scopeKind` enum whose only member is
`REQUEST_ACCESS`: the operation has no Wave-1 caller and no Ready-Made scope, so
there is nothing in it to keep open. No `ORDER_ACCESS` implementation was
invented here.

The re-open obligation is recorded in three places so it cannot be lost:

- **code** — `SECURE_LINK_REOPEN_OBLIGATION` in `wave2-operation-authority.ts`,
  naming `owner = APP12-B04`, `currentRule = DENY_WHOLE_OPERATION`,
  `requiredRule = GATE_BY_SCOPE_KIND`;
- **tests** — `release-gate.contract.spec.ts` asserts the owner and the required
  rule, so deleting the obligation fails the suite;
- **docs** — this section and `APP12-RELEASE-WAVE-AUTHORITY.md` §3.2/§8.

A whole-operation denial written here and never revisited would leave
`/truy-cap/don-hang` unable to resolve its own link, breaking the Wave-1 order
surface at `APP12-S03` for a reason that looks nothing like this file.

---

## G. Staff/Admin audit — verified, not assumed

§5 argues that Wave-2 Admin surfaces are safe unguarded because no custom
request or custom order can exist while the customer-side entry points are
denied. §15 requires that be **checked**. It was, by tracing every write that
can mint a Wave-2 subject:

| Subject | Sole INSERT site | Sole non-test caller | Reachable from | Gated? |
|---|---|---|---|---|
| `custom_requests` | `DrizzleCustomRequestRepository.submit()` | `SubmitCustomRequestUseCase` | `PublicCustomRequestController` → `publicCustomRequest_submit` | **yes — withheld** |
| `orders` | `DrizzleOrderRepository.createFromAcceptedQuotation()` | worker `ConvertApprovedDesignUseCase` | `design.approved` outbox event, written only by `ApproveDesignVersionUseCase`, reachable only from `PublicDesignReviewDecisionController` → `publicDesignReview_approve` | **yes — withheld** |

**No `admin*` operation can create either subject.** The §5 reasoning therefore
holds for every `STAFF_ONLY_PRE_RELEASE` surface:

```text
Admin design templates / placement / side background = NOT gated
Admin custom requests / design versions / moderation = NOT gated
Admin quotations                                     = NOT gated
Admin production jobs                                = NOT gated
```

No separate Admin feature flag was created, no Admin screen was disabled, and
the test suite asserts that **every** `admin*`, `staff*` and `health*` operation
is admitted by the guard in the withheld state. `APP12-H01` re-audits this under
authorization, as §5 already schedules.

---

## H. Worker/internal audit

No worker handler was disabled and no flag was spread through worker code.

The one internal seam that can mint a customer-visible Wave-2 subject is the
order-conversion job in the table above. Its trigger is the `design.approved`
outbox event, whose only producer is reachable only from a **withheld** public
operation. The job therefore has no reachable trigger in Wave 1: the
customer-side gate is what makes the internal side safe, exactly as §5 argues,
and gating the initiating seam would be gating something already unreachable.

Historical custom jobs in a development environment continue to run, which is
what §16 asks for — staff-only evidence stays inspectable.

---

## I. Disabled-mode automated evidence

| Suite | Result |
|---|---|
| `apps/api` · `src/config/custom-embroidery-release.config.spec.ts` | **21 passed** |
| `apps/api` · `src/platform/release-gate/release-gate.contract.spec.ts` | **11 passed** |
| `apps/storefront` · `test/unit/release-isolation-gate.test.ts` | **63 passed** |
| `apps/storefront` · `test/components` (full) | **65 suites / 995 passed** |
| `apps/api` · `src/openapi/build-openapi-document.spec.ts`, `operation-id.spec.ts` | **21 passed** |

The API gate suite is the auditable form §21 asks for. It does **not** assert one
representative operation per family. It composes the real `AppModule`, enumerates
every controller/handler pair the container actually registers, computes each
canonical `operationId`, and asks the real guard what it would do — so both
failure modes are detectable:

- an operation in the `DENY` authority the guard does not refuse;
- an operation in the `ALLOW` authority the guard does refuse.

It also asserts the union of the two sets is exactly the 43 published public
operations, that the denial is a bare `404` whose body contains no
`CUSTOM_EMBROIDERY`, no `Wave`, no `release` and no operationId, and that the
denial is logged under an event name matching `LOG_EVENT_PATTERN` — the platform
silently rewrites a malformed event to `platform.log`, which would make every
release denial unqueryable.

---

## J. Enabled-mode automated evidence

Proved in the same suites, with **no code difference** between the states:

- API — with `enabled: true` the guard admits **every** operation the application
  publishes, withheld or not (`denied = []`).
- Storefront — with the flag `true` all seven Wave-2 routes stop being denied,
  and every Wave-1 route stays reachable as before.
- Shell — the suppressed primary-navigation link is **restored** with its
  delivered `href`, and the drawer focus trap is proved to wrap correctly in
  both release states.

---

## K. Live HTTP evidence

Against the canonical local gateway (`http://embroidery.local`, Nginx → Next/Nest),
no image rebuilt.

### Withheld (`CUSTOM_EMBROIDERY_RELEASE_ENABLED` absent — the production default)

```text
STOREFRONT
/yeu-cau/moi                        404      /                      200
/yeu-cau/da-gui                     404      /kham-pha              200
/san-pham/ao-thun-cotton/thiet-ke   404      /san-pham/ao-thun-cotton 200
/truy-cap/bao-gia                   404      /bo-suu-tap            200
/truy-cap/duyet-thiet-ke            404      /dich-vu               200
/truy-cap/thanh-toan                404      /cua-hang              200
/truy-cap/thanh-toan-con-lai        404      /xac-minh-lien-he      200
                                             /truy-cap              200
denied 7 / 7                                 /healthz               200
                                             /robots.txt            200
                                             /sitemap.xml           200

API — all 43 public operations exercised mechanically
release-gated operations = 31 / 31   (exact set match against the authority)
false denials            =  0 / 12
health_check             = 200
```

The 31 gated operations were collected from the structured log
(`event = release.gate.withheld`) and compared programmatically against the
authority matrix: `in authority but not withheld live = []`,
`withheld live but not in authority = []`, `EXACT MATCH: true`.

Gate denial versus business `404`, showing the gate leaks nothing:

```text
gate      {"success":false,"code":"NOT_FOUND","message":"Not Found",…}
business  {"success":false,"code":"NOT_FOUND","message":"That verification challenge does not exist.",…}
business  {"success":false,"code":"PUBLIC_GALLERY_ENTRY_NOT_FOUND","message":"That gallery entry is not available.",…}
```

The allowed verification family returned its **business** responses
(`400`/`400`/`422`, and `404 "That verification challenge does not exist."` for a
random id) — proof it reached business execution rather than the gate.

### Released (`CUSTOM_EMBROIDERY_RELEASE_ENABLED=true`)

```text
/yeu-cau/moi                        200      /                      200
/yeu-cau/da-gui                     200      /kham-pha              200
/san-pham/ao-thun-cotton/thiet-ke   200      /xac-minh-lien-he      200
/truy-cap/bao-gia                   200      /truy-cap              200
/truy-cap/duyet-thiet-ke            200      /robots.txt            200
/truy-cap/thanh-toan                200      /sitemap.xml           200
/truy-cap/thanh-toan-con-lai        200
restored 7 / 7

API — all 43 public operations exercised
release-gated operations = 0
publicDesignTemplate_list = 400 (delivered validation response — the pre-G02 baseline)
publicSecureLink_resolve  = 400 (delivered validation response)
health_check              = 200
```

Startup log, both states, non-secret and customer-data-free:

```text
{"event":"platform.log","message":"Custom embroidery release enabled=false.","attributes":{"variable":"CUSTOM_EMBROIDERY_RELEASE_ENABLED","enabled":false}}
{"event":"platform.log","message":"Custom embroidery release enabled=true.", "attributes":{"variable":"CUSTOM_EMBROIDERY_RELEASE_ENABLED","enabled":true}}
```

---

## L. Live Playwright evidence

Chromium, direct navigation, no in-app clicking.

| URL | Transport | Rendered |
|---|---|---|
| `/yeu-cau/moi` | **404** | canonical not-found: `404` · “Không tìm thấy trang” · home and Discover links. **No request form, no custom flow.** |
| `/san-pham/ao-thun-cotton/thiet-ke` | **404** | canonical not-found. **No Studio, no canvas, no session.** |
| `/khong-ton-tai-abc` (control) | **404** | the same page, byte-identical error id |
| `/kham-pha` | 200 | delivered Discover page |

The withheld routes are **indistinguishable from an address that does not
exist** — same status, same page, same error id as the unknown-route control.
The URL is unchanged in the address bar because the denial is a rewrite, not a
redirect; a redirect would announce that the route was recognised and turned
away.

Scripting is irrelevant to the denial: the refusal happens in the proxy, before
any component or client bundle is involved.

**One environment observation, pre-existing and not a G02 defect.** With
`STOREFRONT_PUBLIC_ORIGIN` unset, *every* page render fails in the root layout's
`generateMetadata` and `/robots.txt` and `/sitemap.xml` answer `500`. This is
`FU-APP11-S04-01` (operator public-origin configuration), carried into APP12 by
`APP11-X01`. It was confirmed unrelated three ways: the proxy matcher never
covers `/robots.txt` or `/sitemap.xml`; the identical failure occurs on allowed
routes such as `/kham-pha`; and supplying the origin at the shell for the
verification run made all of them `200` with every gate result unchanged.

---

## M. Security/privacy behavior

```text
denial status           = 404
denial body             = generic platform NOT_FOUND envelope
flag name leaked        = no
release wave leaked     = no
operationId leaked      = no
configured value leaked = no
robots/noindex used as the gate = no
```

`403 "custom embroidery disabled"` and `503 "feature unavailable"` were both
rejected, per §13: Wave 2 is not released, so from the outside there is nothing
there, and a refusal that explains itself publishes the release plan to anyone
who probes for it.

The reason is carried only in the structured log
(`event = release.gate.withheld`, `attributes.operationId`), which names the
operation and nothing about the caller — correlation is already stamped by the
platform logger. No customer data is logged. The release flag is not exposed
through any health payload, and both health operations stayed `200` in both
states.

Validators never echo the configured value. `.env` was not written and no
credential was read, rotated or logged.

---

## N. Files changed

**New — API**

```text
apps/api/src/config/custom-embroidery-release.config.ts
apps/api/src/config/custom-embroidery-release.config.spec.ts
apps/api/src/platform/release-gate/wave2-operation-authority.ts
apps/api/src/platform/release-gate/custom-capability-release.guard.ts
apps/api/src/platform/release-gate/release-gate.module.ts
apps/api/src/platform/release-gate/release-gate.contract.spec.ts
```

**New — Storefront**

```text
apps/storefront/src/config/custom-embroidery-release.ts
apps/storefront/src/features/release-isolation/index.ts
apps/storefront/src/features/release-isolation/model/wave2-route-policy.ts
apps/storefront/src/features/release-isolation/model/withheld-route-state.ts
apps/storefront/src/proxy.ts
apps/storefront/test/unit/release-isolation-gate.test.ts
```

**Modified**

```text
apps/api/src/bootstrap/app.module.ts                      (+1 import, ReleaseGateModule)
apps/storefront/src/features/storefront-shell/components/storefront-primary-nav.tsx  (§9 suppression)
apps/storefront/test/components/storefront-shell-render.test.tsx   (release-aware nav assertions)
apps/storefront/test/components/storefront-shell-drawer.test.tsx   (focus trap in both states)
.env.example                                              (documented flag)
infrastructure/compose/docker-compose.dev.yml             (api + storefront pass-through)
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md      (APP12 row)
docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md  (status table, NEXT)
docs/implementation/reports/APP12-G02-COMPLETION-REPORT.md (this file)
```

`.env` — **not written.**

### §9 navigation posture, and its boundary

Product Detail carries **no** Studio call to action, so §2.1's `APP12-S01`
ownership is untouched and nothing was done there.

The primary navigation **did** carry an active Wave-2 CTA — `Đặt thêu` →
`/yeu-cau/moi` — which the server now refuses. The smallest same-capability
suppression was applied: while the capability is withheld, that item renders
through the navigation's **existing** unavailable branch, the one `Studio` and
`Nhật ký` already use (`aria-disabled`, the delivered tag, the delivered
screen-reader suffix). No copy, no SCSS, no new state, no redesign, and the link
is restored verbatim when the flag is `true`. Verified live: 2 links + 3
unavailable items withheld, 3 links released.

**Not done, and reported rather than silently expanded.**
**Superseded by `APP12-G02-C1` — see §A0.** The count below is wrong (nine, not
seven, including the Homepage *hero* this paragraph omits) and the stated reason
for deferring did not hold: all nine were corrected by omitting the offer, with
no new copy, no new affordance and no SCSS change. `/yeu-cau/moi` is also
advertised from seven further surfaces: the Homepage commission section, the
gallery-entry commission block, the footer store-presentation block, the Service,
FAQ and Local pages, and the payment and shipping policy pages. None has a
delivered unavailable-state affordance, so suppressing them would require new
copy and layout that §27 freezes and §9 calls a redesign. §9 scopes the
inspection to primary navigation, Homepage CTAs and Product Detail actions;
extending the suppression across seven content surfaces is a presentation
program, not a release gate. Routed as `FU-APP12-G02-01` (§R). The gate itself is
unaffected — these are links to a route that answers `404`, not a way to reach it.

---

## O. File-size compliance

`node tools/check-file-size.mjs --paths <16 changed source/test files>`

```text
Scoped file-size check passed (16 file(s), 1 above the review threshold).
REVIEW  apps/api/src/bootstrap/app.module.ts: 347 lines exceeds the source review threshold of 300.
```

Every new file is under both thresholds. `app.module.ts` is at **347** of the
400-line hard limit — it is over the *review threshold*, not over-limit, and it
was already at **339** at `HEAD` before this checkpoint touched it. G02 added one
import and a seven-line comment. §24 requires splitting a touched
**over-limit** source; this file is not over-limit, so no split was performed and
none is smuggled in. No repository-wide sweep was run.

---

## P. Validation run / not run

**Run**

```text
git diff --check                                         clean
node tools/check-file-size.mjs --paths <16 files>         PASS
apps/api      pnpm exec tsc --noEmit                      PASS
apps/storefront pnpm exec tsc --noEmit                    PASS
apps/api      jest src/config/custom-embroidery-release.config.spec.ts   21 passed
apps/api      jest src/platform/release-gate                             11 passed
apps/api      jest src/openapi/build-openapi-document.spec.ts operation-id.spec.ts  21 passed
apps/storefront jest test/unit/release-isolation-gate.test.ts            63 passed
apps/storefront jest test/components                        65 suites / 995 passed
prettier --check <all changed files>                      PASS
eslint <changed API files>                                PASS
eslint <changed Storefront files>                         PASS
live disabled-mode HTTP (7 routes, 43 operations, health) PASS
live disabled-mode Playwright (3 navigations + control)   PASS
live enabled-mode HTTP + Playwright compatibility         PASS
docker compose config (implicit — up -d --no-build succeeded twice)  PASS
```

**Two escalations, both explained.**

`apps/storefront jest test/components` is broader than the changed files.
Justified: the §9 nav suppression changes a component the entire shell renders on
every page, so the smallest authoritative validation of it is the shell's own
component suite, and that suite is not separable from its directory. It found the
two delivered assertions that encoded "commission is a link" as a fact; both were
made release-aware rather than weakened — the drawer focus trap now runs in
**both** release states, which proves strictly more than the fixed five-stop
version did.

`apps/api jest src/openapi/…` is not a changed file. Justified: it is the only
authoritative proof of the §26 contract freeze — it builds the document from the
real `AppModule` (now carrying a global guard) and compares it against the
committed artifact. Running it is how "OpenAPI unchanged" stops being an
assertion and becomes evidence.

**Not run** (and not justified by this change): full monorepo, full Admin suite,
full Storefront historical suite, full API suite, worker suite, performance, UAT,
production build, live Figma, SonarQube, Docker rebuild.

---

## Q. Baseline deltas

```text
OpenAPI operations      = unchanged (128; artifact-comparison spec PASS)
OpenAPI schemas         = unchanged (252)
OpenAPI artifact file   = unchanged (0 diff lines)
generated client        = unchanged (0 diff lines)
migrations              = unchanged (0 added)
DB schema               = unchanged
Admin page routes       = unchanged (25)
Storefront page routes  = unchanged (18)
Figma                   = unchanged
FIGMA_DESIGN_INDEX.md   = unchanged (0 diff lines)
SCSS                    = unchanged (0 diff lines)
dependencies            = unchanged (no install, no lockfile change)
Docker images           = not rebuilt
UAT data                = none seeded
Ready-Made code         = none written
dynamic categories      = untouched
```

No new business endpoint was added and no OpenAPI annotation was needed: the
guard is framework wiring that the document generator does not observe, which the
artifact-comparison spec confirms.

---

## R. Follow-up routing

**Created by this checkpoint**

| ID | Finding | Owner | Blocking |
|---|---|---|---|
| `FU-APP12-G02-01` | ~~Seven~~ **nine** further customer surfaces still advertise `/yeu-cau/moi` while the server withholds it (Homepage **hero**, Homepage commission, gallery-entry commission, footer store-presentation, Service, FAQ, Local, payment policy, shipping policy). ~~Each needs an unavailable-state affordance that does not exist yet.~~ **No such affordance was needed — see §A0.** | ~~`APP12-S01`~~ **`CLOSED_BY_APP12_G02_C1`** | no |

**Carried forward, owners not taken**

| Finding | Owner |
|---|---|
| `check-report-secrets.mjs` findings in the committed `APP6-B04` and `APP9-G01` reports (`SECURITY_AUDIT_INPUT`; 0 findings in APP12 files). No historical report was edited and no matched value is reproduced here. | `APP12-H01` |
| `FU-APP11-S01-04` slash-div | `APP12-H02` |
| `FU-APP11-A01-04` stale API image | `APP12-H02` |
| Route-authority fixed-category gate | `APP12-C03` |
| `FU-APP11-S04-01` operator public-origin configuration — re-confirmed live during this checkpoint (unset ⇒ `500` on `/robots.txt`, `/sitemap.xml` and every page render) | `APP12-H01` / operator |
| `FU-APP2-DETAIL-NOT-FOUND-STATUS-01` dynamic not-found HTTP 200 — the reason this gate is a proxy rather than a page-level `notFound()` | unchanged |
| §5 `STAFF_ONLY_PRE_RELEASE` re-audit under authorization | `APP12-H01` |
| `publicSecureLink_resolve` scope-gating re-open | `APP12-B04` |
| `noindex` on `/mua-hang` and the order surface | `APP12-H06` |

---

## S. Roadmap

```text
APP12-G02 = COMPLETE
APP12-D01 = NEXT          (not started)
APP12-DB01 = NOT_STARTED

ROADMAP_STATUS = LOCKED
ROADMAP_LOCK   = LOCKED
CHECKPOINTS    = 38
```

`APP12-D01` is next because Ready-Made is a new bounded customer capability and
its one authorized phase-level design package must be complete before any
frontend implementation.

```text
PUSHED = false
```
