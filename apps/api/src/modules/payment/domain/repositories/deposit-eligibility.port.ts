/**
 * The deposit-satisfaction fact Inventory gates on — re-exported from its shared
 * home (`APP7-W01-C1`).
 *
 * It moved with the AGG-16 repository it reads through, and nothing about it
 * changed: Inventory still learns whether an order's DEPOSIT obligation is
 * satisfied (G-DB7-27) without importing CTX-PAY's repository or touching its
 * tables (`BACKEND_CONVENTIONS.md` §10).
 *
 * This file is a re-export and holds no logic; `DEPOSIT_ELIGIBILITY_PORT` is the
 * same Symbol instance.
 */
export { DEPOSIT_ELIGIBILITY_PORT } from '@embroidery/persistence';
export type { DepositEligibilityPort } from '@embroidery/persistence';
