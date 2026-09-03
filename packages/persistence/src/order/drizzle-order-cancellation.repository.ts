/**
 * Cancellation-review persistence for AGG-15 (TBL-049).
 *
 * Extracted from {@link DrizzleOrderShippingRepository} by `APP12-H01`
 * (FU-APP12-B05-02), which found that file at 399 of the 400-line hard limit —
 * one line from being unchangeable. The split is by responsibility, not by line
 * count: a cancellation request is a review workflow with its own status
 * machine (`PENDING → APPROVED | DENIED`), its own actors and its own table,
 * and it shares nothing with an address, a freeze or a dispatch snapshot beyond
 * the order it hangs off.
 *
 * Both halves still serve the single `OrderRepository` contract through
 * `DrizzleOrderRepository`, so the aggregate's public API is unchanged and no
 * caller learns that this class exists (DB7 §10.1).
 */
import { Injectable } from '@nestjs/common';
import { notFoundError, schema } from '@embroidery/database';
import { and, eq } from 'drizzle-orm';

import { DatabaseExecutor } from '../runtime/database-executor';
import { DrizzleRepository } from '../repository/drizzle-repository';
import type { OrderId } from './order.repository';

const { orderCancellationRequests } = schema;

@Injectable()
export class DrizzleOrderCancellationRepository extends DrizzleRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async openCancellationRequest(input: {
    id: string;
    orderId: OrderId;
    stage: string;
    initiator: string;
    reason: string;
    grantId?: string | undefined;
    stepUpChallengeId?: string | undefined;
  }): Promise<void> {
    return this.run('openCancellationRequest', async () => {
      await this.db.insert(orderCancellationRequests).values({
        id: input.id,
        orderId: input.orderId,
        stage: input.stage,
        initiator: input.initiator,
        status: 'PENDING',
        reason: input.reason,
        grantId: input.grantId ?? null,
        stepUpChallengeId: input.stepUpChallengeId ?? null,
      });
    });
  }

  async resolveCancellationRequest(id: string, approved: boolean, adminId: string): Promise<void> {
    return this.run('resolveCancellationRequest', async () => {
      const now = new Date();
      const rows = await this.db
        .update(orderCancellationRequests)
        .set({
          status: approved ? 'APPROVED' : 'DENIED',
          decidedByAdminId: adminId,
          decidedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(orderCancellationRequests.id, id),
            // Only a pending request may be decided: re-deciding would
            // overwrite the record of what was actually decided.
            eq(orderCancellationRequests.status, 'PENDING'),
          ),
        )
        .returning({ id: orderCancellationRequests.id });

      if (rows.length === 0) {
        throw notFoundError(
          'OrderRepository.resolveCancellationRequest',
          'That cancellation request is not pending.',
        );
      }
    });
  }
}
