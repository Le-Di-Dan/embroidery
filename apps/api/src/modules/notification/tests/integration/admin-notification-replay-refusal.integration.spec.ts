/**
 * `APP4-B08` — every way a manual replay is refused, and the proof that a
 * refusal writes nothing.
 *
 * Two refusal families, kept apart on purpose:
 *
 * - **`REISSUE_REQUIRED`** — the sealed secret is no longer usable. It is a
 *   *routing* signal (IMP-D049 PO-11): it tells the operator to make a new code
 *   through `APP4-B03` or a new token through `APP4-B05`, and it is the only
 *   refusal that carries that instruction.
 * - **`REPLAY_NOT_APPLICABLE` / `REPLAY_SOURCE_UNAVAILABLE`** — state misuse and
 *   unusable evidence. Neither means a secret expired, so neither may tell an
 *   operator to mint a credential — least of all for a `SATISFIED` notification
 *   the customer already received.
 *
 * One case per distinct lifecycle rule rather than a Cartesian matrix: the rule
 * being proved is "this state refuses", and repeating it across every channel
 * and template proves nothing further.
 */
import { sql } from 'drizzle-orm';
import request from 'supertest';

import {
  FIXTURE_CODE,
  FIXTURE_TOKEN,
  ROUTES,
  createAdminNotificationContext,
  type AdminNotificationTestContext,
} from './admin-notification-context';

interface ErrorBody {
  readonly error?: { readonly code?: string };
  readonly code?: string;
}

describe('APP4-B08 manual replay refusals (integration)', () => {
  let context: AdminNotificationTestContext;

  beforeAll(async () => {
    context = await createAdminNotificationContext('app4-b08-refusal');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  const db = () => context.disposable.client.db;

  const replay = (intentId: string) =>
    request(context.server()).post(ROUTES.replay(intentId)).set('Cookie', context.adminCookie());

  /** The published business code, wherever the envelope carries it. */
  function codeOf(body: unknown): string | undefined {
    const payload = body as ErrorBody;
    return payload.error?.code ?? payload.code;
  }

  async function countIntents(): Promise<number> {
    const result = await db().execute<{ total: string }>(
      sql`select count(*)::text as total from notification_intents`,
    );
    return Number(result.rows[0]?.total ?? '0');
  }

  async function countEvents(): Promise<number> {
    const result = await db().execute<{ total: string }>(
      sql`select count(*)::text as total from outbox_events`,
    );
    return Number(result.rows[0]?.total ?? '0');
  }

  async function countAudit(): Promise<number> {
    const result = await db().execute<{ total: string }>(
      sql`select count(*)::text as total from audit_events`,
    );
    return Number(result.rows[0]?.total ?? '0');
  }

  /** Asserts a refusal appended nothing anywhere. */
  async function expectNoWrites(): Promise<void> {
    // One intent and one event: the fixture's own, and nothing else.
    expect(await countIntents()).toBe(1);
    expect(await countEvents()).toBe(1);
    expect(await countAudit()).toBe(0);
  }

  async function seedForChallenge(options: {
    readonly status?: string;
    readonly expiresAt?: Date;
  }): Promise<string> {
    const challengeId = await context.seedChallenge(options);
    const source = await context.seedTerminalDelivery({
      reference: { kind: 'VERIFICATION_CHALLENGE', challengeId },
      secret: FIXTURE_CODE,
      secretKind: 'VERIFICATION_CODE',
    });
    return source.intentId;
  }

  async function seedForGrant(options: {
    readonly status?: string;
    readonly expiresAt?: Date;
  }): Promise<string> {
    const grantId = await context.seedGrant(options);
    const source = await context.seedTerminalDelivery({
      reference: { kind: 'SECURE_ACCESS_GRANT', grantId },
      secret: FIXTURE_TOKEN,
      secretKind: 'SECURE_LINK_TOKEN',
      templateKey: 'secure.link',
    });
    return source.intentId;
  }

  describe('the verification code is no longer usable', () => {
    it('refuses a challenge that expired by time', async () => {
      // Still `ISSUED` — nothing swept it — but past its deadline. Delivering a
      // code that can no longer be entered is worse than refusing.
      const intentId = await seedForChallenge({
        expiresAt: new Date('2026-08-15T08:30:00.000Z'),
      });
      context.clock.set(new Date('2026-08-15T09:00:00.000Z'));

      const response = await replay(intentId).expect(409);

      expect(codeOf(response.body)).toBe('REISSUE_REQUIRED');
      await expectNoWrites();
    });

    it('refuses a challenge that was already answered', async () => {
      const intentId = await seedForChallenge({ status: 'VERIFIED' });

      const response = await replay(intentId).expect(409);

      expect(codeOf(response.body)).toBe('REISSUE_REQUIRED');
      await expectNoWrites();
    });

    it('refuses a challenge that was cancelled', async () => {
      const intentId = await seedForChallenge({ status: 'CANCELLED' });

      const response = await replay(intentId).expect(409);

      expect(codeOf(response.body)).toBe('REISSUE_REQUIRED');
      await expectNoWrites();
    });

    it('refuses a challenge that failed its attempt budget', async () => {
      const intentId = await seedForChallenge({ status: 'FAILED' });

      const response = await replay(intentId).expect(409);

      expect(codeOf(response.body)).toBe('REISSUE_REQUIRED');
      await expectNoWrites();
    });

    it('refuses when the referenced challenge no longer exists', async () => {
      const intentId = await seedForChallenge({});
      await db().execute(sql`delete from contact_verification_challenges`);

      const response = await replay(intentId).expect(409);

      // A missing aggregate is as unusable as an expired one, and answering
      // differently would make this an existence oracle.
      expect(codeOf(response.body)).toBe('REISSUE_REQUIRED');
      await expectNoWrites();
    });
  });

  describe('the secure link is no longer usable', () => {
    it('refuses an expired grant', async () => {
      const intentId = await seedForGrant({ expiresAt: new Date('2026-08-15T08:30:00.000Z') });
      context.clock.set(new Date('2026-08-15T09:00:00.000Z'));

      const response = await replay(intentId).expect(409);

      expect(codeOf(response.body)).toBe('REISSUE_REQUIRED');
      await expectNoWrites();
    });

    it('refuses a revoked grant', async () => {
      const intentId = await seedForGrant({ status: 'REVOKED' });

      const response = await replay(intentId).expect(409);

      expect(codeOf(response.body)).toBe('REISSUE_REQUIRED');
      await expectNoWrites();
    });

    it('refuses a superseded grant', async () => {
      // Supersession is already REVOKED — `APP4-B05` revokes the source row
      // before pointing it at its replacement — so this is the same rule seen
      // through the lineage pointer rather than a second one.
      const intentId = await seedForGrant({ status: 'REVOKED' });
      const replacement = await context.seedGrant();
      await db().execute(
        sql`update secure_access_grants set superseded_by_grant_id = ${replacement}
            where status = 'REVOKED'`,
      );

      const response = await replay(intentId).expect(409);

      expect(codeOf(response.body)).toBe('REISSUE_REQUIRED');
      expect(await countIntents()).toBe(1);
      expect(await countEvents()).toBe(1);
      expect(await countAudit()).toBe(0);
    });
  });

  describe('the notification is not a terminal transport failure', () => {
    it('refuses a SATISFIED notification', async () => {
      const source = await context.seedTerminalDelivery({
        reference: {
          kind: 'VERIFICATION_CHALLENGE',
          challengeId: await context.seedChallenge(),
        },
        secret: FIXTURE_CODE,
        secretKind: 'VERIFICATION_CODE',
        satisfied: true,
      });

      const response = await replay(source.intentId).expect(409);

      // Not `REISSUE_REQUIRED`: the customer already received this. Telling an
      // operator to mint a new credential here would be actively wrong.
      expect(codeOf(response.body)).toBe('REPLAY_NOT_APPLICABLE');
      await expectNoWrites();
    });

    it('refuses a notification still waiting to be delivered', async () => {
      const source = await context.seedTerminalDelivery({
        reference: {
          kind: 'VERIFICATION_CHALLENGE',
          challengeId: await context.seedChallenge(),
        },
        secret: FIXTURE_CODE,
        secretKind: 'VERIFICATION_CODE',
        terminal: false,
      });

      const response = await replay(source.intentId).expect(409);

      expect(codeOf(response.body)).toBe('REPLAY_NOT_APPLICABLE');
      await expectNoWrites();
    });
  });

  describe('the source evidence is unusable', () => {
    it('refuses when no delivery event reached DEAD_LETTER', async () => {
      // A FAILED intent whose delivery event is still PENDING: the automatic
      // retry budget was never exhausted, so there is no terminal source to
      // replay from.
      const source = await context.seedTerminalDelivery({
        reference: {
          kind: 'VERIFICATION_CHALLENGE',
          challengeId: await context.seedChallenge(),
        },
        secret: FIXTURE_CODE,
        secretKind: 'VERIFICATION_CODE',
        terminal: false,
      });
      await db().execute(
        sql`update notification_intents set status = 'FAILED' where id = ${source.intentId}`,
      );

      const response = await replay(source.intentId).expect(409);

      expect(codeOf(response.body)).toBe('REPLAY_SOURCE_UNAVAILABLE');
      await expectNoWrites();
    });

    it('refuses params that do not satisfy the APP4-B01 reference contract', async () => {
      const source = await context.seedTerminalDelivery({
        reference: {
          kind: 'VERIFICATION_CHALLENGE',
          challengeId: await context.seedChallenge(),
        },
        secret: FIXTURE_CODE,
        secretKind: 'VERIFICATION_CODE',
      });
      await db().execute(
        sql`update notification_intents set params = ${{ schemaVersion: 99, reference: {} }}
            where id = ${source.intentId}`,
      );

      const response = await replay(source.intentId).expect(409);

      // Malformed persistence, not an expired secret: issuing a real credential
      // to paper over a bad row would be worse than refusing.
      expect(codeOf(response.body)).toBe('REPLAY_SOURCE_UNAVAILABLE');
      await expectNoWrites();
    });
  });
});
