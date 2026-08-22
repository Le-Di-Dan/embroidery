/**
 * The handler's own responsibilities (`APP7-W01` §18).
 *
 * It declares what it consumes, refuses a row whose linkage contradicts its
 * payload, and classifies what comes back out of the use case. Everything the
 * conversion itself does is proved against a real database beside this.
 */
import { WorkerJobError } from '../../runtime/errors/worker-job-error';
import type { JobExecutionContext, JobHandler } from '../../runtime/registry/job-handler';
import { OrderConversionHandler } from './order-conversion.handler';
import type { ConvertApprovedDesignUseCase } from './application/convert-approved-design.usecase';
import { conversionRefusal } from './domain/order-conversion.errors';

const LOOKUP = { approvalSnapshotId: 'approval-1', customRequestId: 'request-1' };

function contextFor(overrides: Partial<JobExecutionContext> = {}): JobExecutionContext {
  return {
    outboxEventId: 42n,
    aggregateKind: 'APPROVAL_SNAPSHOT',
    aggregateId: 'approval-1',
    attemptNo: 1,
    workerInstanceId: 'worker-1',
    correlationId: 'correlation-1',
    effectKey: 'order-conversion:v1:approval-1',
    ...overrides,
  };
}

function handlerWith(convert: jest.Mock): OrderConversionHandler {
  return new OrderConversionHandler({ convert } as unknown as ConvertApprovedDesignUseCase);
}

describe('OrderConversionHandler', () => {
  it('declares the design.approved registration the registry claims on', () => {
    const handler = handlerWith(jest.fn());

    expect(handler.eventType).toBe('design.approved');
    // The domain kind, never the transport kind (IMP-D030's precedent).
    expect(handler.jobKind).toBe('ORDER_CREATION');
    expect(handler.jobKind).not.toBe('OUTBOX_DISPATCH');
    expect(handler.payloadSchemaVersion).toBe(1);
    // No published plan: the global `worker.runtime` schedule is the right one,
    // and inventing a curve would be a policy this checkpoint does not own.
    // Read through the contract, because the class declares no such member —
    // which is exactly the state being asserted.
    expect((handler as JobHandler).retryPlan).toBeUndefined();
  });

  it('converts the decoded lookup', async () => {
    const convert = jest.fn().mockResolvedValue({ id: 'order-1', code: 'ORD-23456789AB' });
    await handlerWith(convert).execute(LOOKUP, contextFor());

    expect(convert).toHaveBeenCalledWith(LOOKUP);
  });

  it('refuses a row linked to the wrong aggregate kind, terminally', async () => {
    const convert = jest.fn();
    const attempt = handlerWith(convert).execute(
      LOOKUP,
      contextFor({ aggregateKind: 'DESIGN_VERSION' }),
    );

    await expect(attempt).rejects.toMatchObject({ errorClass: 'JOB_INVARIANT_VIOLATION' });
    // Nothing was attempted: a producer defect must not reach the database.
    expect(convert).not.toHaveBeenCalled();
  });

  it('refuses a row whose linkage and payload name different approvals', async () => {
    const convert = jest.fn();
    const attempt = handlerWith(convert).execute(
      LOOKUP,
      contextFor({ aggregateId: 'approval-other' }),
    );

    await expect(attempt).rejects.toMatchObject({ errorClass: 'JOB_INVARIANT_VIOLATION' });
    expect(convert).not.toHaveBeenCalled();
  });

  it('passes a classified conversion refusal through unchanged', async () => {
    const refusal = conversionRefusal('CATALOG_SKU_AMBIGUOUS', 'Two active SKUs.');
    const attempt = handlerWith(jest.fn().mockRejectedValue(refusal)).execute(LOOKUP, contextFor());

    // Terminal, so a variant with two active SKUs reaches an operator's
    // dead-letter query instead of retrying forever (`APP7-W01` §16).
    await expect(attempt).rejects.toBe(refusal);
    expect(refusal.errorClass).toBe('JOB_INVARIANT_VIOLATION');
  });

  it('leaves an unrecognised failure unclassified rather than guessing', async () => {
    const attempt = handlerWith(
      jest.fn().mockRejectedValue(new Error('connection terminated unexpectedly')),
    ).execute(LOOKUP, contextFor());

    // Never string-matched into a class: that is how a classification silently
    // stops working after a dependency upgrade.
    await expect(attempt).rejects.toMatchObject({ errorClass: 'JOB_UNKNOWN_FAILURE' });
  });

  it('keeps a transient refusal retryable', async () => {
    const transient = new WorkerJobError('JOB_TRANSIENT_FAILURE', 'Claim held.');
    const attempt = handlerWith(jest.fn().mockRejectedValue(transient)).execute(
      LOOKUP,
      contextFor(),
    );

    await expect(attempt).rejects.toMatchObject({ errorClass: 'JOB_TRANSIENT_FAILURE' });
  });
});
