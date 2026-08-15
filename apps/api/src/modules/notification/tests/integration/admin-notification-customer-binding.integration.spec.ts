/**
 * `APP4-B08` Customer binding and replay outcome, through the whole HTTP stack
 * against a real PostgreSQL instance (Product Owner authority unblock,
 * `APP4-A01`).
 *
 * Two additions to a delivered checkpoint, and the claims are about their
 * edges:
 *
 * 1. **The Customer filter follows the persisted reference and nothing else.**
 *    A notification bound to Customer A's contact point is returned for A;
 *    Customer B's is not; and — the case that matters most — an intent carrying
 *    the *same masked recipient* but no binding is excluded. That last one is
 *    what separates a relationship from a coincidence: if the filter ever fell
 *    back to comparing masks, only that assertion would notice.
 * 2. **The replay outcome is the backend's own, not a guess.** The first replay
 *    reports `CREATED`; a second reports `EXISTING` and creates nothing.
 *
 * The binding is written here with SQL because no production caller sets
 * `recipient_contact_point_id` yet — the column exists (G-DB7-48) and the
 * replay path copies it forward, but B01's intake does not populate it. That
 * gap is real and is recorded as a follow-up; it does not change what these
 * cases prove, which is how the filter behaves on a bound row when one exists.
 */
import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import {
  FIXTURE_CODE,
  FIXTURE_EMAIL,
  FIXTURE_EMAIL_MASK,
  ROUTES,
  createAdminNotificationContext,
  dataOf,
  type AdminNotificationTestContext,
} from './admin-notification-context';

interface IntentRow {
  readonly intentId: string;
  readonly status: string;
  readonly recipientMasked: string;
  readonly templateKey: string;
}

interface ListPayload {
  readonly intents: readonly IntentRow[];
}

interface ReplayPayload {
  readonly replayIntentId: string;
  readonly status: string;
  readonly outcome: string;
}

describe('APP4-B08 Customer binding and replay outcome (integration)', () => {
  let context: AdminNotificationTestContext;

  /** Binds an existing intent to a contact point, as a future intake would. */
  const bind = async (intentId: string, contactPointId: string): Promise<void> => {
    await context.disposable.client.db.execute(
      sql`update notification_intents set recipient_contact_point_id = ${contactPointId}
          where id = ${intentId}`,
    );
  };

  const listFor = (query: string) =>
    request(context.server()).get(`${ROUTES.list()}${query}`).set('Cookie', context.adminCookie());

  beforeAll(async () => {
    context = await createAdminNotificationContext('app4-b08-binding');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  describe('customerId filter', () => {
    it('returns a bound notification for its Customer and withholds another’s', async () => {
      const first = await context.seedCustomer();
      const second = await context.seedCustomer();

      const firstDelivery = await context.seedTerminalDelivery({
        reference: { kind: 'VERIFICATION_CHALLENGE', challengeId: await context.seedChallenge() },
        secret: FIXTURE_CODE,
        secretKind: 'VERIFICATION_CODE',
      });
      const secondDelivery = await context.seedTerminalDelivery({
        reference: { kind: 'VERIFICATION_CHALLENGE', challengeId: await context.seedChallenge() },
        secret: FIXTURE_CODE,
        secretKind: 'VERIFICATION_CODE',
      });
      await bind(firstDelivery.intentId, first.contactPointId);
      await bind(secondDelivery.intentId, second.contactPointId);

      const response = await listFor(`?customerId=${first.customerId}`).expect(200);

      const intents = dataOf<ListPayload>(response).intents;
      expect(intents).toHaveLength(1);
      expect(intents[0]?.intentId).toBe(firstDelivery.intentId);
      // The other Customer's notification is not merely ordered lower.
      expect(JSON.stringify(response.body)).not.toContain(secondDelivery.intentId);
    });

    it('excludes an intent with the same masked recipient but no binding', async () => {
      const { customerId, contactPointId } = await context.seedCustomer();

      const bound = await context.seedTerminalDelivery({
        reference: { kind: 'VERIFICATION_CHALLENGE', challengeId: await context.seedChallenge() },
        secret: FIXTURE_CODE,
        secretKind: 'VERIFICATION_CODE',
      });
      // Same fixture recipient, so the two intents carry an identical
      // `recipientMasked`. Only the binding tells them apart.
      const unbound = await context.seedTerminalDelivery({
        reference: { kind: 'VERIFICATION_CHALLENGE', challengeId: await context.seedChallenge() },
        secret: FIXTURE_CODE,
        secretKind: 'VERIFICATION_CODE',
      });
      await bind(bound.intentId, contactPointId);

      const response = await listFor(`?customerId=${customerId}`).expect(200);

      const intents = dataOf<ListPayload>(response).intents;
      expect(intents).toHaveLength(1);
      expect(intents[0]?.intentId).toBe(bound.intentId);
      expect(intents[0]?.recipientMasked).toBe(FIXTURE_EMAIL_MASK);
      // Both share the mask, so a mask-based filter would have returned two.
      expect(intents[0]?.intentId).not.toBe(unbound.intentId);
      expect(JSON.stringify(response.body)).not.toContain(unbound.intentId);
    });

    it('returns nothing for a Customer whose notifications are all unbound', async () => {
      const { customerId } = await context.seedCustomer();
      await context.seedTerminalDelivery({
        reference: { kind: 'VERIFICATION_CHALLENGE', challengeId: await context.seedChallenge() },
        secret: FIXTURE_CODE,
        secretKind: 'VERIFICATION_CODE',
      });

      const response = await listFor(`?customerId=${customerId}`).expect(200);

      // Truthful rather than helpful: a null `recipient_contact_point_id` means
      // nobody owns that delivery, and guessing an owner is the whole thing this
      // filter exists to avoid.
      expect(dataOf<ListPayload>(response).intents).toHaveLength(0);
    });

    it('combines the Customer filter with the status filter', async () => {
      const { customerId, contactPointId } = await context.seedCustomer();

      const failed = await context.seedTerminalDelivery({
        reference: { kind: 'VERIFICATION_CHALLENGE', challengeId: await context.seedChallenge() },
        secret: FIXTURE_CODE,
        secretKind: 'VERIFICATION_CODE',
      });
      const satisfied = await context.seedTerminalDelivery({
        reference: { kind: 'VERIFICATION_CHALLENGE', challengeId: await context.seedChallenge() },
        secret: FIXTURE_CODE,
        secretKind: 'VERIFICATION_CODE',
        satisfied: true,
      });
      await bind(failed.intentId, contactPointId);
      await bind(satisfied.intentId, contactPointId);

      const response = await listFor(`?status=FAILED&customerId=${customerId}`).expect(200);

      const intents = dataOf<ListPayload>(response).intents;
      expect(intents).toHaveLength(1);
      expect(intents[0]?.intentId).toBe(failed.intentId);
      expect(intents[0]?.status).toBe('FAILED');
    });

    it('leaves the global list untouched when the filter is absent', async () => {
      const { contactPointId } = await context.seedCustomer();
      const bound = await context.seedTerminalDelivery({
        reference: { kind: 'VERIFICATION_CHALLENGE', challengeId: await context.seedChallenge() },
        secret: FIXTURE_CODE,
        secretKind: 'VERIFICATION_CODE',
      });
      const unbound = await context.seedTerminalDelivery({
        reference: { kind: 'VERIFICATION_CHALLENGE', challengeId: await context.seedChallenge() },
        secret: FIXTURE_CODE,
        secretKind: 'VERIFICATION_CODE',
      });
      await bind(bound.intentId, contactPointId);

      const response = await listFor('').expect(200);

      const ids = dataOf<ListPayload>(response).intents.map((intent) => intent.intentId);
      // The operational list still carries both — adding an optional filter must
      // not have narrowed the surface every other caller already had.
      expect(ids).toHaveLength(2);
      expect(ids).toContain(bound.intentId);
      expect(ids).toContain(unbound.intentId);
    });

    it('publishes no contact value alongside the bound notification', async () => {
      const { customerId, contactPointId } = await context.seedCustomer();
      const delivery = await context.seedTerminalDelivery({
        reference: { kind: 'VERIFICATION_CHALLENGE', challengeId: await context.seedChallenge() },
        secret: FIXTURE_CODE,
        secretKind: 'VERIFICATION_CODE',
      });
      await bind(delivery.intentId, contactPointId);

      const response = await listFor(`?customerId=${customerId}`).expect(200);

      const body = JSON.stringify(response.body);
      expect(body).not.toContain(FIXTURE_EMAIL);
      expect(body).not.toContain(FIXTURE_CODE);
      // The join key itself must not be published: the filter uses the contact
      // point, and echoing its id would hand back an identity handle.
      expect(body).not.toContain(contactPointId);
      expect(body.toLowerCase()).not.toContain('contactpoint');
      expect(body).toContain(FIXTURE_EMAIL_MASK);
    });

    it('refuses a malformed customerId rather than ignoring it', async () => {
      await listFor('?customerId=not-a-uuid').expect(400);
    });

    it('answers an unknown but well-formed customerId with an empty page', async () => {
      const { contactPointId } = await context.seedCustomer();
      const delivery = await context.seedTerminalDelivery({
        reference: { kind: 'VERIFICATION_CHALLENGE', challengeId: await context.seedChallenge() },
        secret: FIXTURE_CODE,
        secretKind: 'VERIFICATION_CODE',
      });
      await bind(delivery.intentId, contactPointId);

      const response = await listFor(`?customerId=${newId()}`).expect(200);

      expect(dataOf<ListPayload>(response).intents).toHaveLength(0);
    });
  });

  describe('replay outcome', () => {
    it('reports CREATED for the first replay and EXISTING for a duplicate', async () => {
      const grantId = await context.seedGrant();
      const delivery = await context.seedTerminalDelivery({
        reference: { kind: 'SECURE_ACCESS_GRANT', grantId },
        secret: 'b08-binding-token'.padEnd(43, 'x'),
        secretKind: 'SECURE_LINK_TOKEN',
        templateKey: 'secure-link.request-access',
      });

      const first = await request(context.server())
        .post(ROUTES.replay(delivery.intentId))
        .set('Cookie', context.adminCookie())
        .expect(200);

      const firstPayload = dataOf<ReplayPayload>(first);
      expect(firstPayload.outcome).toBe('CREATED');
      expect(firstPayload.status).toBe('PENDING');

      const second = await request(context.server())
        .post(ROUTES.replay(delivery.intentId))
        .set('Cookie', context.adminCookie())
        .expect(200);

      const secondPayload = dataOf<ReplayPayload>(second);
      // The same replay, named the same way, reported as what it is.
      expect(secondPayload.outcome).toBe('EXISTING');
      expect(secondPayload.replayIntentId).toBe(firstPayload.replayIntentId);

      // And the outcome is not cosmetic: exactly one replay exists.
      const replays = await context.disposable.client.db.execute<{ count: string }>(
        sql`select count(*)::text as count from notification_intents
            where source_outbox_event_id = ${delivery.outboxEventId.toString()}`,
      );
      expect(replays.rows[0]?.count).toBe('1');
    });

    it('carries no secret or envelope field beside the outcome', async () => {
      const challengeId = await context.seedChallenge();
      const delivery = await context.seedTerminalDelivery({
        reference: { kind: 'VERIFICATION_CHALLENGE', challengeId },
        secret: FIXTURE_CODE,
        secretKind: 'VERIFICATION_CODE',
      });

      const response = await request(context.server())
        .post(ROUTES.replay(delivery.intentId))
        .set('Cookie', context.adminCookie())
        .expect(200);

      expect(Object.keys(dataOf<ReplayPayload>(response)).sort()).toEqual([
        'outcome',
        'replayIntentId',
        'status',
      ]);

      const body = JSON.stringify(response.body);
      expect(body).not.toContain(FIXTURE_CODE);
      expect(body).not.toContain(FIXTURE_EMAIL);
      const lower = body.toLowerCase();
      for (const forbidden of ['ciphertext', 'authtag', 'payload', 'params', 'digest']) {
        expect(lower).not.toContain(forbidden);
      }
      // As a quoted key, not a bare substring: `iv` occurs inside "delivery",
      // and a check that matches the success message proves nothing.
      expect(lower).not.toContain('"iv"');
    });
  });
});
