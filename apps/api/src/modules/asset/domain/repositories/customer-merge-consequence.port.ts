/**
 * How many assets one customer uploaded (`APP10-B02` §13).
 *
 * A **read-only** Asset contract, for the reason Ordering has one: the merge
 * consequence preview must tell an operator how many uploads a merge would
 * carry from the loser to the survivor, and `assets` is CTX-AST's table.
 * Customer must not read it (`BACKEND_CONVENTIONS.md` §10), so the contract is
 * Asset's, the statement runs here, and Customer consumes the interface.
 *
 * `ASSET_REPOSITORY` is not reused. It is the AGG write contract — accept,
 * reject, request deletion — and it returns rows carrying `storage_key`, the
 * private object-storage location of a customer's original artwork. A merge
 * preview needs one number, and a port that returns a number cannot leak a
 * storage key.
 *
 * There is no transfer method here, and `APP10-B02` adds none: the
 * ownership-transfer seam belongs to `APP10-B03`, the checkpoint that owns the
 * transaction which performs it.
 */
export const ASSET_MERGE_CONSEQUENCE_PORT = Symbol('ASSET_MERGE_CONSEQUENCE_PORT');

export interface AssetMergeConsequencePort {
  /**
   * How many `assets` rows name this customer as their uploader.
   *
   * `assets.uploaded_by_customer_id` is a **live** identity reference —
   * `APP10-G01` §E.2 lists it among the columns a merge repoints — so every row
   * counts, whatever the asset's status. A deleted or rejected asset still
   * carries the column under a foreign key, and leaving it pointing at a
   * tombstoned customer is precisely what execution has to avoid.
   *
   * Opens no transaction and writes nothing.
   */
  countUploadsByCustomer(customerId: string): Promise<number>;
}
