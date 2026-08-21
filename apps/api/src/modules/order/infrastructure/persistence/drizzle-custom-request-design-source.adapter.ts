/**
 * Drizzle implementation of the submitted-design pointer port (`APP6-B07` §5).
 *
 * Two columns, named explicitly. `select()` with no projection would return
 * whatever TBL-037 grows next — which today already means `customer_id`,
 * `status`, `cancelled_reason`, `customer_note` and `current_quotation_id` — so
 * listing the two columns is what makes "nothing else is retrieved" a property
 * of the statement rather than of a mapper someone could later edit.
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
  CustomRequestDesignSourcePointer,
  CustomRequestDesignSourcePort,
} from '../../domain/repositories/custom-request-design-source.port';

const { customRequests } = schema;

@Injectable()
export class DrizzleCustomRequestDesignSourceAdapter
  extends DrizzleRepository
  implements CustomRequestDesignSourcePort
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findDesignSourcePointer(
    id: CustomRequestId,
  ): Promise<CustomRequestDesignSourcePointer | undefined> {
    return this.run('findDesignSourcePointer', async () => {
      const [row] = await this.db
        .select({
          id: customRequests.id,
          submittedSessionId: customRequests.submittedSessionId,
        })
        .from(customRequests)
        .where(eq(customRequests.id, id))
        .limit(1);

      if (row === undefined) {
        return undefined;
      }
      return {
        requestId: row.id as CustomRequestId,
        submittedSessionId: row.submittedSessionId ?? undefined,
      };
    });
  }
}
