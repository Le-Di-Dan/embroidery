/**
 * Moving `assets.uploaded_by_customer_id` from one identity to another
 * (`APP10-B03` §13, §14).
 *
 * The **write** counterpart of `customer-merge-consequence.port.ts`, separate
 * from it for the reason Ordering's pair is separate: the consequence port
 * serves a preview that must not write, and this one writes. `ASSET_REPOSITORY`
 * is not reused either — it is the AGG write contract whose rows carry
 * `storage_key`, the private object-storage location of a customer's original
 * artwork, and a merge needs one number.
 *
 * It joins the caller's transaction through `DatabaseExecutor`'s ambient handle
 * and asserts the boundary rather than taking one as a parameter; the reasoning
 * is recorded once on Ordering's port.
 */
export const ASSET_CUSTOMER_OWNERSHIP_TRANSFER_PORT = Symbol(
  'ASSET_CUSTOMER_OWNERSHIP_TRANSFER_PORT',
);

export interface AssetCustomerOwnershipTransferPort {
  /**
   * Repoints every asset uploaded by one customer to another, returning how
   * many moved.
   *
   * Every row whatever its status: a rejected or deleted asset still carries
   * `uploaded_by_customer_id`, and leaving it pointing at a tombstoned customer
   * is precisely what execution exists to avoid. Nothing else about an asset
   * changes — not its storage key, its classification, its status or its
   * derivatives.
   *
   * @requiresTransaction — one step of a merge that commits as a whole or not at
   * all.
   */
  repointUploader(fromCustomerId: string, toCustomerId: string): Promise<number>;
}
