/**
 * AGG-14 Quotation persistence contract (TBL-050..TBL-053).
 *
 * Manual pricing with immutable-once-sent versions. A sent version's amounts
 * are frozen by an S24 trigger, so nothing here offers to reprice one — a new
 * price is a new version.
 *
 * Carries **G-DB7-03** (a current version must belong to its quotation) and
 * **G-DB7-20** (GRD-006: acceptance binds the exact current, sent, unexpired
 * version).
 */
import type {
  QuotationLineKind,
  QuotationState,
  QuotationVersionState,
} from '@embroidery/database';

export type QuotationId = string & { readonly __brand: 'QuotationId' };
export type QuotationVersionId = string & { readonly __brand: 'QuotationVersionId' };

export interface Quotation {
  readonly id: QuotationId;
  readonly code: string;
  readonly customRequestId: string;
  readonly status: QuotationState;
  readonly currentVersionId: QuotationVersionId | undefined;
}

/**
 * Amounts are strings throughout: `numeric` must never become a JS number
 * (`CLAUDE.md` §5). The arithmetic relationships between them are enforced by
 * the schema's CHECK constraints.
 */
export interface QuotationVersion {
  readonly id: QuotationVersionId;
  readonly quotationId: QuotationId;
  readonly version: number;
  readonly status: QuotationVersionState;
  readonly quantityTotal: number;
  readonly subtotalAmount: string;
  readonly shippingFeeAmount: string;
  readonly totalAmount: string;
  readonly depositAmount: string;
  readonly remainingAmount: string;
  readonly currencyCode: string;
  readonly validUntil: Date | undefined;
  readonly sentAt: Date | undefined;
  readonly acceptedAt: Date | undefined;
}

export interface QuotationLineItem {
  readonly position: number;
  readonly lineKind: QuotationLineKind;
  readonly description: string;
  readonly skuId: string | undefined;
  readonly quantity: number;
  readonly unitPriceAmount: string;
  readonly lineTotalAmount: string;
}

export interface AddQuotationVersionInput {
  readonly id: QuotationVersionId;
  readonly quotationId: QuotationId;
  readonly quantityTotal: number;
  readonly subtotalAmount: string;
  readonly manualAdjustmentAmount?: string | undefined;
  readonly adjustmentReason?: string | undefined;
  readonly shippingFeeAmount: string;
  readonly totalAmount: string;
  readonly depositPercent: string;
  readonly depositAmount: string;
  readonly remainingAmount: string;
  readonly stitchCount?: number | undefined;
  readonly lineItems: readonly QuotationLineItem[];
}

export interface AcceptQuotationInput {
  readonly versionId: QuotationVersionId;
  readonly customerId: string;
  /** The grant that authorised the acceptance (GRD-002). */
  readonly grantId: string;
  /** Step-up re-verification is mandatory for acceptance (GRD-003). */
  readonly stepUpChallengeId: string;
  readonly acceptedAt: Date;
}

export const QUOTATION_REPOSITORY = Symbol('QUOTATION_REPOSITORY');

export interface QuotationRepository {
  /** @requiresTransaction */
  createForRequest(id: QuotationId, code: string, customRequestId: string): Promise<Quotation>;

  /**
   * Adds a DRAFT version with its line items.
   *
   * @requiresTransaction — a version whose lines did not land would quote a
   * total nothing explains.
   */
  addVersion(input: AddQuotationVersionInput): Promise<QuotationVersion>;

  /** Sends a draft, freezing its amounts. @requiresTransaction */
  send(id: QuotationVersionId, validUntil: Date, at: Date): Promise<QuotationVersion>;

  /** Points the quotation at one of its **own** versions (G-DB7-03). @requiresTransaction */
  setCurrentVersion(quotationId: QuotationId, versionId: QuotationVersionId): Promise<void>;

  /**
   * Accepts the exact current version (G-DB7-20 / GRD-006).
   *
   * The version must still be the quotation's current one, SENT, and not past
   * `valid_until` — all re-read inside this transaction, because a customer
   * may be looking at a page rendered before a newer version superseded it.
   *
   * @requiresTransaction
   */
  accept(input: AcceptQuotationInput): Promise<QuotationVersion>;

  /** @requiresTransaction */
  expire(id: QuotationVersionId, at: Date): Promise<void>;

  findByRequest(customRequestId: string): Promise<Quotation | undefined>;
  findById(id: QuotationId): Promise<Quotation | undefined>;
  loadVersion(id: QuotationVersionId): Promise<QuotationVersion | undefined>;
  loadLineItems(id: QuotationVersionId): Promise<QuotationLineItem[]>;
  listVersions(quotationId: QuotationId): Promise<QuotationVersion[]>;
  /** The accepted version of a request's quotation — what an order freezes. */
  acceptedVersionForRequest(customRequestId: string): Promise<QuotationVersion | undefined>;
}
