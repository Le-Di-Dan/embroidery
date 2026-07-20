/**
 * Deposit-satisfaction check against the payment tables (G-DB7-27).
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, eq } from 'drizzle-orm';

import type { DepositEligibilityPort } from '../../domain/repositories/deposit-eligibility.port';

const { paymentObligations } = schema;

@Injectable()
export class DrizzleDepositEligibilityAdapter
  extends DrizzleRepository
  implements DepositEligibilityPort
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async isDepositSatisfied(orderId: string): Promise<boolean> {
    return this.run('isDepositSatisfied', async () => {
      const [row] = await this.db
        .select({ id: paymentObligations.id })
        .from(paymentObligations)
        .where(
          and(
            eq(paymentObligations.orderId, orderId),
            eq(paymentObligations.kind, 'DEPOSIT'),
            eq(paymentObligations.status, 'SATISFIED'),
          ),
        )
        .limit(1);
      return row !== undefined;
    });
  }
}
