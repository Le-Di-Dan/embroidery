/**
 * The `order.created` acknowledgement, proved without a database
 * (`APP12-H03-C1` §10, §11).
 *
 * Two properties matter and neither needs PostgreSQL: it accepts **both**
 * producers' payload shapes — a handler that refused either would replace a
 * permanently pending row with a permanent dead-letter row — and it performs no
 * work, which is the whole reason it is allowed to exist.
 */
import { OrderCreatedAcknowledgementHandler } from './order-created-acknowledgement.handler';
import {
  deriveAcknowledgementEffectKey,
  ORDER_AGGREGATE_KIND,
  ORDER_CREATED_EVENT_TYPE,
  ORDER_CREATED_PAYLOAD_VERSION,
  parseOrderCreatedPayload,
} from './domain/order-created.payload';
import { AcknowledgementRefusalError } from './domain/order-created.errors';
import type { JobExecutionContext } from '../../runtime/registry/job-handler';

/** Byte-for-byte what `DrizzleReadyMadeOrderRepository` appends. */
const READY_MADE_PAYLOAD = { orderId: 'order-1', code: 'RM-0001', origin: 'READY_MADE' };

/** Byte-for-byte what `DrizzleOrderRepository` appends. */
const CUSTOM_PAYLOAD = { orderId: 'order-1', code: 'OD-0001', customRequestId: 'request-1' };

function context(overrides: Partial<JobExecutionContext> = {}): JobExecutionContext {
  return {
    outboxEventId: 1n,
    aggregateKind: ORDER_AGGREGATE_KIND,
    aggregateId: 'order-1',
    attemptNo: 1,
    workerInstanceId: 'worker:test',
    correlationId: 'correlation-1',
    effectKey: deriveAcknowledgementEffectKey({ orderId: 'order-1' }),
    ...overrides,
  };
}

describe('the accepted SE-006 contract', () => {
  it('names the delivered event type, version and aggregate', () => {
    const handler = new OrderCreatedAcknowledgementHandler();

    expect(handler.eventType).toBe(ORDER_CREATED_EVENT_TYPE);
    expect(ORDER_CREATED_EVENT_TYPE).toBe('order.created');
    expect(handler.payloadSchemaVersion).toBe(ORDER_CREATED_PAYLOAD_VERSION);
    expect(ORDER_AGGREGATE_KIND).toBe('ORDER');
  });

  it('files its attempts under the transport kind, not under ORDER_CREATION', () => {
    // `ORDER_CREATION` is `APP7-W01`'s, which really does create orders. Rows
    // that did nothing must not appear in an operator's order-creation
    // dead-letter query.
    expect(new OrderCreatedAcknowledgementHandler().jobKind).toBe('OUTBOX_DISPATCH');
  });

  it.each([
    ['the Ready-Made producer', READY_MADE_PAYLOAD],
    ['the custom producer', CUSTOM_PAYLOAD],
  ])('accepts %s payload and reads only the two shared fields', (_label, payload) => {
    expect(parseOrderCreatedPayload(payload)).toEqual({
      valid: true,
      payload: { orderId: 'order-1', code: payload.code },
    });
  });

  it.each([
    ['not an object', 'order.created'],
    ['null', null],
    ['a missing order id', { code: 'RM-0001' }],
    ['a blank order id', { orderId: '', code: 'RM-0001' }],
    ['a missing code', { orderId: 'order-1' }],
    ['a blank code', { orderId: 'order-1', code: '' }],
  ])('refuses %s as an invalid payload', (_label, payload) => {
    expect(parseOrderCreatedPayload(payload)).toEqual({
      valid: false,
      errorClass: 'JOB_PAYLOAD_INVALID',
    });
  });
});

describe('the acknowledgement', () => {
  it('succeeds without performing any work', async () => {
    const handler = new OrderCreatedAcknowledgementHandler();

    await expect(
      handler.execute({ orderId: 'order-1', code: 'RM-0001' }, context()),
    ).resolves.toBeUndefined();
  });

  it('refuses terminally when the linkage and the payload name different orders', async () => {
    // Settling this row would settle a producer defect, and the permanently
    // pending row was at least evidence of it.
    const handler = new OrderCreatedAcknowledgementHandler();

    await expect(
      handler.execute(
        { orderId: 'order-1', code: 'RM-0001' },
        context({ aggregateId: 'order-2' }),
      ),
    ).rejects.toThrow(AcknowledgementRefusalError);
  });

  it('refuses terminally when the aggregate kind is not ORDER', async () => {
    const handler = new OrderCreatedAcknowledgementHandler();

    await expect(
      handler.execute(
        { orderId: 'order-1', code: 'RM-0001' },
        context({ aggregateKind: 'PAYMENT_ATTEMPT' }),
      ),
    ).rejects.toMatchObject({ errorClass: 'JOB_INVARIANT_VIOLATION' });
  });
});

describe('the effect key', () => {
  it('is the order, so a redelivery is the same job rather than new work', () => {
    expect(deriveAcknowledgementEffectKey({ orderId: 'order-1' })).toBe(
      deriveAcknowledgementEffectKey({ orderId: 'order-1' }),
    );
  });

  it('separates two orders', () => {
    expect(deriveAcknowledgementEffectKey({ orderId: 'order-1' })).not.toBe(
      deriveAcknowledgementEffectKey({ orderId: 'order-2' }),
    );
  });

  it('does not collide with the reservation namespace', () => {
    expect(deriveAcknowledgementEffectKey({ orderId: 'order-1' })).toContain('order-created-ack:');
  });
});
