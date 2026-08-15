/**
 * `APP4-A01-C1` — a manual replay carries the Customer binding forward.
 *
 * `APP4-B08` already copied `recipientContactPointId` from the origin into the
 * replay intent, and that behaviour is unchanged here. What was never proved is
 * that it *matters*: until this correction no production intent carried a
 * binding, so the copy had nothing to copy and no suite would have noticed if it
 * stopped.
 *
 * It matters because the Admin screen filters by Customer. A replay that lost
 * the binding would create a notification the support screen could never find —
 * the operator would see the failure they replayed, forever, with no sign the
 * replay existed.
 *
 * One case, not the replay matrix: `admin-notification-replay.integration.spec.ts`
 * owns idempotency, the ciphertext copy and the untouched dead letter.
 */
import { sql } from 'drizzle-orm';
import request from 'supertest';

import {
  FIXTURE_TOKEN,
  ROUTES,
  createAdminNotificationContext,
  dataOf,
  type AdminNotificationTestContext,
} from './admin-notification-context';
import {
  NOTIFICATION_INTENT_REPOSITORY,
  type NotificationIntentRepository,
} from '../../domain/repositories/notification-intent.repository';

interface ReplayPayload {
  readonly replayIntentId: string;
  readonly status: string;
  readonly outcome: string;
}

describe('APP4-A01-C1 replay preserves the Customer binding (integration)', () => {
  let context: AdminNotificationTestContext;
  let intents: NotificationIntentRepository;

  beforeAll(async () => {
    context = await createAdminNotificationContext('app4-a01-c1-replay');
    intents = context.get<NotificationIntentRepository>(NOTIFICATION_INTENT_REPOSITORY);
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  it('gives the replay the origin’s contact point, and leaves the origin unchanged', async () => {
    const { customerId, contactPointId } = await context.seedCustomer();
    const grantId = await context.seedGrant();
    const origin = await context.seedTerminalDelivery({
      reference: { kind: 'SECURE_ACCESS_GRANT', grantId },
      secret: FIXTURE_TOKEN,
      secretKind: 'SECURE_LINK_TOKEN',
      templateKey: 'secure_access.link',
      // Through the real intake, exactly as B05 now supplies it.
      recipientContactPointId: contactPointId,
    });

    // The origin is bound and visible to the Customer-filtered query first.
    const before = await intents.listForAdmin({ customerId, status: 'FAILED', limit: 50 });
    expect(before).toHaveLength(1);
    expect(before[0]?.id).toBe(origin.intentId);
    expect(before[0]?.recipientContactPointId).toBe(contactPointId);

    const response = await request(context.server())
      .post(ROUTES.replay(origin.intentId))
      .set('Cookie', context.adminCookie())
      .expect(200);

    const payload = dataOf<ReplayPayload>(response);
    expect(payload.outcome).toBe('CREATED');

    const rows = await context.disposable.client.db.execute<{
      id: string;
      recipient_contact_point_id: string | null;
      status: string;
    }>(
      sql`select id, recipient_contact_point_id, status from notification_intents
          order by created_at asc, id asc`,
    );
    expect(rows.rows).toHaveLength(2);

    const originRow = rows.rows.find((row) => row.id === origin.intentId);
    const replayRow = rows.rows.find((row) => row.id === payload.replayIntentId);

    // Carried forward, not re-derived: the replay names the same contact point.
    expect(replayRow?.recipient_contact_point_id).toBe(contactPointId);
    expect(replayRow?.recipient_contact_point_id).toBe(originRow?.recipient_contact_point_id);

    // And the origin is untouched — still FAILED, still bound.
    expect(originRow?.status).toBe('FAILED');
    expect(originRow?.recipient_contact_point_id).toBe(contactPointId);

    // The Customer-filtered support view now finds both, which is the coherence
    // the correction exists to give the operator.
    const after = await intents.listForAdmin({ customerId, limit: 50 });
    expect(after.map((intent) => intent.id).sort()).toEqual(
      [origin.intentId, payload.replayIntentId].sort(),
    );
  });
});
