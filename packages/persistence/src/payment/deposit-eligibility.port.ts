/**
 * Deposit-satisfaction fact port — **G-DB7-27/GRD-013**.
 *
 * An official inventory reservation may only be created once the order's
 * Deposit obligation is SATISFIED. That fact lives entirely in the Payment
 * module's own tables (`orders.current_approval_snapshot_id` is `NOT NULL`,
 * so the approval-exists half of GRD-013 is already guaranteed physically
 * for any order — only the deposit half needs a runtime check).
 *
 * A **port**, deliberately: Inventory needs this one fact and
 * `BACKEND_CONVENTIONS.md` §10 forbids it from calling the payment module's
 * concrete repository or reading its tables. Inventory depends on this
 * interface; Payment provides the implementation.
 */

export const DEPOSIT_ELIGIBILITY_PORT = Symbol('DEPOSIT_ELIGIBILITY_PORT');

export interface DepositEligibilityPort {
  /** True only if the order's DEPOSIT obligation exists and is SATISFIED. */
  isDepositSatisfied(orderId: string): Promise<boolean>;
}
