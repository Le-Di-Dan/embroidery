/**
 * The policy loader's recovery behaviour (`APP12-H03-C1` §4, §5, §6).
 *
 * The defect this suite pins is a race a single-node cluster loses routinely:
 * the policy is published by the `staff-bootstrap` Job and the worker is a
 * Deployment, Kubernetes starts them concurrently, and a worker that read once
 * at bootstrap stayed idle for the life of the pod when it read first.
 *
 * Both halves are asserted, because only one of them is the fix and the other is
 * the thing the fix must not break:
 *
 * - an unconfigured worker adopts the policy as soon as it appears, with no
 *   restart and no manual mutation of the running process;
 * - a configured worker never re-reads, so no job can hold a lease measured
 *   against a policy the service has since replaced.
 */
import { Logger } from '@nestjs/common';
import type { PolicyConfigurationRepository } from '@embroidery/persistence';

import { WorkerPolicyService } from './worker-policy.service';

/** A policy whose four relations all hold. */
const VALID = {
  concurrency: 4,
  batchSize: 10,
  pollIntervalMs: 1_000,
  leaseDurationMs: 60_000,
  handlerTimeoutMs: 30_000,
  leaseSafetyMarginMs: 5_000,
  shutdownGraceMs: 10_000,
  maxAttempts: 5,
  backoffBaseMs: 1_000,
  backoffMaxMs: 60_000,
};

type CurrentValue = Awaited<ReturnType<PolicyConfigurationRepository['currentValue']>>;

/** A repository double whose stored value the test moves under the service. */
function repositoryOf(reads: readonly (CurrentValue | Error)[]): {
  readonly repository: PolicyConfigurationRepository;
  readonly calls: () => number;
} {
  let call = 0;
  const repository = {
    currentValue: (): Promise<CurrentValue> => {
      const read = reads[Math.min(call, reads.length - 1)];
      call += 1;
      return read instanceof Error ? Promise.reject(read) : Promise.resolve(read);
    },
  } as unknown as PolicyConfigurationRepository;

  return { repository, calls: () => call };
}

function version(value: unknown): CurrentValue {
  return { version: 1, value, valueSchemaVersion: 1 } as unknown as CurrentValue;
}

describe('WorkerPolicyService', () => {
  beforeEach(() => {
    // The service logs one error per distinct problem; the lines themselves are
    // asserted nowhere, but they must not reach the suite output.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports WORKER_POLICY_MISSING and holds no policy when nothing is published', async () => {
    const { repository } = repositoryOf([undefined]);
    const service = new WorkerPolicyService(repository);

    await service.load();

    expect(service.current()).toBeUndefined();
    expect(service.currentProblem()).toEqual({ kind: 'WORKER_POLICY_MISSING' });
  });

  it('adopts a policy published after startup, with no restart', async () => {
    // The cold-deploy race, in miniature: the first read finds nothing because
    // the bootstrap Job has not finished, the second finds the policy it wrote.
    const { repository } = repositoryOf([undefined, version(VALID)]);
    const service = new WorkerPolicyService(repository);

    await service.load();
    expect(service.current()).toBeUndefined();

    await service.reloadWhileUnconfigured();

    expect(service.current()).toEqual(VALID);
    expect(service.currentProblem()).toBeUndefined();
  });

  it('recovers from an invalid policy being corrected, not only from a missing one', async () => {
    const { repository } = repositoryOf([version({ concurrency: 0 }), version(VALID)]);
    const service = new WorkerPolicyService(repository);

    await service.load();
    expect(service.currentProblem()?.kind).toBe('WORKER_POLICY_INVALID');

    await service.reloadWhileUnconfigured();

    expect(service.current()).toEqual(VALID);
  });

  it('never re-reads once a valid policy is held', async () => {
    // The APP2-I02 rule the correction must not weaken: a running fleet's lease
    // duration cannot change under jobs already leased against it.
    const { repository, calls } = repositoryOf([version(VALID)]);
    const service = new WorkerPolicyService(repository);

    await service.load();
    await service.reloadWhileUnconfigured();
    await service.reloadWhileUnconfigured();

    expect(calls()).toBe(1);
    expect(service.current()).toEqual(VALID);
  });

  it('survives a failed read and keeps claiming nothing', async () => {
    // The window between the worker starting and its database becoming
    // reachable. This runs on the poll loop, so a throw here would become an
    // unhandled rejection in the loop that exists to survive this state.
    const { repository } = repositoryOf([undefined, new Error('connection refused')]);
    const service = new WorkerPolicyService(repository);

    await service.load();

    await expect(service.reloadWhileUnconfigured()).resolves.toBeUndefined();
    expect(service.current()).toBeUndefined();
  });
});
