# APP12 — Pre-Implementation Audit — Completion Report

- Task: `APP12 — PRE-IMPLEMENTATION AUDIT`
- Phase: `APP12 — Hardening, UAT and Production Readiness`
- Date: 2026-08-31
- Branch: `feat/app11-s04-seo-infrastructure` (HEAD `f9140e5e`)
- Companion authority: [`APP12-HARDENING-UAT-PRODUCTION-READINESS.md`](../phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md)

> ## Product Owner review — read this first
>
> ```text
> AUDIT_EVIDENCE = ACCEPTED_WITH_MANDATORY_PLANNING_RECONCILIATION
> §T ROADMAP     = SUPERSEDED_BY_PO_APP12_READY_MADE_WAVE1_DECISION
> ```
>
> The evidence in this report is accepted and stands unchanged. Two things in it
> are superseded by the Product Owner's decision of 2026-09-01:
>
> 1. **§T's roadmap is not executable.** It defined Wave 1 as customer-owned-product
>    custom embroidery. `PO-APP12-001` resolves Wave 1 as **ready-made / base-product
>    direct commerce**, and Wave 2 as **all** custom embroidery (COP, catalog
>    personalisation and the Design Studio). The revised roadmap replaces it.
> 2. **§A.1's claim that direct commerce was "never specified" is too strong.**
>    `docs/00-PROJECT-CHARTER.md:46` states the shop sells base products as well as
>    embroidering customer-supplied ones. The runtime finding — that no direct
>    purchase path exists in code, schema or contract — is unaffected and correct.
>
> The follow-up dispositions in §R and the Product Owner decisions in §V are
> re-stated under the new wave model in the reconciliation report. Read it for the
> current plan:
>
> [`APP12-PRE-IMPLEMENTATION-AUDIT-PO-RECONCILIATION-REPORT.md`](./APP12-PRE-IMPLEMENTATION-AUDIT-PO-RECONCILIATION-REPORT.md)
>
> This report is retained in full as the evidence record. Nothing below is edited.

---

## A. Verdict

```text
APP12_PRE_IMPLEMENTATION_AUDIT = COMPLETE
IMPLEMENTATION_STARTED         = false
ROADMAP_LOCK                   = PENDING_PO_REVIEW
PO_DECISION_REQUIRED           = PO-APP12-001 … PO-APP12-006
```

The audit completed every mandatory inspection. It returns one finding large
enough to change the shape of the approved release strategy, and it is stated
first because the rest of the roadmap depends on how the Product Owner resolves
it.

### A.1 Headline finding — "Commerce Core" as specified does not exist

The approved strategy defines Wave 1 as *"the normal-product commerce flow —
ordinary Product discovery/detail, the real normal-product purchase/order
lifecycle that currently exists."*

**No such flow exists in this repository, and none was ever specified.** This is
not an implementation gap or a misunderstanding of existing capability. It is the
product definition:

- `orders.custom_request_id` is `NOT NULL` **and** `UNIQUE`
  (`packages/database/src/schema/ordering/orders.ts:77`, `:95`). Every order is
  the conversion of exactly one custom request. There is no other producer.
- The same table requires `accepted_quotation_version_id NOT NULL` (`:79`) and
  `current_approval_snapshot_id NOT NULL` (`:80`). An order cannot exist without
  an accepted manual quotation **and** an immutable design-approval snapshot.
- `docs/01-PRODUCT-REQUIREMENTS.md` §2.2 lists the catalog Product's price field
  as *"Giá sản phẩm nền"* — base-garment price — alongside *"Các vùng có thể
  thêu"* (embroiderable areas). The catalog Product is the substrate embroidery
  is applied to, not an independently sellable good.
- `docs/00-PROJECT-CHARTER.md` §2 states the only customer journey: *Cá nhân hóa
  sản phẩm → Gửi yêu cầu thêu → Duyệt thiết kế → Thanh toán → Hoàn tất đơn hàng*.
  Personalisation is step one of the sole journey.
- Live confirmation: `/san-pham/ao-thun-cotton` renders **no purchase control of
  any kind**. Its complete action set is `← Quay lại Khám phá`, `Chia sẻ`,
  `Khám phá tất cả`, `Khám phá Áo thun`. Product Detail is a portfolio page.

There is no cart, no checkout, no `page.tsx` for either, and no API operation
that creates an order from a Product.

**Classification: `PRODUCT_DECISION_REQUIRED`.** It is not a go-live blocker
against delivered scope, because nothing promised it. Building ready-made
commerce is a new business capability requiring PRD and database change, and is
firmly outside APP12's locked "no new business features" boundary.

### A.2 What *is* separable — and it still serves the Product Owner's goal

The audit found a genuine, complete, navigable revenue path that requires **no
Design Studio / Editor at all**.

`/yeu-cau/moi` presents a two-way subject fork
(`features/custom-request/ui/subject-chooser.tsx`):

| Branch | Needs the Editor? | Live reachability |
|---|---|---|
| `CATALOG` — a shop garment | **Yes** — `buildCatalogSubmission` requires `designSessionId` (`model/submission-payload.ts`) | **Unreachable** — nothing links to the Studio |
| `CUSTOMER_OWNED` (COP) — the customer's own item | **No** — the payload carries no catalog key, no variant and no design session | **Reachable** — `Đặt thêu` in primary nav |

`storefront-navigation.ts:83` states it outright: *"A visit with no query string
is the customer-owned-product branch, **which is complete on its own**."*

So the Editor is already the separable component, and the PO's real objective —
release without waiting on Editor UAT — is achievable. It just cannot be
described as "normal-product commerce"; it is **customer-owned-product custom
embroidery**, running the full lifecycle: request → verification → quotation →
design review → approval → deposit → order → production → final payment →
fulfilment → completion.

This is the audit's recommended Wave 1 (`PO-APP12-001`), and the proposed
roadmap in §T is built on it.

### A.3 The other blocking discovery — there is no production target

```text
infrastructure/kubernetes/  = "Reserved. See infrastructure/README.md."   (1 file)
infrastructure/monitoring/  = "Reserved. See infrastructure/README.md."   (1 file)
prometheus|grafana|loki     = 0 matches repository-wide
/metrics endpoint           = does not exist
```

No deployment manifest, no dashboard, no alert, no metric. The candidate plan
treats H04 (observability) as an *audit*; it is a **build**, and there is no
candidate checkpoint for deployment infrastructure at all. Neither wave can
reach GO until this exists.

---

## B. APP11 closure baseline — verified

Every figure re-measured from the committed repository during this audit.

| Fact | Claimed at APP11-X01 | Measured now | Result |
|---|---|---|---|
| OpenAPI paths | 116 | 116 | PASS |
| OpenAPI operations | 128 | 128 | PASS |
| OpenAPI schemas | 252 | 252 | PASS |
| Migrations | 37 | 37 | PASS |
| Storefront page routes | 18 | 18 | PASS |
| Admin page routes | 25 | 25 | PASS |
| Figma registry rows | 532 | 532 (gate PASS) | PASS |

```text
APP11-X01 = COMPLETE   APP11 = PASS_WITH_FOLLOW_UPS
BLOCKING_FOLLOW_UPS = 0   PHASE = CLOSED   OPEN_TOTAL = 36
```

APP11 is **not reopened** by this audit. Working tree clean at start and end.

---

## C. Existing APP12 candidate-plan authority — recorded

Read in full from `docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md`.

Locked outcome, design policy (`NONE` for new design; approved defect
corrections only; material redesign needs separate authority), in-scope and
out-of-scope lists all remain valid and are carried forward unchanged.

Candidate slices as written: `H01` security · `H02` performance · `H03`
resilience · `H04` observability · `H05` accessibility · `H06` SEO · `H07`
runbooks · `U01` role-based UAT · `E01` full commerce regression · `E02`
negative/recovery regression · `X01` production-candidate closure.

Reconciled in §S.

---

## D. Product Owner release-strategy authority — recorded

```text
Wave 1 = Commerce Core                      (highest priority)
Wave 2 = Custom Embroidery + Editor         (after Wave 1 approval)
independent Wave 1 GO/NO-GO                 = REQUIRED
release isolation of Wave 2 from Wave 1     = REQUIRED
production deployment                       = separately authorized, never automatic
runtime UI/UX + content quality             = release gate, live-evidence based
```

Recorded as the highest APP12 planning authority. §A.1 reports where repository
truth cannot satisfy the Wave 1 definition as literally worded; §T proposes the
nearest structure that preserves every one of the strategy's actual objectives.

---

## E. Commerce Core journey discovery

Discovered mechanically from schema, contract, source and the live application.

### E.1 The only order-producing journey

| # | Step | Route / surface | Wave-1 (COP) classification |
|---|---|---|---|
| 1 | Admin creates/edits Product | `/products`, `/products/[id]` | `SHARED` |
| 2 | Admin publishes Product | Admin publication surface | `SHARED` |
| 3 | Public discovery | `/kham-pha` | `SHARED` |
| 4 | Product Detail | `/san-pham/[slug]` | `SHARED` (presentation only — **no purchase action**) |
| 5 | Open Design Studio | `/san-pham/[slug]/thiet-ke` | `CUSTOM_ONLY` — **no inbound link exists** |
| 6a | Request, catalog branch | `/yeu-cau/moi?san-pham=…&mat=…&vung=…` | `CUSTOM_ONLY` — requires a Studio session |
| 6b | Request, COP branch | `/yeu-cau/moi` | `NORMAL_PRODUCT_REQUIRED` (the Wave-1 entry) |
| 7 | Contact verification | `/xac-minh-lien-he` | `SHARED` |
| 8 | Request confirmation / status | `/yeu-cau/da-gui` | `SHARED` |
| 9 | Admin request queue + moderation | Admin request surfaces | `SHARED` |
| 10 | Manual quotation | Admin quotation workbench | `SHARED` |
| 11 | Customer quotation decision | `/truy-cap/bao-gia` | `SHARED` |
| 12 | Digitizing + design version send | Admin design workbench | `SHARED` |
| 13 | Customer design approval | `/truy-cap/duyet-thiet-ke` | `SHARED` |
| 14 | Deposit payment (40%) + order creation | `/truy-cap/thanh-toan` | `SHARED` |
| 15 | Inventory reservation | worker + Admin inventory | `SHARED` |
| 16 | Production queue / job | Admin production surfaces | `SHARED` |
| 17 | Final payment (60%) | `/truy-cap/thanh-toan-con-lai` | `SHARED` |
| 18 | Shipping / dispatch / completion | Admin fulfilment surfaces | `SHARED` |
| 19 | Customer communication | notification worker | `SHARED` |
| 20 | Cart / checkout / direct purchase | — | `NOT_USED` — **does not exist** |

### E.2 Answer to the mandated question

> *What does "sell a normal Product successfully from publication to completion"
> mean in this repository?*

**It has no meaning.** A published Product can be discovered, viewed and shared.
It cannot be bought. Selling requires a custom request, a manual quotation and an
approved design snapshot, in that order, enforced by `NOT NULL` constraints.

Steps 5 and 6a — and only those — are Editor-dependent. Everything else in the
lifecycle is `SHARED` and reachable through the COP branch.

---

## F. Wave 1 exposure / isolation audit

**Question:** can Commerce Core be released while Custom Embroidery + Editor
remain NOT RELEASED?

**Classification: `HARDENING_REQUIRED`** — close, but not there.

| Surface | Current state | Evidence |
|---|---|---|
| Primary navigation | `Studio` item is `route: null`, rendered **non-interactive** | `STOREFRONT_PRIMARY_NAV`, live header |
| Product Detail → Studio | **No link.** `buildStorefrontStudioPath` has zero UI callers | grep; live action set |
| Homepage / Product CTAs | No Studio CTA anywhere | live capture |
| Direct Editor URL | **`HTTP 200` — fully reachable** | `curl /san-pham/ao-thun-cotton/thiet-ke` |
| Editor API/runtime | APP3 session endpoints live and unguarded by any release flag | OpenAPI |
| Catalog request branch | Effectively dead — needs a Studio session handle that nothing mints | `catalog-entry-context.ts` |
| robots / indexing | `Disallow: /san-pham/*/thiet-ke`, `/yeu-cau`, `/truy-cap`, `/xac-minh-lien-he` | live `robots.txt` |
| Feature / release gate | **None exists anywhere in the repository** | grep |
| Admin/operator exposure | Design + template surfaces fully exposed to staff | Admin routes |

The Editor is navigationally invisible and crawler-excluded, but **hidden
navigation is not "unreleased"** — the prompt's own warning applies exactly here.
A visitor with the URL, a stale link or a bookmark reaches a live Studio and can
open real design sessions against the production API.

Bounded roadmap work is proposed (`APP12-G01`), not implemented here: one
release-exposure gate that fails closed for the Wave-2 route family
(`/san-pham/*/thiet-ke`, the catalog branch of `/yeu-cau/moi`, and the APP3
session API), configuration-driven so Wave 2 flips on without a code change.

---

## G. Runtime UI/UX + content-quality sample audit

Live sampling through the canonical gateway (`http://embroidery.local`,
`http://admin.embroidery.local`) with Playwright/Chromium. Desktop 1440×900 and
mobile 390×844. Contrast computed by WCAG 2.1 relative-luminance against each
element's resolved background. **Nothing was corrected.**

### G.1 Sampled screens

| Screen | Viewport | Density | Copy quality | Hierarchy | Contrast | Severity | Proposed owner |
|---|---|---|---|---|---|---|---|
| `/` Homepage | 1440 | 389 words, 7 sections, 19 paragraphs, 3128 px — **acceptable** | **Good.** Idiomatic Vietnamese, concrete, not AI-like or spec-like. Longest paragraph 133 chars | **Weak.** Featured card ≈235 px wide in a 1440 px row — ~75 % of the band empty. `Khám phá` and `Bộ sưu tập` are heading + one line + a small text link, reading as stubs | **12 measured failures**, incl. both primary CTAs at 3.82:1 | HIGH | `APP12-V01` / `V02` |
| `/` Homepage | 390 | 3978 px ≈ 4.7 screens; no horizontal overflow (scrollWidth 375) | Same, reads well stacked | **Good.** Hamburger nav, sensible rhythm and card stacking | Same token failures | MEDIUM | `APP12-V01` |
| `/kham-pha` Discover | 1440 | 175 words, 1188 px | Minimal, appropriate | **Cannot be judged** — one product, zero images | Same tokens | BLOCKED-BY-DATA | `APP12-G01` then `V01` |
| `/san-pham/ao-thun-cotton` | 1440 | 165 words | Good; honest `mediaEmpty` state | **No commerce CTA** (§A.1); `<title>` lacks the `— Xưởng Thêu` suffix every other page carries | Same tokens | HIGH (structural) | `PO-APP12-001` / `V01` |
| `/yeu-cau/moi` **(Wave-1 entry)** | 1440 | Very low | Clear, well-written fork copy | **Poor.** ~500 px of dead whitespace between the two options and the footer; content fills the top ~30 % of the page. Disabled step-rail labels very pale | Same tokens | HIGH | `APP12-V01` / `V02` |
| Admin `/login` | 1440 | Low | Fine | Adequate | **6 failures**, same three tokens | HIGH | `APP12-V01` / `V02` |

### G.2 The contrast finding is systemic, token-level and cross-app

Every failure traces to **three shared tokens** in
`packages/styles/src/settings/_color.scss`:

| Token | Value | Worst measured pairing | Required |
|---|---|---|---|
| `$color-action-primary` | `#e8475f` | **3.82:1** — white label on the primary CTA (`Khám phá tác phẩm`, `Bắt đầu yêu cầu`, Admin `Đăng nhập`) | 4.5:1 |
| `$color-text-tertiary` | `#9ca3af` | **2.29:1** on `#f5f3ef` — copyright, search placeholder, `Sắp ra mắt` | 4.5:1 |
| `$color-text-secondary` | `#6b7280` | **4.36:1** on `#f5f3ef` — footer body copy | 4.5:1 |

This is precisely the Product Owner's "washed-out / pale / low contrast"
observation, now measured. It is **one bounded decision, not a redesign**: three
values repair both applications at once.

**But the tokens are locked design authority.** The file header reads: *"Source
of truth: `DESIGN_SYSTEM_FOUNDATION.md` §4, confirmed verbatim against the
approved Figma foundation variables (node `101-13`). Values are locked; do not
derive alternatives from wireframes."*

Changing them is therefore a **design-authority change**, which §9 and §28
require to be routed to explicit PO/design approval rather than absorbed into
hardening. Raised as `PO-APP12-004`. Figma MCP is currently unavailable
(`FU-APP11-S03-01`), so the Figma-side update needs operator action.

### G.3 Content quality — the Product Owner's concern is largely *not* reproduced

The audit specifically hunted for implementation prose, completion-report
register, internal vocabulary, AI-draft explanation and marketing filler on
customer-facing surfaces. **It found none on the sampled screens.** Copy is
short, concrete, brand-appropriate Vietnamese; the longest paragraph anywhere on
the Homepage is 133 characters.

What is genuinely wrong on these screens is **hierarchy, density distribution and
contrast — not wording**. Reported honestly rather than inflated: the copy-rewrite
lane should stay narrow until `APP12-V01` samples the deeper transactional and
Admin surfaces this audit could not reach without fixtures.

Two real copy defects were confirmed:

- **Brand divergence, customer-visible on the landing page.** Header wordmark and
  page titles say `Xưởng Thêu`; the Homepage **footer column heading** and the
  `/yeu-cau/moi` `<title>` say `Nét Thêu`. `FU-APP11-S01-02` recorded this as a
  `/yeu-cau/moi` title issue; it is broader — both names appear on `/` itself.
- **Placeholder copy on the landing page.** *"Thông tin địa chỉ và giờ mở cửa sẽ
  được cập nhật."* — honest, correct given `FU-APP11-S05-01`, and unacceptable on
  a production launch page. Ties to `PO-APP12-002`.

### G.4 Live UAT is blocked by the dataset — a Wave-1 prerequisite

| Fact | Value |
|---|---|
| Products in database | 30 |
| `PUBLISHED` | **1** |
| `DRAFT` / `ARCHIVED` | 26 / 3 |
| Media rows on the one published product | **0** |
| `<img>` elements on `/`, `/kham-pha`, `/san-pham/[slug]` | **0** |

The empty grey cards are the delivered `mediaEmpty` state rendering correctly —
**not a defect**. But the consequence is decisive: **the product-imagery path,
the dominant visual element of any commerce storefront, is completely unexercised
at runtime**, and grid, density, hierarchy and performance cannot be judged on a
one-item, image-free catalog.

No Wave-1 visual, performance or SEO gate can pass on this dataset. A
representative published catalog with real media is a hard prerequisite, owned by
`APP12-G01`.

---

## H. Security readiness

| Area | Status | Wave | Evidence |
|---|---|---|---|
| Structured logging + request id | `PASS` | shared | `platform/logging/*`, live `X-Request-ID` header |
| `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` | `PASS` | shared | live response headers |
| **Content-Security-Policy** | `HARDENING_REQUIRED` | Wave 1 | **absent** from every live response |
| **Strict-Transport-Security** | `HARDENING_REQUIRED` | Wave 1 | absent (dev is HTTP; production needs it) |
| `X-Powered-By: Next.js` | `HARDENING_REQUIRED` | Wave 1 | framework disclosure, live |
| Staff auth / session | `ALREADY_COVERED` | shared | APP1-B01, re-verify under H01 |
| Secure grants / links | `ALREADY_COVERED` | shared | APP4-B05/B06 |
| Object ownership / authorization matrix | `HARDENING_REQUIRED` | Wave 1 | never audited endpoint-by-endpoint |
| Private vs public asset boundary | `ALREADY_COVERED` | shared | APP2-T01, APP11-B03A |
| Upload abuse / file validation | `HARDENING_REQUIRED` | Wave 1 | COP uploads are a Wave-1 path |
| Rate limits | `HARDENING_REQUIRED` | Wave 1 | not inventoried |
| Payment evidence privacy | `ALREADY_COVERED` | Wave 1 | APP7-B05/B06 |
| PII / log redaction | `HARDENING_REQUIRED` | Wave 1 | claimed, never proven under load |
| Secrets / config | `WAVE1_BLOCKER` | Wave 1 | no production secret mechanism exists (§N) |
| SSRF / path traversal | `HARDENING_REQUIRED` | Wave 1 | not audited |
| Worker trust boundary | `HARDENING_REQUIRED` | shared | not audited |
| Production debug behaviour | `HARDENING_REQUIRED` | Wave 1 | no production build ever run |
| Editor-specific session/asset security | `WAVE2_BLOCKER` | Wave 2 | deferrable **only** once §F's gate exists |

---

## I. Resilience readiness

| Scenario | Class | Note |
|---|---|---|
| API restart / graceful shutdown | `WAVE1_CRITICAL` | health + readiness exist; shutdown unproven |
| Worker retry / idempotency | `WAVE1_CRITICAL` | COP intake, notification, order conversion |
| Duplicate submission | `WAVE1_CRITICAL` | idempotency scoped to the verified challenge (APP5-G01) |
| Duplicate payment callback | `WAVE1_CRITICAL` | manual-transfer model; APP7-B04 verification |
| Manual payment recovery | `WAVE1_CRITICAL` | payments are operator-verified |
| Storage (MinIO) error | `SHARED` | COP uploads depend on it |
| DB transient failure | `SHARED` | — |
| Inventory / stock race | `WAVE1_CRITICAL` | APP8 reservation worker |
| Fulfilment recovery | `WAVE1_CRITICAL` | APP9 |
| Backup / restore | `SHARED` | DB10 runbooks exist and are current |
| Provider outage | `NONBLOCKING` | no external provider integrated yet |
| Editor session loss / autosave recovery | `WAVE2_CRITICAL` | APP3-B08 |
| Poison job / dead-letter | `SHARED` | needs the fault-injection fixture `FU-APP11-A01-03` names |

---

## J. Observability readiness

| Capability | Status |
|---|---|
| Structured logs | `DEV_WIRED` |
| Request id | `DEV_WIRED` (verified live) |
| Cross-service correlation | `CODE_EXISTS` — gateway logs `request_id`; end-to-end unproven |
| Worker / job correlation | `CODE_EXISTS` |
| Audit events | `CODE_EXISTS` (APP0-B05, used through APP10) |
| PII redaction | `DOCUMENTED_ONLY` |
| **Metrics** | **`MISSING`** — no `/metrics`, no instrumentation |
| **Prometheus / Grafana / Loki** | **`MISSING`** — 0 repository matches |
| **Dashboards** | **`MISSING`** |
| **Alerts** | **`MISSING`** |
| Health / readiness | `DEV_WIRED` — `/healthz`, `/gateway/healthz` live |

Wave 1 must be able to diagnose a failed COP sale — a stuck request, an
unverified payment, a failed reservation — without unsafe database manipulation.
Today it cannot. This is a **build**, not an audit, and it is a Wave-1 blocker.
Scope it to the Wave-1 lifecycle; resist an enterprise programme with no evidence
behind it.

---

## K. Performance / CWV readiness

No measurement has ever been taken, and **none can be trusted on the current
dataset** (§G.4): one published, image-free product means zero image payload,
trivial DB cost and unrepresentative LCP.

Sequence: `APP12-G01` seeds a representative catalog → `APP12-H05` measures →
only evidence-backed bottlenecks become work.

- **Wave 1 public:** `/`, `/kham-pha`, `/san-pham/[slug]`, `/bo-suu-tap`,
  `/bo-suu-tap/[slug]`, the four `/chinh-sach/*`, `/dich-vu`,
  `/cau-hoi-thuong-gap`, `/cua-hang`, `/yeu-cau/moi`, `/xac-minh-lien-he`, the
  four `/truy-cap/*`.
- **Wave 1 Admin:** product list/editor/publication, request queue/detail,
  quotation workbench, payment workspace, inventory, production queue,
  fulfilment.
- **Wave 2:** `/san-pham/[slug]/thiet-ke` and Editor interaction latency.
- **Metrics:** LCP, CLS, INP, TTFB, image payload, JS/hydration payload, API
  latency, DB/query cost, pagination, media loading.

`FU-APP11-B03-02` is relevant: public gallery and product responses are
`no-store`, inherited from APP2. That is a deliberate deployment decision to
revisit with a CDN, not a defect.

**No authoritative performance thresholds exist in the repository.** Recommended
release thresholds are raised as `PO-APP12-005` rather than invented here.

---

## L. Accessibility / compatibility readiness

Candidate `H05` mixes general accessibility with Editor interactions and must be
split by wave.

Wave 1 (`APP12-A01`): keyboard operation, focus visibility, forms and error
association, dialogs, navigation landmarks, heading order, dynamic
announcements, touch targets, contrast, reduced motion, image alternatives, the
critical COP customer flow and the critical Admin commerce flows, plus the
supported browser/device matrix.

Wave 2 (`APP12-W02`): Editor keyboard model, upload/preview, interaction and
selection semantics, focus management, mobile behaviour, recovery and error
handling.

Audit spot-checks: no horizontal overflow at 390 px; three sub-44 px targets on
the Homepage (skip link 200×33, two brand wordmarks at 26 px height) — low risk,
worth repairing. The contrast failures in §G.2 are the substantive item, and they
must be judged as commerce hierarchy, not only as WCAG automation output.

---

## M. SEO / public readiness

| Item | Status |
|---|---|
| `robots.txt` | `PASS` — live, correct disallows |
| `sitemap.xml` | `PASS` — APP11-S04/B04 |
| Canonical / Open Graph / structured data | `PASS` — APP11-S04 (+C1) |
| index / noindex boundary | `PASS` — Wave-2 routes disallowed |
| **Dynamic not-found HTTP status** | **`HARDENING_REQUIRED`** — reproduced live |
| **Favicon** | **`HARDENING_REQUIRED`** — `GET /favicon.ico` → 404, reproduced |
| Cache behaviour | deployment decision (`FU-APP11-B03-02`) |
| Public performance | unmeasured (§K) |
| Content quality | §G.3 |

Reproduced this audit:

```text
/san-pham/khong-ton-tai-abc    → 200      (should be 404)
/bo-suu-tap/khong-ton-tai-abc  → 200      (should be 404)
/khong-co-trang-nay            → 404      (correct)
/favicon.ico                   → 404
```

**Reconsidered as a launch concern, not inherited nonblocking status
(`FU-APP2-DETAIL-NOT-FOUND-STATUS-01`):** Wave 1 depends on Product and Gallery
discovery. A soft-404 on the two highest-volume dynamic families lets search
engines index unbounded not-found URLs as valid pages. The APP11 containment
(safe body, `noindex`, no canonical, no OG, never in the sitemap) is real and
limits the damage — but `noindex` plus `200` is a weaker, slower signal than
`404`. **Recommendation: fix before Wave 1 GO.** It is a small, bounded change.

---

## N. Deployment / configuration readiness

**Status: `WAVE1_BLOCKER`.**

- `infrastructure/kubernetes/` — a `README.md` reading *"Reserved."* No manifest,
  no Helm chart, no overlay, no ingress, no secret definition.
- No staging environment is defined anywhere.
- No production build or production container has ever been exercised.
- `FU-APP11-A01-04`: the dev API image is stale relative to APP11-B03A
  (`packages/object-storage/dist` predates `copyObject`); `docker compose build
  api` is the durable fix.

### N.1 `STOREFRONT_PUBLIC_ORIGIN` (`FU-APP11-S04-01`)

Verified this audit: `.env` carries **no** `STOREFRONT_PUBLIC_ORIGIN`;
`.env.example` declares it empty. The tracked contract is correct and fail-closed
— absorbing sitemap, canonical, Open Graph and secure-link origins.

The principle in the prompt — one canonical origin, no fallback, fail closed — is
**already what the code implements**. What is missing is the operator supplying a
value in a production/staging release configuration that does not yet exist.

```text
CLASSIFICATION  = WAVE1_BLOCKER (release configuration, not code)
OPERATOR ACTION = supply the canonical customer-facing origin (scheme + host,
                  no trailing slash) to the production and staging deployment
                  configuration created by APP12-H02, as ordinary non-secret
                  config.
```

No `.env` write was made or proposed. Per `CLAUDE.md` §8a this variable is
ordinary configuration, not a secret; the absent **secret** mechanism is the
separate Wave-1 blocker in §H.

---

## O. Runbook / recovery readiness

Present and current — database only:

```text
DB10_BACKUP_RUNBOOK · DB10_DISASTER_RECOVERY_RUNBOOK · DB10_PITR_RUNBOOK
DB10_RESTORE_RUNBOOK · DB10_RETENTION_RUNBOOK · DB6_MIGRATION_OPERATIONS_RUNBOOK
DB6_REPRODUCIBILITY_RUNBOOK
```

Missing entirely (`docs/operations/` does not exist): application deployment,
rollback, staff bootstrap/recovery, secret rotation, payment reconciliation,
worker/manual review, stuck job, MinIO/storage incident, health diagnostics, log
inspection, go-live checklist, incident response.

Wave 1 needs operator procedures for the COP commerce lifecycle — above all
**payment reconciliation**, since payments are manually verified, and **stuck
request/job recovery**. Editor-specific runbooks defer to Wave 2.

---

## P. Store facts / Product Owner input

`FU-APP11-S05-01` — canonical address, opening hours, phone, e-mail all
`NOT_AVAILABLE`. No value was fabricated, and none is proposed here.

| Fact | Wave-1 disposition | Reason |
|---|---|---|
| Phone | `GO_LIVE_REQUIRED_PRODUCT_OWNER_INPUT` | Sole synchronous channel for a manual-quotation, manual-payment business |
| E-mail | `GO_LIVE_REQUIRED_PRODUCT_OWNER_INPUT` | Transactional sender identity and customer replies |
| Address | `GO_LIVE_REQUIRED_PRODUCT_OWNER_INPUT` | `/cua-hang` exists, is linked from the footer as `Ghé xưởng`, and currently ships *"sẽ được cập nhật"* on the landing page |
| Opening hours | `OPTIONAL_FOR_WAVE1` | Desirable; not required to transact |

Raised as `PO-APP12-002`. No CMS is proposed — these are configuration or content
constants, consistent with `FU-APP11-G01-01` (`content_pages` has no runtime
consumer and none is planned).

---

## Q. Contract / persistence divergence (`FU-APP11-S04-C1-02`)

### Q.1 Measured truth

```text
OpenAPI PublicCategoryResponse.slug
  enum = ["thu-bong", "khan", "quan-ao", "khac"]

categories table
  slug = text, NOT NULL, UNIQUE (uq_categories__slug)
  CHECK constraints: ck_categories__status_allowed  (status only)
  → NO constraint on slug
```

Live rows, all `PUBLISHED`, with product counts:

```text
ao-thun   1     ← outside the contract enum
khac      6
khan      8
quan-ao   7
thu-bong  8
```

### Q.2 Recommended repair direction — **B, widen the contract**

- The database applies **no** `CHECK` to `categories.slug`. The closed enum is
  asserted by the contract alone and was never a persistence invariant.
- Categories are operator-managed catalog data (PRD §2.2 lists *Danh mục* as a
  Product attribute; Admin creates them). A closed enum freezes seed data into a
  domain rule and makes every future category a breaking contract change.
- `ao-thun` is legitimate, published, and semantically a refinement of `quan-ao`
  — exactly the taxonomy growth the shop is expected to do.
- Option A (constrain data to the contract) would delete or rename a published
  operator-created category that owns a product, against
  `fk_products__category_id ON DELETE RESTRICT`, and would destroy real taxonomy
  to satisfy an accidental enum.

**Recommendation: replace the closed enum with a pattern-validated slug string
(`^[a-z0-9-]+$`), regenerate the client, and keep validation at the boundary.**
Option C (coordinated DB + contract) is unnecessary: there is no DB constraint to
coordinate with.

### Q.3 Wave-1 blocking

**Yes — `WAVE1_BLOCKER`.** Wave 1 is built on catalog discovery. The divergence
already produced two real customer-visible defects in APP11
(`FU-APP11-S04-02`, `FU-APP11-S04-C1-01`: an invalid Discover filter reached
structured data and a CTA). Both were contained by removing the filter, which
means **Discover category filtering is currently degraded rather than correct**.
It warrants the heightened scrutiny the strategy demands, and it is a contract
change requiring a dedicated OpenAPI + client checkpoint (`APP12-C01`).

Not fixed in this audit.

---

## R. Follow-up intake — all 36 reconciled

Sourced from `APP11-CLOSURE-MATRIX.md` §8 and `APP11-X01-COMPLETION-REPORT.md`
§I, deduplicated. **No item is ownerless.** Waves assume `PO-APP12-001` resolves
to the recommended Wave 1 (COP commerce).

### R.1 APP11-owned — 30

| ID | Description | Reproduced | Disposition | Owner |
|---|---|---|---|---|
| `FU-APP11-S04-C1-02` | Category contract/data divergence | **Yes** (§Q) | `WAVE1_BLOCKER` | `APP12-C01` |
| `FU-APP11-S04-01` | No `STOREFRONT_PUBLIC_ORIGIN` in release config | **Yes** (§N.1) | `WAVE1_BLOCKER` | `APP12-H02` |
| `FU-APP11-S05-01` | Store address/hours/phone/e-mail unavailable | **Yes** (§G.3, §P) | `PRODUCT_OWNER_INPUT` | `PO-APP12-002` |
| `FU-APP11-S01-01` | Favicon 404 site-wide | **Yes** — `404` | `WAVE1_HARDENING` | `APP12-H06` |
| `FU-APP11-B03A-01` | No Gallery asset deletion/withdraw/un-promotion | Structural | `WAVE1_HARDENING` | `APP12-H07` (§R.4) |
| `FU-APP11-S03-01` | Live Figma unavailable (`ConnectionRefused`) | **Yes** — MCP down this session | `OPERATOR_INPUT` | `PO-APP12-006` |
| `FU-APP11-S03-03` | Zero-media published gallery state unreachable | Consequence | `WAVE1_HARDENING` | with `B03A-01` |
| `FU-APP11-G01-01` | `content_pages` has no runtime consumer | Structural | `PRODUCT_OWNER_INPUT` | `PO-APP12-003` |
| `FU-APP11-G01-02` | `redirect_rules` has no runtime consumer | Structural | `WAVE1_HARDENING` | `APP12-H06` |
| `FU-APP11-G01-03` | `07-ADMIN-OPERATIONS` §4 claims alt-text control | Doc divergence | `PRODUCT_OWNER_INPUT` | `PO-APP12-003` |
| `FU-APP11-G01-04` | Gallery grouping by style/need has no column | Structural | `NONBLOCKING_DEFER` | `PO-APP12-003` |
| `FU-APP11-G01-06` | Registry doc names deleted `pnpm quality` | Doc drift | `SHARED_HARDENING` | `APP12-G01` |
| `FU-APP11-B01-01` | `adminGalleryEntry_update` has no `expectedUpdatedAt` | Contract | `NONBLOCKING_DEFER` | next gallery checkpoint |
| `FU-APP11-B01-02` | `zod-dto-publication.contract.spec.ts` pins 19 paths/23 ops | **Yes** — line 387 vs 116 paths | `STALE_ASSERTION` | `APP12-G01` |
| `FU-APP11-B01-C1-01` | `app.module.ts` 339 lines, over review threshold | Structural | `NONBLOCKING_DEFER` | next composition checkpoint |
| `FU-APP11-B01-C1-02` | 79 file-size violations; gate cannot pass repo-wide | Structural | `SHARED_HARDENING` | `APP12-G01` |
| `FU-APP11-B04-02` | Duplicate of `B01-C1-02` | — | `ALREADY_SATISFIED` (dup) | same |
| `FU-APP11-B02-02` | Unreachable `GALLERY_ENTRY_VERSION_CONFLICT` mapping | Latent | `NONBLOCKING_DEFER` | next gallery-publication checkpoint |
| `FU-APP11-B03-02` | Public responses `no-store`; no invalidation consumer | **Yes** — live headers | `WAVE1_HARDENING` | `APP12-H05` |
| `FU-APP11-B03A-02` | No promotion idempotency | Structural | `WAVE1_HARDENING` | `APP12-H07` |
| `FU-APP11-B03A-03` | Derived derivatives carry no checksum/metadata | Structural | `NONBLOCKING_DEFER` | `APP12-H07` |
| `FU-APP11-B03A-04` | `object-key.spec.ts` — 2 stale SVG cases | Pre-existing red | `STALE_ASSERTION` | `APP12-G01` |
| `FU-APP11-B03A-05` | Duplicate of `B01-02` | — | `ALREADY_SATISFIED` (dup) | same |
| `FU-APP11-B04-01` | `product-placement.contract.spec.ts` APP3-era assertion | Pre-existing red | `STALE_ASSERTION` | `APP12-G01` |
| `FU-APP11-B04-03` | `PUBLIC_SITEMAP_MAX_TOTAL_ENTRIES` tripwire at 50 000 | Trigger-bound | `INTENTIONAL_LIMITATION` | future SEO checkpoint |
| `FU-APP11-A01-01` | Admin gallery list not verified against live Figma | Blocked by tooling | `WAVE1_UAT` | `APP12-V01` |
| `FU-APP11-A01-03` | Continuation failure/retry not exercised live | Fixture gap | `WAVE1_HARDENING` | `APP12-H04` |
| `FU-APP11-A01-04` | Dev API image stale vs B03A | **Yes** | `OPERATOR_INPUT` | `APP12-G01` |
| `FU-APP11-A01-05` / `A02-04` / `S02-03` | Live-testing residue in dev DB, unremovable | **Yes** | `WAVE1_HARDENING` | `APP12-G01` (with `B03A-01`) |
| `FU-APP11-A02-01` | Third Admin modal implementation | Structural | `NONBLOCKING_DEFER` | dedicated Admin refactor |
| `FU-APP11-A02-02` | Six editor frames unverified against live Figma | Blocked by tooling | `WAVE1_UAT` | `APP12-V01` |
| `FU-APP11-A02-03` | Catalog source tile has no preview | Needs backend op | `WAVE1_HARDENING` | `APP12-H07` |
| `FU-APP11-A02-C1-01` | `check-file-size.mjs` does not scan `.scss` | Governance | `SHARED_HARDENING` | `APP12-G01` |
| `FU-APP11-S01-02` | Brand divergence `Xưởng Thêu` vs `Nét Thêu` | **Yes** — on `/` itself | `PRODUCT_OWNER_INPUT` | `PO-APP12-003` |
| `FU-APP11-S01-03` | Turbopack does not hot-reload SCSS partials | **Yes** (known) | `OPERATOR_INPUT` | `APP12-G01` |
| `FU-APP11-S01-04` | `slash-div` deprecation, `secure-design-review.scss:43` | Static | `WAVE1_HARDENING` | `APP12-G01` |
| `FU-APP11-S01-05` | Shared breakpoint scale deferred (FU-A16) | Trigger-bound | `NONBLOCKING_DEFER` | next frontend checkpoint |
| `FU-APP11-S02-01` | UI05 editorial bands registered but unbuilt | Structural | `PRODUCT_OWNER_INPUT` | `PO-APP12-003` |
| `FU-APP11-S02-02` | Dehydrated cache carries five dropped fields | Latent | `NONBLOCKING_DEFER` | next non-public gallery field |
| `FU-APP11-S02-04` | Duplicate of `S01-01` (favicon) | — | `ALREADY_SATISFIED` (dup) | same |

### R.2 Inherited — 6

| ID | Description | Disposition | Owner |
|---|---|---|---|
| `FU-APP2-DETAIL-NOT-FOUND-STATUS-01` | Dynamic not-found answers HTTP 200 | `WAVE1_HARDENING` (**escalated**, §M) | `APP12-H06` |
| `FU-APP10-E01-01` | Four `FIG-APP10-I01-*` rows still `REVIEW_REQUIRED` | `WAVE1_UAT` | `APP12-V01` |
| `FU-APP10-G01-02` (absorbs `FU-APP9-B01-01`) | No `payment.final-requested` notification producer | `WAVE1_BLOCKER` | `APP12-U01` |
| `FU-APP10-G01-03` | Customer shipping-fee acknowledgement UI | `WAVE1_BLOCKER` | `APP12-U01` |
| `FU-APP10-I01-02` | Production Zalo/Messenger URLs unconfigured | `OPERATOR_INPUT` | `APP12-H02` |
| `FU-APP8-A01-04` | `Kho` nav entry absent | `INTENTIONAL_LIMITATION` | closed, noted |

Two inherited items are **escalated to `WAVE1_BLOCKER`**: `FU-APP10-G01-02` and
`-03` sit inside the final-payment and shipping steps of the COP lifecycle, which
Wave 1 now owns end-to-end. They were correctly nonblocking while no release
depended on that lifecycle; under the two-wave strategy they do.

### R.3 Counts

```text
TOTAL                  = 36
WAVE1_BLOCKER          =  5   (S04-C1-02, S04-01, G01-02*, G01-03*, + secrets §H)
WAVE1_HARDENING        = 12
WAVE1_UAT              =  3
STALE_ASSERTION        =  3
SHARED_HARDENING       =  3
OPERATOR_INPUT         =  4
PRODUCT_OWNER_INPUT    =  5
NONBLOCKING_DEFER      =  7
INTENTIONAL_LIMITATION =  2
ALREADY_SATISFIED(dup) =  3
WAVE2_ONLY             =  0
```

*`FU-APP10-G01-02` / `-03`. Counts exceed 36 because duplicates are listed under
both their alias and their owner.

### R.4 Gallery asset deletion — judged on operator risk (`FU-APP11-B03A-01`)

Not added merely because a follow-up exists. The real risk: promotion is **not
idempotent** (`B03A-02`), so two operator clicks create two independent gallery
assets, and **nothing can remove either**. The dev database already carries
unremovable residue (`A01-05`, `A02-04`, `S02-03`) proving the failure mode is
routine, not hypothetical.

Consequence for Wave 1: an operator publishing gallery content — buyer-confidence
material Wave 1 depends on — can permanently pollute the public gallery with a
duplicate and has no recovery path but direct database manipulation, which the
runbooks forbid.

```text
DISPOSITION = WAVE1_HARDENING (not a blocker)
```

A withdraw/un-promote path plus promotion idempotency is the bounded fix. It is
operational hardening rather than a go-live blocker because the damage is
cosmetic and forward-recoverable by republishing, but it should not survive into
production unaddressed.

---

## S. Candidate checkpoint reconciliation

| Candidate | Current intent | Decision | Reason | Wave |
|---|---|---|---|---|
| `H01` Authorization and security audit | Endpoint/screen matrix, ownership, grants, uploads, sessions, limits, secrets | **KEEP + RENAME** → `APP12-H01`, wave-scoped | Sound; must be split by wave and must not own production secret *mechanism* (that is H02) | 1 |
| `H02` Performance and scalability | Representative workloads | **SPLIT + REORDER** → `APP12-H05` | Cannot run before a representative dataset exists; ID freed for deployment | 1 |
| `H03` Resilience and failure rehearsal | Provider outage, duplicate callbacks, worker failure | **KEEP + RENAME** → `APP12-H04`, wave-scoped | Valid; drop provider-outage emphasis (no provider integrated) | 1 |
| `H04` Observability and alerting | "Complete metrics, dashboards, alerts" | **SPLIT + RENAME** → `APP12-H03` | Written as an audit; it is a **build from zero** (§J) | 1 |
| `H05` Accessibility and compatibility | Keyboard, contrast, mobile, **editor interactions** | **SPLIT** → `APP12-A01` (Wave 1) + `APP12-W02` (Wave 2) | Mixes both waves; Editor a11y cannot gate Wave 1 | 1 + 2 |
| `H06` SEO and public performance | Crawl/index, metadata, CWV budgets, cache | **SPLIT + KEEP** → `APP12-H06` | CWV moves to H05; absorbs not-found status, favicon, redirects | 1 |
| `H07` Operational runbooks | Deployment, rollback, backup, incident, reconciliation | **SPLIT** → `APP12-H07` (Wave 1) + Wave-2 extension in `W01` | Cannot be authored before H02 defines the deployment model | 1 |
| `U01` Role-based UAT | One-shot "all roles" | **SPLIT** → `APP12-U01` (Wave 1) + `APP12-W01` (Wave 2) | An ambiguous all-roles UAT is exactly what blocks an independent Wave 1 GO | 1 + 2 |
| `E01` Full commerce regression | Catalog → **Studio** → verification → request → review → quote → deposit → order → production → remaining payment → fulfilment → completion | **SPLIT — incompatible as written** | **Requires the Studio in step two**, so as the sole pre-release gate it forces Wave 1 to wait for Editor UAT. Becomes `APP12-E01` (COP lifecycle, Editor-free) and `APP12-W03` (catalog+Studio lifecycle) | 1 + 2 |
| `E02` Negative/recovery regression | Mixed failures incl. invalid design | **MERGE into `APP12-E01`, partitioned** | Wave-1 negatives share fixtures with the Wave-1 happy path; Editor negatives move to `W03` | 1 + 2 |
| `X01` Production candidate closure | Single go/no-go | **SPLIT** → `APP12-R01`, `APP12-R02`, `APP12-X01` | One terminal go/no-go **cannot** express two independent release decisions | 1, 2, both |
| — | *(absent)* | **NEW `APP12-G01`** | Wave scope lock, release-isolation gate, UAT dataset, test debt, governance | 0 |
| — | *(absent)* | **NEW `APP12-C01`** | Category contract correction (§Q) | 0 |
| — | *(absent)* | **NEW `APP12-H02`** | Production deployment/config — **nothing exists** (§N) | 1 |
| — | *(absent)* | **NEW `APP12-V01` / `V02`** | Runtime Visual & Content UAT + bounded corrections (§35) | 1 |

**Sufficiency of the current candidate set:** it does **not** support the
approved strategy. It has no wave concept, no release-isolation work, no
deployment infrastructure, no runtime visual/content owner, an Editor-dependent
sole regression gate, and a single terminal go/no-go.

---

## T. Proposed canonical APP12 roadmap

```text
ROADMAP_STATUS         = PROPOSED_FOR_PRODUCT_OWNER_LOCK
IMPLEMENTATION_STARTED = false
CHECKPOINTS            = 20
PROPOSED_NEXT          = APP12-G01
```

Assumes `PO-APP12-001` resolves to **Wave 1 = customer-owned-product custom
embroidery (Editor-free)**. If the PO chooses otherwise, §T is re-proposed rather
than adjusted in place.

Fields per checkpoint: wave · type · scope · dependencies · impact · expected API
/ migration / route delta · follow-ups owned · mandatory live evidence · test
class · release-gate consequence.

### Wave 0 — shared prerequisites

**`APP12-G01` — Wave scope lock, release isolation and UAT readiness** ·
Wave 0 · governance + bounded runtime · Lock wave membership per route and API
operation; design and specify the fail-closed release-exposure gate for Wave-2
surfaces; seed a representative published catalog with real media; rebuild the
stale dev API image; classify and re-scope the three stale contract specs;
disposition the file-size and `.scss` gate gaps and the registry doc drift ·
deps: PO roadmap lock · impact: config + tooling + docs · API Δ 0 · migration Δ 0
· route Δ 0 · owns `B01-02`, `B03A-04`, `B04-01`, `B01-C1-02`, `B04-02`,
`A02-C1-01`, `G01-06`, `A01-04`, `S01-03`, `S01-04`, `A01-05`/`A02-04`/`S02-03` ·
evidence: gate blocks `/san-pham/*/thiet-ke` with Wave 2 off and allows it on;
Discover renders a representative catalog with images · test: integration +
tooling · **gate: prerequisite for every other checkpoint.**

**`APP12-C01` — Public category contract correction** · Wave 0 · contract ·
Replace the closed `PublicCategoryResponse.slug` enum with a pattern-validated
slug; regenerate the client; restore correct Discover category filtering,
breadcrumb and CTA behaviour · deps: `G01` · **API Δ: 1 schema changed** ·
migration Δ 0 · route Δ 0 · owns `FU-APP11-S04-C1-02` (and closes the degradation
behind `S04-02`, `S04-C1-01`) · evidence: live `/kham-pha` filtered by `ao-thun`;
breadcrumb structured data valid · test: contract + integration + live ·
**gate: Wave 1 blocker.**

### Wave 1 — hardening, UAT and release

**`APP12-H01` — Authorization and security audit (Wave 1)** · audit + bounded fix
· Endpoint/screen authorization matrix for the COP lifecycle; object ownership;
secure grants; COP upload abuse and file validation; rate limits; PII/log
redaction; CSP, HSTS and `X-Powered-By`; SSRF/path traversal; worker trust
boundary; production debug behaviour · deps: `G01` · API Δ 0 · route Δ 0 ·
evidence: live header capture; denial matrix executed · test: integration + live
· **gate: Wave 1 blocker.**

**`APP12-H02` — Production deployment and configuration readiness** · Wave 1 ·
infrastructure · Author the production and staging deployment model (Kubernetes
manifests, ingress, TLS, image build/publish); define the secret mechanism;
supply `STOREFRONT_PUBLIC_ORIGIN` and the contact-dock URLs as release config;
rollback path · deps: `G01` · impact: `infrastructure/`, docs · API Δ 0 ·
migration Δ 0 · route Δ 0 · owns `FU-APP11-S04-01`, `FU-APP10-I01-02` · evidence:
a production-mode build and deploy to staging serving the canonical origin ·
test: infrastructure smoke · **gate: Wave 1 blocker.**

**`APP12-H03` — Observability and alerting (build)** · Wave 1 · infrastructure +
runtime · Metrics endpoint and instrumentation for the COP lifecycle; end-to-end
request/job correlation; dashboards and actionable alerts for stuck requests,
unverified payments, failed reservations and worker retries; prove PII redaction
· deps: `H02` · API Δ 0 (operational endpoint, not a business path) · owns the §J
gaps · evidence: a deliberately stalled COP request diagnosed from dashboard and
logs alone · test: integration + live · **gate: Wave 1 blocker.**

**`APP12-H04` — Resilience and failure rehearsal (Wave 1)** · rehearsal + bounded
fix · API restart and graceful shutdown; worker retry and idempotency; duplicate
submission; duplicate/again-verified payment; manual payment recovery; storage
and DB transient failure; inventory race; fulfilment recovery; poison job ·
deps: `H03` · owns `FU-APP11-A01-03` · evidence: each scenario executed live with
before/after state · test: integration + live · **gate: Wave 1 blocker.**

**`APP12-H05` — Performance and CWV measurement (Wave 1)** · measurement · Public
and Admin Wave-1 surfaces per §K; LCP, CLS, INP, TTFB, payloads, API and DB cost;
revisit `no-store` cache policy · deps: `G01` (dataset), `H02` (production build)
· owns `FU-APP11-B03-02` · evidence: measured table per surface against
`PO-APP12-005` thresholds · test: measurement · **gate: Wave 1 blocker if a
threshold is breached; optimisation is separate, evidence-backed work.**

**`APP12-H06` — SEO and public readiness (Wave 1)** · audit + bounded fix ·
Dynamic not-found HTTP status; favicon; redirect runtime; canonical, OG,
structured data and index boundary re-verified on the production origin · deps:
`H02`, `C01` · route Δ 0 (status and asset only) · owns
`FU-APP2-DETAIL-NOT-FOUND-STATUS-01`, `FU-APP11-S01-01`/`S02-04`,
`FU-APP11-G01-02` · evidence: live `404` on both dynamic families; `favicon.ico`
`200` · test: integration + live · **gate: Wave 1 blocker.**

**`APP12-H07` — Operational hardening and runbooks (Wave 1)** · docs + bounded
runtime · Deployment, rollback, staff bootstrap, secret rotation, payment
reconciliation, stuck request/job, storage incident, health diagnostics, log
inspection, go-live checklist, incident response; gallery asset
withdraw/un-promote and promotion idempotency; Admin source-tile preview · deps:
`H02`, `H03`, `H04` · **API Δ: up to 2 operations** (gallery withdraw, source
preview) · owns `FU-APP11-B03A-01`/`-02`/`-03`, `S03-03`, `A02-03` · evidence: an
operator executes reconciliation and stuck-job recovery from the runbook alone ·
test: integration + live · **gate: Wave 1 blocker for runbooks; hardening items
are non-blocking.**

**`APP12-V01` — Runtime Visual & Content UAT — audit (Wave 1)** · live UAT, **no
corrections** · Every Wave-1 customer surface and every Wave-1 Admin commerce
surface, at 1440 / 1024 / 390. Per screen: density, copy quality, hierarchy,
measured contrast, before-state capture. Records material-redesign findings and
routes them to PO/design authority rather than absorbing them · deps: `G01`
(dataset) · impact: docs only · API Δ 0 · owns `FU-APP11-A01-01`, `A02-02`,
`FU-APP10-E01-01` · evidence: screenshot + measurement per screen per viewport ·
test: live inspection · **gate: produces the Wave-1 defect list; findings are not
themselves blockers until triaged here.**

**`APP12-V02` — Runtime Visual & Content corrections and live re-verification
(Wave 1)** · bounded correction · Applies only `V01` findings the PO accepted as
in-boundary: shorten or rewrite copy, remove redundant explanation, improve CTA
wording, spacing, typographic hierarchy, contrast, surface separation, responsive
density, focus/touch presentation. **Reopens and recaptures every corrected page
live, with before/after evidence.** Excludes new branding, new IA, route
redesign, Design-System rewrite · deps: `V01`, `PO-APP12-004` (token authority)
· impact: SCSS + copy modules; `packages/styles` **only** if `PO-APP12-004`
grants token authority · API Δ 0 · migration Δ 0 · route Δ 0 · owns
`FU-APP11-S01-02` if the PO settles the brand name · evidence: before/after
capture and re-measured contrast per corrected screen · test: component + live ·
**gate: Wave 1 blocker for accepted defects.**

**`APP12-A01` — Accessibility and compatibility (Wave 1)** · audit + bounded fix
· §L Wave-1 coverage across the COP customer flow and the Admin commerce flows;
supported browser/device matrix · deps: `V02` (so contrast is judged once,
post-correction) · evidence: keyboard traversal and screen-reader-critical paths
executed live · test: component + live · **gate: Wave 1 blocker.**

**`APP12-U01` — Wave 1 role-based business UAT** · UAT · Operator managing
Products and publication; customer submitting a COP request through verification;
operator quoting, digitizing and sending a design; customer approving; deposit;
order; production; final payment; fulfilment; completion. Closes the two
inherited commerce gaps · deps: `C01`, `H06`, `V02` · **API Δ: up to 2
operations** (final-payment notification producer, shipping-fee acknowledgement)
· owns `FU-APP10-G01-02`, `FU-APP10-G01-03` · evidence: one complete COP order
executed live end to end, with operator screens · test: integration + live ·
**gate: Wave 1 blocker.**

**`APP12-E01` — Wave 1 commerce regression, positive and negative** · regression
· Happy path: request → verification → quotation → design review → approval →
deposit → order → production → final payment → fulfilment → completion, entirely
Editor-free. Negative and recovery: authorization denial, duplicate submit,
duplicate payment verification, expired secure link, stock race, worker retry ·
deps: `U01` · evidence: executed suite with per-case results · test: E2E ·
**gate: Wave 1 blocker.**

**`APP12-R01` — WAVE 1 RELEASE GATE** · release decision · Reconciles §U.1;
counts blockers; asserts Wave-2 isolation is enforced and verified; issues a
recommendation. **Does not deploy** · deps: all Wave-1 checkpoints · impact: docs
only · evidence: the completed Wave-1 matrix ·

```text
COMMERCE_CORE_GO_LIVE_BLOCKERS = n
RELEASE_WAVE_1_RECOMMENDATION  = GO | NO_GO      (GO requires n = 0)
```

### Wave 2 — Editor and catalog branch

**`APP12-W01` — Custom embroidery and Editor deep UAT** · UAT · Catalog-branch
request creation; Design Studio bootstrap, transforms, layers, text, image,
viewport, undo/redo, watermark, autosave, mobile touch; upload, preview, revision
and approval; secure customer interaction; operator design and template
management; Wave-2 runbook extensions · deps: `R01` = GO · evidence: live Editor
journeys · test: integration + live · **gate: Wave 2 blocker.**

**`APP12-W02` — Editor runtime UI/UX, accessibility and resilience** · audit +
bounded correction · Editor visual and content UAT with the `V01`/`V02` loop;
Editor keyboard model, focus and selection semantics, upload/preview states,
mobile behaviour; session loss, autosave recovery, error and empty states · deps:
`W01` · evidence: before/after capture per corrected Editor surface · test:
component + live · **gate: Wave 2 blocker.**

**`APP12-W03` — Wave 2 regression** · regression · Catalog → Studio →
verification → request → review → quote → deposit → order → production → final
payment → fulfilment → completion, plus Editor-specific negatives (invalid
design, session expiry, sanitizer rejection). Applies change-impact
revalidation to Wave 1 rather than rerunning it wholesale · deps: `W02` · test:
E2E · **gate: Wave 2 blocker.**

**`APP12-R02` — WAVE 2 RELEASE GATE** · release decision · Reconciles §U.2;
**does not deploy** · deps: `W03` ·

```text
CUSTOM_EMBROIDERY_GO_LIVE_BLOCKERS = n
RELEASE_WAVE_2_RECOMMENDATION      = GO | NO_GO   (GO requires n = 0)
```

**`APP12-X01` — Phase closure and production-candidate reconciliation** ·
closure · Reconciles both wave decisions, remaining nonblocking limitations,
release manifests, production configuration, runbooks, rollback and go-live
evidence · deps: `R01`, `R02` · impact: docs only · **gate: phase verdict, which
remains separate from any deployment action.**

### T.1 Sequence

```text
G01 → C01 → { H01, H02 } → H03 → H04 → H05 → H06 → H07
                                 ↘ V01 → V02 → A01 → U01 → E01
                                                            ↘ R01  ← WAVE 1 GO/NO-GO
R01(GO) → W01 → W02 → W03 → R02  ← WAVE 2 GO/NO-GO
                              ↘ X01
```

---

## U. Proposed release-gate matrices

### U.1 Wave 1

| Evidence set | Owner | Blocking |
|---|---|---|
| `COMMERCE_CORE_BUSINESS_UAT` | `U01`, `E01` | yes |
| `CUSTOMER_UI_UX` | `V01`, `V02` | yes |
| `OPERATOR_UI_UX` | `V01`, `V02` | yes |
| `CONTENT_QUALITY` | `V01`, `V02`, `PO-APP12-002`/`-003` | yes |
| `SECURITY` | `H01` | yes |
| `ACCESSIBILITY` | `A01` | yes |
| `PERFORMANCE` | `H05` | yes, against `PO-APP12-005` |
| `PRODUCTION_CONFIG` | `H02` | yes |
| `OBSERVABILITY` | `H03` | yes |
| `RECOVERY` | `H04` | yes |
| `RUNBOOKS` | `H07` | yes |
| `SEO_PUBLIC_READINESS` | `H06` | yes |
| `WAVE_2_ISOLATION_ENFORCED` | `G01`, verified at `R01` | yes |

Wave 1 GO **does not** require Wave-2 Editor UAT to pass. It requires proof that
Wave 2 is not exposed.

### U.2 Wave 2

| Evidence set | Owner |
|---|---|
| `CUSTOM_EMBROIDERY_BUSINESS_UAT` | `W01` |
| `EDITOR_DEEP_UAT` | `W01` |
| `EDITOR_RUNTIME_UI_UX` | `W02` |
| `EDITOR_ACCESSIBILITY` | `W02` |
| `EDITOR_RESILIENCE` | `W02` |
| `SECURE_DESIGN_FLOW` | `W01` |
| `UPLOAD / PREVIEW / REVISION / APPROVAL` | `W01` |
| `CUSTOM_PAYMENT / PRODUCTION / FULFILMENT` | `W03` |
| `WAVE_1_CHANGE_IMPACT_REVALIDATION` | `W03` |

---

## V. Product Owner decisions

**`PO-APP12-001` — What is Wave 1?** *(required before roadmap lock)*
Ambiguity: the strategy defines Wave 1 as normal-product commerce; no such path
exists (§A.1, §E). Evidence: `orders.custom_request_id NOT NULL UNIQUE`,
`accepted_quotation_version_id NOT NULL`, `current_approval_snapshot_id NOT
NULL`; PRD §2.2 "giá sản phẩm nền"; charter §2; live Product Detail has no
purchase control.
Options — **(A) Wave 1 = customer-owned-product custom embroidery, Editor-free**
· (B) Wave 1 = public presentation only, no transactions · (C) build ready-made
product commerce as a new capability.
Impact: A ships revenue and defers the single largest subsystem (APP3) exactly as
intended; B ships no revenue; C is a new business feature outside APP12's locked
scope and needs PRD plus database change.
**Recommended: A.** Latest point required: **before roadmap lock.**

**`PO-APP12-002` — Canonical store facts.** Address, phone, e-mail required for
Wave 1 GO; opening hours optional (§P). No value will be invented. Required by
`APP12-V02`; hard-required before `R01`.

**`PO-APP12-003` — Customer-facing content decisions.** Canonical brand name
(`Xưởng Thêu` vs `Nét Thêu`, both live on `/`); UI05's three unbuilt editorial
bands; `content_pages` with no consumer; the `07-ADMIN-OPERATIONS` §4 alt-text
divergence; gallery grouping. Required by `APP12-V02`.

**`PO-APP12-004` — Design-token contrast authority.** Three locked tokens
(`#e8475f`, `#9ca3af`, `#6b7280`) cause every measured contrast failure in both
apps (§G.2). The file declares them locked against Figma node `101-13`, so
changing them is a design-authority change, not hardening. Options: grant bounded
authority to darken the three values and update `DESIGN_SYSTEM_FOUNDATION.md` and
Figma · restrict the repair to per-component pairings, leaving tokens untouched ·
accept the failures and record them as a known limitation.
**Recommended: grant bounded token authority** — it is the smallest change that
repairs both applications, and it is the Product Owner's own reported complaint.
Required before `APP12-V02`.

**`PO-APP12-005` — Performance release thresholds.** No authoritative thresholds
exist. Recommended defaults to approve or amend: LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤
200 ms, TTFB ≤ 800 ms on the Wave-1 public surfaces at p75. Required before
`APP12-H05` can produce a pass/fail.

**`PO-APP12-006` — Figma tooling restoration.** `figma-desktop` MCP is
`ConnectionRefused` and the hosted server needs an interactive OAuth grant
(`FU-APP11-S03-01`, reconfirmed this session). Operator action. It does **not**
block runtime UI/UX work, which uses the live application; it blocks only design
spot-check closure (`A01-01`, `A02-02`, `FU-APP10-E01-01`) and any Figma-side
token update under `PO-APP12-004`.

---

## W. Validation and evidence

### `EVIDENCE_RUN`

```text
git status --short                                   → clean (start and end)
node tools/check-figma-design-index.mjs              → PASS, 532 rows
OpenAPI recount (packages/contracts/openapi)         → 116 / 128 / 252  (matches baseline)
migration count                                      → 37               (matches)
storefront page.tsx count                            → 18               (matches)
admin page.tsx count                                 → 25               (matches)
docker ps                                            → 7 containers healthy
curl -I http://embroidery.local/                     → security headers captured
curl http://embroidery.local/robots.txt              → captured
curl not-found / favicon / studio status codes       → 200 / 200 / 404 / 404 / 200
read-only psql: categories, products, product_media  → §Q.1, §G.4
Playwright live capture (1440 + 390):
  /  ·  /kham-pha  ·  /san-pham/ao-thun-cotton  ·  /yeu-cau/moi  ·  admin /login
  contrast measurement, density measurement, touch-target audit, overflow check
static inspection: orders schema, submission payload, subject chooser,
  catalog entry context, storefront navigation, colour tokens, stale specs
```

### `EVIDENCE_NOT_RUN` / `WHY_NOT_RUN`

```text
Jest / E2E suites            — the three inherited red tests were classified by
                               static inspection (an APP2-era "19 paths / 23
                               operations" assertion at
                               zod-dto-publication.contract.spec.ts:387 against a
                               116-path artifact is decisive without execution);
                               a full run is APP12-G01's work, not the audit's.
Authenticated Admin journeys — require a live staff session and fixtures; §40
                               forbids performing UAT. Admin sampling was limited
                               to the unauthenticated login screen, which was
                               sufficient to prove the token failures are
                               cross-app.
Load / performance testing   — forbidden at destructive scale, and meaningless on
                               a one-product, image-free dataset (§G.4).
Figma live inspection        — MCP ConnectionRefused (PO-APP12-006).
Production build / deploy    — no deployment configuration exists (§N).
```

---

## X. Files changed

```text
docs/implementation/reports/APP12-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md   (new)
docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md            (roadmap marked PROPOSED_FOR_PO_LOCK)
```

Documentation only. Runtime code, OpenAPI, migrations, the generated client,
Figma, SCSS, tokens, dependencies and infrastructure are **unchanged**. Live
screenshots were written to the session scratchpad, not to the repository. No
`.env` was read for a secret and none was written. Nothing pushed.

---

## Y. Stop confirmation

```text
IMPLEMENTATION_STARTED    = false
ROADMAP_LOCK              = PENDING_PO_REVIEW
NO APP12 CHECKPOINT EXECUTED
NO PRODUCTION DEPLOYMENT
NO PUSH
PROPOSED_NEXT             = APP12-G01   (not started; not executable before PO lock)
```
