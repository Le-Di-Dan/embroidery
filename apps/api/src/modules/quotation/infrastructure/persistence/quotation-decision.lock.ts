/**
 * The one read both customer decisions are judged on (`APP6-B05`).
 *
 * `accept` and `reject` ask almost the same question of the same row — *is this
 * exact version still the one the quotation is offering?* — and the eligibility
 * of a customer's whole decision rests on it. Written twice, the two copies
 * would be free to drift, and the drift would be invisible: each method's own
 * tests would keep passing while acceptance and rejection quietly disagreed
 * about what "current" means.
 *
 * ### What it establishes
 *
 * - the version exists and is `SENT` — a draft was never offered, and a
 *   superseded, accepted, rejected, expired or void one is no longer the offer;
 * - `quotations.current_version_id` still names it (G-DB7-03 / GRD-006), which
 *   is the check a stale customer page fails;
 * - optionally, that the validity window has not closed — `undefined` for
 *   rejection, which GRD-006 does not guard (see the port).
 *
 * ### The lock
 *
 * `FOR UPDATE OF quotation_versions` holds **the version row** for the rest of
 * the caller's transaction, not the quotation header it joins. That is the row
 * two decisions and a competing send all contend on, and locking the header
 * instead would serialize every version of the same quotation against each other
 * for no benefit.
 *
 * The header is nonetheless read in the same statement, under the same snapshot,
 * so `current_version_id` cannot be observed from a moment other than the one
 * the version was observed at.
 */
import { schema } from '@embroidery/database';
import type { Transaction } from '@embroidery/database';
import { and, eq, gt, isNull, or } from 'drizzle-orm';

import type { QuotationVersionId } from '../../domain/repositories/quotation.repository';

const { quotations, quotationVersions } = schema;

/** The locked version row, and the pointer that decides whether it is current. */
export interface LockedDecisionTarget {
  readonly version: typeof quotationVersions.$inferSelect;
  readonly currentVersionId: string | null;
}

/**
 * Locks the addressed version and reads its quotation's current pointer.
 *
 * Returns `undefined` when no row matches the predicate at all — absent,
 * not `SENT`, or (when `unexpiredAt` is given) past its validity. The caller
 * distinguishes that from "matched, but no longer current" by comparing
 * {@link LockedDecisionTarget.currentVersionId}, because the two produce
 * different public codes.
 */
export async function lockDecisionTarget(
  tx: Transaction,
  versionId: QuotationVersionId,
  unexpiredAt: Date | undefined,
): Promise<LockedDecisionTarget | undefined> {
  const [row] = await tx
    .select({ version: quotationVersions, currentVersionId: quotations.currentVersionId })
    .from(quotationVersions)
    .innerJoin(quotations, eq(quotationVersions.quotationId, quotations.id))
    .where(
      and(
        eq(quotationVersions.id, versionId),
        eq(quotationVersions.status, 'SENT'),
        // `valid_until` null means no window was ever set, which only a version
        // that was never sent can be — kept anyway so the predicate says what it
        // means rather than relying on the `SENT` clause above to imply it.
        //
        // `gt`, not `gte`: the comparison is `now < valid_until`, so the instant
        // named by "valid **until**" is already outside the window (CC-06).
        ...(unexpiredAt === undefined
          ? []
          : [
              or(
                isNull(quotationVersions.validUntil),
                gt(quotationVersions.validUntil, unexpiredAt),
              ),
            ]),
      ),
    )
    .limit(1)
    .for('update', { of: quotationVersions });

  return row === undefined
    ? undefined
    : { version: row.version, currentVersionId: row.currentVersionId };
}
