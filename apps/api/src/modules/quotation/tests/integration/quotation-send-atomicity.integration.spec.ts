/**
 * `APP6-B03` §5 — the send transaction is one atomic unit, or nothing.
 *
 * A send writes in six places across two bounded contexts: the version's state
 * and send facts, the prior version's supersession, `quotations.current_version_
 * id`, `custom_requests.current_quotation_id`, the `custom_request_transitions`
 * row and the `outbox_events` row. `APP6-B03` §5 is that none of them can
 * survive alone, so the proof has to inject a failure **after** the earlier
 * writes have happened rather than before them.
 *
 * The injection point is the outbox append, deliberately: by then the version is
 * frozen, both pointers are advanced, the request has moved and the audit row is
 * written. It is the last write in the transaction, so it is the only one whose
 * failure can leave every other write already performed and waiting for a commit
 * that never comes. Nothing else is substituted — the repositories, the
 * transaction manager and the audit repository are the production ones.
 *
 * A compensation workflow would pass a weaker version of these assertions by
 * undoing the writes afterwards. There is none, and there must not be: this
 * transaction is atomic by architecture (`APP6-G01` §4), so the rollback is
 * PostgreSQL's and the test observes the rows, never a compensating path.
 */
import type { OutboxEventStore } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import { createSendTestContext, type SendTestContext } from './quotation-send-context';
import type { CustomRequestId } from '../../../order/domain/repositories/custom-request.repository';
import type {
  QuotationId,
  QuotationVersionId,
} from '../../domain/repositories/quotation.repository';

/** The failure injected after every other write in the transaction. */
const INJECTED = 'injected outbox failure';

/**
 * An outbox store that refuses to append.
 *
 * The only substituted collaborator in this suite, and it substitutes exactly
 * one method: everything the transaction did before reaching it ran through
 * production code.
 */
const failingOutbox = {
  append: (): Promise<bigint> => Promise.reject(new Error(INJECTED)),
} as unknown as OutboxEventStore;

describe('APP6-B03 send atomicity (integration)', () => {
  let harness: SendTestContext;

  beforeAll(async () => {
    harness = await createSendTestContext('app6-b03-atomicity');
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await harness.publishValidity({ validityDays: 7 });
  });

  async function seedSendable(status = 'UNDER_REVIEW'): Promise<{
    requestId: CustomRequestId;
    quotationId: QuotationId;
    versionId: QuotationVersionId;
  }> {
    const requestId = await harness.seedRequest(status);
    const quotationId = await harness.seedQuotation(requestId);
    const versionId = await harness.addDraft(quotationId, 150_000);
    return { requestId, quotationId, versionId };
  }

  function send(quotationId: QuotationId, versionId: QuotationVersionId) {
    return harness.asAdmin(() => harness.sender().send({ quotationId, versionId }));
  }

  function sendFailing(quotationId: QuotationId, versionId: QuotationVersionId) {
    return harness.asAdmin(() =>
      harness.senderWith(failingOutbox).send({ quotationId, versionId }),
    );
  }

  /** Every fact the send would have written, read straight from the rows. */
  async function stateOf(requestId: CustomRequestId, versionId: QuotationVersionId) {
    const [version] = await harness.rows<{
      status: string;
      sent_at: unknown;
      valid_from: unknown;
      valid_until: unknown;
    }>(sql`select status, sent_at, valid_from, valid_until
             from quotation_versions where id = ${versionId}`);
    const [request] = await harness.rows<{ status: string; current_quotation_id: string | null }>(
      sql`select status, current_quotation_id from custom_requests where id = ${requestId}`,
    );
    const [quotation] = await harness.rows<{ status: string; current_version_id: string | null }>(
      sql`select q.status, q.current_version_id from quotations q
           where q.custom_request_id = ${requestId}`,
    );
    return {
      versionStatus: version!.status,
      sentAt: version!.sent_at,
      validFrom: version!.valid_from,
      validUntil: version!.valid_until,
      requestStatus: request!.status,
      requestPointer: request!.current_quotation_id,
      quotationStatus: quotation!.status,
      quotationPointer: quotation!.current_version_id,
      transitions: await harness.count(
        sql`select count(*)::text as count from custom_request_transitions
             where custom_request_id = ${requestId}`,
      ),
      audits: await harness.count(sql`select count(*)::text as count from audit_events`),
      events: await harness.count(sql`select count(*)::text as count from outbox_events`),
    };
  }

  it('rolls back every write when the last one in the transaction fails', async () => {
    const { requestId, quotationId, versionId } = await seedSendable();
    const before = await stateOf(requestId, versionId);

    await expect(sendFailing(quotationId, versionId)).rejects.toThrow(INJECTED);

    // Identical to the state before the attempt, field for field. The version is
    // still a `DRAFT` with no send facts, neither pointer moved, the request
    // never reached `QUOTED`, and neither the audit row nor the event exists —
    // even though the audit row had already been written when the failure hit.
    expect(await stateOf(requestId, versionId)).toEqual(before);
    expect(before).toEqual({
      versionStatus: 'DRAFT',
      sentAt: null,
      validFrom: null,
      validUntil: null,
      requestStatus: 'UNDER_REVIEW',
      requestPointer: null,
      quotationStatus: 'DRAFT',
      quotationPointer: null,
      transitions: 0,
      audits: 0,
      events: 0,
    });
  });

  it('rolls back a supersession, so the previous live price is untouched', async () => {
    const { requestId, quotationId, versionId: first } = await seedSendable();
    await send(quotationId, first);
    const second = await harness.addDraft(quotationId, 170_000);
    const before = await stateOf(requestId, first);

    await expect(sendFailing(quotationId, second)).rejects.toThrow(INJECTED);

    // Version 1 is still `SENT`, still the current version, with the send facts
    // and the window the customer was actually told about.
    expect(await stateOf(requestId, first)).toEqual(before);
    expect(before.versionStatus).toBe('SENT');
    expect(before.quotationPointer).toBe(first);
    expect((await stateOf(requestId, second)).versionStatus).toBe('DRAFT');
  });

  it('leaves the send available after a rolled-back attempt', async () => {
    const { requestId, quotationId, versionId } = await seedSendable();
    await expect(sendFailing(quotationId, versionId)).rejects.toThrow(INJECTED);

    // The rollback left no half-state to trip over: the same command, on the
    // real outbox, succeeds. A partially applied attempt would have failed here
    // with `QUOTATION_VERSION_NOT_SENDABLE` instead.
    const view = await send(quotationId, versionId);

    expect(view.version.status).toBe('SENT');
    expect(view.requestTransitioned).toBe(true);
    expect(await stateOf(requestId, versionId)).toEqual(
      expect.objectContaining({
        versionStatus: 'SENT',
        requestStatus: 'QUOTED',
        requestPointer: (
          await harness.rows<{ id: string }>(sql`select id from quotations limit 1`)
        )[0]!.id,
        quotationPointer: versionId,
        transitions: 1,
        audits: 1,
        events: 1,
      }),
    );
  });
});
