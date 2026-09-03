/**
 * `APP12-S03-C1` — where a secure link lands, decided by the grant's own scope.
 *
 * ### The gap this closes
 *
 * `APP12-S03` delivered `/truy-cap/don-hang`, the Ready-Made order surface, and
 * its live acceptance run failed at the very first navigation: the real
 * `ORDER_ACCESS` notification pointed at `/truy-cap`, which mounts APP5's
 * custom-request screen. That page resolves the token against `REQUEST_ACCESS`
 * only, so a real customer's real link was refused as wrong-scope and showed
 * the same unavailable card as a forged one.
 *
 * The cause was structural: one renderer, one hard-coded path, and no scope
 * anywhere in the delivery contract to choose with.
 *
 * ### What is asserted here, and what is deliberately not
 *
 * This suite proves the **producer** half through the real issuers: a notified
 * issuance of each scope seals a delivery whose landing matches the grant row
 * the database actually holds. Nothing writes the landing for the code under
 * test to read back — the two issuers are called exactly as production calls
 * them, and the envelope is opened the way the worker will.
 *
 * The **consumer** half — landing to URL — is `apps/worker`'s
 * `renderSecureLinkUrl` and its own delivery integration suite, because no app
 * imports another. The two meet for real in the `app12-s03` disposable browser
 * project, which navigates to the exact delivered URL.
 *
 * (That project's runner is deliberately not named here. `check-e2e-boundaries`
 * refuses any spec under a production `src` tree that mentions it, and the rule
 * is right: this is a Jest integration suite and must never become a browser
 * one.)
 */
import { sql } from 'drizzle-orm';
import { openDeliveryEnvelope } from '@embroidery/notification-delivery';

import { SECURE_LINK_TOKEN_PEPPER_ENV } from '../../config/app4-secret-pepper.config';
import { digestSecret } from '../../domain/secret/app4-secret-digest';
import { createGrantContext, GRANT_POLICY, type GrantTestContext } from './secure-grant-context';
import { CHALLENGE_POLICY } from './verification-issue-context';

type EventRow = { readonly payload: Record<string, unknown> };

async function deliveryPayloads(context: GrantTestContext) {
  const result = await context.disposable.client.db.execute<EventRow>(
    sql`select payload from outbox_events
        where event_type = 'notification.delivery.requested'
        order by id asc`,
  );
  // Test-only open: the worker's job in production, and the only way to see the
  // fact that decides the customer's URL.
  return result.rows.map((row) => openDeliveryEnvelope(context.envelopeKey, row.payload));
}

async function grantScope(context: GrantTestContext, grantId: string): Promise<string | undefined> {
  const result = await context.disposable.client.db.execute<{ scope_kind: string }>(
    sql`select scope_kind from secure_access_grants where id = ${grantId}`,
  );
  return result.rows[0]?.scope_kind;
}

describe('APP12-S03-C1 secure-link landing (integration)', () => {
  let context: GrantTestContext;
  let target: Awaited<ReturnType<GrantTestContext['seedTarget']>>;

  beforeAll(async () => {
    context = await createGrantContext({
      label: 'app12-s03-c1-landing',
      grantPolicy: GRANT_POLICY,
    });
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    context.clock.set(new Date('2026-09-03T09:00:00.000Z'));
    context.tokens.reset();
    await context.publishPolicy(CHALLENGE_POLICY);
    await context.publishGrantPolicy(GRANT_POLICY);
    target = await context.seedTarget();
  });

  it('seals a REQUEST_ACCESS issuance for the custom-request landing', async () => {
    const issued = await context.inRequest(() =>
      context.grants.issue({
        customerId: target.customerId,
        customRequestId: target.customRequestId,
        notify: true,
      }),
    );

    const [payload] = await deliveryPayloads(context);
    expect(payload?.secretKind).toBe('SECURE_LINK_TOKEN');
    expect(payload?.secureLinkLanding).toBe('REQUEST_ACCESS');
    // The landing is the grant row's own scope, not a literal this test chose.
    expect(await grantScope(context, issued.grantId)).toBe('REQUEST_ACCESS');
  });

  it('seals an ORDER_ACCESS issuance for the Ready-Made order landing', async () => {
    const issued = await context.inRequest(() =>
      context.orderGrants.ensure({
        customerId: target.customerId,
        orderId: target.orderId,
        notify: true,
      }),
    );

    const [payload] = await deliveryPayloads(context);
    expect(payload?.secureLinkLanding).toBe('ORDER_ACCESS');
    expect(await grantScope(context, issued.grantId)).toBe('ORDER_ACCESS');
  });

  it('gives the two scopes different landings from the same customer and contact', async () => {
    // One customer, one primary contact, one channel, one template key — the
    // only thing that differs between the two deliveries is the grant. If the
    // landing were derived from anything else in this picture, both would match.
    await context.inRequest(() =>
      context.grants.issue({
        customerId: target.customerId,
        customRequestId: target.customRequestId,
        notify: true,
      }),
    );
    await context.inRequest(() =>
      context.orderGrants.ensure({
        customerId: target.customerId,
        orderId: target.orderId,
        notify: true,
      }),
    );

    const payloads = await deliveryPayloads(context);
    expect(payloads.map((p) => p.secureLinkLanding)).toEqual(['REQUEST_ACCESS', 'ORDER_ACCESS']);
    expect(new Set(payloads.map((p) => p.normalizedRecipient)).size).toBe(1);
  });

  it('keeps the landing inside the ciphertext and out of the intent', async () => {
    // `notification_intents.params` is read by Admin support screens. The
    // landing says which surface a token opens, which is a fact about the
    // credential — so it travels with the credential and nowhere else.
    await context.inRequest(() =>
      context.orderGrants.ensure({
        customerId: target.customerId,
        orderId: target.orderId,
        notify: true,
      }),
    );

    const intents = await context.disposable.client.db.execute<{
      params: Record<string, unknown>;
    }>(sql`select params from notification_intents`);
    const events = await context.disposable.client.db.execute<EventRow>(
      sql`select payload from outbox_events where event_type = 'notification.delivery.requested'`,
    );

    expect(JSON.stringify(intents.rows)).not.toContain('ORDER_ACCESS');
    expect(JSON.stringify(events.rows)).not.toContain('ORDER_ACCESS');
  });

  describe('the wrong surface refuses a token of the other scope', () => {
    // The correction makes two landings reachable, so "what happens if a token
    // arrives at the wrong one?" stops being theoretical. The answer is the
    // delivered resolver contract, not new code: each surface passes its own
    // scope set to `resolveActiveByTokenDigest`, and a live grant of the other
    // scope resolves to nothing — indistinguishable from an unknown digest.
    //
    // Asserted against **real** grants and their real peppered digests, because
    // the claim is about the persisted row rather than about a mock.
    const digestOf = (rawToken: string): string =>
      digestSecret(process.env[SECURE_LINK_TOKEN_PEPPER_ENV] ?? '', rawToken);

    it('refuses an ORDER_ACCESS token presented to the custom-request scope', async () => {
      const issued = await context.inRequest(() =>
        context.orderGrants.ensure({
          customerId: target.customerId,
          orderId: target.orderId,
          notify: false,
        }),
      );
      const digest = digestOf(issued.rawToken ?? '');
      const now = new Date('2026-09-03T09:05:00.000Z');

      // Its own scope resolves it, so the grant is genuinely live.
      expect(
        await context.repository.resolveActiveByTokenDigest(digest, ['ORDER_ACCESS'], now),
      ).toBeDefined();
      // The custom-request surface's scope set does not.
      expect(
        await context.repository.resolveActiveByTokenDigest(digest, ['REQUEST_ACCESS'], now),
      ).toBeUndefined();
    });

    it('refuses a REQUEST_ACCESS token presented to the order scope', async () => {
      const issued = await context.inRequest(() =>
        context.grants.issue({
          customerId: target.customerId,
          customRequestId: target.customRequestId,
          notify: false,
        }),
      );
      const digest = digestOf(issued.rawToken);
      const now = new Date('2026-09-03T09:05:00.000Z');

      expect(
        await context.repository.resolveActiveByTokenDigest(digest, ['REQUEST_ACCESS'], now),
      ).toBeDefined();
      expect(
        await context.repository.resolveActiveByTokenDigest(digest, ['ORDER_ACCESS'], now),
      ).toBeUndefined();
    });

    it('answers a wrong-scope token exactly as it answers an unknown one', async () => {
      // Non-enumeration: the two refusals must be the same value, so nothing
      // downstream can branch on which cause it met.
      const issued = await context.inRequest(() =>
        context.orderGrants.ensure({
          customerId: target.customerId,
          orderId: target.orderId,
          notify: false,
        }),
      );
      const now = new Date('2026-09-03T09:05:00.000Z');

      const wrongScope = await context.repository.resolveActiveByTokenDigest(
        digestOf(issued.rawToken ?? ''),
        ['REQUEST_ACCESS'],
        now,
      );
      const unknown = await context.repository.resolveActiveByTokenDigest(
        digestOf('never-minted'.padEnd(43, 'z')),
        ['REQUEST_ACCESS'],
        now,
      );

      expect(wrongScope).toBe(unknown);
      expect(wrongScope).toBeUndefined();
    });
  });

  it('does not put a landing on a verification code', async () => {
    // A code becomes no URL. The codec refuses one that carries a landing, so
    // this also proves the challenge path was left alone.
    await context.inRequest(() =>
      context.issuance.issue({
        contactKind: 'EMAIL',
        contact: target.normalizedValue,
        purpose: 'SUBMISSION',
      }),
    );

    const [payload] = await deliveryPayloads(context);
    expect(payload?.secretKind).toBe('VERIFICATION_CODE');
    expect(payload?.secureLinkLanding).toBeUndefined();
  });
});
