/**
 * `APP4-B08` — Admin authentication and the notification delivery list, through
 * the whole HTTP stack against a real PostgreSQL instance.
 *
 * Two claims live here:
 *
 * 1. **Both routes are behind APP1's existing guard.** No cookie is a 401 and an
 *    invalid cookie is a 401, through the real `AuthenticatedAdminGuard` — not a
 *    stub. This is not a re-run of APP1's auth matrix; it is the one thing only
 *    B08 can prove, which is that its own routes are attached to that guard.
 * 2. **The list answers "was it sent, and why did it fail" and nothing else.**
 *    The response is searched for the raw recipient, the sealed secret and every
 *    envelope field as whole strings — an assertion on the published fields
 *    alone would still pass if a raw value sat in a field nobody thought to
 *    check.
 */
import { newId } from '@embroidery/database';
import request from 'supertest';

import {
  ADMIN_COOKIE_NAME,
  FIXTURE_CODE,
  FIXTURE_EMAIL,
  FIXTURE_EMAIL_MASK,
  ROUTES,
  createAdminNotificationContext,
  dataOf,
  type AdminNotificationTestContext,
} from './admin-notification-context';

interface AttemptRow {
  readonly attemptedAt: string;
  readonly channel: string;
  readonly outcome: string;
  readonly errorClass?: string;
}

interface IntentRow {
  readonly intentId: string;
  readonly status: string;
  readonly channel: string;
  readonly recipientMasked: string;
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly createdAt: string;
  readonly attempts: readonly AttemptRow[];
}

describe('APP4-B08 Admin notification list (integration)', () => {
  let context: AdminNotificationTestContext;

  beforeAll(async () => {
    context = await createAdminNotificationContext('app4-b08-list');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  async function list(query = ''): Promise<{
    readonly intents: readonly IntentRow[];
    readonly raw: string;
    readonly cacheControl: string | undefined;
  }> {
    const response = await request(context.server())
      .get(`${ROUTES.list()}${query}`)
      .set('Cookie', context.adminCookie())
      .expect(200);
    return {
      intents: dataOf<{ readonly intents: readonly IntentRow[] }>(response).intents,
      raw: JSON.stringify(response.body),
      cacheControl: response.headers['cache-control'],
    };
  }

  /** One FAILED, one SATISFIED and one still-PENDING notification. */
  async function seedThree(): Promise<{
    readonly failed: string;
    readonly satisfied: string;
    readonly pending: string;
  }> {
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
    const pending = await context.seedTerminalDelivery({
      reference: { kind: 'VERIFICATION_CHALLENGE', challengeId: await context.seedChallenge() },
      secret: FIXTURE_CODE,
      secretKind: 'VERIFICATION_CODE',
      terminal: false,
    });
    return { failed: failed.intentId, satisfied: satisfied.intentId, pending: pending.intentId };
  }

  describe('Admin authentication', () => {
    it('refuses both routes with no Admin session', async () => {
      await request(context.server()).get(ROUTES.list()).expect(401);
      await request(context.server()).post(ROUTES.replay(newId())).expect(401);
    });

    it('refuses both routes with a cookie that resolves to no session', async () => {
      // One representative invalid-session case. APP1 owns expiry, revocation
      // and disabled accounts, and the guard is unchanged here, so re-running
      // that matrix would prove APP1 again rather than B08.
      const cookie = `${ADMIN_COOKIE_NAME}=not-a-live-session-token`;
      await request(context.server()).get(ROUTES.list()).set('Cookie', cookie).expect(401);
      await request(context.server())
        .post(ROUTES.replay(newId()))
        .set('Cookie', cookie)
        .expect(401);
    });

    it('refuses a replay stating a foreign origin', async () => {
      // The APP1 Origin allowlist, applied to this mutation exactly as it is to
      // every other staff mutation.
      await request(context.server())
        .post(ROUTES.replay(newId()))
        .set('Cookie', context.adminCookie())
        .set('Origin', 'https://not-the-admin.example')
        .expect(403);
    });

    it('reaches the handler with a live Admin session', async () => {
      const { intents } = await list();
      expect(Array.isArray(intents)).toBe(true);
    });
  });

  describe('GET /admin/notification-intents', () => {
    it('returns every state when no filter is given, newest first', async () => {
      const seeded = await seedThree();

      const { intents } = await list();

      expect(intents.map((intent) => intent.intentId).sort()).toEqual(
        [seeded.failed, seeded.satisfied, seeded.pending].sort(),
      );
      const statuses = intents.map((intent) => intent.status).sort();
      expect(statuses).toEqual(['FAILED', 'PENDING', 'SATISFIED']);
    });

    it('filters by one closed-set status', async () => {
      const seeded = await seedThree();

      const failed = await list('?status=FAILED');
      expect(failed.intents.map((intent) => intent.intentId)).toEqual([seeded.failed]);

      const satisfied = await list('?status=SATISFIED');
      expect(satisfied.intents.map((intent) => intent.intentId)).toEqual([seeded.satisfied]);

      const cancelled = await list('?status=CANCELLED');
      expect(cancelled.intents).toEqual([]);
    });

    it('refuses a status outside the closed set', async () => {
      await request(context.server())
        .get(`${ROUTES.list()}?status=EXPLODED`)
        .set('Cookie', context.adminCookie())
        .expect(400);
    });

    it('refuses an unknown filter rather than silently ignoring it', async () => {
      // `.strict()` — a caller that believes it filtered by recipient and got an
      // unfiltered page is worse served than one that got an error.
      await request(context.server())
        .get(`${ROUTES.list()}?recipient=${encodeURIComponent(FIXTURE_EMAIL)}`)
        .set('Cookie', context.adminCookie())
        .expect(400);
    });

    it('publishes the frozen mask, the template reference and the attempt timeline', async () => {
      const seeded = await seedThree();

      const { intents } = await list('?status=FAILED');
      const [intent] = intents;

      expect(intent?.intentId).toBe(seeded.failed);
      expect(intent?.recipientMasked).toBe(FIXTURE_EMAIL_MASK);
      expect(intent?.channel).toBe('EMAIL');
      expect(intent?.templateKey).toBe('verification.code');
      expect(intent?.templateVersion).toBe(1);

      // Chronological, and every attempt carries its safe class.
      expect(intent?.attempts).toHaveLength(3);
      expect(intent?.attempts.map((attempt) => attempt.outcome)).toEqual([
        'FAILED_RETRYABLE',
        'FAILED_RETRYABLE',
        'FAILED_TERMINAL',
      ]);
      const instants = (intent?.attempts ?? []).map((attempt) => Date.parse(attempt.attemptedAt));
      expect(instants).toEqual([...instants].sort((left, right) => left - right));
      expect(
        intent?.attempts.every((attempt) => attempt.errorClass === 'CHANNEL_UNAVAILABLE'),
      ).toBe(true);
    });

    it('publishes exactly the safe field set and nothing beside it', async () => {
      await seedThree();

      const { intents } = await list('?status=FAILED');
      const [intent] = intents;

      expect(Object.keys(intent ?? {}).sort()).toEqual([
        'attempts',
        'channel',
        'createdAt',
        'intentId',
        'recipientMasked',
        'status',
        'templateKey',
        'templateVersion',
      ]);
      expect(Object.keys(intent?.attempts[0] ?? {}).sort()).toEqual([
        'attemptedAt',
        'channel',
        'errorClass',
        'outcome',
      ]);
    });

    it('leaks no recipient, secret, envelope, params or provider field', async () => {
      await seedThree();

      const { raw } = await list();

      // The raw destination and the sealed plaintext, by value.
      expect(raw).not.toContain(FIXTURE_EMAIL);
      expect(raw).not.toContain(FIXTURE_CODE);
      // The fixture's synthetic challenge digest marker.
      expect(raw).not.toContain('fixture-code-digest');

      for (const forbidden of [
        'params',
        'reference',
        'challengeid',
        'grantid',
        'ciphertext',
        'authtag',
        '"iv"',
        'algorithm',
        'payload',
        'envelope',
        'providermessageref',
        'stack',
        'nextattemptat',
        'claimedby',
        'attemptcount',
        'sourceoutboxeventid',
        'intentkey',
        'contactpointid',
        'correlationid',
      ]) {
        expect(raw.toLowerCase()).not.toContain(forbidden);
      }
    });

    it('forbids caching', async () => {
      const { cacheControl } = await list();
      expect(cacheControl).toBe('no-store');
    });
  });
});
