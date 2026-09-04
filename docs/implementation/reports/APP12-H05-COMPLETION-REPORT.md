# APP12-H05 — Performance and Core Web Vitals Measurement (Wave 1)

> ## Correction notice — superseded verdict
>
> **`APP12-H05` = `COMPLETE_AFTER_C1`.** The Product Owner accepted this
> measurement and authorised `APP12-H05-C1`, which closed the one blocking
> finding: `H05-02`, the desktop grid CLS on Discover, filtered Discover and the
> Gallery feed.
>
> C1 published `asset_derivatives.width_px` / `height_px` on the existing public
> Product and Gallery media projections and consumed them as `<img width height>`
> in the two grids. Remeasured over 11 cold runs per surface:
>
> | Surface (desktop) | here | after C1 |
> |---|---|---|
> | Discover | median 0.0625, 3/11 over 0.10 | **median 0.0008, 0/11 over** |
> | Discover filtered | median 0.0625, 3/11 over 0.10 | **median 0.0007, 0/11 over** |
> | Gallery feed | median 0.0538, 3/11 over 0.10 | **median 0.0001, 0/11 over** |
>
> `FU-APP12-H05-01` is `CLOSED_BY_APP12_H05_C1`. `FU-APP12-H05-02`, `-03` and
> `-04` are routed to `APP12-V02`; `FU-APP11-B03-02` remains with
> `FU-APP12-H02-05`.
>
> **Everything below is the original H05 measurement evidence and is unchanged.**
> The `BLOCKED_PERFORMANCE` verdict in §A was correct when written and is
> superseded by this notice, not rewritten.
>
> See `docs/implementation/reports/APP12-H05-C1-COMPLETION-REPORT.md`.


## A. Verdict

```text
APP12-H05       = BLOCKED_PERFORMANCE
CORRECTION_USED = 0 / 1
PUSHED          = false
```

Everything H05 was asked to measure was measured, on a production-mode
Kubernetes staging deployment behind the real Gateway and TLS, against a
representative Wave-1 catalog. Three of the four `PO-APP12-005` thresholds pass
with very large margin on every surface. One customer-critical breach was found,
mechanically explained, fixed inside H05 and remeasured green. The verdict is
`BLOCKED_PERFORMANCE` for a single remaining reason, stated plainly:

| Metric | Threshold | Worst customer-critical median | Outcome |
|---|---|---|---|
| LCP | ≤ 2 500 ms | 364 ms | **PASS**, 6.9× margin |
| CLS | ≤ 0.10 | 0.0625 | **See below** |
| INP | ≤ 200 ms | 24 ms | **PASS**, 8.3× margin |
| TTFB | ≤ 800 ms | 15.4 ms | **PASS**, 52× margin |

**Why this is `BLOCKED_PERFORMANCE` and not `COMPLETE`.** CLS on the three
image-led desktop surfaces — Discover, filtered Discover and the Gallery feed —
is *bimodal and straddles the threshold*. Over 11 laboratory runs each, the
median is 0.054–0.063 (passing) but 3 of 11 runs on every one of them exceed
0.10, with maxima of 0.107–0.115. The p75 the metric is defined against
therefore sits essentially **on** the threshold rather than under it, and these
are lab measurements on a loopback network where images arrive *sooner* than in
the field — so the real-world value of this particular metric can only be worse
than what is reported here, never better (§C).

The root cause is identified mechanically, not guessed (§H): card and cover
`<img>` elements carry no intrinsic dimensions and no reserved box, so each grid
grows as its images arrive and displaces content that was already visible. The
canonical fix is to publish the derivative dimensions the schema *already
stores* (`asset_derivatives.width_px` / `height_px`) so the browser can reserve
the true per-image box without cropping anything. That spans the public API
contract, the OpenAPI artifact, the generated client and both grids — which §3
excludes from H05 as not H05-local and §24 freezes as a baseline. Inventing a
fixed aspect ratio instead was tested and is both design-forbidden (UI02/UI05)
and, measured, ineffective (§R).

A fourth breach — Admin order detail, CLS 0.1316 on **11 of 11** runs — is a
genuine deterministic threshold breach, but on an operator surface rather than a
customer-critical one, so it does not itself drive the release gate (§Q).

Reported honestly rather than argued to a PASS: the medians pass, and a report
that stopped at the medians would have been entitled to claim one. The variance
is what makes that claim unsafe, and §21 permits near-threshold acceptance only
on explicit variance evidence — which, having gathered it, does not support
acceptance.

---

## B. H04 PO closure authority

Carried forward exactly as the Product Owner directed, and acted on nowhere
else:

```text
APP12-H04-C1 = COMPLETE — PO PASS
APP12-H04    = COMPLETE_AFTER_C1
CORRECTION_USED = 1 / 1 for H04
```

H04 was **not** reopened. No H04 or H04-C1 report was edited, for wording
reconciliation or for anything else — `git status` in §U shows neither file
touched. The phase roadmap's status table was updated, because it is the
delivery status ledger rather than an H04 report and the phase/checkpoint model
requires exactly one `NEXT`: `APP12-H04` → `COMPLETE_AFTER_C1`, `APP12-H04-C1` →
`COMPLETE`, `APP12-H05` → `NEXT`, and the historical `BLOCKED_RESILIENCE` label
removed from the correction line per the PO verdict that supersedes it.

No H04 fault rehearsal was re-run. The two Gateway transport items stay external
in `FU-APP12-H02-05` and were not chased (§T).

---

## C. Measurement methodology

```text
LAB_MEASUREMENT
NOT_FIELD_CRUX
```

Stated first because it bounds every number that follows. These are laboratory
measurements from one machine against a single-node cluster on the loopback
interface. They are repeated to expose variance and identify stable regressions,
which is what §2 asks for. They are **not** field p75 telemetry and no
percentile claim is made from them beyond what 3–11 samples can carry.

### Environment

```text
cluster        minikube profile embroidery-h05, Kubernetes v1.31.4, docker driver
               6 CPU / 12 GiB, single node
gateway        Gateway API v1.2.1 CRDs + NGINX Gateway Fabric v1.6.1
tls            per-run self-signed certificate for *.embroidery.local; staging simulation,
               NOT evidence of a production certificate
images         embroidery/{api,worker,storefront,admin} built --target runner from
               RELEASE_SHA 2d16c971ef78, deployed by immutable tag
database       disposable PostgreSQL 16.14, TLS on, emptyDir, embroidery_db7_h02_staging
object store   disposable MinIO, emptyDir
observability  the DELIVERED H03 metrics endpoint (embroidery-api-metrics :9464).
               No dashboard was added, changed, or rebuilt (§22)
browser        real Chromium via Playwright 1.61.1
host hygiene   the shared development compose stack was STOPPED for the duration so it
               could not contend for CPU, and restarted at teardown (§W)
```

The staging overlay was pinned to the release tag to deploy and **reverted to its
committed `REPLACE_WITH_IMMUTABLE_RELEASE_REF` placeholders** afterwards; the
repository carries no deployment-time tag (§U).

### The transport in front of the application, disclosed

Docker Desktop does not expose the minikube node IP to the Windows host, so a
thin TCP forwarder (`socat`, on the cluster network, published on 127.0.0.1:443)
carries bytes from the browser to the Gateway NodePort. It terminates nothing —
TLS is still terminated by the real Gateway, and SNI still selects the listener.
Its cost is visible and small: §M shows browser-observed API latency of 9–57 ms
against server-side durations of 1.3–5.2 ms mean, so everything above ~5 ms in a
client-observed figure is transport, not the application.

### What is captured, and precisely what each number means

Captured in-page by `PerformanceObserver`, so the measurement is the browser's
own (`packages/e2e-testing/support/app12/h05-cwv-probe.mjs`):

- **TTFB** — `responseStart - requestStart` on the navigation entry. Server
  think-time plus network, deliberately *not* `startTime`-relative, which would
  fold redirect and connection setup into a server metric.
- **LCP** — the **last** `largest-contentful-paint` entry before the page is
  frozen, which is the metric's definition. Taking the first would report a text
  placeholder an image later replaced.
- **CLS** — the largest **session window** of input-less `layout-shift` entries,
  1 s gap, 5 s cap. Summing every shift instead would over-report long pages.
- **INP** — the worst `event` entry duration after one real interaction. With a
  single interaction this is that interaction's latency, not a p98 over many, and
  it is labelled as such. Where no interaction control exists on a surface, INP
  is reported **`n/a`**, never `0` (§I) — §9 forbids reporting INP from a page
  where no interaction occurred.
- **Payload** — from Resource Timing `transferSize`, not from response bodies.
  This distinction decided the cache verdict and is explained in §P.

### Repetition

Per §10: **1 warm-up, then 3 measured runs**, each in a brand-new browser context
so it is genuinely cold. min / median / max are reported. Where variance proved
materially high — the CLS surfaces — the sample was raised to **11** and that
larger sample is what the verdict rests on (§H).

---

## D. Fixture / data representativeness

`APP12-H05` §5 forbids measuring an image-free catalog and calling the result
production performance. A dedicated measurement fixture was therefore written:

```text
packages/e2e-testing/support/app12/h05-performance-fixture.mjs   catalog + gallery + media
packages/e2e-testing/support/app12/h05-media-generator.mjs       the imagery itself
```

Seeded into the **disposable** `embroidery_db7_h02_staging` and its disposable
MinIO. `seedH05PerformanceFixture` refuses outright any database not named
`embroidery_db7_*`, so `VALIDATION_GOVERNANCE.md` §3A.4 is enforced rather than
remembered. Every business key carries the `app12-h05-perf` prefix. **No
`APP12-G03` data was created** — G03 owns the persistent authored dataset under
its own authority and nothing here anticipates it.

Mechanically confirmed present:

```text
published dynamic categories      4    (+1 pre-existing seed category)
published products               48    across all four, largest holds 22
published gallery entries        31
product media associations      192    1 THUMBNAIL + 3 GALLERY per product
gallery media associations       93    3 per entry
storage objects                 570    real WebP in the disposable bucket
Ready-Made SKU projection       384    SKUs with real stock anchors, 8 variants/product
Admin queue rows                 14    Ready-Made orders created through the REAL public API
                                       6 AWAITING_PAYMENT (6 PENDING FULL obligations)
                                       8 AWAITING_SHIPPING_FEE
ORDER_ACCESS grants              14    live
```

The counts are not arbitrary. Discover paginates at 20 and the gallery feed at
12, so a smaller fixture would have measured an unpaginated list and §17 could
not have been answered at all. Every measured list crosses its own page boundary
with a continuation to exercise.

### The imagery was calibrated, and that mattered

Payload numbers are decided by how compressible the source is, so an
uncalibrated source silently decides the verdict. Both extremes were measured
before a constant was chosen:

```text
smooth gradient       800px ≈  11 KiB    1600px ≈   26 KiB   understates everything
unstructured noise    800px ≈ 256 KiB    1600px ≈ 1022 KiB   incompressible, fabricates a failure
chosen calibration    800px ≈  82 KiB    1600px ≈  304 KiB   photographic range
```

The **first run of this fixture used the noise field** and produced a 1 MB
catalog-preview. Those numbers were discarded rather than reported: a payload
failure manufactured by the fixture is the `FALSE_POSITIVE` §19 names, and it
would have said nothing about the application. The delivered generator uses
low-frequency structure plus a bounded noise term, and the live derivative
distribution confirms the calibration held:

```text
THUMBNAIL         n=285   min 79 KiB   avg 82 KiB    max 84 KiB
CATALOG_PREVIEW   n=285   min 284 KiB  avg 304 KiB   max 313 KiB
```

### One fixture defect the live system caught

The first seeding produced a 200-response Product Detail with `media: []` and a
404 on every image route. Catalog media and gallery media do **not** share an
asset classification: `PRODUCT_MEDIA_ASSET_CLASSIFICATION` is
`PRODUCTION_SENSITIVE` (the *original* is not public; only the WebP derivative
is served) while `GALLERY_ENTRY_ASSET_CLASSIFICATION` is `PUBLIC`. Both delivery
repositories compare the column exactly. The fixture now carries the mapping
explicitly, and the failure mode is recorded in it so the next author does not
rediscover a silently image-free catalog.

### Orders use the real path, with one disclosed exception

The 14 orders were created by `POST /api/public/ready-made-orders` and advanced
by `PUT /api/admin/orders/:id/shipping-detail` — real endpoints, real
transactions — so the Admin queue holds rows the application produced. The one
step that cannot run here is code entry: the delivered notification channel
records the plaintext in the worker's own memory and writes it to no row and no
log, which is correct and is why no debug endpoint exists. H05 does not measure
the verification journey, so the verified `SUBMISSION` challenge is written
directly into the disposable database and everything downstream of it runs on
the real path. Stated rather than glossed.

---

## E. Public route matrix

Every active Wave-1 public route was measured. Customer-critical surfaces carry
both viewports (1440×900 desktop, 390×844 mobile); content pages are desktop
only, per §8.

Median of 3 cold runs. Payload is transferred bytes.

| Surface | Route | VP | TTFB | LCP | CLS | INP | Req | Cold | Warm |
|---|---|---|---|---|---|---|---|---|---|
| Home | `/` | D | 9.6 | 136 | 0.0001 | 16 | 91 | 2 331 K | 769 K |
| Home | `/` | M | 7.7 | 128 | 0.0000 | n/a | 28 | 1 332 K | 763 K |
| Discover | `/kham-pha` | D | 14.6 | 132 | 0.110 | 16 | 142 | 3 771 K | 1 724 K |
| Discover | `/kham-pha` | M | 12.8 | 92 | 0.0000 | 16 | 96 | 3 565 K | 1 698 K |
| Discover filtered | `/kham-pha?category=…` | D | 14.5 | 132 | 0.110 | 16 | 126 | 3 346 K | 1 719 K |
| Discover filtered | `/kham-pha?category=…` | M | 13.4 | 112 | 0.0000 | 16 | 97 | 3 315 K | 1 694 K |
| Product Detail | `/san-pham/[slug]` | D | 11.7 | 364 | 0.0001 | 24 | 28 | 2 109 K | 1 235 K |
| Product Detail | `/san-pham/[slug]` | M | 10.3 | 92 | 0.0000 | 16 | 23 | 1 806 K | 1 232 K |
| Checkout | `/mua-hang/[slug]?sku=…` | D | 15.2 | 124 | 0.0000 | 16 | 32 | 883 K | 313 K |
| Checkout | `/mua-hang/[slug]?sku=…` | M | 15.4 | 140 | 0.0000 | 16 | 18 | 872 K | 310 K |
| Gallery feed | `/bo-suu-tap` | D | 14.6 | 128 | 0.107 | 16 | 80 | 2 602 K | 1 018 K |
| Gallery feed | `/bo-suu-tap` | M | 13.2 | 92 | 0.0000 | 16 | 61 | 2 587 K | 1 011 K |
| Gallery entry | `/bo-suu-tap/[slug]` | D | 7.6 | 72 | 0.029 | 16 | 24 | 1 497 K | 926 K |
| Gallery entry | `/bo-suu-tap/[slug]` | M | 8.8 | 84 | 0.0000 | 16 | 46 | 2 539 K | 924 K |
| Secure order | `/truy-cap/don-hang` | D | 8.8 | 132 | 0.022 | 16 | 54 | 1 405 K | 23 K |
| Secure order | `/truy-cap/don-hang` | M | 7.0 | 116 | 0.0000 | 16 | 42 | 1 394 K | 15 K |
| Services | `/dich-vu` | D | 9.0 | 132 | 0.0000 | n/a | 16 | 526 K | 15 K |
| FAQ | `/cau-hoi-thuong-gap` | D | 8.6 | 132 | 0.0000 | 16 | 22 | 530 K | 19 K |
| Store | `/cua-hang` | D | 8.6 | 124 | 0.0000 | n/a | 18 | 526 K | 15 K |
| Policy — returns | `/chinh-sach/doi-tra` | D | 8.1 | 160 | 0.0000 | n/a | 16 | 525 K | 15 K |
| Policy — privacy | `/chinh-sach/bao-mat` | D | 8.6 | 128 | 0.0000 | n/a | 16 | 525 K | 15 K |

```text
measured_surfaces  = 21  (13 routes; 8 of them at both viewports)
HTTP status        = 200 on every run of every surface
blocking_surfaces  = 0 on LCP / INP / TTFB
                     3 near-threshold on CLS (Discover, Discover filtered, Gallery feed — desktop)
```

Wave-2 Editor routes were **not** measured; they belong to later Wave-2
checkpoints (§6). The Wave-2 routes are withheld by `src/proxy.ts` in this
configuration in any case.

### Two surfaces that needed correcting before they measured anything

- **Checkout** first measured the *refusal* state. `/mua-hang/[slug]` without a
  valid selection correctly renders "Lựa chọn của bạn không còn hợp lệ" and has
  no form at all, so the first pass measured a page with nothing on it and would
  have reported a flattering number for a surface it never loaded. It is now
  measured at `?sku=<id>&quantity=1`, which renders the real checkout form, and
  the INP interaction is a real form control.
- **Filtered Discover** had no interaction: the selector looked for a
  `?page=2` link and the list uses opaque keyset cursors, so nothing was clicked
  and INP would have been reported as `0` from a page where nothing happened. It
  now interacts with a real category-nav link.

---

## F. Admin route matrix

Representative critical Wave-1 Admin workloads, on the supported desktop
authority (§7/§8). Where several routes share a layout and data pattern one
representative was measured; product publication and the SKU detail are included
because they differ materially from their list pages.

| Surface | Route | TTFB | LCP | CLS | INP | Req | Cold | Warm |
|---|---|---|---|---|---|---|---|---|
| Dashboard | `/` | 10.4 | 60 | 0.0000 | 16 | 38 | 297 K | 18 K |
| Products list | `/products` | 18.4 | 120 | 0.0000 | 16 | 66 | 323 K | 41 K |
| Product editor | `/products/[id]` | 10.1 | 68 | 0.0000 | 16 | 67 | 321 K | 24 K |
| Product publication | `/products/[id]/publication` | 9.6 | 140 | 0.0000 | 16 | 41 | 297 K | 23 K |
| Categories | `/categories` | 9.3 | 104 | 0.0058 | 16 | 36 | 294 K | 20 K |
| Orders queue | `/orders` | 11.6 | 104 | 0.0000 | 16 | 63 | 347 K | 36 K |
| Ready-Made order detail | `/orders/[id]` | 10.5 | 148 | **0.1316** | 16 | 50 | 334 K | 23 K |
| Inventory SKU | `/kho/skus/[id]` | 10.6 | 168 | 0.0000 | 24 | 40 | 303 K | 21 K |
| Production queue | `/san-xuat` | 10.4 | 164 | 0.0000 | 16 | 57 | 313 K | 19 K |
| Gallery list | `/gallery` | 10.3 | 60 | 0.0000 | 16 | 81 | 2 225 K | 1 690 K |

```text
measured_surfaces  = 10   of the 26 Admin routes
blocking_surfaces  = 0    (1 threshold breach, on an operator surface — see §Q)
```

Payment verification and fulfilment are reached from the Ready-Made order detail
rather than from routes of their own, so that surface stands for all three; it
is also the one with the finding. Admin is uniformly fast: TTFB ≤ 18.4 ms, LCP
≤ 168 ms, every page under 350 KiB except the image-led gallery list.

### The Admin matrix could not run at first, and the cause was mine

The first two attempts failed at sign-in: the form reported its generic network
error while issuing **no HTTP request at all**, though a raw same-origin `fetch`
from the very same page returned `204`. Chased to the shipped bundle rather than
guessed at, the inlined base URL read:

```text
baseUrl: "C:/Program Files/Git/api"
```

Git Bash had rewritten the `--build-arg NEXT_PUBLIC_API_BASE_PATH=/api` POSIX
path into a Windows path before Docker ever saw it, so
`createBrowserApiClient`'s same-origin guard correctly refused it and the
failure was caught and shown as a network error. **This is a defect in the
measurement harness, not in the application.** Both Next images were rebuilt
with the conversion suppressed, and the deployed bundle now reads `"/api"` and
signs in normally. It is recorded here because it is exactly the false positive
§19 warns about — "the Admin cannot log in" would have been a spectacular and
completely wrong Wave-1 finding.

A second harness fault surfaced alongside it: `minikube image load` does not
replace an image already present under the same tag, so the first redeploy kept
serving the old bundle and the fix appeared not to work. The rebuilt images were
deployed under a distinct immutable tag, and the running pod's bundle was
verified directly before any measurement was believed.

---

## G. LCP

```text
threshold                 2 500 ms
worst customer-critical     364 ms   Product Detail, desktop
worst overall               412 ms   Admin products list (one run of three)
best                         60 ms
verdict                    PASS on every surface, with ≥ 6× margin
```

The LCP element was identified on every surface rather than assumed. On
image-led pages it is an `<img>` (a card thumbnail on Discover and the Gallery
feed, the stage image on Product Detail); on content and checkout pages it is
text (`H1`, `P`, `LI`).

Variance is real but immaterial against this threshold: Product Detail desktop
measured `[364, 368, 104]` ms and Admin products list `[412, 76, 120]` ms — a
spread that would matter at 2 500 ms and does not at 400.

### A finding that does not breach, and is still worth carrying

On Home and Discover **every** card image is `loading="lazy"`, including the
ones above the fold, and none carries `fetchpriority`. On Discover the measured
LCP element *is* one of those lazy images. That is precisely the "lazy-loaded
LCP image" §13 asks to detect. It does not breach here because the loopback
network delivers an 82 KiB thumbnail in a few milliseconds; on a real connection
the lazy attribute defers the LCP candidate behind layout and would cost real
time. Classified `LOW_PRIORITY` **only** because the lab cannot demonstrate the
cost, not because the pattern is right (§Q, `FU-APP12-H05-02`).

---

## H. CLS — the metric that decides this checkpoint

### Result, on 11 runs each

| Surface | min | median | max | runs > 0.10 |
|---|---|---|---|---|
| Home, desktop | 0.0001 | 0.0001 | 0.0001 | 0 / 11 |
| **Product Detail, desktop** (after fix) | 0.0001 | **0.0002** | 0.0465 | **0 / 11** |
| Discover, desktop | 0.0383 | 0.0625 | 0.1103 | 3 / 11 |
| Discover filtered, desktop | 0.0469 | 0.0625 | 0.1150 | 3 / 11 |
| Gallery feed, desktop | 0.0217 | 0.0538 | 0.1067 | 3 / 11 |
| Admin order detail | 0.1316 | 0.1316 | 0.1413 | **11 / 11** |
| Every mobile surface | 0.0000 | 0.0000 | 0.0002 | 0 / 11 |

Mobile is clean throughout: at 390 px the single-column layout puts the growing
content below the fold-line, so nothing already visible is displaced.

### The breach that was fixed: Product Detail, 0.4086 → 0.0002

Measured at **0.4086**, four times the threshold, on two of three runs. The
cause was traced by sampling element geometry every animation frame rather than
inferred:

```text
t =  87 ms   main h=432   stage h=320   thumbnails/identity/purchase h=0 (not yet revealed)
t = 127 ms   main h=432   fonts loaded, layout unchanged
t = 359 ms   main h=1768  stage h=662   thumbnails h=64  identity h=151  purchase h=368
```

`loading.tsx` puts this route behind a streaming Suspense boundary, so the
browser paints the shell plus `DetailLoading` first and swaps the resolved page
in afterwards. `main` grows 432 → 1768 px at the swap, and the store-presentation
block and footer — both *visible* at y=504 and y=837 in a 900 px viewport — are
pushed 1 336 px down and out of view. The `layout-shift` API reports those
sources with a zero current rect, which reads like removal and is in fact
displacement out of the viewport; the frame-by-frame trace is what distinguished
the two.

The fix (§R) reserves a viewport for the loading segment, so there is nothing
below the fold-line left to displace. Remeasured: **0 / 11 runs over threshold,
median 0.0002.**

### The breaches that remain: image-led grids

Same measurement technique, different mechanism. On Discover:

```text
t =  43 ms   .discover h=577    continuation y=632   store-presentation y=713   images complete  0/20
t =  98 ms   .discover h=931    continuation y=986                              images complete  7/20
t = 144 ms   .discover h=1422   continuation y=1477  store-presentation y=1558  images complete 19/20
```

The grid grows 577 → 1 422 px as the 20 card images arrive, displacing the
continuation control and the store-presentation block by 845 px. The Gallery
feed behaves identically: masonry 539 → 2 011 px as 12 covers load, continuation
pushed from y=796 to y=2 268.

The cause is in the delivered markup and its own comments acknowledge the
trade-off: the cards render a plain `<img>` with `loading="lazy"` and **no
`width`, no `height` and no CSS `aspect-ratio`**, because `APP2-B04` and
`APP11-B03` publish no derivative dimensions and a fabricated ratio would crop
every artwork into a uniform grid, which UI02 and UI05 forbid.

Both CSS-only mitigations were tested rather than assumed, and both failed:

```text
.discover__card-media { min-height: 320px }          0.115 / 0.100 / 0.115   worse than baseline
.gallery-feed__masonry { min-height: 100svh }        0.056 median, 3/7 over  no improvement
.discover__grid,.discover__results{min-height:100svh} 0.084 median, 0/7 over  max improved, median worse
```

Over-reserving simply trades a downward shift for an upward one. The fix that
actually works is the one the schema is already ready for — publish
`asset_derivatives.width_px` / `height_px` on the public media projection so each
`<img>` can carry its true intrinsic size and reserve its own correct box, with
no cropping and no invented ratio. That touches the public contract, the OpenAPI
artifact, the generated client and both grids: not H05-local (§3), and against
the §24 baseline freeze. It is routed as `FU-APP12-H05-01`.

### Admin order detail: deterministic, and not customer-facing

11 of 11 runs at 0.1316–0.1413, with a single shift at ~170 ms. Traced to the
card set changing after hydration:

```text
t = 151 ms   Thông tin đã chốt h=258 | Dòng hàng h=226 | Giao hàng h=115
t = 183 ms   Thông tin đã chốt h=346 | Dòng hàng h=226 | Phí giao hàng h=501 | Thanh toán h=312 | Giao hàng h=115
```

Two cards (shipping fee, payment) are inserted mid-page and a third grows by
88 px, pushing everything below. Client-fetched Admin panels landing after first
paint. Real, deterministic, and on an operator workbench rather than a customer
journey.

---

## I. INP

```text
threshold                200 ms
worst measured            24 ms   Product Detail desktop; Admin inventory SKU
typical                   16 ms
verdict                   PASS, with ≥ 8× margin
```

Every reported INP follows a **real interaction**, and the interaction performed
is recorded per surface so the number cannot be mistaken for an idle page:

| Surface | Interaction actually performed | INP |
|---|---|---|
| Home | header link to Discover | 16 ms |
| Discover / filtered | category filter link | 16 ms |
| Product Detail | SKU/variant option control | 24 ms |
| Checkout | delivery form control | 16 ms |
| Gallery feed | "Tải thêm mục" continuation | 16 ms |
| Gallery entry | in-page control | 16–24 ms |
| Secure order | landing action | 16 ms |
| FAQ | disclosure `summary` | 16 ms |
| Admin orders queue / products list | row link | 16 ms |
| Admin order detail / categories / publication / SKU | panel action | 16–24 ms |
| Admin production queue / dashboard | queue filter / nav | 16 ms |

Six surfaces are reported **`n/a`** rather than `0`: Home at 390 px and the five
static content pages, which carry no interaction control that a measurement may
honestly invent. §9 forbids reporting INP where no interaction occurred, and
reporting `0` there would have been exactly that.

With one interaction per run this is that interaction's latency, not a p98 over
many. At 16–24 ms against a 200 ms threshold the distinction does not change the
verdict, and it is stated rather than left implied.

---

## J. TTFB

```text
threshold                800 ms
worst measured          18.4 ms   Admin products list
best                     7.0 ms
verdict                  PASS on every surface, with ≥ 43× margin
```

TTFB is uniform across public and Admin, cold and warm, desktop and mobile. §M
attributes it: server-side request duration is 1.3–5.2 ms mean and the remainder
is transport. There is no slow first byte anywhere in Wave 1.

Warm navigation TTFB is not systematically better than cold, which is expected —
every HTML document is `private, no-cache, no-store, max-age=0, must-revalidate`
and is therefore always regenerated.

---

## K. Image / media payload

### Per-surface budget (desktop, cold, transferred bytes)

| Surface | Images | Bytes | JS | CSS | Font |
|---|---|---|---|---|---|
| Home | 20 | 1 653 K | 243 K | 16 K | 344 K |
| Discover | 37 | 3 052 K | 243 K | 16 K | 344 K |
| Discover filtered | 32 | 2 638 K | 243 K | 16 K | 344 K |
| Product Detail | 5 | 1 516 K | 215 K | 16 K | 344 K |
| Gallery feed | 24 | 1 983 K | 204 K | 16 K | 344 K |
| Gallery entry | 3 | 910 K | 211 K | 16 K | 344 K |
| Checkout | 1 | 300 K | 201 K | 16 K | 344 K |
| Content pages | 0 | — | 150 K | 16 K | 344 K |
| Admin gallery list | 23 | 1 896 K | 267 K | 22 K | — |
| Admin, all others | 0 | — | 252–283 K | 22 K | — |

Media dominates every image-led surface — 85–90 % of the page weight on
Discover, Home and the Gallery feed. Format is correct throughout: `image/webp`,
`X-Content-Type-Options: nosniff`, served by the publication-gated API route.

### Findings

1. **No responsive candidates anywhere.** Not one `<img>` in either application
   carries `srcset` or `sizes`. The consequence is measured, not asserted:
   Discover transfers 3 565 KiB of images at 390 px against 3 771 KiB at 1440 px
   — a 390 px phone downloads **95 %** of the desktop image weight. Two
   renditions exist (`thumbnail` 800 px, `catalog-preview` 1600 px) and the
   markup picks one statically per surface rather than offering both.
   `MATERIAL_NEAR_THRESHOLD` — it breaches no CWV threshold in the lab and is the
   single largest real-network risk in this report.

2. **Product Detail serves 1 600 px sources into a 64 px strip.** The page loads
   4 `catalog-preview` derivatives at ~306 KiB each — 1 216 KiB — of which three
   are the thumbnail-strip images rendered at roughly 64 px. The `thumbnail`
   rendition (82 KiB) already exists and is what that strip should address.
   Switching the strip alone would remove **~672 KiB, 44 % of the page's image
   weight**, with no visual change at the rendered size. This is a bounded fix by
   §20's own examples, and it was deliberately **not** taken (§R) — it is a
   component change on a design-approved surface whose rendition choice belongs
   to the Product Detail authority, and with LCP passing at 6.9× margin it fails
   §3's "threshold breach is clear" test. Routed as `FU-APP12-H05-03`.

3. **Lazy above the fold, no `fetchpriority`.** Covered in §G.

4. **No layout shift from image dimensions on mobile**, and the desktop shift is
   §H.

Nothing was recompressed. §13 forbids globally recompressing user assets without
authority, and no such authority exists here.

---

## L. JS / hydration payload

```text
Storefront   150 K (content pages) → 265 K (secure order), 7–15 chunks
Admin        252 K → 283 K, 15–17 chunks
CSS          16 K Storefront / 22 K Admin, one chunk, every page
Font         344 K, one file, every Storefront page
```

All figures are transferred (gzip-encoded) bytes. Main-thread cost is negligible
throughout: long-task time never exceeded a few tens of milliseconds and INP
stayed at 16–24 ms, so hydration is not a bottleneck on any measured surface.

Findings:

- **No duplicate-dependency or oversized-chunk signature.** The chunk count and
  weight scale sensibly with page complexity, and the shared vendor chunk is
  reused across routes rather than duplicated.
- **Brotli is not negotiated.** Requesting `Accept-Encoding: br` returns the
  asset uncompressed (23 886 bytes) where `gzip` returns it compressed. Gzip is
  served for JS, CSS and HTML, so nothing is uncompressed in practice, but
  Brotli would typically save a further 15–20 % on the ~250 K of JS and the
  344 K font. `LOW_PRIORITY`; it is Gateway/edge configuration and belongs with
  the edge work in `FU-APP12-H02-05`, not in an application change.
- **The 344 KiB font is the single largest non-image asset** on every Storefront
  page. It caches perfectly on repeat navigation (§P) so it is a first-visit
  cost only. Recorded, not actioned — subsetting is a design-system decision.

No Server/Client boundary was rewritten. §14 permits acting only on a measured
breach with a clear local bundle cause, and there is neither.

---

## M. API latency

Two independent measurements, as §15 requires.

### Browser-independent, through the real Gateway and TLS (10 runs each)

| Endpoint | Code | Bytes | min | median | max |
|---|---|---|---|---|---|
| `GET /api/public/categories` | 200 | 866 | 47.1 | 48.8 | 57.2 |
| `GET /api/public/products?limit=20` | 200 | 7 193 | 9.3 | 9.4 | 10.4 |
| `GET /api/public/products/:slug` | 200 | 1 090 | 47.3 | 48.9 | 54.8 |
| `GET /api/public/gallery-entries?limit=12` | 200 | 5 720 | 11.3 | 12.2 | 16.4 |
| `GET /api/public/gallery-entries/:slug` | 200 | 1 191 | 9.3 | 9.6 | 40.9 |
| `GET …/media/:id/thumbnail` | 200 | 81 914 | 11.0 | 11.2 | 13.3 |
| `GET …/media/:id/catalog-preview` | 200 | 306 824 | 11.1 | 11.6 | 12.9 |
| `GET /api/admin/orders?limit=20` | 200 | 3 943 | 9.2 | 10.0 | 24.1 |
| `GET /api/admin/orders/:id` | 200 | 799 | 10.3 | 50.5 | 53.3 |
| `GET /api/admin/products?limit=20` | 200 | 10 952 | 10.4 | 10.8 | 20.8 |
| `GET /api/admin/categories` | 200 | 1 894 | 9.2 | 9.5 | 28.0 |

### Server-side, from the delivered H03 histogram (§22)

Differenced across the probe window so it describes only those requests:

| Route | n | mean | p50 | p95 |
|---|---|---|---|---|
| `GET /api/public/gallery-entries` | 11 | 5.2 ms | 5 ms | 10 ms |
| `GET /api/public/products/:slug/media/:id/:rendition` | 22 | 4.5 ms | 5 ms | 10 ms |
| `GET /api/public/products/:slug` | 11 | 2.7 ms | 5 ms | 5 ms |
| `GET /api/public/gallery-entries/:slug` | 11 | 2.7 ms | 5 ms | 5 ms |
| `GET /api/admin/products` | 11 | 2.6 ms | 5 ms | 5 ms |
| `GET /api/admin/orders/:orderId` | 11 | 2.3 ms | 5 ms | 5 ms |
| `GET /api/public/categories` | 11 | 1.4 ms | 5 ms | 5 ms |
| `GET /api/admin/orders` | 11 | 1.3 ms | 5 ms | 5 ms |
| `GET /api/admin/categories` | 11 | 1.3 ms | 5 ms | 5 ms |

### What the comparison says

Every route is **1.3–5.2 ms mean, p95 ≤ 10 ms server-side**. The client-observed
figures split into a ~10 ms cluster and a ~48 ms cluster, and the histogram shows
the API is not the difference: the ~38 ms gap is per-connection transport
behaviour on the loopback forwarder, not application work. No API path is slow,
and none is near any threshold. **`API_latency = PASS`.**

No business mutation was load-tested. §15 forbids it, and the only mutations
exercised are the 14 fixture orders and 6 shipping-fee writes of §D.

The delivered H03 metrics endpoint was read and nothing else. No dashboard,
alert rule or scrape configuration was added or changed (§22).

---

## N. DB / query evidence

§16 scopes this to slow API paths only, and asks for no speculative indexes and
no migration. Applying the rule honestly: **no path qualified as slow.** The
slowest server-side route is 5.2 ms mean / 10 ms p95, so an `EXPLAIN` campaign
would have been the global profiling §16 forbids.

One thing was worth confirming even so, because a fast total can hide an N+1 on a
small dataset. `log_min_duration_statement` was set to `0` on the disposable
PostgreSQL for the length of a short probe and restored to `-1` immediately
after, and statement counts were taken against varying page sizes:

```text
GET /api/public/products?limit=5           3 statements
GET /api/public/products?limit=20          3 statements  (+5 pool/session setup on one run)
GET /api/public/products?limit=48          3 statements
GET /api/public/gallery-entries?limit=3    3 statements  (+5 on one run)
GET /api/public/gallery-entries?limit=12   3 statements  (+5 on one run)
GET /api/public/gallery-entries?limit=31   3 statements
```

**Statement count is independent of row count** — a 48-row page costs the same
three statements as a 5-row page. There is no N+1 and no per-row lookup on
either list path. The occasional +5 is connection/session setup on a
newly-opened pool connection, not query work.

```text
DB_query_cost = PASS
EXPLAIN campaign      not run — no path met the "slow" bar (§16)
speculative indexes   none added
migration 0039        absent
```

---

## O. Pagination / load-more

Normal-path measurement only. No H04 gallery failure injection was re-run.

**API level**, keyset continuation through the real Gateway:

```text
GET /api/public/products?limit=20&cursor=…        200   7 252 B   9.3–10.4 ms
GET /api/public/gallery-entries?limit=12&cursor=… 200   5 738 B   11.1–11.8 ms
```

Continuation costs the same as the first page — the cursor is opaque and keyset,
so there is no deepening offset scan.

**Browser level**, as a real interaction:

| Surface | Control | Interaction latency | Effect |
|---|---|---|---|
| Gallery feed | "Tải thêm mục" | 16 ms | 12 → 24 cards, +12 covers, DOM grows once |
| Discover | category filter | 16 ms | navigation to filtered list |
| Discover filtered | category nav | 16 ms | navigation between categories |
| Admin orders queue | row link / filter | 16 ms | — |
| Admin products list | row link | 16 ms | — |

Observed and clean: request latency flat, payload per page constant, DOM growth
proportional and bounded, **no duplicate rows** on continuation, and no
main-thread interaction delay (16 ms is one frame). The Gallery feed's
continuation is the surface whose *layout* growth contributes to §H's CLS —
that is a shift finding, not a pagination finding, and it is reported there.

---

## P. Cache policy — `FU-APP11-B03-02`

### Disposition

```text
FU-APP11-B03-02 = ROUTED_TO_FU_APP12_H02_05_EDGE_CACHE_ARCHITECTURE
```

Not closed as accepted, and not called a defect. The reasoning is below and the
measurement is exact.

### The measurement, and the harness fault that nearly falsified it

The first two warm-navigation readings reported that **nothing** was cached —
not even assets carrying `public, max-age=31536000, immutable`. That would have
been a dramatic finding and it was false. Two causes, both mine:

1. Payload was being counted from response bodies. A cache hit still produces a
   response event, so a cached asset was counted at full weight. Corrected to
   Resource Timing `transferSize`, the only figure that distinguishes a byte that
   crossed the network from one the browser already had.
2. The "warm" navigation opened a **new page** in the same context. A Playwright
   context keeps no on-disk HTTP cache and each page starts with an empty memory
   cache. Measured directly: same page, second navigation → `transferSize` 0 for
   every static chunk; new page, same context → full re-transfer of all of them.

Both are recorded in the runner so the next author does not repeat them. The
warm navigation now re-navigates the same page, which is the only thing that
measures a returning visitor.

### Result

| Surface | Cold | Warm | Reduction | What remains on the wire |
|---|---|---|---|---|
| Content pages | 526 K | 15 K | **97 %** | document only |
| Checkout | 883 K | 313 K | 65 % | document + 1 image (300 K) |
| Secure order | 1 405 K | 23 K | **98 %** | document only |
| Home | 2 331 K | 769 K | 67 % | document + 9 images (746 K) |
| Gallery feed | 2 602 K | 1 018 K | 61 % | document + 12 covers (991 K) |
| Product Detail | 2 109 K | 1 235 K | 41 % | document + 4 images (1 216 K) |
| Discover | 3 771 K | 1 724 K | 54 % | document + 20 thumbnails (1 653 K) |
| Admin gallery list | 2 225 K | 1 690 K | 24 % | document + 20 covers (1 652 K) |

The pattern is unambiguous and identical everywhere: **JS, CSS and the font
transfer 0 bytes on a repeat navigation** — `immutable` caching works exactly as
intended — and **every image transfers in full, every time.**

### The three resource classes, kept apart as §12 requires

| Class | Directive | Freshness requirement | Assessment |
|---|---|---|---|
| Stock-sensitive SKU projection (`/products/:slug/variants`) | `no-store` | Stock and price must never be stale | **Correct. Must not change.** |
| Product / gallery metadata (`/products`, `/products/:slug`, `/gallery-entries`) | `no-store` | Unpublish must take effect on the next read | Correct today; cheap anyway (866 B – 7 KiB) |
| Media binaries (`…/media/:id/:rendition`, `…/assets/:id/:rendition`) | `no-store` | Unpublish must revoke access on the next request | **Correct, and the entire measured cost** |

The distinction is preserved rather than collapsed. Caching the metadata would
recover 866 B – 7 KiB per navigation — negligible — while carrying the same
staleness risk as the media. The cost is entirely in the third row: **0.7–1.7 MB
of immutable image bytes re-transferred on every repeat navigation.**

### Why `no-store` on media is not a defect

The delivered policy states its reasoning and the reasoning holds. Unpublish
(`TR-LC04-05`) must revoke access on the *next* request; the
`product.published` / `product.unpublished` outbox backlog has **no dispatcher**,
so no cache could be purged when a product is withdrawn; and the media URL's
`productMediaId` is stable across unpublish and republish, so any stored copy
would outlive the withdrawal and keep serving a retracted image. Under those
constraints `no-store` is the only policy that cannot defeat the lifecycle. A
private browser cache would defeat it just as surely as a shared one.

### Why it is nevertheless routed rather than accepted

The bytes are real and recurring, and the fix is neither an application tweak nor
something H05 may do. It requires either a cache-invalidation consumer for the
existing outbox events, or an edge cache that can be purged — which is edge
architecture, and §12 forbids introducing a CDN in H05. Both belong with the
edge and topology work already gathered in `FU-APP12-H02-05`, alongside a
decision on whether immutable content-addressed media URLs (which would be
safely cacheable *because* a withdrawn image's URL would never be requested
again) are the right shape.

`BLOCKING_PERFORMANCE_DEFECT` was considered and rejected: no CWV threshold is
breached by it, first-visit weight is unaffected, and the correctness argument
for the current directive is sound.

### Recorded cache state

```text
HTML documents        private, no-cache, no-store, max-age=0, must-revalidate  (always regenerated)
                      Vary: rsc, next-router-state-tree, next-router-prefetch,
                            next-router-segment-prefetch, Accept-Encoding
/_next/static/*       public, max-age=31536000, immutable                      (0 bytes on repeat)
public API JSON       no-store                                                 + weak ETag
public media          no-store, X-Content-Type-Options: nosniff
service worker        none present
CDN                   none — and none invented (§11)
gateway cache headers none added by NGINX Gateway Fabric; application headers pass through
```

---

## Q. Findings classification

| # | Finding | Surface | Class |
|---|---|---|---|
| H05-01 | Streaming loading segment reserves no space; `main` grows 432→1768 px and displaces the visible footer region. CLS 0.4086 | Product Detail, desktop | `THRESHOLD_BREACH` — **FIXED, remeasured 0.0002** |
| H05-02 | Card/cover images carry no intrinsic dimensions; grid growth displaces visible content. Median 0.054–0.063, 3/11 runs > 0.10, max 0.115 | Discover, Discover filtered, Gallery feed — desktop | `MATERIAL_NEAR_THRESHOLD` — **drives `BLOCKED_PERFORMANCE`** |
| H05-03 | Client-fetched panels inserted after hydration. CLS 0.1316, 11/11 runs | Admin order detail | `THRESHOLD_BREACH` — operator surface, non-blocking for customer release |
| H05-04 | No `srcset`/`sizes` anywhere; a 390 px phone downloads 95 % of desktop image weight | All image-led public surfaces | `MATERIAL_NEAR_THRESHOLD` |
| H05-05 | Thumbnail strip addresses the 1600 px `catalog-preview`; ~672 KiB avoidable, 44 % of page image weight | Product Detail | `LOW_PRIORITY` |
| H05-06 | Above-the-fold card images are `loading="lazy"` with no `fetchpriority`; the measured LCP element is one of them | Home, Discover | `LOW_PRIORITY` |
| H05-07 | Immutable media re-transferred in full on every repeat navigation, 0.7–1.7 MB | All image-led surfaces | `EXTERNAL_EDGE_DEPENDENCY` — §P |
| H05-08 | Brotli not negotiated; gzip is | All surfaces | `LOW_PRIORITY` — edge configuration |
| H05-09 | 344 KiB font on every Storefront page; first visit only | All Storefront surfaces | `LOW_PRIORITY` |
| H05-10 | Client-observed latency carries ~38 ms of loopback transport the API does not spend | Measurement path | `MEASUREMENT_LIMITATION` — §C, §M |
| H05-11 | "Admin cannot sign in" — Git Bash rewrote a build argument into a Windows path | Harness | `FALSE_POSITIVE` — §F |
| H05-12 | "Nothing is cached, not even `immutable` assets" — body-size accounting and a new-page warm navigation | Harness | `FALSE_POSITIVE` — §P |

### The breaches, in the shape §19 requires

**H05-01 — Product Detail, desktop, CLS.** Measured 0.4086 (runs
`[0.4086, 0.0465, 0.4086]`), threshold 0.10, variance bimodal on whether the
stage image arrived before first paint. Root cause: frame-by-frame geometry
trace showing `main` 432→1768 px at the Suspense swap with the footer region
displaced 1 336 px. Small fix available: **yes** — reserve a viewport on the
loading state. Release impact: eliminated; 0/11 runs over threshold after the
fix.

**H05-02 — Discover / Discover filtered / Gallery feed, desktop, CLS.** Medians
0.0625 / 0.0625 / 0.0538; maxima 0.1103 / 0.1150 / 0.1067; 3 of 11 runs over
threshold on each. Root cause: frame-by-frame trace showing grid growth
577→1 422 px (Discover) and masonry 539→2 011 px (Gallery) as images load,
displacing already-visible content. Small fix available: **no** — two CSS-only
reserves were measured and neither improved the median; the real fix publishes
derivative dimensions through the public contract. Release impact: the p75 sits
on the threshold in a lab that under-states this metric, so the surfaces cannot
be certified.

**H05-03 — Admin order detail, CLS.** 0.1316 median, 11/11 over, no variance.
Root cause: two payment/shipping cards inserted and one grown after hydration.
Small fix available: not within H05 — it needs those panels server-rendered or a
correctly-sized skeleton. Release impact: operator-facing only; no customer
journey affected.

---

## R. Bounded fixes

Exactly one fix was applied. §20's list authorises "add missing
dimensions/aspect ratio", §3 requires the breach to be clear, the root cause
mechanically identified, the fix small and H05-local, and remeasurement cheap.
All four hold for this one and for nothing else in this report.

```text
apps/storefront/src/features/product-detail/styles/_product-detail-states.scss

.product-detail--loading { min-height: 100vh; }
```

Four lines including the selector, in the loading state's own stylesheet. It
styles the **transient loading state only** — no loaded surface changes, so no
approved design frame is touched and this is not a design change.

It reserves the viewport the resolved page is about to fill, and deliberately
does **not** give the stage a guessed box. That alternative was measured, not
assumed:

```text
baseline                                             0.4086 / 0.0002 / 0.0465
+ .product-detail--loading{min-height:100vh}         0.0465 / 0.0002 / 0.0002   ← applied
+ that, and .product-detail__stage{min-height:660px} 0.4086 / 0.4086 / 0.0465   ← rejected
```

Adding a stage box made it strictly worse, and the delivered `DetailLoading`
component already explains why: the contract publishes no dimensions, so a
skeleton shaped like an artwork is a claim about a Product nobody has loaded yet.

### Fixes deliberately not taken

- The Product Detail thumbnail strip's rendition (H05-05, ~672 KiB): a component
  change on a design-approved surface, and LCP passes at 6.9× margin, so §3's
  "threshold breach is clear" test fails. Routed.
- `srcset`/`fetchpriority` (H05-04, H05-06): no lab threshold is breached, and
  responsive candidates need the derivative dimensions H05-02 also needs.
- Any cache directive change (§P): would defeat the publication lifecycle.
- Anything touching the API, OpenAPI, the generated client, the database or a
  migration: forbidden by §16, §20 and §24, and none was touched.

---

## S. Remeasurement

Only the affected surface was remeasured, per §20 — the full matrix was not
re-run for the fix.

```text
Product Detail, desktop, CLS
  before   0.4086 median   runs [0.4086, 0.0465, 0.4086]        4.1× over threshold
  after    0.0002 median   11 runs, min 0.0001, max 0.0465      0 / 11 over threshold
  LCP      unchanged and passing (364 ms median, threshold 2 500 ms)
  visual   loaded surface unchanged — the rule applies only to .product-detail--loading
```

The full public and Admin matrices in §E and §F were re-run for a different and
disclosed reason: the corrected Next images (§F) changed the deployed artifact,
so every earlier browser number was superseded rather than kept. Three
superseded result sets are retained beside the final one in the run directory
rather than deleted.

---

## T. External edge prerequisites

Carried forward unchanged and **not** reopened, exactly as §23 requires:

```text
FU-APP12-H02-05  → REQUIRED_BEFORE_R01
  production GatewayClass / controller
  production PostgreSQL topology
  production object-storage topology
  endpoint-reconfiguration transport behaviour        (H04 connection resets)
  Gateway request-body limit ≥ evidence-upload maximum (H04-C1)
```

No H04 or H04-C1 Gateway transport behaviour was chased. The ~38 ms transport
component in §M is a property of this measurement path, is disclosed as
`MEASUREMENT_LIMITATION`, and is **not** conflated with page CWV or with the
above.

H05 adds one item to the same follow-up, because it is edge architecture and
nothing else: the media cache disposition of §P.

---

## U. Files changed

```text
M  apps/storefront/src/features/product-detail/styles/_product-detail-states.scss   (+29)
M  docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md           (status ledger)
A  docs/implementation/reports/APP12-H05-COMPLETION-REPORT.md                        (this report)
A  packages/e2e-testing/support/app12/h05-performance-fixture.mjs                    (340 lines)
A  packages/e2e-testing/support/app12/h05-media-generator.mjs                        (132 lines)
A  packages/e2e-testing/support/app12/h05-measurement-runner.mjs                     (248 lines)
A  packages/e2e-testing/support/app12/h05-cwv-probe.mjs                              (142 lines)
```

Not changed, and verified not changed:

```text
apps/api/**              no application, contract or schema change
apps/worker/**           untouched
apps/admin/**            untouched
packages/contracts/**    OpenAPI artifact byte-identical, drift gate PASS
packages/database/**     no migration; 0039 absent
infrastructure/**        staging overlay REVERTED to its committed
                         REPLACE_WITH_IMMUTABLE_RELEASE_REF placeholders after deployment
docs/.../APP12-H04-COMPLETION-REPORT.md      not opened for edit
docs/.../APP12-H04-C1-COMPLETION-REPORT.md   not opened for edit
Figma                    no artifact opened, created or edited
```

File-size governance (§25): every new file is a test/measurement utility under
the 600-line limit, split by responsibility — fixture, image generation,
browser runner, in-page probe. The single runtime source change is 29 lines in
an existing 400-line-compliant partial.

---

## V. Validation

Change-impact based, per `VALIDATION_GOVERNANCE.md` §3. Commands actually run:

```text
git diff --check                                             clean
node tools/check-release-config.mjs staging                  PASS (20 resources)
kubectl apply -k infrastructure/kubernetes/overlays/staging   20 resources deployed
pnpm --filter @embroidery/api openapi:check                  PASS — artifact up to date
node tools/check-styling-boundaries.mjs                      31 violations — ALL pre-existing
                                                             (31 at HEAD, 0 in the file changed)
node tools/check-app-scss.mjs storefront                     PASS — 159 624 bytes CSS compiled
node tools/check-report-secrets.mjs                          PASS — 651 documents, 5 213 files
```

Live measurement evidence:

```text
production-mode staging deploy         4 images built --target runner, deployed by immutable tag
representative fixture verification    counts and derivative byte distribution in §D
public browser performance matrix      21 surface/viewport combinations, 3 runs each + warm
Admin browser performance matrix       10 surfaces, 3 runs each + warm
CLS characterisation                   11 runs each on 6 decision-critical surfaces
LCP / CLS / INP / TTFB capture         §G, §H, §I, §J
payload / request capture              §K, §L — Resource Timing transferSize
API latency capture                    §M — 10 runs per endpoint through the real Gateway
H03 server-side latency comparison     §M — delivered histogram, differenced across the window
cache-policy measurement               §P — cold vs true warm, per resource class
image/media analysis                   §K
JS/hydration analysis                  §L
DB/query statement-count analysis      §N — N+1 ruled out; no path met the "slow" bar
pagination/load-more                   §O — API and browser
remeasurement of the affected surface  §S
```

Deliberately **not** run, per §26: H06 SEO work, H07 runbooks, V01/V02 visual
UAT, G03 dataset creation, production deployment, and every H04 fault rehearsal.

The styling result is stated exactly: the repository carries 31 pre-existing
styling-boundary violations at `HEAD`; this checkpoint adds none and removes
none, and the file it changed contributes zero.

---

## W. Hygiene

```text
disposable minikube profile embroidery-h05        deleted
disposable PostgreSQL + MinIO                     destroyed with the cluster (emptyDir)
disposable registry / socat edge containers       removed
disposable staging namespace + secrets            destroyed with the cluster
per-run credentials and certificates              generated per run, never committed, never echoed
shared development compose stack                  stopped for measurement isolation, RESTARTED
staging overlay image tags                        reverted to committed placeholders
```

```text
shared_dev_commercial_residue = 0
```

Nothing was written to the shared development database at any point. The fixture
refuses any database not named `embroidery_db7_*`, and the only database touched
was the disposable `embroidery_db7_h02_staging` inside the cluster, destroyed
with it.

```text
G03_data_created    = false
production_deployed = false
.env written        = never
secrets in report   = none — checker PASS over 651 documents
secure-order token  = never logged; the secure-order surface was measured with
                      trace, HAR and video all off, and no token appears in any
                      artifact, assertion or log line
```

---

## X. Baseline freeze

Freshly measured, not asserted:

```text
OpenAPI              125 paths / 138 operations / 278 schemas    unchanged
public operations    49                                          unchanged
release matrix       28 DENY / 18 ALLOW / 3 SCOPE_GATED  (= 49)  unchanged by construction:
                                                                 zero API source files changed
migrations           38   committed, and 38 applied in the live database
DB tables            79   live disposable database
Admin routes         26
Storefront routes    20
Figma                unchanged — no artifact opened or edited

NEW_BUSINESS_HTTP_OPERATIONS = 0
NEW_BUSINESS_ROUTES          = 0
MIGRATION_0039               = absent
```

The release matrix is the only line not independently re-derived here. It is a
partition of the 49 public operations, and no file under `apps/api/`,
`packages/contracts/` or `packages/database/` was modified — so it cannot have
changed. Stated that way rather than claimed as a fresh measurement.

---

## Y. Roadmap

```text
APP12-H05 = BLOCKED_PERFORMANCE
NEXT      = APP12-H06   (SEO and public readiness, Wave 1)
```

`APP12-H06` is not started. `CORRECTION_USED = 0 / 1` for H05 — no correction
checkpoint was consumed.

### Follow-ups opened

```text
FU-APP12-H05-01  REQUIRED_BEFORE_R01
  Publish asset_derivatives.width_px / height_px on the public product- and
  gallery-media projections and consume them as <img width height> on the
  Discover and Gallery grids, so each image reserves its true box with no
  cropping and no invented ratio. Closes H05-02, and is the prerequisite for
  H05-04's responsive candidates. API contract + OpenAPI + generated client +
  frontend; explicitly outside H05 (§3, §24).

FU-APP12-H05-02  RECOMMENDED
  Above-the-fold card images: drop loading="lazy" and add fetchpriority="high"
  on the first row. Closes H05-06; no lab threshold breached, so it carries
  real-network justification rather than a measured one.

FU-APP12-H05-03  RECOMMENDED
  Address the `thumbnail` rendition from the Product Detail thumbnail strip
  instead of `catalog-preview`. ~672 KiB, 44 % of that page's image weight, no
  visual change at the rendered size. Closes H05-05.

FU-APP12-H05-04  RECOMMENDED
  Server-render, or reserve a correctly-sized skeleton for, the Admin order
  detail shipping-fee and payment panels. Closes H05-03.

FU-APP12-H02-05  REQUIRED_BEFORE_R01 — extended, not reopened
  + media cache architecture: a cache-invalidation consumer for the existing
    product.published / product.unpublished outbox events, or purgeable edge
    caching, or content-addressed immutable media URLs. Closes FU-APP11-B03-02
    (§P). Also covers H05-08 (Brotli negotiation), which is edge configuration.
```

### What a PO decision on H05 needs

The blocking item is one metric on three desktop surfaces whose medians pass and
whose p75 sits on the threshold. Two dispositions are defensible and the choice
is the Product Owner's, not this checkpoint's:

1. **Accept as near-threshold** on the §21 variance provision, with
   `FU-APP12-H05-01` required before `APP12-R01`. The medians pass by a factor
   of 1.6–1.9 and no other threshold is close.
2. **Require the correction first**, as a dedicated `APP12-H05-C1` that publishes
   derivative dimensions and consumes them — which is a contract change and
   therefore needs explicit authority to break the §24 baseline freeze.

This report does not choose between them. It reports that the medians pass, that
27 % of runs do not, that the lab under-states this particular metric, and that
the fix is real, known and outside the boundary H05 was given.
