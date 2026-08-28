/**
 * Row → domain mapping for the AGG-02 Customer aggregate.
 *
 * Separated from the repository so the repository file is persistence
 * behaviour only. This is the single boundary at which a database row becomes
 * a domain object: no row escapes the infrastructure layer unmapped
 * (`BACKEND_CONVENTIONS.md` §5, DB7 §10.4).
 */
import type { ContactKind, schema } from '@embroidery/database';

import type {
  ContactPoint,
  ContactPointId,
  Customer,
  CustomerId,
} from '../../domain/repositories/customer.repository';

export type CustomerRow = typeof schema.customers.$inferSelect;
export type ContactRow = typeof schema.customerContactPoints.$inferSelect;

/**
 * Replaces PII with a fixed marker rather than NULL.
 *
 * NULL would be indistinguishable from "never set"; the marker keeps the row
 * legible as "this was anonymized", which is what an auditor needs to see.
 */
export const ANONYMIZED_MARKER = '[anonymized]';

export function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id as CustomerId,
    displayName: row.displayName ?? undefined,
    notes: row.notes ?? undefined,
    verifiedAt: row.verifiedAt,
    mergedIntoCustomerId: (row.mergedIntoCustomerId ?? undefined) as CustomerId | undefined,
    anonymizedAt: row.anonymizedAt ?? undefined,
  };
}

export function toContact(row: ContactRow): ContactPoint {
  return {
    id: row.id as ContactPointId,
    customerId: row.customerId as CustomerId,
    contactKind: row.contactKind as ContactKind,
    normalizedValue: row.normalizedValue,
    displayValue: row.displayValue,
    isPrimary: row.isPrimary,
    verifiedAt: row.verifiedAt ?? undefined,
    deactivatedAt: row.deactivatedAt ?? undefined,
  };
}
