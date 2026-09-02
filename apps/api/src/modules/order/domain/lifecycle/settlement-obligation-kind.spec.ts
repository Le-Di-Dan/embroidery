/**
 * `GRD-016`'s kind-by-origin lookup (`APP12-B05` §22, §31).
 *
 * Docker-free: no database, no container, no network.
 */
import type { OrderOrigin } from '@embroidery/database';

import { settlementObligationKindFor } from './settlement-obligation-kind';

describe('APP12-B05 — which obligation GRD-016 requires', () => {
  it('keeps the delivered answer for a custom order', () => {
    expect(settlementObligationKindFor('CUSTOM')).toBe('REMAINING');
  });

  it('names the FULL obligation for a Ready-Made order', () => {
    // Before this table, dispatch asked for `REMAINING` unconditionally. A
    // Ready-Made order can never have one — `ck_payment_obligations__kind_by_origin`
    // forbids it — so every paid Ready-Made order was refused
    // `ORDER_REMAINING_PAYMENT_MISSING`.
    expect(settlementObligationKindFor('READY_MADE')).toBe('FULL');
  });

  it('never lets one origin inherit the other’s obligation', () => {
    const origins: readonly OrderOrigin[] = ['CUSTOM', 'READY_MADE'];
    const kinds = origins.map((origin) => settlementObligationKindFor(origin));
    expect(new Set(kinds).size).toBe(origins.length);
  });

  it('names no deposit', () => {
    // `GRD-016` is about the payment that gates *dispatch*. A deposit gates
    // production, never delivery, so it must not be reachable from this table.
    const origins: readonly OrderOrigin[] = ['CUSTOM', 'READY_MADE'];
    for (const origin of origins) {
      expect(settlementObligationKindFor(origin)).not.toBe('DEPOSIT');
    }
  });
});
