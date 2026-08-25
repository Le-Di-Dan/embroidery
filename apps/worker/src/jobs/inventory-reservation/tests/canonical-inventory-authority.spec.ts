/**
 * The inventory half of `FU-APP8-B02-03`, placed beside the capability it guards.
 *
 * `APP8-B02` put the "one canonical inventory implementation" guard in
 * `apps/api`, because that was the only application writing inventory at the
 * time, and recorded that once `APP8-W01` created the worker reservation
 * capability the "imports nothing from another application" and "writes no
 * canonical inventory row" halves belonged here too, scoped to this directory.
 * This is that file.
 *
 * The reasoning is the one `canonical-order-authority.spec.ts` states for the
 * Order aggregate: a second implementation of the availability arithmetic, the
 * `sku_stocks` anchor lock or the GRD-013 deposit gate does not fail a test. It
 * fails years later, when one copy is corrected and the other is not, and an
 * order commits stock that another order also holds while every foreign key
 * stays satisfied (INV-19).
 *
 * So the guard is structural, not behavioural, and deliberately small: token
 * identity plus a narrow source-boundary scan over this one capability. It is
 * not an architecture linter and must not grow into one.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEPOSIT_ELIGIBILITY_PORT,
  InventoryPersistenceModule,
  ORDER_REPOSITORY,
  SKU_STOCK_REPOSITORY,
} from '@embroidery/persistence';

// The API's delivered contract modules. Imported here **as a test** — the
// production worker never does this — purely to prove the two applications name
// the same objects rather than two lookalikes.
import { SKU_STOCK_REPOSITORY as API_SKU_STOCK_REPOSITORY } from '../../../../../api/src/modules/inventory/domain/repositories/sku-stock.repository';
import { DEPOSIT_ELIGIBILITY_PORT as API_DEPOSIT_ELIGIBILITY_PORT } from '../../../../../api/src/modules/payment/domain/repositories/deposit-eligibility.port';

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
 * boundary by naming exactly what they do not do — prose that must not count as
 * a violation of itself.
 */
function strippedOfComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const PRODUCTION_SOURCES = sourceFiles(CAPABILITY_ROOT).map((path) => ({
  path,
  text: strippedOfComments(readFileSync(path, 'utf8')),
}));

describe('canonical inventory authority has exactly one implementation', () => {
  it('resolves the same injection tokens in the API and the worker', () => {
    // A Symbol is only equal to itself. If the API's contract file had kept its
    // own `Symbol('SKU_STOCK_REPOSITORY')`, these would be two tokens, two
    // provider bindings and — eventually — two implementations behind them.
    expect(SKU_STOCK_REPOSITORY).toBe(API_SKU_STOCK_REPOSITORY);
    expect(DEPOSIT_ELIGIBILITY_PORT).toBe(API_DEPOSIT_ELIGIBILITY_PORT);
  });

  it('composes the shared inventory module', () => {
    expect(typeof InventoryPersistenceModule).toBe('function');
    expect(typeof ORDER_REPOSITORY).toBe('symbol');
  });

  it('writes no canonical inventory row directly', () => {
    const writes = PRODUCTION_SOURCES.filter((file) =>
      /(INSERT\s+INTO|UPDATE)\s+(sku_stocks|inventory_reservations|inventory_ledger_entries|inventory_soft_holds)\b/i.test(
        file.text,
      ),
    );

    expect(writes.map((file) => file.path)).toEqual([]);
  });

  it('reaches no Drizzle table object and no query builder', () => {
    // The B02 signal: the camelCase table identifiers and the ORM import appear
    // in statements, never in prose. A worker file naming either has stopped
    // consuming the shared contract and started writing SQL of its own.
    const offenders = PRODUCTION_SOURCES.filter(
      (file) =>
        /from\s+'drizzle-orm'/.test(file.text) ||
        /\b(skuStocks|inventoryReservations|inventoryLedgerEntries|inventorySoftHolds)\b/.test(
          file.text,
        ),
    );

    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it('holds no deposit predicate of its own', () => {
    // GRD-013's authority is `DepositEligibilityPort.isDepositSatisfied`,
    // reached only through `ReservationEligibilityGuard` inside the aggregate.
    // A worker file naming either the port or the obligation table would be a
    // second gate around the one implementation (`APP8-W01` §4).
    const offenders = PRODUCTION_SOURCES.filter(
      (file) =>
        /isDepositSatisfied|DEPOSIT_ELIGIBILITY_PORT/.test(file.text) ||
        /payment_obligations/i.test(file.text),
    );

    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it('never creates a stock anchor from the order path', () => {
    // `APP8-W01` §9, mandatory: anchor creation is an Admin inventory operation
    // (`APP8-B01`). A missing anchor is an operational failure, not a licence
    // for the worker to lazily create a zero-stock row.
    const offenders = PRODUCTION_SOURCES.filter((file) => /ensureStockRow/.test(file.text));

    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it('creates no production job and no production transition', () => {
    // W01 stops at the reservation (`APP8-W01` §16); production begins in B03/B04.
    const offenders = PRODUCTION_SOURCES.filter((file) =>
      /production_jobs|production_specifications|ProductionModule|IN_PRODUCTION/i.test(file.text),
    );

    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it('imports nothing from another application', () => {
    const appToApp = PRODUCTION_SOURCES.filter((file) => /from\s+'[^']*apps\/api/.test(file.text));

    expect(appToApp.map((file) => file.path)).toEqual([]);
  });
});
