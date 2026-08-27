/**
 * Inventory reservation and production operations (`APP8`): Admin SKU stock, the
 * production work queue, and the production job detail with its guarded
 * transitions.
 *
 * The set is bounded on purpose in both halves — `adminProductionJobCreate` is
 * withheld, and no enum crosses as a value from the stock operations. The
 * comments below give the reason for each, because an operation that is absent
 * for a reason and one that was forgotten look identical from here.
 */

// Admin SKU stock operations (APP8-B01). Exposed on the public boundary so the
// Admin inventory capability never deep-imports the generated tree.
//
// All three are keyed on `skuId`, which is the only address the contract
// accepts: a customer-owned product has no SKU and no stock record, so the
// COP branch is unrepresentable here rather than merely avoided.
//
// `AdjustSkuStockBody` crosses because the adjustment is the one operation that
// moves `quantityOnHand`, and the caller must build its body from the published
// type rather than an object literal — `delta` and `reason`, and nothing a
// server owns. There is deliberately no set-absolute body to export, because
// the contract publishes none.
//
// No enum crosses as a value. The screen renders `entryKind` as the stored
// token and never branches on it, so importing the vocabulary would create a
// second place for it to drift from the contract.
export {
  adminSkuStockGet,
  adminSkuStockAdjust,
  adminSkuStockLedger,
} from './generated/embroidery-api';
export type {
  AdjustSkuStockBody,
  AdminSkuStockResponse,
  AdminSkuStockLedgerResponse,
  AdminSkuStockLedgerEntryResponse,
} from './generated/embroidery-api.schemas';

// The Admin production work queue (`APP8-B03`), consumed by `APP8-A02` at
// `/san-xuat`. Exposed here so the Admin production capability never
// deep-imports the generated tree.
//
// Only the **list** operation crosses. `adminProductionJobCreate`,
// `adminProductionJobGet` and `adminProductionJobTransition` are deliberately
// left unexported: A02 is a read-only queue, and a boundary that published the
// three mutations would make "this screen cannot start, complete or cancel a
// job" a convention rather than a fact the module graph enforces.
//
// `AdminProductionJobListStatusItem` crosses as a **value** for the reason
// `AdminOrderListStatusItem` does: the filter's four options are derived from
// the contract rather than from a hand-kept list that could drift. It is the
// whole LC-18 vocabulary — `PLANNED`, `STARTED`, `COMPLETED`, `CANCELLED` —
// and there is no fifth value and no `ALL` sentinel to export, because the
// contract defines neither: an omitted `status` is what "every state" means.
//
// The queue item publishes ids, a status and lifecycle timestamps and nothing
// else — no order code, no frozen specification, no priority, no operator, no
// machine and no attempt count. Those either live on the detail contract or do
// not exist at all, so no type here offers a place to put one.
export { adminProductionJobList } from './generated/embroidery-api';
export { AdminProductionJobListStatusItem } from './generated/embroidery-api.schemas';
export type {
  AdminProductionJobListParams,
  AdminProductionJobQueueResponse,
  AdminProductionJobQueueItemResponse,
} from './generated/embroidery-api.schemas';

// The Admin production **job detail** and its guarded transitions (`APP8-B03`
// read, `APP8-B04` write), consumed by `APP8-A03` at `/san-xuat/{jobId}`.
//
// Two operations cross, and only two. `adminProductionJobCreate` stays
// unexported: creation is nested under a specific order and requires that
// order's exact approval snapshot and a satisfied deposit, so no screen this
// boundary serves has anything to submit it with — and publishing it would make
// "APP8's Admin surfaces do not create production jobs" a convention rather
// than a fact the module graph enforces.
//
// `TransitionProductionJobBodyTo` crosses as a **value** for the reason
// `AdminProductionJobListStatusItem` does: the moves a caller may request come
// from the contract rather than from string literals that can drift. It is
// deliberately three values, not four — `PLANNED` is the state a job is created
// in and is not a destination any transition may name.
//
// The detail response carries the job root, the **frozen** specification copied
// from the approval at creation, the append-only transition history and a
// read-only reservation summary. No artifact, storage key, note, customer
// detail, amount, operator or machine exists on any of these types, so no
// screen built on them can render one.
export { adminProductionJobGet, adminProductionJobTransition } from './generated/embroidery-api';
export { TransitionProductionJobBodyTo } from './generated/embroidery-api.schemas';
export type {
  AdminProductionJobDetailResponse,
  AdminProductionSpecificationResponse,
  AdminProductionReservationSummaryResponse,
  AdminProductionReservationResponse,
  AdminProductionTransitionResponse,
  AdminProductionTransitionResultResponse,
  TransitionProductionJobBody,
} from './generated/embroidery-api.schemas';
