# APP12-G02-C1 — Wave-2 Customer CTA Suppression

## A. Verdict

```text
APP12-G02-C1     = COMPLETE
PARENT_APP12-G02 = COMPLETE_AFTER_C1
CORRECTION_USED  = 1 / 1
NEXT_CHECKPOINT  = APP12-D01
```

No released Wave-1 page offers a customer an address the release gate answers
with a deliberate `404`. Measured on the rendered DOM, in Chromium, against the
canonical local gateway:

```text
WAVE2_ACTIVE_LINKS_ON_WAVE1_PAGES = 0        (14 URLs, 253 rendered anchors)
```

The server gate is untouched and re-verified: 7/7 Wave-2 routes still deny with
the capability withheld, 7/7 restore when it is released, and the API's 31 `DENY`
/ 12 `ALLOW` authority is unchanged because no API source was modified.

This is the only correction taken against `APP12-G02`. No `APP12-G02-C2`.

---

## B. Defect inventory

The parent report's prose said "seven further surfaces" and then listed eight.
Neither number was right, and neither was used. What follows is mechanical.

```text
SOURCE_OCCURRENCES  = 9
RUNTIME_SURFACES    = 11 route patterns  (14 concrete URLs crawled)
ACTIVE_LINKS_BEFORE = 22
```

The three numbers differ for a reason worth stating plainly, because conflating
them is what produced the parent report's miscount: **one component can render on
many routes, and one route can carry many links.** The footer store-presentation
block is a single source occurrence that appeared on all fourteen crawled URLs;
the Homepage is a single URL that carried three separate links.

### B.1 — SOURCE_OCCURRENCES = 9

Every Wave-1 source site that emitted an active anchor to a Wave-2 customer
route. Found by enumerating the three exported route constants and the two path
literals across all Storefront production source, not by re-reading the parent
report's list.

| # | Source | Renders on | Target |
|---|---|---|---|
| 1 | `homepage/components/homepage-hero.tsx` | `/` | `/yeu-cau/moi` |
| 2 | `homepage/components/homepage-commission-cta.tsx` | `/` | `/yeu-cau/moi` |
| 3 | `gallery-detail/components/gallery-detail-commission.tsx` | `/bo-suu-tap/[slug]` | `/yeu-cau/moi` |
| 4 | `store-presentation/model/store-presentation-copy.ts` → `store-presentation-block.tsx` | **every released route** | `/yeu-cau/moi` |
| 5 | `content-pages/model/service-page.ts` | `/dich-vu` | `/yeu-cau/moi` |
| 6 | `content-pages/model/faq-page.ts` | `/cau-hoi-thuong-gap` | `/yeu-cau/moi` |
| 7 | `content-pages/model/local-page.ts` | `/cua-hang` | `/yeu-cau/moi` |
| 8 | `content-pages/model/policies/payment-policy.ts` | `/chinh-sach/thanh-toan` | `/yeu-cau/moi` |
| 9 | `content-pages/model/policies/shipping-policy.ts` | `/chinh-sach/giao-hang` | `/yeu-cau/moi` |

**Occurrence 1 is not in the parent report's list.** The Homepage *hero* carries
a second, quieter commission action beside `Khám phá tác phẩm`, and the parent
report named only the Homepage commission *section*. It is the concrete reason
this correction was required to inventory rather than to transcribe.

A tenth site — `storefront-shell/components/storefront-primary-nav.tsx` — was
already suppressed by `APP12-G02` §9 and is excluded from every count here. It is
counted in §H, where restoration is measured, because a flag-on crawl cannot tell
the two apart by looking.

`/san-pham/*/thiet-ke` and the four `/truy-cap` custom children were advertised
from **nowhere** on a Wave-1 page, before or after. The parent report's claim that
Product Detail has no active Studio CTA is confirmed, and §12's boundary held:
Product Detail source is unchanged.

### B.2 — RUNTIME_SURFACES = 11

Released route patterns that rendered at least one of those nine links. Every one
of them did, because the footer block is composed by the shell on all of them.

```text
/                      /kham-pha            /san-pham/[slug]
/bo-suu-tap            /bo-suu-tap/[slug]   /dich-vu
/cau-hoi-thuong-gap    /cua-hang            /chinh-sach/[slug]
/xac-minh-lien-he      /truy-cap
```

Crawled as 14 concrete URLs — `/chinh-sach/[slug]` is exercised at all four
canonical slugs — because the two policy pages that list the request link and the
two that do not had to be told apart by measurement.

### B.3 — ACTIVE_LINKS_BEFORE = 22

Rendered anchors to a Wave-2 route, per URL, before this correction. Derived from
the flag-on crawl in §H minus the fourteen primary-navigation links `APP12-G02`
already owned, since with the flag off those fourteen were already suppressed.

| URL | Before | Which |
|---|---|---|
| `/` | 3 | hero · commission section · footer |
| `/bo-suu-tap/ao-cuoi-theu-tay-xom5` | 2 | gallery commission block · footer |
| `/dich-vu` | 2 | related links · footer |
| `/cau-hoi-thuong-gap` | 2 | related links · footer |
| `/cua-hang` | 2 | related links · footer |
| `/chinh-sach/thanh-toan` | 2 | related links · footer |
| `/chinh-sach/giao-hang` | 2 | related links · footer |
| `/kham-pha` | 1 | footer |
| `/san-pham/ao-thun-cotton` | 1 | footer |
| `/bo-suu-tap` | 1 | footer |
| `/chinh-sach/doi-tra` | 1 | footer |
| `/chinh-sach/bao-mat` | 1 | footer |
| `/xac-minh-lien-he` | 1 | footer |
| `/truy-cap` | 1 | footer |
| **Total** | **22** | |

---

## C. Correction architecture

### C.1 — One mechanism, reused; no second flag

`APP12-G02` already delivered the shared presentation question:

```text
features/release-isolation/model/withheld-route-state.ts
  isCustomerRouteWithheld(route) = isWithheldWave2Route(route) && !isCustomEmbroideryReleased()
```

All five corrected renderers call exactly that. Nothing new was built: no feature-
flag framework, no second variable, no per-page environment read. The census in
`test/boundary/wave2-cta-source.test.ts` asserts this mechanically — no
release-aware renderer may contain `CUSTOM_EMBROIDERY_RELEASE_ENABLED`,
`process.env`, `NEXT_PUBLIC_` or `'use client'`.

```text
release flags in the repository      1   (unchanged)
NEXT_PUBLIC_ twin                    none
client-readable release config       none
```

### C.2 — The server boundary is where the decision stays

`isCustomEmbroideryReleased()` reads `process.env`, so every caller is necessarily
a Server Component. All five corrected files were already server components and
remain so; none became a client island and none receives the flag as a prop. The
browser is never told what is withheld — it is simply not offered it.

### C.3 — Suppression is not the gate, and this correction does not make it one

`src/proxy.ts` is unchanged. It is still the only thing that withholds a route,
still a rewrite to a `404` rather than a redirect, and still independent of
navigation, JavaScript and the visitor's cooperation. Deleting every change in
this correction would alter what a visitor is *offered* and nothing about what
they can *reach* — which is the property
`APP12-RELEASE-WAVE-AUTHORITY.md` §6 requires, and the reason §4 of the
correction prompt insists both must be true at once.

### C.4 — Which of §7's two behaviours each site got, and why

The rule applied uniformly: **omit the action**, and take the boundary of "the
action" to be whatever stops making sense without it.

- Where the surrounding section survives losing one link — a list of places to go
  next, a contact column — only the link is dropped and every word of copy stays.
- Where the section *is* the ask end to end — a heading that asks, a body that
  instructs, and a button that is the only thing to do — the section is omitted
  whole. Keeping heading and steps while deleting the button would leave a page
  explaining how to commission an embroidery and offering no way to, which is the
  same dead end with the exit removed rather than a smaller change.

No third behaviour was invented. There is no `Sắp ra mắt`, no `Coming soon`, no
banner, no card and no explanatory paragraph anywhere this correction touched,
and a test asserts that across all twelve corrected compositions.

---

## D. Homepage correction

Both Homepage sites, handled here rather than routed to `APP12-S01` as §8
requires.

**Hero (`homepage-hero.tsx`) — action omitted, section kept.** The hero has two
actions: `Khám phá tác phẩm` → `/kham-pha` (Wave-1) and the quiet commission ask.
The second is dropped while Wave 2 is withheld. `USER_FLOW_ARCHITECTURE` §6.3 —
which requires the primary ask never to be presented in isolation — survives the
removal intact: it constrains how the ask is presented, not that a second action
must exist, and what remains is the low-commitment move the hero always led with.
Heading, lead and the explore link are byte-identical.

**Commission CTA (`homepage-commission-cta.tsx`) — section omitted.** Section 6
of the approved composition is the ask: `Đặt thêu theo yêu cầu`, the lead, the
three BR-005 safety steps that exist to make the ask acceptable, and the button.
It renders nothing while the capability is withheld.

```text
flag off   /   no active anchor to any Wave-2 route      (0 of 18 rendered anchors)
           /   sections rendered: Hero · Featured · Discover · Collections · Story
flag on    /   4 Wave-2 anchors restored, unchanged targets and labels
           /   sections rendered: the locked six, in the locked order
```

The locked six-section order is now asserted with the capability released, where
it is the delivered composition; the withheld composition is asserted separately.
No copy, no step, no href and no class name changed in source.

---

## E. Shared / footer correction

`store-presentation-block.tsx` — the widest-reaching occurrence by an order of
magnitude, because the shell composes it onto every released page. Its contact
column's `Gửi yêu cầu thêu` action is omitted while Wave 2 is withheld.

The column's prose is untouched, deliberately. Unlike the two CTA sections, this
column is not an ask: it is the contact column, and its sentence also names the
Zalo/Messenger dock channels, which are Wave-1 and still there. Removing the one
anchor leaves a column that still tells a visitor how to reach the workshop, so
rewriting the sentence would be the copy change §18 permits only when
structurally unavoidable — and it is not. A test pins the prose as identical
between the two release states.

The block's other three columns — `Ghé xưởng`, the three service routes and the
four policies — are Wave-1 and unconditional.

The primary navigation is unchanged by this correction. `APP12-G02` already
routed `Đặt thêu` through the shell's **existing** unavailable affordance, which
is the one place a `Sắp ra mắt` tag legitimately appears; §7's exemption covers
it (an approved unavailable-state component reused with no design change) and it
renders no anchor, so the crawl is unaffected. It is the single documented
exclusion from the "publishes no release plan" assertion.

---

## F. Content-page corrections

`content-links-block.tsx` — one shared filter covering five pages.

The five `APP11-S05` definitions that list `Gửi yêu cầu thêu` in their related-
links block are **unmodified**. The shared template filters the section's links
through `isCustomerRouteWithheld` at render, which keeps the model the authority
for what a page links to and puts the release question in exactly one place
rather than five. The item is dropped rather than rendered inert: this block is a
list of places to go next, every remaining entry of which still goes somewhere,
and a disabled row would name a destination and then refuse it.

| Page | Links flag off | Links flag on | Delta |
|---|---|---|---|
| `/dich-vu` | 4 | 5 | 1 |
| `/cau-hoi-thuong-gap` | 5 | 6 | 1 |
| `/cua-hang` | 4 | 5 | 1 |
| `/chinh-sach/thanh-toan` | 4 | 5 | 1 |
| `/chinh-sach/giao-hang` | 4 | 5 | 1 |
| `/chinh-sach/doi-tra` | 5 | 5 | 0 |
| `/chinh-sach/bao-mat` | 5 | 5 | 0 |

Exactly one link differs per affected page — asserted, so the block cannot
quietly gain or lose anything else — and no block falls below four links, so none
is reduced to a heading over an empty list. An empty-list guard returns `null`
rather than shipping such a block; no definition produces that today.

`gallery-detail-commission.tsx` — the gallery-entry closing block is omitted
whole, for the reason in §C.4: its heading asks the question
(`Muốn một tác phẩm của riêng bạn?`) and its body is an instruction to use the
withheld route, so nothing survives losing the anchor. The entry above it —
breadcrumb, media, narrative, related Product and `Continue Discovering` — is
Wave-1 and unchanged, so the page still ends on a way onward.

---

## G. Mechanical runtime link crawl

Playwright / Chromium against the canonical local gateway
(`http://embroidery.local`, the Nginx `CP0.3` host), `CUSTOM_EMBROIDERY_RELEASE_ENABLED`
withheld. Every rendered `<a href>` in the live DOM was collected and classified
by the *same* route shape the server gate uses — the six exact paths plus the
three-segment `/san-pham/<slug>/thiet-ke` form — not by a `/yeu-cau/moi` literal,
so a different withheld route would be caught too.

```text
WAVE2_ACTIVE_LINKS_ON_WAVE1_PAGES = 0
DEAD_ANCHORS (href="#" or href="")  = 0
```

| URL | HTTP | Anchors | Wave-2 |
|---|---|---|---|
| `/` | 200 | 18 | 0 |
| `/kham-pha` | 200 | 19 | 0 |
| `/san-pham/ao-thun-cotton` | 200 | 17 | 0 |
| `/bo-suu-tap` | 200 | 25 | 0 |
| `/bo-suu-tap/ao-cuoi-theu-tay-xom5` | 200 | 16 | 0 |
| `/dich-vu` | 200 | 17 | 0 |
| `/cau-hoi-thuong-gap` | 200 | 18 | 0 |
| `/cua-hang` | 200 | 17 | 0 |
| `/chinh-sach/thanh-toan` | 200 | 17 | 0 |
| `/chinh-sach/giao-hang` | 200 | 17 | 0 |
| `/chinh-sach/doi-tra` | 200 | 18 | 0 |
| `/chinh-sach/bao-mat` | 200 | 18 | 0 |
| `/xac-minh-lien-he` | 200 | 13 | 0 |
| `/truy-cap` | 200 | 14 | 0 |
| **Total** | | **253** | **0** |

No page's text matched
`Đặt thêu theo yêu cầu | Muốn một tác phẩm của riêng bạn | Bắt đầu yêu cầu | Gửi yêu cầu thêu`,
so the suppression removed the offers rather than merely unlinking their labels.

Excluded from the classification, per §16: Admin/staff URLs (different host),
non-interactive markup, test fixtures, and the canonical not-found page's links.

**A live-environment obstacle, recorded because it changes how this evidence
should be read.** The first two crawl attempts returned near-empty documents. The
cause is pre-existing and unrelated to this correction: `STOREFRONT_PUBLIC_ORIGIN`
is unset in the local `.env`, and `app/layout.tsx`'s `generateMetadata` fails
closed on it, which a plain `curl` GET survives (`200`, full HTML) but a browser's
RSC navigation does not. This is `FU-APP11-S04-01`, already carried to
`APP12-H01`/operator by the parent report, now re-confirmed a second time. The
crawl was run with the value supplied **through the shell environment for that
run only**; `.env` was not written, no image was rebuilt, and the container was
returned to exactly the configuration it was found in afterwards (both variables
unset), with the seven denials re-verified after the restore.

---

## H. Flag-on compatibility

Same crawl, `CUSTOM_EMBROIDERY_RELEASE_ENABLED=true`, **no source change between
the runs**.

```text
restored Wave-2 anchors, 14 URLs = 36
  of which APP12-G02's primary nav = 14
  of which restored by this C1     = 22   ( = ACTIVE_LINKS_BEFORE, exactly)
```

Every corrected surface returns as delivered:

| Surface | Restored label | Target |
|---|---|---|
| Homepage hero | `Đặt thêu theo yêu cầu` | `/yeu-cau/moi` |
| Homepage commission section | `Bắt đầu yêu cầu` (+ heading, lead, 3 steps) | `/yeu-cau/moi` |
| Gallery entry commission block | `Đặt thêu` (+ heading, body) | `/yeu-cau/moi` |
| Footer contact column | `Gửi yêu cầu thêu` | `/yeu-cau/moi` |
| 5 content pages, related links | `Gửi yêu cầu thêu` | `/yeu-cau/moi` |
| Primary navigation (`APP12-G02`) | `Đặt thêu` | `/yeu-cau/moi` |

With the capability released, `[aria-disabled]` in the shell contains only
`Studio` and `Nhật ký` — `Đặt thêu` is a live link again — which is the
`APP12-G02` §9 behaviour, unchanged.

```text
hrefs      unchanged
labels     unchanged
copy       unchanged
styling    unchanged
layout     unchanged
new copy   none
```

That the restored count equals the before count exactly is the check that this is
a suppression and not a deletion.

---

## I. Server-gate non-regression

The gate is the authority and this correction does not touch it. Re-verified live
in both states, against the gateway, with no code change between runs.

**Storefront routes, capability withheld — 7/7 deny**

```text
404  /yeu-cau/moi
404  /yeu-cau/da-gui
404  /truy-cap/bao-gia
404  /truy-cap/duyet-thiet-ke
404  /truy-cap/thanh-toan
404  /truy-cap/thanh-toan-con-lai
404  /san-pham/ao-thun-cotton/thiet-ke
```

**Storefront routes, capability released — 7/7 restore**

```text
200  /yeu-cau/moi              200  /truy-cap/thanh-toan
200  /yeu-cau/da-gui           200  /truy-cap/thanh-toan-con-lai
200  /truy-cap/bao-gia         200  /san-pham/ao-thun-cotton/thiet-ke
200  /truy-cap/duyet-thiet-ke
```

**Wave-1 routes not falsely denied**, including the two `APP12-G01` traps:

```text
200  /   /kham-pha   /san-pham/ao-thun-cotton   /bo-suu-tap   /dich-vu
200  /cua-hang       /truy-cap                                (the landing itself)
```

**API authority — unchanged, because no API source changed.**
`git status --porcelain apps/api packages` is empty. Per §21, a smoke proof
rather than a full suite:

```text
apps/api $ pnpm jest src/platform/release-gate/release-gate.contract.spec.ts \
                     src/config/custom-embroidery-release.config.spec.ts
  Test Suites: 2 passed, 2 total
  Tests:       32 passed, 32 total
```

That contract spec is the file that holds the 31 `DENY` / 12 `ALLOW` inventory.

```text
API DENY            = 31/31 enforced   (authority spec green, source unchanged)
API ALLOW           = 12/12 unaffected
publicSecureLink_resolve whole-operation denial = unchanged
```

---

## J. Files changed

**Source — 5 files, all Server Components, all in `apps/storefront/src`**

| File | Change |
|---|---|
| `features/homepage/components/homepage-hero.tsx` | omit the commission action when withheld |
| `features/homepage/components/homepage-commission-cta.tsx` | render nothing when withheld |
| `features/gallery-detail/components/gallery-detail-commission.tsx` | render nothing when withheld |
| `features/content-pages/components/content-links-block.tsx` | filter withheld links; `null` if none remain |
| `features/store-presentation/components/store-presentation-block.tsx` | omit the contact action when withheld |

**Tests — 3 added, 2 modified, all in `apps/storefront/test`**

| File | Change |
|---|---|
| `support/release-flag.ts` | **new** — `withCustomEmbroideryRelease`, save/restore in a `finally` |
| `components/wave2-cta-suppression.test.tsx` | **new** — 51 tests: withheld sweep over 13 compositions, flag-on restoration |
| `boundary/wave2-cta-source.test.ts` | **new** — 4 tests: the two source censuses |
| `components/homepage.test.tsx` | released-state assertions wrapped; one withheld-hero case added |
| `components/store-presentation-block.test.tsx` | contact-action assertion split across both states |

**Not changed:** any content-page or footer *definition*, any copy string, any
route constant, `proxy.ts`, `wave2-route-policy.ts`, `withheld-route-state.ts`,
`custom-embroidery-release.ts`, the primary navigation, Product Detail, any
`.scss`, `apps/api`, `apps/admin`, `apps/worker`, `packages/`, `infrastructure/`,
`.env`, `.env.example`.

---

## K. File-size evidence

```text
node tools/check-file-size.mjs --paths <10 changed source/test files>
Scoped file-size check passed (10 file(s), 0 above the review threshold).
```

| File | Lines | Limit |
|---|---|---|
| `content-links-block.tsx` | 65 | 400 |
| `gallery-detail-commission.tsx` | 52 | 400 |
| `homepage-commission-cta.tsx` | 65 | 400 |
| `homepage-hero.tsx` | 50 | 400 |
| `store-presentation-block.tsx` | 134 | 400 |
| `homepage.test.tsx` | 243 | 600 |
| `store-presentation-block.test.tsx` | 140 | 600 |
| `wave2-cta-source.test.ts` | 189 | 600 |
| `wave2-cta-suppression.test.tsx` | 260 | 600 |
| `release-flag.ts` | 36 | 600 |

Nothing is over a hard limit or a review threshold, so no split was required and
none was smuggled in. No repository-wide sweep was run.

---

## L. Validation

Every command below was executed; each is scoped to what this correction actually
changed (`VALIDATION_GOVERNANCE.md` §3). No repository-wide aggregate was run.

| Command | Result |
|---|---|
| `git diff --check` | clean |
| `apps/storefront $ pnpm typecheck` (`tsc --noEmit`) | PASS |
| `apps/storefront $ pnpm jest` | **120 suites, 2142 tests, all PASS** |
| `apps/storefront $ pnpm jest test/components/wave2-cta-suppression.test.tsx` | 51 PASS |
| `apps/storefront $ pnpm jest test/boundary/wave2-cta-source.test.ts` | 4 PASS |
| `apps/api $ pnpm jest src/platform/release-gate/release-gate.contract.spec.ts src/config/custom-embroidery-release.config.spec.ts` | 32 PASS |
| `npx eslint <10 changed files>` | 0 problems |
| `npx prettier --check <10 changed files>` | all clean |
| `node tools/check-file-size.mjs --paths <10 files>` | PASS, 0 over threshold |
| Live HTTP, withheld — 7 Wave-2 routes | 7/7 `404` |
| Live HTTP, released — 7 Wave-2 routes | 7/7 `200` |
| Live HTTP, withheld — 7 Wave-1 routes | 7/7 `200` |
| Playwright/Chromium crawl, withheld — 14 URLs | **0** Wave-2 anchors, 0 dead |
| Playwright/Chromium crawl, released — 14 URLs | 36 restored (22 C1 + 14 G02 nav) |

**Deliberately not run**, per §21 and §19: the full API suite (no API source
changed — the authority spec above is the smoke proof), the SCSS compile and size
gate (`SCSS delta = 0`), the OpenAPI/client regeneration, any migration, the Figma
index gate (no design change), the full monorepo, UAT and performance suites.

### The two guards added, and what each catches

The render sweep proves the property for the compositions it lists; it cannot
prove it for a component that does not exist yet. So the source census asks the
complementary question — *did the set of places that know about a Wave-2 route
change?* — in both directions:

- a **new** Wave-1 source naming a Wave-2 route fails census `A`;
- a release-aware renderer that **stops** consulting the release fails census `B`.

Together with the 13-composition rendered sweep, a new active Wave-2 CTA on a
released page fails the suite before it can reach a crawl.

---

## M. Follow-up closure

```text
FU-APP12-G02-01 = CLOSED_BY_APP12_G02_C1
```

Closed here rather than routed to `APP12-S01`: it is the same release-isolation
capability and it was discovered inside `APP12-G02` itself. The parent report's
routing to `APP12-S01`, and its stated reason — that suppressing these surfaces
would require new copy and layout — are both superseded. No new copy and no
layout were required; the delivered surfaces already read cleanly with the offer
absent, which is what the mechanical inventory established that the prose
estimate did not.

The parent report's "seven further surfaces" wording is corrected in place with a
correction notice rather than by rewriting the historical evidence: the real
figures are `SOURCE_OCCURRENCES = 9`, `RUNTIME_SURFACES = 11`,
`ACTIVE_LINKS_BEFORE = 22`.

**Re-confirmed, not created:** `FU-APP11-S04-01` (operator `STOREFRONT_PUBLIC_ORIGIN`
configuration) — see §G. Owner unchanged: `APP12-H01` / operator.

**Created by this correction:** none.

---

## N. Baseline freeze

```text
OpenAPI                  unchanged   (116 paths / 128 operations / 252 schemas)
generated client         unchanged
database / migrations    unchanged   (37)
Admin routes             unchanged
Storefront routes        unchanged   (18)
Figma                    unchanged
SCSS                     0 lines changed
Docker images            not rebuilt
business data            unchanged
.env                     not written
release flags            1           (no second flag introduced)
```

No Ready-Made implementation. No category work. No UAT seeding. No production
infrastructure work. No redesign. `APP12-D01` not started. Nothing pushed.

---

## O. Roadmap

```text
APP12-G02    = COMPLETE_AFTER_C1
APP12-G02-C1 = COMPLETE   (correction 1 / 1 — no C2)
APP12-D01    = NEXT
```
