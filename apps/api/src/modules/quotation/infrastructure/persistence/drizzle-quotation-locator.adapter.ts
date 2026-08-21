/**
 * The `APP6-A01` §4 locator, as one narrow statement.
 *
 * It selects the `id` column alone rather than delegating to
 * `DrizzleQuotationRepository.findByRequest`, which selects the whole row and
 * maps it into a `Quotation`. `catalog-subject.port.ts` records the same trade:
 * a narrow query is preferred to loading a wider aggregate and dropping most of
 * it afterwards, because what is never retrieved cannot leak. Here that also
 * keeps the header's `status` and `currentVersionId` out of a code path whose
 * caller is contractually forbidden to publish them.
 *
 * `limit(1)` is belt-and-braces over a relation the schema already makes unique:
 * one quotation per custom request.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { eq } from 'drizzle-orm';

import type { QuotationLocatorPort } from '../../domain/repositories/quotation-locator.port';

const { quotations } = schema;

@Injectable()
export class DrizzleQuotationLocator extends DrizzleRepository implements QuotationLocatorPort {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findQuotationIdForRequest(customRequestId: string): Promise<string | undefined> {
    return this.run('findQuotationIdForRequest', async () => {
      const [row] = await this.db
        .select({ id: quotations.id })
        .from(quotations)
        .where(eq(quotations.customRequestId, customRequestId))
        .limit(1);
      return row?.id;
    });
  }
}
