/**
 * The `notification.delivery` policy contract (`APP4-W01` §17, §25).
 *
 * `APP4-B01-C1` owns publication and it is closed; nothing here republishes or
 * re-tests it. What is proven is the consumer half: the published shape is
 * accepted, everything else fails closed, and the delays the runtime uses come
 * from the value rather than from this module.
 *
 * The last test is the one that matters most and is the easiest to lose: the
 * production source of this capability contains no fallback constant. A default
 * added "just for local development" would silently win in exactly the
 * situation the fail-closed path exists for.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  NOTIFICATION_DELIVERY_POLICY_KEY,
  parseNotificationDeliveryPolicy,
  retryDelayMsFor,
} from './notification-delivery-policy';

const PUBLISHED = { maxAttempts: 3, retryDelaysSeconds: [60, 300] };

describe('parseNotificationDeliveryPolicy', () => {
  it('accepts the published APP4-G01 value', () => {
    const result = parseNotificationDeliveryPolicy(PUBLISHED);

    expect(result).toEqual({ ok: true, policy: PUBLISHED });
  });

  it('names the key the worker reads', () => {
    expect(NOTIFICATION_DELIVERY_POLICY_KEY).toBe('notification.delivery');
  });

  it.each([
    ['not an object', 42],
    ['null', null],
    ['an array', [60, 300]],
    ['a missing budget', { retryDelaysSeconds: [60, 300] }],
    ['a missing schedule', { maxAttempts: 3 }],
    ['a fractional budget', { maxAttempts: 2.5, retryDelaysSeconds: [60] }],
    ['a zero budget', { maxAttempts: 0, retryDelaysSeconds: [] }],
    ['a negative delay', { maxAttempts: 2, retryDelaysSeconds: [-60] }],
    ['a non-numeric delay', { maxAttempts: 2, retryDelaysSeconds: ['60'] }],
  ])('fails closed on %s', (_label, value) => {
    const result = parseNotificationDeliveryPolicy(value);

    expect(result.ok).toBe(false);
  });

  it('rejects a schedule that disagrees with the budget', () => {
    // Three attempts need exactly two delays. One means the runtime would ask
    // for a delay that does not exist; three means the operator believes in a
    // fourth attempt the budget forbids.
    for (const delays of [[60], [60, 300, 900]]) {
      const result = parseNotificationDeliveryPolicy({
        maxAttempts: 3,
        retryDelaysSeconds: delays,
      });

      expect(result.ok).toBe(false);
    }
  });

  it('reports reasons that name fields, never the stored value', () => {
    const result = parseNotificationDeliveryPolicy({
      maxAttempts: 'three',
      retryDelaysSeconds: [60, 300],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const reasons =
      result.problem.kind === 'NOTIFICATION_POLICY_INVALID' ? result.problem.reasons : [];
    expect(reasons.join(' ')).toContain('maxAttempts');
    expect(reasons.join(' ')).not.toContain('three');
  });
});

describe('retryDelayMsFor', () => {
  it('reads the schedule positionally', () => {
    const result = parseNotificationDeliveryPolicy(PUBLISHED);
    if (!result.ok) throw new Error('fixture policy did not parse');

    expect(retryDelayMsFor(result.policy, 1)).toBe(60_000);
    expect(retryDelayMsFor(result.policy, 2)).toBe(300_000);
  });

  it('throws past the schedule rather than reusing the last delay', () => {
    const result = parseNotificationDeliveryPolicy(PUBLISHED);
    if (!result.ok) throw new Error('fixture policy did not parse');

    expect(() => retryDelayMsFor(result.policy, 3)).toThrow(RangeError);
  });
});

describe('the capability source', () => {
  it('carries no fallback retry constant', () => {
    const root = join(__dirname, '..');
    const offenders: string[] = [];

    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'tests') walk(full);
          continue;
        }
        if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) continue;
        // Comments are stripped: this very file's siblings explain the locked
        // values in prose, and a gate that fails on its own explanation is a
        // gate that gets deleted.
        const source = readFileSync(full, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[^:])\/\/.*$/gm, '$1');
        if (/\b(?:60_000|300_000|\[\s*60\s*,\s*300\s*\])\b/.test(source)) {
          offenders.push(entry.name);
        }
        if (/maxAttempts\s*[:=]\s*\d/.test(source)) {
          offenders.push(entry.name);
        }
      }
    };
    walk(root);

    expect(offenders).toEqual([]);
  });
});
