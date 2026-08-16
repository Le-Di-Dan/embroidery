/**
 * The APP5 intake cleanup queries (`APP5-B02` §7).
 *
 * Written as raw SQL rather than through the Drizzle query builder for one
 * reason: the eligibility predicate is the whole safety argument of this job,
 * and it reads as a single reviewable statement here. The `NOT EXISTS`
 * anti-join against `custom_request_assets`, the lane scope and the state
 * exclusion have to be evaluated together with the `UPDATE` — a builder
 * expression assembled across three helpers would be exactly as correct and
 * considerably harder to audit.
 *
 * Phase 1 uses `ORDER BY intake_expires_at, id` with `FOR UPDATE SKIP LOCKED`
 * inside the subquery. The order is the due-time index's own
 * (`ix_assets__intake_expires_id__live`), so the batch is a range scan rather
 * than a sort of the table; `SKIP LOCKED` means two worker replicas divide the
 * backlog instead of one waiting behind the other.
 *
 * No object-storage call happens here, and none may: an external call inside a
 * transaction holds a connection open for a network round trip and turns a
 * provider stall into a database incident.
 */
import { Injectable } from '@nestjs/common';
import { executeRaw, sql } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';

import { INTAKE_CLEANUP_REASON } from '../../domain/intake-cleanup.policy';
import type {
  ExpiredIntakeAsset,
  IntakeCleanupRepository,
} from '../../domain/repositories/intake-cleanup.repository';

/** The lane this sweep is authorized to touch, and nothing else. */
const LANE_KIND = 'CUSTOMER_UPLOAD';
const LANE_CLASSIFICATION = 'CUSTOMER_PRIVATE';

@Injectable()
export class SqlIntakeCleanupRepository
  extends DrizzleRepository
  implements IntakeCleanupRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async markExpiredForDeletion(now: Date, limit: number): Promise<number> {
    return this.run('markExpiredForDeletion', async () => {
      const tx = this.requireTransaction('markExpiredForDeletion');

      const rows = await executeRaw<{ id: string }>(
        tx,
        sql`
          update assets
             set status = 'DELETION_PENDING',
                 deletion_requested_at = ${now},
                 deletion_reason = ${INTAKE_CLEANUP_REASON},
                 updated_at = ${now}
           where id in (
             select a.id
               from assets a
              where a.intake_expires_at is not null
                and a.intake_expires_at < ${now}
                and a.deleted_at is null
                and a.kind = ${LANE_KIND}
                and a.classification = ${LANE_CLASSIFICATION}
                and a.status not in ('DELETION_PENDING', 'DELETED')
                and not exists (
                  select 1 from custom_request_assets cra where cra.asset_id = a.id
                )
              order by a.intake_expires_at, a.id
              limit ${limit}
                for update skip locked
           )
          returning id
        `,
      );
      return rows.length;
    });
  }

  async listPendingDeletion(limit: number): Promise<readonly ExpiredIntakeAsset[]> {
    return this.run('listPendingDeletion', async () => {
      const rows = await executeRaw<{ id: string; storage_key: string }>(
        this.db,
        sql`
          select id, storage_key
            from assets
           where status = 'DELETION_PENDING'
             and deleted_at is null
             and intake_expires_at is not null
             and kind = ${LANE_KIND}
             and classification = ${LANE_CLASSIFICATION}
           order by deletion_requested_at, id
           limit ${limit}
        `,
      );
      return rows.map((row) => ({ assetId: row.id, storageKey: row.storage_key }));
    });
  }

  async markBinaryDeleted(assetId: string, at: Date): Promise<void> {
    return this.run('markBinaryDeleted', async () => {
      const tx = this.requireTransaction('markBinaryDeleted');
      // The from-state is in the predicate, not an earlier read: the sweep is
      // at-least-once, so two passes can reach the same row, and a guarded
      // update that matches nothing is proof the other pass finished it.
      await executeRaw(
        tx,
        sql`
          update assets
             set status = 'DELETED',
                 deleted_at = ${at},
                 updated_at = ${at}
           where id = ${assetId}
             and status = 'DELETION_PENDING'
             and deleted_at is null
        `,
      );
    });
  }
}
