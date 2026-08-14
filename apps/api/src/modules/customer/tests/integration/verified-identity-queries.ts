/**
 * State readers for the `APP4-B02` verified-identity suites.
 *
 * Separated from the fixture because they answer the opposite question: the
 * fixture arranges, these observe. `contactValueAppears` is the one that carries
 * the privacy claim — the audit trail must not contain the address, and the only
 * way to make that assertion mean anything is to search every textual field an
 * audit row has rather than the one the author remembered.
 *
 * Test-only.
 */
import { sql } from 'drizzle-orm';

import type { VerifiedIdentityContext } from './verified-identity-context';

async function rows<T>(
  context: VerifiedIdentityContext,
  statement: ReturnType<typeof sql>,
): Promise<T[]> {
  // The driver types its rows as its own row shape; the cast happens here once
  // rather than at each of the readers below.
  const result = await context.disposable.client.db.execute(statement);
  return result.rows as T[];
}

export async function customerCount(context: VerifiedIdentityContext): Promise<number> {
  const [row] = await rows<{ total: number }>(
    context,
    sql`select count(*)::int as total from customers`,
  );
  return Number(row?.total ?? -1);
}

export interface ContactRow {
  readonly id: string;
  readonly customer_id: string;
  readonly contact_kind: string;
  readonly normalized_value: string;
  readonly is_primary: boolean;
  /** Raw SQL returns a timestamp as its text form, not a Date. */
  readonly verified_at: string | null;
  readonly verified_source: string | null;
  readonly deactivated_at: string | null;
}

export function contactsOf(
  context: VerifiedIdentityContext,
  customerId: string,
): Promise<ContactRow[]> {
  return rows<ContactRow>(
    context,
    sql`
      select id, customer_id, contact_kind, normalized_value, is_primary,
             verified_at, verified_source, deactivated_at
      from customer_contact_points
      where customer_id = ${customerId}
      order by created_at, id
    `,
  );
}

/** Every row holding this identity verified and active, across all customers. */
export function activeVerifiedOwners(
  context: VerifiedIdentityContext,
  contactKind: string,
  normalizedValue: string,
): Promise<{ customer_id: string; id: string }[]> {
  return rows<{ customer_id: string; id: string }>(
    context,
    sql`
      select customer_id, id from customer_contact_points
      where contact_kind = ${contactKind} and normalized_value = ${normalizedValue}
        and verified_at is not null and deactivated_at is null
    `,
  );
}

/** Primary contacts of one customer. More than one is a CST-006 breach. */
export function primaryContactsOf(
  context: VerifiedIdentityContext,
  customerId: string,
): Promise<{ id: string }[]> {
  return rows<{ id: string }>(
    context,
    sql`
      select id from customer_contact_points
      where customer_id = ${customerId} and is_primary = true
    `,
  );
}

export interface AuditRow {
  readonly action: string;
  readonly actor_kind: string;
  readonly customer_id: string | null;
  readonly admin_id: string | null;
  readonly system_job_key: string | null;
  readonly target_kind: string;
  readonly target_id: string;
  readonly summary: Record<string, unknown> | null;
  readonly reason: string | null;
  readonly correlation_id: string;
}

export function auditEventsFor(
  context: VerifiedIdentityContext,
  customerId: string,
): Promise<AuditRow[]> {
  return rows<AuditRow>(
    context,
    sql`
      select action, actor_kind, customer_id, admin_id, system_job_key,
             target_kind, target_id, summary, reason, correlation_id
      from audit_events
      where target_kind = 'CUSTOMER' and target_id = ${customerId}
      order by id
    `,
  );
}

export async function auditEventCount(context: VerifiedIdentityContext): Promise<number> {
  const [row] = await rows<{ total: number }>(
    context,
    sql`select count(*)::int as total from audit_events`,
  );
  return Number(row?.total ?? -1);
}

/**
 * Whether a contact value appears anywhere in the audit trail.
 *
 * Every textual and JSON field an `audit_events` row has, concatenated. The
 * contact *does* legitimately live in `customer_contact_points`, which is why
 * that table is not searched — the claim is about evidence rows, not about the
 * table whose job is to hold the address.
 */
export async function contactValueAppearsInAudit(
  context: VerifiedIdentityContext,
  value: string,
): Promise<boolean> {
  const [row] = await rows<{ total: number }>(
    context,
    sql`
      select count(*)::int as total from audit_events
      where (action || actor_kind || coalesce(customer_id::text, '')
             || coalesce(admin_id::text, '') || coalesce(grant_id::text, '')
             || coalesce(system_job_key, '') || target_kind || target_id
             || coalesce(reason, '') || coalesce(summary::text, '')
             || coalesce(failure_code, '') || correlation_id) like ${`%${value}%`}
    `,
  );
  return Number(row?.total ?? 0) > 0;
}
