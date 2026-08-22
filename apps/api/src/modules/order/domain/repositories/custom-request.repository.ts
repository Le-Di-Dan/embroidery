/**
 * AGG-13 Custom Request persistence contract (TBL-037..TBL-042).
 *
 * The customer's case. Owns its quantity breakdown, its customer-supplied
 * product, its asset associations, its moderation notes and its transition
 * history — none of which has a life outside the request (DB7 §10.1).
 *
 * Carries **G-DB7-04** (the current quotation must belong to this request),
 * **G-DB7-22** (a request must be QUOTE_ACCEPTED before digitizing) and
 * **G-DB7-25** (only lifecycle-legal transitions).
 */
import type { CustomRequestState } from '@embroidery/database';

import type { ProductVariantId } from '../../../catalog/domain/repositories/placement-hierarchy.port';

/**
 * `CustomRequestId` and `RequestActor` are declared in `@embroidery/persistence`
 * (`src/order/ordering-identity.ts`) and re-exported here under their delivered
 * names (`APP7-W01-C1`).
 *
 * They moved for one reason: the shared AGG-15 `OrderRepository` contract names
 * both, and a type a two-application contract references may not live inside one
 * of those applications. The request aggregate is still their conceptual owner
 * and is still written only by the API — nothing else about AGG-13 moved.
 */
import type { CustomRequestId, RequestActor } from '@embroidery/persistence';

export type { CustomRequestId, RequestActor };

export interface CustomRequest {
  readonly id: CustomRequestId;
  readonly code: string;
  readonly customerId: string;
  readonly status: CustomRequestState;
  readonly currentDesignCaseId: string | undefined;
  readonly currentQuotationId: string | undefined;
}

export interface QuantityBreakdownLine {
  readonly productVariantId: ProductVariantId | undefined;
  readonly sizeLabel: string | undefined;
  readonly quantity: number;
}

export interface CustomerOwnedProduct {
  readonly name: string;
  readonly description: string | undefined;
  readonly physicalWidthMm: string | undefined;
  readonly physicalHeightMm: string | undefined;
}

export interface RequestTransition {
  readonly fromStatus: CustomRequestState;
  readonly toStatus: CustomRequestState;
  readonly actorKind: string;
  readonly reason: string | undefined;
  readonly correlationId: string;
}

export interface SubmitRequestInput {
  readonly id: CustomRequestId;
  readonly code: string;
  readonly customerId: string;
  readonly customerNote?: string | undefined;
  readonly productId?: string | undefined;
  readonly productVariantId?: ProductVariantId | undefined;
  readonly breakdown: readonly QuantityBreakdownLine[];
  readonly customerOwnedProduct?: CustomerOwnedProduct | undefined;
  /**
   * The APP3 Design Session this submission froze (`APP5-G01` `G01-D09`).
   *
   * Added by `APP5-B01`. Provenance with **no FK** — sessions are hard-TTL-
   * deleted and the request must outlive them (TBL-037 header) — and
   * **server-set from the session actually submitted, never client-supplied**: a
   * client value would let a caller attribute their request to someone else's
   * session. Absent on the COP branch, which has no session at all.
   */
  readonly submittedSessionId?: string | undefined;
}

export interface TransitionRequestInput {
  readonly id: CustomRequestId;
  readonly to: CustomRequestState;
  readonly actor: RequestActor;
  readonly reason?: string | undefined;
  readonly customerVisibleReason?: string | undefined;
  readonly correlationId: string;
  /**
   * The state the caller judged this move against (`APP5-B05` §6).
   *
   * An optimistic-concurrency precondition, **never** an authority and never a
   * client value: the caller passes back the state it read a moment earlier, and
   * the row lock below is still what decides. When the locked row no longer
   * carries it, another actor moderated this request in between and the caller's
   * validation — which reason texts were required, which note kind explained the
   * move — was performed against a state the request has left. That is reported
   * as `STALE_TRANSITION` rather than silently re-applied from the new state.
   *
   * Omitted by callers that have no earlier read to defend, whose moves are
   * judged from the locked state alone.
   */
  readonly expectedFrom?: CustomRequestState | undefined;
}

/** What an appended moderation note turned out to be, once the row existed. */
export interface AppendedModerationNote {
  /** TBL-041's identity **is** its append sequence (IDX-137), server-generated. */
  readonly sequence: number;
  readonly createdAt: Date;
}

export const CUSTOM_REQUEST_REPOSITORY = Symbol('CUSTOM_REQUEST_REPOSITORY');

export interface CustomRequestRepository {
  /**
   * Creates the request with its breakdown and optional COP.
   *
   * @requiresTransaction — a request whose breakdown did not land would be
   * quotable at the wrong quantity.
   */
  submit(input: SubmitRequestInput): Promise<CustomRequest>;

  /** @requiresTransaction — replaces the breakdown wholesale while unquoted. */
  replaceBreakdown(id: CustomRequestId, breakdown: readonly QuantityBreakdownLine[]): Promise<void>;

  /** @requiresTransaction */
  attachAsset(id: CustomRequestId, assetId: string, role: string): Promise<void>;

  /**
   * Appends one moderation note. Append-only: there is no edit and no delete,
   * here or anywhere else in this contract.
   *
   * The sequence, the timestamp and the row's identity are all database-owned —
   * no caller supplies any of them — and the appended values are returned so a
   * caller can report what it wrote without a second read.
   *
   * @requiresTransaction
   */
  appendModerationNote(
    id: CustomRequestId,
    kind: string,
    note: string,
    adminId: string,
  ): Promise<AppendedModerationNote>;

  /**
   * Moves the request and appends the transition evidence, together.
   *
   * Rejects a move the lifecycle does not permit (G-DB7-25), read under the
   * request's row lock so the check and the write see the same state. On a move
   * to `CANCELLED` the two reason texts also land on the request root's
   * `cancelled_reason` / `cancelled_customer_reason` (COL-TBL037-08/09), which
   * is where a cancellation's explanation is durably kept.
   *
   * @requiresTransaction
   */
  transition(input: TransitionRequestInput): Promise<CustomRequest>;

  /** Points the request at a quotation that belongs to it (G-DB7-04). @requiresTransaction */
  setCurrentQuotation(id: CustomRequestId, quotationId: string): Promise<void>;

  /**
   * Which of these assets are already bound to some request (`APP5-G01` §6).
   *
   * Added by `APP5-B01`. `uq_custom_request_assets__request_asset_role` makes a
   * *repeat* binding impossible, but not a **re-use** of another request's
   * evidence under a different request id — so the reuse rule needs a read, and
   * it belongs here because `custom_request_assets` is Ordering's table.
   *
   * Returns the subset that is bound, not a boolean per input, so one statement
   * answers for the whole selection.
   */
  findBoundAssetIds(assetIds: readonly string[]): Promise<string[]>;

  findById(id: CustomRequestId): Promise<CustomRequest | undefined>;

  /**
   * Reads the request under its row lock (`APP6-B03`).
   *
   * `findById` answers what the row said a moment ago, which is enough for a
   * caller that only reports it. A caller whose *own* writes depend on the
   * request still being in that state needs the state held for the rest of its
   * transaction — the quotation send transaction freezes a version against it,
   * and on the already-`QUOTED` branch appends no transition, so it has no
   * `expectedFrom` precondition to fall back on.
   *
   * The lock is the same `FOR UPDATE` `transition()` and `replaceBreakdown()`
   * take; this exposes it on its own rather than making a caller open with a
   * write it does not want to perform.
   *
   * @requiresTransaction — a lock taken outside one is released immediately and
   * proves nothing.
   */
  lockById(id: CustomRequestId): Promise<CustomRequest | undefined>;
  findByCode(code: string): Promise<CustomRequest | undefined>;
  loadBreakdown(id: CustomRequestId): Promise<QuantityBreakdownLine[]>;
  loadCustomerOwnedProduct(id: CustomRequestId): Promise<CustomerOwnedProduct | undefined>;
  listTransitions(id: CustomRequestId): Promise<RequestTransition[]>;
  /** Total units across the breakdown — what an approval freezes. */
  totalQuantity(id: CustomRequestId): Promise<number>;
}
