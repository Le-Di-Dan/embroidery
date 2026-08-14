/**
 * State readers for the `APP4-B03` verification suites.
 *
 * `codeAppearsAnywhere` carries the checkpoint's central claim. A plaintext code
 * is allowed in exactly three places — transient issuer memory, the sealed
 * ciphertext, and the worker's outbound sink after it claims — so the assertion
 * has to sweep every textual and JSON column the issue path writes, minus the
 * ciphertext itself. Checking the two columns an author happens to remember
 * would make the claim decorative.
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

export interface ChallengeRow {
  readonly id: string;
  readonly contact_kind: string;
  readonly normalized_value: string;
  readonly purpose: string;
  readonly code_hash: string;
  readonly status: string;
  /** Raw SQL returns timestamps as text, not `Date`. */
  readonly expires_at: string;
  readonly created_at: string;
  readonly session_id: string | null;
}

export function challengesFor(
  context: VerificationTestContext,
  normalizedValue: string,
): Promise<ChallengeRow[]> {
  return rows<ChallengeRow>(
    context,
    sql`
      select id, contact_kind, normalized_value, purpose, code_hash, status,
             expires_at, created_at, session_id
      from contact_verification_challenges
      where normalized_value = ${normalizedValue}
      order by created_at, id
    `,
  );
}

export async function challengeCount(context: VerificationTestContext): Promise<number> {
  const [row] = await rows<{ total: number }>(
    context,
    sql`select count(*)::int as total from contact_verification_challenges`,
  );
  return Number(row?.total ?? -1);
}

export async function openChallengeCount(
  context: VerificationTestContext,
  normalizedValue: string,
  purpose: string,
): Promise<number> {
  const [row] = await rows<{ total: number }>(
    context,
    sql`
      select count(*)::int as total from contact_verification_challenges
      where normalized_value = ${normalizedValue} and purpose = ${purpose} and status = 'ISSUED'
    `,
  );
  return Number(row?.total ?? -1);
}

export interface IntentRow {
  readonly id: string;
  readonly intent_key: string;
  readonly template_key: string;
  readonly channel: string;
  readonly recipient_masked: string;
  readonly params: Record<string, unknown>;
  readonly status: string;
}

export function intents(context: VerificationTestContext): Promise<IntentRow[]> {
  return rows<IntentRow>(
    context,
    sql`
      select id, intent_key, template_key, channel, recipient_masked, params, status
      from notification_intents order by created_at, id
    `,
  );
}

export interface OutboxRow {
  readonly id: string;
  readonly event_type: string;
  readonly aggregate_kind: string;
  readonly aggregate_id: string;
  readonly status: string;
  readonly payload: {
    readonly version: number;
    readonly algorithm: string;
    readonly iv: string;
    readonly ciphertext: string;
    readonly authTag: string;
  };
}

export function deliveryEvents(context: VerificationTestContext): Promise<OutboxRow[]> {
  return rows<OutboxRow>(
    context,
    sql`
      select id, event_type, aggregate_kind, aggregate_id, status, payload
      from outbox_events where event_type = 'notification.delivery.requested'
      order by id
    `,
  );
}

export async function auditEventCount(context: VerificationTestContext): Promise<number> {
  const [row] = await rows<{ total: number }>(
    context,
    sql`select count(*)::int as total from audit_events`,
  );
  return Number(row?.total ?? -1);
}

/**
 * Every place the issue path writes, searched for a value.
 *
 * `outbox_events.payload` is reduced to its non-ciphertext fields on purpose:
 * the ciphertext is the one place the code is *supposed* to be, and including it
 * would make this assertion fail for the reason the envelope exists. Everything
 * else about the row — the type, the linkage, the status, the error column — is
 * searched in full.
 */
export async function codeAppearsAnywhere(
  context: VerificationTestContext,
  code: string,
): Promise<string[]> {
  const found = await rows<{ source: string }>(
    context,
    sql`
      select 'contact_verification_challenges' as source from contact_verification_challenges
      where (id || contact_kind || normalized_value || purpose || code_hash || status
             || coalesce(session_id::text, '') || coalesce(contact_point_id::text, ''))
            like ${`%${code}%`}
      union all
      select 'notification_intents' from notification_intents
      where (id || intent_key || template_key || channel || recipient_masked
             || params::text || status || correlation_id) like ${`%${code}%`}
      union all
      select 'outbox_events' from outbox_events
      where (event_type || aggregate_kind || aggregate_id || status
             || coalesce(last_error, '')
             || coalesce(payload->>'version', '') || coalesce(payload->>'algorithm', ''))
            like ${`%${code}%`}
      union all
      select 'audit_events' from audit_events
      where (action || actor_kind || target_kind || target_id || coalesce(reason, '')
             || coalesce(summary::text, '') || correlation_id) like ${`%${code}%`}
      union all
      select 'background_job_attempts' from background_job_attempts
      where (job_kind || job_key || outcome || coalesce(error_class, '')) like ${`%${code}%`}
    `,
  );
  return found.map((row) => row.source);
}
