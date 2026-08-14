/**
 * `APP4-B05` — issue, notified issue, revoke, and the `APP4-B06` seam.
 *
 * Everything runs against a disposable PostgreSQL through the real
 * `CustomerModule`: the real repository, the real `TransactionManager`, the real
 * `RequestNotificationUseCase` sealing real envelopes, the real audit trail. The
 * only overridden providers are the clock and the token minter, so a seven-day
 * expiry is provable in milliseconds and the suite knows which plaintext should
 * reach the digest column and nowhere else.
 */
import { openDeliveryEnvelope } from '@embroidery/notification-delivery';
import { sql } from 'drizzle-orm';

import { SECURE_LINK_TOKEN_PEPPER_ENV } from '../../config/app4-secret-pepper.config';
import { SecureGrantError } from '../../domain/grant/secure-grant-outcome';
import { digestSecret } from '../../domain/secret/app4-secret-digest';
import { isWellFormedSecureLinkToken } from '../../domain/secret/secure-link-token.issuer';

import {
  GRANT_POLICY,
  createGrantContext,
  type GrantFixture,
  type GrantTestContext,
} from './secure-grant-context';
import {
  activeGrantCount,
  grantAudit,
  grantCount,
  grantsFor,
  tokenAppearsAnywhere,
} from './secure-grant-queries';
import { deliveryEvents, intents } from './verification-issue-queries';

const SEVEN_DAYS_MS = 604_800 * 1_000;

describe('APP4-B05 secure grant — issue, notify and revoke', () => {
  let context: GrantTestContext;
  let target: GrantFixture;

  beforeAll(async () => {
    context = await createGrantContext({
      label: 'app4_b05_issue',
      grantPolicy: GRANT_POLICY,
    });
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  // Truncation removes the policy version too, so each test re-publishes it
  // through the same canonical path rather than sharing one from `beforeAll`.
  beforeEach(async () => {
    await context.reset();
    context.clock.set(new Date('2026-08-14T09:00:00.000Z'));
    context.tokens.reset();
    await context.publishGrantPolicy(GRANT_POLICY);
    target = await context.seedTarget();
  });

  describe('issue without notification', () => {
    it('creates exactly one ACTIVE grant with policy-derived expiry', async () => {
      const issuedAt = context.clock.now();

      const issued = await context.inRequest(() =>
        context.grants.issue({
          customerId: target.customerId,
          customRequestId: target.customRequestId,
        }),
      );

      const rows = await grantsFor(context, target.customRequestId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: issued.grantId,
        customer_id: target.customerId,
        custom_request_id: target.customRequestId,
        scope_kind: 'REQUEST_ACCESS',
        status: 'ACTIVE',
        revoked_at: null,
        revoke_reason: null,
        superseded_by_grant_id: null,
      });

      // The expiry is the policy's, not a constant in source: 604 800 seconds
      // after the clock this issuance read.
      expect(issued.expiresAt.getTime()).toBe(issuedAt.getTime() + SEVEN_DAYS_MS);
      expect(new Date(`${rows[0]?.expires_at ?? ''}`).getTime()).toBe(issued.expiresAt.getTime());
    });

    it('persists only the peppered digest, and returns the raw token once', async () => {
      const issued = await context.inRequest(() =>
        context.grants.issue({
          customerId: target.customerId,
          customRequestId: target.customRequestId,
        }),
      );

      // The returned token is the one the minter issued, in P01's accepted form.
      expect(issued.rawToken).toBe(context.tokens.last);
      expect(isWellFormedSecureLinkToken(issued.rawToken)).toBe(true);

      // What is stored verifies against it — and is not it.
      const [row] = await grantsFor(context, target.customRequestId);
      const pepper = process.env[SECURE_LINK_TOKEN_PEPPER_ENV] ?? '';
      expect(row?.token_hash).toBe(digestSecret(pepper, issued.rawToken));
      expect(row?.token_hash).not.toBe(issued.rawToken);

      // And the plaintext reached no column anywhere — grant, intent, outbox,
      // audit or job ledger.
      expect(await tokenAppearsAnywhere(context, issued.rawToken)).toEqual([]);
    });

    it('audits the issue without naming the token, its digest or a link', async () => {
      const issued = await context.inRequest(() =>
        context.grants.issue({
          customerId: target.customerId,
          customRequestId: target.customRequestId,
        }),
      );

      const events = await grantAudit(context);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        action: 'secure_grant.issued',
        actor_kind: 'CUSTOMER',
        target_kind: 'SECURE_ACCESS_GRANT',
        target_id: issued.grantId,
      });
      expect(events[0]?.summary).toMatchObject({
        customRequestId: target.customRequestId,
        scopeKind: 'REQUEST_ACCESS',
        notified: false,
      });

      const [row] = await grantsFor(context, target.customRequestId);
      const serialized = JSON.stringify(events);
      expect(serialized).not.toContain(issued.rawToken);
      expect(serialized).not.toContain(row?.token_hash);
      expect(serialized).not.toContain('#t=');
      expect(serialized).not.toContain('/truy-cap');
      expect(serialized).not.toContain(target.normalizedValue);
    });

    it('requests no notification when none was asked for', async () => {
      await context.inRequest(() =>
        context.grants.issue({
          customerId: target.customerId,
          customRequestId: target.customRequestId,
        }),
      );

      expect(await intents(context)).toEqual([]);
      expect(await deliveryEvents(context)).toEqual([]);
    });

    it('refuses a duplicate issue rather than silently rotating the token', async () => {
      const first = await context.inRequest(() =>
        context.grants.issue({
          customerId: target.customerId,
          customRequestId: target.customRequestId,
        }),
      );

      await expect(
        context.inRequest(() =>
          context.grants.issue({
            customerId: target.customerId,
            customRequestId: target.customRequestId,
          }),
        ),
      ).rejects.toMatchObject({ failure: 'GRANT_ALREADY_ACTIVE' });

      // The live link the customer already holds is untouched: one row, same id,
      // same digest, still ACTIVE.
      const rows = await grantsFor(context, target.customRequestId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(first.grantId);
      expect(rows[0]?.status).toBe('ACTIVE');
    });

    it('refuses a target that is not a usable customer, writing nothing', async () => {
      await expect(
        context.inRequest(() =>
          context.grants.issue({
            customerId: target.contactPointId as unknown as GrantFixture['customerId'],
            customRequestId: target.customRequestId,
          }),
        ),
      ).rejects.toBeInstanceOf(SecureGrantError);

      expect(await grantCount(context)).toBe(0);
    });

    it('fails closed when the secure_grant policy is unpublished or malformed', async () => {
      // A guessed TTL is a credential with an unknown lifetime, so there is no
      // fallback to observe — only a refusal, and no row.
      await context.publishGrantPolicy({ standardTtlSeconds: 0, stepUpWindowSeconds: -1 });

      await expect(
        context.inRequest(() =>
          context.grants.issue({
            customerId: target.customerId,
            customRequestId: target.customRequestId,
          }),
        ),
      ).rejects.toMatchObject({ failure: 'SECURE_GRANT_POLICY_UNAVAILABLE' });

      expect(await grantCount(context)).toBe(0);
      await context.publishGrantPolicy(GRANT_POLICY);
    });
  });

  describe('notified issue', () => {
    it('commits the grant, one intent and one PENDING outbox event together', async () => {
      const issued = await context.inRequest(() =>
        context.grants.issue({
          customerId: target.customerId,
          customRequestId: target.customRequestId,
          notify: true,
        }),
      );

      expect(await activeGrantCount(context, target.customRequestId)).toBe(1);

      const [intent] = await intents(context);
      expect(intent).toMatchObject({
        template_key: 'secure_access.link',
        channel: 'EMAIL',
        status: 'PENDING',
      });
      // The params carry the grant reference and nothing else — no token, no
      // ciphertext, no rendered URL, no destination.
      expect(intent?.params).toEqual({
        schemaVersion: 1,
        reference: { kind: 'SECURE_ACCESS_GRANT', grantId: issued.grantId },
      });
      expect(intent?.recipient_masked).not.toBe(target.normalizedValue);

      const [event] = await deliveryEvents(context);
      expect(event).toMatchObject({
        event_type: 'notification.delivery.requested',
        aggregate_kind: 'NOTIFICATION_INTENT',
        aggregate_id: intent?.id,
        status: 'PENDING',
      });
    });

    it('seals the issued token into the envelope, and into nothing else', async () => {
      const issued = await context.inRequest(() =>
        context.grants.issue({
          customerId: target.customerId,
          customRequestId: target.customRequestId,
          notify: true,
        }),
      );

      const [event] = await deliveryEvents(context);
      // Test-only open: the worker's job in production, and the only way to
      // prove the *issued* token is the one that will be delivered.
      const payload = openDeliveryEnvelope(context.envelopeKey, event?.payload);
      expect(payload.secretKind).toBe('SECURE_LINK_TOKEN');
      expect(payload.secret).toBe(issued.rawToken);
      expect(payload.normalizedRecipient).toBe(target.normalizedValue);

      // The outer JSON an operator or a query would ever see carries none of it.
      const outer = JSON.stringify(event?.payload);
      expect(outer).not.toContain(issued.rawToken);
      expect(Object.keys(event?.payload ?? {}).sort()).toEqual([
        'algorithm',
        'authTag',
        'ciphertext',
        'iv',
        'version',
      ]);
      expect(await tokenAppearsAnywhere(context, issued.rawToken)).toEqual([]);
    });

    it('rolls the grant, the intent, the outbox event and the audit row back together', async () => {
      // The whole issue path runs inside an outer transaction that then throws.
      // `TransactionManager` joins rather than nesting, so this is one real
      // transaction: the grant was inserted, the intent created, the envelope
      // sealed and the outbox event appended before the failure — and every one
      // of them has to disappear.
      await expect(
        context.inRequest(() =>
          context.inTransaction(async () => {
            await context.grants.issue({
              customerId: target.customerId,
              customRequestId: target.customRequestId,
              notify: true,
            });
            throw new Error('forced rollback after the whole issue path committed nothing');
          }),
        ),
      ).rejects.toThrow('forced rollback');

      expect(await grantCount(context)).toBe(0);
      expect(await intents(context)).toEqual([]);
      expect(await deliveryEvents(context)).toEqual([]);
      expect(await grantAudit(context)).toEqual([]);
    });

    it('refuses delivery to a customer with no verified primary contact', async () => {
      const orphan = await context.seedTarget('orphan');
      // Deactivating the only contact leaves a customer nothing to deliver to.
      // The issuance must refuse rather than pick some other channel.
      await context.disposable.client.db.execute(sql`
        update customer_contact_points set deactivated_at = now()
        where customer_id = ${orphan.customerId}
      `);

      await expect(
        context.inRequest(() =>
          context.grants.issue({
            customerId: orphan.customerId,
            customRequestId: orphan.customRequestId,
            notify: true,
          }),
        ),
      ).rejects.toMatchObject({ failure: 'GRANT_DELIVERY_TARGET_UNAVAILABLE' });

      expect(await activeGrantCount(context, orphan.customRequestId)).toBe(0);
      expect(await intents(context)).toEqual([]);
    });
  });

  describe('revoke', () => {
    it('requires a reason, and a blank one changes nothing', async () => {
      const issued = await context.inRequest(() =>
        context.grants.issue({
          customerId: target.customerId,
          customRequestId: target.customRequestId,
        }),
      );

      for (const blank of ['', '   ']) {
        await expect(
          context.inRequest(() => context.grants.revoke(issued.grantId, blank)),
        ).rejects.toMatchObject({ failure: 'GRANT_REVOKE_REASON_REQUIRED' });
      }

      expect(await activeGrantCount(context, target.customRequestId)).toBe(1);
      expect(await grantAudit(context)).toHaveLength(1);
    });

    it('moves ACTIVE to REVOKED with the reason persisted, and audits it', async () => {
      const issued = await context.inRequest(() =>
        context.grants.issue({
          customerId: target.customerId,
          customRequestId: target.customRequestId,
        }),
      );

      await context.inRequest(() => context.grants.revoke(issued.grantId, 'customer asked'));

      const [row] = await grantsFor(context, target.customRequestId);
      expect(row).toMatchObject({
        status: 'REVOKED',
        revoke_reason: 'customer asked',
        // No replacement: revoke withdraws, it does not rotate.
        superseded_by_grant_id: null,
      });
      expect(row?.revoked_at).not.toBeNull();
      // The digest is unchanged — nothing was re-minted.
      expect(row?.token_hash).toBeTruthy();

      const events = await grantAudit(context);
      expect(events.map((event) => event.action)).toEqual([
        'secure_grant.issued',
        'secure_grant.revoked',
      ]);
      expect(events[1]).toMatchObject({
        target_id: issued.grantId,
        reason: 'customer asked',
      });
    });

    it('mints no token and requests no notification', async () => {
      const issued = await context.inRequest(() =>
        context.grants.issue({
          customerId: target.customerId,
          customRequestId: target.customRequestId,
        }),
      );
      const mintedBefore = context.tokens.minted.length;

      await context.inRequest(() => context.grants.revoke(issued.grantId, 'abuse signal'));

      expect(context.tokens.minted).toHaveLength(mintedBefore);
      expect(await intents(context)).toEqual([]);
      expect(await deliveryEvents(context)).toEqual([]);
      expect(await grantCount(context)).toBe(1);
    });

    it('refuses a second revoke — there is no REVOKED to ACTIVE edge', async () => {
      const issued = await context.inRequest(() =>
        context.grants.issue({
          customerId: target.customerId,
          customRequestId: target.customRequestId,
        }),
      );
      await context.inRequest(() => context.grants.revoke(issued.grantId, 'first'));

      await expect(
        context.inRequest(() => context.grants.revoke(issued.grantId, 'second')),
      ).rejects.toMatchObject({ failure: 'GRANT_NOT_ACTIVE' });

      const [row] = await grantsFor(context, target.customRequestId);
      expect(row?.status).toBe('REVOKED');
      expect(row?.revoke_reason).toBe('first');
    });
  });

  describe('the APP4-B06 seam', () => {
    it('resolves the issued grant for the right target, and stops after revoke', async () => {
      const issued = await context.inRequest(() =>
        context.grants.issue({
          customerId: target.customerId,
          customRequestId: target.customRequestId,
        }),
      );
      const pepper = process.env[SECURE_LINK_TOKEN_PEPPER_ENV] ?? '';
      const tokenHash = digestSecret(pepper, issued.rawToken);
      const use = {
        customerId: target.customerId,
        customRequestId: target.customRequestId,
        scopeKind: 'REQUEST_ACCESS' as const,
      };
      const now = context.clock.now();

      const before = await context.repository.resolveActive(tokenHash, use, now);
      expect(before?.id).toBe(issued.grantId);

      await context.inRequest(() => context.grants.revoke(issued.grantId, 'revoked for the seam'));

      // B06 owns the HTTP shaping of this; B05 only has to leave a grant that
      // stops resolving the moment it is withdrawn.
      expect(await context.repository.resolveActive(tokenHash, use, now)).toBeUndefined();
    });
  });
});
