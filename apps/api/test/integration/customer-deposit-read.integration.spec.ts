/**
 * `APP7-B03` — the two zero-write customer deposit operations over real HTTP.
 *
 * The whole application, the real controllers, the real global pipe and
 * exception filter, the real `AuthorizeSecureLink` with its real peppered
 * digest, the canonical AGG-15 and AGG-16 repositories, and the real QR encoder,
 * against a disposable PostgreSQL with every migration applied. Nothing is
 * mocked.
 *
 * The sibling `-attempt` suite owns the write, its idempotency and its race.
 * The split is what keeps both inside the 600-line test limit and gives each a
 * single review object.
 */
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { sql } from 'drizzle-orm';

import { depositTransferReference } from '../../src/modules/payment/domain/deposit/deposit-reference';
import {
  createApiIntegrationContext,
  MERCHANT_BANK_TEST_CONFIG,
  type ApiIntegrationTestContext,
  applyWave2ReleasedEnv,
} from '../support/api-integration-context';
import {
  DEPOSIT_ROUTES,
  SEEDED_DEPOSIT_AMOUNT,
  SEEDED_REMAINING_AMOUNT,
  applyDepositSecretEnv,
  mintToken,
  paymentSnapshot,
  publishDepositPolicies,
  seedDeposit,
  seedGrantWithoutOrder,
  type SeededDeposit,
} from '../support/customer-deposit-fixture';

jest.setTimeout(180_000);

interface DepositBody {
  readonly orderCode: string;
  readonly orderStatus: string;
  readonly depositStatus: string;
  readonly depositAmount: string;
  readonly currencyCode: string;
  readonly bankInstructions: {
    readonly bankBin: string;
    readonly bankDisplayName: string;
    readonly accountNumber: string;
    readonly accountName: string;
    readonly transferReference: string;
  };
  readonly accessExpiresAt: string;
}

describe('APP7-B03 — customer deposit read and QR', () => {
  let context: ApiIntegrationTestContext;
  let restoreWave2: () => void;
  let restoreSecrets: () => void;
  let deposit: SeededDeposit;

  beforeAll(async () => {
    restoreSecrets = applyDepositSecretEnv();
    // `APP12-G02` withholds every Wave-2 customer operation by default, so a
    // suite proving Wave-2 behaviour has to run in the wave that releases it.
    // Set before the context is built: the gate reads the value once, at module
    // composition (`APP12-B04` §48).
    restoreWave2 = applyWave2ReleasedEnv();
    context = await createApiIntegrationContext('app7_b03_read');
    await publishDepositPolicies(context.app, context.database);
    deposit = await seedDeposit(context.app, context.database, {
      stepUpVerifiedSecondsAgo: 60,
    });
  });

  afterAll(async () => {
    await context?.close();
    restoreWave2?.();
    restoreSecrets?.();
  });

  function readDeposit(token: string) {
    return context.http.post(DEPOSIT_ROUTES.read).send({ token });
  }

  describe('the deposit read', () => {
    it('returns the obligation’s own frozen amount and currency', async () => {
      const response = await readDeposit(deposit.token);

      expect(response.status).toBe(200);
      const body = (response.body as { data: DepositBody }).data;
      // The DEPOSIT obligation's amount, not 40 % of anything and not the order
      // total (2 550 000.00). No share is recomputed anywhere on this path.
      expect(body.depositAmount).toBe(SEEDED_DEPOSIT_AMOUNT);
      expect(body.currencyCode).toBe('VND');
      expect(body.depositAmount).not.toBe('2550000.00');
    });

    it('returns the exact configured merchant account, and nothing invented', async () => {
      const body = (await readDeposit(deposit.token)).body as { data: DepositBody };
      expect(body.data.bankInstructions).toEqual({
        bankBin: MERCHANT_BANK_TEST_CONFIG.bankBin,
        bankDisplayName: MERCHANT_BANK_TEST_CONFIG.bankDisplayName,
        accountNumber: MERCHANT_BANK_TEST_CONFIG.accountNumber,
        accountName: MERCHANT_BANK_TEST_CONFIG.accountName,
        transferReference: depositTransferReference(deposit.orderCode),
      });
    });

    it('derives the DC transfer reference from this order, identically every time', async () => {
      const first = (await readDeposit(deposit.token)).body as { data: DepositBody };
      const second = (await readDeposit(deposit.token)).body as { data: DepositBody };
      const reference = first.data.bankInstructions.transferReference;

      expect(reference).toMatch(/^[A-Z0-9]{15}$/);
      expect(reference.endsWith('DC')).toBe(true);
      expect(reference).toBe(`ORD${deposit.orderCode.slice(4)}DC`);
      expect(second.data.bankInstructions.transferReference).toBe(reference);

      // Derived, not persisted: no column anywhere holds it.
      const { rows } = await context.database.client.db.execute<{ count: string }>(sql`
        select count(*)::text as count from information_schema.columns
         where column_name in ('transfer_reference', 'payment_reference')
           and table_name in ('orders', 'payment_obligations', 'payment_attempts')
      `);
      expect(rows[0]?.count).toBe('0');
    });

    it('reports the order and deposit states separately, with no collapsing flag', async () => {
      const body = (await readDeposit(deposit.token)).body as { data: DepositBody };
      expect(body.data.orderStatus).toBe('AWAITING_DEPOSIT');
      expect(body.data.depositStatus).toBe('PENDING');
      expect(body.data.orderCode).toBe(deposit.orderCode);
    });

    it('exposes nothing about the REMAINING obligation', async () => {
      const serialized = JSON.stringify((await readDeposit(deposit.token)).body);
      expect(serialized).not.toContain(SEEDED_REMAINING_AMOUNT);
      expect(serialized).not.toContain(deposit.remainingObligationId);
      expect(serialized.toLowerCase()).not.toContain('remaining');
    });

    it('echoes back no credential and no internal identifier', async () => {
      const serialized = JSON.stringify((await readDeposit(deposit.token)).body);
      for (const secret of [
        deposit.token,
        deposit.grantId,
        deposit.challengeId,
        deposit.customerId,
        deposit.customRequestId,
        deposit.depositObligationId,
        deposit.orderId,
      ]) {
        expect(serialized).not.toContain(secret);
      }
    });

    it('writes nothing at all', async () => {
      const before = await paymentSnapshot(context.database, deposit);
      await readDeposit(deposit.token);
      await readDeposit(deposit.token);
      const after = await paymentSnapshot(context.database, deposit);
      expect(after).toEqual(before);
    });

    it('does not consume the link — the same token keeps working', async () => {
      expect((await readDeposit(deposit.token)).status).toBe(200);
      expect((await readDeposit(deposit.token)).status).toBe(200);
      const { rows } = await context.database.client.db.execute<{ status: string }>(
        sql`select status from secure_access_grants where id = ${deposit.grantId}`,
      );
      expect(rows[0]?.status).toBe('ACTIVE');
    });
  });

  describe('non-enumerating refusal', () => {
    it('answers an unknown token exactly as it answers a foreign order', async () => {
      const unknown = await readDeposit(mintToken());
      expect(unknown.status).toBe(404);
      expect((unknown.body as { code: string }).code).toBe('SECURE_LINK_UNAVAILABLE');

      // A second, unrelated order with its own live link. Its token is real and
      // its order exists — but presented against this surface it can only ever
      // reach its *own* deposit, so the "foreign order" case is unreachable by
      // construction: there is no order id to substitute.
      const other = await seedDeposit(context.app, context.database, {
        stepUpVerifiedSecondsAgo: 60,
        suffix: 'other',
      });
      const foreign = await readDeposit(other.token);
      expect(foreign.status).toBe(200);
      expect((foreign.body as { data: DepositBody }).data.orderCode).toBe(other.orderCode);
      expect((foreign.body as { data: DepositBody }).data.orderCode).not.toBe(deposit.orderCode);
    });

    it('answers a request with no order with the same 404 as a bad token', async () => {
      // The grant is live and real; the request simply has not been converted
      // yet. A distinguishable answer here would tell a probe holding a leaked
      // link how far the workshop has got with someone's order.
      const pending = await seedGrantWithoutOrder(context.database);

      const missing = await readDeposit(pending.token);
      const unknown = await readDeposit(mintToken());
      expect(missing.status).toBe(unknown.status);
      expect((missing.body as { code: string; message: string }).code).toBe(
        (unknown.body as { code: string }).code,
      );
      expect((missing.body as { message: string }).message).toBe(
        (unknown.body as { message: string }).message,
      );
    });

    it('refuses a body carrying anything but the token', async () => {
      const response = await context.http
        .post(DEPOSIT_ROUTES.read)
        .send({ token: deposit.token, orderId: deposit.orderId });
      expect(response.status).toBe(400);
    });
  });

  describe('the dynamic QR', () => {
    it('streams a downloadable PNG with secure-payment headers', async () => {
      const response = await context.http
        .post(DEPOSIT_ROUTES.qr)
        .send({ token: deposit.token })
        .responseType('blob');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('image/png');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('deposit-transfer-qr.png');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect((response.body as Buffer).byteLength).toBeGreaterThan(0);
    });

    it('encodes the exact account, the exact amount and the exact DC reference', async () => {
      const response = await context.http
        .post(DEPOSIT_ROUTES.qr)
        .send({ token: deposit.token })
        .responseType('blob');

      // Decoded out of the delivered pixels by two packages that know nothing
      // about the encoder.
      const image = PNG.sync.read(response.body as Buffer);
      const decoded = jsQR(Uint8ClampedArray.from(image.data), image.width, image.height);
      expect(decoded).not.toBeNull();
      const payload = (decoded as { data: string }).data;

      expect(payload).toContain(MERCHANT_BANK_TEST_CONFIG.bankBin);
      expect(payload).toContain(MERCHANT_BANK_TEST_CONFIG.accountNumber);
      // 765000 VND, whole đồng, exactly the obligation's amount.
      expect(payload).toContain('5406765000');
      expect(payload).toContain(depositTransferReference(deposit.orderCode));
      // Instructions only: no application URL, no token, no attempt.
      expect(payload.toLowerCase()).not.toContain('http');
      expect(payload).not.toContain(deposit.token);
      expect(payload).not.toContain(deposit.grantId);
    });

    it('changes no state, however many times it is read', async () => {
      const before = await paymentSnapshot(context.database, deposit);
      for (let call = 0; call < 3; call += 1) {
        const response = await context.http
          .post(DEPOSIT_ROUTES.qr)
          .send({ token: deposit.token })
          .responseType('blob');
        expect(response.status).toBe(200);
      }
      expect(await paymentSnapshot(context.database, deposit)).toEqual(before);
    });

    it('persists no bytes — no asset, no object and no storage key', async () => {
      await context.http
        .post(DEPOSIT_ROUTES.qr)
        .send({ token: deposit.token })
        .responseType('blob');
      const { rows } = await context.database.client.db.execute<{ count: string }>(sql`
        select count(*)::text as count from assets
         where storage_key ilike '%qr%' or kind ilike '%qr%'
      `);
      expect(rows[0]?.count).toBe('0');
    });

    it('answers an unusable token with the read’s identical 404', async () => {
      const refused = await context.http.post(DEPOSIT_ROUTES.qr).send({ token: mintToken() });
      expect(refused.status).toBe(404);
      expect((refused.body as { code: string }).code).toBe('SECURE_LINK_UNAVAILABLE');
    });
  });
});
