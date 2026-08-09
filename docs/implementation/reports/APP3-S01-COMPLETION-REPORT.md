# APP3-S01 — Studio bootstrap shell, placement context and Template selection

`APP3-S01 = COMPLETE — REVIEW_DELIVERED`. Not self-accepted.

## A. Entry state

The operator accepted `APP3-B05A` (§0). The phase document now records
`APP3-D01`, `APP3-D01-C1`, `APP3-B01`, `APP3-B02`, `APP3-B05`, `APP3-B05A`,
`APP3-B07`, `APP3-P01`, `APP3-P02`, `APP3-A01`, `APP3-A02`, `APP3-A03`,
`APP3-A03-C1` and `APP3-A04` as `COMPLETE — REVIEW_ACCEPTED`, and the S01 gate
asserts eleven of those rather than trusting the prose.

The accepted B05A artifact world is unchanged by this checkpoint and was
re-measured, not copied: **35 paths / 40 operations / 83 schemas**, generated
client tree `d9aac2b3bfb322c1d604f2802e8a9b154bcb8744eabc780652658196d84735b9`
(reported by `check:generated`), 34 migrations, 30 root scripts.

`APP3-B06C` stays `READY — NOT STARTED` and was not run. `APP3-S02` is recorded
`BLOCKED_BY_APP3-S01_REVIEW_ACCEPTANCE`.

## B. The five S01 design rows

Section **05 — Studio Shell / Template Selection**, `596:11`, page `APP_03`
(`592:3`), file `BQwqV8GdfUIELvsQDB1UQE`:

| Registry ID | State | Viewport | Node |
|---|---|---|---|
| `FIG-STUDIO-SHELL-DESKTOP-DEFAULT` | Default | Desktop 1440 | `604:5` |
| `FIG-STUDIO-SHELL-DESKTOP-PREVIEWPENDING` | Preview Pending (B05A) | Desktop 1440 | `604:46` |
| `FIG-STUDIO-SHELL-DESKTOP-EMPTY` | Empty | Desktop 1440 | `604:73` |
| `FIG-STUDIO-SHELL-DESKTOP-EXPIRED` | Session Expired | Desktop 1440 | `604:85` |
| `FIG-STUDIO-SHELL-MOBILE-DEFAULT` | Default | Mobile 390 | `604:100` |

All five were `REVIEW_REQUIRED` at entry and are now
`APPROVED_FOR_IMPLEMENTATION` with approval evidence `APP3-S01 §3 operator
review`. **Nothing else moved.** Every `S02`–`S11` row is still
`REVIEW_REQUIRED`, and the gate asserts that in both directions — a blanket
`REVIEW_REQUIRED → APPROVED_FOR_IMPLEMENTATION` sweep of the registry fails the
S01 gate, which is one of its regression cases.

No Figma node was created, moved or edited. `check-figma-design-index.mjs`
passes at 165 registry IDs / 165 node rows / 15 tables.

**A bounded live read was attempted and is not available.** The Figma MCP
connector in this session is unauthenticated and exposes only
`authenticate`/`complete_authentication`; calling `authenticate` returns an OAuth
URL for the operator and no read tool. §3 forbids stopping to ask the operator to
reconnect, and the registry plus the `APP3-D01`/`D01-C1` evidence resolve the
five rows completely, so implementation proceeded against those.

## C. Route and Storefront shell

`/san-pham/[slug]/thiet-ke` — one file,
`apps/storefront/src/app/san-pham/[slug]/thiet-ke/page.tsx`, 72 lines, no
`'use client'`.

The segment literal lives once, in the shell's navigation model
(`STOREFRONT_STUDIO_ROUTE_SEGMENT` + `buildStorefrontStudioPath`), beside
`STOREFRONT_PRODUCT_DETAIL_ROUTE_BASE`, because routes are Storefront shell IA.
The route composes its canonical URL through that builder and never spells the
segment itself; the gate refuses a route that does.

No competing route exists — `/studio`, `/editor`, `/thiet-ke/[id]`,
`/design-session/[sessionId]` and `/san-pham/[slug]/studio` are all asserted
absent, and `/studio` and `/editor` were added to the existing storefront
route-authority gate's rejected list so neither spelling can be promoted there
either.

The **`studio` primary-nav item stays `route: null`**, and that is the correct
outcome rather than an oversight: S01 built a Studio *per Product*, so any
top-level `href` would have to invent a landing page that does not exist. The
gate asserts the item stays non-interactive.

The approved Studio frames keep the shared header and footer, so the accepted
shell is reused unchanged: the route renders no `<main>`, no header and no
footer of its own, and no other Storefront route was touched. `pnpm --filter
@embroidery/storefront build` lists exactly six routes, five of them unchanged.

## D. Server / client boundary

The server segment resolves the Product through the **same** request-scoped
`loadProductDetail` the Product Detail page uses, takes the identical safe
not-found, renders the `<h1>`, and hands off. `force-dynamic`, for the reason the
parent segment uses it: publication is re-read per request because nothing in
this system invalidates a cache.

Everything below is one `'use client'` island, code-split by Next at that
boundary: placement, Side/Area interaction, Template list and continuation,
selection, the B05A preview blob, the two bootstrap actions and resume.

The placement manifest is deliberately **not** prefetched on the server. Side and
Area are interaction state the visitor changes; a server-rendered copy would be a
second, staler answer to a question the island must ask on mount — the duplicate
fetch §20 rules out. The gate asserts the feature never reaches
`getServerApiClient`.

The Studio has its own route-local `QueryClient`. The Storefront has **no**
global one — that is a decision `APP2-S01` recorded, not an omission — and the
accepted convention is one provider per route that needs client server-state.

## E. Product, placement and `studioEligible`

Product truth is `publicProductDetail` (server). Side and Area authority is
`publicProductPlacementGet` and nothing else: no Admin placement operation is
reachable from the feature, no geometry is duplicated from Product detail, and no
database or storage is touched.

`studioEligible === false` blocks everything downstream — no Template request, no
Session, and **no Blank affordance**, because a Session cannot be opened on a
placement the server will not vouch for and offering one would be offering a
refusal. The approved unavailable state is shown instead. Proved in a component
test asserting `publicDesignTemplateList` was never called, and in the gate as a
source rule.

A non-public Product takes the existing Storefront not-found behaviour.

## F. Deterministic Side and Area selection (IMP-D041)

Canonical order is `displayOrder`, then `code`, then `id` — applied here rather
than trusted from the wire, because two rows may share a `displayOrder` and
"the first row" must mean the same row on every load.

- one active Side → auto-selected; several → a labelled native `<select>`;
- one active Area → auto-selected and **stated**, not offered as a choice of one;
- Areas are read out of the selected Side, so an Area of another Side has no path
  onto the screen and no way through the reducer.

**One deliberate refinement**, recorded rather than hidden: the initial Side is
the first in canonical order **that carries at least one Area**. `studioEligible`
is a whole-Product fact, so a Product can be eligible through its second Side
while its first has none; landing on that first Side would strand the visitor on
an empty Area picker with nothing to choose. The fallback keeps the function
total.

The cascade is **one reducer**, `studioSelectionReducer`. Every transition
returns a whole state, so there is no render in which a new Side sits beside the
previous Side's Area or Template. `reconcile` runs against *every* manifest read,
not only the first, which is what makes the screen revocation-aware without
polling: a retired Side or Area is replaced at the next authoritative read.

## G. Exact-triple Template list and keyset continuation

`publicDesignTemplateList` is called with all three ids on every request. There
is no wildcard, Product-only or Side-wide fallback, and no `offset`, `page`,
`total`, `search` or `sort` is sent — the contract publishes none, so none is
fabricated.

The compatibility triple is part of the **query key**. A Side or Area change
therefore does not merely invalidate: it addresses a different query. A response
for the previous placement cannot land in the new placement's cache entry however
late it arrives, and the cursor sequence restarts because the new key has no
pages. That is the stale-response defence, and it is structural rather than a
race a component has to remember to guard. A component test holds Side 1's
request open, switches to Side 2, then releases it and asserts the old rows never
appear.

Continuation is the opaque keyset cursor, passed back exactly as issued and never
parsed. `nextCursorOf` requires `hasNext` **and** a usable cursor, so a page
claiming a successor it did not supply cannot loop. A failed continuation replays
the exact `pageParam` that failed and never restarts from the first page.

## H. Selected Template detail

`publicDesignTemplateDetail` is read for the **one** selected Template. No row is
resolved by fetching it — that is the N+1 a keyset list exists to avoid — and the
browser network log shows 12 listed rows against exactly one detail request.

A Template that disappeared between list and detail (404) withdraws the selection
for every downstream purpose — preview, clone, the pressed state — while the
reason stays on screen. It is **never** silently converted into a blank start:
the visitor chose a Template, and Blank is a separate action they must take.

## I. B05A preview and the object-URL lifecycle

The preview asset id comes from the selected **published version's own
document** — the first `image` element in z-order — and is fetched through
`publicDesignTemplateAssetGet(slug, version, assetId)`. No generic asset URL, no
storage key, bucket, presign or Admin route is involved, and the gate asserts
none of those strings exists in the feature.

Two resources with different owners:

- the **bytes are server state**: TanStack Query owns fetching, cancellation and
  failure, with `gcTime: 0` because B05A answers `no-store` and retaining the
  bytes after nothing renders them is the browser-side version of what
  `no-store` prevents;
- the **object URL is a browser resource**: an effect creates it and revokes it
  on Template change, Side/Area change, blob replacement and unmount.

There is no `placeholderData`. Keeping the previous entry's blob while a new key
loads is precisely how one Template's artwork appears under another Template's
name, so the absence is load-bearing; the gate refuses its reintroduction and a
regression proves that.

Failure branches are on **HTTP status only**, never on a message: `404 → gone`
(unavailable, reselect, no blind retry — one request, no retry, asserted),
anything else → retryable with an explicit "Thử lại".

S01 builds no renderer. The gate refuses `<svg`, `<canvas`, `renderer`,
`viewport` and `undoStack` anywhere in the feature.

## J. Text-only Templates

A published document that places no image is a valid Template. The screen says
so, requests no asset, and keeps Clone enabled. Proved in a component test and in
the browser against a seeded text-only Template.

## K. Blank bootstrap

The generated `CreateBlankDesignSessionBodyMode.BLANK` discriminator, bound to
the currently authorized `productSlug` + `sideCode` + `areaCode`. No document is
sent — the blank DesignDocument is server-owned and a locally manufactured one
would be a second definition of it. A duplicate submit is blocked in the hook
(`if (create.isPending) return;`) and visibly by the disabled button.

## L. Clone bootstrap

The generated `CloneDesignSessionBodyMode.CLONE_TEMPLATE` branch with
`templateSlug` — the only Template identity the create body accepts. The version
the picker read is **not** sent: `APP3-B07` resolves the published version itself
and stays final at bootstrap time even when B05/B05A data was loaded seconds
earlier.

**There is no clone → blank fallback.** They are two mutations, neither calls the
other, and a refused clone reports a clone failure and leaves the visitor on the
picker with the choice intact. Asserted three ways: a component test (one create
request, no session panel), a gate rule that refuses `createBlankSession`
appearing in an error handler, and the browser run (§T step 10).

## M. Session snapshot and the secret boundary

The returned `DesignSessionSnapshotResponse` is the only Session truth this route
has. Expiry is displayed, never computed; revision is never advanced
client-side; create is never replayed; the shared `APP3-P04` response is used
rather than a competing Storefront DTO.

The raw secret is never touched. `APP3-B07` returns it solely as a host-only
`HttpOnly` cookie, so this code could not read it even if it tried — and it does
not try. The gate refuses the strings `secret` and `__Host-` anywhere in the
feature, and a component test asserts `localStorage`, `sessionStorage`,
`document.cookie`, `location.search` and `location.hash` are all empty after a
create **and** a resume.

## N. Resume identity audit (§17)

Audited: `APP3-G03`, `APP3-B06A`, `APP3-B07`'s implementation and report, the
generated B07 client, the Storefront session helpers (there are none), and the
D01 resume/expired annotations.

The finding that decides it: the cookie name is
`__Host-nettheu_ds_<sessionId>` — the Session id is in the *name* — but the
cookie is `HttpOnly`, so a browser cannot read it, and §17 forbids scanning for
it. What the accepted contract does provide is `publicDesignSessionCreate`
returning `sessionId` in the snapshot body, and
`publicDesignSessionResume(sessionId)` taking **no secret argument**, because the
browser attaches the cookie to a same-origin request by itself.

So the accepted mechanism is **the create response, held in memory**, which is
exactly §17's "if a small in-memory handoff is all that is required, implement it
inside S01". It is implemented in `useStudioSession` and nowhere else.

Resume across a full page reload is **not representable** without a persistence
or URL contract no accepted authority provides, and S01 invents neither. That is
recorded as a bounded non-scope rather than a stop: it is not S01's required
path — S01 ends at the S02 handoff — and it belongs to `APP3-S10`, which owns
autosave, conflict, resume and expiry UX (phase plan row 32). Nothing here
forecloses it.

## O. Resume and expired UX

`publicDesignSession_resume`, no secret argument, exactly two call arguments (the
id and the transport options) — asserted. On success the returned snapshot
replaces the held one wholesale; nothing merges fields, extends `expiresAt` or
advances `revision`.

Expiry is bound to the **401** `APP3-B07` actually answers, not to any failure: a
503 leaves the ready panel in place, which a component test proves. The expired
state offers one path forward — an explicit new start — revives nothing, holds no
grace secret and does not replay create.

## P. S02 handoff boundary

S01 owns the route Product, the selection, the Template query and preview state,
the bootstrap mutation state and the returned snapshot. It owns no editor
selection, viewport transform, scene node, layer, history stack or transform
command, and it does not pre-create S02's state container. Zustand is not
imported.

Once a snapshot exists the screen renders the smallest truthful placeholder: the
Session is open, the drawing surface comes next. No disabled tool rail, because a
greyed-out editor promises a stage this checkpoint does not build. A component
test asserts no image and no combobox survive into that state.

## Q. Race and stale-preview proofs

- **Template A → Template B**: the preview key carries slug, published version
  and asset id, so selecting B addresses a different query; a late A blob cannot
  write into it, and A's object URL is revoked. Asserted on the revoke list and
  the rendered `src`.
- **Side A → Side B**: the preview disappears, the object URL is revoked and the
  Template list is a different query entirely. Asserted in a component test and
  observed in the browser.
- **List race**: Side 1's response released after the visitor moved to Side 2
  never appears.

## R. Responsive

Measured in a real browser on the running stack, on the picker with 12 rows:

| Viewport | `innerWidth` | `documentElement.scrollWidth` | Horizontal overflow | Controls under 44px |
|---|---|---|---|---|
| 1440 | 1440 | 1425 | none | 0 |
| 1024 | 1024 | 1009 | none | 0 |
| 390 | 390 | 375 | none | 0 |

1024 is engineering interpolation between the two approved frames, as §21
directs: the two-column split collapses one tier earlier and nothing else
changes. **Mobile is a real customer flow** — all 12 rows, both selects and the
Blank action are present and operable at 390; A03's read-only rule is
deliberately not inherited.

`D01-C1` node `618:140` (the S02–S11 editing tablet reference) was **not** used:
no editing stage or tool rail was imported into S01.

## S. Accessibility

Native labelled `<select>` controls for Side and Area. Template choices are real
`<button>`s with `aria-pressed`; a keyboard `Enter` on a focused row selects it
and opens the preview (exercised in the browser). Selection is carried by a text
badge as well as by border and surface, so it is not colour-only. Loading uses
`role="status"`, failures `role="alert"`, and the expired panel is an alert
region. Every control clears the shared 44px touch minimum on every viewport.
There is no clickable `div` or `span`. The preview `alt` names the **Template**;
no Asset UUID is rendered as customer copy.

## T. Browser journey and network evidence

Run against the normal local stack (`docker-compose.dev.yml`) with the fixtures
of §U.

| # | Step | Result |
|---|---|---|
| 1 | open `/san-pham/<slug>/thiet-ke` | 200, title `Thiết kế mẫu thêu — …` |
| 2 | Product + public placement resolve | one placement read |
| 3 | deterministic Side/Area | Side and Area preselected; both selects labelled |
| 4 | compatible Template list | 12 rows, one request with the exact triple and `limit=12` |
| — | continuation | "Xem thêm mẫu" → 14 rows, cursor exhausted, no page number anywhere |
| 5 | choose a published Template | `aria-pressed` true on that row only |
| 6 | real B05A-backed preview | `blob:` URL, `naturalWidth` 600, alt names the Template |
| 7 | change Side | preview gone, object URL revoked, selection cleared, empty list keeps Blank explicit, Clone withdrawn |
| 8 | explicit BLANK Session | 201; ready panel with the server's `expiresAt` |
| 9 | explicit CLONE_TEMPLATE Session | 201; lineage shows the Template slug and version |
| 10 | clone failure never becomes an empty success | Template unpublished out of band → 422, clone-specific alert, **one** create request, still on the picker |
| 11 | resume | 200 on `…/resume`; the `__Host-` cookie was stored and returned, so the in-memory id plus the cookie is the whole mechanism |
| 12 | Session expired | `expires_at` moved into the past out of band → 401 → the approved expired state, one explicit restart |

Network across the whole run, excluding static assets:

```
GET  /api/public/products/<slug>/placement                       200
GET  /api/public/design-templates?productId&productSideId&embroideryAreaId&limit=12   200
GET  /api/public/design-templates/<slug>                         200   (one, for the selection)
GET  /api/public/design-templates/<slug>/versions/1/assets/<id>  200   image/webp, 10100 bytes
POST /api/public/design-sessions                                 201
POST /api/public/design-sessions/<id>/resume                     200 then 401
```

No Admin API. No raw storage URL. No per-row Template detail fan-out (12 rows,
1 detail). No `APP3-B06C`, no autosave, no Session asset operation.

Console: **0 errors and 0 warnings attributable to S01**. The only errors in the
whole session are a missing `/favicon.ico` (pre-existing, not this route's) and
Chrome's automatic logging of the 401 and 422 responses this run deliberately
provoked.

### Two environment findings, neither an S01 defect

**1. The dev container served a 404 for a route whose file it could see.** A
container restart was not enough — Turbopack's route map survived it — and only
deleting `.next` made the segment resolve. That is a stronger version of the
recorded "a new App Router special file needs a restart" quirk and is worth
knowing before the next Storefront route lands.

**2. A Design Session cannot be opened from a browser over the plain-HTTP
development gateway.** Two independent properties of the *accepted* security
design cause it, and neither is this checkpoint's:

- `DesignSessionOriginPolicy` (`IMP-D043` PO-05) requires `Sec-Fetch-Site:
  same-origin` and has no "missing means fine" branch. Browsers send
  `Sec-Fetch-*` only to **potentially trustworthy** origins, and
  `http://embroidery.local` is not one, so the header never arrives and every
  Session mutation is refused **403**. Confirmed by isolation: the same POST
  through the same gateway with `Origin` and `Sec-Fetch-Site` supplied answers
  **201**, and without them **403**.
- The session cookie carries the `__Host-` prefix, which a browser rejects
  without `Secure`; the development API runs `DESIGN_SESSION_COOKIE_SECURE=false`.

This is the Studio's version of the finding `APP2-E01` recorded for the
production Admin login. `tools/smoke-app3-s01-trustworthy-origin.mjs` resolves it
for the run without weakening anything: `http://localhost` **is** potentially
trustworthy by definition, so it adds one temporary Nginx `server_name localhost`
block on the listener that already exists and recreates the API with two
non-secret values overridden — `DESIGN_SESSION_ALLOWED_ORIGINS` and
`DESIGN_SESSION_COOKIE_SECURE`. **No `.env` was written**, no guard was disabled,
no cookie was injected and no credential was read: the browser performed a normal
bootstrap and the server issued a normal `Secure`, `HttpOnly`, `__Host-` cookie
because the origin really is trustworthy. `restore` put both containers back, and
the tracked values were re-read afterwards to prove it (`localhost` is a 404
again, `embroidery.local` serves, `DESIGN_SESSION_COOKIE_SECURE=false`).

No screenshots or traces are committed.

## U. Tests, checkers and regressions

**Focused Storefront tests** — `pnpm --filter @embroidery/storefront exec jest
--testPathPatterns=studio`:

- `test/unit/studio-model.test.ts` (17) — canonical order and its tie-breaker,
  auto-selection, the leading-Side-without-an-Area case, cross-Side Area
  resolution, the triple and the codes, the full cascade including both
  revocation directions, `hasNext`-gated continuation, page flattening, and the
  preview reference including the text-only answer;
- `test/components/studio-bootstrap.test.tsx` (19) — manifest-only placement,
  `studioEligible=false`, single vs multiple controls, exact-triple parameters
  with the invented ones asserted absent, the Side-change re-query, the late
  response that must not land, empty-list-keeps-Blank, real cursor continuation,
  no per-row detail, the B05A address, object-URL create/revoke on Template
  change and on unmount, text-only, 404 vs 503, the withdrawn selection, and the
  preview cleared by a Side change;
- `test/components/studio-session.test.tsx` (11) — both generated branches, the
  absent `document` and `templateVersion` fields, duplicate-submit blocking, the
  snapshot as truth, no editing control after handoff, no clone→blank fallback,
  resume by the in-memory id with two arguments, no browser persistence of any
  kind, 401 expiry vs a 503 that is not one, and the explicit restart;
- `test/boundary/design-studio-source.test.ts` (19) — the route set including the
  four rejected prefixes, the thin server segment, no second shell, the six
  operations, no Admin/autosave/session-asset/background operation, no raw
  transport or API path, no storage identity, no persistence, no Zustand, no
  secret, no S02 concern, no `@embroidery/design-document` dependency, the touch
  minimum, `minmax(0, …)`, no colour literal and no clickable `div`.

**Full Storefront regression**: 29 suites / **297 tests**, 0 failures.

**Checker**: `node tools/check-app3-s01.mjs` — PASS. Split by responsibility into
`check-app3-s01.mjs` (316), `check-app3-s01.sources.mjs` (135) and
`check-app3-s01-runtime.mjs` (211); the entry point is within the 450 soft cap
and every module within the 400 hard maximum.

**Checker regressions**: `node --test tools/check-app3-s01.test.mjs` — **37/37**.
Each case breaks one ruled property in a throwaway repository. The mutations that
leave a working screen: a second Studio route; a blanket Studio design approval;
the triple dropped from the query key; `placeholderData` restored; revocation
removed; a clone falling back to blank; a Session id written to `localStorage`.
The last block rewinds the phase document to prove the **pre-S01** half still
bites — a Studio route that exists before the checkpoint that owns it, and a
design row approved before its checkpoint opened.

Two of those mutations initially escaped and the gate was corrected for both: the
route rule matched a leftover *import* rather than the call site (the `APP3-B05A`
lesson), and the cascade rule missed a `templateSlug: null` without a trailing
comma.

**Predecessor gate regressions**: B05 63, B05A 52, Figma index 31, storefront
route authority 21, product-detail authority 34 — 0 failures.

## V. Route and design-index gate evolution

- `check-storefront-route-authority.mjs`: `/studio` and `/editor` joined
  `REJECTED_PATHS`, for the same reason the original three are on it — each is a
  plausible top-level path no ruling authorises. The positive Studio ruling is
  `check-app3-s01.mjs`'s; this list only holds the line that neither spelling may
  be promoted as a Discover alias. 21/21 still pass.
- `check-app3-s01.mjs` is **world-aware on the route**: before S01 the Studio
  route must be absent, after it the same route must exist. A gate that only
  asserted presence would accept "whatever routes currently exist".
- `check-app3-b05a.mjs`'s "S01 is not complete" ban was made world-aware on
  `isS01Delivered`, and its structural half strengthened: B05A owns no Storefront
  source. The status-line half is honestly no longer falsifiable through the
  phase document — the gate reads the same line to decide which world it is in —
  and the harness records that rather than asserting a tautology.
- The design index's `§4.7` paragraph said "All rows are `REVIEW_REQUIRED`",
  which stopped being true when `APP3-A01` approved its 21. It now states the
  scoped-approval history (`A01 §0`, `A04 §0`, `S01 §3`) without rewriting any of
  it.
- `tools/app3-accepted-paths.mjs` gained `isS01Delivered` and `S01_STATUS_LINES`.
  There is deliberately **no** accepted-path list beside them: S01 publishes no
  HTTP path, and a gate expecting one would be asserting a change S01 must never
  make.

## W. Contract immutability

Unchanged and asserted: `apps/api` runtime, `packages/database/migrations` (34),
the worker, `packages/contracts/openapi/openapi.generated.json` (35/40/83, and it
carries no `APP3-S01` mention), and `packages/api-client/src/generated/**` (tree
hash `d9aac2b3…`, reported up to date by `check:generated`). Root scripts remain
30.

The **handwritten curated** `@embroidery/api-client` boundary grew by six
consumer-driven operations —`publicProductPlacementGet`,
`publicDesignTemplateList`, `publicDesignTemplateDetail`,
`publicDesignTemplateAssetGet`, `publicDesignSessionCreate`,
`publicDesignSessionResume` — plus the two `mode` enums as values and the types
they need. `publicProductPlacementGet` was withheld through `APP3-A01` precisely
so an authoring screen could not bind to it; that rule is satisfied, not relaxed,
and A01's gate still asserts the Admin pair is what the authoring screen calls.

Still withheld, and the gate asserts it: `publicDesignSessionAutosave`
(`APP3-S10`'s), `publicDesignSessionAssetCreate` (`APP3-S06`'s),
`publicProductSideBackgroundGet` (the S02 stage's) and `publicProductMediaGet`.

`@embroidery/design-document` was **not** added as a Storefront dependency. §20
forbids a new runtime dependency and §31 forbids `pnpm install`; the curated
`TransportDesignDocument` type is the transport seam that already exists, and S01
reads a document at that seam without interpreting one — the gate refuses
`validateDesignDocumentStructure` and `quantize` in the feature.

## X. Follow-ups and intentional non-scope

- `FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = OPEN — OWNER_NOT_YET_ASSIGNED`.
  Carried forward unchanged, and the reason it is visible here: the browser proof
  needed a `TEMPLATE_SOURCE` Asset and there is no production intake for one, so
  the fixture seeds it. Inventing an intake API to make a run possible is exactly
  what that follow-up exists to prevent. The gate fails if the follow-up stops
  being recorded.
- **Resume across a page reload** is not implemented (§N). `APP3-S10`'s.
- No Admin or backend debt was opportunistically closed.

## Y. Changed files

**New — Storefront feature** (25 files, 2001 lines, largest 170):
`src/app/san-pham/[slug]/thiet-ke/page.tsx` (72) ·
`features/design-studio/` — `index.ts`, `bootstrap/{studio-bootstrap-island,
studio-query-provider}.tsx`, `components/{studio-screen (170),
studio-placement-picker (99), studio-template-picker (99),
studio-template-preview (91), studio-start-actions (77), studio-session-panel
(54), studio-unavailable (45), studio-session-expired (29)}.tsx`,
`hooks/{use-studio-session (164), use-template-preview (97), use-template-list
(94), use-template-detail (63), use-studio-placement (43)}.ts`,
`model/{studio-placement (139), studio-selection (107), studio-template (91),
studio-copy (68), studio-failure (56), studio-query-keys (45)}.ts`,
`services/{studio-session.client (102), studio-template.client (97),
studio-placement.client (35)}.ts`, `styles/design-studio.scss`.

**New — tests**: `test/unit/studio-model.test.ts`,
`test/components/studio-{bootstrap,session}.test.tsx`,
`test/boundary/design-studio-source.test.ts`, `test/support/studio-fixture.ts`.
All within the 600-line test maximum.

**New — tools**: `check-app3-s01.mjs`, `check-app3-s01.sources.mjs`,
`check-app3-s01-runtime.mjs`, `check-app3-s01.test.mjs`,
`smoke-app3-s01-fixtures.mjs`, `smoke-app3-s01-object-copy.cjs`,
`smoke-app3-s01-trustworthy-origin.mjs`.

**Modified**: `features/storefront-shell/{index.ts,model/storefront-navigation.ts}`
· `src/styles/main.scss` · `test/boundary/product-detail-source.test.ts` (scoped
to its own segment now that it has a child route) ·
`packages/api-client/src/index.ts` · `tools/app3-accepted-paths.mjs` ·
`tools/check-app3-b05a.{mjs,test.mjs}` ·
`tools/check-storefront-route-authority.mjs` ·
`docs/design/FIGMA_DESIGN_INDEX.md` ·
`docs/implementation/SCOPED_COMMAND_INDEX.md` ·
`docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md`.

## Z. Validation, commit and status

Every command below was run and passed:

```
storefront jest (focused studio)          66 of the 297
storefront jest (full)                    29 suites / 297 tests, 0 fail
storefront typecheck                      clean
storefront lint                           clean
storefront build                          6 routes, thiet-ke dynamic
check-app3-s01                            PASS
check-app3-s01.test                       37 / 0
check-storefront-route-authority (+test)  PASS · 21 / 0
check-figma-design-index (+test)          PASS · 31 / 0
check-storefront-product-detail-authority PASS · 34 / 0
check-frontend-test-boundaries            PASS
check-frontend-build-boundary             PASS
check-styling-boundaries                  PASS
check-app3-g01 · check-app3-b01           PASS
check-app3-b05 (+test)                    PASS · 63 / 0
check-app3-b05a (+test)                   PASS · 52 / 0
check-app3-b07                            PASS
app3-session-response-contract (P04)      PASS
api-client typecheck · jest · check:generated   clean · 44 / 44 · up to date
pnpm lint (global control)                24 / 24
pnpm format:check · git diff --check      clean after one `pnpm format`
```

Not run, as §31 directs: `pnpm quality`, the full API suite, DB integration, the
worker suite, repository E2E, Figma mutation, `pnpm install`, OpenAPI generation,
client generation, `APP3-B06C`.

One note worth carrying: `check-app3-b07.mjs` takes several minutes. Two runs
were killed by a 100 s and a 200 s timeout and looked like a hang; it is slow,
not stuck.

```
Commit A = 014ccda  feat(storefront): add Studio bootstrap and Template selection
Commit B = docs(app3): record APP3-S01 evidence   (this report only)

APP3-B05A = COMPLETE — REVIEW_ACCEPTED
APP3-S01  = COMPLETE — REVIEW_DELIVERED
APP3-S02  = BLOCKED_BY_APP3-S01_REVIEW_ACCEPTANCE
APP3-B06C = READY — NOT STARTED
```

Branch `production`, working tree clean, Commit A immediately precedes Commit B,
nothing pushed. `APP3-S01` is **not** self-accepted.
