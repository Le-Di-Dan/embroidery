/**
 * The audit row an Admin stock adjustment leaves (`APP8-B01` §4.3).
 *
 * `DB3_AUDIT_SPECIFICATION.md` names this group explicitly — *"Stock adjustment
 * & override | inventory adjustments; GRD-023 override | admin | **R always** |
 * qty before/after + reason"* — so the row, its mandatory reason and its
 * before/after summary are an accepted requirement, not a preference. It is
 * appended inside the caller's transaction (SE-019: an audit row is written
 * in-transaction with its use case), so a rolled-back adjustment leaves no
 * audit row claiming it happened.
 *
 * ### This is not a second ledger
 *
 * The two rows answer different questions and both are required. The
 * `inventory_ledger_entries` row is the **balance** record: Σ`on_hand_delta`
 * rebuilds `quantity_on_hand` (INV-14), and it is what a reservation later
 * reads against. The `audit_events` row is the **business-action** record:
 * actor, correlation id and before/after, on the polymorphic target
 * `SKU_STOCK` that `AUDIT_TARGET_KINDS` has carried since DB7 for exactly this.
 * Neither is derivable from the other — the ledger has no request correlation,
 * and audit rows are never summed into a balance.
 *
 * The summary carries three integers and one id. No SKU code, no product, no
 * order, no customer, no reservation holder: an adjustment is a fact about a
 * quantity, and the audit row says only that.
 */
import { Inject, Injectable } from '@nestjs/common';

import { AuditClock } from '../../../../platform/audit-context/audit-clock';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import {
  AUDIT_EVENT_REPOSITORY,
  type AuditEventRepository,
} from '../../../audit/domain/repositories/audit-event.repository';

/** Lowercase dot-namespaced, as `DB3_AUDIT_SPECIFICATION.md` locks. */
export const SKU_STOCK_ADJUSTED_ACTION = 'sku_stock.adjusted';

export interface StockAdjustmentFacts {
  readonly skuStockId: string;
  readonly skuId: string;
  readonly delta: number;
  readonly quantityOnHandBefore: number;
  readonly quantityOnHandAfter: number;
}

@Injectable()
export class StockAdjustmentRecorder {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly clock: AuditClock,
    private readonly requestContext: RequestContextService,
  ) {}

  /** @requiresTransaction — atomic with the adjustment it explains. */
  async recordAdjusted(
    facts: StockAdjustmentFacts,
    adminId: string,
    reason: string,
  ): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: { kind: 'ADMIN', adminId },
      action: SKU_STOCK_ADJUSTED_ACTION,
      // The **stock row**, not the SKU: the audited fact is what happened to
      // this stock record, and `SKU_STOCK` is the accepted target kind for it.
      targetKind: 'SKU_STOCK',
      targetId: facts.skuStockId,
      reason,
      summary: {
        skuId: facts.skuId,
        delta: facts.delta,
        quantityOnHandBefore: facts.quantityOnHandBefore,
        quantityOnHandAfter: facts.quantityOnHandAfter,
      },
      correlationId: this.requestContext.requireRequestId(),
    });
  }
}
