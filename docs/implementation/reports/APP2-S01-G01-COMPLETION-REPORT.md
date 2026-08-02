# APP2-S01-G01 — Storefront Discover Route Authority — Completion Report

**Verdict: `PASS`.** Documentation, authority-consistency and evidence only. No
application source, OpenAPI, generated-client, database, Figma, infrastructure or
dependency change.

---

## A. Preflight and the blocked S01 attempt

Entry was the `APP2-B04-C1` evidence commit, verified from Git rather than assumed:

| Fact | Value |
|---|---|
| Branch | `production` |
| HEAD at entry | `78631958ac307ab1b85e8925dfcaffc60c114b35` |
| Subject | `docs(app2): record B04 pagination correction evidence` |
| Tracked/staged tree | clean |
| Ignored user-owned `evidences/` | untouched (`!! evidences/`, `no_redirection_after_updated.png` present) |
| Local commits ahead of `origin/production` | 54 at entry |

Accepted B04 chain re-verified unchanged: `fa8e05e` (19 files), `559237d` (3 files,
+792/−2), `0c331aa` (21 files, +1695/−23).

`APP2_S01_G01_PREFLIGHT = PASS` — every §8 command was executed at this exact HEAD
with a clean tree: `check:secrets` (356 documents / 1710 tracked files),
`check:lifecycle` (LC-04, 5 transitions), `check:pagination-authority` + its 14 tests,
`pnpm quality` (exit 0), `check:openapi`, `check:api-client`, `check:figma-design-index`
+ its 31 tests, `db:check:manifest`, `git diff --check`.

**The blocked S01 attempt changed no repository file.** It ran preflight, ran the two
§5 route gates, blocked at the first, and stopped — `git status --short` was empty
before and after. `APP2-S01-C1` = `NOT_APPLICABLE`; no correction checkpoint exists.

---

## B. Existing route-authority audit

What the repository actually contained before this gate:

| Question | Finding |
|---|---|
| Storefront browser routes | Exactly one: `/` (`apps/storefront/src/app/page.tsx`, still the CP0 scaffold placeholder), plus `/healthz` and `not-found.tsx` |
| Homepage ownership | `/` is Homepage-owned — UI01 Homepage `183:7`, `FIG-WF-HOMEPAGE` (Route/Capability `/`), homepage/discovery content assigned to APP11 |
| Shell navigation | `STOREFRONT_PRIMARY_NAV` gives all five items `route: null`, including `discover` / *Khám phá*; only `STOREFRONT_HOME_ROUTE = '/'` exists |
| Not-found recovery | `secondaryLabel: 'Khám phá tác phẩm'` with `secondaryTag: 'Sắp ra mắt'` and `secondaryUnavailable` |
| Route proposals on record | `/san-pham/<slug>` only — phase plan §6.2 open items, `FIGMA_DESIGN_INDEX.md` §4.3, roadmap `450:404`, all labelled `CHƯA CHỐT` / *proposal only* |
| Decision register | No entry, locked or open, for any Storefront browser route (`IMP-O009` covers design references, not routing) |
| Design registry | The four `FIG-UI02-DISCOVER-*` rows carry Route/Capability *Discovery authority (APP2-S01)* — a capability, never a path; no prototype link recorded |
| SEO authority | `docs/08-SEO-AND-CONTENT.md` requires canonical URLs and "clean URLs" but defines no path patterns — nothing conflicts with `/kham-pha` |
| Next actual decision ID | `IMP-D037` was the last locked entry → `IMP-D038` |

The absence was deliberate, not an oversight: `storefront-navigation.ts` states in its
own header that "real routes and `href`s are added by the phases that own each area."

---

## C. Product Owner Discover-route ruling

**`/kham-pha`**, no trailing slash, is the APP2 Storefront Discover / Product List
route. `/` remains Homepage-owned. `/discover`, `/catalog`, `/products` and
`/san-pham` are **rejected** as current Discover paths; this gate approves **no alias
and no redirect**.

Rationale as given: the product is positioned as a Pinterest-inspired creative
embroidery studio rather than a conventional marketplace, the approved navigation
label is *Khám phá*, Vietnam is the primary market, and `/kham-pha` carries browsing
intent without converting the experience into a `/san-pham` shop listing.

---

## D. Category URL ruling

`/kham-pha` unfiltered, `/kham-pha?category=<slug>` filtered, over exactly four fixed
slugs — `thu-bong`, `khan`, `quan-ao`, `khac` (rendered *Thú bông*, *Khăn*, *Quần áo*,
*Khác*). "All categories" **omits** the query rather than sending a sentinel; the query
key is exactly `category`; any unknown or malformed value uses the approved public
not-found policy. This gate implements no route and no query parsing — that is S01 work.

---

## E. Shell, navigation and not-found ownership

`APP2-S01` owns exactly one shell activation: nav id `discover`, label *Khám phá*,
route `/kham-pha`, with active state and `aria-current` on `/kham-pha`. It may also
point the approved not-found recovery *Khám phá tác phẩm* at `/kham-pha`, retiring that
action's `Sắp ra mắt` tag. Collections, Studio, Commission, Journal and Search stay
unrouted and inert. `/` remains Homepage-owned.

---

## F. Staged Product-card ruling

S01 Product cards are **explicitly authorized to be staged, non-interactive content**:
a semantic list item / article carrying a thumbnail (or an honest placeholder), the
Product name and the Category name — with no `href`, click handler, button role,
pointer cursor, interactive hover treatment, *Xem chi tiết* affordance, or link to API
JSON.

This is the ruling that actually unblocks the feed. Without it S01 re-blocks at the
card-destination gate even after the list route is named, because neither §5.2 branch
was available: no approved Product browser route existed, and no accepted authority
permitted a staged card. It is a deliberate truthful interim state, **not** a missing
acceptance item and not a licence to link somewhere dead.

---

## G. Product Detail route deferral

The Product Detail browser route remains **unresolved** and belongs to the UI03
reconciliation / `APP2-S02` authority. `/san-pham/<slug>` remains `CHƯA CHỐT` /
`NOT_CANONICAL` / `NOT_IMPLEMENTATION_AUTHORITY`. `APP2-S02` remains
`BLOCKED_BY_UI03_RECONCILIATION` against UI03 roots `261:1290` / `262:1291` /
`273:1409` / `279:1504`, all unchanged. Once S02's design and route authority are
approved, S02 may convert the existing S01 semantic card wrapper into a link **without**
changing the masonry architecture.

---

## H. UI02 and source-map clarification

The route came from repository and Product Owner authority, **not from Figma**. No
Figma node was opened, modified or relied upon for it, and the registry is unchanged at
72 IDs / 72 node rows. UI02 masonry authority is untouched: `208:538`, `208:2002`,
`224:871`, `226:1038`, `REUSE_AND_SUPPLEMENT_ONLY`, 5 / 3 / 2 columns with linear DOM
reading order.

One wording clarification was required and made in `FIGMA_DESIGN_INDEX.md` §4.4: the
permitted-supplement list's "product title and product-detail link" enumerated
*permissible* supplements and was never a mandate to fabricate a route. S01 uses the
title and withholds the link under the staged-card ruling.

---

## I. Decision and status reconciliation

`IMP-D038` (the next actual ID; nothing renumbered or reused) records the ruling in
`14-IMPLEMENTATION-DECISION-REGISTER.md` as `LOCKED`.

| Document | Change |
|---|---|
| `14-IMPLEMENTATION-DECISION-REGISTER.md` | New `IMP-D038` row |
| `phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md` | New §6.2.2 ruling block with the machine-checked fact table; new checkpoint-map row 13b (`APP2-S01-G01`); row 14 gains route authority and the `S01-G01` dependency |
| `10-MASTER-APPLICATION-ROADMAP.md` | APP2 row records `APP2-S01-G01` = `COMPLETE — DELIVERED_FOR_REVIEW`, IMP-D038, `APP2-S01` = `READY — NOT STARTED`, `APP2-S01-C1` = `NOT_APPLICABLE` |
| `11-TRACEABILITY-AND-STATUS-MATRIX.md` | APP2 Storefront surface cell names `/kham-pha`; no status duplicated (that document records status once, in the roadmap) |
| `design/FIGMA_DESIGN_INDEX.md` | §4.3 route-authority note (route is repository authority, not a Figma label); §4.4 supplement-wording clarification |

**`APP2_PRE_IMPLEMENTATION_AUDIT.md` was deliberately not edited.** It is a dated audit
snapshot that states no route at all — its Storefront rows classify design coverage, not
URLs — so a route note there would rewrite history without governance requiring it.

No historical completion report was rewritten. Existing `/san-pham` prose (phase §6.2
open items, roadmap `450:404`, registry §4.3) is preserved verbatim with its
`CHƯA CHỐT` / *proposal only* labelling intact.

Status during the gate was `APP2-S01-G01 = IN_PROGRESS` / `APP2-S01 =
BLOCKED_BY_APP2-S01-G01`; the delivered state is in §N.

---

## J. Consistency checker and regressions

Existing checkers were inspected first: `check-lifecycle-consistency` governs LC-04
state transitions and `check-pagination-authority` governs the Q-01 contract — neither
has a route surface to extend. A new narrow gate was added.

`tools/check-storefront-route-authority.mjs` (266 lines) validates **authority, not
implementation**, across five named documents. It holds the line between *a path
appears in a document* and *a path is authorized* — the exact gap that let
`/san-pham/<slug>` sit one careless edit away from becoming a route:

- the §6.2.2 fact table matches all seven expected values;
- the single `IMP-D038` row is `LOCKED` and states the route, `?category=`, all four
  slugs, the non-interactive authorization and the S02 block;
- roadmap, traceability and design index all record `/kham-pha`;
- no unlabelled line in the register row or ruling block promotes `/discover`,
  `/catalog`, `/products` or `/san-pham` to canonical / approved / alias;
- no unlabelled line requires a card to carry an `href` or link;
- no document declares `APP2-S02` ready — matched by identifier-plus-copula regex
  rather than per line, because the roadmap keeps every APP2 status in one very long
  table row alongside `APP2-S01` = `READY — NOT STARTED`;
- the ruling block keeps the S02 block and all four UI03 roots.

Labelled proposal/historical prose stays legal (`proposal`, `chưa chốt`, `unresolved`,
`withheld`, `rejected`, `superseded`, `historical`, and negations) — without that
exemption the ruling, which must name what it rejects, would fail the gate it
introduces.

`tools/check-storefront-route-authority.test.mjs` (231 lines) — **22 tests, 22 passing**,
run twice. Each copies the real canonical documents into a scratch tree and introduces
exactly one drift: Discover moved to `/`; Discover moved to `/san-pham`; an alias
promoted to canonical; the category query key drifted to `danh-muc`; a fixed category
removed; a card required to link before S02; `APP2-S02` marked `READY`;
`/san-pham/<slug>` marked approved; card interaction changed to `LINKED`; the detail
route resolved in this decision; the decision row renumbered; the non-interactive
authorization dropped from the register row; the route dropped from a downstream
authority; the ruling block heading lost. Seven helper tests cover block bounding, fact
parsing, label exemption and the long-shared-row S02 regex.

Wired into `pnpm quality` after `check:pagination-authority`, and picked up
automatically by `pnpm test`'s `tools/*.test.mjs` aggregation. No dependency or
lockfile change.

---

## K. Frozen artifacts

| Artifact | Value | Status |
|---|---|---|
| OpenAPI SHA-256 | `c2c3b874ba6a3a77680e373a67c288b43580e549090c3fbc6075efbd66b84ee8` | unchanged |
| OpenAPI shape | 16 paths / 19 operations / 34 schemas | unchanged |
| Generated client tree hash | `7524fc918629c7b699ff732771940e05c962309be5eeefdfb53123bbe8ecf5a2` | unchanged |
| Database | 33 migrations / 78 tables / 833 columns / 190 CHECKs | unchanged |
| Figma registry | 72 IDs / 72 node rows / 9 tables | unchanged |
| UI03 roots | `261:1290` / `262:1291` / `273:1409` / `279:1504` | unchanged |
| `apps/**`, `packages/*/src/**`, `pnpm-lock.yaml` | — | no diff |

---

## L. Commit A evidence

```text
b968194e0c12dfe406aef480b683da93f1dccbfc
docs(app2): lock Storefront Discover routing
```

8 files changed, 595 insertions(+), 4 deletions(−):

```text
docs/design/FIGMA_DESIGN_INDEX.md                            |  17 ++
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md         |   2 +-
docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md     |   2 +-
docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md   |   1 +
docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md | 77 +++++-
package.json                                                 |   3 +-
tools/check-storefront-route-authority.mjs                    | 266 +++++++++++++++++++++
tools/check-storefront-route-authority.test.mjs               | 231 ++++++++++++++++++
```

---

## M. Validation

Every command below was executed; none is claimed unrun.

| Command | Result |
|---|---|
| `node --test tools/check-storefront-route-authority.test.mjs` | 22/22, run twice |
| `pnpm check:storefront-route-authority` | pass |
| `pnpm check:secrets` | 356 documents / 1710 tracked files |
| `pnpm check:lifecycle` | LC-04, 5 transitions |
| `pnpm check:pagination-authority` + 14 tests | pass |
| `pnpm check:openapi` | artifact up to date |
| `pnpm check:api-client` | tree hash `7524fc91…` |
| `pnpm check:figma-design-index` + 31 tests | 72 IDs / 72 node rows |
| `pnpm db:check:manifest` | 78 tables / 833 columns |
| `node tools/check-file-size.mjs` | pass (both new files under the 400/600 hard limits and under the review thresholds) |
| `pnpm quality` | **exit 0**; tools aggregation 238 → **260 tests, 260 passing** |
| `git diff --check` | clean |

No S01 application or browser test was run or claimed — none exists.

---

## N. Acceptance

All 38 §12 criteria hold. Notable ones:

- clean B04-C1 evidence entry; the blocked S01 attempt created no change; no S01
  correction exists;
- Discover is exactly `/kham-pha`, `/` stays Homepage-owned, no alias approved;
- query key exactly `category`, four fixed slugs recorded;
- S01 cards explicitly non-interactive with no href/click/button/pointer/detail
  affordance required;
- Product Detail route unresolved, `/san-pham/<slug>` proposal only, S02 blocked, four
  UI03 roots unchanged;
- UI02 masonry authority and Figma unchanged; historical and proposal prose preserved;
- next actual decision ID used; roadmap, phase, traceability and registry agree;
- checker and 22 regressions pass; full quality passes;
- no application, OpenAPI, generated-client, database or dependency change;
- two scoped commits, clean tree, nothing pushed, `evidences/` untouched.

---

## O. Handoff to `APP2-S01`

```text
APP2-S01-G01 = COMPLETE — DELIVERED_FOR_REVIEW
APP2-S01     = READY — NOT STARTED
APP2-S01-C1  = NOT_APPLICABLE
APP2-S02     = BLOCKED_BY_UI03_RECONCILIATION
APP2-E01     = BLOCKED_BY_APP2-S01_AND_APP2-S02
APP2-X01     = BLOCKED_BY_APP2-E01
```

S01 now enters with both route gates answered: `STOREFRONT_DISCOVER_ROUTE_GATE` resolves
to `/kham-pha`, and `PRODUCT_CARD_DESTINATION_GATE` resolves to branch **B** — accepted
authority explicitly permits a staged non-interactive card.

Two things S01 still owes that this gate does not supply: the **live UI02 audit** of
`208:2002` / `224:871` / `226:1038` (Figma MCP was unauthenticated during the blocked
attempt, and this gate deliberately did not depend on it), and the masonry decision
itself — 5 / 3 / 2 columns with linear DOM order, which remains a
`BLOCKED_BY_MASONRY_RENDERING_CONTRACT_GAP` risk S01 must resolve on its own evidence.
