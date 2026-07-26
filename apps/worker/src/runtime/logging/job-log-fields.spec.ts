import { jobCorrelation } from '../context/job-correlation';
import type { JobCorrelationContext } from '../context/job-correlation';
import { formatJobLogLine, projectJobLogFields } from './job-log-fields';

const CONTEXT: JobCorrelationContext = {
  correlationId: 'OUTBOX_DISPATCH:9:2',
  outboxEventId: 9n,
  attemptNo: 2,
  workerInstanceId: 'worker:host:1:uuid',
  eventType: 'app2.i02.synthetic.alpha',
  jobKind: 'OUTBOX_DISPATCH',
};

describe('job log projection', () => {
  it('emits exactly the allowed fields', () => {
    const fields = projectJobLogFields(CONTEXT);

    expect(Object.keys(fields).sort()).toEqual([
      'attemptNo',
      'correlationId',
      'eventType',
      'jobKey',
      'jobKind',
      'workerInstanceId',
    ]);
  });

  it('adds outcome, error class and duration only when supplied', () => {
    const fields = projectJobLogFields(CONTEXT, {
      outcome: 'FAILED_RETRYABLE',
      errorClass: 'JOB_TRANSIENT_FAILURE',
      durationMs: 120,
    });

    expect(fields.outcome).toBe('FAILED_RETRYABLE');
    expect(fields.errorClass).toBe('JOB_TRANSIENT_FAILURE');
    expect(fields.durationMs).toBe(120);
  });

  it('serialises the bigint job key as text', () => {
    expect(projectJobLogFields(CONTEXT).jobKey).toBe('9');
    // JSON.stringify throws on a raw bigint, so this is not cosmetic.
    expect(() => formatJobLogLine(projectJobLogFields(CONTEXT))).not.toThrow();
  });

  it('cannot leak a payload, a secret or a request id', () => {
    const polluted = {
      ...CONTEXT,
      payload: { card: '4111111111111111' },
      cookie: 'session=abc',
      'x-request-id': 'req-1',
      stack: 'Error: at ...',
    } as unknown as JobCorrelationContext;

    const line = formatJobLogLine(projectJobLogFields(polluted));

    // The projection is an allow-list, so extra keys on the context object
    // simply do not appear — no redaction rule has to anticipate them.
    expect(line).not.toContain('4111111111111111');
    expect(line).not.toContain('session=abc');
    expect(line.toLowerCase()).not.toContain('request-id');
    expect(line).not.toContain('stack');
  });

  it('is readable from inside a bound correlation scope', () => {
    const seen = jobCorrelation.run(CONTEXT, () => jobCorrelation.current());

    expect(seen).toEqual(CONTEXT);
    expect(jobCorrelation.current()).toBeUndefined();
  });

  it('keeps concurrent attempts from seeing each other context', async () => {
    const other: JobCorrelationContext = { ...CONTEXT, correlationId: 'OTHER', outboxEventId: 10n };

    const [first, second] = await Promise.all([
      jobCorrelation.run(CONTEXT, async () => {
        await Promise.resolve();
        return jobCorrelation.current()?.correlationId;
      }),
      jobCorrelation.run(other, async () => {
        await Promise.resolve();
        return jobCorrelation.current()?.correlationId;
      }),
    ]);

    expect(first).toBe('OUTBOX_DISPATCH:9:2');
    expect(second).toBe('OTHER');
  });
});
