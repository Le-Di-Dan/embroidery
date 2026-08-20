/**
 * The customer's read of the quotation that is current for their request
 * (`APP6-B04`).
 *
 * ```text
 * secure link token
 *   → AuthorizeSecureLink                 (APP4-B06: policy, abuse budget, digest)
 *   → ResolvedSecureLink.customRequestId  (the grant row, never the caller)
 *   → custom_requests.current_quotation_id        (APP6-B03 set it)
 *   → quotations.current_version_id               (APP6-B03 set it)
 *   → that exact version, and that version's lines
 * ```
 *
 * ### Nothing about the target is accepted
 *
 * {@link ReadCurrentQuotationCommand} carries a token and nothing else. There is
 * no `requestId`, no `quotationId`, no `versionId`, no `customerId`, no
 * `grantId` and no scope kind — not because this class declines to read them,
 * but because the command type has nowhere to put one. "Grant A cannot read
 * request B's quotation" is therefore not a comparison that could be removed:
 * there is no second identifier for it to disagree with.
 *
 * ### The pointers are the authority, and both are checked
 *
 * `APP6-B03` advances `custom_requests.current_quotation_id` and
 * `quotations.current_version_id` in one transaction, and this read consumes
 * exactly those two. It does **not** take the newest row by `created_at`, the
 * highest `version`, or the only `SENT` sibling it can find: a superseded
 * version is still `SENT`-shaped history, and picking one by recency would show
 * a customer a price the workshop has already replaced.
 *
 * Both containment invariants are then proved rather than assumed, because
 * `findById` and `loadVersion` address their tables globally and a pointer that
 * named a foreign row would resolve perfectly well:
 *
 * ```text
 * quotation.customRequestId === request id from the grant   (G-DB7-04)
 * version.quotationId       === quotation.id                (G-DB7-03)
 * ```
 *
 * ### One answer for every definitive absence
 *
 * A missing request row, an unset quotation pointer, an unset version pointer, a
 * quotation that resolves but belongs to another request, a version that belongs
 * to another quotation — all of them leave here as the same
 * `SECURE_LINK_UNAVAILABLE` a bad token produces (`APP6-B04` §12). No
 * `QUOTATION_NOT_FOUND` and no `CURRENT_QUOTATION_MISSING` reach this surface:
 * publishing either would let a caller learn that a grant is live but not yet
 * quoted, which is a fact about the workshop's progress on someone's order.
 * There is no diagnostic follow-up read anywhere below — that read is the
 * oracle.
 *
 * ### Reading changes nothing
 *
 * No transaction, no lock, no write. The grant is not consumed (ADR-DB3-004 r2
 * keeps a link multi-use within its validity, so a customer refreshing the page
 * must not burn it), no version is expired, no pointer is advanced, no
 * transition or audit row is appended for the quotation and no outbox event is
 * emitted. The only row APP4's admission writes is its own grant-resolution
 * audit — the same evidence `APP5-B03` produces, written because a token was
 * resolved and not because a quotation was read.
 *
 * ### No arithmetic
 *
 * There is no `Number()`, no `parseFloat` and no operator applied to an amount
 * in this file. Every money field is the `numeric(14,2)` string the frozen row
 * holds. The deposit share is the one the version was priced at, read from its
 * own row — the published deposit policy is not imported here and could not be
 * reached from this module's injector.
 */
import { Inject, Injectable } from '@nestjs/common';

import { AuditClock } from '../../../../platform/audit-context/audit-clock';
import {
  AuthorizeSecureLink,
  type SecureLinkAdmission,
} from '../../../customer/application/authorize-secure-link.service';
import { secureLinkUnavailable } from '../../../customer/domain/grant/secure-link.errors';
import type { NetworkReadableRequest } from '../../../customer/infrastructure/rate-limit/public-network-key.service';
import {
  CUSTOM_REQUEST_QUOTATION_POINTER_PORT,
  type CustomRequestQuotationPointerPort,
} from '../../../order/domain/repositories/custom-request-quotation-pointer.port';
import type { CustomRequestId } from '../../../order/domain/repositories/custom-request.repository';
import {
  QUOTATION_REPOSITORY,
  type QuotationId,
  type QuotationRepository,
  type QuotationVersion,
} from '../../domain/repositories/quotation.repository';
import type { CustomerQuotationView } from './customer-quotation.view';

/** The whole input. One credential, by design — see the header. */
export interface ReadCurrentQuotationCommand {
  readonly token: string;
}

/** Either the view, or the rate-limit refusal the controller turns into a 429. */
export type CurrentQuotationOutcome =
  | { readonly outcome: 'READ'; readonly view: CustomerQuotationView }
  | { readonly outcome: 'RATE_LIMITED'; readonly retryAfterSeconds: number };

/** The stored state a swept version already carries (`APP6-B04` §11). */
const EXPIRED = 'EXPIRED';

@Injectable()
export class ReadCurrentQuotation {
  constructor(
    private readonly links: AuthorizeSecureLink,
    @Inject(CUSTOM_REQUEST_QUOTATION_POINTER_PORT)
    private readonly requests: CustomRequestQuotationPointerPort,
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
    private readonly clock: AuditClock,
  ) {}

  async read(
    request: NetworkReadableRequest,
    command: ReadCurrentQuotationCommand,
  ): Promise<CurrentQuotationOutcome> {
    const admission: SecureLinkAdmission = await this.links.authorize(request, command.token);
    if (admission.outcome === 'RATE_LIMITED') {
      return { outcome: 'RATE_LIMITED', retryAfterSeconds: admission.retryAfterSeconds };
    }

    const requestId = admission.link.customRequestId as CustomRequestId;
    const pointer = await this.requests.findQuotationPointer(requestId);
    // Absent request row, or a request the workshop has not sent a quotation
    // for. One answer, and it is the same one a stranger's token gets.
    if (pointer?.currentQuotationId === undefined) {
      throw secureLinkUnavailable();
    }

    const quotation = await this.quotations.findById(pointer.currentQuotationId as QuotationId);
    // The pointer resolved, and the row it named belongs to this request. The
    // second clause is G-DB7-04 checked on the read side, where its absence
    // would let one request's pointer serve another customer's price.
    if (
      quotation === undefined ||
      quotation.customRequestId !== requestId ||
      quotation.currentVersionId === undefined
    ) {
      throw secureLinkUnavailable();
    }

    const version = await this.quotations.loadVersion(quotation.currentVersionId);
    // G-DB7-03 on the read side, for the same reason.
    if (version === undefined || version.quotationId !== quotation.id) {
      throw secureLinkUnavailable();
    }

    return {
      outcome: 'READ',
      view: await this.project(quotation.code, quotation.status, version, admission.link.expiresAt),
    };
  }

  /**
   * Assembles the view.
   *
   * Field by field rather than by spread, so a column added to
   * {@link QuotationVersion} later cannot reach an anonymous browser without an
   * edit here. `stitchCount`, `adjustmentReason`, `acceptedAt`, `supersededAt`,
   * `expiredAt`, `createdAt` and the version's quotation id are all present on
   * the row and deliberately not carried across.
   */
  private async project(
    quotationCode: string,
    quotationStatus: string,
    version: QuotationVersion,
    accessExpiresAt: Date,
  ): Promise<CustomerQuotationView> {
    const lineItems = await this.quotations.loadLineItems(version.id);

    return {
      quotationCode,
      versionId: version.id,
      version: version.version,
      status: version.status,
      quotationStatus,
      currencyCode: version.currencyCode,
      quantityTotal: version.quantityTotal,
      // Straight through. Every amount below is the `numeric(14,2)` the frozen
      // row holds, still a string, never re-derived from the others.
      subtotalAmount: version.subtotalAmount,
      manualAdjustmentAmount: version.manualAdjustmentAmount,
      shippingFeeAmount: version.shippingFeeAmount,
      totalAmount: version.totalAmount,
      depositPercent: version.depositPercent,
      depositAmount: version.depositAmount,
      remainingAmount: version.remainingAmount,
      lineItems: lineItems.map((line) => ({
        position: line.position,
        lineKind: line.lineKind,
        description: line.description,
        quantity: line.quantity,
        unitPriceAmount: line.unitPriceAmount,
        lineTotalAmount: line.lineTotalAmount,
      })),
      sentAt: version.sentAt,
      validFrom: version.validFrom,
      validUntil: version.validUntil,
      expired: hasElapsed(version, this.clock.now()),
      accessExpiresAt,
    };
  }
}

/**
 * Whether the customer should be shown the expired state.
 *
 * Two sources, and the stored one is honoured where it exists: a version the
 * out-of-APP6 sweep has already moved to `EXPIRED` reads as expired whatever the
 * clock says, and a version still `SENT` past its `valid_until` reads as expired
 * **without being written to**. `APP6-B04` §11 keeps this advisory — `APP6-B05`
 * decides acceptance in-transaction under the canonical rule and does not trust
 * this flag.
 *
 * A version with no `valid_until` has never been sent and cannot have elapsed.
 * The comparison is `>=`, matching "valid **until**": the instant itself is past
 * the window.
 */
function hasElapsed(version: QuotationVersion, now: Date): boolean {
  if (version.status === EXPIRED) {
    return true;
  }
  return version.validUntil !== undefined && now.getTime() >= version.validUntil.getTime();
}
