/**
 * The append-only merge evidence writer (`APP10-B03` §16).
 *
 * **One statement, and it is an INSERT.** This class contains no `update`, no
 * `delete` and no read: there is physically no path through it by which a merge
 * event could be corrected, back-dated or removed. CST-098's database-level
 * append-only trigger is a documented, not-yet-built DB-phase gap, so this shape
 * is the guarantee in the meantime — the same discipline
 * `inventory_ledger_entries` and `custom_request_transitions` already rely on.
 *
 * `id` is never supplied: `customer_merge_events.id` is
 * `generated always as identity`, so the sequence orders the steps of a merge
 * and no caller can choose where a row lands in that order.
 *
 * `detail` is serialized here rather than assembled by a use case, so the shape
 * of what merge history records is decided in one place. It carries the two
 * customer ids and a count — server-derived values, all of them — and there is
 * no member on {@link AppendMergeEventInput} through which a contact value, a
 * display name, an operator's reason or a row snapshot could reach it.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';

import type {
  AppendMergeEventInput,
  CustomerMergeEventRepository,
} from '../../domain/repositories/customer-merge-event.repository';

const { customerMergeEvents } = schema;

@Injectable()
export class DrizzleCustomerMergeEventRepository
  extends DrizzleRepository
  implements CustomerMergeEventRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async append(entries: readonly AppendMergeEventInput[]): Promise<void> {
    return this.run('append', async () => {
      if (entries.length === 0) {
        return;
      }
      // The caller's transaction, always: evidence of a merge that rolled back
      // would be a record of something that never happened.
      const tx = this.requireTransaction('append');
      await tx.insert(customerMergeEvents).values(
        entries.map((entry) => ({
          mergeCaseId: entry.mergeCaseId,
          stepKind: entry.stepKind,
          subjectTable: entry.subjectTable,
          subjectId: entry.subjectId,
          detail: JSON.stringify({
            toCustomerId: entry.targetCustomerId,
            affectedCount: entry.affectedCount,
            ...(entry.primaryDemoted === undefined ? {} : { primaryDemoted: entry.primaryDemoted }),
          }),
        })),
      );
    });
  }
}
