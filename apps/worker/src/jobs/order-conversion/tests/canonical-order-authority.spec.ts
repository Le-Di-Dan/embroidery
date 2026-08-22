/**
 * The structural guard against the defect `APP7-W01-C1` removed
 * (`APP7-W01-C1` §12).
 *
 * `APP7-W01` re-implemented GRD-009, the Order aggregate writes and the
 * canonical `order.created` append inside the worker, because the worker may not
 * import `apps/api`. Every behavioural suite passed — which is exactly why this
 * file exists. A second implementation of a chain check does not fail a test; it
 * fails years later, when one copy is corrected and the other is not, and an
 * order pairs one customer's approved artwork with another's accepted price
 * while every foreign key stays satisfied (INV-19).
 *
 * So the recurrence guard is structural, not behavioural, and deliberately
 * small: identity checks plus a narrow source-boundary scan over this one
 * capability. It is not an architecture linter and must not grow into one.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  DrizzleOrderRepository,
  OrderChainGuard,
  ORDER_REPOSITORY,
  PAYMENT_OBLIGATION_REPOSITORY,
} from '@embroidery/persistence';

// The API's delivered contract module. Imported here **as a test** — the
// production worker never does this — purely to prove the two applications name
// the same objects rather than two lookalikes.
import { ORDER_REPOSITORY as API_ORDER_REPOSITORY } from '../../../../../api/src/modules/order/domain/repositories/order.repository';
import { PAYMENT_OBLIGATION_REPOSITORY as API_PAYMENT_OBLIGATION_REPOSITORY } from '../../../../../api/src/modules/payment/domain/repositories/payment-obligation.repository';

const CAPABILITY_ROOT = join(__dirname, '..');

/** Production source only: `tests/` holds fixtures that legitimately seed rows. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return entry === 'tests' ? [] : sourceFiles(path);
    }
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

/**
 * Comments are stripped before scanning.
 *
 * The rule is about what the code *does*, and several files here explain the
 * correction by naming exactly what they no longer do — prose that must not
 * count as a violation of itself.
 */
function strippedOfComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const PRODUCTION_SOURCES = sourceFiles(CAPABILITY_ROOT).map((path) => ({
  path,
  text: strippedOfComments(readFileSync(path, 'utf8')),
}));

describe('canonical Order authority has exactly one implementation', () => {
  it('resolves the same injection tokens in the API and the worker', () => {
    // A Symbol is only equal to itself. If the API's contract file had kept its
    // own `Symbol('ORDER_REPOSITORY')`, these would be two tokens, two provider
    // bindings and — eventually — two implementations behind them.
    expect(ORDER_REPOSITORY).toBe(API_ORDER_REPOSITORY);
    expect(PAYMENT_OBLIGATION_REPOSITORY).toBe(API_PAYMENT_OBLIGATION_REPOSITORY);
  });

  it('publishes the canonical Order classes from the shared package', () => {
    expect(typeof OrderChainGuard).toBe('function');
    expect(typeof DrizzleOrderRepository).toBe('function');
  });

  it('has no worker-local chain guard', () => {
    const guards = PRODUCTION_SOURCES.filter(
      (file) => /class\s+\w*OrderChainGuard\b/.test(file.text) || file.path.includes('chain.guard'),
    );

    expect(guards.map((file) => file.path)).toEqual([]);
  });

  it('decides no part of the chain itself', () => {
    // GRD-009's two distinctive outputs, neither of which the worker may
    // produce: the refusal that says a quotation was raised for a different
    // request, and the customer identity the guard returns from the verified
    // chain. Reading either here would mean the chain was being re-decided —
    // which is precisely what `APP7-W01` did.
    const offenders = PRODUCTION_SOURCES.filter(
      (file) =>
        file.text.includes('QUOTATION_BELONGS_TO_ANOTHER_REQUEST') ||
        /approval_snapshots[\s\S]{0,300}\bcustomer_id\b/i.test(file.text),
    );

    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it('writes no canonical Order, OrderItem or obligation row', () => {
    const writes = PRODUCTION_SOURCES.filter((file) =>
      /INSERT\s+INTO\s+(orders|order_items|payment_obligations)\b/i.test(file.text),
    );

    expect(writes.map((file) => file.path)).toEqual([]);
  });

  it('appends no second order.created', () => {
    // `OrderRepository.createFromAcceptedQuotation` is the one producer
    // (SE-006 / G-DB7-54). A worker file naming the event type is either a
    // second writer or a comment; the assertion below is on the append.
    const producers = PRODUCTION_SOURCES.filter((file) =>
      /eventType:\s*'order\.created'/.test(file.text),
    );

    expect(producers.map((file) => file.path)).toEqual([]);
  });

  it('imports nothing from another application', () => {
    const appToApp = PRODUCTION_SOURCES.filter((file) => /from\s+'[^']*apps\/api/.test(file.text));

    expect(appToApp.map((file) => file.path)).toEqual([]);
  });
});
