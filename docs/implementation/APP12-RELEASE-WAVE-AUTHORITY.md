# APP12 Release-Wave Authority

Canonical wave ownership and release-exposure authority for APP12. Locked by
`APP12-G01` (2026-09-01) on the product authority of `APP12-P01`.

```text
WAVE 1 = READY_MADE / BASE_PRODUCT DIRECT COMMERCE      gate APP12-R01
WAVE 2 = ALL CUSTOM EMBROIDERY                          gate APP12-R02

WAVE_1_GO = NOT_DECLARED
WAVE_2_GO = NOT_DECLARED
```

This document is **documentation authority only**. It implements nothing. The
runtime release gate is `APP12-G02`, which consumes §2, §3, §4 and §5 verbatim.

## 0. What this document is for

`APP12-G02` has to answer one question for every customer-reachable surface:
*may it work in Wave 1?* That question cannot be answered from a route list,
because three different things look identical from the outside — a Wave-1
capability, a shared primitive Wave 1 depends on, and a Wave-2 capability that
merely happens to be built. §6 is the whole point: getting that distinction
wrong in either direction breaks a release.

## 1. Classification vocabulary

Routes:

| Class | Meaning |
|---|---|
| `WAVE1_PUBLIC` | Public discovery/content/SEO. Released, indexable. |
| `WAVE1_READY_MADE` | Ready-Made commerce. Released, not indexable. |
| `WAVE1_SHARED_PRIMITIVE` | Not custom-specific; Wave 1 depends on it. Released. |
| `WAVE2_CUSTOM` | Custom embroidery. Built, **withheld** in Wave 1. |
| `PRIVATE_SHARED` | Token/secure-access surface serving both waves by scope. |
| `ADMIN_ONLY` | Behind staff authentication; §5 governs it. |
| `NOT_RELEASED_YET` | Authorized by the locked roadmap, not yet built. |

Operations add `WAVE1_PUBLIC_READ`, `WAVE1_READY_MADE_EXISTING_REUSE`,
`ADMIN_SHARED`, `ADMIN_WAVE2_ONLY` and `INTERNAL_WORKER`.

## 2. Wave route ownership matrix — Storefront

Evidence: `apps/storefront/src/app/**` at `feat/app11-s04-seo-infrastructure`
`b695cf9d`. "Exists" is a `page.tsx` on disk; "reachable" means the segment
renders for an anonymous visitor today, with no release gate anywhere in the
tree. **Every existing route below is reachable today** — nothing in the
repository withholds anything, which is precisely why `G02` exists.

| Route | Exists | Reachable now | Wave | Audience | Indexable | Block in Wave 1 | Shared infra | Owner |
|---|---|---|---|---|---|---|---|---|
| `/` | yes | yes | `WAVE1_PUBLIC` | customer | yes | no | no | APP11-S01 |
| `/kham-pha` | yes | yes | `WAVE1_PUBLIC` | customer | yes | no | no | APP2-S01 · APP12-C03 |
| `/san-pham/[slug]` | yes | yes | `WAVE1_PUBLIC` | customer | yes | **no — but see §2.1** | no | APP2-S02 · APP12-S01 |
| `/bo-suu-tap` | yes | yes | `WAVE1_PUBLIC` | customer | yes | no | no | APP11-S02 |
| `/bo-suu-tap/[slug]` | yes | yes | `WAVE1_PUBLIC` | customer | yes | no | no | APP11-S03 |
| `/dich-vu` | yes | yes | `WAVE1_PUBLIC` | customer | yes | **content review** | no | APP11-S05 |
| `/cau-hoi-thuong-gap` | yes | yes | `WAVE1_PUBLIC` | customer | yes | **content review** | no | APP11-S05 |
| `/cua-hang` | yes | yes | `WAVE1_PUBLIC` | customer | yes | no | no | APP11-S05 |
| `/chinh-sach/[slug]` | yes | yes | `WAVE1_PUBLIC` | customer | yes | no | no | APP11-S05 |
| `/xac-minh-lien-he` | yes | yes | `WAVE1_SHARED_PRIMITIVE` | customer | no | **no** | **yes** | APP4-S01 |
| `/yeu-cau/moi` | yes | yes | `WAVE2_CUSTOM` | customer | no | **YES** | no | APP5-S01 |
| `/yeu-cau/da-gui` | yes | yes | `WAVE2_CUSTOM` | customer | no | **YES** | no | APP5-S02 |
| `/san-pham/[slug]/thiet-ke` | yes | yes | `WAVE2_CUSTOM` | customer | no | **YES** | no | APP3-S01 |
| `/truy-cap` | yes | yes | `PRIVATE_SHARED` | customer | no | see §2.2 | **yes** | APP4-S02 |
| `/truy-cap/bao-gia` | yes | yes | `WAVE2_CUSTOM` | customer | no | **YES** | no | APP6-S01 |
| `/truy-cap/duyet-thiet-ke` | yes | yes | `WAVE2_CUSTOM` | customer | no | **YES** | no | APP6-S01 |
| `/truy-cap/thanh-toan` | yes | yes | `WAVE2_CUSTOM` | customer | no | **YES** | no | APP7-S01 |
| `/truy-cap/thanh-toan-con-lai` | yes | yes | `WAVE2_CUSTOM` | customer | no | **YES** | no | APP9-S01 |
| `/mua-hang/[slug]` | **no** | no | `WAVE1_READY_MADE` | customer | **no** | n/a | no | APP12-S02 |
| `/truy-cap/don-hang` | **no** | no | `WAVE1_READY_MADE` | customer | **no** | n/a | no | APP12-S03 |
| `/healthz` | yes | yes | `WAVE1_SHARED_PRIMITIVE` | infra | no | no | **yes** | APP0 |
| `/robots.txt`, `/sitemap.xml` | yes | yes | `WAVE1_PUBLIC` | crawler | n/a | no | no | APP11-S04 |

### 2.1 `/san-pham/[slug]` is one route serving both waves

The Product Detail page stays released — it is the Wave-1 Ready-Made entry
point (`APP12-S01` adds purchase state to it). What must be withheld is the
**custom personalisation call to action within it**: the link into
`/san-pham/[slug]/thiet-ke`. `G02` blocks the Studio route itself; suppressing
the CTA is presentation and belongs to `APP12-S01`, which owns that page's
purchase state. Suppressing the CTA is *not* a substitute for blocking the
route (§4).

### 2.2 `/truy-cap` is gated by grant scope, not by path

`/truy-cap` is the secure-access landing that resolves a link and forwards to
the surface its grant names. In Wave 1 it must keep working for `ORDER_ACCESS`
and refuse every custom purpose. Blocking the `/truy-cap` prefix wholesale
would take `/truy-cap/don-hang` with it. See §3.2 — this is the single most
error-prone line in the whole gate.

## 3. Wave API ownership inventory

Mechanically inventoried from `packages/contracts/openapi/openapi.generated.json`
at `b695cf9d`: **116 paths, 128 operations** — 80 `admin*`, 43 `public*`,
3 `staff*`, 2 `health*`. Counted, not estimated.

**Amended by `APP12-C01`.** That checkpoint published one new public operation,
`publicCategory_list` (`GET /api/public/categories`, the dynamic category
inventory), taking the artifact to **117 paths, 129 operations** — 80 `admin*`,
**44** `public*`, 3 `staff*`, 2 `health*`. It is a Wave-1 public read: it
publishes published, non-archived category names and slugs, which is browsing
metadata the Ready-Made catalogue needs, and it names no custom capability. The
`DENY` set is **unchanged at 31**; the `ALLOW` set becomes **13**. No other
classification in this section moved.

**Amended by `APP12-C02`.** That checkpoint published **four** new operations —
`adminCategory_list`, `adminCategory_create`, `adminCategory_update` and
`adminCategory_transition` — taking the artifact to **120 paths, 133
operations**: **84** `admin*`, 44 `public*`, 3 `staff*`, 2 `health*`. All four
are Admin-authenticated, so **this section’s public matrix does not move at
all**: `public*` stays 44, `DENY` stays **31** and `ALLOW` stays **13**.

**Amended by `APP12-B04`.** That checkpoint published **four** new public
operations — `publicReadyMadeOrder_current` (the secure Ready-Made order read)
and `publicOrderFullPayment_current` / `_qr` / `_initiate` (the `FULL` payment
family) — taking the artifact to **125 paths, 138 operations**: 84 `admin*`,
**49** `public*`, 3 `staff*`, 2 `health*`. All four are `WAVE1_READY_MADE` and
therefore `ALLOW`.

It also introduced a **third exposure class**. Three public operations take a
secure-link token and serve both waves through one operation, so their release
decision cannot be taken from an operation id at all:

```text
before B04    45 public   31 DENY   14 ALLOW    0 SCOPE_GATED
after  B04    49 public   28 DENY   18 ALLOW    3 SCOPE_GATED
```

`SCOPE_GATED` = `publicSecureLink_resolve` (§3.2) plus
`publicOrderDepositEvidence_upload` and `_status` (§3.4). Nothing withheld
before B04 became reachable after it: a scope-gated operation still refuses
every `REQUEST_ACCESS` grant while Wave 2 is unreleased — one layer in, where
the resolved grant row can be read, and with the indistinguishable
`SECURE_LINK_UNAVAILABLE` rather than the guard's generic 404.

They are recorded here rather than left out because the inventory’s value is
that it is complete: an operation missing from it is an operation nobody
classified. Admin operations are outside the Wave-2 public gate by construction
— the gate withholds *customer-reachable* custom capability, and an operator
managing the store’s own taxonomy is neither customer-reachable nor
wave-specific. `WAVE2_WITHHELD_PUBLIC_OPERATIONS` and
`WAVE1_RELEASED_PUBLIC_OPERATIONS` therefore contain no `admin*` id, which the
C02 contract suite asserts directly.

| Family | Ops | Class | Wave-1 public exposure |
|---|---|---|---|
| `publicProduct_*`, `publicProductMedia_*`, `publicProductVariant_*` | 4 | `WAVE1_PUBLIC_READ` | `ALLOW` |
| `publicCategory_list` (`APP12-C01`) | 1 | `WAVE1_PUBLIC_READ` | `ALLOW` |
| `publicGalleryEntry_*` | 3 | `WAVE1_PUBLIC_READ` | `ALLOW` |
| `publicSitemapEntry_list` | 1 | `WAVE1_PUBLIC_READ` | `ALLOW` |
| `publicVerification_*` | 4 | `WAVE1_SHARED_PRIMITIVE` | `ALLOW` — §3.1 |
| `publicSecureLink_resolve` | 1 | `PRIVATE_SHARED` | `SCOPE_GATED` — §3.2 |
| `publicReadyMadeOrder_current`, `publicOrderFullPayment_*` (`APP12-B04`) | 4 | `WAVE1_READY_MADE` | `ALLOW` |
| `publicProductPlacement_get`, `publicProductSideBackground_get` | 2 | `WAVE2_CUSTOM` | `DENY` — §3.3 |
| `publicDesignTemplate_*`, `publicDesignTemplateAsset_get` | 3 | `WAVE2_CUSTOM` | `DENY` |
| `publicDesignSession_*`, `publicDesignSessionAsset_*` | 6 | `WAVE2_CUSTOM` | `DENY` |
| `publicCustomRequest_*`, `publicCustomRequestAsset_*` | 4 | `WAVE2_CUSTOM` | `DENY` |
| `publicQuotation_*` | 3 | `WAVE2_CUSTOM` | `DENY` |
| `publicDesignReview_*` | 3 | `WAVE2_CUSTOM` | `DENY` |
| `publicOrderDeposit_*` | 3 | `WAVE2_CUSTOM` | `DENY` — §3.4 |
| `publicOrderDepositEvidence_*` | 2 | `PRIVATE_SHARED` | `SCOPE_GATED` — §3.4 |
| `publicOrderFinalPayment_*` | 3 | `WAVE2_CUSTOM` | `DENY` — §3.4 |
| `publicOrderShippingFee_acknowledge` | 1 | `WAVE2_CUSTOM` | `DENY` — §3.4 |
| `health_*` | 2 | `INTERNAL_WORKER` / infra | `NOT_APPLICABLE` |
| `staffSession_*`, `staffSelf_get` | 3 | `ADMIN_SHARED` | `NOT_APPLICABLE` |
| `admin*` (all) | 80 | §5 | `NOT_APPLICABLE` |

Reserved, not yet existing, and **not** to be invented before their checkpoint:
Admin verification and origin-aware fulfilment (`B05`). It is
`WAVE1_READY_MADE` on arrival. Every other reservation in this paragraph —
`B01`, `B02`, `B03`, `B04`, `C01`, `C02` — has since been delivered and is
classified above.

### 3.1 Contact verification is genuinely shared — do not deny it

`IssueVerificationChallengeBody` carries `contactKind ∈ {EMAIL, PHONE}` and
`purpose ∈ {SUBMISSION, STEP_UP}`. There is no custom-request coupling in the
contract. `APP12-P01` locks `IDENTITY = APP4 contact verification reused as a
shared primitive`, so Ready-Made checkout depends on exactly these four
operations. **Denying them denies Wave 1.**

### 3.2 `publicSecureLink_resolve` is a sequencing hazard, and G02 owns it

The *mechanism* (grants, tokens, absolute expiry) is shared. The *published
operation* is not: `SecureLinkResolutionResponse` today returns
`customRequestId` and a `scopeKind` enum whose only member is `REQUEST_ACCESS`.
It has no Wave-1 caller and no Ready-Made scope.

```text
at G02 time (before DB01/B04):  publicSecureLink_resolve = DENY, whole operation
since B04 shipped ORDER_ACCESS: gated by scopeKind, not by operation
                                ORDER_ACCESS   = ALLOW in both waves
                                REQUEST_ACCESS = ALLOW only in Wave 2
```

**Delivered by `APP12-B04`.** The obligation is discharged. The decision is
taken by `GrantScopeReleaseGate`, applied inside `ResolveSecureLink` and
`ReauthorizeSecureGrant` — **after** the token is digested and the grant row is
read, because that is the first moment the wave is knowable, and before the
success audit row, so a withheld scope leaves the same trail an unknown token
does. `CustomCapabilityReleaseGuard` runs before the pipes and therefore
**admits** this operation; the class name for that is `SCOPE_GATED`, and it is
not an exemption.

The scope is never caller-supplied: no public body carries a `scopeKind` field
and the resolver reads it from the persisted row. The refusal is the delivered
`404 / SECURE_LINK_UNAVAILABLE`, identical to an unknown token, so a Wave-1
deployment does not confirm that a custom customer's link is real.

### 3.3 Placement geometry is a Studio input, not catalog data

`publicProductPlacement_get` and `publicProductSideBackground_get` publish the
embroidery placement manifest — the coordinate system the editor draws on.
Ready-Made sells a SKU and needs none of it. They are custom.

### 3.4 The existing payment operations are custom-shaped

Ready-Made is `PAYMENT_KIND = FULL` — one obligation, no deposit, no remaining
payment, and an Admin-set shipping fee that is frozen *before* payment rather
than acknowledged by the customer afterwards. The deposit, final-payment and
shipping-fee-acknowledgement operations all resolve through the custom order
context and have no Ready-Made caller. `APP12-B04` composed the `FULL` payment
surface as three new operations rather than reusing any of them.

**One exception, delivered by `APP12-B04`: the transfer-evidence lane.**
`payment_transfer_evidence` is attempt-scoped (`IMP-D055`), not kind-scoped: a
customer attaches a screenshot to an attempt they opened, and which obligation
kind that attempt belongs to is not what the association is about. So
`publicOrderDepositEvidence_upload` and `_status` now serve all three kinds and
are `SCOPE_GATED` rather than `DENY` — a Ready-Made customer holding an
`ORDER_ACCESS` grant is admitted, a custom customer holding a `REQUEST_ACCESS`
one is refused while Wave 2 is unreleased. `APP12-B04` §22 required that reuse
(`NEW_EVIDENCE_OPERATION = 0`); publishing a fourth evidence route would have
duplicated a lane that was already kind-agnostic below its first hop.

Their route prefix still reads `deposit` because renaming it would reissue two
accepted operation ids for a naming decision. The payment *domain* underneath
is shared internal code.

## 4. Release-exposure policy

```text
RELEASE_MODEL   = fail closed
ENFORCEMENT     = route level AND API level
CONFIGURATION   = configuration driven, not build-time dead code
TESTABILITY     = every withheld capability has a negative test
NAVIGATION_ONLY = FORBIDDEN
```

Wave 1 releases: Ready-Made commerce; the shared primitives it requires
(contact verification, the secure-access mechanism scoped to `ORDER_ACCESS`,
health); public discovery, content and SEO; and the Admin operations needed to
run the shop (§5).

Wave 2 withholds every customer-facing custom embroidery entry point: the
Design Studio, custom request creation, catalog personalisation, COP request
creation, and the custom quotation, design-review, payment and production
customer surfaces.

Binding rules:

1. **Fail closed.** An unrecognized or unset release configuration withholds
   Wave 2. Never the reverse.
2. **Both layers.** A blocked route with a live API is not blocked. Every
   `DENY` in §3 is enforced server-side, independently of the route.
3. **Refuse, do not pretend.** A withheld capability returns a definite refusal
   the customer can understand. It does not 500, hang, or silently no-op.
4. **Deny the capability, not the primitive.** §3.1 and §3.2 are the two places
   where the obvious gate is the wrong gate.
5. **Hiding is not withholding.** §6.
6. **One authority.** The wave classification of a surface lives here. A
   checkpoint that adds a surface adds a row; it does not invent a local rule.

`APP12-G01` deliberately names **no** configuration key. Repository convention
does not make one canonical, and `IMP-D050` shows what happens when four
lookalike variables coexist. `G02` selects and records the key, its default
(withheld), and its validation, under `docs/09-SECURITY-AND-ABUSE-PREVENTION.md`
§9a discipline.

## 5. Staff / Admin exposure policy

Wave-1 release isolation is customer-facing. Admin is behind staff
authentication and is **not** blanket-blocked, but the posture is explicit
because an operator action can create customer-visible Wave-2 business
activity.

| Admin surface | Class | Wave-1 posture |
|---|---|---|
| `/login`, shell, `staff*` operations | `WAVE1_OPERATOR_REQUIRED` | released |
| Products, SKUs, publication, `/kho/skus/[skuId]` | `WAVE1_OPERATOR_REQUIRED` | released |
| Assets | `WAVE1_SHARED` | released |
| Gallery | `WAVE1_OPERATOR_REQUIRED` | released |
| Orders list/detail, dispatch, completion, transitions | `WAVE1_SHARED` | released — origin-aware at `B05` |
| Payment verification / evidence | `WAVE1_SHARED` | released |
| Customer support, merges, notification intents | `WAVE1_SHARED` | released |
| Categories (`C02`/`A01`) | `WAVE1_OPERATOR_REQUIRED` | `NOT_RELEASED_YET` |
| Design templates, placement, side background | `WAVE2_OPERATOR_ONLY` | `STAFF_ONLY_PRE_RELEASE` |
| Custom requests, design versions, moderation | `WAVE2_OPERATOR_ONLY` | `STAFF_ONLY_PRE_RELEASE` |
| Quotations | `WAVE2_OPERATOR_ONLY` | `STAFF_ONLY_PRE_RELEASE` |
| Production jobs | `WAVE2_OPERATOR_ONLY` | `STAFF_ONLY_PRE_RELEASE` |

`STAFF_ONLY_PRE_RELEASE` means: technically present, reachable only by an
authenticated staff member, and **not** release-guarded. This is acceptable
because each of these surfaces acts on a custom request or a custom order, and
no custom request or custom order can be created while §3 denies every custom
customer entry point. The Wave-2 Admin surfaces therefore have no reachable
subject in Wave 1 — the customer-side gate is what makes the staff side safe.

One consequence `G02` must verify rather than assume: if any Wave-2 Admin
operation can create its own subject without a customer, that reasoning fails
for it and it needs a guard. `APP12-H01` re-audits this under authorization.

## 6. Release isolation is not SEO isolation

```text
RELEASE_ISOLATION != SEO_ISOLATION
```

The repository already demonstrates the gap. `ROBOTS_DISALLOW` in
`apps/storefront/src/features/storefront-seo/model/robots-policy.ts` fences off
`/truy-cap`, `/xac-minh-lien-he`, `/yeu-cau` and `/san-pham/*/thiet-ke`, and
every one of those pages also sets `robots: { index: false, follow: false }`.

All of them work right now. Any visitor with the URL reaches the Design Studio
and opens a session; any visitor reaches `/yeu-cau/moi` and submits a custom
request. Crawler exclusion is advisory metadata addressed to search engines. It
is not access control and has never withheld anything.

Therefore:

- `noindex`, a `Disallow` rule, absence from `sitemap.xml`, and absence from
  navigation are **SEO and information-architecture facts**. None is evidence
  that a capability is unreleased.
- `G02` must deny every §3 `DENY` capability **on the server**, whether or not
  robots already excludes it.
- Conversely, a released Wave-1 surface may still be `noindex` — `/mua-hang`
  and `/truy-cap/don-hang` are released and deliberately non-indexable
  (`APP12-H06` owns that metadata).

## 7. G02 implementation authority

`APP12-G02` must, and must only:

**Block** — route level: `/yeu-cau/moi`, `/yeu-cau/da-gui`,
`/san-pham/[slug]/thiet-ke`, `/truy-cap/bao-gia`, `/truy-cap/duyet-thiet-ke`,
`/truy-cap/thanh-toan`, `/truy-cap/thanh-toan-con-lai`.

**Block** — API level: every operation marked `DENY` in §3. At `G02` that was
**31 of the 44 public operations**: placement 1, side background 1, templates 3,
sessions 6, custom requests 4, quotations 3, design reviews 3, deposit 5, final
payment 3, shipping-fee acknowledgement 1, and `publicSecureLink_resolve` 1 per
§3.2, with the remaining **13** `ALLOW` — 12 at `G02` plus `publicCategory_list`
from `APP12-C01`.

**Since `APP12-B04` the static block is 28 of 49**, with **18** `ALLOW` and
**3** `SCOPE_GATED`. `publicSecureLink_resolve` and the two
`publicOrderDepositEvidence_*` operations left the static set because each
serves both waves through one operation and their wave is a property of the
grant row, which the guard cannot see. They are **not** released: the scope
gate refuses every `REQUEST_ACCESS` grant while Wave 2 is unreleased, and does
so indistinguishably from an unknown token (§3, §3.2, §3.4).

**Allow** — `/`, `/kham-pha`, `/san-pham/[slug]`, `/bo-suu-tap*`, `/dich-vu`,
`/cau-hoi-thuong-gap`, `/cua-hang`, `/chinh-sach/[slug]`, `/xac-minh-lien-he`,
`/truy-cap` (landing, per §2.2), `/healthz`, `robots.txt`, `sitemap.xml`; and
the `ALLOW` operations of §3, `publicVerification_*` explicitly included.

**Must not** — block `/truy-cap` wholesale (§2.2); deny
`publicVerification_*` (§3.1); rely on navigation suppression or robots (§6);
guard Admin (§5); change any business rule; or leave the default open (§4).

**Must record** — the configuration key, its withheld default, and one negative
test per blocked route and per blocked operation family.

## 8. Consuming checkpoints

| Checkpoint | Consumes |
|---|---|
| `APP12-G02` | §2, §3, §4, §5, §7 |
| `APP12-B04` | §3.2 — **DELIVERED**: reopened `publicSecureLink_resolve` by scope, added the `SCOPE_GATED` class and the four Wave-1 Ready-Made operations |
| `APP12-S01` | §2.1 — suppress the personalisation CTA |
| `APP12-H01` | §5 — re-audit `STAFF_ONLY_PRE_RELEASE` |
| `APP12-H06` | §6 — `noindex` on `/mua-hang` and the order surface |
| `APP12-R01` | §2, §3 — Wave-1 GO evidence |
| `APP12-W01`…`W04`, `R02` | §2, §3 — the withheld set, re-enabled for Wave 2 |
