/**
 * The structural guard against the defect `APP8-B02` was written to prevent —
 * the inventory sibling of `canonical-order-authority.spec.ts` (`APP7-W01-C1`
 * §12, `PO-APP8-006`).
 *
 * `APP8-W01` writes `inventory_reservations`, `inventory_ledger_entries` and
 * `sku_stocks` from `apps/worker`, which may not import `apps/api`. The
 * tempting answer is a worker-local inventory adapter, and every behavioural
 * suite would still pass — which is exactly why this file exists. A second
 * implementation of `available = on_hand − Σ HELD − Σ RESERVED`, of the
 * `sku_stocks` anchor lock or of the deposit gate does not fail a test; it
 * fails later, when one copy is corrected and the other is not, and stock is
 * oversubscribed while every foreign key stays satisfied (INV-19).
 *
 * So the guard is structural, not behavioural, and deliberately small: token
 * identity plus a narrow source scan over the API's own inventory module. It is
 * not an architecture linter and must not grow into one. The behavioural proof
 * that B01's Admin surface still works through the shared implementation is the
 * `admin-sku-stock-api` integration suite; the CC-21 arbiter's proof is
 * `inventory-races.integration.spec.ts`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEPOSIT_ELIGIBILITY_PORT,
  InventoryPersistenceModule,
  SKU_STOCK_REPOSITORY,
} from '@embroidery/persistence';

import { DEPOSIT_ELIGIBILITY_PORT as API_DEPOSIT_ELIGIBILITY_PORT } from '../payment/domain/repositories/deposit-eligibility.port';
import { SKU_STOCK_REPOSITORY as API_SKU_STOCK_REPOSITORY } from './domain/repositories/sku-stock.repository';

const MODULE_ROOT = __dirname;

/** Production source only: `tests/` holds fixtures that legitimately write rows. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return entry === 'tests' ? [] : sourceFiles(path);
    }
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

const PRODUCTION_SOURCES = sourceFiles(MODULE_ROOT).map((path) => ({
  path,
  text: readFileSync(path, 'utf8'),
}));

describe('canonical inventory persistence has exactly one implementation', () => {
  it('resolves the same injection tokens in the API and the shared package', () => {
    // A Symbol is only equal to itself. Had the API contract file kept its own
    // `Symbol('SKU_STOCK_REPOSITORY')`, these would be two tokens, two provider
    // bindings and — eventually — two implementations behind them.
    expect(SKU_STOCK_REPOSITORY).toBe(API_SKU_STOCK_REPOSITORY);
    // `APP8-G01` §7.1: one deposit authority, and the API path to it is a
    // re-export of the same Symbol, not a second definition.
    expect(DEPOSIT_ELIGIBILITY_PORT).toBe(API_DEPOSIT_ELIGIBILITY_PORT);
  });

  it('publishes the canonical composition root from the shared package', () => {
    expect(typeof InventoryPersistenceModule).toBe('function');
  });

  it('binds no second provider for the stock repository in the API', () => {
    // `InventoryModule` re-exports the shared module. A `provide:` for this
    // token here would be a second binding of the same Symbol — the exact
    // duplication the promotion exists to prevent.
    const binders = PRODUCTION_SOURCES.filter((file) =>
      /provide:\s*SKU_STOCK_REPOSITORY/.test(file.text),
    );

    expect(binders.map((file) => file.path)).toEqual([]);
  });

  it('keeps no API-local inventory persistence implementation', () => {
    // Not a table-name scan — this module documents the tables it reads
    // *through* the shared contract, in docblocks and in OpenAPI descriptions,
    // and prose must not count as a violation of itself. Nor is any use of
    // `@embroidery/database` a violation: `admin-sku-stock.response.ts`
    // legitimately publishes `schema.INVENTORY_ENTRY_KINDS` as an enum. The
    // precise signals are the query layer and the Drizzle table objects, whose
    // camelCase identifiers appear in statements and never in prose.
    const offenders = PRODUCTION_SOURCES.filter(
      (file) =>
        /\bfrom\s+'drizzle-orm'/.test(file.text) ||
        /\b(?:skuStocks|inventorySoftHolds|inventoryReservations|inventoryLedgerEntries)\b/.test(
          file.text,
        ),
    );

    expect(offenders.map((file) => file.path)).toEqual([]);
  });
});
