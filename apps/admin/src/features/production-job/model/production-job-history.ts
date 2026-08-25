/**
 * The transition history, presented in the order the server sent it.
 *
 * ## No row is created here, and none is reordered
 *
 * `production_job_transitions` is append-only and `APP8-B03` returns it in
 * insert order. This module maps that array one-for-one: no sort, no reverse, no
 * grouping and — the one that matters — no synthetic `(created) → PLANNED`
 * entry. Job creation is not recorded as a transition, so a "tạo lệnh" row would
 * be a record that does not exist (`784:96`). A fresh `PLANNED` job therefore
 * has an empty history, and the empty state says why.
 *
 * ## Actor attribution stays safe
 *
 * `actorKind` carries no dictionary set on the contract and none is invented
 * here: it is rendered as stored, beside the *shortened* admin id when the move
 * was an `ADMIN` one and the system job key when it was a `SYSTEM` one. A
 * customer never appears in this table because no customer transition exists
 * (`784:97`). The `correlationId` is deliberately not surfaced — it is a
 * support-side identifier and no approved frame draws it.
 */
import type { AdminProductionTransitionResponse } from '@embroidery/api-client';

import { truncateIdentifier } from '../../../shared/presentation/identifier';
import { formatInstant } from '../../../shared/presentation/instant';
import { presentProductionStatus } from '../../../shared/presentation/production-status';

export interface ProductionHistoryRow {
  /** Stable within one response: the history is append-only and ordered. */
  readonly key: string;
  /** `PLANNED → STARTED`, using the stored tokens as `784:221` draws them. */
  readonly move: string;
  /** The same move in the operator's own words, for the accessible name. */
  readonly moveLabel: string;
  /** `ADMIN · 7c19…8b41`, or the actor kind alone when no id is published. */
  readonly actor: string;
  /** The raw ISO instant, for the machine-readable `dateTime` attribute. */
  readonly at: string;
  readonly atLabel: string;
  /** Present only on a cancellation; every other move records none. */
  readonly reason: string | undefined;
}

function attributionOf(transition: AdminProductionTransitionResponse): string {
  const { actorKind, adminId, systemJobKey } = transition;
  if (adminId !== undefined) return `${actorKind} · ${truncateIdentifier(adminId)}`;
  if (systemJobKey !== undefined) return `${actorKind} · ${systemJobKey}`;
  return actorKind;
}

export function toProductionHistoryRows(
  transitions: readonly AdminProductionTransitionResponse[],
): readonly ProductionHistoryRow[] {
  return transitions.map((transition, index) => ({
    // The index is part of the key on purpose: the contract publishes no
    // transition id, and two identical moves at the same instant are possible
    // in principle. Position is the only thing that is guaranteed unique, and
    // it is stable because the order is the server's.
    key: `${String(index)}:${transition.fromStatus}:${transition.toStatus}`,
    move: `${transition.fromStatus} → ${transition.toStatus}`,
    moveLabel: `${presentProductionStatus(transition.fromStatus).label} → ${
      presentProductionStatus(transition.toStatus).label
    }`,
    actor: attributionOf(transition),
    at: transition.occurredAt,
    atLabel: formatInstant(transition.occurredAt),
    reason: transition.reason,
  }));
}
