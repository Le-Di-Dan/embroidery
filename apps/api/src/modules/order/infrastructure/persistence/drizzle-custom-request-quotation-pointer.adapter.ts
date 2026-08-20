/**
 * Drizzle implementation of the current-quotation pointer port (`APP6-B04` §7).
 *
 * Two columns, named explicitly. `select()` with no projection would return
 * whatever TBL-037 grows next — which today already means `customer_id`,
 * `cancelled_reason`, `customer_note` and `submitted_session_id` — so listing
 * the two columns is what makes "nothing else is retrieved" a property of the
 * statement rather than of a mapper someone could later edit.
 *
 * No write, no transaction, no lock: `DatabaseModule`'s executor is used for the
 * one `select`. Reading a pointer changes nothing, and this class has no method
 * that could.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { eq } from 'drizzle-orm';

import type { CustomRequestId } from '../../domain/repositories/custom-request.repository';
import type {
  CustomRequestQuotationPointer,
  CustomRequestQuotationPointerPort,
} from '../../domain/repositories/custom-request-quotation-pointer.port';

const { customRequests } = schema;

@Injectable()
export class DrizzleCustomRequestQuotationPointerAdapter
  extends DrizzleRepository
  implements CustomRequestQuotationPointerPort
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findQuotationPointer(
    id: CustomRequestId,
  ): Promise<CustomRequestQuotationPointer | undefined> {
    return this.run('findQuotationPointer', async () => {
      const [row] = await this.db
        .select({
          id: customRequests.id,
          currentQuotationId: customRequests.currentQuotationId,
        })
        .from(customRequests)
        .where(eq(customRequests.id, id))
        .limit(1);

      if (row === undefined) {
        return undefined;
      }
      return {
        requestId: row.id as CustomRequestId,
        currentQuotationId: row.currentQuotationId ?? undefined,
      };
    });
  }
}
