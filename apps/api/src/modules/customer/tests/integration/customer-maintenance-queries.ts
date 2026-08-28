/**
 * Extra fixtures and state readers for the `APP10-B01` maintenance suites.
 *
 * `admin-support-context.ts` seeds the shape B07 needed — one customer with a
 * primary verified EMAIL and a non-primary verified PHONE — and that is not
 * enough here. B01's rules are *about* the states that harness never produces:
 * an unverified contact, a deactivated one, a customer already tombstoned into
 * another, and a customer whose only verified channel is the one an operator is
 * trying to retire. Each is inserted directly, for the reason the shared
 * context records about grants: no production path mints these on demand, and
 * driving the real flows to reach them would be the same SQL with more steps.
 *
 * The readers go straight to the tables rather than through the HTTP detail
 * read. Half of what B01 must prove is about columns the API deliberately never
 * publishes — `verified_at`, `deactivated_at`, `normalized_value`,
 * `merged_into_customer_id` — so an assertion phrased against the response
 * could not see whether they moved. Reading the rows is the only way to prove
 * something was *not* written.
 *
 * Every contact value here is synthetic and obviously so.
 *
 * Test-only.
 */
import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import type { AdminSupportTestContext } from './admin-support-context';

async function rows<T>(
  context: AdminSupportTestContext,
  statement: ReturnType<typeof sql>,
): Promise<T[]> {
  const result = await context.disposable.client.db.execute(statement);
  return result.rows as T[];
}

export interface CustomerRow {
  readonly id: string;
  readonly display_name: string | null;
  readonly notes: string | null;
  /** Raw SQL returns timestamps as text, not `Date`. */
  readonly verified_at: string;
  readonly merged_into_customer_id: string | null;
  readonly anonymized_at: string | null;
  readonly updated_at: string;
}

export interface ContactRow {
  readonly id: string;
  readonly customer_id: string;
  readonly contact_kind: string;
  readonly normalized_value: string;
  readonly display_value: string;
  readonly is_primary: boolean;
  readonly verified_at: string | null;
  readonly verified_source: string | null;
  readonly deactivated_at: string | null;
  readonly updated_at: string;
}

export interface AuditRow {
  readonly action: string;
  readonly actor_kind: string;
  readonly admin_id: string | null;
  readonly target_kind: string;
  readonly target_id: string;
  readonly summary: unknown;
  readonly reason: string | null;
}

export async function customerRow(
  context: AdminSupportTestContext,
  customerId: string,
): Promise<CustomerRow> {
  const [row] = await rows<CustomerRow>(
    context,
    sql`select * from customers where id = ${customerId}`,
  );
  if (row === undefined) {
    throw new Error(`No customers row for ${customerId}.`);
  }
  return row;
}

export async function contactRow(
  context: AdminSupportTestContext,
  contactId: string,
): Promise<ContactRow> {
  const [row] = await rows<ContactRow>(
    context,
    sql`select * from customer_contact_points where id = ${contactId}`,
  );
  if (row === undefined) {
    throw new Error(`No customer_contact_points row for ${contactId}.`);
  }
  return row;
}

export function contactRows(
  context: AdminSupportTestContext,
  customerId: string,
): Promise<ContactRow[]> {
  return rows<ContactRow>(
    context,
    sql`select * from customer_contact_points where customer_id = ${customerId} order by id`,
  );
}

/** Every audit row about one customer, oldest first. */
export function auditRows(
  context: AdminSupportTestContext,
  customerId: string,
): Promise<AuditRow[]> {
  return rows<AuditRow>(
    context,
    sql`select action, actor_kind, admin_id, target_kind, target_id, summary, reason
        from audit_events
        where target_kind = 'CUSTOMER' and target_id = ${customerId}
        order by occurred_at, action`,
  );
}

export interface SeedContactInput {
  readonly customerId: string;
  readonly kind: 'EMAIL' | 'PHONE';
  readonly value: string;
  readonly verified?: boolean;
  readonly primary?: boolean;
  readonly deactivated?: boolean;
}

/**
 * One extra contact in whatever state the case needs.
 *
 * `verified` defaults to true because most B01 cases are about contacts that
 * *are* verified; `primary` and `deactivated` default to false because CST-006
 * permits one primary per customer and the shared fixture already spends it.
 */
export async function seedContact(
  context: AdminSupportTestContext,
  input: SeedContactInput,
): Promise<string> {
  const id = newId();
  const verifiedAt = (input.verified ?? true) ? '2026-08-14T09:10:00.000Z' : null;
  const verifiedSource = (input.verified ?? true) ? 'OTP' : null;
  const deactivatedAt = input.deactivated === true ? '2026-08-20T09:00:00.000Z' : null;

  await context.disposable.client.db.execute(sql`
    insert into customer_contact_points
      (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
       verified_at, verified_source, deactivated_at)
    values (${id}, ${input.customerId}, ${input.kind}, ${input.value}, ${input.value},
            ${input.primary ?? false}, ${verifiedAt}, ${verifiedSource}, ${deactivatedAt})
  `);
  return id;
}

/**
 * A customer with exactly one contact, in the requested state.
 *
 * The single-contact shape is what the last-verified-contact rule needs, and it
 * cannot be reached by adding to the shared two-contact fixture.
 */
export async function seedCustomerWithOneContact(
  context: AdminSupportTestContext,
  value: string,
  options?: { readonly kind?: 'EMAIL' | 'PHONE'; readonly primary?: boolean },
): Promise<{ readonly customerId: string; readonly contactId: string }> {
  const customerId = newId();
  await context.disposable.client.db.execute(sql`
    insert into customers (id, display_name, verified_at)
    values (${customerId}, 'B01 Customer', '2026-08-14T09:00:00.000Z')
  `);
  const contactId = await seedContact(context, {
    customerId,
    kind: options?.kind ?? 'EMAIL',
    value,
    primary: options?.primary ?? true,
  });
  return { customerId, contactId };
}

/** Tombstones `loserId` into `survivorId`, exactly as a completed merge would. */
export async function tombstone(
  context: AdminSupportTestContext,
  loserId: string,
  survivorId: string,
): Promise<void> {
  await context.disposable.client.db.execute(sql`
    update customers set merged_into_customer_id = ${survivorId} where id = ${loserId}
  `);
}
