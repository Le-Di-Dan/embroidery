/**
 * How much of Ordering one customer still owns (`APP10-B02` §13).
 *
 * A **read-only** Ordering contract, on the rule `OrderDepositContextPort`
 * records: Customer must not read Ordering's tables (`BACKEND_CONVENTIONS.md`
 * §10, `CLAUDE.md` §5). The merge consequence preview has to tell an operator
 * how many custom requests and orders a merge would carry from the loser to the
 * survivor, and those two tables are Ordering's. The contract is Ordering's, the
 * statement runs against Ordering's own tables, and Customer consumes the
 * interface.
 *
 * ### Two counts, and nothing that could become a transfer
 *
 * There is no `repointCustomer`, no `transfer`, no `update` and no method that
 * takes a transaction. `APP10-B02` is the non-destructive half of merge: it
 * opens a case, describes it and may reject it, and it moves nothing. The
 * ownership-transfer seam `APP10-G01` §E.2 specifies belongs to `APP10-B03`,
 * which owns the one transaction that performs it — building it here would put
 * a cross-module write one injection away from a preview that must not write.
 *
 * ### Counts, not rows
 *
 * The preview publishes numbers. A list of a customer's orders would be a
 * second Ordering projection reachable from a Customer surface, with its own
 * fields to keep out of a response, and an operator deciding whether to merge
 * two identities needs to know *how much moves*, not what each row says. A
 * count also carries no PII, which is the whole reason the preview is shaped
 * this way (`APP10-B02` §14).
 *
 * `CUSTOM_REQUEST_REPOSITORY` and `ORDER_REPOSITORY` are the AGG-13/AGG-15
 * writers — `transition`, `createFromAcceptedQuotation`, `dispatch`. Exporting
 * either into the merge surface would hand a read a lifecycle.
 */
export const ORDERING_MERGE_CONSEQUENCE_PORT = Symbol('ORDERING_MERGE_CONSEQUENCE_PORT');

/**
 * The live Ordering rows that carry a `customer_id`.
 *
 * Both are **repointable** identity references: `DB4_SCHEMA_IDENTITY_CUSTOMER.md`
 * §7 and `DB3_CUSTOMER_VERIFICATION_MERGE_SPEC.md` §4 step 2 make a merge move
 * them to the survivor, and `ix_orders__customer` exists — labelled "CC-27
 * merge" in the schema — so a merge can find them.
 *
 * `custom_request_transitions.customer_id` and `order_transitions.customer_id`
 * are deliberately **not** here. Both are append-only history: the row records
 * who acted at a moment that has passed, and rewriting it would rewrite
 * evidence rather than move ownership. They are counted nowhere in the preview.
 */
export interface OrderingCustomerReferenceCounts {
  readonly customRequests: number;
  readonly orders: number;
}

export interface OrderingMergeConsequencePort {
  /**
   * How many custom requests and orders name this customer.
   *
   * Every row, whatever its state: a cancelled order and a rejected request
   * still carry `customer_id` under a `RESTRICT` foreign key, so a merge has to
   * move them too. Filtering by status would under-report what execution does.
   *
   * Opens no transaction and writes nothing. The counts are advisory —
   * `APP10-B02` §8.3 — and `APP10-B03` re-reads state inside its own
   * transaction rather than trusting a number a preview produced earlier.
   */
  countLiveCustomerReferences(customerId: string): Promise<OrderingCustomerReferenceCounts>;
}
