/**
 * How `APP5-B04`'s detail response becomes operator-facing text.
 *
 * Everything here is total: every input produces a presentation, and none of
 * them echoes a raw server token. An unmapped enum member degrades to a neutral
 * label rather than putting `NEEDS_CLARIFICATION` in front of an operator.
 *
 * A label is never colour alone (`CLAUDE.md` accessibility): the status badge
 * always renders text, and the tint the stylesheet adds is a redundant cue.
 *
 * ### The subject branch is read from `kind`, never sniffed
 *
 * `APP5-G01` §3 makes the subject a XOR and the contract publishes a `kind`
 * discriminator on both members. Detecting the branch by asking which nullable
 * field happens to be present would break on exactly the request this screen
 * exists for: a catalog product whose labels no longer resolve publishes
 * `productName`, `productSlug`, `variantColorName` and `variantSizeLabel` all
 * absent, and a sniffing reader would call it customer-owned and render a COP
 * panel for a store product.
 */
import type {
  AdminCatalogSubjectResponse,
  AdminCustomerOwnedSubjectResponse,
  AdminCustomRequestDetailResponse,
  AdminRequestAssetResponse,
  AdminRequestContactResponse,
  AdminRequestModerationNoteResponse,
  AdminRequestTransitionResponse,
} from '@embroidery/api-client';

import {
  presentRequestStatusDetail,
  type RequestStatusPresentation,
} from '../../../shared/presentation/request-status';
import { CUSTOM_REQUEST_DETAIL_COPY as COPY } from './custom-request-detail-copy';
import type { EvidenceFailure } from './custom-request-detail-failure';

/**
 * Re-exported from the Admin-shared presenter (`APP6-A02` §11).
 *
 * The private ten-status map that used to live here was one of three copies of
 * the same vocabulary — `APP6-A01` carried the second, and the design-case
 * workbench would have been the third. It now lives in
 * `shared/presentation/request-status`, with the same copy and the same neutral
 * fallback, so a request cannot change its name as an operator moves between
 * the three screens. The shape this screen consumes is unchanged, so no
 * component in this feature changed.
 *
 * The alias is deliberate: `presentStatus` is what this feature's components
 * already call, and renaming them would be churn for no behavioural gain.
 */
export type StatusPresentation = RequestStatusPresentation;
export const presentStatus = presentRequestStatusDetail;

/** The two subject branches, as this screen renders them. */
export type SubjectBranch =
  | { readonly kind: 'CATALOG'; readonly subject: AdminCatalogSubjectResponse }
  | { readonly kind: 'CUSTOMER_OWNED'; readonly subject: AdminCustomerOwnedSubjectResponse }
  | { readonly kind: 'UNKNOWN' };

/**
 * Which branch of the XOR this request is, from the discriminator alone.
 *
 * `subject` is optional in the contract, so a request whose subject row is gone
 * resolves to `UNKNOWN` and the screen states that rather than rendering an
 * empty catalog panel.
 */
export function resolveSubjectBranch(
  detail: Pick<AdminCustomRequestDetailResponse, 'subject'>,
): SubjectBranch {
  const subject = detail.subject;
  if (subject === undefined) return { kind: 'UNKNOWN' };
  if (subject.kind === 'CATALOG') {
    return { kind: 'CATALOG', subject };
  }
  if (subject.kind === 'CUSTOMER_OWNED') {
    return { kind: 'CUSTOMER_OWNED', subject };
  }
  return { kind: 'UNKNOWN' };
}

export function subjectKindLabel(branch: SubjectBranch): string {
  switch (branch.kind) {
    case 'CATALOG':
      return COPY.subject.catalog;
    case 'CUSTOMER_OWNED':
      return COPY.subject.customerOwned;
    default:
      return COPY.subject.unknown;
  }
}

/**
 * A contract field the server may legitimately omit, as a rendered string.
 *
 * The absence is reported — "không còn thông tin" — rather than blanked, so a
 * label the server could not resolve reads as missing instead of as an empty
 * cell the operator might mistake for a value.
 */
export function presentOptional(value: string | undefined): string {
  return value === undefined || value.trim() === '' ? COPY.subject.unavailableLabel : value;
}

const CONTACT_KIND_LABELS: Readonly<Record<string, string>> = {
  EMAIL: COPY.customer.email,
  PHONE: COPY.customer.phone,
};

export interface ContactPresentation {
  readonly kindLabel: string;
  /** `APP4-P01`'s deterministic mask. The raw value is never published. */
  readonly maskedValue: string;
  readonly primary: boolean;
  readonly verifiedLabel: string;
}

export function presentContact(contact: AdminRequestContactResponse): ContactPresentation {
  return {
    kindLabel: CONTACT_KIND_LABELS[contact.kind] ?? COPY.subject.unknown,
    maskedValue: contact.maskedValue,
    primary: contact.primary,
    verifiedLabel: contact.verified ? COPY.customer.verified : COPY.customer.unverified,
  };
}

const ROLE_LABELS: Readonly<Record<string, string>> = {
  COP_IMAGE: COPY.evidence.roleCopImage,
  REFERENCE: COPY.evidence.roleReference,
};

/**
 * The roles this screen may open (`APP5-A02` §8).
 *
 * `ATTACHMENT` is not in the Admin contract's enum at all, so filtering by this
 * set is a second, explicit guarantee rather than a restatement of the type: an
 * asset carrying a role the client does not recognise is listed and never
 * fetched.
 */
export const VIEWABLE_ASSET_ROLES: readonly string[] = ['COP_IMAGE', 'REFERENCE'] as const;

export function isViewableAsset(asset: AdminRequestAssetResponse): boolean {
  // A tombstoned file publishes no `mimeType` while the association stays
  // listed. Requesting it would be a call that is certain to be refused.
  return VIEWABLE_ASSET_ROLES.includes(asset.role) && asset.mimeType !== undefined;
}

export function assetRoleLabel(role: string): string {
  return ROLE_LABELS[role] ?? COPY.evidence.roleUnknown;
}

/**
 * Alt text for one evidence image: its role and its position within that role.
 *
 * Never the asset id. An operator reading "COP_IMAGE 01940000-…" learns nothing,
 * and a raw identifier read aloud by a screen reader is noise standing where a
 * description belongs.
 */
export function assetAltText(role: string, positionInRole: number): string {
  return COPY.evidence.altText(assetRoleLabel(role), positionInRole);
}

/**
 * What one evidence slot says while it has no image to show.
 *
 * Three inputs collapse to two sentences on purpose. An asset the screen refused
 * to request, one the server refused to serve and one the session may no longer
 * read are all "không mở được ảnh này" — the operator's next step is the same in
 * every case, and distinguishing them is precisely the disclosure `APP5-B06`
 * avoids. Only the transient band gets its own wording, because only there does
 * a retry mean anything.
 */
export function evidenceStateCopy(viewable: boolean, failure: EvidenceFailure | null): string {
  if (!viewable) return COPY.evidence.unavailable;
  if (failure === 'retryable') return COPY.evidence.retryable;
  if (failure !== null) return COPY.evidence.unavailable;
  return COPY.evidence.loading;
}

const BYTES_PER_UNIT = 1024;
const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/**
 * `sizeBytes` as a readable size.
 *
 * The contract sends it as a **decimal string** because the column is a
 * `bigint`, so it is parsed defensively and an unparseable value degrades to the
 * unavailable label rather than rendering `NaN`.
 */
export function presentByteSize(sizeBytes: string | undefined): string {
  if (sizeBytes === undefined) return COPY.subject.unavailableLabel;
  const parsed = Number(sizeBytes);
  if (!Number.isFinite(parsed) || parsed < 0) return COPY.subject.unavailableLabel;

  let value = parsed;
  let unit = 0;
  while (value >= BYTES_PER_UNIT && unit < UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unit += 1;
  }
  const rendered = unit === 0 ? String(Math.round(value)) : value.toFixed(1);
  return `${rendered} ${UNITS[unit] as string}`;
}

const ACTOR_LABELS: Readonly<Record<string, string>> = {
  ADMIN: COPY.history.actorAdmin,
  CUSTOMER: COPY.history.actorCustomer,
  SYSTEM: COPY.history.actorSystem,
};

/**
 * Who moved the request, as a *kind* and never as a name.
 *
 * `actorAdminId` and `actorCustomerId` are ids, and this surface has no
 * authorized way to resolve either into a person. Printing "Nhân viên" is
 * truthful; inventing a name from an id would not be.
 */
export function actorLabel(transition: AdminRequestTransitionResponse): string {
  return ACTOR_LABELS[transition.actorKind] ?? COPY.history.actorUnknown;
}

const NOTE_KIND_LABELS: Readonly<Record<string, string>> = {
  SPAM: COPY.notes.kindSpam,
  REJECT: COPY.notes.kindReject,
  PAUSE: COPY.notes.kindPause,
  CLARIFY: COPY.notes.kindClarify,
  NOTE: COPY.notes.kindNote,
};

export function noteKindLabel(note: AdminRequestModerationNoteResponse): string {
  return NOTE_KIND_LABELS[note.kind] ?? COPY.notes.kindUnknown;
}

/**
 * An ISO instant as the operator's local date and time.
 *
 * A malformed instant renders as the unavailable label — never as
 * "Invalid Date", which looks like a bug report rather than an absence.
 */
export function presentInstant(iso: string | undefined): string {
  if (iso === undefined) return COPY.subject.unavailableLabel;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return COPY.subject.unavailableLabel;
  return parsed.toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
}
