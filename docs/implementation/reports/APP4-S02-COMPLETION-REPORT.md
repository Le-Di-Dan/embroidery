# APP4-S02 — Storefront Secure-Link Landing · Completion Report

## A. Verdict

**PASS.**

`/truy-cap` is delivered against the six approved `APP4-D01` rows. The
load-bearing invariant is proved mechanically in a real browser:

```text
capture #t=  →  history.replaceState  →  clean URL  →  POST token in body
```

At the instant the resolve request was observed leaving the browser,
`location.hash` was `""`, `location.href` contained no token, and
`history.state` contained no token. No request of any kind — XHR or `fetch` —
was issued before the strip.

S02 adds **0 backend endpoints**, **0 migrations**, **0 OpenAPI changes** and
**0 generated-client regenerations**. `NO_APP4_MIGRATION` holds.

**No full regression/test chain was run.**

---

## B. Entry and authority

### B.1 Accepted entry, verified

| Fact | Verified against |
|---|---|
| `APP4-D01 = COMPLETE — PRODUCT_OWNER_APPROVED` | `docs/implementation/reports/APP4-D01-COMPLETION-REPORT.md` |
| six S02 rows `APPROVED_FOR_IMPLEMENTATION` | `docs/design/FIGMA_DESIGN_INDEX.md` lines 684–689 |
| approval evidence `FIG-APPROVAL-APP4-D01-PO-001` | same rows, evidence column |
| B06 resolver exists at `POST /api/public/secure-links/resolve` | `packages/contracts/openapi/openapi.generated.json`; generated client line 832 |
| B06 failure contract `404 / SECURE_LINK_UNAVAILABLE` | `APP4-G01` PO-04, `IMP-D049` |
| B05/W01 render outbound links with fragment transport | `apps/worker/src/jobs/notification-delivery/domain/secure-link.renderer.ts` |
| canonical route `/truy-cap` | `IMP-D049` PO-05; `SECURE_LINK_LANDING_PATH` in `storefront-origin.config.ts:41` |
| canonical fragment prefix `#t=` | `SECURE_LINK_FRAGMENT_PREFIX` in the same file, line 44 |

### B.2 Authority resolved in order

`ADR-APP4-001` §11 → `IMP-D049` PO-04 / PO-05 / PO-06 / PO-12 → the approved
`APP4-D01` S02 nodes → the generated B06 contract → the accepted `APP4-S01`
Storefront architecture and secrecy patterns.

No conflict was found, so no block was raised.

### B.3 Root-script audit (§5) — the ordering is provable

The mandatory blocker `FRAGMENT_STRIP_ORDER_UNPROVABLE` does **not** apply.
Audited `apps/storefront/src` in full:

| Looked for | Found |
|---|---|
| `next/script` / `<Script>` | none |
| analytics, `gtag`, `dataLayer`, tag manager | none |
| `navigator.sendBeacon` | none — the only two hits are Studio **comments** explaining why a beacon is deliberately *not* used |
| third-party SDK, pixel, external origin | none |
| global client effect issuing a request | none — `app/layout.tsx` is a Server Component rendering only `StorefrontShell`, itself a Server Component |
| global provider / global QueryClient | none — the Storefront is server-first; every TanStack client is route-local |

So nothing application-controlled can observe the fragment before S02 removes
it, and the browser proof in §P confirms it empirically rather than by
inspection alone.

**One honest observation.** Next's App Router performs its *own*
`history.replaceState` during hydration, and that first call re-writes the
token-bearing URL (`/truy-cap#t=…`) into the current history entry. It is a
same-document history write inside the browser — no network, no `Referer`, no
log — and S02's own `replaceState` follows it and removes the fragment before
any request. The proof therefore identifies the **cleaning** replaceState (the
one whose URL has no `#`) and measures ordering against *that*, not merely
against "the first replaceState", which would have been a true statement about
the wrong event.

---

## C. Approved registry rows consumed

Sub-section `03 — S02 · Secure-Link Landing`, node `621:7`, file
`BQwqV8GdfUIELvsQDB1UQE`, page `APP_04`.

| Registry ID | Node | State | Consumed as |
|---|---|---|---|
| `FIG-SECURELINK-DESKTOP-BOOTSTRAP` | `629:3` | Bootstrap / resolving | `SecureLinkBootstrapCard` |
| `FIG-SECURELINK-DESKTOP-AUTHORIZED` | `629:20` | Valid grant | `SecureLinkAuthorizedCard` (desktop half) |
| `FIG-SECURELINK-DESKTOP-UNAVAILABLE` | `629:37` | Unavailable | `SecureLinkUnavailableCard` |
| `FIG-SECURELINK-DESKTOP-NETWORKERROR` | `629:53` | Transient error | `SecureLinkErrorCard` |
| `FIG-SECURELINK-MOBILE-AUTHORIZED` | `629:70` | Valid grant | `SecureLinkAuthorizedCard` (mobile half) |
| `FIG-SECURELINK-MOBILE-UNAVAILABLE` | `629:87` | Unavailable | same component, mobile type scale |

Shared annotations read and applied: `634:38` security UX rules (`634:53`–`634:58`
govern the token), `634:103` responsive reference (`634:119` S02 row, `634:127`
mobile control height), `634:134` accessibility notes (`634:145`, `634:146`,
`634:150`), `634:59` non-enumeration contract.

**No Figma node was modified.** The registry checker was not run, because the
registry was not changed.

### C.1 A divergence in the approved frames, represented rather than resolved

`629:20` and `629:70` are not the same card at two sizes — they carry
**different words** in six places (badge, title, body, slot title, slot note,
caption). Both are approved, so both are rendered and CSS chooses which is
visible at the shared `768px` breakpoint. The two candidate strings live as two
`<span>`s **inside one element**, so the document still has exactly one `h1`;
rendering two headings and hiding one would leave two in the DOM, which is what
the runtime assertion counts.

`629:37` and `629:87` diverge only in type size — the words are byte-identical,
which the browser proof confirms — matching `634:119`'s statement that the
unavailable state keeps its layout at both sizes.

---

## D. Fragment-bootstrap architecture

```text
apps/storefront/src/app/truy-cap/page.tsx          thin Server Component, noindex
apps/storefront/src/features/secure-link-access/
  api/secure-link.client.ts                        one generated operation
  model/secure-link-fragment.ts                    read + strip, no React
  model/secure-link-state.ts                       4 states, failure→outcome rule
  model/secure-link-copy.ts                        all copy, node ids inline
  hooks/use-secure-link-resolution.ts              the bootstrap ordering
  ui/secure-link-query-provider.tsx                route-local TanStack client
  ui/secure-link-screen.tsx                        state routing, live region, focus
  ui/secure-link-bootstrap-card.tsx                629:3
  ui/secure-link-authorized-card.tsx               629:20 / 629:70
  ui/secure-link-unavailable-card.tsx              629:37 / 629:87
  ui/secure-link-error-card.tsx                    629:53
  ui/responsive-text.tsx                           the approved copy pair
  styles/secure-link-access.scss                   measured geometry
```

The route is a Server Component that names the page and mounts the capability.
Everything below it is client-side and **must** be: the credential lives in the
URL fragment, which no user agent sends to the origin. The server cannot see it
and is not meant to.

Fragment parsing is a pure pair of functions with no React in scope, separately
testable, and the only place in the feature that knows a carrier exists.

---

## E. Strip-before-request ordering proof

### E.1 In source — straight-line, not scheduled

The order is three statements in one synchronous block in
`use-secure-link-resolution.ts`:

```text
const token = readSecureLinkToken(window.location.hash);   // 1 capture
stripSecureLinkFragment(window.history, window.location);   // 2 strip
if (token === undefined) { dispatch UNAVAILABLE; return; }  //   short-circuit
tokenRef.current = token; resolve.mutate();                 // 3 request
```

It is deliberately **not** arranged by `useLayoutEffect`, a `setTimeout`, a
promise chain or a second effect. Every one of those makes ordering a property
of the runtime that a later edit could reorder while every test still passed.
`replaceState` is synchronous, so the address bar is clean before `mutationFn`
is invoked, let alone before Axios opens a socket.

The strip is **unconditional** and precedes the short-circuit, so a malformed
fragment is removed too (§14).

A `bootstrappedRef` guard makes the effect one-shot. Without it React's
development double-invocation would run it twice, find the fragment already
stripped, and render "unavailable" over a perfectly valid link — a bug visible
only in development.

### E.2 In the browser — measured, not read

Instrumentation was installed via `page.addInitScript` **before any application
script ran**, patching `History.prototype.replaceState`,
`XMLHttpRequest.prototype.open/send` and `window.fetch` with a monotonic event
counter. Journey A, at 1440:

| Fact | Observed |
|---|---|
| event order | `1:script-start` → `2:replaceState` (Next's, still `#t=…`) → `3:replaceState` (**S02's, `/truy-cap`**) → `4:xhr-send` |
| cleaning strip precedes the request | **true** |
| requests before the cleaning strip | **`[]`** — none, XHR or `fetch` |
| `location.hash` at send | `""` |
| `location.href` at send contains token | `false` |
| `history.state` at send contains token | `false` |
| request URL contains token | `false` |
| request method | `POST` |
| request body | exactly `{"token":"…"}` — nothing else |
| resolve requests sent | `1` |
| `pushState` calls | `0` |

The same ordering was re-verified independently in Journeys B and C and at 390.

### E.3 In jsdom

Four component tests capture `location.hash`, `location.href` and
`history.state` **from inside the mock at call time**, not afterwards — a check
made after settlement would be true for the wrong reason.

---

## F. Token lifetime and secrecy

The token exists in exactly three places: the initial `location.hash`, one
`useRef` in the controller, and one request body in flight.

| Exit | Cleared |
|---|---|
| successful resolution | yes — `onSuccess` |
| definitive `404` | yes — `onError`, after the transient branch returns |
| missing / malformed fragment | yes — never assigned |
| unmount | yes — `useEffect(() => clearToken, …)` |
| transient failure | **deliberately not** (see below) |

Three independent mechanisms guard it, which is intentional: the ref (never
rendered, never snapshotted by React), a mutation declared with **no variables**
(`mutate()` takes no argument; `mutationFn` reads the ref, so TanStack's
retained `variables` is permanently `undefined`), and `reset()` on settlement
plus `gcTime: 0` on the route-local client. A single mechanism is one refactor
away from removal by someone who does not know why it was there.

**Verified absent from:** URL, query, path, `history.state`, `localStorage`,
`sessionStorage`, cookies, IndexedDB, the DOM, the console, the TanStack query
cache, the TanStack mutation cache (`variables` and `data`), and every rendered
string — in jsdom and in the browser, on the success, refusal and transient
paths.

### F.1 The one case that keeps it, and why

A transport failure carries **no verdict**. The fragment is already gone and
cannot be read twice, so destroying the token there would turn a flaky
connection into a permanently dead link. It stays in the same ephemeral ref —
not storage, not the URL, not the cache — and dies with the component.

Because nothing is persisted, a **reload** after the strip cannot recover the
credential and falls into the same unavailable state as a visit with no
fragment. That is the intended behaviour, and a browser leg proves the reverse
too: after a transient failure and a fresh mount, no request is made at all.

The retry guards on the token itself (`if (tokenRef.current === '') return;`)
rather than on the status, so a retry can never fire with an empty credential.

### F.2 Bytes are never normalized

`slice` and a pattern test — no `decodeURIComponent`, no `trim`, no case fold,
no `URLSearchParams`. Each would silently turn a valid credential into a 404
nobody could explain. The gate refuses any of them appearing in the parser.

---

## G. Generated-client and TanStack boundary

**Operation:** `publicSecureLinkResolve(resolveSecureLinkBody, options)` —
verified in `packages/api-client/src/generated/embroidery-api.ts:832`, not
assumed.

It was **not** on the curated boundary, so §9's narrow curated export was added
to `packages/api-client/src/index.ts`: the operation,
`SecureLinkResolutionResponseScopeKind` as a value, and the two types
`ResolveSecureLinkBody` / `SecureLinkResolutionResponse`. It crosses **alone**,
and the boundary comment records why: a second "why did that fail" operation
beside it would be the enumeration oracle the 404 collapse exists to prevent.

No regeneration, no manual edit of generated files, no deep import, no
hand-written URL, no raw `fetch`, no raw Axios. The request body is built
through `ResolveSecureLinkBody` so the token cannot land in the wrong field and
still compile.

**TanStack:** one handwritten mutation, `retry: false`, no variables, `reset()`
on settle. The route-local client sets `retry: false, gcTime: 0` for both
queries and mutations. No Zustand. No polling — the checker refuses
`setTimeout`, `setInterval`, `refetchInterval` and `useQuery` in the controller.

### G.1 The token shape is the contract's

`ResolveSecureLinkBody.token` publishes `^[A-Za-z0-9_-]{43}$` (256 bits of
CSPRNG entropy in unpadded base64url, `IMP-D049` PO-06). Orval emits it as
JSDoc rather than as a runtime value, so it cannot be imported. The parser
holds it as `SECURE_LINK_TOKEN_PATTERN_SOURCE` and **the S02 gate reads the
generated schema file and asserts the two strings are equal** — the only
mechanical link available, and better than a transcription nobody checks.

---

## H. Bootstrap / loading

`629:3` renders from the first paint until B06 answers: title, body, four
skeleton bars (the fourth short), caption. The bars are `aria-hidden` — they
carry no information a screen reader could use, and the polite live region
already announces that the link is being checked.

No token field, no "checking token…", no request id, no customer or request
data. The skeleton is a placeholder and stays one; nothing is fetched to fill
it. `APP4-D01` drew no mobile bootstrap frame, so it serves both sizes under
the shared responsive rule (`634:119`) — §20 forbids inventing one.

---

## I. Authorized shell

`629:20` / `629:70`: verified badge, heading, body, dashed handoff slot with its
two labels, and the sharing caption.

**Nothing from the grant is rendered.** `customRequestId`, `expiresAt` and
`scopeKind` are all safe to hold and none is drawn on either approved frame, so
none is printed: not the request id (an opaque identifier the customer cannot
use, and an invitation to build a lookup surface for it), not the expiry (a
countdown APP4 was never asked to show). A component test asserts each of the
three values is absent from the rendered text, and the browser scan confirms it
against the live DOM.

No quotation, design, payment, approval or submission action. The browser
proof records **zero** `<button>`, `<form>` and `<a>` elements inside the
authorized card. The dashed slot is the APP5 boundary made visible rather than
papered over, exactly as `APP4-P00` §F anticipated.

---

## J. Unavailable — non-enumeration

One state, `629:37` / `629:87`, for every definitive refusal.

`SecureLinkUnavailableCard` **takes no prop describing why** — not because the
value is unused but because it does not exist. The gate refuses `cause`,
`reason` or `errorCode` appearing in its signature.

The failure→outcome rule is stated as *"a transient outcome is the absence of an
answer; everything else is an answer"* rather than as `if (status === 404)`.
Keying on the code string would fall through to "transient" if the envelope were
ever malformed — offering a retry loop against a link that will never open.

**Proved indistinguishable.** A component test renders six plausible backend
causes (unknown, expired, revoked, superseded, wrong target, wrong purpose)
through the same published 404 and compares the six outputs **against each
other** — `new Set(rendered).size === 1`. A snapshot would only prove each
matches a file; this proves they are identical. Each test also asserts the
backend message text never reaches the DOM.

Only **one** browser 404 journey was run: B06 already owns the collapse, and six
browser journeys would prove nothing the contract does not already guarantee.

No cause-specific copy: the gate refuses ten phrases a well-meaning author would
reach for while making the screen "more helpful". No second diagnostic request —
the request count is asserted at exactly one.

---

## K. Transient retry

`629:53`, used only when **no verdict was received**: network failure, timeout,
`5xx`, `503`, and `429`.

`429` is classified transient deliberately. B06's limiter counts *requests,
never outcomes*, precisely so it cannot become a token-validity oracle
(`IMP-D049` PO-12) — which is exactly why a 429 says nothing about the token.

Manual retry only. No automatic retry, no backoff, no timer. The raw Axios or
backend error is never shown; it could disclose an endpoint, a request id or a
status the non-enumeration contract keeps quiet.

Browser Journey C: first resolve aborted at the transport layer → transient card
→ click "Thử lại" → success. Observed: two resolve requests, both with
`location.hash === ""`, both bodies exactly `{"token":"…"}` with the **same**
token, the fragment never restored, and no storage, cookie or history write
introduced to make the retry possible.

---

## L. Missing / malformed fragment

No API call. Clean URL anyway. Same screen as a definitive 404 — proved by
comparing the two rendered card texts for equality in both jsdom and the
browser (`unavailableIdentical_404_vs_noFragment: true`).

Refused without a request, each stripped anyway: a wrong key, a 42-character
token, a right-length token containing `+`/`/` (base64, not base64url), an empty
value, and extra parameters after the token. Parsing is bounded before any
pattern is applied, so a hostile megabyte fragment is answered without being
examined. A `?t=` query is ignored entirely.

This is what stops fragment syntax from becoming a probe.

---

## M. Responsive fidelity

Measured in a real browser at both approved viewports:

| | drawn | 1440 | 390 |
|---|---|---|---|
| card width | 560 / 350 | **560** | **350** |
| card padding | 32 / 20 | **32px** | **20px** |
| card gap | 18 / 16 | **18px** | **16px** |
| card radius | 24 | **24px** | **24px** |
| title | 24 / 22 | **24px** | **22px** |
| badge radius | 999 | **999px** | **999px** |
| slot border | dashed, 16 | **dashed 16px** | **dashed 16px** |
| control height | 49 desktop · ≥52 mobile (`634:127`) | **51** | **52** |
| horizontal overflow | none | **false** | **false** (390 = 390) |

**The one delta, stated plainly.** The desktop control measures 51px against a
drawn 49px. The 2px is the CSS border, which Figma's centred stroke does not add
to an auto-layout height. Distorting the approved 15px padding to absorb it
would trade a real approved measurement for a rendering artifact, so it was not
done.

Getting there caught a genuine bug: the control initially used the body leading
(1.35), producing 54px. The frames' label text nodes are 19px at 16px type
(`629:49`), so the drawn leading is 1.19 — `$line-height-control: 1.2` restores
it. `normal` was tried first and resolves to ~1.4 for the brand face, which is
how a control drifts off its geometry with nothing looking wrong on screen.

Mobile control lands on exactly the 52px `634:127` requires.

---

## N. Accessibility

- Exactly **one** `h1` in every state, owned by the mounted card — verified in
  the browser for all four states, including the authorized card whose two
  approved wordings are two spans inside one heading.
- Exactly **one** `main`, one `header`, one `footer` — all from the shell.
- Polite `aria-live` region announcing each state, because the page changes with
  no user action and a screen reader would otherwise experience three different
  outcomes as silence (`634:145`, `634:146`).
- Focus moves to the new heading once resolution settles (`activeElement: H1`
  observed in every settled browser leg); the heading carries a visible focus
  ring, since a programmatic focus with no indicator is a keyboard user losing
  their place silently. Bootstrap does **not** take focus.
- Retry is a real `<button type="button">`, keyboard reachable, with a visible
  focus ring and a disabled state while in flight.
- No colour-only distinction (`634:150`): the badge, the warn alert and the
  error alert each carry their own words.
- The skeleton pulses only inside `@include styles.motion-safe`, honouring the
  existing reduced-motion system rather than inventing one.
- `robots: { index: false, follow: false }`, following the S01 security-route
  convention. No SEO copy, no canonical, no Open Graph — none of those fields
  may carry a token, and having none of them is the simplest guarantee.
- `prefetch={false}` on the "Về trang chủ" link. It only ever renders after the
  strip, so a prefetch could not observe a token — but a route whose security
  argument is "nothing else here talks to the network" is easier to keep true
  than to re-verify whenever Next changes its prefetch heuristics.

---

## O. Component tests

`apps/storefront/test/components/secure-link-access.test.tsx` (28) and
`secure-link-access-secrecy.test.tsx` (10) — **38 tests, 2 suites, all passing**.

Fragment/bootstrap: canonical capture; fragment removed; **clean URL sampled at
call time**; body sent once and only the body; missing fragment → unavailable
with no call; five malformed forms → unavailable with no call, stripped anyway;
query string never read.

Success: authorized shell; both approved wordings present with one `h1`; no
grant field on screen; no button, form or link; no second landmark.

Unavailable: 404 → canonical state; six causes byte-identical to each other; no
cause-specific copy; exactly one request; identical to the no-fragment screen.

Transient: network, 503, 429 and 500 → transient state; no automatic retry
(asserted after a real delay); manual retry sends exactly one new request with
the same token; no retry offered after a definitive verdict.

Secrecy: no token in any observable surface after success, after refusal, or
while a retry is pending; `variables` always `undefined`; no `variables` key in
the serialised mutation state; nothing in storage or cookies; nothing in the
console including on the refusal path; nothing in history state across the whole
retry flow; nothing persisted that survives a remount.

The synthetic token literal lives in `test/support/secure-link-fixture.ts` and
deliberately appears nowhere in this report.

---

## P. Browser security proof

Against the running dev Storefront at `embroidery.local`, at **1440** and
**390**, in isolated browser contexts.

**Journey A — success.** Covered in §E.2. Post-settlement sweep of URL, history
state, `localStorage`, `sessionStorage`, cookies, DOM and console: `leakedSurfaces: []`.
One `main`, one `h1` ("Bạn đã vào khu vực riêng"), zero controls, dashed slot,
badge showing the desktop wording, live region announcing the result, focus on
the heading, and none of the three grant field values present in the DOM.

**Journey B — unavailable.** One 404. Exact approved copy. Identical to the
no-fragment leg. Card 560, no overflow, focus on the heading.

**Journey C — transient manual retry.** Transport abort → transient card →
retry → success. Two requests, both clean, same token, fragment never restored,
nothing persisted, token gone afterwards.

**390 leg.** Authorized renders the mobile wording set (`Đã xác thực` ·
`Khu vực riêng của bạn` · `Liên kết hợp lệ.` · `Nội dung yêu cầu (APP5+)` ·
`APP4 chỉ dựng khung đã xác thực.` · `Vui lòng không chia sẻ liên kết này.`) and
the desktop wordings are `display: none`, so exactly one of each pair is in the
accessibility tree. Unavailable is byte-identical to desktop. No horizontal
overflow (scrollWidth 390 = clientWidth 390).

**Console.** Only the stubbed transport's own network line (`404` or
`ERR_CONNECTION_FAILED`) plus the Next dev HMR/React-DevTools info messages. **No
application error from S02**, and nothing written by the feature itself.

### P.1 Limitation, stated plainly

The resolve call was served by a Playwright route stub scoped to
`**/api/public/secure-links/resolve`. Everything else — shell, CSS, routing,
Next runtime, hydration, history — was real, and the instrumentation ran in the
page before any application script.

The dev **API container is still unhealthy** and the gateway answers `502` for
both `/api/healthz` and the resolve route. That is `FU-APP4-DEV-API-IMAGE-01`
from S01, unchanged, pre-existing and outside this checkpoint's change impact,
so it was recorded rather than repaired (§25).

**This is not live cross-layer proof, and is not claimed as such.** The full
API + browser secure-link journey belongs to `APP4-E01`.

### P.2 Dev-environment note

The Storefront container needed a restart three times: once after a Sass
compile error, and twice because Next's dev server kept serving a **stale
compiled stylesheet** — the second time silently, reporting the old
`line-height` while the source already held the new one. A measurement taken
before that restart would have been a confident number about a bundle that no
longer existed. Consistent with the recorded dev quirk that a container restart
is required for some source changes to take effect.

---

## Q. S02 checker

`tools/check-app4-s02.mjs` + `tools/check-app4-s02.test.mjs` — **34 mutation
tests, all passing**. It reads real source with comments stripped, the registry,
the generated schema file and the published OpenAPI artifact — never prose,
never this report.

It asserts: the exact route with no alternate landing surface; all six registry
rows approved with evidence and naming `/truy-cap`; the generated operation used
and exported from the curated boundary, with no hand-written URL, deep import,
`fetch` or raw Axios; the fragment key exactly `t` with the prefix derived from
it; **the accepted token shape equal to the pattern the generated contract
publishes**; no query, path or header carrier and no byte normalization; capture
before strip before request, as index ordering in straight-line source, with the
strip unconditional and the missing-token branch short-circuiting before any
`mutate`; `History.replaceState` with a pathname-and-search URL carrying no
fragment and no `pushState`; no store, storage, cookie, IndexedDB, reducer copy,
history-state write, programmatic navigation, console, analytics, beacon or
third-party script; no mutation variables, `retry: false` on both the mutation
and the route-local client, `reset()` on settle, and no timer, poll or query;
the token cleared on success, on a definitive refusal and on unmount, kept only
across a transient branch that returns before the clear, with the retry guarded
on a held token; one unavailable card accepting no cause and ten forbidden
cause-specific phrases; an authorized shell drawing no grant field, no APP5
commercial concept and no business action; four components owning one `h1` each
with the screen owning none and a polite live region; no second `main`, `header`
or `footer`; no import from a backend application; a secure-link surface still
one path; and the 400-line source limit.

Each rule is proved to **fail** when its subject is broken, using the plausible
mistakes rather than vandalism: the request moved before the strip, a strip made
conditional on a valid token, `${location.hash}` appended back into the clean
URL, `pushState` instead of `replaceState`, a `?t=` fallback, a
`decodeURIComponent`, `sessionStorage.setItem`, `mutate(token)`, `retry: 3`,
a provider that caches mutations, a success path that forgets to clear, a
transient branch reordered after the clear, a `console.error(error)`, a reducer
field named `token`, "Liên kết đã hết hạn", an unavailable card taking a
`cause`, a grant field printed on the authorized shell, a payment button, a
second `h1`, and a `<main>` in the screen.

One case keeps the gate honest rather than strict: `reads code rather than
prose`. Every file here documents at length what it deliberately does *not* do,
and a gate that failed on its own explanation would be deleted within a
checkpoint.

---

## R. Validation ledger

Change-impact only. Every successful command run once; the reruns listed below
each followed a change to a file that command covers.

| # | Command | Result |
|---|---|---|
| 1 | `pnpm --filter @embroidery/api-client exec tsc --noEmit` | PASS |
| 2 | `pnpm --filter @embroidery/api-client exec jest src/public-api.smoke.test.ts` | PASS — 12 tests |
| 3 | `pnpm --filter @embroidery/storefront exec jest --testPathPatterns=secure-link` | PASS — 38 tests, 2 suites |
| 4 | `pnpm --filter @embroidery/storefront exec tsc --noEmit` | PASS |
| 5 | `pnpm --filter @embroidery/storefront exec eslint <changed paths>` | PASS |
| 6 | `node tools/check-app4-s02.mjs` | PASS |
| 7 | `node --test tools/check-app4-s02.test.mjs` | PASS — 34 tests |
| 8 | S02-only browser journey (A, B, B′, C at 1440; authorized + unavailable at 390) | PASS |
| 9 | `npx prettier --check <changed files>` | PASS |
| 10 | `node tools/check-report-secrets.mjs` | PASS |
| 11 | `git diff --cached --check` | PASS |

**Reruns, disclosed.** (3) reran after two test-file corrections and again after
Prettier reformatted a source file. (4) reran after the test-file edit. (6) and
(7) reran after Prettier reformatted the checker itself. (8)'s measurement leg
reran after each SCSS fidelity edit and after the stale-bundle restart — a
measurement of a bundle that no longer existed is not evidence. No successful
command was rerun without a covered file having changed.

**Not run:** full Storefront Jest, full Playwright, API Jest, B06 runtime tests,
worker/W01, B05/B07/B08, DB tests, OpenAPI generation or check, generated
API-client generation, the Figma registry checker (registry unchanged), G01,
historical APP4 backend checkers, SonarQube, repository-wide build/typecheck/lint.
No Storefront production build — the route introduces no new runtime boundary.

**No full regression/test chain was run.**

---

## S. Files changed

**Added — implementation (12):**

```text
apps/storefront/src/app/truy-cap/page.tsx
apps/storefront/src/features/secure-link-access/index.ts
apps/storefront/src/features/secure-link-access/api/secure-link.client.ts
apps/storefront/src/features/secure-link-access/hooks/use-secure-link-resolution.ts
apps/storefront/src/features/secure-link-access/model/secure-link-fragment.ts
apps/storefront/src/features/secure-link-access/model/secure-link-state.ts
apps/storefront/src/features/secure-link-access/model/secure-link-copy.ts
apps/storefront/src/features/secure-link-access/ui/secure-link-query-provider.tsx
apps/storefront/src/features/secure-link-access/ui/secure-link-screen.tsx
apps/storefront/src/features/secure-link-access/ui/secure-link-bootstrap-card.tsx
apps/storefront/src/features/secure-link-access/ui/secure-link-authorized-card.tsx
apps/storefront/src/features/secure-link-access/ui/secure-link-unavailable-card.tsx
apps/storefront/src/features/secure-link-access/ui/secure-link-error-card.tsx
apps/storefront/src/features/secure-link-access/ui/responsive-text.tsx
apps/storefront/src/features/secure-link-access/styles/secure-link-access.scss
```

**Added — tests and gate (5):**

```text
apps/storefront/test/components/secure-link-access.test.tsx
apps/storefront/test/components/secure-link-access-secrecy.test.tsx
apps/storefront/test/support/secure-link-fixture.ts
tools/check-app4-s02.mjs
tools/check-app4-s02.test.mjs
```

**Modified (2):**

```text
packages/api-client/src/index.ts      narrow curated export of the B06 operation
apps/storefront/src/styles/main.scss  one @use for the feature stylesheet
```

**Unchanged:** all backend source, database schema, migrations, the OpenAPI
artifact, every generated file, and all of `APP4-S01`. Every source file is well
inside the 400-line limit; both test files are inside 600.

---

## T. Git evidence

Two commits, following the established frontend checkpoint convention.

- **Commit A** — `feat(storefront): implement APP4 secure-link landing`
  Implementation, focused tests, the S02 checker and the narrow API-client
  public export.
- **Commit B** — `docs(app4): record secure-link landing evidence`
  This report only.

Nothing pushed. Nothing squashed or amended after evidence.

---

## U. Follow-ups

**Carried forward from `APP4-S01`, unresolved here by instruction (§26):**

- `FU-APP4-S01-ATTEMPT-COUNT-COPY-01`
- `FU-APP4-S01-SUCCESS-HANDOFF-01`
- `FU-APP4-S01-ERROR-CODE-GRANULARITY-01`

**Carried forward, still open:**

- `FU-APP4-DEV-API-IMAGE-01` — the dev API container remains unhealthy; the
  gateway answers `502`. Unrelated to S02 and outside its change impact.

**New:**

- `FU-APP4-S02-LIVE-JOURNEY-01` — the live API + browser secure-link journey
  (real grant issued by B05, real link rendered by W01, real B06 resolution) is
  owned by `APP4-E01`. S02's browser proof used a scoped route stub and does not
  claim cross-layer coverage.
- `FU-APP4-S02-LIVE-REGION-COPY-01` — the polite announcements are single-copy
  while the authorized card's visible copy is viewport-variant, so a 390 reader
  hears the desktop sentence. `APP4-D01` specifies no announcement text at
  either viewport, so no approved copy was contradicted; worth a Product Owner
  view if an announcement voice is ever specified.

---

## V. Next checkpoint

```text
APP4-A01
```

Not started.

```text
APP4-S02 = COMPLETE
APP4-A01 = READY — NOT STARTED
```
