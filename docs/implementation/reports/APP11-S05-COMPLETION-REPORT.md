# APP11-S05 — Static Content Pages + Footer Store Presentation

## A. Verdict

```text
APP11-S05 = COMPLETE
PO_DECISION_REQUIRED = NONE
NEXT_CHECKPOINT = APP11-E01
```

Four Storefront routes delivered on one shared template, the APP11-owned footer
store-presentation block composed above the existing shell Footer at all three
widths, seven new URLs appended to the S04 static sitemap inventory, and the
Product Detail continuation defect repaired. No backend, database, OpenAPI,
generated-client, worker, Admin or Figma artifact was touched.

One decision the Product Owner should know about but does not have to make now:
**no canonical store address, opening hours, phone number or e-mail exists**, so
none is published (§H). The Local page and the footer degrade truthfully by
omission rather than shipping invented business data.

---

## B. Entry baseline & design authority

Entry HEAD `d452dccd`. Accepted S04-C1 baseline confirmed unchanged at exit
except the Storefront route count, which this checkpoint owns.

**Live Figma was unavailable.** The `figma-desktop` MCP server failed to connect
(`ConnectionRefused`) for the whole checkpoint, so implementation used the
prompt's §5.3 fallback: the registry plus the accepted `APP11-D01` and
`APP11-D01-C1` evidence. **No Figma node was read live and none was modified.**
The registry gate passes at 532 rows, unchanged.

All eleven authority rows verified `APPROVED_FOR_IMPLEMENTATION` under
`FIG-APPROVAL-APP11-D01-PO-001`, file `BQwqV8GdfUIELvsQDB1UQE`:

| Registry ID | Node | Role |
|---|---|---|
| `FIG-APP11-CONTENT-TEMPLATE-DESKTOP` | `863:677` | Template, Desktop 1440 — reading width 736, padding 80 |
| `FIG-APP11-CONTENT-TEMPLATE-TABLET` | `864:1085` | Template, Tablet 1024 — 640 / 48 |
| `FIG-APP11-CONTENT-TEMPLATE-MOBILE` | `864:1253` | Template, Mobile 390 — 342 / 24 |
| `FIG-APP11-CONTENT-SERVICE-DESKTOP` | `864:677` | Service instance |
| `FIG-APP11-CONTENT-FAQ-DESKTOP` | `864:779` | FAQ instance |
| `FIG-APP11-CONTENT-LOCAL-DESKTOP` | `864:881` | Local instance |
| `FIG-APP11-CONTENT-POLICY-DESKTOP` | `864:983` | Policy instance |
| `FIG-APP11-FOOTER-STORE-SUPPLEMENT` | `872:1029` | Footer supplement, Desktop 1440 |
| `FIG-APP11-FOOTER-STORE-SUPPLEMENT-TABLET` | `888:1006` | Footer supplement, Tablet 1024 |
| `FIG-APP11-FOOTER-STORE-SUPPLEMENT-MOBILE` | `888:1058` | Footer supplement, Mobile 390 |
| `FIG-APP11-FOOTER-SUPPLEMENT-RESPONSIVE-AUTHORITY` | `889:1030` | Responsive specification |

Content section `857:6`; footer section `857:9`.

---

## C. Route delivery

```text
Storefront page routes  14 -> 18
```

New:

```text
/dich-vu                    apps/storefront/src/app/dich-vu/page.tsx
/cau-hoi-thuong-gap         apps/storefront/src/app/cau-hoi-thuong-gap/page.tsx
/cua-hang                   apps/storefront/src/app/cua-hang/page.tsx
/chinh-sach/[slug]          apps/storefront/src/app/chinh-sach/[slug]/page.tsx
```

`/chinh-sach` is a framework parent directory with **no `page.tsx`**, verified in
the boundary suite and live (`404`). No alias was created: `/faq`, `/lien-he`,
`/store`, `/policy`, `/dich-vu/[slug]`, `/cua-hang/[slug]` and `/chinh-sach` are
all absent, and no redirect exists. No catch-all `/[slug]` was added.

The two S04 metadata routes (`/robots.txt`, `/sitemap.xml`) are unchanged and are
not counted as page routes. Build output confirms the four policies pre-render as
SSG and the three singular routes as static.

---

## D. Shared content-page system

One system, not four bespoke architectures.

```text
features/content-pages/
  model/content-page.ts            the closed contract (141 lines)
  model/content-page-metadata.ts   S04 metadata adapter
  model/store-facts.ts             canonical store-fact boundary
  model/service-page.ts            /dich-vu definition
  model/faq-page.ts                /cau-hoi-thuong-gap definition
  model/local-page.ts              /cua-hang definition
  model/policies/policy-slugs.ts   the four-slug lock
  model/policies/{shipping,payment,returns,privacy}-policy.ts
  model/policies/policy-resolver.ts
  components/content-page-screen.tsx   the shared template
  components/content-page-hero.tsx
  components/content-prose-block.tsx
  components/content-faq-disclosure.tsx
  components/content-store-info.tsx
  components/content-links-block.tsx
  styles/…
```

All seven pages render through `ContentPageScreen`. Each of the four route
segments is ~25 lines and binds one named definition; none composes its own
layout. Proven by test: every page renders exactly one `<h1>`, closes with an
internal-links block, and instantiates each optional block only where D01
approved it (FAQ accordion on FAQ alone, store information on Local alone).

**A section may be one of exactly four kinds** — prose, faq, store-info, links.
That is deliberately a closed union rather than a `{ type: string; props: unknown }`
block registry: a generic renderer with no authoring half is the read side of a
CMS built speculatively, and APP11 has no content backend to feed one.

**The media block was not instantiated.** D01 marks it `[OPTIONAL]` on Service
and Local and requires real alt text on it. No canonical content-page imagery
exists in the repository, and using a Product or gallery photograph would
silently make that image the store's Service illustration — the same fabrication
`publicPageMetadata` declines for `og:image`. An optional block nothing may
legitimately fill was left uninstantiated rather than shipped empty or filled
with a stand-in.

**No CMS was created and no content API is consumed.** The boundary suite proves
the S05 source touches no `content_pages`, `ContentPageRepository`,
`contentPage_*` operation, `redirect_rules`, `@embroidery/api-client`, query
hook, HTTP call or `process.env`.

---

## E. Static content authority

Copy was written against these documents, and the audit result — including what
they do **not** say — governed what could be published.

| Subject | Authority | Used for |
|---|---|---|
| Custom-request intake | `docs/01` §5 | Service journey, FAQ |
| Manual quotation | `docs/01` §6 | Quotation wording, price-freeze claim |
| Design review & approval | `docs/01` §7 | Review step, unlimited revisions |
| Payment | `docs/01` §8, `docs/04` BR-005 | 40% / 60%, manual reconciliation |
| Shipping | `docs/01` §10, `docs/02` §2 | Shipping policy, and its limits |
| Secure flow | `docs/01` §4 | Privacy, secure-link wording |
| Content model | `docs/08` §2, §4, §5, §7 | Page set, on-page requirements |
| Brand | `FIGMA_DESIGN_INDEX` §4.6.1 | `Nét Thêu`, `Xưởng thêu cá nhân hóa` |

**Non-fabrication choices, each recorded next to the copy it constrains:**

- **No return window, refund deadline or restocking rule.** `docs/01`, `docs/02`,
  `docs/04` and `docs/06` say nothing about any of them. A return window is the
  single most quoted line of any returns policy and is a commercial and
  consumer-law commitment; a number chosen here would become the store's
  published position, enforceable against a Product Owner who never chose it.
  The page states a truthful process instead (§I).
- **No delivery-day guarantee, carrier, nationwide coverage, tracking page or
  free shipping.** `docs/01` §10 and `docs/02` §2 put carrier APIs, third-party
  fee calculation and customer-facing tracking explicitly out of scope, so those
  are absences of capability, not of caution.
- **Bank transfer only.** `docs/01` §8 lists MoMo and ZaloPay as *desired*;
  APP7/APP9 delivered the bank-transfer path. A policy listing two wallets the
  checkout cannot accept would be a promise the product cannot keep.
- **Payment verification described as manual.** Saying a bank or provider webhook
  confirms it would be false and would contradict the rule that a redirect alone
  never means success.
- **No retention period, residency, encryption or certification claim, and no
  cookie policy.** None is fixed by an approved document, and
  `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` is an internal control document, not
  a published commitment. No security implementation detail is described.
- **No capacity, years in business, order count, certification or minimum order.**
- **No internal lifecycle or status name** — `docs/06`'s state machine is operator
  vocabulary.

A test asserts every one of these classes against all seven pages, and asserts
that no page contains `TBD`, lorem, a bracketed design note, an example domain, a
Vietnamese phone number or an e-mail address.

**Brand.** New S05 content uses the locked `Nét Thêu`. The historical shell string
`Xưởng Thêu` was **not** touched: no repository-wide rebrand was performed, and
the copy divergence remains the existing open follow-up.

---

## F. Service page — `/dich-vu`

Hero + three prose blocks + internal links, on the shared template (`864:677`).

Sections: what the workshop does; the six-step journey (request → quotation →
design approval → 40% deposit → production → 60% and hand-over); what to prepare.
Every step is the delivered APP5–APP9 product described in the customer's words.

Outbound links are delivered public routes only — `/kham-pha`, `/bo-suu-tap`,
`/yeu-cau/moi`, `/cau-hoi-thuong-gap`, `/cua-hang` — all composed through shell
route constants. No new intake flow.

---

## G. FAQ page — `/cau-hoi-thuong-gap`

Nine questions drawn from the real customer flow: starting a request, what to
prepare, bringing your own product, design review, how quotation is calculated,
when payment happens, how hand-over works, revisions, and where to see past work.

### Accessibility — and a correction the live browser forced

The disclosure is a native `<details>`/`<summary>` with **explicit ARIA**, and the
route to that design is worth recording because two earlier attempts were wrong
in ways only the live browser showed:

1. First implementation put an `<h3>` inside `<summary>`. Chromium surfaced the
   heading and stopped exposing the summary's own control semantics — the
   accessibility tree read `heading [level=3]`.
2. With the heading replaced by a `<span>`, Chromium exposed the summary as
   `generic`. It matched no `role=button` query and carried **no expanded state**.
   Bare native `<details>` did not deliver the semantics §11 requires.

Final implementation: the trigger states `role="button"`, `aria-expanded` and
`aria-controls` (naming a stable panel id), with `aria-expanded` synced from the
element's own `open` through `onToggle` — never a hard-coded literal, which is the
failure mode that announces "collapsed" over an open answer. The element remains
a real `<details>`, so it toggles before hydration; the one honest gap is that
`aria-expanded` is briefly stale in that pre-hydration window, which is
self-correcting and strictly better than never exposing the state.

**Live proof at 1440** (Chromium, through the gateway):

```text
accessibility tree           button "Tôi bắt đầu một đơn thêu…"   PASS
role                         button                               PASS
aria-expanded closed         "false"                              PASS
click -> open                details.open = true, aria "true"     PASS
Enter -> close               details.open = false, aria "false"   PASS
Space -> toggles                                                  PASS
focus retained on trigger    true                                 PASS
aria-controls resolves       panel element found                  PASS
answer height when open      145px (readable)                     PASS
trigger height               56px (>= 44)                         PASS
nested interactive control   none                                 PASS
```

All nine answers are in the DOM while collapsed, verified live and by test — a
crawler and an un-hydrated visitor read the whole page. No library was added; no
animation gates readability.

The FAQ is the **only** client island in S05; Service, Local and the four
policies ship no client component.

---

## H. Local/store page — `/cua-hang`

Singular route: `docs/02` §2 puts multi-branch out of scope. No store id, no list,
no map provider.

### Canonical store-value availability matrix

Audited against `docs/01-PRODUCT-REQUIREMENTS.md`, `docs/02-SCOPE-AND-BOUNDARIES.md`,
`docs/08-SEO-AND-CONTENT.md`, `docs/00-PROJECT-CHARTER.md` and `.env.example`:

```text
CANONICAL_STORE_ADDRESS   = NOT_AVAILABLE
CANONICAL_OPENING_HOURS   = NOT_AVAILABLE
CANONICAL_PHONE           = NOT_AVAILABLE
CANONICAL_EMAIL           = NOT_AVAILABLE

placeholder rendered      = false
fake value rendered       = false
```

`docs/01` §2.1 requires the page and `docs/08` §2 requires the page type; neither
states a value, and no environment variable carries one. `APP11-D01-C1` §D.2
expected the Product Owner to supply them before this checkpoint; they were not
supplied, and this checkpoint did not invent them.

**Every unavailable fact is omitted entirely** — no label with an empty value, no
`TBD`, no `example.com`, no invented address, and specifically not the D01
placeholder text (`[Địa chỉ xưởng — giá trị canonical chưa có]`), which would ship
bracketed design notes to customers. Live proof at 390 and 1440: zero
`.content-page__store-fact` rows, zero `tel:` links, zero `mailto:` links, and no
phone or e-mail pattern anywhere in rendered copy on any of the seven pages.

The page ships a **truthful reduced composition** instead: one physical workshop,
store identity, visiting by arrangement, and routing to the request flow and the
messaging channels that genuinely exist. The block renders a fallback sentence
rather than an empty heading.

**The shape is real even though the values are absent.** `resolveStoreFacts()` is
the single boundary both the Local page and the footer read, so the Product Owner
supplying a value later is a one-line change in `store-facts.ts` that lights up
both surfaces at once. It reads no environment variable: a store address is public
business copy decided in a reviewable document, not deployment configuration.

---

## I. Policy family

Four slugs, locked from `docs/01-PRODUCT-REQUIREMENTS.md` §2.1:

| Slug | Id | Content ownership |
|---|---|---|
| `/chinh-sach/giao-hang` | `shipping` | `docs/01` §10 + `docs/02` §2 limits |
| `/chinh-sach/thanh-toan` | `payment` | `docs/01` §6, §8; `docs/04` BR-005 |
| `/chinh-sach/doi-tra` | `returns` | process-only; no window authority exists |
| `/chinh-sach/bao-mat` | `privacy` | `docs/01` §4, §5, §6, §8 categories |

No `terms`, `warranty`, `cookies`, `refund`, `legal` or `community` policy was
added — each is a document with legal consequences that no approved repository
document requires or specifies.

**Returns**, the hardest page, says only what is true: personalised work is made
to one specification and cannot be resold, which is the honest reason a blanket
change-of-mind return is not offered; the approved design is the reference a
complaint is judged against, which is why the approval step exists; a defect is
reviewed case by case; and the policy explicitly does not replace or limit
statutory consumer rights — a reference to those obligations rather than a claim
about what they are.

---

## J. Policy not-found

One resolver, `getStorefrontPolicy(slug)`. Four literal slugs resolve; everything
else yields `undefined` and the segment calls `notFound()`. `generateMetadata`
takes the same branch, so an unknown slug never reaches the metadata builder.

Two independent barriers: `dynamicParams = false` with `generateStaticParams`
listing exactly the four slugs makes the framework refuse an unlisted param before
the segment runs, and the resolver refuses it again.

No database query, no API call, no filesystem read, no template interpolation, no
query-string branch. The slug **selects**; it never supplies. Tested against an
unknown slug, the empty string, `[slug]`, `constructor`, `__proto__`, a traversal
attempt, percent-encoding, an appended query, wrong case, and a 2048-character
slug — all `undefined`.

Live: `/chinh-sach/khong-ton-tai` → `404`, `noindex`, and zero matches for
`rel="canonical"`, `og:title` or `og:url`. No redirect.

---

## K. Footer StorePresentationBlock

`features/store-presentation/`, composed in `StorefrontShell` directly **above**
the existing `StorefrontFooter`. The DS Footer was not replaced, edited or
conceptually recreated, and its stylesheet was not touched.

It is a named `<section>`, **not** a second `<footer>`: the document keeps exactly
one `contentinfo` landmark (verified live — `footerCount: 1` on every page).

Column order in source and on screen at every width: store identity → contact →
service & support → policies.

### Live measurements

| | 1440 | 1024 | 390 |
|---|---|---|---|
| Grid tracks | **4** | **2** (2×2) | **1** |
| Column tops | all equal | 2 rows | 4 rows |
| Side padding | **80** | **48** | **24** |
| Gap | 64 | row 32 / col 48 | **28** |
| Dock reserve | 0 | 0 | **100px** |
| CSS `order` | all `0` | all `0` | all `0` |
| Block above footer | true | true | true |
| Horizontal overflow | none | none | none |

Source order equals visual order at all three widths — every column computes
`order: 0`, and the reflow is grid track count alone. All nine footer links
measure ≥ 44px tall at 390. The policy column carries all four policies in
canonical order in one column and none leaks into the service column, asserted
both live and by test.

---

## L. Floating dock separation

The APP10 dock is untouched — no file in `storefront-contact-handoff` or
`_contact-handoff.scss` was modified.

The footer renders **no** Zalo or Messenger action at any width: the boundary test
proves the feature source contains no provider reference, and live inspection of
all seven pages found no `zalo`/`messenger` string inside `.store-presentation`.
Every footer link is internal (`href` starts with `/`) and none carries `target`.

Social contact configuration is **absent** in this environment, so the dock
correctly renders nothing (`dockRendered: false` at 390) — and the footer shows no
duplicate or disabled placeholder in its place, which is the property that
mattered. No provider URL was fabricated to test overlap. The mobile 100px
dock-safe reserve is present and measured regardless of configuration, so a
configured dock cannot cover a footer row.

One observation for the record, not changed here: the delivered dock uses a 16px
mobile inset and 24px from tablet up, while `889:1030` describes the mobile inset
as right 16 / bottom 100. The footer reserves the full approved 100px either way.
Changing APP10 runtime is out of S05 scope.

---

## M. Internal navigation

**No primary-navigation item was activated.** The five IA labels are Khám phá,
Bộ sưu tập, Studio, Đặt thêu and Nhật ký; none semantically means Service.
`Studio` was **not** repurposed to `/cua-hang` — it means Product Studio — and
`Nhật ký` stays non-interactive. No new primary-nav item was invented.

**No Homepage affordance was activated.** The delivered `APP11-S01` composition
stages no Service affordance (audited: `homepage-routes.ts` records three active
routes and states "nothing is staged any more"), so per §18 none was invented. A
boundary test asserts the Homepage links to no S05 route.

The footer store-presentation block is the discovery path, as designed.

**Link inventory — every S05-owned internal link, fetched live:**

```text
footer (9 links)      /cua-hang /yeu-cau/moi /dich-vu /cau-hoi-thuong-gap
                      /bo-suu-tap + 4 policies      all 200, no redirect
content pages         asserted by test against the delivered-route set;
                      no /chinh-sach parent link, no rejected alias
```

Zero dead routes.

---

## N. Product Detail compatibility repair

`FU-APP11-S04-C1-01` — **CLOSED**.

Defect: `/san-pham/ao-thun-cotton` carries `category.slug = ao-thun`, outside the
closed Discover enum. The `Tiếp tục khám phá` category CTA built its href from
that value unconditionally, so the page's own invitation to keep browsing pointed
at `/kham-pha?category=ao-thun` — a 404 (confirmed live: that URL still returns
404, as it should).

Repair: the destination-resolution seam only, in
`detail-continue-discover.tsx`. The href now goes through
`toDiscoverCategorySlug`, the same predicate `APP11-S04-C1` applied to the
breadcrumb and the same narrowing `/kham-pha` uses to decide whether a
`?category=` value is real. One predicate now decides what may be linked, so a
crumb and a continuation CTA cannot disagree.

The CTA was **not** removed and no taxonomy mapping was invented. Both links
remain and the label still names the category, which stays true — the Product is
in it; only the filtered feed is not an address.

**Live proof:**

```text
/san-pham/ao-thun-cotton
  "Khám phá tất cả"   -> /kham-pha
  "Khám phá Áo thun"  -> /kham-pha        (was /kham-pha?category=ao-thun)
  click               -> lands on /kham-pha, HTTP 200
```

The canonical branch is proven by test across all four enum slugs
(`thu-bong`, `khan`, `quan-ao`, `khac` → `/kham-pha?category=<slug>`).
**No canonical-category Product fixture exists live** — `ao-thun-cotton` is the
only Product in the sitemap — so that branch has unit proof, not live proof. No
Product data was mutated to create one.

---

## O. SEO / sitemap integration

S05 added **no** SEO infrastructure. Every canonical and Open Graph block is built
by the S04 `publicPageMetadata` helper against `STOREFRONT_PUBLIC_ORIGIN`; the
boundary test asserts the S05 source hard-codes no origin (`https?://` appears
nowhere in it) and adds no `opengraph-image.ts`.

**Live, through the gateway** — all four inspected known pages emit an absolute
canonical, `og:title`, `og:description`, `og:url`, `og:locale=vi_VN`,
`og:type=website`, a meta description, and **no** `robots` directive (the
indexable state, since the root layout declares none either). No `og:image`:
no canonical representative image exists, and none was invented.

**No JSON-LD was added.** No Service, FAQPage, LocalBusiness or Organization
schema — none is approved, and `BreadcrumbList` stays with the two detail pages
that draw a real trail.

**Sitemap** — `PUBLIC_STATIC_ROUTES` extended, `sitemap.ts` untouched, which is
the seam working as designed. Live `/sitemap.xml` static half, in order:

```text
/  /kham-pha  4 category states  /bo-suu-tap
/dich-vu  /cau-hoi-thuong-gap  /cua-hang
/chinh-sach/giao-hang  /chinh-sach/thanh-toan
/chinh-sach/doi-tra    /chinh-sach/bao-mat        = 7 new URLs
```

All seven present. **No `/chinh-sach/[slug]` placeholder** and **no `/chinh-sach`
root** — neither is advertised, because the first 404s for any crawler that
fetches it and the second has no page. No `lastModified` was fabricated. The four
policy URLs are generated from the same ordered set the resolver matches and the
footer links, so the sitemap cannot advertise a policy that does not resolve. The
S04 50,000-URL composition guard is unchanged and its tests pass.

---

## P. Frozen artifacts

```text
OpenAPI            = 116 paths / 128 operations / 252 schemas   UNCHANGED
migrations         = 37                                          UNCHANGED
Admin page routes  = 25                                          UNCHANGED
Figma registry     = 532 rows, gate passes                       UNCHANGED
```

`git status` shows **no** change under `apps/api`, `apps/worker`,
`packages/database`, `packages/contracts`, `packages/api-client`, `apps/admin` or
`docs/design`. No HTTP operation added, no migration, no dependency, no favicon.

---

## Q. File-size / SCSS gates

```text
node tools/check-file-size.mjs <S05 source + test dirs>
  File-size check passed (0 files above the review threshold)

node tools/check-scss-file-size.mjs <S05 stylesheet dirs>
  SCSS file-size check passed (5 stylesheets, 0 above the review threshold)

node tools/check-app-scss.mjs storefront
  SCSS compile PASS (139572 bytes CSS, not written to disk)
```

Largest S05 files: `content-page-blocks.scss` 176, `store-presentation.scss` 171,
`faq-page.ts` 168, `content-page-metadata`-adjacent models all under 141. Every
runtime source ≤ 400, every stylesheet ≤ 400, every test ≤ 600 — and all under the
300/500 review thresholds. No historical debt was cleaned up;
`storefront-shell.scss` (429 lines, pre-existing) was not grown, which is why the
footer block owns a separate stylesheet.

**Note on the spacing scale.** `@embroidery/styles` exposes a closed step set
(4, 8, 12, 16, 24, 32, 48, 64, 96, 128) and the compile gate rejects anything
else. The design-measured values that are not on it — the 80/48/24 side padding,
the 28px mobile stack gap, the 56px block padding and FAQ trigger height, the 44px
touch floor and the 100px dock reserve — are declared as named local constants
with their reason, in the pattern `gallery-feed` established.

---

## R. Validation / live browser

```text
CHANGE_IMPACT
  Storefront route segments (4 new), content-pages + store-presentation features,
  shell composition + route constants, S04 static-route inventory,
  Product Detail continuation seam, main.scss registration.
  No backend, worker, database, contract, Admin or Figma surface.

TESTS_RUN
  pnpm typecheck (storefront)                                     PASS
  pnpm lint (storefront, scoped)                                  PASS
  pnpm build (storefront, production)                             PASS — 18 routes,
                                                                   4 policies SSG
  jest test/boundary  (12 suites)                                 PASS
  jest test/unit                                                  PASS
  jest test/smoke                                                 PASS
  jest content-page-template / store-presentation-block /
       product-detail-continue / storefront-shell-render /
       storefront-shell-footer / storefront-contact-handoff /
       homepage / acceptance
  ---- combined: 57 suites, 1152 tests                            PASS
  node tools/check-app-scss.mjs storefront                        PASS
  node tools/check-scss-file-size.mjs <S05 paths>                 PASS
  node tools/check-file-size.mjs <S05 paths>                      PASS
  node tools/check-figma-design-index.mjs                         PASS (532)
  prettier --check <all touched paths>                            PASS
  live browser 1440 / 1024 / 390 through the gateway              PASS

TESTS_NOT_RUN
  API, worker, Admin, database regression, full Playwright E2E,
  full monorepo aggregate, APP11-E01, historical phase suites.

WHY_NOT_RUN
  S05 is frontend-only and changed no backend, worker, database, contract or
  Admin file; git confirms it. Running them would be a repository-wide aggregate,
  which VALIDATION_GOVERNANCE §1.1 and §5 forbid.
```

### New S05 test files

```text
test/unit/content-policy-resolver.test.ts     18 tests — the closed policy set,
                                              resolution, and 10 hostile slugs
test/unit/content-page-authority.test.ts      30 tests — placeholders, invented
                                              claims, store-fact leakage, links
test/components/content-page-template.test.tsx 17 tests — one H1, heading order,
                                              FAQ ARIA + toggling, store fallback
test/components/store-presentation-block.test.tsx 9 tests — columns, order, policy
                                              grouping, dock separation
test/components/product-detail-continue.test.tsx 11 tests — both CTA branches
test/smoke/content-routes.test.tsx            17 tests — canonical/OG/robots per
                                              route, unknown-slug not-found
test/boundary/content-pages-source.test.ts    17 tests — no CMS, no API, no env,
                                              no invented SEO, dock separation
```

### Assertions that inverted at S05, as their authors intended

`gallery-feed-source`, `gallery-detail-source` and `homepage-source` each held
`ROUTES_OWNED_BY_LATER_CHECKPOINTS` asserting the S05 routes were **absent**, and
each file's header said S05 would delete its own entries. Done: the route sets
became `ROUTES_AT_S05` (18 exact), and the negative assertions became positive
ones plus a stricter new check that `/chinh-sach` has no `page.tsx`. The sitemap
composition test's "advertises no APP11-S05 route before S05 builds it" likewise
became "advertises the four concrete policies, and never the family placeholder".

`storefront-shell-render`'s anchor allowlist gained the seven S05 footer
destinations; what it guards — every shell anchor resolves to a delivered route —
is unchanged.

### A pre-existing failure found and repaired

Running the wider suite surfaced `app10-e01-contact-handoff.acceptance.test.tsx`
asserting `STOREFRONT_ROUTE_COUNT = 12`. Verified against `HEAD` with the working
tree stashed: **it was already failing before S05 touched anything** (expected 12,
actual 14) — stale since `APP11-S02`/`S03` added routes without updating it. Since
S05 changes the count again, the constant was corrected to 18 with the history
recorded in the file. The assertion's purpose — a contact handoff must not become
a route — is unchanged and still holds.

### Live browser acceptance

Chromium through the canonical gateway (`Host: embroidery.local`).

```text
ROUTES
  /dich-vu                      200
  /cau-hoi-thuong-gap           200
  /cua-hang                     200
  /chinh-sach/giao-hang         200
  /chinh-sach/thanh-toan        200
  /chinh-sach/doi-tra           200
  /chinh-sach/bao-mat           200
  /chinh-sach/khong-ton-tai     404, noindex, no canonical, no OG
  /chinh-sach                   404 (no page)

SHARED TEMPLATE   1440 / 1024 / 390
  exactly one H1 on all seven pages                    PASS
  no horizontal overflow at any width                  PASS
  reading width 736 at 1440 (D01 authority)            PASS
  StorePresentationBlock above the single footer       PASS
```

**Console errors: no S05-caused error.** Two pre-existing classes only —
`favicon.ico` 404 (`FU-APP11-S01-01`, out of S05 scope per §47) and a dev-only
HMR WebSocket 502 through the nginx gateway, which does not proxy websockets.

---

## S. Files changed

Git-authoritative.

**Modified (11):**

```text
apps/storefront/src/styles/main.scss
apps/storefront/src/features/storefront-shell/index.ts
apps/storefront/src/features/storefront-shell/model/storefront-navigation.ts
apps/storefront/src/features/storefront-shell/components/storefront-shell.tsx
apps/storefront/src/features/storefront-seo/model/public-static-routes.ts
apps/storefront/src/features/product-detail/components/detail-continue-discover.tsx
apps/storefront/test/boundary/gallery-feed-source.test.ts
apps/storefront/test/boundary/gallery-detail-source.test.ts
apps/storefront/test/boundary/homepage-source.test.ts
apps/storefront/test/components/storefront-shell-render.test.tsx
apps/storefront/test/unit/seo-sitemap-composition.test.ts
apps/storefront/test/acceptance/app10-e01-contact-handoff.acceptance.test.tsx
docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md
```

**Added:**

```text
apps/storefront/src/app/dich-vu/page.tsx
apps/storefront/src/app/cau-hoi-thuong-gap/page.tsx
apps/storefront/src/app/cua-hang/page.tsx
apps/storefront/src/app/chinh-sach/[slug]/page.tsx
apps/storefront/src/features/content-pages/**            (16 files)
apps/storefront/src/features/store-presentation/**       (5 files)
apps/storefront/test/unit/content-policy-resolver.test.ts
apps/storefront/test/unit/content-page-authority.test.ts
apps/storefront/test/components/content-page-template.test.tsx
apps/storefront/test/components/store-presentation-block.test.tsx
apps/storefront/test/components/product-detail-continue.test.tsx
apps/storefront/test/smoke/content-routes.test.tsx
apps/storefront/test/boundary/content-pages-source.test.ts
docs/implementation/reports/APP11-S05-COMPLETION-REPORT.md
```

`SCOPED_COMMAND_INDEX.md` was **not** modified: S05 created no new focused command
and reused the existing `CMD-CHECK-APP-SCSS-*`, `CMD-CHECK-SCSS-FILE-SIZE` and
`CMD-CHECK-FIGMA-DESIGN-INDEX` entries.

### One architectural note a reviewer should see

Composing `StorePresentationBlock` inside `StorefrontShell` made the shell barrel
transitively depend on `content-pages`, which needs the shell's route constants —
a genuine module cycle that failed at load
(`Cannot access '_storefrontnavigation' before initialization`), then a second one
through the `storefront-seo` barrel. Both are broken by importing the two **leaf**
modules directly (`storefront-shell/model/storefront-navigation`,
`storefront-seo/model/public-page-metadata`) rather than through their barrels.
The exception is documented at both leaves; barrels remain the entry point for
everything else, including every component.

---

## T. Follow-ups

```text
FU-APP10-D01-05                     CLOSED
  StorePresentationBlock implemented and live-verified above the existing Footer
  at 1440 (4-col), 1024 (2x2) and 390 (single stack + 100px dock reserve).

FU-APP11-S04-C1-01                  CLOSED
  Product Detail continuation CTA no longer links to the invalid `ao-thun`
  category state; live click on /san-pham/ao-thun-cotton lands on /kham-pha.

FU-APP11-S04-C1-02                  OPEN -> APP11-E01
  BACKEND_CONTRACT_DIVERGENCE = OPEN
  OWNER_FOR_NEXT_REVIEW = APP11-E01
  The running API emits `category.slug = ao-thun` while committed OpenAPI
  declares the closed Discover enum. S05 is frontend-only and changed no
  OpenAPI, generated client, migration, constraint or category row. The
  Storefront boundary guard (`toDiscoverCategorySlug`, now on both the
  breadcrumb and the continuation CTA) remains the containment mechanism.
  E01 must decide whether this blocks APP11 closure or routes beyond APP11
  under change-control authority.

FU-APP11-S04-01                     OPEN
  Tracked `.env` authority still carries no operator value for
  STOREFRONT_PUBLIC_ORIGIN. No untracked `.env` was written; builds and live
  tests used the same safe external environment injection as S04, and the
  fail-closed origin validation was not weakened.

FU-APP11-S01-01                     OPEN
  Favicon absent; its console 404 is pre-existing and out of S05 scope.

FU-APP2-DETAIL-NOT-FOUND-STATUS-01  OPEN
  Untouched by S05.

NEW — FU-APP11-S05-01               OPEN (Product Owner input)
  Canonical store address, opening hours, phone and e-mail remain unavailable.
  The Local page and footer omit them truthfully. Supplying them is a one-line
  change per value in `content-pages/model/store-facts.ts`, which lights up both
  surfaces; no page, component or stylesheet needs to change.
```

---

## U. Roadmap

```text
APP11-G01 … APP11-S04-C1   COMPLETE
APP11-S05                  COMPLETE
APP11-E01                  NEXT
APP11-X01                  NOT STARTED
```

Exactly one `NEXT`. `APP11-E01` was not started.
