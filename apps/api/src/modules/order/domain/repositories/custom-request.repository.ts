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

export type CustomRequestId = string & { readonly __brand: 'CustomRequestId' };

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

/**
 * Who caused a transition, and the evidence for it.
 *
 * The shape mirrors the schema's actor CHECK: exactly one of the three actor
 * references must be present, matching `actorKind`.
 */
export type RequestActor =
  | { readonly kind: 'ADMIN'; readonly adminId: string }
  | { readonly kind: 'CUSTOMER'; readonly customerId: string; readonly grantId: string }
  | { readonly kind: 'SYSTEM'; readonly systemJobKey: string };

export interface TransitionRequestInput {
  readonly id: CustomRequestId;
  readonly to: CustomRequestState;
  readonly actor: RequestActor;
  readonly reason?: string | undefined;
  readonly customerVisibleReason?: string | undefined;
  readonly correlationId: string;
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

  /** @requiresTransaction */
  appendModerationNote(
    id: CustomRequestId,
    kind: string,
    note: string,
    adminId: string,
  ): Promise<void>;

  /**
   * Moves the request and appends the transition evidence, together.
   *
   * Rejects a move the lifecycle does not permit (G-DB7-25), read under the
   * request's row lock so the check and the write see the same state.
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
  findByCode(code: string): Promise<CustomRequest | undefined>;
  loadBreakdown(id: CustomRequestId): Promise<QuantityBreakdownLine[]>;
  loadCustomerOwnedProduct(id: CustomRequestId): Promise<CustomerOwnedProduct | undefined>;
  listTransitions(id: CustomRequestId): Promise<RequestTransition[]>;
  /** Total units across the breakdown — what an approval freezes. */
  totalQuantity(id: CustomRequestId): Promise<number>;
}
