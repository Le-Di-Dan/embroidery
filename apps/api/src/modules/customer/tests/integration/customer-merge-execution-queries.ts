/**
 * Fixtures and row readers for the `APP10-B03` merge execution suites.
 *
 * `customer-merge-queries.ts` seeds a customer that owns things and reads what a
 * merge *would* move; this file adds what execution has to be judged by — the
 * append-only step history, the contact rows with their verification evidence
 * intact, the grant states, and the frozen transition history a merge must
 * leave exactly as it found it.
 *
 * Every reader goes to the tables directly, because half of what B03 must prove
 * is that something did **not** change: a response body cannot show that a
 * quotation acceptance still names the merged-away customer, or that
 * `verified_source` survived a contact move.
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

export interface MergeEventRow {
  readonly id: string;
  readonly merge_case_id: string;
  readonly step_kind: string;
  readonly subject_table: string;
  readonly subject_id: string;
  readonly detail: string | null;
}

/**
 * Every `customer_merge_events` row, in append order.
 *
 * Global rather than scoped to one case, on the rule `mergeEventCount` records:
 * a count scoped to the case under test would pass while a stray row sat under
 * another. Ordered by `id`, which is the table's own identity sequence, so the
 * assertion reads the steps in the order the transaction appended them.
 */
export function mergeEventRows(context: AdminSupportTestContext): Promise<MergeEventRow[]> {
  return rows<MergeEventRow>(
    context,
    sql`select id::text as id, merge_case_id, step_kind, subject_table, subject_id, detail
        from customer_merge_events order by id`,
  );
}

/** The `(step_kind, subject_table, affectedCount)` triples, in order. */
export async function mergeEventSteps(
  context: AdminSupportTestContext,
): Promise<{ step: string; table: string; affected: number }[]> {
  const all = await mergeEventRows(context);
  return all.map((row) => ({
    step: row.step_kind,
    table: row.subject_table,
    affected: (JSON.parse(row.detail ?? '{}') as { affectedCount?: number }).affectedCount ?? -1,
  }));
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
}

/**
 * Every contact row in the database, ordered by id.
 *
 * Whole rows, not counts: the point of the contact assertions is that a move
 * changed `customer_id` and **nothing else** — the value, the verification
 * instant, the source and the deactivation marker all travel with the row.
 */
export function contactRows(context: AdminSupportTestContext): Promise<ContactRow[]> {
  return rows<ContactRow>(
    context,
    sql`select id, customer_id, contact_kind, normalized_value, display_value, is_primary,
               verified_at, verified_source, deactivated_at
        from customer_contact_points order by id`,
  );
}

export interface GrantRow {
  readonly id: string;
  readonly customer_id: string;
  readonly status: string;
  readonly revoke_reason: string | null;
}

/** Every secure access grant, ordered by id. */
export function grantRows(context: AdminSupportTestContext): Promise<GrantRow[]> {
  return rows<GrantRow>(
    context,
    sql`select id, customer_id, status, revoke_reason from secure_access_grants order by id`,
  );
}

export interface FrozenEvidence {
  readonly approvalSnapshotOwners: string[];
  readonly quotationAcceptanceOwners: string[];
  readonly orderTransitionOwners: string[];
  readonly requestTransitionOwners: string[];
}

/**
 * Who every frozen evidence row still names.
 *
 * The four append-only or immutable categories that carry a `customer_id`. A
 * merge repoints live ownership and rewrites none of these, so the assertion is
 * that each list still contains the **merged-away** customer after execution —
 * the strongest form available, because it fails both if a row were repointed
 * and if one were deleted.
 */
export async function frozenEvidenceOwners(
  context: AdminSupportTestContext,
): Promise<FrozenEvidence> {
  const owners = async (statement: ReturnType<typeof sql>): Promise<string[]> =>
    (await rows<{ customer_id: string }>(context, statement)).map((row) => row.customer_id);

  return {
    approvalSnapshotOwners: await owners(
      sql`select customer_id from approval_snapshots order by id`,
    ),
    quotationAcceptanceOwners: await owners(
      sql`select customer_id from quotation_acceptances order by quotation_version_id`,
    ),
    orderTransitionOwners: await owners(
      sql`select customer_id from order_transitions where customer_id is not null order by id`,
    ),
    requestTransitionOwners: await owners(
      sql`select customer_id from custom_request_transitions
          where customer_id is not null order by id`,
    ),
  };
}

/**
 * One append-only transition on each of the two Ordering histories, naming this
 * customer as the actor.
 *
 * Seeded rather than produced through a lifecycle, for the reason the commerce
 * fixture records: the transitions a real flow would write need states this test
 * has no business driving. What matters is that a row carrying `customer_id`
 * exists on both history tables *before* the merge, so "history was not
 * rewritten" is a claim about rows that are actually there.
 */
export async function seedActorHistory(
  context: AdminSupportTestContext,
  input: { readonly customerId: string; readonly orderId: string; readonly requestId: string },
): Promise<void> {
  const db = context.disposable.client.db;
  await db.execute(sql`
    insert into order_transitions
      (order_id, from_status, to_status, event_kind, actor_kind, customer_id, correlation_id)
    values (${input.orderId}, 'AWAITING_DEPOSIT', 'DEPOSIT_PAID', 'STATE_CHANGE', 'CUSTOMER',
            ${input.customerId}, ${`fixture-${newId()}`})
  `);
  await db.execute(sql`
    insert into custom_request_transitions
      (custom_request_id, from_status, to_status, actor_kind, customer_id, correlation_id)
    values (${input.requestId}, 'NEW', 'APPROVED', 'CUSTOMER', ${input.customerId},
            ${`fixture-${newId()}`})
  `);
}

/** One business profile for a customer, so a collision can be seeded. */
export async function seedBusinessProfile(
  context: AdminSupportTestContext,
  customerId: string,
  companyName = 'Công ty Vi Du B03',
): Promise<void> {
  await context.disposable.client.db.execute(sql`
    insert into business_profiles (id, customer_id, company_name)
    values (${newId()}, ${customerId}, ${companyName})
  `);
}
