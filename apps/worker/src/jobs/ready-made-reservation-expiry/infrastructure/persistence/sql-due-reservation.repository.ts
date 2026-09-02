/**
 * The due-reservation candidate query (`BR-026`).
 *
 * Raw SQL rather than the query builder, for the reason
 * `sql-intake-cleanup.repository.ts` records: the eligibility predicate is the
 * whole safety argument of this job, and it reads as one reviewable statement
 * here. The join to `orders`, the origin scope and the two-state status filter
 * have to be evaluated together, and a builder expression assembled across
 * three helpers would be exactly as correct and considerably harder to audit.
 *
 * `r.status = 'RESERVED' AND r.expires_at IS NOT NULL` is verbatim the partial
 * predicate of `ix_inventory_reservations__expires_id__reserved` (IDX-110), and
 * `ORDER BY r.expires_at, r.id` is that index's own key order, so the batch is
 * a range scan over exactly the rows the index contains.
 *
 * No lock and no `FOR UPDATE`: see `due-reservation.repository.ts` — the result
 * is a suggestion that the acting transaction re-decides under its own locks.
 */
import { Injectable } from '@nestjs/common';
import { executeRaw, sql } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';

import type {
  DueReservation,
  DueReservationRepository,
} from '../../domain/repositories/due-reservation.repository';

/** `COL-TBL043-12`. This sweep is authorized over one origin and states it. */
const READY_MADE = 'READY_MADE';

/** `BR-026` — the two pre-payment states, and only those. */
const AWAITING_SHIPPING_FEE = 'AWAITING_SHIPPING_FEE';
const AWAITING_PAYMENT = 'AWAITING_PAYMENT';

@Injectable()
export class SqlDueReservationRepository
  extends DrizzleRepository
  implements DueReservationRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async listDue(now: Date, limit: number): Promise<readonly DueReservation[]> {
    return this.run('listDue', async () => {
      const rows = await executeRaw<{ reservation_id: string; order_id: string }>(
        this.db,
        sql`
          select r.id as reservation_id, r.order_id as order_id
            from inventory_reservations r
            join orders o on o.id = r.order_id
           where r.status = 'RESERVED'
             and r.expires_at is not null
             and r.expires_at <= ${now}
             and o.origin = ${READY_MADE}
             and o.status in (${AWAITING_SHIPPING_FEE}, ${AWAITING_PAYMENT})
           order by r.expires_at, r.id
           limit ${limit}
        `,
      );

      return rows.map((row) => ({ reservationId: row.reservation_id, orderId: row.order_id }));
    });
  }
}
