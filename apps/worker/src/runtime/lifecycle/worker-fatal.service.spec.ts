import { hardStopWaitMs } from '../execution/job-execution.service';
import type { JobLogFields } from '../logging/job-log-fields';
import { WorkerFatalService } from './worker-fatal.service';
import { FATAL_EXIT_SAFETY_MS } from './worker-process';

const FIELDS: JobLogFields = {
  correlationId: 'OUTBOX_DISPATCH:7:1',
  jobKind: 'OUTBOX_DISPATCH',
  jobKey: '7',
  attemptNo: 1,
  workerInstanceId: 'worker:host:1:uuid',
  eventType: 'app2.i02.synthetic.alpha',
};

function serviceWith(closer?: () => Promise<void>): {
  fatal: WorkerFatalService;
  exits: number[];
} {
  const exits: number[] = [];
  const fatal = new WorkerFatalService({
    exit: (code) => {
      exits.push(code);
    },
  });
  if (closer !== undefined) {
    fatal.registerCloser(closer);
  }
  return { fatal, exits };
}

describe('worker fatal service', () => {
  it('starts healthy', () => {
    const { fatal } = serviceWith();

    expect(fatal.runtimeState).toBe('HEALTHY');
    expect(fatal.isFatal).toBe(false);
  });

  it('flips the state synchronously, before anything is awaited', () => {
    const { fatal } = serviceWith(() => new Promise<void>(() => undefined));

    void fatal.triggerUnresponsiveHandler(FIELDS);

    // The poll loop and readiness read this flag; if it only became true after
    // the close resolved, a claim could still be issued in between.
    expect(fatal.isFatal).toBe(true);
    expect(fatal.runtimeState).toBe('FATAL_HANDLER_UNRESPONSIVE');
  });

  it('closes the context before exiting, exactly once, with code 1', async () => {
    const order: string[] = [];
    const { fatal, exits } = serviceWith(() => {
      order.push('close');
      return Promise.resolve();
    });

    await fatal.triggerUnresponsiveHandler(FIELDS);
    order.push('exit');

    expect(order).toEqual(['close', 'exit']);
    expect(exits).toEqual([1]);
  });

  it('is idempotent: a second unresponsive handler adds no second exit', async () => {
    let closes = 0;
    const { fatal, exits } = serviceWith(() => {
      closes += 1;
      return Promise.resolve();
    });

    await fatal.triggerUnresponsiveHandler(FIELDS);
    await fatal.triggerUnresponsiveHandler({ ...FIELDS, jobKey: '8' });

    expect(exits).toEqual([1]);
    expect(closes).toBe(1);
  });

  it('exits even when the close hangs', async () => {
    const { fatal, exits } = serviceWith(() => new Promise<void>(() => undefined));

    // Bounded by the fatal-exit reserve: a pool that will not close must not
    // cost the lease its head start.
    await fatal.triggerUnresponsiveHandler(FIELDS);

    expect(exits).toEqual([1]);
  });

  it('exits even when the close throws', async () => {
    const { fatal, exits } = serviceWith(() => Promise.reject(new Error('pool refused')));

    await fatal.triggerUnresponsiveHandler(FIELDS);

    expect(exits).toEqual([1]);
  });

  it('logs the outcome without any field outside the allow-list', async () => {
    const lines: string[] = [];
    const { fatal } = serviceWith(() => Promise.resolve());
    const logger = (fatal as unknown as { logger: { error: (message: string) => void } }).logger;
    jest.spyOn(logger, 'error').mockImplementation((message: string) => {
      lines.push(message);
    });

    await fatal.triggerUnresponsiveHandler(FIELDS);

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      'attemptNo',
      'correlationId',
      'eventType',
      'jobKey',
      'jobKind',
      'outcome',
      'workerInstanceId',
    ]);
    expect(parsed['outcome']).toBe('FATAL_HANDLER_UNRESPONSIVE');
  });

  it('forced shutdown exits non-zero without a second exit after a fatal', () => {
    const { fatal, exits } = serviceWith(() => Promise.resolve());

    fatal.exitAfterForcedShutdown();
    fatal.exitAfterForcedShutdown();

    expect(exits).toEqual([1]);
  });
});

describe('hard-stop deadline', () => {
  const LEASE_MARGIN = 1_000;

  it('waits the safety margin while the lease is far away', () => {
    const abortAt = 10_000;
    const leaseExpiresAt = new Date(10_000 + 60_000);

    expect(hardStopWaitMs(abortAt, abortAt, leaseExpiresAt, LEASE_MARGIN)).toBe(LEASE_MARGIN);
  });

  it('subtracts time already spent waiting', () => {
    const abortAt = 10_000;
    const leaseExpiresAt = new Date(10_000 + 60_000);

    expect(hardStopWaitMs(abortAt, abortAt + 400, leaseExpiresAt, LEASE_MARGIN)).toBe(600);
  });

  it('yields to the lease when the lease is the tighter bound', () => {
    const abortAt = 10_000;
    // Only 600 ms of lease left: the margin would overrun it.
    const leaseExpiresAt = new Date(abortAt + 600);

    expect(hardStopWaitMs(abortAt, abortAt, leaseExpiresAt, LEASE_MARGIN)).toBe(
      600 - FATAL_EXIT_SAFETY_MS,
    );
  });

  it('never returns a negative wait once the lease has already gone', () => {
    const abortAt = 10_000;
    const leaseExpiresAt = new Date(abortAt - 5_000);

    // Zero, not negative: the runtime goes straight to the fatal path rather
    // than computing a wait that would sleep forever or throw.
    expect(hardStopWaitMs(abortAt, abortAt, leaseExpiresAt, LEASE_MARGIN)).toBe(0);
  });
});
