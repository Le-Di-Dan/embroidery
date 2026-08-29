/**
 * Moving Ordering's live customer references from one identity to another
 * (`APP10-B03` §13, §14).
 *
 * The **write** counterpart of `customer-merge-consequence.port.ts`, and a
 * separate contract rather than two more methods on it. That port belongs to the
 * `APP10-B02` consequence preview, which must not be able to write anything;
 * adding a transfer method there would put a cross-module `UPDATE` one injection
 * away from a read surface. Two ports, two modules, and a consumer takes only
 * the one its work needs.
 *
 * ### Ordering's tables, Ordering's statement
 *
 * `custom_requests` and `orders` are CTX-ORD's (`CLAUDE.md` §5,
 * `BACKEND_CONVENTIONS.md` §10). Customer holds this interface and never the
 * tables behind it; the statement runs in Ordering's own adapter.
 *
 * ### It joins the caller's transaction — it does not open one
 *
 * There is no `tx` parameter, and that is the repository's native mechanism
 * rather than an omission: `DatabaseExecutor` resolves the ambient transaction
 * through `AsyncLocalStorage`, so an implementation issuing a statement inside
 * `TransactionManager.runInTransaction` is already *in* that transaction. The
 * implementation additionally calls `requireTransaction`, so a caller that
 * forgot the boundary fails loudly instead of committing a repoint on its own.
 * Passing a handle across a module boundary would have been the leak
 * `BACKEND_CONVENTIONS.md` §5.14 forbids, and inventing a generic ORM-shaped
 * transaction argument would have been a second transaction model beside the
 * one this repository already has.
 */
export const ORDERING_CUSTOMER_OWNERSHIP_TRANSFER_PORT = Symbol(
  'ORDERING_CUSTOMER_OWNERSHIP_TRANSFER_PORT',
);

/**
 * How many rows each Ordering category actually moved.
 *
 * Per category, not one total: `APP10-B03` §16.2 appends one
 * `OWNERSHIP_TRANSFER` event per owning table, and a single opaque sum would
 * make the evidence unable to say whether three orders and no requests moved, or
 * the other way round. Both numbers come from the statements that changed the
 * rows, so they describe the transaction rather than a preview taken earlier.
 */
export interface OrderingOwnershipTransferCounts {
  readonly customRequests: number;
  readonly orders: number;
}

export interface OrderingCustomerOwnershipTransferPort {
  /**
   * Repoints every `custom_requests` and `orders` row from one customer to
   * another.
   *
   * **Live ownership only.** `custom_request_transitions.customer_id` and
   * `order_transitions.customer_id` are deliberately not touched: both are
   * append-only history recording who acted at a moment that has passed, and
   * rewriting them would rewrite evidence rather than move ownership. The same
   * holds for every frozen commercial row Ordering's tables are joined to —
   * approval snapshots and quotation acceptances keep the customer they were
   * taken against.
   *
   * Every live row moves whatever its state: a cancelled order and a rejected
   * request still carry `customer_id` under a `RESTRICT` foreign key, so leaving
   * one behind would attach a live reference to a tombstone.
   *
   * @requiresTransaction — one step of a merge that commits as a whole or not at
   * all.
   */
  repointCustomer(
    fromCustomerId: string,
    toCustomerId: string,
  ): Promise<OrderingOwnershipTransferCounts>;
}
