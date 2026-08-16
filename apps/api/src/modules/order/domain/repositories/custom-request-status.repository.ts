/**
 * The customer's read of one request (`APP5-B03` §10).
 *
 * A **second, read-only** contract beside {@link CustomRequestRepository}
 * rather than five more methods on it, for two reasons that point the same way.
 *
 * The first is the checkpoint's own rule: a narrow customer projection must not
 * be a wide Admin aggregate with the internal parts removed afterwards. Every
 * row shape below is already the customer-safe column list — the moderation
 * note body, the internal `reason`, the transition actor references, the
 * correlation id, the `cancelled_reason` and the current-quotation pointer are
 * not fields these types have somewhere to put. Redaction that cannot be
 * forgotten is redaction the SELECT already performed.
 *
 * The second is `CLAUDE.md` §6: the write-side repository is at 391 lines, and
 * a read model split by responsibility is the split the limit is asking for
 * rather than an arbitrary one by line range.
 *
 * `AGG-13` ownership does not move. Both contracts are Ordering's, and both are
 * implemented against Ordering's own tables (TBL-037, TBL-038, TBL-039,
 * TBL-040, TBL-042).
 */
import type { CustomRequestState } from '@embroidery/database';

import type {
  ProductId,
  ProductVariantId,
} from '../../../catalog/domain/repositories/placement-hierarchy.port';
import type { CustomRequestId } from './custom-request.repository';

/**
 * The request root, customer columns only.
 *
 * Absent by construction, not by omission: `customer_id` (the grant already
 * proved whose request this is, and echoing the identity id back would turn a
 * link into a lookup into the identity graph), `cancelled_reason` — the
 * **internal** half of COL-TBL037-08/09 — `current_design_case_id`,
 * `current_quotation_id`, `submitted_session_id` (server-owned provenance,
 * `G01-D09`), `customer_note` and `updated_at`.
 */
export interface CustomRequestStatusRow {
  readonly id: CustomRequestId;
  readonly code: string;
  readonly status: CustomRequestState;
  readonly createdAt: Date;
  /** Present exactly on the catalog branch (`APP5-G01` §3). */
  readonly productId: ProductId | undefined;
  readonly productVariantId: ProductVariantId | undefined;
  /**
   * COL-TBL037-09 — the customer-facing half of a cancellation, written by the
   * Admin path `APP5-B05` will build. `undefined` until then, and `undefined`
   * for a cancellation recorded without one.
   */
  readonly cancelledCustomerReason: string | undefined;
}

/** TBL-039. Truthful for both branches: the variant is NULL on a COP line. */
export interface CustomRequestStatusQuantityLine {
  readonly productVariantId: ProductVariantId | undefined;
  readonly sizeLabel: string | undefined;
  readonly quantity: number;
}

/** TBL-038. Dimensions are `numeric`, so they cross as strings, never floats. */
export interface CustomRequestStatusCustomerOwnedProduct {
  readonly name: string;
  readonly description: string | undefined;
  readonly physicalWidthMm: string | undefined;
  readonly physicalHeightMm: string | undefined;
}

/**
 * TBL-040, the association and nothing else.
 *
 * The table is association-only — *"Asset owns all metadata"* — and this read
 * deliberately stops there. `APP5-B03` adds no binary-delivery route, so a
 * storage key, a bucket, a MIME type, a byte size, a checksum or an inspection
 * outcome would be metadata about a file the customer has no authorized way to
 * fetch from this surface. The id and the role are what the status screen needs
 * to say *"you attached three item photos and one reference"*.
 */
export interface CustomRequestStatusAsset {
  readonly assetId: string;
  readonly role: string;
}

export const CUSTOM_REQUEST_STATUS_REPOSITORY = Symbol('CUSTOM_REQUEST_STATUS_REPOSITORY');

export interface CustomRequestStatusRepository {
  /** The root, or nothing. Never throws for absence — the caller must not disclose it. */
  findRequest(id: CustomRequestId): Promise<CustomRequestStatusRow | undefined>;

  loadQuantityLines(id: CustomRequestId): Promise<CustomRequestStatusQuantityLine[]>;

  loadCustomerOwnedProduct(
    id: CustomRequestId,
  ): Promise<CustomRequestStatusCustomerOwnedProduct | undefined>;

  loadAssets(id: CustomRequestId): Promise<CustomRequestStatusAsset[]>;

  /**
   * The customer-visible reason for the request's **current** status.
   *
   * Reads `custom_request_transitions.customer_visible_reason` from the most
   * recent transition that moved the request *into* `status`, and projects no
   * other column of that row. `reason` (internal), `actor_kind`, `admin_id`,
   * `customer_id`, `grant_id`, `system_job_key` and `correlation_id` are not
   * selected, so `APP5-B03` §8's prohibition is a property of the query rather
   * than a mapping step someone could skip.
   *
   * Scoped to the current status on purpose: an earlier `NEEDS_CLARIFICATION`
   * message must not resurface as the explanation of a later rejection.
   */
  findCurrentCustomerVisibleReason(
    id: CustomRequestId,
    status: CustomRequestState,
  ): Promise<string | undefined>;
}
