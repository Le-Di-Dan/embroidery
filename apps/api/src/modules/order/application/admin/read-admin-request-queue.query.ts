/**
 * The Admin request queue (`APP5-B04` §5–§8).
 *
 * An operational triage surface: which requests need a moderation decision, who
 * sent them, for what, and how many units. It is not a CRM — there is no
 * quotation, payment, order or production data here, no moderation history, no
 * attachment list and no free-text search over customers.
 *
 * ### Four statements for a page, never one per row
 *
 * The queue reads one keyset page of requests, then resolves the page's product
 * names, customer-owned names, customer names and quantity totals in one batched
 * statement each — four round trips whatever the page size, rather than the four
 * per row a naive projection would make (§8, §12).
 *
 * ### Cross-context reads go through ports
 *
 * Catalog names its own products and Customer masks its own contacts. This class
 * joins neither context's tables, and holds no repository of theirs.
 */
import { Inject, Injectable } from '@nestjs/common';
import { buildPage, decodeCursor, resolveLimit } from '@embroidery/persistence';
import type { ContactKind, CustomRequestState } from '@embroidery/database';

import {
  CATALOG_SUBJECT_PORT,
  type CatalogSubjectPort,
} from '../../../catalog/domain/repositories/catalog-subject.port';
import type { ProductId } from '../../../catalog/domain/repositories/placement-hierarchy.port';
import {
  ADMIN_CUSTOMER_SUMMARY_PORT,
  type AdminCustomerSummaryPort,
} from '../../../customer/domain/repositories/admin-customer-summary.port';
import { adminRequestReadError } from '../../domain/admin/admin-request-read.errors';
import {
  CUSTOM_REQUEST_ADMIN_REPOSITORY,
  type AdminRequestQueueRow,
  type AdminRequestSubjectKind,
  type CustomRequestAdminRepository,
} from '../../domain/repositories/custom-request-admin.repository';
import { projectQueueSubject, resolveStatusFilter } from './admin-request.projection';

export interface AdminRequestQueueInput {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly statuses?: readonly CustomRequestState[] | undefined;
  readonly subjectKind?: AdminRequestSubjectKind | undefined;
  readonly code?: string | undefined;
  readonly submittedFrom?: Date | undefined;
  readonly submittedTo?: Date | undefined;
  /** Both members or neither; the schema refuses one without the other. */
  readonly contactKind?: ContactKind | undefined;
  readonly contact?: string | undefined;
}

export interface AdminRequestQueueItem {
  readonly requestId: string;
  readonly code: string;
  readonly status: CustomRequestState;
  readonly subjectKind: AdminRequestSubjectKind;
  readonly subjectSummary: string | undefined;
  readonly customerId: string;
  readonly customerDisplayName: string | undefined;
  readonly submittedAt: Date;
  readonly totalQuantity: number;
}

export interface AdminRequestQueueView {
  readonly items: readonly AdminRequestQueueItem[];
  readonly nextCursor: string | undefined;
  readonly hasNext: boolean;
  /** Echoed so an operator's screen can show what it is actually triaging. */
  readonly appliedStatuses: readonly CustomRequestState[];
}

@Injectable()
export class ReadAdminRequestQueue {
  constructor(
    @Inject(CUSTOM_REQUEST_ADMIN_REPOSITORY)
    private readonly requests: CustomRequestAdminRepository,
    @Inject(CATALOG_SUBJECT_PORT) private readonly catalog: CatalogSubjectPort,
    @Inject(ADMIN_CUSTOMER_SUMMARY_PORT) private readonly customers: AdminCustomerSummaryPort,
  ) {}

  async list(input: AdminRequestQueueInput): Promise<AdminRequestQueueView> {
    const limit = resolveLimit(input.limit);
    const after = decodePosition(input.cursor);
    const statuses = resolveStatusFilter(input.statuses);

    const customerId = await this.resolveContactFilter(input);
    if (customerId === CONTACT_MATCHED_NOBODY) {
      // A contact that resolves to no customer is an empty page, not a 404: the
      // operator applied a filter, and "no request matches this filter" is the
      // truthful answer. A 404 would also make the endpoint report whether a
      // contact exists, which `APP4-B07` refuses to answer even for staff.
      return { items: [], nextCursor: undefined, hasNext: false, appliedStatuses: statuses };
    }

    const rows = await this.requests.listQueue({
      filter: {
        statuses,
        subjectKind: input.subjectKind,
        code: input.code,
        customerId,
        submittedFrom: input.submittedFrom,
        submittedTo: input.submittedTo,
      },
      after,
      limit,
    });

    const page = buildPage(rows, limit, (row: AdminRequestQueueRow) => ({
      sortValue: row.createdAt.toISOString(),
      tieBreaker: row.id,
    }));

    return {
      items: await this.describe(page.items),
      nextCursor: page.nextCursor,
      hasNext: page.nextCursor !== undefined,
      appliedStatuses: statuses,
    };
  }

  /** The four batched lookups, then one row per request. */
  private async describe(
    rows: readonly AdminRequestQueueRow[],
  ): Promise<readonly AdminRequestQueueItem[]> {
    if (rows.length === 0) {
      return [];
    }

    const productIds = rows
      .map((row) => row.productId)
      .filter((productId): productId is ProductId => productId !== undefined);

    const [productLabels, customerOwnedNames, quantityTotals, customers] = await Promise.all([
      this.catalog.findProductLabels(productIds),
      this.requests.loadQueueCustomerOwnedNames(rows.map((row) => row.id)),
      this.requests.loadQueueQuantityTotals(rows.map((row) => row.id)),
      this.customers.findQueueSummaries(rows.map((row) => row.customerId)),
    ]);

    return rows.map((row) => {
      const subject = projectQueueSubject(
        row,
        row.productId === undefined ? undefined : productLabels.get(row.productId),
        customerOwnedNames.get(row.id),
      );
      return {
        requestId: row.id,
        code: row.code,
        status: row.status,
        subjectKind: subject.kind,
        subjectSummary: subject.summary,
        customerId: row.customerId,
        customerDisplayName: customers.get(row.customerId)?.displayName,
        // TR-LC11-01 writes no transition row (`G01-D05`), so the request's own
        // `created_at` **is** its submission time. No second timestamp exists
        // and none is invented.
        submittedAt: row.createdAt,
        totalQuantity: quantityTotals.get(row.id) ?? 0,
      };
    });
  }

  /**
   * The contact filter, resolved through Customer's exact-lookup capability.
   *
   * `undefined` when the operator supplied no contact; the sentinel when they
   * supplied one that matches nobody. The two must not collapse — the first
   * means "do not filter", and the second means "filter, and nothing matches".
   */
  private async resolveContactFilter(
    input: AdminRequestQueueInput,
  ): Promise<string | undefined | typeof CONTACT_MATCHED_NOBODY> {
    if (input.contactKind === undefined || input.contact === undefined) {
      return undefined;
    }
    const customerId = await this.customers.resolveByExactContact(input.contactKind, input.contact);
    return customerId ?? CONTACT_MATCHED_NOBODY;
  }
}

const CONTACT_MATCHED_NOBODY = Symbol('CONTACT_MATCHED_NOBODY');

/**
 * A malformed cursor is a client error, never "start from the beginning".
 *
 * Silently restarting is how an operator paging a queue would process the first
 * page twice and believe they had reached the end of it.
 */
function decodePosition(
  cursor: string | undefined,
): { readonly createdAt: Date; readonly id: string } | undefined {
  if (cursor === undefined || cursor === '') {
    return undefined;
  }
  try {
    const decoded = decodeCursor(cursor);
    const createdAt = new Date(decoded.sortValue);
    if (Number.isNaN(createdAt.getTime())) {
      throw adminRequestReadError('REQUEST_CURSOR_INVALID');
    }
    return { createdAt, id: decoded.tieBreaker };
  } catch {
    throw adminRequestReadError('REQUEST_CURSOR_INVALID');
  }
}
