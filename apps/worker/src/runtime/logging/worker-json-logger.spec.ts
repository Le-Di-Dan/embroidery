/**
 * The worker's structured log sink (`APP12-H03` §12, §13).
 *
 * The properties under test are the two a Loki query depends on: **every** line
 * is one parseable JSON object, and a job-fields line is merged so
 * `| json | jobKind = "…"` matches — while anything that is *not* the worker's
 * own allow-listed projection stays a string and cannot smuggle a payload into
 * the record's top level.
 */
import { WorkerJsonLogger } from './worker-json-logger';

/**
 * Returns the single record the run produced.
 *
 * A named accessor rather than array destructuring: `noUncheckedIndexedAccess`
 * types `records[0]` as possibly `undefined`, and asserting the count here
 * makes "exactly one line was written" part of every test that uses it.
 */
function captureOne(run: (logger: WorkerJsonLogger) => void): Record<string, unknown> {
  const records = capture(run);
  expect(records).toHaveLength(1);
  const record = records[0];
  if (record === undefined) {
    throw new Error('unreachable: the length assertion above already failed');
  }
  return record;
}

function capture(run: (logger: WorkerJsonLogger) => void): Record<string, unknown>[] {
  const written: string[] = [];
  const stdout = jest
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    });
  const stderr = jest
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    });
  try {
    run(new WorkerJsonLogger());
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
  }
  return written
    .join('')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('WorkerJsonLogger', () => {
  it('writes one parseable JSON object per line', () => {
    const records = capture((logger) => {
      logger.log('Worker runtime started', 'JobPollRuntimeService');
      logger.warn('something to watch');
      logger.error('Worker runtime policy is not configured', 'WorkerPolicyService');
    });

    expect(records).toHaveLength(3);
    for (const record of records) {
      expect(record['schemaVersion']).toBe(1);
      expect(record['service']).toBe('worker');
      expect(typeof record['timestamp']).toBe('string');
    }
    expect(records[0]).toMatchObject({ level: 'info', context: 'JobPollRuntimeService' });
    expect(records[1]).toMatchObject({ level: 'warn' });
    expect(records[2]).toMatchObject({ level: 'error', context: 'WorkerPolicyService' });
  });

  it('merges the job-fields projection so a log query can select on it', () => {
    const record = captureOne((logger) => {
      logger.log(
        JSON.stringify({
          correlationId: 'NOTIFICATION_DELIVERY:8:1',
          jobKind: 'NOTIFICATION_DELIVERY',
          jobKey: '8',
          attemptNo: 1,
          workerInstanceId: 'worker:pod:1:uuid',
          eventType: 'notification.delivery.requested',
          outcome: 'SUCCEEDED',
          durationMs: 12,
        }),
        'JobExecutionService',
      );
    });

    expect(record).toMatchObject({
      event: 'worker.job.completed',
      jobKind: 'NOTIFICATION_DELIVERY',
      jobKey: '8',
      attemptNo: 1,
      outcome: 'SUCCEEDED',
      correlationId: 'NOTIFICATION_DELIVERY:8:1',
    });
  });

  it('refuses to merge JSON that is not the worker projection', () => {
    // A caller logging an arbitrary object must not have its keys promoted to
    // the record's top level: that is precisely how a payload reaches a log.
    const record = captureOne((logger) => {
      logger.log(JSON.stringify({ recipientPhone: '+84901234567', secret: 'abc' }));
    });

    expect(record['recipientPhone']).toBeUndefined();
    expect(record['secret']).toBeUndefined();
    expect(record['event']).toBe('application.log');
    expect(record['message']).toContain('recipientPhone');
  });

  it('never serialises a non-string message object into the line', () => {
    const record = captureOne((logger) => {
      logger.log({ payload: { recipientPhone: '+84901234567' } });
    });

    expect(JSON.stringify(record)).not.toContain('84901234567');
    expect(record['message']).toBe('[object]');
  });

  it('drops the stack Nest passes to error()', () => {
    const record = captureOne((logger) => {
      logger.error('boom', 'Error: boom\n    at somewhere', 'SomeContext');
    });

    expect(record['context']).toBe('SomeContext');
    expect(JSON.stringify(record)).not.toContain('at somewhere');
  });

  it('truncates an over-long message', () => {
    const record = captureOne((logger) => {
      logger.log('x'.repeat(5_000));
    });

    expect(String(record['message'])).toHaveLength(2_000);
  });
});
