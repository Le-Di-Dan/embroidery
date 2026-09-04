import {
  loadWorkerRuntimePolicyDataset,
  WORKER_RUNTIME_POLICY_DATASET_KEY,
} from '@embroidery/database';

import { WORKER_RUNTIME_POLICY_KEY, parseWorkerRuntimePolicy } from './worker-runtime-policy';

/** A policy whose four relations all hold, used as the base for each case. */
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

function reasonsOf(value: unknown): readonly string[] {
  const result = parseWorkerRuntimePolicy(value);
  if (result.ok) {
    throw new Error('Expected the policy to be rejected.');
  }
  return result.problem.kind === 'WORKER_POLICY_INVALID' ? result.problem.reasons : [];
}

/** Overrides applied on top of a valid policy. */
function reasonsFor(overrides: Record<string, unknown>): readonly string[] {
  return reasonsOf({ ...VALID, ...overrides });
}

describe('worker runtime policy', () => {
  it('names the canonical configuration key', () => {
    expect(WORKER_RUNTIME_POLICY_KEY).toBe('worker.runtime');
  });

  /**
   * The assertion that makes `APP12-H03-C1` real rather than plausible.
   *
   * The dataset the bootstrap publishes and the validator the worker enforces
   * live in different packages and neither imports the other — deliberately, so
   * that the value source cannot become a second validator. This is the seam
   * that proves they agree: if the shipped values ever violated one of the four
   * relations, every deployed worker would log `WORKER_POLICY_INVALID` and claim
   * nothing, and the only place to find out before production is here.
   */
  it('validates the values the deployment bootstrap actually publishes', () => {
    const dataset = loadWorkerRuntimePolicyDataset(
      require.resolve('@embroidery/database/package.json'),
    );
    const [configuration] = dataset.configurations;

    expect(configuration?.configKey).toBe(WORKER_RUNTIME_POLICY_KEY);
    expect(WORKER_RUNTIME_POLICY_DATASET_KEY).toBe(WORKER_RUNTIME_POLICY_KEY);
    expect(parseWorkerRuntimePolicy(configuration?.value).ok).toBe(true);
  });

  it('accepts a policy whose values and relations all hold', () => {
    const result = parseWorkerRuntimePolicy(VALID);

    expect(result.ok).toBe(true);
    expect(result.ok && result.policy).toEqual(VALID);
  });

  it.each([null, 'worker.runtime', 42, [], undefined])(
    'rejects a non-object value (%p)',
    (value) => {
      const result = parseWorkerRuntimePolicy(value);

      expect(result.ok).toBe(false);
      expect(result.ok || result.problem.kind).toBe('WORKER_POLICY_INVALID');
    },
  );

  it.each([
    'concurrency',
    'batchSize',
    'pollIntervalMs',
    'leaseDurationMs',
    'handlerTimeoutMs',
    'leaseSafetyMarginMs',
    'shutdownGraceMs',
    'maxAttempts',
    'backoffBaseMs',
    'backoffMaxMs',
  ])('requires %s to be present', (field) => {
    const value: Record<string, unknown> = { ...VALID };
    delete value[field];

    expect(reasonsOf(value).join(' ')).toContain(field);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '5'])(
    'rejects %p as a policy integer',
    (bad) => {
      expect(reasonsFor({ concurrency: bad })).not.toEqual([]);
    },
  );

  it('reports every invalid field at once rather than the first', () => {
    const reasons = reasonsFor({ concurrency: 0, batchSize: -3 });

    expect(reasons).toHaveLength(2);
  });

  it('rejects a backoff base above the cap', () => {
    expect(reasonsFor({ backoffBaseMs: 90_000 }).join(' ')).toContain(
      'backoffBaseMs must not exceed backoffMaxMs',
    );
  });

  it('rejects a handler timeout that can outlive its own lease', () => {
    // 55_000 + 5_000 margin == 60_000 lease is the boundary and is allowed;
    // one millisecond more is not.
    expect(parseWorkerRuntimePolicy({ ...VALID, handlerTimeoutMs: 55_000 }).ok).toBe(true);
    expect(reasonsFor({ handlerTimeoutMs: 55_001 }).join(' ')).toContain('leaseDurationMs');
  });

  it('rejects a shutdown grace longer than the handler timeout', () => {
    expect(reasonsFor({ shutdownGraceMs: 30_001 }).join(' ')).toContain('shutdownGraceMs');
  });

  it('rejects a poll interval that is not shorter than the lease', () => {
    expect(reasonsFor({ pollIntervalMs: 60_000 }).join(' ')).toContain('pollIntervalMs');
  });

  it('rejects a value beyond the sanity bound', () => {
    expect(reasonsFor({ leaseDurationMs: 24 * 60 * 60 * 1_000 + 1 }).join(' ')).toContain(
      'sanity bound',
    );
  });
});
