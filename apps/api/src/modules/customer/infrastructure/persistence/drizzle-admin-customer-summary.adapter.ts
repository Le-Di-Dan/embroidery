/**
 * The Admin customer summary, against Customer's own tables (`APP5-B04` §9.2).
 *
 * A read-only adapter beside `DrizzleCustomerRepository` rather than four more
 * methods on it, for the reason `custom-request-status.repository.ts` records:
 * a narrow projection must not be a wide contract with the private parts
 * dropped afterwards. Every statement below names its columns, and
 * `merged_into_customer_id`, `anonymized_at`, `notes`, `display_value` and the
 * contact-point id are not among them — so they are never retrieved, not merely
 * never mapped.
 *
 * The one value that is read and does not leave is `normalized_value`: it is
 * the input to `maskContact`, and the masked form is the only representation
 * the port's types can hold.
 *
 * No transaction, no write, no audit event. Reading a customer is not an action.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import type { ContactKind } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

import { maskContact } from '../../domain/contact/mask-contact';
import { normalizeEmail } from '../../domain/contact/normalize-email';
import { normalizePhone } from '../../domain/contact/normalize-phone';
import type {
  AdminCustomerContactSummary,
  AdminCustomerSummary,
  AdminCustomerSummaryPort,
} from '../../domain/repositories/admin-customer-summary.port';

const { customers, customerContactPoints } = schema;

@Injectable()
export class DrizzleAdminCustomerSummaryAdapter
  extends DrizzleRepository
  implements AdminCustomerSummaryPort
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findQueueSummaries(
    customerIds: readonly string[],
  ): Promise<ReadonlyMap<string, AdminCustomerSummary>> {
    if (customerIds.length === 0) {
      return new Map();
    }
    return this.run('findQueueSummaries', async () => {
      const rows = await this.db
        .select({
          id: customers.id,
          displayName: customers.displayName,
          verifiedAt: customers.verifiedAt,
        })
        .from(customers)
        .where(inArray(customers.id, [...new Set(customerIds)]));

      return new Map(
        rows.map((row) => [
          row.id,
          {
            customerId: row.id,
            displayName: row.displayName ?? undefined,
            verifiedAt: row.verifiedAt,
            // Deliberately empty: a triage list names the person, and loading a
            // page of contacts would answer a question the queue does not ask.
            contacts: [],
          },
        ]),
      );
    });
  }

  async findDetailSummary(customerId: string): Promise<AdminCustomerSummary | undefined> {
    return this.run('findDetailSummary', async () => {
      const [row] = await this.db
        .select({
          id: customers.id,
          displayName: customers.displayName,
          verifiedAt: customers.verifiedAt,
        })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);

      if (row === undefined) {
        return undefined;
      }

      // Current contacts only — `ADR-DB2-003` r7 forbids a contact history, and
      // the predicate is in the query so no caller can widen it by mapping
      // differently.
      const contacts = await this.db
        .select({
          contactKind: customerContactPoints.contactKind,
          normalizedValue: customerContactPoints.normalizedValue,
          isPrimary: customerContactPoints.isPrimary,
          verifiedAt: customerContactPoints.verifiedAt,
        })
        .from(customerContactPoints)
        .where(
          and(
            eq(customerContactPoints.customerId, customerId),
            isNull(customerContactPoints.deactivatedAt),
          ),
        );

      return {
        customerId: row.id,
        displayName: row.displayName ?? undefined,
        verifiedAt: row.verifiedAt,
        contacts: contacts
          .map((contact): AdminCustomerContactSummary => ({
            kind: contact.contactKind as ContactKind,
            maskedValue: maskContact(contact.contactKind as ContactKind, contact.normalizedValue),
            verified: contact.verifiedAt !== null,
            primary: contact.isPrimary,
          }))
          // The order `AdminCustomerSupportQuery` renders: primary first, then
          // by kind, then by mask. Deterministic, so two reads of one request
          // draw the operator's card the same way.
          .sort(byPrimaryThenKind),
      };
    });
  }

  async resolveByExactContact(kind: ContactKind, rawContact: string): Promise<string | undefined> {
    const normalization =
      kind === 'EMAIL' ? normalizeEmail(rawContact) : normalizePhone(rawContact);
    if (!normalization.ok) {
      // A malformed value resolves to nothing, exactly as an unknown one does.
      // Reporting the difference would tell the caller something about a value
      // it may not own (`ADR-APP4-001` §3).
      return undefined;
    }

    return this.run('resolveByExactContact', async () => {
      const [row] = await this.db
        .select({ customerId: customerContactPoints.customerId })
        .from(customerContactPoints)
        .where(
          and(
            eq(customerContactPoints.contactKind, kind),
            eq(customerContactPoints.normalizedValue, normalization.contact.normalized),
            // Verified **and** current: that pair is the `(kind,
            // normalized_value)` uniqueness arbiter
            // (`uq_customer_contact_points__kind_value__verified`), so it is the
            // only predicate under which one contact means one customer. An
            // unverified row is not unique and would let the filter pick an
            // arbitrary owner for a value nobody proved they hold.
            isNull(customerContactPoints.deactivatedAt),
            isNotNull(customerContactPoints.verifiedAt),
          ),
        )
        .limit(1);

      return row?.customerId;
    });
  }
}

function byPrimaryThenKind(
  left: AdminCustomerContactSummary,
  right: AdminCustomerContactSummary,
): number {
  if (left.primary !== right.primary) {
    return left.primary ? -1 : 1;
  }
  if (left.kind !== right.kind) {
    return left.kind < right.kind ? -1 : 1;
  }
  return left.maskedValue < right.maskedValue ? -1 : 1;
}
