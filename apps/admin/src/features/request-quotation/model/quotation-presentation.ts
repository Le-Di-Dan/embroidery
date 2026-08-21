/**
 * How the accepted quotation contracts become operator-facing text and one
 * selected version (`APP6-A01` §7, §13).
 *
 * Everything here is total: every input produces a presentation, and none of
 * them echoes a raw server token at the operator. An unmapped enum member
 * degrades to a neutral label rather than putting `SUPERSEDED` on the screen.
 *
 * ### The two version pointers are different things, and stay different
 *
 * `quotation.currentVersionId` is the **customer-current** version — the one
 * `APP6-B03`'s send transaction advanced, and the only one the customer can see.
 * The **selected** version is an Admin authoring concern: which version this
 * screen is showing. Before the first send there is no customer-current version
 * at all, and calling the newest DRAFT "current" then would be inventing a
 * pointer semantics the contract does not have.
 *
 * So they are computed separately and labelled separately, and the selected
 * version is never described to the operator as what the customer is looking at.
 */
import type {
  AdminCustomRequestDetailResponse,
  AdminQuotationHeaderResponse,
  AdminQuotationVersionResponse,
} from '@embroidery/api-client';

import { REQUEST_QUOTATION_COPY as COPY } from './request-quotation-copy';

const VERSION_STATUS_LABELS: Readonly<Record<string, string>> = {
  DRAFT: COPY.versionStatus.DRAFT,
  SENT: COPY.versionStatus.SENT,
  ACCEPTED: COPY.versionStatus.ACCEPTED,
  REJECTED: COPY.versionStatus.REJECTED,
  SUPERSEDED: COPY.versionStatus.SUPERSEDED,
  EXPIRED: COPY.versionStatus.EXPIRED,
};

const LINE_KIND_LABELS: Readonly<Record<string, string>> = {
  PRODUCT: COPY.lineKinds.PRODUCT,
  EMBROIDERY: COPY.lineKinds.EMBROIDERY,
  DIGITIZING_FEE: COPY.lineKinds.DIGITIZING_FEE,
  OTHER: COPY.lineKinds.OTHER,
  SHIPPING: COPY.lineKinds.SHIPPING,
  ADJUSTMENT: COPY.lineKinds.ADJUSTMENT,
};

export function presentVersionStatus(status: string): string {
  return VERSION_STATUS_LABELS[status] ?? COPY.versionStatus.unknown;
}

export function presentLineKind(kind: string): string {
  return LINE_KIND_LABELS[kind] ?? COPY.lineKinds.OTHER;
}

/** An ISO instant as the operator reads it, or a dash when there is none. */
export function presentInstant(instant: string | null | undefined): string {
  if (instant === null || instant === undefined || instant === '') {
    return '—';
  }
  const parsed = new Date(instant);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }
  return parsed.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

/** The two subject branches, read from the discriminator and never sniffed. */
export type SubjectKind = 'CATALOG' | 'CUSTOMER_OWNED' | 'UNKNOWN';

export function subjectKindOf(detail: AdminCustomRequestDetailResponse): SubjectKind {
  const subject = detail.subject;
  if (subject === undefined || subject === null) {
    return 'UNKNOWN';
  }
  const kind = (subject as { readonly kind?: unknown }).kind;
  if (kind === 'CATALOG') return 'CATALOG';
  if (kind === 'CUSTOMER_OWNED') return 'CUSTOMER_OWNED';
  return 'UNKNOWN';
}

/** A version whose state forbids any further mutation of it. */
export function isImmutableVersion(version: AdminQuotationVersionResponse): boolean {
  return version.status !== 'DRAFT';
}

/**
 * Whether this version is the one the send action may target.
 *
 * DRAFT only, and the screen still does not decide the outcome: `APP6-B03`
 * re-checks sendability inside its transaction and may refuse. This governs
 * whether the control is *offered*, which is a different question from whether
 * the send will succeed.
 */
export function isSendable(version: AdminQuotationVersionResponse): boolean {
  return version.status === 'DRAFT';
}

/**
 * The version the workbench should show, given the history and what the operator
 * has picked.
 *
 * An explicit pick wins whenever it still exists in the history — a version that
 * has vanished must not keep the screen pointed at it, so the selection falls
 * back rather than rendering nothing. With no pick, the rule is the accepted
 * workflow's: the newest DRAFT is the working version, and when there is none the
 * newest version overall is what the operator is looking at.
 *
 * Server order is preserved throughout: `APP6-B02` returns versions oldest first
 * by version number, and this reads from the end rather than re-sorting.
 */
export function resolveSelectedVersion(
  versions: readonly AdminQuotationVersionResponse[],
  pickedVersionId: string | null,
): AdminQuotationVersionResponse | undefined {
  if (versions.length === 0) {
    return undefined;
  }
  if (pickedVersionId !== null) {
    const picked = versions.find((version) => version.versionId === pickedVersionId);
    if (picked !== undefined) {
      return picked;
    }
  }
  for (let index = versions.length - 1; index >= 0; index -= 1) {
    const candidate = versions[index];
    if (candidate !== undefined && candidate.status === 'DRAFT') {
      return candidate;
    }
  }
  return versions[versions.length - 1];
}

/**
 * Whether this version is the customer-current one.
 *
 * `null` before the first send, and the comparison is against the header pointer
 * rather than against a status: two versions can both be non-DRAFT, and only the
 * pointer says which one the customer is actually looking at.
 */
export function isCustomerCurrent(
  header: AdminQuotationHeaderResponse,
  version: AdminQuotationVersionResponse,
): boolean {
  return header.currentVersionId !== null && header.currentVersionId === version.versionId;
}

/**
 * Whether the quotation has been accepted and this screen must offer no
 * authoring at all.
 *
 * Read from the **header**, which is the quotation's own lifecycle, rather than
 * from the request status: `FU-APP6-B03-REQUOTE-AFTER-ACCEPTANCE-01` records that
 * `APP6-B03` refuses a re-quote after acceptance and that no reopen edge exists,
 * so a screen that offered one would offer an action the API cannot perform.
 */
export function isAcceptedQuotation(header: AdminQuotationHeaderResponse): boolean {
  return header.quotationStatus === 'ACCEPTED';
}
