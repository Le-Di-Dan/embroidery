# APP2-A04 — Admin Product Publication Interaction — Completion Report

**Checkpoint:** `APP2-A04` — Implement the Admin Product publication interaction
**Verdict:** `PASS`
**Resulting state:** `APP2-A04 = COMPLETE — DELIVERED_FOR_REVIEW`
**Commit A:** `e522e9d5d392637814b4dfbc0a0dfdaea1b5a12e` — `feat(admin): implement product publication interaction`
**Branch:** `production` · nothing pushed

---

## A. Preflight and B03 entry

`APP2_A04_PREFLIGHT = PASS`.

| Check | Observed |
| --- | --- |
| `git branch --show-current` | `production` |
| `git rev-parse HEAD` at entry | `76430e35d78756780fe6481a8fb3d171c385cd14` |
| HEAD identity | exactly the `APP2-B03` evidence Commit B (`docs(app2): record Product Publication evidence`, 3 files, +509/−1) |
| `git status --short` | empty — tracked and staged clean |
| Ignored user-owned `evidences/` | untouched, not staged, not recreated |
| Unpushed | 41 commits ahead; nothing pushed |
| Downstream implementation | none — no A04/B04/S01/S02/E01/T01 source existed at entry |

Accepted chains verified present and unmodified: `35ebcff` (B03 Commit A), `76430e3` (B03 Commit B), `68c10ca` (B03-G01 evidence), `bd44980` (unpublish lifecycle), `f9d1fa6` (A03-C1 evidence), `b6bdb3b` (A03 security fix). **No accepted history was rewritten or amended.**

Entry gates, all pass: `check:secrets` (349 documents / 1621 tracked files), `check:lifecycle` (LC-04 5 transitions), `check:openapi`, `check:api-client` (tree `7f2a67a3…`), `check:figma-design-index` (72/72), `db:check:manifest` (78 tables / 833 columns), `git diff --check`, and `pnpm quality` **exit 0**.

Per §1, no new design checkpoint was created despite the D01 Publication rows still being `REVIEW_REQUIRED`; the Product Owner ruling that the existing `APP2-D01` designs are the phase authority was applied.

---

## B. Live design audit

All four Publication nodes were opened live in `BQwqV8GdfUIELvsQDB1UQE`, page `APP_02`, section `423:3`, and inspected for structure, auto-layout, text content, components and rendered appearance. Supporting annotations `450:404` and `451:404` were read in full.

| Node | Registry ID | Audited |
| --- | --- | --- |
| `441:106` | `FIG-ADMIN-PUBLICATION-DESKTOP-READY` | structure + text + screenshot |
| `442:110` | `FIG-ADMIN-PUBLICATION-DESKTOP-BLOCKED` | structure + text + screenshot |
| `442:205` | `FIG-ADMIN-PUBLICATION-DESKTOP-CONFIRM-UNPUBLISH` | structure + text + screenshot |
| `443:121` | `FIG-ADMIN-PUBLICATION-MOBILE` | structure + text + screenshot |
| `450:404` | `FIG-APP2-ASSET-CATALOG-NOTES` | full annotation text (normative) |
| `451:404` | `FIG-APP2-REUSE-MAP` | full annotation text |

Composition confirmed from the renders: back link → `h1` product name → status pill; a wide summary card (`Nội dung sẽ hiển thị công khai`) holding a media strip and a key/value field list; a narrow publication card holding the checklist, the primary action, a secondary action and consequence copy. Blocked adds a banner above the columns and an eligibility note under the actions. Mobile 390 collapses to one column with full-width stacked actions.

Normative rules taken from `450:404` and implemented: `Gỡ xuất bản luôn cần hộp thoại xác nhận`; the unpublish confirmation is `role="alertdialog"` while the picker stays `role="dialog"`; focus enters, is trapped, and returns to the trigger; `Xuất bản` is disabled with a stated reason when a condition is unmet; status is never signalled by colour alone; `role="status"` + `aria-live="polite"` for status messages; 1440/1024/390 review, 44px minimum touch target, no horizontal overflow at 390; and — still in force — `Chưa có hợp đồng phân phối media: ô ảnh giữ khối dự phòng, không tạo URL ảnh máy chủ giả`.

**No `BLOCKED_BY_PUBLICATION_DESIGN_CONTRADICTION` was raised.** Every divergence found was either pre-resolved by the §4 binding reconciliations or, in the decisive case below, resolved by the design's own handoff.

---

## C. Design-contract reconciliation

| Design shows | Delivered | Basis |
| --- | --- | --- |
| Four checklist rows with ad-hoc wording (`Đã có tên sản phẩm`, `Đã có ảnh "Sẵn sàng" làm ảnh đại diện`) | All **seven** B03 codes in server order, §9 copy | §4 — the four rows are layout examples, not a closed rule set |
| `Đường dẫn công khai` → `/san-pham/khan-tay-theu-sen-do` | Label `Đường dẫn`, bare server slug, read-only, not a link | §4 **and** `450:404` itself: the `/san-pham/<slug>` pattern is marked `CHƯA CHỐT … chỉ là ĐỀ XUẤT … Cần Product Owner xác nhận trước khi S02` |
| `Khách truy cập đã có thể xem sản phẩm này trên Storefront` | `Sản phẩm hiện đủ điều kiện hiển thị công khai.` | §13 — no claim that a public URL is live before B04/S02 |
| Consequence copy naming Storefront visibility | Eligibility-only phrasing | same |
| Category sample `Phụ kiện thêu tay` | Authoritative `product.category.name` | §4 |
| Media thumbnails | Neutral placeholders, first marked `Ảnh đại diện` | §4 + `450:404` media rule |
| `Chỉnh sửa` on the PUBLISHED screen | `Xem chi tiết` | §4 — A03 edits DRAFT only |
| Layer named `Nav item / Tài sản hình ảnh / Active` | Real APP1 shell, `Sản phẩm` active | §4 — and the **render** already highlights `Sản phẩm`; only the layer name is stale |
| A publish/unpublish control in the header **and** in the card (all three desktop frames) | **One** action set, in the publication card | §20 (no duplicate always-active mutation controls) and §11, which lists `Xuất bản` once. Mobile `443:121` has no header actions at all, so the card is the canonical location and the desktop duplicate is a layout artifact |

The public-path finding is worth stating plainly: this is not a case of the prompt overriding the design. The design's own normative handoff already declares the public page path unresolved, so rendering the bare slug **agrees** with the design authority rather than departing from it.

---

## D. Routes and navigation

One route added, inside the protected shell:

```
/products/[productId]/publication
```

The segment is the B02 product **UUID**, never the slug. No `/catalog/*`, `/publish/*`, `/admin/products/*`, Vietnamese alias or query-only mode was introduced, and every existing route is unchanged. The route file is a 21-line thin boundary that resolves the param and delegates; it prefetches nothing, because both responses carry the concurrency token and a server-dehydrated token would already be one navigation old.

Entry points on the A03 detail screen (`ProductPublicationEntry`):

| Status | Control |
| --- | --- |
| `DRAFT` | `Xuất bản` → publication route |
| `PUBLISHED` | `Quản lý xuất bản` → publication route |
| `ARCHIVED` / unknown | none rendered |

The entry is a `Link` whose click is routed through the shared `useNavigationGuard`, not a raw `router.push` — see §M. **No row-level publication action was added to the Product List**; the existing A02 test asserting that the list renders no `Xuất bản`/`Gỡ xuất bản`/`Lưu trữ`/`Xoá` control still passes unmodified.

---

## E. Client boundary

`packages/api-client/src/index.ts` (hand-written barrel) now exports:

- `adminProductPublicationReadiness`, `adminProductPublish`, `adminProductUnpublish`
- values `AdminProductRequirementResponseCode`, `AdminProductPublicationReadinessResponseStatus`, `AdminProductPublicationResponseStatus`
- types `AdminProductPublicationReadinessResponse`, `AdminProductPublicationResponse`, `AdminProductRequirementResponse`, `PublishProductBody`, `UnpublishProductBody`

`adminProductArchive` remains **withheld**, and a boundary test asserts `'adminProductArchive' in apiClient === false`.

`AdminProductRequirementResponseCode` is exported *as a value* deliberately: the screen renders the complete requirement set, so the codes must come from the contract. A hand-kept list would let the two drift, and the drift would surface as a silently missing checklist row rather than a build failure.

While editing that comment block I removed a stale A02 paragraph directly above the product exports which still claimed that "create, detail, update and archive … are deliberately not re-exported" — three of those four are exported immediately beneath it. It was left behind by A03 and actively wrong about what the boundary exposes.

No generated file was edited or regenerated; the generated tree hash is unchanged.

---

## F. Query and cache coherence

`productQueryKeys.publicationReadiness(productId)` was added as a **separate** entry from `detail(productId)`, not a field on it: the report is a moment-in-time evaluation the server may answer differently on the next call, and folding it into the record would make a stale verdict look like a stale product. The key carries no token, form value, DOM value, raw error or credential.

After a successful command:

- the returned `status`, `updatedAt` and `slug` are **merged** into the authoritative detail record (not replacing it — the narrow command response would otherwise erase name, category, description, price and media);
- the Product List root is invalidated;
- the readiness report is **reset**;
- mutation state is cleared and the outcome is announced.

The reset rather than invalidate is a defect fix, described in §Q.

Neither mutation is optimistic, and `retry: false` on both: after a conflict the token is known-stale, so an automatic retry could only fail again — or succeed against a window the operator never saw.

---

## G. Coherent snapshot and the seven-code mapping

`toCoherentSnapshot(detail, readiness)` returns `null` unless **both** `updatedAt` and parsed `status` agree. Comparing status alone is not enough: two reads can agree a product is `DRAFT` while a save between them advanced the token, and publishing with the older token is exactly the lost update optimistic concurrency exists to catch. `expectedUpdatedAt` lives *on* the snapshot so a command cannot source the token from anywhere else.

An incoherent pair is not treated as an error — it means the product changed between two responses — so it renders as "the product just changed, reload" with both reads refetched together, and **no lifecycle action is offered**.

The seven codes, in server order, with the delivered copy:

| Code | Copy |
| --- | --- |
| `PRODUCT_NAME_READY` | Tên sản phẩm và đường dẫn đã sẵn sàng |
| `PRODUCT_DESCRIPTION_READY` | Đã có mô tả sản phẩm |
| `PRODUCT_CATEGORY_READY` | Danh mục đang được xuất bản |
| `PRODUCT_PRICE_READY` | Đã đặt giá sản phẩm |
| `PRODUCT_MEDIA_READY` | Thứ tự ảnh sản phẩm hợp lệ |
| `PRODUCT_MEDIA_ASSETS_READY` | Tất cả ảnh đã được duyệt |
| `PRODUCT_MEDIA_DERIVATIVES_READY` | Ảnh hiển thị công khai đã sẵn sàng |

The map is keyed by the generated enum, so a code added to the contract is a **build failure** here rather than a blank row. Rendering rules: server order preserved exactly (never sorted, never grouped by satisfaction); all seven always shown; each row carries a text marker (`✓` / `!`) *and* an off-screen word, so the distinction survives without colour; no requirement code is ever rendered as prose; and an **unrecognised code renders visibly, with neutral copy, and is forced to unsatisfied** — never silently counted as met, whatever the server said about it.

No requirement string names an asset, derivative, checksum, bucket or storage key.

---

## H. Ready and blocked

Publish is enabled only when `detail.status = DRAFT`, `readiness.status = DRAFT`, `eligible = true`, the snapshots cohere, and no mutation is pending. An **eligible non-DRAFT does not enable publish** — the report answers "does this meet the requirements", which a PUBLISHED product also can; only `DRAFT` may be published (`TR-LC04-01`), and that is checked independently of the verdict.

Ready renders the ready title, the seven satisfied rows, `Xuất bản`, `Chỉnh sửa` and the consequence copy. Per §11 no separate publish-confirmation dialog is used; direct publish is guarded by a disabled control and `Đang xuất bản…`.

Blocked renders a banner, the disabled `Xuất bản` (`disabled` **and** `aria-disabled="true"`), all seven rows with the unmet ones clearly marked, `Hoàn thiện bản nháp` → `/products/{productId}`, and the eligibility note. No field anchors were invented, and satisfied items are not hidden.

---

## I. Publish

Body sent is exactly `{ expectedUpdatedAt }` — asserted at the generated-client boundary, including that the key set is exactly `['expectedUpdatedAt']`, so no reason, status or publish date can be smuggled in. The generated `PublishProductBody` is an open index signature (the Zod DTO contributes no properties), so a local `PublicationCommandBody` interface is what actually pins the shape; a test asserts it against the contract's `.strict()` schema.

No optimistic status: during flight the screen still shows `DRAFT`, no unpublish control appears, and no success banner is shown. A repeat press cannot fire a second request.

On success the screen announces politely, reconciles from the returned status and token, and **transitions in place with no full-page reload**. The copy is eligibility-only and does not claim a public URL is live.

---

## J. PUBLISHED

Renders the truthful published status, the product summary, the read-only slug, `Gỡ xuất bản` and `Xem chi tiết`. **Unpublish is deliberately independent of readiness** — a published product whose category was later unpublished or whose price was cleared no longer satisfies the requirements, and that is precisely when an operator most needs to take it down; gating on readiness would strand exactly those products in public view. A test covers the unsatisfied-but-published case. No publish action and no editing affordance is offered.

---

## K. Unpublish

`role="alertdialog"`, `aria-modal="true"`, labelled by its title and described by its body. Focus moves in, is trapped, and returns to the trigger on close. Escape and backdrop dismiss while idle; **both are blocked while the command is in flight**, and the primary action is disabled and `aria-disabled` with `Đang gỡ xuất bản…`, so a request already on the wire cannot be abandoned or double-fired.

The body states what unpublish is not: `Đây không phải thao tác xoá hoặc lưu trữ.` There is **no reason field** (the contract's body is `.strict()` and accepts only `expectedUpdatedAt`) and **no archive call**. Body sent is exactly `{ expectedUpdatedAt }` from the coherent PUBLISHED snapshot.

On success: status returns to `DRAFT` from the returned value, the detail cache is merged, list and readiness are refreshed, the dialog closes, a polite success is announced, the route is unchanged, and the screen re-derives ready/blocked DRAFT. No product or media data is cleared.

---

## L. Error classification

Classified by exact domain code, never by HTTP 409 alone — all four refusals below arrive as 409.

| Code | Behaviour |
| --- | --- |
| `PRODUCT_VERSION_CONFLICT` | the approved A03 reload dialog; refetch detail + readiness; no stale-token retry |
| `PRODUCT_PUBLICATION_NOT_READY` | no dialog; screen kept; only **known** requirement codes consumed from `errors[]`; readiness refetched; publish disabled until coherent and eligible |
| `PRODUCT_PUBLISH_NOT_ALLOWED` / `PRODUCT_UNPUBLISH_NOT_ALLOWED` | lifecycle-safe guidance; detail + readiness refetched; no dialog, no retry |
| unknown / missing | generic safe error |

Unknown detail codes inside a not-ready refusal are **dropped**, never rendered raw. A test asserts the rendered output contains no server message, no domain code and no request id.

---

## M. Summary, media and public-path honesty

Rendered: name (`h1`), category **name**, price, description, slug, status, ordered media placeholders. Price uses the B02 `"0"` sentinel correctly — `Chưa đặt giá.`, never `0 ₫`.

The slug is plain text inside a `<span>`, never wrapped in an anchor, with the note `Đường dẫn do hệ thống quản lý và không thể chỉnh sửa.` A boundary test asserts no publication source file contains `/san-pham`, and a render test asserts the string appears nowhere in the DOM.

Media tiles are the existing A03 `ProductMediaPlaceholder`. No `<img>`, no `createObjectURL`, no `storageKey`, no checksum, no filename, no constructed URL — asserted both statically and in the rendered DOM. Order is the server's; the first tile is marked `Ảnh đại diện`.

The publication route holds **no editable form**. A dirty A03 form is protected because the entry point routes its departure through the shared navigation guard rather than navigating directly: a test registers an interceptor, clicks the entry, and asserts the guard held the departure and `router.push` had not yet been called, then that releasing it navigates to the canonical route. Modified clicks and non-primary buttons are left to the browser. No second navigation framework was introduced.

---

## N. Responsive, accessibility and styles

Mobile-first sheet at the shared 1024px Admin threshold: single column at 390 with the seven rows wrapping and full-width actions, two columns (summary + 360px publication column) above it. Blocked and PUBLISHED derive from the same composition. One action set only — no duplicate desktop/mobile mutation control.

Accessibility: exactly one `h1` (asserted); the checklist is a real `<ul>`/`<li>` so the item count is announced; status is text + marker, never colour alone; success/blocked use `role="status"`, failures `role="alert"`; disabled publish is `aria-disabled`; the alertdialog is labelled, described, focus-trapped and focus-returning; the reading order is logical.

Styling: one feature-scoped leaf sheet composed through `main.scss`, `@use '@embroidery/styles'` only. Every selector is prefixed `product-publication__` — A03 lost time to a global collision jsdom could not see, so this sheet shares no selector with any other feature. No inline style, style-jsx, CSS Module, Tailwind, CSS-in-JS, copied fallback colour or arbitrary token. `pnpm check:styles` passes across 582 style/source files.

---

## O. Security

`pnpm check:secrets` passes (349 documents / 1621 tracked files). No credential, cookie, Authorization header, session token, request id, raw error, storage key, checksum, derivative internal, Audit row or Outbox row is rendered, logged or committed. No `dangerouslySetInnerHTML`, no object-storage access, no payload logging, no `console.*` in publication source (asserted). No category identifier is exposed — a render test asserts no UUID-shaped string appears anywhere in the DOM. No web storage, no cookie access, no ad-hoc Axios instance, no second QueryClient, no polling.

The browser review used the real dev Admin credential read from the ignored `.env` inside a single throwaway process. It was never printed, logged, written to a file, or passed as a command argument, and **the account password was not rotated**.

---

## P. List and archive boundaries

Product List is unchanged: `Tạo sản phẩm` and per-row `Chỉnh sửa` only. Its existing test asserting the absence of every publication, archive, delete and search control still passes untouched.

Carried forward, unresolved and unmodified by this checkpoint:

- **`FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01` = `ROUTED — NONBLOCKING_FOR_A04`** — B02 archives from `DRAFT` while LC-04 defines archive only as `PUBLISHED → ARCHIVED`. A04 neither calls nor modifies archive.
- **`FU-APP2-PRODUCT-ARCHIVE-UI-01` = `DEFERRED_PENDING_PRODUCT_OWNER_SURFACE_DECISION`**.

No archive export, no archive call, no `Lưu trữ` label, and unpublish is never described as archive — the confirmation says the opposite explicitly.

---

## Q. Tests and browser review

### Two defects the tests caught

**1. The success banner vanished at the moment it mattered.** The banner originally lived inside the panel. Publish merges `PUBLISHED` + the new token into the detail cache synchronously while the readiness report is still the pre-transition one, so for a few hundred milliseconds the two snapshots genuinely contradict each other. The screen therefore switched to the incoherent-pair branch, the panel unmounted, and an operator whose publish had just succeeded was told *"Thông tin đang được cập nhật — trạng thái sản phẩm vừa thay đổi"*. Fixed in two places: the outcome was lifted to the screen so a completed command's result outlives every subsequent state, and the readiness query is now **reset** instead of invalidated so the stale contradictory report is never served at all.

**2. A boundary test that punished documentation.** Four rules matched their own explanatory comments — the file saying it never builds a public URL failed the "never builds a public URL" rule. Comments are now stripped before matching, so the rules inspect executable code.

### Docker-free suites

| Suite | Tests |
| --- | --- |
| `test/boundary/product-publication-source.test.ts` | 18 |
| `test/model/product-publication-model.test.ts` | 23 |
| `test/components/product-publication-render.test.tsx` | 28 |
| `test/components/product-publication-commands.test.tsx` | 16 |
| `test/components/product-publication-dialog.test.tsx` | 13 |

Generated functions are mocked, never URLs. No live network, no new test framework.

**Focused A04 suite run twice: `98 passed / 98`, 5 suites, both runs identical.**

Full Admin suite: **519 passed / 519**, 46 suites. One pre-existing A03 test was updated rather than deleted: it asserted the detail screen offers *no* publication control, which A04 deliberately lifts. It now asserts that archive and delete remain absent and that the entry point is a navigating link, not a mutation button.

### Production browser review

Admin was reviewed behind the real Nginx gateway at `admin.embroidery.local`, desktop **1440** and mobile **390**, driving the real B03 operations with a real session.

| Scenario | Result |
| --- | --- |
| Blocked DRAFT | 7 rows rendered, 3 unmet, publish `disabled` + `aria-disabled="true"` |
| Ready DRAFT | 7 rows, publish enabled, slug not a link, page contains no `/san-pham` |
| Stale publish | `409 PRODUCT_VERSION_CONFLICT` |
| Publish (UI) | status → `Đã xuất bản`, success banner, unpublish control appears, no reload |
| Publish when PUBLISHED | `409 PRODUCT_PUBLISH_NOT_ALLOWED` |
| Unpublish confirmation | `role="alertdialog"`, `aria-modal="true"`, focus inside |
| Unpublish | status → `Bản nháp`, success banner, publish control returns |
| ARCHIVED | no publish, no unpublish, read-only note present |
| Not found | `Không tìm thấy sản phẩm` |
| Mobile 390 | no horizontal overflow in any state, publish control height **44px**, dialog fits |

**Substitutions and honest limitations.**

- `pnpm check:frontend-test-boundaries` is **not present** as a script in this repository; `pnpm check:frontend-boundaries` runs the same `check-frontend-test-boundaries.mjs` checker and was run instead. §26 allowed for this ("when present").
- The production **build** was verified separately (`pnpm --filter @embroidery/admin build` — succeeds, and registers `ƒ /products/[productId]/publication`). The **browser** review ran against the dev-mode Admin container behind the real gateway, because making that container serve a production build requires a Compose change, which §19/§25 forbid.
- Running `next build` on the host wrote a production `.next` into the bind-mounted directory and made the dev container answer **404 on every route**, including `/healthz`. Clearing `.next` and restarting the container restored it. Anyone running the build on the host while the dev stack is up will hit this.

---

## R. Frozen artifacts

| Artifact | Baseline | After A04 |
| --- | --- | --- |
| OpenAPI hash | `c100df4e2a0b0721e5354f4f78d92312dcaeea5edd617775d8d8cd7062b34323` | unchanged |
| OpenAPI shape | 13 paths / 16 operations / 27 schemas | unchanged |
| Generated client tree | `7f2a67a325904e0584688dc2c0f54ac55ac1de5b06817a7faf1ccd3eec51da7f` | unchanged |
| Migrations / tables / columns / CHECKs | 33 / 78 / 833 / 190 | unchanged |
| DB fingerprint | `82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf` | unchanged |
| Figma | 72 IDs / 72 node rows | unchanged |

No API, worker, Storefront, database, object-storage, Nginx, Compose, Figma, dependency or lockfile change. `packages/api-client/src/index.ts` is the hand-written barrel and is the only non-`apps/admin` file touched, as §2 requires.

---

## S. Commit A

`e522e9d5d392637814b4dfbc0a0dfdaea1b5a12e` — **28 files, +3512 / −34**.

Added (20): the route segment; `product-publication-{screen,panel,summary,entry}.tsx`, `product-requirement-list.tsx`, `product-unpublish-dialog.tsx`; `use-publication-{readiness-query,mutations}.ts`; `product-publication{,-copy,-failure}.ts`; `product-publication.service.ts`; `product-publication.scss`; five test files.

Modified (8): `product-detail-screen.tsx` (entry point), `product-dialog.tsx` (`role` + `dismissible`), `index.ts`, `product-query-keys.ts`, `product-route.ts`, `main.scss`, `product-edit.test.tsx`, `product-fixture.ts`, `packages/api-client/src/index.ts`.

No report, status closure or documentation is in Commit A.

---

## T. Validation

| Command | Result |
| --- | --- |
| `pnpm --filter @embroidery/admin lint` | pass |
| `pnpm --filter @embroidery/admin typecheck` | pass |
| `pnpm --filter @embroidery/admin test` | **519 / 519**, 46 suites |
| `pnpm --filter @embroidery/admin build` | pass; publication route registered |
| focused A04 suite ×2 | **98 / 98** twice, identical |
| `pnpm --filter @embroidery/frontend-testing test` | 10 / 10 |
| `pnpm check:styles` | pass (582 files) |
| `pnpm check:frontend-boundaries` | pass |
| `pnpm check:frontend-build-boundary` | pass (2529 built files) |
| `pnpm check:e2e` | pass (32 tests collect) |
| `pnpm check:secrets` | pass (349 / 1621) |
| `pnpm check:lifecycle` + `node --test` | pass; 10 / 10 |
| `pnpm check:openapi` | up to date |
| `pnpm check:api-client` | tree hash unchanged |
| `pnpm check:figma-design-index` + `node --test` | 72 / 72; 31 / 31 |
| `pnpm db:check:manifest` | pass |
| `node tools/check-file-size.mjs` | pass — 21 files above review threshold, **unchanged from entry**; no A04 file among them |
| `pnpm quality` | **exit 0** |
| `git diff --check` | clean |

Every command above was executed. Nothing is claimed that was not run.

### Dev-database residue (disclosed)

The review performed three publish and three unpublish transitions across desktop and mobile (one pair pre-dates this checkpoint, from the B03 smoke). Remaining in the **development** database:

- `audit_events`: 3 × `product.published`, 3 × `product.unpublished`
- `outbox_events`: 3 × `product.published`, 3 × `product.unpublished`, all `PENDING`

This is correct behaviour, not litter: audit is append-only and APP2 ships no outbox dispatcher. It was **not** removed — no raw-SQL delete of audit or outbox evidence was performed.

Mutable product state **was** restored. The target product was returned to its exact pre-review field state (`DRAFT`, price `0`, no media, `description` null), verified by re-reading the record; product-state distribution is back to 26 `DRAFT` + 3 `ARCHIVED`, identical to entry. No PUBLISHED product remains. No screenshot, trace or fixture was committed; all review artefacts live in the session scratchpad.

---

## U. Acceptance

`PASS`. Clean B03 evidence entry; four live nodes audited; no new design checkpoint; canonical child route under the product UUID; exactly three generated operations consumed and three hand-written exports added with archive withheld; the command token taken from one coherent detail+readiness snapshot; seven codes in server order with an exhaustive contract-keyed mapping; truthful ready/blocked/PUBLISHED/ARCHIVED states; exact `{ expectedUpdatedAt }` bodies; no optimistic lifecycle state; exact-code error handling with the reload dialog gated to `PRODUCT_VERSION_CONFLICT` alone; a conforming alertdialog; the dirty-navigation seam preserved; bare slug and honest placeholders; no Product List publication action; no archive, delete, variants or SKU; desktop/mobile/a11y/global Sass verified; OpenAPI, generated client, database and Figma unchanged; two scoped commits; clean tree; nothing pushed; no downstream checkpoint started.

No failure is hidden behind a follow-up.

---

## V. B04 handoff

`APP2-B04` (public catalog read API) is unblocked. Three things it should know:

1. **The public product path is still unresolved.** `450:404` marks `/san-pham/<slug>` as a proposal needing Product Owner confirmation; only the API path `/api/public/products/{slug}` is locked. A04 deliberately renders the bare slug and constructs no URL. B04/S02 must not treat the design mock as authority here.
2. **`ProductMediaPlaceholder` is the single change point** when a media-delivery contract exists. Nothing else in the Admin fabricates or renders an image URL.
3. **The outbox has undispatched `product.published` / `product.unpublished` events.** No dispatcher exists yet; whichever checkpoint adds one inherits a non-empty `PENDING` backlog in development.

`FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01` remains open and is still nobody's assignment.
