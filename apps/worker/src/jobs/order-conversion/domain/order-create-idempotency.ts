/**
 * The `order.create` idempotency key (`APP7-G01` §10, `APP7-R00` §11, GRD-012).
 *
 * The binding is already accepted authority and is restated here rather than
 * re-decided:
 *
 * ```text
 * namespace   = order.create
 * scope       = (request, approval snapshot)
 * fingerprint = request id + approval snapshot id
 * replay      = the order that was created
 * arbiter     = uq_orders__request (CST-030)
 * ```
 *
 * ### The scope key is the two ids, not a hash of them
 *
 * The rule `design-approve-idempotency.ts` and `quotation-accept-idempotency.ts`
 * both record: the scope key is what makes two executions *the same operation*,
 * and both ids are already opaque, unique and server-chosen. Hashing them would
 * only make the row unreadable to an operator diagnosing a stuck claim. The
 * scope is a **pair** because `LC-14` says so — a request and the approval being
 * converted — so the two ids are joined by a separator that cannot occur inside
 * either.
 *
 * ### The fingerprint is the same two facts, and that is deliberate
 *
 * A fingerprint exists so one key reused for *different work* is a conflict
 * rather than a replay (GRD-030). This operation has no caller-supplied input at
 * all: the conversion is fully determined by which approval of which request it
 * converts, and everything else is read from persisted rows inside the
 * transaction. So two executions that agree on the scope cannot disagree on the
 * work, and `IDEMPOTENCY_CONFLICT` is unreachable here — which is the honest
 * outcome, not a gap. Nothing about the event row, the attempt number or the
 * clock enters it; a redelivery of the same approval must replay, and a
 * fingerprint that moved would make it a conflict.
 *
 * ### The encoding is spelled out
 *
 * Length-prefixed and joined in a fixed order, so `"ab" + "c"` and `"a" + "bc"`
 * cannot collide — the rule `submission-fingerprint.ts` records.
 */
import { createHash } from 'node:crypto';

/** `DB3_IDEMPOTENCY_SPECIFICATION.md`'s namespace for this operation. */
export const ORDER_CREATE_NAMESPACE = 'order.create';

/**
 * How long a claim may sit `IN_PROGRESS` before a sweep may reclaim it.
 *
 * The delivered `design.approve` value, for the delivered reason: generous
 * relative to a transaction that is a handful of statements, so a worker killed
 * mid-conversion does not block the retry forever, and short enough that it does
 * not outlive an operator's patience.
 */
export const ORDER_CREATE_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

export interface OrderCreateScope {
  readonly customRequestId: string;
  readonly approvalSnapshotId: string;
}

/** The canonical pre-image. Exported so a test can assert the encoding itself. */
export function canonicalOrderCreatePreimage(scope: OrderCreateScope): string {
  return [field(scope.customRequestId), field(scope.approvalSnapshotId)].join('|');
}

export function orderCreateScopeKey(scope: OrderCreateScope): string {
  return `${scope.customRequestId}:${scope.approvalSnapshotId}`;
}

export function orderCreateFingerprint(scope: OrderCreateScope): string {
  return `sha256:${createHash('sha256')
    .update(canonicalOrderCreatePreimage(scope), 'utf8')
    .digest('hex')}`;
}

/** What a completed claim stores, so a duplicate replays it instead of writing. */
export interface OrderCreateResult {
  readonly orderId: string;
  readonly code: string;
}

export function readOrderCreateResult(result: unknown): OrderCreateResult | undefined {
  if (typeof result !== 'object' || result === null) {
    return undefined;
  }
  const record = result as Record<string, unknown>;
  const orderId = record['orderId'];
  const code = record['code'];
  return typeof orderId === 'string' && typeof code === 'string' ? { orderId, code } : undefined;
}

/** Length-prefixed, so no two field sequences can share a pre-image. */
function field(value: string): string {
  return `${value.length}:${value}`;
}
