/**
 * The Admin read of the request queue and one request (`APP5-B04` §12).
 *
 * A **third** contract beside {@link CustomRequestRepository} (the AGG-13 write
 * side) and `CustomRequestStatusRepository` (`APP5-B03`'s customer projection),
 * and the split is by audience, not by convenience.
 *
 * The write repository can `transition()`; nothing on this surface may, and a
 * read model that held the method would be one refactor away from calling it.
 * The customer projection deliberately cannot express an internal reason, an
 * actor, a moderation note or a correlation id — B04 legitimately reads all of
 * those, so widening that contract would quietly widen what the *customer*
 * surface is able to return. Two narrow contracts keep each surface's absences
 * a property of its SELECT list.
 *
 * `AGG-13` ownership does not move: every statement behind this port is against
 * Ordering's own tables (TBL-037, TBL-038, TBL-039, TBL-040, TBL-041, TBL-042).
 * Catalog labels, customer evidence and asset metadata are not joined here —
 * they arrive through their own contexts' ports (`APP5-B04` §12).
 */
import type { CustomRequestState } from '@embroidery/database';

import type {
  ProductId,
  ProductVariantId,
} from '../../../catalog/domain/repositories/placement-hierarchy.port';
import type { CustomRequestId } from './custom-request.repository';

/** The subject branch, decided by the row rather than by the caller. */
export type AdminRequestSubjectKind = 'CATALOG' | 'CUSTOMER_OWNED';

/**
 * One queue row, as the database holds it.
 *
 * No `customer_note`, no `cancelled_reason`, no `cancelled_customer_reason` and
 * no `current_quotation_id`: a triage list shows what needs attention, and the
 * moderation evidence belongs to the detail read that an operator opens
 * deliberately. `customerId` is here because the row has to be joined to a
 * person; it is projected to the operator as a name and masked contacts, never
 * as an identity-graph handle they can query by.
 */
export interface AdminRequestQueueRow {
  readonly id: CustomRequestId;
  readonly code: string;
  readonly status: CustomRequestState;
  readonly customerId: string;
  readonly createdAt: Date;
  /** Present exactly on the catalog branch (`APP5-G01` §3). */
  readonly productId: ProductId | undefined;
}

/** The queue's filter set (`APP5-B04` §6). Every member is optional. */
export interface AdminRequestQueueFilter {
  /**
   * The statuses to include.
   *
   * Always populated by the caller — the default triage set when the operator
   * named none — so the repository never has to decide policy. An empty array
   * would mean "no rows", which no caller wants and this contract forbids.
   */
  readonly statuses: readonly CustomRequestState[];
  readonly subjectKind: AdminRequestSubjectKind | undefined;
  /** Exact `custom_requests.code`, uppercased by the schema before it arrives. */
  readonly code: string | undefined;
  readonly customerId: string | undefined;
  readonly submittedFrom: Date | undefined;
  readonly submittedTo: Date | undefined;
}

/** Keyset position: the ordering values of the last row of the previous page. */
export interface AdminRequestQueuePosition {
  readonly createdAt: Date;
  readonly id: string;
}

export interface AdminRequestQueueQuery {
  readonly filter: AdminRequestQueueFilter;
  readonly after: AdminRequestQueuePosition | undefined;
  /** The repository fetches `limit + 1`, so the caller can detect a next page. */
  readonly limit: number;
}

/** The request root for the detail read. Wider than the queue row, by design. */
export interface AdminRequestDetailRow {
  readonly id: CustomRequestId;
  readonly code: string;
  readonly status: CustomRequestState;
  readonly customerId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly productId: ProductId | undefined;
  readonly productVariantId: ProductVariantId | undefined;
  readonly customerNote: string | undefined;
  /** COL-TBL037-08 — the **internal** half. Never collapsed with the next one. */
  readonly cancelledReason: string | undefined;
  /** COL-TBL037-09 — the customer-facing half. */
  readonly cancelledCustomerReason: string | undefined;
  /**
   * `G01-D09` server-written provenance: the design session the submission came
   * from. The raw session id is never an authorization input on its own
   * (`design_sessions` header), so publishing it to an authenticated operator
   * discloses no credential — `session_secret_hash` is not read here at all.
   */
  readonly submittedSessionId: string | undefined;
}

/** TBL-039, truthful for both branches: the variant is NULL on a COP line. */
export interface AdminRequestQuantityLine {
  readonly productVariantId: ProductVariantId | undefined;
  readonly sizeLabel: string | undefined;
  readonly quantity: number;
}

/** TBL-038. `numeric` dimensions cross as strings, never as floats. */
export interface AdminRequestCustomerOwnedProduct {
  readonly name: string;
  readonly description: string | undefined;
  readonly physicalWidthMm: string | undefined;
  readonly physicalHeightMm: string | undefined;
}

/** TBL-040 — the association. Asset owns the file's metadata (`APP5-B04` §9.4). */
export interface AdminRequestAssetLink {
  readonly assetId: string;
  readonly role: string;
  readonly linkedAt: Date;
}

/**
 * TBL-042, as Admin evidence.
 *
 * `correlationId` is not a member: §9.5 enumerates what the history must carry
 * and a trace handle is not among it, so it is not selected. `systemJobKey` is
 * likewise absent — no APP5 transition has a system actor today, and a column
 * nothing writes would be a field the response promises and never fills.
 */
export interface AdminRequestTransitionRow {
  readonly sequence: number;
  readonly fromStatus: CustomRequestState;
  readonly toStatus: CustomRequestState;
  readonly actorKind: string;
  readonly adminId: string | undefined;
  readonly customerId: string | undefined;
  /** The internal reason. Distinct from the next field, and stays distinct. */
  readonly reason: string | undefined;
  readonly customerVisibleReason: string | undefined;
  readonly occurredAt: Date;
}

/** TBL-041 — internal, append-only. Read here; written by `APP5-B05`. */
export interface AdminRequestModerationNoteRow {
  readonly sequence: number;
  readonly kind: string;
  readonly note: string;
  readonly adminId: string;
  readonly createdAt: Date;
}

export const CUSTOM_REQUEST_ADMIN_REPOSITORY = Symbol('CUSTOM_REQUEST_ADMIN_REPOSITORY');

export interface CustomRequestAdminRepository {
  /** One keyset page plus the probe row, ordered `created_at DESC, id DESC`. */
  listQueue(query: AdminRequestQueueQuery): Promise<AdminRequestQueueRow[]>;

  /**
   * Customer-owned-product names for a whole page, in one statement.
   *
   * The queue's COP branch needs a label and nothing else, so this returns the
   * name alone rather than the whole TBL-038 row — and it is batched because a
   * per-row lookup is the N+1 §8 forbids.
   */
  loadQueueCustomerOwnedNames(
    requestIds: readonly CustomRequestId[],
  ): Promise<ReadonlyMap<string, string>>;

  /** Total units per request for a whole page, summed in the database. */
  loadQueueQuantityTotals(
    requestIds: readonly CustomRequestId[],
  ): Promise<ReadonlyMap<string, number>>;

  /** The detail root, or nothing. Absence is the caller's 404 to report. */
  findDetail(id: CustomRequestId): Promise<AdminRequestDetailRow | undefined>;

  loadQuantityLines(id: CustomRequestId): Promise<AdminRequestQuantityLine[]>;

  loadCustomerOwnedProduct(
    id: CustomRequestId,
  ): Promise<AdminRequestCustomerOwnedProduct | undefined>;

  loadAssetLinks(id: CustomRequestId): Promise<AdminRequestAssetLink[]>;

  /**
   * The whole transition history, oldest first.
   *
   * Ordered by the append sequence rather than by `created_at`: TBL-042's id is
   * the sequence (IDX-100), and two moves committed in one transaction can share
   * a timestamp. Creation writes no row (`G01-D05`), so an unmoderated request
   * has an empty history and no synthetic first entry is added anywhere.
   */
  loadTransitions(id: CustomRequestId): Promise<AdminRequestTransitionRow[]>;

  /** Moderation notes, oldest first, by the same append sequence. */
  loadModerationNotes(id: CustomRequestId): Promise<AdminRequestModerationNoteRow[]>;
}
