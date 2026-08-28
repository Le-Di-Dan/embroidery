/**
 * What `APP10-B03` would move, counted without moving it (`APP10-B02` §8).
 *
 * The preview answers one question: *if this `REQUESTED` merge were executed
 * now, what live identity-owned data would execution attempt to carry from the
 * loser to the survivor, or revoke?* It is a read. Nothing here opens a
 * transaction, takes a lock, writes a row or appends an event, and the three
 * collaborators it holds are count-only ports with no write method between them.
 *
 * ### The categories, and where each one comes from
 *
 * Every category corresponds to a table with a **live** `customers` foreign key,
 * as settled by `APP10-G01` §E.2 from `DB4_SCHEMA_IDENTITY_CUSTOMER.md` §7 and
 * `DB3_CUSTOMER_VERIFICATION_MERGE_SPEC.md` §4:
 *
 * | Category | Table | Owner | Counted through |
 * |---|---|---|---|
 * | `contactPoints` | `customer_contact_points` | CTX-CUS | `CustomerMergePreviewPort` |
 * | `activeSecureAccessGrants` | `secure_access_grants` (ACTIVE) | CTX-CUS | same |
 * | `businessProfile` | `business_profiles` | CTX-CUS | same |
 * | `customRequests` | `custom_requests` | CTX-ORD | `OrderingMergeConsequencePort` |
 * | `orders` | `orders` | CTX-ORD | same |
 * | `uploadedAssets` | `assets.uploaded_by_customer_id` | CTX-AST | `AssetMergeConsequencePort` |
 *
 * The two out-of-context categories are read through ports their owning modules
 * implement, never by reaching into their tables (`CLAUDE.md` §5,
 * `BACKEND_CONVENTIONS.md` §10). Neither port carries a transfer method: the
 * ownership-transfer seam belongs to `APP10-B03`.
 *
 * ### Frozen commercial evidence is excluded, and this is the list
 *
 * Eight further tables carry a `customer_id`, and none is counted, because a
 * merge does not rewrite history — the schema comment on `customer_merge_cases`
 * says so in as many words, and `APP10-G01` §E.2 enumerates them:
 * `approval_snapshots`, `quotation_acceptances`, `design_reviews`,
 * `audit_events`, `custom_request_transitions` and `order_transitions`. The last
 * three are append-only by construction, and the first three are frozen
 * commercial evidence an approval or an acceptance was taken against. Including
 * any of them would tell an operator that confirming a merge rewrites the record
 * of what a customer agreed to, which is the opposite of what execution does.
 *
 * Having a `customer_id` is therefore not the test. Being *repointable* is.
 *
 * ### The counts are advisory, and are not stored
 *
 * They are computed from current rows on every read and persisted nowhere.
 * Rows arrive and leave between opening a case and executing it, so a stored
 * count would be a stale number wearing the authority of a record;
 * `APP10-B03` re-evaluates actual state inside the transaction that moves it,
 * and a preview is decision support, not a reservation (`APP10-B02` §8.3).
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  ASSET_MERGE_CONSEQUENCE_PORT,
  type AssetMergeConsequencePort,
} from '../../asset/domain/repositories/customer-merge-consequence.port';
import {
  ORDERING_MERGE_CONSEQUENCE_PORT,
  type OrderingMergeConsequencePort,
} from '../../order/domain/repositories/customer-merge-consequence.port';
import {
  CUSTOMER_MERGE_PREVIEW_PORT,
  type CustomerMergePreviewPort,
} from '../domain/repositories/customer-merge-preview.port';
import type { CustomerId } from '../domain/repositories/customer.repository';

/**
 * The bounded preview.
 *
 * An explicit object with six named members rather than a map of table names to
 * numbers: a key/value bag would publish the physical schema as the product
 * contract and would let a later writer add a category without anyone reviewing
 * whether it is live or frozen.
 */
export interface MergeConsequencePreview {
  readonly contactPoints: number;
  readonly activeSecureAccessGrants: number;
  readonly customRequests: number;
  readonly orders: number;
  readonly uploadedAssets: number;
  readonly businessProfile: boolean;
}

@Injectable()
export class MergeConsequencePreviewReader {
  constructor(
    @Inject(CUSTOMER_MERGE_PREVIEW_PORT)
    private readonly customerOwned: CustomerMergePreviewPort,
    @Inject(ORDERING_MERGE_CONSEQUENCE_PORT)
    private readonly ordering: OrderingMergeConsequencePort,
    @Inject(ASSET_MERGE_CONSEQUENCE_PORT)
    private readonly assets: AssetMergeConsequencePort,
  ) {}

  /**
   * The preview for one merge case, computed for the **loser**.
   *
   * The loser is the side that moves: execution carries its live references to
   * the survivor and revokes its active grants. Counting the survivor's rows
   * would describe what already belongs where it is going to stay.
   */
  async forLoser(loserCustomerId: CustomerId): Promise<MergeConsequencePreview> {
    const [owned, ordering, uploadedAssets] = await Promise.all([
      this.customerOwned.countOwnedReferences(loserCustomerId),
      this.ordering.countLiveCustomerReferences(loserCustomerId),
      this.assets.countUploadsByCustomer(loserCustomerId),
    ]);

    return {
      contactPoints: owned.contactPoints,
      activeSecureAccessGrants: owned.activeSecureAccessGrants,
      customRequests: ordering.customRequests,
      orders: ordering.orders,
      uploadedAssets,
      businessProfile: owned.businessProfile,
    };
  }
}
