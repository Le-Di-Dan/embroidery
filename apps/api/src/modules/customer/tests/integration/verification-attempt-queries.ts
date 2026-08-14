/**
 * State readers for the `APP4-B04` suites.
 *
 * The attempt ledger and the challenge's own state are read separately on
 * purpose: the whole checkpoint is about the two agreeing — an attempt that
 * reached the cap and a challenge still `ISSUED` is precisely the defect a
 * suite that only asserted one of them would miss.
 *
 * Test-only.
 */
import { sql } from 'drizzle-orm';

import type { VerificationTestContext } from './verification-issue-context';

async function rows<T>(
  context: VerificationTestContext,
  statement: ReturnType<typeof sql>,
): Promise<T[]> {
  const result = await context.disposable.client.db.execute(statement);
  return result.rows as T[];
}

export interface AttemptRow {
  readonly challenge_id: string;
  readonly outcome: string;
  /** Raw SQL returns timestamps as text, not `Date`. */
  readonly attempted_at: string;
}

export function attemptsOf(
  context: VerificationTestContext,
  challengeId: string,
): Promise<AttemptRow[]> {
  return rows<AttemptRow>(
    context,
    sql`
      select challenge_id, outcome, attempted_at
      from contact_verification_attempts
      where challenge_id = ${challengeId}
      order by id
    `,
  );
}

export async function challengeStateOf(
  context: VerificationTestContext,
  challengeId: string,
): Promise<string | undefined> {
  const [row] = await rows<{ status: string }>(
    context,
    sql`select status from contact_verification_challenges where id = ${challengeId}`,
  );
  return row?.status;
}

export async function verifiedAtOf(
  context: VerificationTestContext,
  challengeId: string,
): Promise<string | null | undefined> {
  const [row] = await rows<{ verified_at: string | null }>(
    context,
    sql`select verified_at from contact_verification_challenges where id = ${challengeId}`,
  );
  return row?.verified_at;
}

export async function customerCount(context: VerificationTestContext): Promise<number> {
  const [row] = await rows<{ total: number }>(
    context,
    sql`select count(*)::int as total from customers`,
  );
  return Number(row?.total ?? -1);
}

export interface ContactPointRow {
  readonly id: string;
  readonly customer_id: string;
  readonly contact_kind: string;
  readonly normalized_value: string;
  readonly display_value: string | null;
  readonly is_primary: boolean;
  readonly verified_at: string | null;
  readonly verified_source: string | null;
  readonly deactivated_at: string | null;
}

export function contactPoints(context: VerificationTestContext): Promise<ContactPointRow[]> {
  return rows<ContactPointRow>(
    context,
    sql`
      select id, customer_id, contact_kind, normalized_value, display_value, is_primary,
             verified_at, verified_source, deactivated_at
      from customer_contact_points order by created_at, id
    `,
  );
}

export interface AuditRow {
  readonly action: string;
  readonly actor_kind: string;
  readonly customer_id: string | null;
  readonly system_job_key: string | null;
  readonly target_kind: string;
  readonly target_id: string;
  readonly failure_code: string | null;
  readonly summary: Record<string, unknown> | null;
  readonly correlation_id: string;
}

export function auditEvents(context: VerificationTestContext): Promise<AuditRow[]> {
  return rows<AuditRow>(
    context,
    sql`
      select action, actor_kind, customer_id, system_job_key, target_kind, target_id,
             failure_code, summary, correlation_id
      from audit_events order by id
    `,
  );
}

/** Every grant row. B04 issues none, ever. */
export async function grantCount(context: VerificationTestContext): Promise<number> {
  const [row] = await rows<{ total: number }>(
    context,
    sql`select count(*)::int as total from secure_access_grants`,
  );
  return Number(row?.total ?? -1);
}

export async function notificationIntentCount(context: VerificationTestContext): Promise<number> {
  const [row] = await rows<{ total: number }>(
    context,
    sql`select count(*)::int as total from notification_intents`,
  );
  return Number(row?.total ?? -1);
}

/**
 * The identity-side sweep for a plaintext code.
 *
 * Complements `codeAppearsAnywhere`, which covers the tables the *issue* path
 * writes. B04 writes three more — the attempt ledger, and the two identity
 * tables a successful `SUBMISSION` creates — and the claim "the code exists
 * nowhere durable" is only worth making if every one of them is searched.
 */
export async function codeAppearsInIdentityTables(
  context: VerificationTestContext,
  code: string,
): Promise<string[]> {
  const found = await rows<{ source: string }>(
    context,
    sql`
      select 'contact_verification_attempts' as source from contact_verification_attempts
      where (challenge_id::text || outcome) like ${`%${code}%`}
      union all
      select 'customers' from customers
      where (id::text || coalesce(display_name, '') || coalesce(notes, '')) like ${`%${code}%`}
      union all
      select 'customer_contact_points' from customer_contact_points
      where (id::text || customer_id::text || contact_kind || normalized_value
             || coalesce(display_value, '') || coalesce(verified_source, '')) like ${`%${code}%`}
    `,
  );
  return found.map((row) => row.source);
}

export async function outboxCount(context: VerificationTestContext): Promise<number> {
  const [row] = await rows<{ total: number }>(
    context,
    sql`select count(*)::int as total from outbox_events`,
  );
  return Number(row?.total ?? -1);
}
