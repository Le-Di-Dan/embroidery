# APP2-A01 — Admin Assets Screen — Completion Report

**Checkpoint:** `APP2-A01` — Admin asset library (catalog-media upload, cursor
continuation, server-backed identity, post-upload processing reconciliation).
**Verdict:** `PASS`
**Status:** `COMPLETE — DELIVERED_FOR_REVIEW`
**Date:** 2026-07-28
**Implementation commit (A):** `58164122df015b08393818db9a8309bc5863a851`

---

## A. Preflight and accepted chains

`APP2_A01_PREFLIGHT = PASS`.

| Requirement | Observed |
|---|---|
| Branch | `production` |
| Entry `HEAD` | `f3619db59888e12f71f42ca0afd27b9e40afeec9` |
| Entry `HEAD` identity | `docs(app2): record Admin Assets design reconciliation evidence` — the exact `APP2-D02` evidence Commit B, read from Git (not assumed from the prompt) |
| Working tree | clean (`git status --short` empty) |
| `APP2-A01` implementation commit already present | none — `git log -36` shows the phase ending at `f3619db` |
| `pnpm quality` | `EXIT=0` |
| `pnpm check:openapi` | artifact up to date |
| `pnpm check:api-client` | up to date, tree hash `55de1cc1…` |
| `pnpm check:figma-design-index` | 70 registry IDs, 70 node rows, 9 tables |
| `node --test tools/check-figma-design-index.test.mjs` | 19 pass / 0 fail |
| `pnpm db:check:manifest` | all checks passed |
| `git diff --check` | clean |

**Accepted chains verified in Git and in the canonical documents:**

| Chain | Commits |
|---|---|
| APP1 Admin auth/shell | `APP1-B01`/`B02`, `APP1-A01` (+C1 `9aabbf0`, C2 `32a7854`), `APP1-A02` `67fd9f6`+`9310940`, closed at `APP1-X01` |
| APP2-D01 / D01-C1 | `6f6a33e`+`6b2006f`, corrected by `c40e5c4`+`34ec954` |
| APP2-B01-G01 / B01 | `62034ac`+`4e54633`; `a1cb712`+`ac81a2a` |
| APP2-DB01 | `fc7f0a1`+`cdd7b86` |
| APP2-I03 | `6252e4d`+`ae5e65a` |
| APP2-W01 | `7f01f94`+`6982e86` |
| APP2-D02 | `59be4402454537eb3293dded75b558192c0f0320`+`f3619db59888e12f71f42ca0afd27b9e40afeec9` |

**Disclosed entry divergence (unchanged from `APP2-D02`).** §1 of the prompt
lists `APP2-DB01`, `APP2-I03`, `APP2-W01` and `APP2-D02` as
`COMPLETE — REVIEW_ACCEPTED`. The repository records all four as
`DELIVERED_FOR_REVIEW`; only `APP2-B01` carries `REVIEW_ACCEPTED`. The work
proceeded on the prompt's instruction to treat them as accepted, but the record
is stated here rather than silently adopted.

---

## B. Figma / approval live-node audit

All nine nodes were re-opened in file `BQwqV8GdfUIELvsQDB1UQE`, page `APP_02`
(`419:3`), and their text content and instance sets were read from the live
document (not from screenshots — the Uploading/Processing/Rejected frames clip
their grid at the frame bottom, so a picture cannot prove what a frame does or
does not contain).

| Registry ID | Node | Read back |
|---|---|---|
| `FIG-ADMIN-ASSETS-DESKTOP-DEFAULT` | `426:13` | 1440×1092; 6 cards; `Button / Secondary / Tải thêm tài sản` present |
| `FIG-ADMIN-ASSETS-DESKTOP-EMPTY` | `429:6` | 1440×1024; empty copy; **no** continuation control |
| `FIG-ADMIN-ASSETS-DESKTOP-UPLOADING` | `429:89` | banner `Đang tải lên · hoa-sen-moi.png`, `Đã tải 62% …`, `Huỷ tải lên` |
| `FIG-ADMIN-ASSETS-DESKTOP-PROCESSING` | `430:12` | banner + indeterminate copy, no percentage |
| `FIG-ADMIN-ASSETS-DESKTOP-REJECTED` | `430:98` | rejection copy + `Tải ảnh khác lên`, `Xoá khỏi danh sách` |
| `FIG-ADMIN-ASSETS-MOBILE-DEFAULT` | `432:18` | 390×844; one column; full-width continuation |
| `FIG-ADMIN-ASSETS-MOBILE-UPLOAD` | `433:19` | 390×844; drag/drop replaced by the mobile hint |
| `FIG-APP2-ASSET-CATALOG-NOTES` | `450:404` | status map, upload-vs-processing rules, continuation rules, identity rules, responsive rules |
| `FIG-ADMIN-ASSETS-CONTINUATION-IDENTITY` | `484:272` | the five continuation/identity sections implemented here |

Registry status re-read: the seven screen rows are
`APPROVED_FOR_IMPLEMENTATION` with evidence
`FIG-APPROVAL-APP2-D01-ADMIN-001`; authority is
`PRODUCT_OWNER_APPROVED — FROZEN — D02_RECONCILED`
(`docs/design/approvals/APP2-D01-ADMIN-ASSETS-DESIGN-APPROVAL.md`).
**No Figma node, registry row or approval record was modified by this
checkpoint**; the gate still reports 70 IDs.

### One design/contract contradiction — reported, not silently resolved

The Rejected frame (`430:98`) and the notes node offer a second safe action,
`Xoá khỏi danh sách`. **`APP2-B01` exposes no delete or hide operation**, and
§18 of this checkpoint explicitly forbids deletion. A control with that label
that removed nothing from the list would be a false statement to the operator,
and no backend route may be added here. The action is therefore **not
implemented**; the rejected state ships with its approved primary action
(`Tải ảnh khác lên`) only, and the rejected asset remains visible in the
collection as unusable. This is the single approved affordance omitted, and it
needs either a product decision (accept the omission) or a future backend
capability. It is not a defect that a correction to A01 alone can cure.

---

## C. Existing Admin / client architecture (recorded before editing)

| Concern | Actual value |
|---|---|
| Protected layout | `app/(protected)/layout.tsx` → `requireServerStaffSession()` → `AdminShell`; route group adds no URL segment |
| Navigation model | `features/admin-shell/model/admin-shell-nav.ts`; before A01 a single non-link `{ id, label, current: true }` entry |
| Route constants | `config/routes.ts` — `LOGIN_ROUTE`, `AUTHENTICATED_HOME_ROUTE` only |
| Server request helper | `config/server-api-client.ts` + verbatim `Cookie` forwarding per call (`server/resolve-staff-session.ts`) |
| Browser client | `config/browser-api-client.ts`, memoized, same-origin gateway base via `toApiOriginBase` |
| QueryClient | one per mount in `providers/app-providers.tsx`; `retry: false`; no module global |
| TanStack Query | `^5.101.2`; handwritten hooks over feature services (IMP-D023 / 06-OPENAPI-AND-CLIENT-CONTRACT) |
| Generated operations | `adminAssetList(params?, options?)`, `adminAssetUpload(body, options?)`, `adminAssetDetail(assetId, options?)` |
| Generated multipart | `FormData` appended in order `assetKind`, `classification`, `file`; `Content-Type: multipart/form-data` on the generated config |
| Per-call override seam | `apiRequest(requestConfig, { instance, config })`, `config` spread **after** `requestConfig` |
| Envelope handling | operations return the envelope; services read `.data` |
| Error normalization | `normalizeApiClientError` → `NormalizedApiError { code, message, httpStatus?, requestId?, fieldErrors? }` |
| Sass entry | `src/styles/main.scss`, one leaf stylesheet per feature |
| Tests | `apps/admin/test/**`, 143 tests / 23 suites before this checkpoint |

`AdminAssetDetailResponse.status` is typed **`string`**, not a closed union;
`mediaType` *is* a closed union. Both facts shaped §G.

---

## D. Route, navigation and feature ownership

- Canonical route: **`/assets`**, one constant
  (`features/assets/model/asset-route.ts`, `ADMIN_ASSETS_ROUTE`), owned by the
  capability and consumed by both the segment and the shell navigation. No
  `/admin/assets`, `/media` or `/catalog/assets` alias exists anywhere (asserted
  in `assets-navigation.test.tsx`).
- Segment: `app/(protected)/assets/page.tsx` — inside the accepted authenticated
  shell, so the APP1 session guard and shell chrome are inherited unchanged.
- Navigation: `Tài sản hình ảnh` is now a real destination. Because the shell
  gained its first business route, entries became links and `current` is derived
  from the pathname (`isCurrentNavItem`) instead of being hard-coded. The
  current entry is still static text with `aria-current="page"`, never a link to
  itself, so the "no dead anchors" rule is preserved and strengthened.
- The `Sản phẩm` entry visible in the approved frames is **not** rendered: its
  route does not exist until `APP2-A02`. Adding it now would be exactly the dead
  anchor the shell forbids.
- Ownership follows the repository's feature-first convention
  (`components/ hooks/ model/ services/ styles/`) rather than the
  `constants/ utils/ types/` sketch in §5, which §5 defers to. Pure logic and
  constants live in responsibility-named `model/` files; there is no
  `helpers.ts`-style catch-all. Every folder created contains real files.
- No business logic in the route file (asserted in `assets-source.test.ts`).
- Largest logic file: `hooks/use-asset-upload.ts` at 220 lines (limit 400);
  largest test file 366 lines (limit 600).

---

## E. Generated-client and multipart transport gate

The gate in §13 was **proved before implementation**, not assumed. It is
re-proved on every run by `test/services/asset-upload-transport.test.ts`, which
executes the real generated operation and the real mutator against a stub Axios
instance:

| Requirement | Evidence |
|---|---|
| Ordered multipart parts | captured body is a `FormData` whose keys are exactly `['assetKind','classification','file']` — both metadata parts before the file part, as B01 requires |
| Fixed metadata values | `CATALOG_MEDIA` / `PRODUCTION_SENSITIVE`, taken from the generated enums `AdminAssetUploadBodyAssetKind` / `…Classification`, not written as literals |
| Generated URL/method | `POST /api/admin/assets/upload` from the generated operation; no handwritten path anywhere in the feature |
| `Idempotency-Key` | present on the captured request headers |
| `AbortSignal` | the exact `controller.signal` instance reaches the request |
| Upload progress | the exact `onUploadProgress` callback reaches the request |
| No manual boundary | no `boundary` string in the captured headers |

**Recorded transport detail.** The mutator merges the per-call `config` *after*
the generated request config, so supplying `headers` replaces the generated
`Content-Type: multipart/form-data`. That is the correct outcome and is
deliberate: Axios derives the multipart content type *and its boundary* from the
`FormData` body, whereas a hand-set `multipart/form-data` without a boundary is
unparseable. No boundary is ever written by this code.

The three B01 operations are consumed through the api-client **public**
boundary. They were not exported there before, so
`packages/api-client/src/index.ts` gained re-exports (+18 lines). This is a
handwritten index file, not generated code: the drift gate hashes
`src/generated` only and still reports `55de1cc1…`. No operation, schema or
generated file was altered.

---

## F. Cursor list and continuation

Implemented exactly as `IMP-D031` / node `484:272` specify.

- `useInfiniteQuery` under one key factory; `limit: 20` (the server default,
  sent explicitly); `getNextPageParam` returns a cursor **only** when `hasNext`
  is true *and* `nextCursor` is a non-empty string. A stale cursor on a last
  page, or `hasNext` without a cursor, yields no continuation.
- No offset, page number or total count exists anywhere in the feature.
- **Initial states** are derived from the query, never from a local flag:
  loading → approved loading status; successful empty first page → empty state;
  first-page failure → unavailable state + retry; populated → all accumulated
  pages in server order. Empty is never shown while loading or after a failure.
- **Load More** (`Tải thêm tài sản`) sits after the collection in normal content
  flow. It appends, retains prior items, moves no focus and triggers no scroll.
  There is no infinite scroll and no viewport-triggered request
  (`IntersectionObserver` appears nowhere).
- **Continuation loading**: button disabled, label `Đang tải thêm…`, visible
  spinner, `aria-busy="true"`, all rows still rendered — no skeleton swap — and
  exactly one polite announcement (`Đã tải thêm tài sản.`) per successful
  append, driven by a page-count transition rather than by every query event.
- **Continuation error**: rows stay, inline `Không thể tải thêm tài sản.` with
  an adjacent `Thử lại`; the full-list unavailable state is not used and the
  list is not invalidated back to page 1. TanStack keeps the page param of the
  last **successful** page, so retry re-sends the identical cursor — asserted on
  the actual call arguments (`cursor-2` on both the failed and the retried call).
- **End**: `hasNext: false` removes the control; no end-of-list sentence, no
  `6 / 42`, `Tổng cộng 42` or `Trang 1 / 7` (asserted by scanning rendered text).
- **Duplicates**: `flattenAssetPages` keeps the first occurrence per `assetId`,
  never reorders prior items and logs nothing. This matters in practice: an
  upload shifts the keyset window, so a boundary asset can legitimately appear
  on two pages.

---

## G. Server-backed identity and status

- Title from `mediaType`: `image/png → Ảnh PNG`, `image/jpeg → Ảnh JPEG`,
  `image/webp → Ảnh WebP`; anything else (including `IMAGE/PNG`, a new type, a
  non-string) → `Tài sản hình ảnh`. A raw MIME string is never a title.
- Secondary line `{size} · {createdAt}` — e.g. `2,4 MB · 27/07/2026, 14:35`.
- Formatters are **explicit**, not `Intl`-based. The approved output is exact
  and `Intl` unit/date output varies by ICU build, so an explicit formatter is
  the only way the tests can pin the string on every supported runtime. Sizes
  are binary (`B`/`KB`/`MB`, 1024-based, one decimal with a vi-VN comma, a
  trailing `,0` dropped); dates are `dd/MM/yyyy, HH:mm` zero-padded in local
  time. The date test builds its input from **local** parts, so it holds in any
  host timezone and tests the formatter rather than the TZ database.
- Invalid input fails safely: a non-finite or negative size and an unparseable
  timestamp both return `null`; the usable half is shown alone, and when neither
  is usable the bounded neutral `Chưa có thông tin chi tiết` is rendered. The
  raw value is never echoed.
- Forbidden identity sources are absent and asserted: no storage key, checksum,
  `assetId` fragment, classification, kind, inspection detail or worker log.
- `File.name` appears only in the local *selected* and *uploading* bands. From
  the server's 202 onward the banner switches to the server-backed title, and
  the `File` reference is released at that point — the authoritative answer is
  the moment the local filename stops being the truth about the stored asset.
  It is never written to the query cache, a store, the URL or web storage.
- **Status** is parsed, not cast: `UPLOADED → Đã tải lên / Đang chờ xử lý`,
  `INSPECTING → Đang xử lý`, `ACCEPTED → Sẵn sàng`, `REJECTED → Không thể sử
  dụng`, anything else → `Chưa xác định`. An unknown value is never rendered
  raw, never inferred as ready, and stops the poll rather than looping. No type
  pretends the generated `string` field is a closed union.
- Status is never colour-only: a text label always accompanies the dot.

---

## H. Upload, idempotency, progress, cancellation

- One `File`, one `AbortController`, one `Idempotency-Key`, all inside
  `useAssetUpload` and nowhere else.
- The picker and the drop target share one validation path
  (`validateSelectedFiles`); drag/drop is desktop-only and never the sole way in
  (the mobile layout replaces it with the approved hint). `accept` is exactly
  `image/png,image/jpeg,image/webp`, the input is single-file and labelled.
- Local mirror: MIME allowlist and a **25 MiB** ceiling
  (`26_214_400`, inclusive — a file of exactly that size is accepted, the first
  byte above is not). The browser reads `File.type` and `File.size` only; it
  performs no signature check and the code never claims one. The API remains the
  authority. No decode, no `FileReader`, no `ArrayBuffer`, no base64, no object
  URL, no local persistence — all asserted statically.
- The approved support line stays formats-only; per the handoff (`450:404`)
  no size limit is advertised, so the too-large message names the outcome
  without a number (asserted: the string contains no digit).
- **Idempotency**: `crypto.randomUUID()` — cryptographically strong per the Web
  Crypto specification, and its 36-character `[0-9a-f-]` output already satisfies
  B01's 8–128 length window and `[A-Za-z0-9._:-]` allowlist (verified against
  `apps/api/src/modules/asset/domain/idempotency-key.ts`), so no encoding step is
  needed. There is **no** `Math.random()` fallback: a weak key would silently
  break the arbiter, so a runtime without Web Crypto fails loudly into safe copy.
  A new key is minted only when the operator stages a different file. It is never
  rendered, logged or persisted (asserted by scanning the rendered document for
  the exact key issued on the wire).
- **Progress** uses `loaded / selectedFile.size`, clamped to `0..99`. 100% is
  never shown before the HTTP result; `aria-valuenow` is present only when
  determinate, and the indeterminate fallback is used when the figure is not
  measurable. Processing never reuses the upload percentage.
  Because inline style props are forbidden, the bar's width is a stylesheet
  concern: the SCSS declares one width class per 5% step and the component
  **floors** into it, so 99% cannot paint a full bar. The exact figure is still
  in the visible label and in `aria-valuenow`.
- **Cancellation** aborts the transport, keeps the intent, refreshes the
  authoritative first page and states plainly that server completion cannot be
  ruled out. It never claims the server stored nothing. Retry re-sends the
  **same** key (asserted by comparing the header across attempts); nothing is
  ever re-sent automatically, and a new key is never minted to "find out" whether
  the first request landed. There is no delete/reclaim UI.

---

## I. Processing reconciliation

- After the 202, the returned `assetId` drives a `useQuery` over the B01 detail
  operation and nothing else. No object store, no database, no WebSocket, no SSE
  and no worker percentage.
- One local constant, `ASSET_PROCESSING_POLL_INTERVAL_MS = 3000`; a static test
  asserts it is the **only** declaration and that no numeric `refetchInterval`
  and no `setInterval` exists in the feature.
- The poll stops on `ACCEPTED`, `REJECTED`, an uninterpretable status, an error
  (`retry: false`, so an auth failure or outage ends it at once) and on unmount.
  Verified live: after the terminal answer, advancing three further intervals
  produced no additional request.
- On a terminal result the list is invalidated. For an infinite query that
  refetches the pages already loaded rather than discarding them, so accumulated
  continuation pages survive, and the duplicate defense in §F absorbs the keyset
  shift the new asset causes.
- The `File` and the `AbortController` are released; `gcTime: 0` on the detail
  query means a finished reconciliation leaves no cached asset behind.

**Reading disclosed.** §16 says to clear the active idempotency intent only
after reconciliation completes, while §9 says to remove the `File` once the
authoritative answer arrives. The 202 *is* that authoritative answer and no
repeat of that request can exist afterwards, so the whole intent — file and key
together — is released there rather than carrying a key that nothing can consume
until the terminal state.

---

## J. Errors, security and privacy

- All failures pass through `normalizeApiClientError` and then one mapper that
  reads **only** the stable `code` and the HTTP status. The server `message`,
  `requestId` and field errors are dropped at that boundary.
- Covered outcomes: unsupported media, signature mismatch, too large, invalid
  metadata/multipart, invalid key, idempotency conflict, upload already in
  progress, stale claim, state conflict, not found, timeout, storage
  unavailable, rate limit (429), network unavailable, session expiry (401),
  processing rejection, and a safe unknown fallback. Retryability is part of the
  mapping, so a rejected media type does not offer a pointless retry.
- Session expiry does not redirect from this feature; APP1's shell keeps its
  single auth mechanism. Continuation failure stays local to Load More.
- Asserted absent from the rendered document and from the source: raw backend or
  native errors, stack traces, request IDs, the idempotency key, object keys,
  buckets, MinIO/S3 names, presigned URLs, checksums, worker attempt or
  correlation data, SQL fragments and provider details. The feature contains no
  `console.*` call at all, so it cannot log any of them.
- No `fetch`, no ad-hoc Axios instance, no handwritten `/api/...` path, no deep
  import into `src/generated`, no second `QueryClient`, no Zustand store, no
  `localStorage`/`sessionStorage`/`IndexedDB`/`document.cookie`, no URL or query
  persistence.
- The server-only prefetch module is the single file importing `next/headers`
  and is deliberately **not** re-exported from the feature index, which Client
  Components reach.

---

## K. Responsive, accessibility and styling

- Mobile-first SCSS in one feature leaf stylesheet composed into
  `main.scss`; tokens and mixins come from `@embroidery/styles`. No inline
  styles, CSS Modules, Tailwind, CSS-in-JS or duplicated token constants
  (`pnpm check:styles` passes, `inline-style` rule included).
- Desktop grid follows the approved four-column collection; mobile is one
  column. The `1024px` threshold matches the shell so the two Admin surfaces
  switch together.
- Verified in the production build: **no horizontal overflow at 390**
  (`scrollWidth === innerWidth === 390`), Load More is full content width
  (310px = content width) and every interactive control is ≥44px. The two
  sub-44px elements found are the pre-existing APP1 skip link (off-canvas until
  focused) and the visually hidden file input, which stays in the tab order by
  design and is driven by ≥44px visible buttons.
- One `<h1>`, inside the shell's `main`. Labelled file input, keyboard-reachable
  choose-file, drag/drop non-exclusive, statuses never colour-only, determinate
  progress semantics, `role="status"` for indeterminate and terminal
  announcements, `role="alert"` for actionable failures, `aria-busy` on the
  pending continuation control, no forced focus or scroll after append, and
  animations behind the shared `motion-safe` mixin.
- The desktop `1092px` Default frame height is **not** encoded as a viewport or
  page minimum; the content simply scrolls.
- Deliberate copy divergence: the mobile frame shortens the page subtitle. One
  DOM node cannot hold two strings without duplicating markup, so the fuller
  desktop sentence renders at every width; it wraps safely at 390 and was
  reviewed there.

---

## L. Unit and component tests

**77 new tests across 7 suites**, run twice with identical results
(77 passed / 77 total, both runs). Full Admin suite: **220 passed / 30 suites**
(143 / 23 before this checkpoint).

| Suite | Covers |
|---|---|
| `test/model/asset-identity.test.ts` | exact media titles, unknown fallback, binary size formatter, exact `vi-VN` date formatter, meta line, invalid input, no identity from checksum/`assetId`/kind/classification/MIME |
| `test/model/asset-library-model.test.ts` | status mapping incl. unknown, reconciliation predicate, page flattening and duplicate suppression, cursor resolution, query keys, `accept` list, one-file rule, exact 25 MiB boundary and first byte above, SVG rejection, no size limit in copy, idempotency key format/uniqueness, every safe error mapping, redaction |
| `test/services/asset-upload-transport.test.ts` | the §13 gate: multipart part order, generated URL/method, header + signal + progress passthrough, no manual boundary |
| `test/components/asset-collection.test.tsx` | loading, empty, first-page unavailable + retry, first-page request shape, rendered identity/status with no filename, Load More visibility, append + prior rows + single announcement, loading keeps rows, same-cursor retry after failure, end removes control, no total-count copy, duplicate suppression with stable order |
| `test/components/asset-upload-flow.test.tsx` | `accept`/label/single file, staged file sends nothing, local rejection sends nothing, real progress math, no 100% before success, indeterminate fallback, server-backed identity at 202, detail-only poll on the 3000 ms constant and its stop, accepted/rejected/unknown terminal states, list reconciliation, honest cancellation, same-key ambiguous retry, new key for a new file, key never rendered, safe media-type error without a retry action |
| `test/components/assets-navigation.test.tsx` | route constant, active destination, other entry is a real link, single `h1` in `main`, no alias route |
| `test/boundary/assets-source.test.ts` | no `fetch`, no handwritten path, no generated deep import, no ad-hoc Axios/QueryClient, no storage/bucket/presign vocabulary, no media or object URL, no byte reading, no web storage/URL/store persistence, no `console.*`, one poll constant and no timer, no inline styles, no test-only import, server module off the public surface, thin route segment |

The generated client is the mocked boundary in every component test; the feature
services, hooks and components all run their production code, so the assertions
are about the request actually issued and the DOM actually rendered. No live
network is used.

Two APP1 tests were adapted to the new DOM, preserving their intent: the nav
model test now asserts every entry points at an implemented route and that
exactly one entry is current per pathname; the drawer focus-trap test now cycles
through the real navigation link. No APP1 behaviour changed.

---

## M. Production visual review

The production Admin bundle (`next build` → `next start`, port 3001) was
reviewed at **1440** and **390** against a deterministic local fixture API,
used for visual review only. Both processes and every artifact were removed
before Commit A; the tree is clean.

| State | Result |
|---|---|
| Desktop default populated | four-column grid, approved identity/meta/status, placeholder thumbnails, continuation control after the collection |
| Desktop append | 6 → 8 rows, prior rows intact, control removed at the end, `Đã tải thêm tài sản.` announced once, no horizontal overflow |
| Desktop continuation error | 6 rows retained, inline `Không thể tải thêm tài sản.` + `Thử lại`, no full-page unavailable state |
| Desktop empty | approved empty copy, no grid, no continuation control |
| Desktop first-page unavailable | approved unavailable copy + retry; the upload panel stays usable |
| File selected | `Đã chọn · vr-sample.png`, both actions 44px |
| Uploading | `Đang tải lên · <file>`, determinate bar, `Đã tải 99%` while the server withheld its answer — never 100% |
| Upload timeout | safe `Không thể tải ảnh lên` + retry (the transport timeout path, exercised unintentionally and correctly) |
| Processing | `Đang xử lý · Ảnh PNG` — filename gone, no progress bar |
| Rejected | reconciled by the 3 s poll to `Không thể sử dụng · Ảnh PNG` with the approved copy and `role="alert"`; no delete affordance |
| Mobile 390 default | one column, drop target replaced by the approved hint, full-width continuation, no overflow |
| Mobile 390 selection | 44px actions, no overflow |

Console: zero React, hydration or application errors. The only console entries
were a pre-existing missing `favicon.ico` and the two 503s the failure scenarios
deliberately injected.

Two defects were found by this review and fixed before Commit A: the grid
resolved to three columns at 1440 because the minimum track was too wide for the
shell's content region, and the new navigation links rendered with the
user-agent underline.

---

## N. Frozen artifacts and regressions

| Artifact | Baseline | After A01 |
|---|---|---|
| OpenAPI | `e19c2f76a800b9382d3e013e34759df5b9cd9090de021b5f3b2be7a5cfbf5c8f` | unchanged, artifact up to date |
| API-client generated tree | `55de1cc158cf5ab112dae8e8c63f45fe5fee9de1d36aedbb222f0fcec0a6216b` | unchanged |
| Database | 32 migrations / 78 tables / 833 columns / 190 CHECK / `82864268…` | unchanged, `NO_APP2_A01_SCHEMA_OR_MIGRATION_CHANGE` |
| Figma registry | 70 IDs | 70 IDs, no node or row touched |
| Dependencies | — | **none added** |

APP1 regressions pass: full Admin suite green, Storefront 53 tests green, API
1136 green, worker 283 green, `check:e2e` collects 32 tests.

---

## O. Commit A evidence

```text
58164122df015b08393818db9a8309bc5863a851
feat(admin): implement catalog asset intake screen
42 files changed, 3682 insertions(+), 29 deletions(-)
```

New (`apps/admin/src/`): `app/(protected)/assets/page.tsx`;
`features/assets/index.ts`; `features/assets/components/{asset-card,
asset-collection, asset-continuation, asset-library-screen, asset-status-badge,
asset-upload-banner, asset-upload-panel, asset-upload-progress}.tsx`;
`features/assets/hooks/{use-asset-list-query, use-asset-processing-query,
use-asset-upload}.ts`; `features/assets/model/{asset-copy, asset-failure,
asset-identity, asset-pages, asset-query-keys, asset-route, asset-status,
asset-upload-policy, upload-intent, upload-state}.ts`;
`features/assets/services/{asset-catalog.server, asset-catalog.service,
asset-upload.service}.ts`; `features/assets/styles/assets.scss`.

New (`apps/admin/test/`): `boundary/assets-source.test.ts`;
`components/{asset-collection, asset-upload-flow, assets-navigation}.test.tsx`;
`model/{asset-identity, asset-library-model}.test.ts`;
`services/asset-upload-transport.test.ts`; `support/asset-fixture.ts`.

Modified: `features/admin-shell/model/admin-shell-nav.ts`,
`features/admin-shell/components/admin-primary-nav.tsx`,
`features/admin-shell/styles/admin-shell.scss`, `styles/main.scss`,
`test/model/admin-shell-model.test.ts`,
`test/components/admin-shell-drawer.test.tsx`,
`packages/api-client/src/index.ts`.

Commit A was amended once, before report authoring began, to strip a stray `@`
that a PowerShell-style here-string introduced into the subject line. The
required subject is now exact.

---

## P. Validation matrix

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/admin lint` | clean |
| `pnpm --filter @embroidery/admin typecheck` | clean |
| `pnpm --filter @embroidery/admin test` | 220 passed / 30 suites |
| targeted `--testPathPatterns asset` (run 1) | 77 passed / 7 suites |
| targeted `--testPathPatterns asset` (run 2) | 77 passed / 7 suites |
| `pnpm --filter @embroidery/admin build` | compiled; `/assets` listed as a dynamic server route |
| `pnpm --filter @embroidery/frontend-testing test` | 10 passed / 4 suites |
| `pnpm check:styles` | passed (4 apps, 483 files, incl. `inline-style`) |
| `pnpm check:frontend-boundaries` | clean |
| `pnpm check:frontend-build-boundary` | clean (2439 built files) |
| `pnpm check:e2e` | clean; 32 tests collect; Playwright pinned 1.61.1 |
| `pnpm check:openapi` | up to date |
| `pnpm check:api-client` | up to date, `55de1cc1…` |
| `pnpm check:figma-design-index` | 70 registry IDs |
| `node --test tools/check-figma-design-index.test.mjs` | 19 pass / 0 fail |
| `pnpm db:check:manifest` | all checks passed |
| `node tools/check-file-size.mjs` | passed; no A01 source file above the review threshold |
| `pnpm quality` | **`EXIT=0`** |
| `git diff --check` | clean |

**Script-name substitutions recorded.** §26 lists
`pnpm check:frontend-test-boundaries`; the root script is
`pnpm check:frontend-boundaries` (it runs `tools/check-frontend-test-boundaries.mjs`).
`pnpm check:frontend-build-boundary` exists standalone and was run.

Environment hygiene: the fixture API and the production Admin server were
stopped, and `.playwright-mcp/`, the sample PNG and all screenshots were deleted
before Commit A. No container was started; no unrelated process or container
residue remains.

---

## Q. Acceptance matrix

All 64 criteria in §29 are met, with these carrying an explicit note:

| # | Criterion | Note |
|---|---|---|
| 1–4 | entry, chains, nine nodes, seven rows | §A / §B; entry-state divergence disclosed |
| 10 | honest placeholder media | no server URL, no object URL, no substitute image |
| 30 | multipart order / header / abort / progress | proved against the real generated operation (§E) |
| 37 | one 3000 ms constant | statically asserted as the only declaration |
| 43 | approved states implemented | with the one disclosed omission: the unbacked `Xoá khỏi danh sách` action (§B) |
| 46 | accessibility | §K, including the two documented sub-44px elements |
| 53–57 | frozen artifacts | §N; api-client `index.ts` is handwritten and outside the hashed tree |

Not met by design, and reported rather than worked around: the approved
`Xoá khỏi danh sách` affordance in the Rejected state. It requires a capability
the contract does not have and that §18 forbids adding.

---

## R. Handoff and scope closure

Delivered: `/assets` inside the authenticated Admin shell — upload with real
progress and honest cancellation, cursor continuation, server-backed identity,
processing reconciliation, and safe Vietnamese outcomes — over the three
accepted B01 operations only.

Not started and out of scope, as instructed: product drafts, catalog,
publication, Storefront, public or authenticated media delivery, manual retry or
delete APIs, retention, backend or worker changes, migrations, Figma changes.

**Open items for the reviewer**

1. The `Xoá khỏi danh sách` action in the Rejected state has no backend
   capability and is not implemented (§B). Either accept the omission or open a
   decision for a hide/delete operation.
2. There is still no media-delivery contract, so every thumbnail is a
   placeholder. A real preview needs an authenticated derivative-delivery
   operation, which A01 must not invent.

**Final state**

```text
APP2-A01 = COMPLETE — DELIVERED_FOR_REVIEW
APP2-B02 = READY — NOT STARTED
APP2-A02 = BLOCKED_BY_APP2-B02
APP2-S01 = DESIGN_AUTHORITY_UI02 — BLOCKED_BY_PUBLIC_BACKEND
```
