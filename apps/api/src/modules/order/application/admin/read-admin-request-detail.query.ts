/**
 * One request, as an operator has to see it before deciding (`APP5-B04` §9).
 *
 * Read-only and operationally complete: the root, the customer, the subject, the
 * quantities, the attachment metadata, the whole transition history and the
 * moderation notes. It is the read `APP5-A02` renders and the read `APP5-B05`
 * adds actions beside — which is why it is broad here rather than in a later
 * checkpoint that would have to widen it again.
 *
 * ### It offers no action
 *
 * There is no `availableActions` field. `APP5-B05` owns lifecycle enforcement,
 * and a duplicate transition table computed here would be a second authority on
 * what is allowed — one that could disagree with the guard that actually runs
 * (§11). What the response gives instead is the evidence a decision is made
 * from: the current status, and the history of how it got there.
 *
 * ### Parallel statements, none of them a join
 *
 * The root is read first because the rest is addressed by its id; the child
 * reads then run together — including the `APP6-A01` §4 quotation locator, which
 * is one more id lookup keyed on the same row and so costs no extra round trip.
 * A join would have to be an outer join across five child tables and produce a
 * row set this class would immediately have to de-duplicate — the same trade
 * `loadStructure` makes in Catalog.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  ASSET_REPOSITORY,
  type AssetId,
  type AssetRepository,
} from '../../../asset/domain/repositories/asset.repository';
import {
  CATALOG_SUBJECT_PORT,
  type CatalogSubjectLabels,
  type CatalogSubjectPort,
} from '../../../catalog/domain/repositories/catalog-subject.port';
import {
  ADMIN_CUSTOMER_SUMMARY_PORT,
  type AdminCustomerSummary,
  type AdminCustomerSummaryPort,
} from '../../../customer/domain/repositories/admin-customer-summary.port';
import {
  QUOTATION_LOCATOR_PORT,
  type QuotationLocatorPort,
} from '../../../quotation/domain/repositories/quotation-locator.port';
import { adminRequestReadError } from '../../domain/admin/admin-request-read.errors';
import {
  BINDABLE_ASSET_CLASSIFICATION,
  BINDABLE_ASSET_KIND,
} from '../../domain/submission/request-asset-policy';
import type { CustomRequestId } from '../../domain/repositories/custom-request.repository';
import {
  CUSTOM_REQUEST_ADMIN_REPOSITORY,
  type AdminRequestDetailRow,
  type AdminRequestModerationNoteRow,
  type AdminRequestQuantityLine,
  type AdminRequestTransitionRow,
  type CustomRequestAdminRepository,
} from '../../domain/repositories/custom-request-admin.repository';
import {
  findCurrentStatusTransition,
  projectDetailSubject,
  selectCurrentReasons,
  type AdminRequestReasons,
  type AdminRequestSubject,
} from './admin-request.projection';

/** The scope every APP5 customer upload sits in (`APP5-G01` §6). */
const BINDABLE_SCOPE = {
  kind: BINDABLE_ASSET_KIND,
  classification: BINDABLE_ASSET_CLASSIFICATION,
} as const;

/**
 * One attachment, as Admin evidence.
 *
 * The association is Ordering's; the file's metadata is Asset's, and it arrives
 * through `ASSET_REPOSITORY` rather than by joining `assets` from here.
 *
 * **No `storageKey`, no bucket, no path, no checksum and no signed URL.** B04
 * publishes no binary route (§9.4), so a key would be an object-storage
 * coordinate handed to a browser for a file it has no authorized way to fetch.
 * The fields that are here — media type, size, state — are what an operator
 * needs to judge whether an upload is usable before opening it elsewhere.
 */
export interface AdminRequestAssetView {
  readonly assetId: string;
  readonly role: string;
  readonly linkedAt: Date;
  readonly mimeType: string | undefined;
  readonly sizeBytes: string | undefined;
  readonly status: string | undefined;
}

/** One history entry. Both reason halves, kept apart (`APP5-B04` §10). */
export interface AdminRequestTransitionView {
  readonly sequence: number;
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly actorKind: string;
  readonly actorAdminId: string | undefined;
  readonly actorCustomerId: string | undefined;
  readonly internalReason: string | undefined;
  readonly customerVisibleReason: string | undefined;
  readonly occurredAt: Date;
}

export interface AdminRequestNoteView {
  readonly sequence: number;
  readonly kind: string;
  readonly note: string;
  readonly adminId: string;
  readonly createdAt: Date;
}

export interface AdminRequestCustomerView {
  readonly customerId: string;
  readonly displayName: string | undefined;
  readonly verifiedAt: Date;
  readonly contacts: readonly {
    readonly kind: string;
    readonly maskedValue: string;
    readonly verified: boolean;
    readonly primary: boolean;
  }[];
}

export interface AdminRequestDetailView {
  readonly requestId: string;
  readonly code: string;
  readonly status: string;
  readonly submittedAt: Date;
  readonly updatedAt: Date;
  readonly customerNote: string | undefined;
  /** The internal half of the current status's explanation. Admin only. */
  readonly internalReason: string | undefined;
  /** The half the customer's own status page shows. Never merged with the above. */
  readonly customerVisibleReason: string | undefined;
  readonly customer: AdminRequestCustomerView | undefined;
  readonly subject: AdminRequestSubject | undefined;
  readonly quantities: readonly AdminRequestQuantityLine[];
  readonly totalQuantity: number;
  readonly assets: readonly AdminRequestAssetView[];
  readonly transitions: readonly AdminRequestTransitionView[];
  readonly moderationNotes: readonly AdminRequestNoteView[];
  /**
   * The id of this request’s quotation, or nothing (`APP6-A01` §4).
   *
   * A **locator**, not quotation content: it says where `APP6-B02` can be asked,
   * and nothing about price, version, validity or state. It is populated from
   * the unique `quotations.custom_request_id` relation rather than from
   * `custom_requests.current_quotation_id`, which `APP6-B03` only writes on send
   * and which is therefore NULL for a quotation that has only been drafted.
   */
  readonly quotationId: string | undefined;
}

@Injectable()
export class ReadAdminRequestDetail {
  constructor(
    @Inject(CUSTOM_REQUEST_ADMIN_REPOSITORY)
    private readonly requests: CustomRequestAdminRepository,
    @Inject(CATALOG_SUBJECT_PORT) private readonly catalog: CatalogSubjectPort,
    @Inject(ADMIN_CUSTOMER_SUMMARY_PORT) private readonly customers: AdminCustomerSummaryPort,
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
    @Inject(QUOTATION_LOCATOR_PORT) private readonly quotations: QuotationLocatorPort,
  ) {}

  async read(requestId: string): Promise<AdminRequestDetailView> {
    const row = await this.requests.findDetail(requestId as CustomRequestId);
    if (row === undefined) {
      throw adminRequestReadError('REQUEST_NOT_FOUND');
    }

    const [
      quantities,
      customerOwnedProduct,
      assetLinks,
      transitions,
      notes,
      customer,
      labels,
      quotationId,
    ] = await Promise.all([
      this.requests.loadQuantityLines(row.id),
      this.requests.loadCustomerOwnedProduct(row.id),
      this.requests.loadAssetLinks(row.id),
      this.requests.loadTransitions(row.id),
      this.requests.loadModerationNotes(row.id),
      this.customers.findDetailSummary(row.customerId),
      this.labelsFor(row),
      this.quotations.findQuotationIdForRequest(row.id),
    ]);

    const current = findCurrentStatusTransition(transitions, row.status);
    const reasons: AdminRequestReasons = selectCurrentReasons({
      status: row.status,
      cancelledReason: row.cancelledReason,
      cancelledCustomerReason: row.cancelledCustomerReason,
      transitionReason: current?.reason,
      transitionCustomerVisibleReason: current?.customerVisibleReason,
    });

    return {
      requestId: row.id,
      code: row.code,
      status: row.status,
      // Creation writes no transition row (`G01-D05`), so the request's own
      // `created_at` is its submission instant. No synthetic first history entry
      // is added to make the timeline look complete.
      submittedAt: row.createdAt,
      updatedAt: row.updatedAt,
      customerNote: row.customerNote,
      internalReason: reasons.internalReason,
      customerVisibleReason: reasons.customerVisibleReason,
      customer: customer === undefined ? undefined : toCustomerView(customer),
      subject: projectDetailSubject(row, labels, customerOwnedProduct),
      quantities,
      totalQuantity: quantities.reduce((total, line) => total + line.quantity, 0),
      assets: await this.describeAssets(assetLinks),
      transitions: transitions.map(toTransitionView),
      moderationNotes: notes.map(toNoteView),
      quotationId,
    };
  }

  /** Catalog labels, asked for only when there is a catalog subject to name. */
  private async labelsFor(row: AdminRequestDetailRow): Promise<CatalogSubjectLabels | undefined> {
    if (row.productId === undefined || row.productVariantId === undefined) {
      return undefined;
    }
    return this.catalog.findSubjectLabels({
      productId: row.productId,
      productVariantId: row.productVariantId,
    });
  }

  /**
   * Attachment metadata for the whole request in one statement.
   *
   * `findScopedByIds` is the read-only sibling of the binder's locking read: it
   * reports rather than acts, so it takes no share lock a report has no business
   * holding. The scope is the same `CUSTOMER_UPLOAD` / `CUSTOMER_PRIVATE` pair,
   * so an id outside it is simply absent — the link is still listed, with its
   * metadata unresolved, because the association is a fact of this request even
   * when the file behind it has been tombstoned.
   */
  private async describeAssets(
    links: readonly { readonly assetId: string; readonly role: string; readonly linkedAt: Date }[],
  ): Promise<readonly AdminRequestAssetView[]> {
    if (links.length === 0) {
      return [];
    }
    const assets = await this.assets.findScopedByIds(
      links.map((link) => link.assetId as AssetId),
      BINDABLE_SCOPE,
    );
    const byId = new Map(assets.map((asset) => [String(asset.id), asset]));

    return links.map((link) => {
      const asset = byId.get(link.assetId);
      return {
        assetId: link.assetId,
        role: link.role,
        linkedAt: link.linkedAt,
        mimeType: asset?.mimeType,
        // `bigint` — serialized as a decimal string, never as a JSON number: a
        // byte count beyond 2^53 would lose precision as a float.
        sizeBytes: asset === undefined ? undefined : asset.sizeBytes.toString(),
        status: asset?.status,
      };
    });
  }
}

function toCustomerView(summary: AdminCustomerSummary): AdminRequestCustomerView {
  return {
    customerId: summary.customerId,
    displayName: summary.displayName,
    verifiedAt: summary.verifiedAt,
    contacts: summary.contacts.map((contact) => ({
      kind: contact.kind,
      maskedValue: contact.maskedValue,
      verified: contact.verified,
      primary: contact.primary,
    })),
  };
}

/**
 * The history projection.
 *
 * Written field by field, so the two reason columns land in two differently
 * named members and a later edit cannot merge them by accident (§10).
 */
function toTransitionView(row: AdminRequestTransitionRow): AdminRequestTransitionView {
  return {
    sequence: row.sequence,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    actorKind: row.actorKind,
    actorAdminId: row.adminId,
    actorCustomerId: row.customerId,
    internalReason: row.reason,
    customerVisibleReason: row.customerVisibleReason,
    occurredAt: row.occurredAt,
  };
}

function toNoteView(row: AdminRequestModerationNoteRow): AdminRequestNoteView {
  return {
    sequence: row.sequence,
    kind: row.kind,
    note: row.note,
    adminId: row.adminId,
    createdAt: row.createdAt,
  };
}
