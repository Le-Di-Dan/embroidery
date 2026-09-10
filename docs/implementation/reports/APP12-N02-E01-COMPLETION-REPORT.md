# APP12-N02.E01 — Ready-Made Sellability Authoring & Publication Readiness: Final Cross-Boundary Acceptance

**Package** `APP12-N02.E01` (final internal acceptance package of `APP12-N02 — READY-MADE
SELLABILITY AUTHORING & PUBLICATION READINESS`; not a new checkpoint id)
**Date** 2026-09-10
**Branch** `feat/app11-s04-seo-infrastructure` (not pushed)

---

## A. Verdict

```text
APP12-N02.E01 = COMPLETE — AWAITING_PO_REVIEW
APP12-N02     = IMPLEMENTATION_COMPLETE — AWAITING_PO_REVIEW

APP12-U01    = SUSPENDED_PENDING_BLOCKER_RECOVERY
APP12-U01-C1 = NEXT — NOT_EXECUTED

APP12-E01 = NOT_AUTHORIZED
APP12-R01 = NOT_AUTHORIZED

NEXT = PO_REVIEW_REQUIRED

PRODUCTION_DEPLOYED = false
PUSHED              = false
```

The run found no N02 capability defect. Every journey J1–J10 passed live, with an
operator working the real Admin, over a real API, real Storefront, real gateway and
a disposable PostgreSQL. No variant, SKU or stock row was written by anything other
than the delivered Admin UI.

Two harness faults surfaced in run 1 and were fixed in the harness only (§Z). Neither was
an application response: both were `504 Gateway Time-out` pages from the test gateway.
No runtime file changed.

## B. G01/D01/B01/A01 reconciliation

| Package | PO status at E01 entry | Re-proved here |
|---|---|---|
| `N02.G01` | COMPLETE — PO PASS | The blocker (no operator path to a sellable Product) is closed: J1/J2 build one from nothing |
| `N02.D01` | COMPLETE — PO APPROVED (`FIG-APPROVAL-APP12-N02-D01-PO-001`) | 21/21 rows still `APPROVED_FOR_IMPLEMENTATION` (§V) |
| `N02.B01` | COMPLETE — PO PASS | 10 criteria, server `eligible` read directly in J3/J4/J7/J8/J10 |
| `N02.A01` | COMPLETE — PO PASS | Every A01 surface driven live and axe-scanned (§S/§T) |

The A01 report overstated historical data when it said every PUBLISHED Product in every
world had zero variants (§1 of the brief). That is a documentation overstatement only.
E01 does not rely on it. The zero-variant PUBLISHED rows used in J8/J10 are the
`M01.A1` fixture's own seeded state, asserted by a read before repair (§L). They are not
inferred from the claim.

## C. E01 topology and no-write authority

A new e2e mode, `pnpm --filter @embroidery/e2e-testing e2e:app12:n02e01`
(`--app12-n02e01`), runs the **`N02.A01` / `M01.A1` topology plus the Storefront
process**. The mode string rides `app12M01A1` in `run-e2e.mjs`, the same way A01 did,
so every topology branch picks it up. It adds exactly two things:

- the `withStorefront` condition;
- its own child environment branch.

No new fixture exists. The `M01.A1` dataset provides these prerequisites:

- a PUBLISHED category;
- 30 processed Assets with real WebP derivatives;
- DRAFT shells: `draft-0`, `draft-8`, `draft-20`;
- PUBLISHED zero-variant shells: `pub-3`, `pub-1`, `pub-race`.

None of these is a sellability row.

```text
real PostgreSQL (disposable embroidery_db7_*)   yes
real API / Admin / Storefront / gateway          yes
real generated client (Admin + Storefront)       yes
real browser (Chromium, host)                    yes
INSERT product_variants / skus / sku_stocks      0 anywhere in the suite
repository or application-service calls         0
DB handle                                        read-only (`readRows` refuses any
                                                 statement not starting with SELECT)
```

The operator creates both Products in J1/J2 through `/products/new` and the edit form.
Category, description, price and media are set through the delivered form and picker.
Variants, SKUs and stock adjustments go through the `Phiên bản & SKU` section and the
`/kho/skus/{skuId}` screen. Publish and unpublish go through the publication screen.

Before each production build ran: `pnpm --filter @embroidery/admin build` and
`pnpm --filter @embroidery/storefront build`. This follows `FU-APP12-H08-04`, because
the tier runs `next start` and never builds.

## D. Baseline (entry)

```text
OpenAPI paths       = 129   operations = 143   schemas = 284   public ops = 49
migrations          = 39    (no 0040)
DB tables           = 79    (0039 snapshot; 79 again in the shared-dev snapshot)
Admin routes        = 26    Storefront routes = 20   (page.tsx count)
readiness criteria  = 10    (PRODUCT_PUBLICATION_REQUIREMENT_CODES)
```

## E. J1 — new DRAFT → SOLD OUT but valid PUBLISHED Product

`n02e01-a-publication.acceptance.spec.ts` › J1. Steps, through the real Admin:

1. Create `Khăn tay thêu hoa sen N02E01`: category `Đồ thử nghiệm M01.A1`, a Vietnamese
   description, price `350000`, one eligible image from the picker.
2. Create variant `Xanh navy · M` and SKU `E01-J1-NAVY-M`, inheriting the base price.
   The row reads `Dùng giá sản phẩm: 350.000 ₫`.
3. Assert `orders` count = 0, then open `Quản lý tồn kho` from the SKU row. The stock
   screen loads. Stock is left at 0.
4. Check readiness: 10 rows, 10 `satisfied`. The server returns
   `{ eligible: true, unsatisfied: [] }`.
5. Publish. Status becomes `PUBLISHED`; the DB shows 1/1 variant and 1/1 SKU.

Admin truth: no structural warning. Sold out is not structurally broken.

Storefront truth (`/san-pham/{slug}`, HTTP 200):

- the panel shows `350.000 VND` and the caption `Hiện chưa có phân loại nào còn hàng.`;
- the option's accessible name carries `· hết`;
- `Tạm hết hàng` is disabled;
- 0 `Mua ngay` links and 0 enabled radios.

**Structurally orderable, currently sold out, not buyable.**

## F. J2 — new DRAFT → in-stock buyable PUBLISHED Product

`Túi vải thêu chữ N02E01`, price `420000`, variant `Kem · L`, SKU `E01-J2-KEM-L`.
Stock `+7` went through the real audited adjustment dialog, with reason recorded and
result `Đã ghi điều chỉnh`. Readiness showed 10/10, and the readiness screen has no
`Tồn kho` text. Then the Product was published.

On the Storefront:

- `420.000 VND`;
- choosing `Kem` + `L` shows `Còn 7 sản phẩm`;
- the `Mua ngay` link is visible with `href` → `/mua-hang/{slug}`.

The link was asserted, never followed. No verification, OTP, order, shipping fee or
payment was executed (§17).

## G. J3 — readiness refusal ladder (`draft-8`)

In every state the UI (`data-presentation`) and the server (`publication-readiness`,
read with the operator session) are compared.

| State | HAS_ACTIVE_VARIANT | HAS_ORDER_ELIGIBLE_SKU | SKU_PRICE_RESOLVABLE | Server `unsatisfied` | Publish |
|---|---|---|---|---|---|
| A no variant | unsatisfied | **Chưa xét** (`data-satisfied=true`) | **Chưa xét** (`data-satisfied=true`) | `[HAS_ACTIVE_VARIANT]` | disabled |
| B variant, no SKU | satisfied | unsatisfied | **Chưa xét** | `[HAS_ORDER_ELIGIBLE_SKU]` | disabled |
| C SKU override `"0"` | satisfied | satisfied | unsatisfied (PRODUCT_PRICE_READY satisfied) | `[SKU_PRICE_RESOLVABLE]` | disabled |
| D price fixed | 10/10 satisfied | | | `[]`, `eligible: true` | **published** |

No DB shortcut was used. Every state was reached through the variant/SKU dialogs, and
state D was published for real.

## H. J4 — all-eligible-SKU price quantifier (`draft-20`)

Two active variants, `Đen · S` → `E01-J4-A` (valid) and `Đen · XL` → `E01-J4-B`
(override `"0"`), gave:

- HAS_ACTIVE_VARIANT PASS;
- HAS_ORDER_ELIGIBLE_SKU PASS;
- SKU_PRICE_RESOLVABLE **FAIL**;
- server `unsatisfied = [SKU_PRICE_RESOLVABLE]`, publish disabled.

After B was returned to the base price: 10/10, `eligible: true`, publish enabled.

## I. J5 — one active SKU per variant (`draft-0`)

A second active SKU `E01-J5-B` under `Xanh navy · M` was refused with the approved
alert `Phiên bản đã có một SKU đang bán`. The alert names `E01-J5-A` and includes
`Hệ thống sẽ không tự ngừng bán SKU cũ giúp bạn.`, with no raw
`SKU_ORDER_ELIGIBLE_AMBIGUOUS`.

The DB read afterwards: `skus = 1, activeSkus = 1`. The new SKU was not persisted, and
the original was not deactivated.

Recovery: the operator created `E01-J5-B` **inactive** through the same dialog. The DB
then read `skus = 2, activeSkus = 1`, and the original remained `data-active=true`.

## J. J6 — variant label and duplicate rules (`draft-0`)

- Whitespace-only colour and size were refused with
  `Cần nhập ít nhất màu sắc hoặc kích thước.`
- `"  xanh   NAVY  " / "m"` against `Xanh navy / M` was refused with
  `Phiên bản đã tồn tại`. There was no `PRODUCT_VARIANT_DUPLICATE` and no `23505` in
  the UI, and the DB counts were unchanged.
- `Xanh navy / L` was created and active; the variant count rose by 1.

## K. J7 — PUBLISHED structural break and recovery (`pub-3`)

The Product was first made valid through the UI: `Đỏ · L` / `E01-J7-RED-L`.

**J7A** (the last active SKU was deactivated):

- the confirmation says `Sản phẩm vẫn ở trạng thái Đang xuất bản…` and
  `Đây không phải là hết hàng…`;
- after confirming, the warning shows `Không thể đặt hàng` with active variants 1 and
  eligible SKUs 0;
- the DB status stayed `PUBLISHED`;
- readiness reported `HAS_ORDER_ELIGIBLE_SKU` unsatisfied (server agrees);
- the Storefront showed 0 enabled options and 0 `Mua ngay`.

Reactivating cleared the warning; the Product stayed PUBLISHED.

**J7B** (the last active variant was deactivated): the equivalent confirmation, then
the warning with 0/0. The DB showed `activeVariants = 0` and status still `PUBLISHED`,
and the Storefront was unbuyable. `Hoạt động lại phiên bản Đỏ · L` cleared the warning,
and the Storefront showed the `Đỏ` option again (sold out, stock 0).

No auto-unpublish happened at any point.

## L. J8 — historical malformed PUBLISHED recovery (`pub-1`)

- **Shape A:** the DB read before any write was `variants 0 / skus 0`, status
  PUBLISHED. This is the seeded historical state; no fixture was built for it. The
  warning showed 0/0, and the Storefront was unbuyable.
- **Shape B:** created from A through the UI with variant `Trắng` and no SKU. The
  warning showed 1/0, the status stayed PUBLISHED, and the Storefront was unbuyable.
- **Repair:** SKU `E01-J8-WHITE` was added. The warning cleared, including after a
  reload. The status is still PUBLISHED, and the server returns `eligible: true`. The
  Storefront exposes the `Trắng` option.

No unpublish was required.

## M. J9 — inactive history: Admin ≠ public (J2 Product)

The operator added variant `Kem · XL` with SKU `E01-J9-KEM-XL`. The SKU and then the
variant were deactivated. `E01-J9-KEM-L-OLD` was created inactive under the live `Kem · L`.

After a reload, the Admin shows all three inactive rows (`data-active=false`). The DB
reads `variants 2 / activeVariants 1 / skus 3 / activeSkus 1`.

On the Storefront, the size group holds exactly one radio and there is no `XL` radio.
The inactive variant and SKUs are not customer choices. The Admin authoring projection
(`adminProductVariant_list`) and the public projection are therefore different reads.

## N. J10 — unpublish safety (`pub-race`)

The Product was PUBLISHED with 0 variants. `HAS_ACTIVE_VARIANT` was unsatisfied and the
server returned `eligible: false`, yet `Gỡ xuất bản` was enabled. The `alertdialog` was
confirmed, `Đã gỡ xuất bản sản phẩm` appeared, and the DB status went to `DRAFT`. The
Storefront `/san-pham/{slug}` then returned **404**.

No readiness re-gate blocks withdrawal.

## O. Public truth matrix

| Structural state | Stock | Readiness | Observed public truth | Journey |
|---|---:|---|---|---|
| valid variant + valid SKU + valid price | 0 | 10/10 | visible (200); caption `Hiện chưa có phân loại nào còn hàng.`; option `· hết`; `Tạm hết hàng` disabled; no `Mua ngay` | J1 |
| valid variant + valid SKU + valid price | 7 | 10/10 | visible; price `420.000 VND`; `Còn 7 sản phẩm`; `Mua ngay` → `/mua-hang/{slug}` | J2 |
| no active variant (PUBLISHED) | any | not eligible | visible (200); purchase panel present; **0 enabled options, 0 `Mua ngay`** | J7B, J8-A |
| active variant, no active SKU (PUBLISHED) | any | not eligible | visible (200); **0 enabled options, 0 `Mua ngay`** | J7A, J8-B |
| active SKU override `"0"` | any | not eligible | publish refused (UI disabled, server `eligible: false`); never public | J3-C, J4 |

**Exact runtime truth for malformed PUBLISHED Products.** They are not hidden: Product
Detail answers 200 and renders the purchase panel. No option can be selected and no
purchase entry exists, so the Product cannot be ordered.

This is `APP12-S01`'s delivered projection: a variant with no order-eligible SKU is
kind `none`, and a Product with no active variant renders no fieldset. E01 records it
and invents no other behaviour. The Admin structural warning is what distinguishes this
case from sold out for the operator.

## P. `Chưa xét` evidence

J3 states A and B render `Chưa xét` (`data-presentation="pending"`) on exactly the
dependent vacuous criteria. On those rows:

- `data-satisfied="true"`;
- the server marks them satisfied;
- `eligible` is still `false`, because of the one real failure.

The `Chưa xét` rendering is therefore presentation only, and the server remains
authoritative. §20 re-proves the text in words at 1440/1024/390 on the unpublished
`pub-race`, alongside the `Chưa đủ điều kiện` row.

## Q. Stock-readiness exclusion

- J1 reached 10/10 and published with stock **0**.
- J2's readiness screen at stock 7 contains no `Tồn kho` text.
- The criteria list is the same 10 codes in both, with no stock criterion.
- `low_stock_threshold` is untouched and still not authored (`FU-APP12-U01-LOW-STOCK-AUTHORITY`).

## R. Stock handoff closure

J1 opened `/kho/skus/{skuId}` from the SKU row's `Quản lý tồn kho` link seconds after
creating the SKU, with `orders = 0` asserted immediately before. J2 then used the same
handoff to make a real audited `+7` adjustment.

```text
FU-APP12-N02-STOCK-REACHABILITY = CLOSED_BY_N02
```

## S. Responsive

`n02e01-f-responsive` covered these surfaces at **1440, 1024 and 390**:

- the editor with active and inactive history;
- the variant and SKU dialogs;
- the PUBLISHED structural warning, on `pub-1` made unsellable through the UI and then
  restored;
- readiness with `Chưa xét`;
- the J2 Storefront page.

```text
horizontal overflow = 0 on every surface at every viewport (390 included)
dialog submit actions toBeInViewport at every viewport
disclosure: aria-expanded false → true on the variant card
row actions name their subject (e.g. "Bán lại SKU E01-J9-KEM-XL", "Sửa phiên bản Kem · L")
```

## T. Accessibility

`runAxe` from `support/app12/h08-axe.mjs` (WCAG 2.2 AA + best-practice) scanned
15 surface/viewport combinations: editor, variant dialog, SKU dialog, warning and
readiness, each at 1440, 1024 and 390.

```text
axe serious  = 0
axe critical = 0
```

`color-contrast` is excluded from the gate only, as in `APP12-H08` / `N02.A01`
(`PO-APP12-004`, owned by `APP12-V02`).

The structural warning is not colour-only: it carries `Không thể đặt hàng` and the
`Đây không phải là hết hàng…` sentence in text. `Chưa xét` is not colour-only either:
it is the word itself, beside `Chưa đủ điều kiện` / `Đã đủ điều kiện`.

## U. Request-count / no-N+1 proof

This was measured on the J2 Product, which has two variants and three SKUs, two of them
inactive. Browser GETs were recorded via `page.on('request')`.

| Step | `GET /api/admin/products/{id}/variants` | per-variant/per-SKU reads | `GET /api/admin/skus/*/stock*` |
|---|---:|---:|---:|
| open editor + expand both variants | **1** | 0 | 0 |
| reload | **2** (+1) | 0 | 0 |
| one SKU mutation (reactivate) | **3** (+1 refetch) | 0 | 0 |

The editor makes one authoring-list request per authoritative load or refetch. It makes
no N+1 SKU reads and no stock request just to render. Stock stays an explicit handoff.

## V. Figma authority

`node tools/check-figma-design-index.mjs` → PASS (613 registry IDs / 613 node rows /
28 tables), at entry and at the end of the run. All 21 `FIG-APPROVAL-APP12-N02-D01-PO-001`
rows are still `APPROVED_FOR_IMPLEMENTATION`. No Figma write happened. The `figma-desktop`
MCP server refused connection this session, and none was needed.

## W. Follow-up disposition

```text
FU-APP12-N02-STOCK-REACHABILITY    = CLOSED_BY_N02 (§R)
FU-APP12-U01-LOW-STOCK-AUTHORITY   = carried unchanged
FU-ADMIN-SHARED-DIALOG-01          = carried unchanged
FU-APP12-H08-04                    = carried unchanged (re-observed: the tier never
                                     builds; both apps were built before the run)
FU-APP12-N01-OPS-01..03            = carried unchanged
FU-APP12-G03-01                    = carried unchanged
```

No new follow-up was opened. The mid-run gateway 504 (§Z) is the same class `APP12-V01`
recorded and is absorbed by the harness retry. It is not an application defect.

## X. Files changed

```text
M packages/e2e-testing/scripts/run-e2e.mjs          --app12-n02e01 mode (rides app12M01A1
                                                    + withStorefront + env branch)
M packages/e2e-testing/playwright.config.ts         project app12-n02e01-chromium
M packages/e2e-testing/package.json                 e2e:app12:n02e01[:headed]
A packages/e2e-testing/specs/app12/support/n02e01-world.ts     operator driver
A packages/e2e-testing/specs/app12/support/n02e01-evidence.ts  read-only evidence readers
A packages/e2e-testing/specs/app12/n02e01-a-publication.acceptance.spec.ts   J1 J2
A packages/e2e-testing/specs/app12/n02e01-b-readiness.acceptance.spec.ts     J3 J4
A packages/e2e-testing/specs/app12/n02e01-c-refusals.acceptance.spec.ts      J5 J6
A packages/e2e-testing/specs/app12/n02e01-d-published.acceptance.spec.ts     J7 J8 J10
A packages/e2e-testing/specs/app12/n02e01-e-history.acceptance.spec.ts       J9 §21
A packages/e2e-testing/specs/app12/n02e01-f-responsive.acceptance.spec.ts    §20
M docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md    N02 status
A docs/implementation/reports/APP12-N02-E01-COMPLETION-REPORT.md
```

```text
runtime source = 0   API = 0   OpenAPI = 0   generated client = 0
DB schema = 0        migrations = 0   Figma = 0
```

## Y. File-size

| File | Lines | Class | Result |
|---|---:|---|---|
| `n02e01-world.ts` | 225 | source (400) | PASS |
| `n02e01-evidence.ts` | 196 | source (400) | PASS |
| `n02e01-a-publication` spec | 136 | test (600) | PASS |
| `n02e01-b-readiness` spec | 137 | test | PASS |
| `n02e01-c-refusals` spec | 96 | test | PASS |
| `n02e01-d-published` spec | 189 | test | PASS |
| `n02e01-e-history` spec | 119 | test | PASS |
| `n02e01-f-responsive` spec | 125 | test | PASS |
| `run-e2e.mjs` | 1275 → 1329 | source | **pre-existing** violation, among the recorded pre-existing `check-file-size` failures; +54 lines, following the file's established per-mode pattern |

Run 2 put the world at 399 lines, over the 300-line review threshold. It was split by
responsibility: operator driver versus read-only evidence. The evidence module imports
nothing from the world, so there is no cycle.

## Z. Validation

| Command | Result |
|---|---|
| `git diff --check` | PASS |
| `pnpm --filter @embroidery/api exec jest src/modules/catalog/domain/product-publication src/modules/catalog/application/product-publication-contracts` | 3 suites, **70/70** |
| `apps/admin: jest --testPathPatterns="product-sellability\|product-requirement\|product-publication\|sku-stock"` | 12 suites, **212/212** |
| `pnpm --filter @embroidery/api openapi:check` | `OpenAPI artifact is up to date` |
| `pnpm --filter @embroidery/api-client check:generated` | `generated client is up to date` |
| `node tools/check-figma-design-index.mjs` | PASS |
| `packages/e2e-testing: tsc --noEmit` | PASS |
| `eslint` (changed harness files) | PASS |
| `prettier --write` / `--check` (changed files) | PASS |
| `pnpm --filter @embroidery/e2e-testing e2e:app12:n02e01` | see runs below |
| `node tools/check-report-secrets.mjs` | PASS |
| `node tools/check-file-size.mjs` | no new violation (§Y) |

**Live runs:**

```text
run 1  10 passed / 2 failed   J1–J10 all passed.
       §21 failed in beforeEach: the 11th login ended on /login with an empty alert.
       §20 failed on a "504 Gateway Time-out" page from the harness gateway.
       Neither is an application response.
       Harness fix: navigation/login retry only when the page shows a gateway 5xx
       (or is still on /login), at most 3 attempts. Any other failure still fails
       on first occurrence. The runtime is untouched.
run 2  12 passed / 0 failed   (1.1 min)  teardown verified
run 3  confirmation after the world/evidence split — 12 passed / 0 failed, teardown verified
```

`pnpm check:e2e` (`playwright --list` across **all** projects) fails at load. The cause
is two pre-existing specs, `m01e1-admin-refusals.acceptance.spec.ts` and
`support/v02-c2-world.ts`, which import `packages/i18n` JSON without an import attribute.
This package does not cause it; the N02.E01 project loads and runs.

U01, APP12-E01 and broad APP12 regression were not run.

## AA. Shared-dev integrity

The before and after snapshots were taken with `psql` **inside** the dev Postgres
container. The credential was never read, and the snapshot SQL is read-only. The two
snapshots are **byte-identical**:

```text
tables                    79
products 37  categories 9  product_media 51
product_variants 16  skus 14  sku_stocks 14
customers 4  orders 0  order_items 0  audit_events 70
md5(products|categories|product_media|product_variants|skus|sku_stocks)  unchanged
historical malformed shared PUBLISHED rows  ao-thun-cotton:1/0, tui-vai-theu-thu-cong:0/0  unchanged
E01 debris (name/slug N02E01)               0
```

Results, all 0: `product_variants` mutations, `skus` mutations, `sku_stocks` mutations,
audit rows caused by E01, and shared commercial transactions. The G03 rows are unchanged.

## AB. Disposable teardown

Every run ended with this line:

```text
[e2e] cleanup verified: all E2E ports closed, disposable database dropped
```

The DB was `embroidery_db7_*`, the browser closed and the processes stopped.

## AC. Final baseline

```text
OpenAPI 129 / 143 / 284, public 49   migrations 39, no 0040   tables 79
Admin routes 26   Storefront routes 20   readiness criteria 10
```

This is unchanged from entry.

## AD. N02 status / U01-C1 handoff

```text
APP12-N02.G01 = COMPLETE — PO PASS
APP12-N02.D01 = COMPLETE — PO APPROVED
APP12-N02.B01 = COMPLETE — PO PASS
APP12-N02.A01 = COMPLETE — PO PASS
APP12-N02.E01 = COMPLETE — AWAITING_PO_REVIEW
APP12-N02     = IMPLEMENTATION_COMPLETE — AWAITING_PO_REVIEW
```

**What `APP12-U01-C1` inherits.** A normal operator can now take a Ready-Made Product
from nothing to publicly buyable without SQL. J2 is the precise pre-transaction state
U01-C1 starts from: a PUBLISHED Product whose one SKU has audited stock, and whose
Storefront `Mua ngay` link resolves to `/mua-hang/{slug}`. U01-C1 owns everything past
that link: verification, `ORDER_ACCESS`, order creation, reservation, shipping fee,
FULL payment, dispatch and completion.

U01-C1 was not executed. APP12-E01 is not authorized. Nothing was deployed or pushed.

**STOP.**
