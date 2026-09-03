/**
 * The grant-scoped request status read (`APP5-B03`).
 *
 * ```text
 * secure link token
 *   → AuthorizeSecureLink            (APP4-B06: policy, abuse budget, digest)
 *   → ResolvedSecureLink.customRequestId
 *   → this projection
 * ```
 *
 * ### The request id is read, never accepted
 *
 * {@link ReadGrantScopedRequestCommand} carries a token and nothing else. There
 * is no `requestId`, no `code`, no `customerId` and no contact field — not
 * because this class declines to read them, but because the command type has
 * nowhere to put them. The id comes back **from the grant row**, which is why
 * "grant for request A cannot read request B" is not a check that could be
 * removed: there is no second id for it to disagree with.
 *
 * `APP5-G01` §5 makes the request **code** display-only and explicitly never an
 * authorization input. It appears in the response and in no signature here.
 *
 * ### GRD-002, and why it is entirely APP4's
 *
 * Valid, correct scope, unexpired, unrevoked, not superseded, bound to the
 * request returned — every clause is decided by
 * `SecureAccessGrantRepository.resolveActiveByTokenDigest` under CST-008, in
 * one query. `APP5-G01` `G01-D04` assigns GRD-002 to exactly this surface, and
 * `APP5-B03` §2 requires the APP4 result to be consumed rather than re-derived.
 * This file contains no token handling, no digest, no expiry comparison and no
 * revocation test.
 *
 * ### Non-enumeration survives the join
 *
 * A grant whose request row cannot be read leaves here as the same
 * `SECURE_LINK_UNAVAILABLE` a bad token produces — not a `404 REQUEST_NOT_FOUND`
 * and not a `500`. Anything else would let the two be told apart, which is the
 * distinction `APP4-B06` spends a whole module refusing to make. `restrict`
 * foreign keys make the case unreachable in practice; the refusal is here so it
 * stays unreachable by *observation* too.
 *
 * ### Reading changes nothing
 *
 * No transaction, no write, no transition, and the grant is not consumed —
 * ADR-DB3-004 r2 makes the link multi-use within its validity, so a customer
 * refreshing their status page must not burn it.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  AuthorizeSecureLink,
  type SecureLinkAdmission,
} from '../../../customer/application/authorize-secure-link.service';
import type { NetworkReadableRequest } from '../../../customer/infrastructure/rate-limit/public-network-key.service';
import { secureLinkUnavailable } from '../../../customer/domain/grant/secure-link.errors';
import {
  CATALOG_SUBJECT_PORT,
  type CatalogSubjectLabels,
  type CatalogSubjectPort,
} from '../../../catalog/domain/repositories/catalog-subject.port';
import type { CustomRequestId } from '../../domain/repositories/custom-request.repository';
import { requestSubjectOf } from '../../../customer/domain/grant/grant-subject';
import {
  CUSTOM_REQUEST_STATUS_REPOSITORY,
  type CustomRequestStatusAsset,
  type CustomRequestStatusQuantityLine,
  type CustomRequestStatusRepository,
  type CustomRequestStatusRow,
} from '../../domain/repositories/custom-request-status.repository';
import {
  projectSubject,
  selectCustomerVisibleReason,
  type RequestStatusSubject,
} from './request-status.projection';

/** The whole input. One credential, by design — see the header. */
export interface ReadGrantScopedRequestCommand {
  readonly token: string;
}

/** What the customer is shown. Every field is one an anonymous browser may hold. */
export interface GrantScopedRequestView {
  readonly requestId: string;
  /** Display-only (`APP5-G01` §5). Returned, never accepted. */
  readonly code: string;
  readonly status: string;
  readonly submittedAt: Date;
  readonly subject: RequestStatusSubject | undefined;
  readonly quantities: readonly CustomRequestStatusQuantityLine[];
  readonly totalQuantity: number;
  readonly assets: readonly CustomRequestStatusAsset[];
  readonly customerVisibleReason: string | undefined;
  /** When the link stops working, so the page can say so before it does. */
  readonly accessExpiresAt: Date;
}

/** Either the view, or the rate-limit refusal the controller turns into a 429. */
export type GrantScopedRequestOutcome =
  | { readonly outcome: 'READ'; readonly view: GrantScopedRequestView }
  | { readonly outcome: 'RATE_LIMITED'; readonly retryAfterSeconds: number };

@Injectable()
export class ReadGrantScopedRequest {
  constructor(
    private readonly links: AuthorizeSecureLink,
    @Inject(CUSTOM_REQUEST_STATUS_REPOSITORY)
    private readonly requests: CustomRequestStatusRepository,
    @Inject(CATALOG_SUBJECT_PORT) private readonly catalog: CatalogSubjectPort,
  ) {}

  async read(
    request: NetworkReadableRequest,
    command: ReadGrantScopedRequestCommand,
  ): Promise<GrantScopedRequestOutcome> {
    const admission: SecureLinkAdmission = await this.links.authorize(request, command.token);
    if (admission.outcome === 'RATE_LIMITED') {
      return { outcome: 'RATE_LIMITED', retryAfterSeconds: admission.retryAfterSeconds };
    }

    const requestId = requestSubjectOf(admission.link) as CustomRequestId;
    const row = await this.requests.findRequest(requestId);
    if (row === undefined) {
      throw secureLinkUnavailable();
    }

    return {
      outcome: 'READ',
      view: await this.project(row, admission.link.expiresAt),
    };
  }

  /**
   * Assembles the view from four narrow reads plus the catalog labels.
   *
   * Four statements rather than one join, because they answer four independent
   * questions about different tables and a join would have to be an outer join
   * on three of them — producing a row set this method would then have to
   * de-duplicate. `loadStructure` in Catalog makes the same trade for the same
   * reason: one round trip per child table.
   */
  private async project(
    row: CustomRequestStatusRow,
    accessExpiresAt: Date,
  ): Promise<GrantScopedRequestView> {
    const [quantities, customerOwnedProduct, assets, transitionReason] = await Promise.all([
      this.requests.loadQuantityLines(row.id),
      this.requests.loadCustomerOwnedProduct(row.id),
      this.requests.loadAssets(row.id),
      this.requests.findCurrentCustomerVisibleReason(row.id, row.status),
    ]);

    return {
      requestId: row.id,
      code: row.code,
      // The stored status, whatever it is. `APP5-B03` §7 requires the truthful
      // current value: if an APP6 transition has moved the request to `QUOTED`,
      // this reports `QUOTED` rather than mapping it back onto an APP5 state the
      // request is no longer in. It offers no action either way — this surface
      // has none to offer.
      status: row.status,
      // TR-LC11-01 writes no transition row (`G01-D05`), so the row's own
      // `created_at` **is** the submission time. There is no second timestamp to
      // prefer and none is invented.
      submittedAt: row.createdAt,
      subject: projectSubject(row, await this.labelsFor(row), customerOwnedProduct),
      quantities,
      totalQuantity: quantities.reduce((total, line) => total + line.quantity, 0),
      assets,
      customerVisibleReason: selectCustomerVisibleReason({
        status: row.status,
        cancelledCustomerReason: row.cancelledCustomerReason,
        transitionCustomerVisibleReason: transitionReason,
      }),
      accessExpiresAt,
    };
  }

  /** Catalog labels, asked for only when there is a catalog subject to name. */
  private async labelsFor(row: CustomRequestStatusRow): Promise<CatalogSubjectLabels | undefined> {
    if (row.productId === undefined || row.productVariantId === undefined) {
      return undefined;
    }
    return this.catalog.findSubjectLabels({
      productId: row.productId,
      productVariantId: row.productVariantId,
    });
  }
}
