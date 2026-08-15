/**
 * `APP4-A01-C1` — the production Notification-to-Customer binding, end to end
 * through the real B05 → B01 path.
 *
 * This suite exists because of an evidence gap, and the gap is worth naming.
 * `APP4-A01`'s own integration proof wrote `recipient_contact_point_id` with
 * SQL and then asserted the `APP4-B08` filter honoured it. Every assertion
 * passed and the filter was genuinely correct — but nothing in production ever
 * wrote that column, so the Admin support screen would have shown "no delivery
 * failure" for every real customer. A fixture that supplies the very fact under
 * test can only prove the consumer; it says nothing about whether the producer
 * exists.
 *
 * So **nothing here writes the binding**. The intents are created by
 * `SecureGrantIssuer.issue`/`reissue` with `notify: true`, which is the same
 * call APP5 will make, and the column is read back to see what the production
 * path actually persisted.
 *
 * Four claims:
 *
 * 1. A notified grant issuance binds the intent to the customer's **own**
 *    primary verified contact point — the one B05 resolved, by its persisted id.
 * 2. A reissue does the same, so a replacement link is as findable as the first.
 * 3. A verification code sent *before* a Customer exists still binds nothing,
 *    and that is the truthful answer rather than a defect.
 * 4. The real `APP4-B08` Customer filter returns the production-created intent,
 *    still excludes an identically-masked unbound one, and keeps returning it
 *    after a terminal delivery failure — which is the Admin screen's whole
 *    purpose.
 */
import { newId } from '@embroidery/database';
import { OutboxEventStore } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import {
  NOTIFICATION_INTENT_REPOSITORY,
  type IntentId,
  type NotificationIntentRepository,
} from '../../../notification/domain/repositories/notification-intent.repository';
import { RequestNotificationUseCase } from '../../../notification/application/request-notification.use-case';
import { createGrantContext, GRANT_POLICY, type GrantTestContext } from './secure-grant-context';
import { CHALLENGE_POLICY } from './verification-issue-context';

/**
 * A type alias, not an interface: `db.execute<T>` constrains `T` to
 * `Record<string, unknown>`, and an interface gets no implicit index signature.
 */
type IntentRow = {
  readonly id: string;
  readonly recipient_contact_point_id: string | null;
  readonly recipient_masked: string;
  readonly params: Record<string, unknown>;
  readonly status: string;
  readonly template_key: string;
};

async function intentRows(context: GrantTestContext): Promise<IntentRow[]> {
  const result = await context.disposable.client.db.execute<IntentRow>(
    sql`select id, recipient_contact_point_id, recipient_masked, params, status, template_key
        from notification_intents order by created_at asc, id asc`,
  );
  return [...result.rows];
}

describe('APP4-A01-C1 production notification binding (integration)', () => {
  let context: GrantTestContext;
  let target: Awaited<ReturnType<GrantTestContext['seedTarget']>>;
  let intents: NotificationIntentRepository;
  let outbox: OutboxEventStore;

  beforeAll(async () => {
    context = await createGrantContext({
      label: 'app4-a01-c1-binding',
      grantPolicy: GRANT_POLICY,
    });
    intents = context.get<NotificationIntentRepository>(NOTIFICATION_INTENT_REPOSITORY);
    outbox = context.get<OutboxEventStore>(OutboxEventStore);
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    context.clock.set(new Date('2026-08-14T09:00:00.000Z'));
    context.tokens.reset();
    await context.publishPolicy(CHALLENGE_POLICY);
    await context.publishGrantPolicy(GRANT_POLICY);
    target = await context.seedTarget();
  });

  describe('the producer', () => {
    it('binds a notified issuance to the customer’s own primary contact point', async () => {
      const issued = await context.inRequest(() =>
        context.grants.issue({
          customerId: target.customerId,
          customRequestId: target.customRequestId,
          notify: true,
        }),
      );

      const rows = await intentRows(context);
      expect(rows).toHaveLength(1);
      const [intent] = rows;

      // The claim this whole correction exists for: the production path wrote
      // the binding, and it is the contact point B05 resolved — not any contact
      // point, and not one this test supplied.
      expect(intent?.recipient_contact_point_id).toBe(target.contactPointId);

      // And the binding did not cost anything the phase already forbids.
      expect(intent?.template_key).toBe('secure_access.link');
      expect(intent?.params).toEqual({
        schemaVersion: 1,
        reference: { kind: 'SECURE_ACCESS_GRANT', grantId: issued.grantId },
      });
      const serialized = JSON.stringify(intent?.params);
      expect(serialized).not.toContain(target.normalizedValue);
      expect(serialized).not.toContain(target.contactPointId);
      expect(serialized).not.toContain(issued.rawToken);

      // The mask is still P01's, and still not the address.
      expect(intent?.recipient_masked).not.toBe(target.normalizedValue);
      expect(intent?.recipient_masked).toContain('***');

      // One decision, one delivery.
      const events = await context.disposable.client.db.execute<{ count: string }>(
        sql`select count(*)::text as count from outbox_events
            where event_type = 'notification.delivery.requested'`,
      );
      expect(events.rows[0]?.count).toBe('1');
    });

    it('binds a reissued link the same way, so the replacement stays findable', async () => {
      await context.inRequest(() =>
        context.grants.issue({
          customerId: target.customerId,
          customRequestId: target.customRequestId,
          notify: true,
        }),
      );
      const replacement = await context.inRequest(() =>
        context.grants.reissue({
          customerId: target.customerId,
          customRequestId: target.customRequestId,
          notify: true,
        }),
      );

      const rows = await intentRows(context);
      expect(rows).toHaveLength(2);
      // Both, not just the first: a customer chasing a link that stopped working
      // is usually looking at the reissue.
      expect(rows.map((row) => row.recipient_contact_point_id)).toEqual([
        target.contactPointId,
        target.contactPointId,
      ]);
      expect(JSON.stringify(rows[1]?.params)).toContain(replacement.grantId);
    });

    it('leaves a pre-Customer verification notification unbound, truthfully', async () => {
      // There is no Customer yet, so there is no contact point to name. The
      // correction deliberately did not make the field mandatory, and did not
      // create a Customer to have something to point at.
      const notifications = context.get<RequestNotificationUseCase>(RequestNotificationUseCase);
      await context.inRequest(() =>
        context.inTransaction(() =>
          notifications.request({
            sourceEventId: `verification.issued:${newId()}`,
            channel: 'EMAIL',
            contactKind: 'EMAIL',
            normalizedRecipient: 'nguoi.moi@example.com',
            templateKey: 'verification.code',
            templateVersion: 1,
            reference: { kind: 'VERIFICATION_CHALLENGE', challengeId: newId() },
            secretKind: 'VERIFICATION_CODE',
            secret: '424242',
            issuedAt: context.clock.now(),
            expiresAt: new Date('2099-01-01T00:00:00.000Z'),
          }),
        ),
      );

      const rows = await intentRows(context);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.recipient_contact_point_id).toBeNull();
    });
  });

  describe('the consumer, over what the producer actually wrote', () => {
    it('returns the production-created intent from the B08 Customer filter', async () => {
      await context.inRequest(() =>
        context.grants.issue({
          customerId: target.customerId,
          customRequestId: target.customRequestId,
          notify: true,
        }),
      );

      // The real B08 query, over a row no test wrote the binding into.
      const found = await intents.listForAdmin({ customerId: target.customerId, limit: 50 });

      expect(found).toHaveLength(1);
      expect(found[0]?.recipientContactPointId).toBe(target.contactPointId);
      expect(found[0]?.recipientMasked).not.toBe(target.normalizedValue);
    });

    it('still excludes an identically-masked intent that has no binding', async () => {
      await context.inRequest(() =>
        context.grants.issue({
          customerId: target.customerId,
          customRequestId: target.customRequestId,
          notify: true,
        }),
      );
      // Same address, so the same P01 mask — and no contact point. If the filter
      // ever fell back to comparing masks, this row would appear under a
      // Customer it does not belong to.
      const notifications = context.get<RequestNotificationUseCase>(RequestNotificationUseCase);
      await context.inRequest(() =>
        context.inTransaction(() =>
          notifications.request({
            sourceEventId: `verification.issued:${newId()}`,
            channel: 'EMAIL',
            contactKind: 'EMAIL',
            normalizedRecipient: target.normalizedValue,
            templateKey: 'verification.code',
            templateVersion: 1,
            reference: { kind: 'VERIFICATION_CHALLENGE', challengeId: newId() },
            secretKind: 'VERIFICATION_CODE',
            secret: '424242',
            issuedAt: context.clock.now(),
            expiresAt: new Date('2099-01-01T00:00:00.000Z'),
          }),
        ),
      );

      const all = await intents.listForAdmin({ limit: 50 });
      const bound = await intents.listForAdmin({ customerId: target.customerId, limit: 50 });

      expect(all).toHaveLength(2);
      expect(all[0]?.recipientMasked).toBe(all[1]?.recipientMasked);
      expect(bound).toHaveLength(1);
      expect(bound[0]?.recipientContactPointId).toBe(target.contactPointId);
    });

    it('keeps the intent visible to the Customer filter after terminal failure', async () => {
      await context.inRequest(() =>
        context.grants.issue({
          customerId: target.customerId,
          customRequestId: target.customRequestId,
          notify: true,
        }),
      );

      const [created] = await intentRows(context);
      const intentId = (created?.id ?? '') as IntentId;
      const [event] = (
        await context.disposable.client.db.execute<{ id: string }>(
          sql`select id from outbox_events where event_type = 'notification.delivery.requested'`,
        )
      ).rows;

      // The exhaustion path, through the same repository and outbox methods
      // `APP4-W01` calls — no status column is written by hand.
      await context.inTransaction(async () => {
        await intents.recordAttempt({
          intentId,
          channel: 'EMAIL',
          outcome: 'FAILED_TERMINAL',
          errorClass: 'CHANNEL_UNAVAILABLE',
          attemptedAt: context.clock.now(),
        });
        await intents.markFailed(intentId);
        await outbox.markDeadLetter(BigInt(event?.id ?? '0'), 'CHANNEL_UNAVAILABLE');
      });

      // Exactly the query APP4-A01's notification panel issues.
      const failed = await intents.listForAdmin({
        customerId: target.customerId,
        status: 'FAILED',
        limit: 50,
      });

      expect(failed).toHaveLength(1);
      expect(failed[0]?.id).toBe(intentId);
      expect(failed[0]?.recipientContactPointId).toBe(target.contactPointId);

      const attempts = await intents.listAttempts(intentId);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]?.outcome).toBe('FAILED_TERMINAL');
      expect(attempts[0]?.errorClass).toBe('CHANNEL_UNAVAILABLE');
    });
  });
});
