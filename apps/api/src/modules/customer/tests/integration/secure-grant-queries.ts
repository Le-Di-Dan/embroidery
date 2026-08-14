/**
 * State readers for the `APP4-B05` secure-grant suites.
 *
 * `tokenAppearsAnywhere` carries the checkpoint's central claim, and is a
 * deliberate sibling of `codeAppearsAnywhere`: a raw token is allowed in exactly
 * three durable-adjacent places — transient issuer memory, the one in-process
 * return, and the sealed ciphertext — so the sweep has to cover every textual
 * and JSON column the issue path writes, minus the ciphertext itself. Checking
 * `token_hash` and `params`, the two an author remembers, would make the claim
 * decorative.
 *
 * Test-only.
 */
import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import type { VerificationTestContext } from './verification-issue-context';

async function rows<T>(
  context: VerificationTestContext,
  statement: ReturnType<typeof sql>,
): Promise<T[]> {
  const result = await context.disposable.client.db.execute(statement);
  return result.rows as T[];
}

export interface GrantRow {
  readonly id: string;
  readonly customer_id: string;
  readonly custom_request_id: string;
  readonly token_hash: string;
  readonly scope_kind: string;
  readonly status: string;
  /** Raw SQL returns timestamps as text, not `Date`. */
  readonly expires_at: string;
  readonly revoked_at: string | null;
  readonly revoke_reason: string | null;
  readonly superseded_by_grant_id: string | null;
  readonly created_at: string;
}

export function grantsFor(
  context: VerificationTestContext,
  customRequestId: string,
): Promise<GrantRow[]> {
  return rows<GrantRow>(
    context,
    sql`
      select id, customer_id, custom_request_id, token_hash, scope_kind, status,
             expires_at, revoked_at, revoke_reason, superseded_by_grant_id, created_at
      from secure_access_grants
      where custom_request_id = ${customRequestId}
      order by created_at, id
    `,
  );
}

export async function activeGrantCount(
  context: VerificationTestContext,
  customRequestId: string,
): Promise<number> {
  const [row] = await rows<{ total: number }>(
    context,
    sql`
      select count(*)::int as total from secure_access_grants
      where custom_request_id = ${customRequestId} and status = 'ACTIVE'
    `,
  );
  return Number(row?.total ?? -1);
}

export async function grantCount(context: VerificationTestContext): Promise<number> {
  const [row] = await rows<{ total: number }>(
    context,
    sql`select count(*)::int as total from secure_access_grants`,
  );
  return Number(row?.total ?? -1);
}

export interface GrantAuditRow {
  readonly action: string;
  readonly actor_kind: string;
  readonly target_kind: string;
  readonly target_id: string;
  readonly reason: string | null;
  readonly summary: Record<string, unknown> | null;
}

export function grantAudit(context: VerificationTestContext): Promise<GrantAuditRow[]> {
  return rows<GrantAuditRow>(
    context,
    sql`
      select action, actor_kind, target_kind, target_id, reason, summary
      from audit_events where action like 'secure_grant.%'
      order by occurred_at, action
    `,
  );
}

/**
 * Every place the grant path writes, searched for a value.
 *
 * `outbox_events.payload` is reduced to its non-ciphertext fields on purpose:
 * the ciphertext is the one place the token is *supposed* to be, and including
 * it would make this assertion fail for the reason the envelope exists.
 * Everything else about the row — the type, the linkage, the status, the error
 * column — is searched in full.
 */
export async function tokenAppearsAnywhere(
  context: VerificationTestContext,
  token: string,
): Promise<string[]> {
  const found = await rows<{ source: string }>(
    context,
    sql`
      -- Every id here is a real \`uuid\` column, not text, so each is cast
      -- explicitly: \`uuid || uuid\` is not an operator PostgreSQL has, and
      -- omitting one cast turns this sweep into an error rather than a check.
      select 'secure_access_grants' as source from secure_access_grants
      where (id::text || customer_id::text || custom_request_id::text || token_hash
             || scope_kind || status
             || coalesce(revoke_reason, '') || coalesce(superseded_by_grant_id::text, ''))
            like ${`%${token}%`}
      union all
      select 'notification_intents' from notification_intents
      where (id::text || intent_key || template_key || channel || recipient_masked
             || params::text || status || correlation_id) like ${`%${token}%`}
      union all
      select 'outbox_events' from outbox_events
      where (event_type || aggregate_kind || aggregate_id || status
             || coalesce(last_error, '')
             || coalesce(payload->>'version', '') || coalesce(payload->>'algorithm', ''))
            like ${`%${token}%`}
      union all
      select 'audit_events' from audit_events
      where (action || actor_kind || target_kind || target_id || coalesce(reason, '')
             || coalesce(summary::text, '') || correlation_id) like ${`%${token}%`}
      union all
      select 'background_job_attempts' from background_job_attempts
      where (job_kind || job_key || outcome || coalesce(error_class, '')) like ${`%${token}%`}
    `,
  );
  return found.map((row) => row.source);
}

/** Seeds a verified `STEP_UP` challenge that completed at a given instant. */
export async function seedCompletedChallenge(
  context: VerificationTestContext,
  input: {
    readonly contactPointId: string;
    readonly normalizedValue: string;
    readonly purpose: 'STEP_UP' | 'SUBMISSION';
    readonly verifiedAt: Date;
  },
): Promise<void> {
  await context.disposable.client.db.execute(sql`
    insert into contact_verification_challenges
      (id, contact_point_id, contact_kind, normalized_value, purpose, code_hash,
       status, expires_at, verified_at)
    values (${newId()}, ${input.contactPointId}, 'EMAIL',
            ${input.normalizedValue}, ${input.purpose}, 'fixture-hash', 'VERIFIED',
            ${input.verifiedAt.toISOString()}::timestamptz + interval '10 minutes',
            ${input.verifiedAt.toISOString()}::timestamptz)
  `);
}
