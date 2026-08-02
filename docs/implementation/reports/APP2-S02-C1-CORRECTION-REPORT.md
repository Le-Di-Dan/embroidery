# APP2-S02-C1 — Correction report

**Checkpoint:** `APP2-S02-C1` — align the Product Detail mobile layout with the approved
24px/342px authority, and reconcile the framework-defined streamed not-found transport
without weakening public safety or duplicating Product-detail reads.
**Date:** 2026-08-02 · **Branch:** `production` · **Verdict:** `PASS`
**Type:** correction. No application contract changed.

---

## A. Exact S02 A/B entry

```text
APP2_S02_C1_PREFLIGHT = PASS
```

| Check | Result |
|---|---|
| `git branch --show-current` | `production` |
| `git rev-parse HEAD` at entry | `d6b483d0a28cd6d163913640a20bd6561100a064` |
| Entry HEAD subject | `docs(app2): record Storefront Product Detail evidence` (4 files, +420 −5) |
| S02 Commit A | `15eaf96f2f5ce15a0f48c6f7c2e4c59603dfd42d` — unchanged |
| Accepted chain | `4051bb9`, `0d178ed`, `86626b2`, `893e981` unchanged |
| Tracked/staged tree | clean |
| Ignored `evidences/` | untouched |
| Pushed | nothing — 64 ahead of `origin/production` at entry |
| E01/X01 implementation | none |

`pnpm quality` at entry: **exit 0**, 293 tool assertions, all gates green.

## B. Reviewer verdict and the two exceptions

`APP2-S02` was returned `CORRECTION_REQUIRED` because its own report recorded two unmet
acceptance criteria — which is the correct reading: a report cannot certify `PASS` while
listing what it did not meet. The exceptions were §M (mobile band 358px, not 342px) and §E
(streamed not-found answering HTTP 200, not 404). Both are settled here.

## C. Mobile authority mismatch

| | Approved (frame `529:2575`) | Delivered by S02 | Cause |
|---|---|---|---|
| Gutter at 390 | 24px | 16px | APP1 shell `.storefront-shell__main-inner` mobile padding |
| Content width | 342px | 358px | 390 − (16 × 2) |

`APP2-S02-G01-C1` had locked `Mobile description width = 342px content width` and `x = 24px`.
The S02 report argued the shell's gutter was sufficient; the reviewer is right that it is not,
because the locked number is the Product Detail band, not whatever the shell happens to give.

## D. Product Owner streamed not-found ruling

Recorded as **`IMP-D040`**, `LOCKED` — the next actual decision ID after `IMP-D039`.

A data-driven `notFound()` on this streamed route answers **HTTP 200** with a `noindex`
signal. That is framework-defined for a streamed response. It is accepted as
**`SAFE_STREAMED_NOT_FOUND`** only while every condition below holds, and it is **never**
called `HTTP_404`, `exact_404` or `transport_404` anywhere in this repository.

Exact transport stays `FU-APP2-DETAIL-NOT-FOUND-STATUS-01` =
`ROUTED — FRAMEWORK_TRACKING — NONBLOCKING_AFTER_C1`.

**No proxy, middleware or custom-server preflight was added.** Each would force the status by
issuing a second Product-detail read — duplicating the lookup, creating a second
authorization path, and bypassing the request-scoped loader that makes metadata and the page
agree. The cure would be worse than the symptom, and the ruling forbids it explicitly.

## E. Mobile implementation fix

One feature-local rule, scoped below the shell's own threshold:

```scss
$bp-shell-wide: 768px;                       // mirrors the shell's $bp-footer
$detail-mobile-gutter: styles.spacing(24);   // the approved band

@media (max-width: #{$bp-shell-wide - 1px}) {
  .product-detail {
    padding-inline: $detail-mobile-gutter - styles.spacing(16);
  }
  .product-detail__thumbnails {
    width: 100%;
  }
}
```

The inset is written as the arithmetic rather than a literal `8px`, so the intent survives if
the shell's gutter ever moves. The thumbnail rule exists because the strip previously hugged
its content: a two-image gallery measured **140px**, so the "thumbnail viewport" was whatever
the thumbnails happened to be rather than the band. It is now the band, anchored to the
gutter as the frame draws it, and a longer row scrolls inside it.

The APP1 shell is **not** modified. The lightbox is unaffected — its scrim is
`position: fixed` and belongs to the viewport, not the page band.

## F. Computed 390px geometry

Measured from real layout boxes in the production browser run, not from the stylesheet:

| | Before (S02) | After (C1) | Required |
|---|---|---|---|
| Left gutter | 16 | **24** | 24 |
| Right gutter | 16 | **24** | 24 |
| Content width | 358 | **342** | 342 |
| Story | 358 | **342** | 342 |
| Media stage | 358 | **342** | 342 |
| Thumbnail viewport | 140 | **342** | 342 |
| Breadcrumb / identity / Continue Discover | 358 | **342** | ≤ 342 |
| Document horizontal overflow | none | **none** | none |

The route-local state surfaces were measured on their own visits and use the same band:
*media empty* `{left: 24, content: 342}`, *description absent* `{left: 24, content: 342}`.

Story height remains natural — no clamp, no fixed height, `clamped: false`.

## G. Desktop and tablet non-regression

Both viewports were re-run in full. The story measure stays at the 640px cap, the band still
comes from the shell unchanged, controls meet 44px, and there is no horizontal overflow. The
mobile rule cannot reach them: it lives inside `@media (max-width: 767px)`.

## H. `SAFE_STREAMED_NOT_FOUND` implementation

No application change was required — the delivered route already satisfied the ruling, which
this correction **measured rather than assumed**. `generateMetadata` raises `notFound()` as
soon as the loader reports not-found, so no Product title, description or canonical is ever
produced; the page component throws before emitting markup, so no Product name, price, media
address or category can appear in the body; and Next's own streamed not-found path supplies
the `noindex` marker.

What changed is the evidence: the smoke now records all six safety facts per cause instead of
summarising them, and computes a fingerprint per case so "indistinguishable" is proven rather
than asserted.

## I. Five-case not-found matrix

Every case, measured in the production run with JavaScript disabled:

| Cause | Status | Approved surface | `noindex` | Product canonical | Product metadata | Product data | Raw cause |
|---|---|---|---|---|---|---|---|
| unknown slug | 200 | ✅ | ✅ | absent | absent | absent | absent |
| `DRAFT` | 200 | ✅ | ✅ | absent | absent | absent | absent |
| `ARCHIVED` | 200 | ✅ | ✅ | absent | absent | absent | absent |
| non-public category | 200 | ✅ | ✅ | absent | absent | absent | absent |
| malformed slug | 200 | ✅ | ✅ | absent | absent | absent | absent |

```text
the five causes are indistinguishable to a public caller :: {"distinctFingerprints":1}
MEASURED transport :: {"measuredStatus":[200],"classification":"SAFE_STREAMED_NOT_FOUND",
                       "note":"not an HTTP 404; framework-defined streamed transport (next@16.2.10)"}
```

A malformed slug still makes **no** Product API call — the shared contract predicate rejects
it before the loader reaches the client, proven in Jest.

## J. `noindex`, canonical and metadata evidence

Read directly from the response head:

```text
<meta name="robots" content="noindex"/>
```

No `<link rel="canonical">` of any kind. The `<title>` is the generic root-layout title, so a
hidden Product's name never reaches the tab, the history entry or a crawler's index. No
`"slug":`, `"isDisplayOutOfStock"` or `catalog-preview` string appears anywhere in the body.

## K. Durable visibility and media 404

```text
published detail and its media are both live before the change   (detail 200, media 200)
fixture state changed directly to DRAFT (not a B03 command)
the very next request is SAFE_STREAMED_NOT_FOUND — nothing was cached
the old media address 404s too                                    (real HTTP 404)
no Storefront route cache preserved the Product content
```

The **media** endpoint returns a genuine HTTP 404 — the API is unaffected by the streaming
transport. Request-scoped deduplication is preserved and re-measured: `delta: 1` backend
detail read per page view, counted from the API's own access log.

## L. Authority, decision and follow-ups

- `IMP-D040` — `LOCKED`, next actual ID, no prior decision renumbered.
- Phase plan **§6.2.4** — new ruling block with an eight-row machine-checked fact table.
- Roadmap and traceability updated to the corrected status.
- The original `APP2-S02` completion report keeps its body **unchanged** and gains a
  superseding banner naming this report as the current evidence.

```text
FU-APP2-DETAIL-NOT-FOUND-STATUS-01 = ROUTED — FRAMEWORK_TRACKING — NONBLOCKING_AFTER_C1
FU-APP2-STOREFRONT-CONTENT-BAND-01 = ROUTED — NONBLOCKING_FOR_APP2-S02
FU-APP1-SHELL-BRAND-TOUCH-TARGET-01 = ROUTED — NONBLOCKING_FOR_APP2-S02
```

## M. Checker and regression evidence

New gate `pnpm check:storefront-product-detail-correction`
(`tools/check-storefront-product-detail-correction.mjs`, 248 lines) — a sibling of the
authority checker, which sits at its 400-line limit; the split is by responsibility, and this
module owns exactly the two corrected facts. Wired into `pnpm quality`.

**19 regressions.** They fail when 342px drifts to 358px, 24px drifts to 16px, the mobile
column is described as filling the shell width, the classification becomes `HTTP_404`, the
forbidden vocabulary appears in prose, `noindex` becomes optional, a Product canonical becomes
permitted, a duplicate proxy lookup is written into authority (table or prose), the framework
follow-up is marked `RESOLVED`, `IMP-D040` is unlocked or removed, the decision stops
forbidding fabrication, or the ruling block disappears.

**One narrowing worth recording.** The first version treated the forbidden vocabulary as
label-escapable, and the ruling's own sentence — *"must never be called `HTTP_404`…"* — then
tripped its own rule, while a violation reading *"a transport_404 response … not a choice
made here"* escaped through the word "not". The literal tokens are now a violation whenever
they *name* the response and legitimate only on a line that *prohibits* them. A gate that
fires on its own definition gets deleted; one that misses the real case is worse.

Existing gates re-run green: `check:storefront-product-detail-authority` (34),
`check:storefront-route-authority` (21), `check:pagination-authority` (14),
`check:figma-design-index` (31).

## N. Shell ownership

The APP1 shell is untouched — asserted structurally: its mobile `spacing(24) spacing(16)` and
wide `spacing(32) spacing(24)` padding rules are both still present, and the boundary test
mirrors the shell's `$bp-footer: 768px` so the two constants cannot drift apart silently.

- **Off-canvas skip link** — a keyboard affordance, excluded from the touch-target
  measurement by design.
- **Visible brand link** — pre-existing shell ownership, recorded as
  `FU-APP1-SHELL-BRAND-TOUCH-TARGET-01` and not changed here.
- Every control owned by `.product-detail` meets 44px, including the breadcrumb crumbs.

## O–P. Production smoke, cleanup and restoration

`pnpm smoke:app2-s02-detail:production` — **run twice after the final change, identical:
104/104 browser scenarios + 24/24 orchestration, exit 0.**

```text
production Storefront + API images, disposable TLS PostgreSQL (ssl=on), private MinIO, real gateway
no development source bind mounts remain :: {"apiMounts":0,"storefrontMounts":0}
restored runtimes are the development ones :: {"api":"development","storefront":"development","storefrontMounts":3}
no temporary residue :: {"residualImages":0,"residualContainers":0,"temporaryDirectoryRemoved":true}
```

Fixtures are seeded into the disposable copy only, and the DRAFT transition is described as
what it is — a direct fixture mutation, never a `APP2-B03` command.

## Q. Frozen artifacts

```text
OpenAPI          c2c3b874ba6a3a77680e373a67c288b43580e549090c3fbc6075efbd66b84ee8
Shape            16 paths / 19 operations / 34 schemas
Generated client 7524fc918629c7b699ff732771940e05c962309be5eeefdfb53123bbe8ecf5a2
Database         33 migrations / 78 tables / 833 columns / 190 CHECKs
Figma registry   86 IDs / 86 node rows / 11 tables
```

`apps/api`, `apps/admin`, `apps/worker`, database/schema/migrations, OpenAPI, the generated
client, object storage, tracked Nginx/Compose, the APP1 shell source, S01 masonry/card
behaviour and `pnpm-lock.yaml` are all untouched.

## R. Commit C evidence

```text
38ea1ce3d86d03b36cdf175cf4437da2383059c6
fix(storefront): align Product Detail mobile authority
14 files changed, 851 insertions(+), 35 deletions(-)
```

| File | Δ |
|---|---|
| `apps/storefront/src/features/product-detail/styles/product-detail.scss` | +30 |
| `apps/storefront/test/boundary/product-detail-mobile-band.test.ts` | +85 (new) |
| `apps/storefront/test/boundary/product-detail-source.test.ts` | ±13 |
| `apps/storefront/test/smoke/product-detail-page.test.tsx` | +26 |
| `tools/check-storefront-product-detail-correction.mjs` | +248 (new) |
| `tools/check-storefront-product-detail-correction.test.mjs` | +229 (new) |
| `tools/smoke-app2-s02-detail-browser.mjs` | +149 −35 |
| `tools/smoke-app2-s02-detail-fixtures.mjs` | +35 |
| `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` | +1 (IMP-D040) |
| `docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md` | +51 (§6.2.4) |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | ±1 |
| `docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md` | ±1 |
| `docs/implementation/reports/APP2-S02-COMPLETION-REPORT.md` | +11 (banner only) |
| `package.json` | ±3 |

## S. Validation

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/storefront lint` | clean |
| `pnpm --filter @embroidery/storefront typecheck` | clean |
| `pnpm --filter @embroidery/storefront test` | 25 suites / **231** tests |
| `pnpm --filter @embroidery/storefront build` | `ƒ /san-pham/[slug]` |
| focused S02 + C1 suite ×2 | **113 / 113**, twice |
| `check:storefront-product-detail-correction` + 19 regressions | pass |
| `check:storefront-product-detail-authority` + 34 | pass |
| `check:storefront-route-authority` + 21 | pass |
| `check:pagination-authority` + 14 · `check:lifecycle` · `check:secrets` | pass |
| `check:figma-design-index` + 31 | pass — 86/86/11 |
| `check:styles` / `check:frontend-boundaries` / `check:e2e` | pass |
| `check:openapi` / `check:api-client` / `db:check:manifest` | pass — hashes unchanged |
| `node tools/check-file-size.mjs` | pass |
| production detail smoke ×2 | **104/104 + 24/24**, twice |
| `pnpm quality` | **exit 0** — 312 tool assertions |
| `git diff --check` | clean |

## T. Acceptance

All 60 criteria met.

The two that returned S02 are now satisfied on their own terms: the mobile band measures
24/24/342 in a real browser (criteria 5–13), and the streamed transport is disclosed honestly
as a measured 200 classified `SAFE_STREAMED_NOT_FOUND`, with every safety condition proven per
cause and no response anywhere described as an HTTP 404 (criteria 18–31). No proxy or
middleware duplicate lookup was added (32), page/metadata dedupe is preserved (33), and the
exact-404 follow-up remains routed (34).

```text
VERDICT = PASS
APP2-S02-C2 = MUST_NOT_BE_CREATED
```

## U. Handoff to `APP2-E01` / `APP2-X01`

```text
APP2-S02   = COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW
APP2-S02-C2 = MUST_NOT_BE_CREATED
APP2-E01   = READY — NOT STARTED
APP2-X01   = BLOCKED_BY_APP2-E01

FU-APP2-DETAIL-NOT-FOUND-STATUS-01 = ROUTED — FRAMEWORK_TRACKING — NONBLOCKING_AFTER_C1
FU-APP2-STOREFRONT-CONTENT-BAND-01 = ROUTED — NONBLOCKING_FOR_APP2-S02
FU-APP1-SHELL-BRAND-TOUCH-TARGET-01 = ROUTED — NONBLOCKING_FOR_APP2-S02
```

`APP2-E01` inherits both public surfaces joined by a real card link, a production harness that
seeds disposable fixtures and drives a real browser through the gateway, and a not-found
contract stated in terms it can assert against — `SAFE_STREAMED_NOT_FOUND`, not a status code
the framework does not currently emit.
