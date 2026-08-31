/**
 * The authoring form model: authoritative record in, exact PATCH body out.
 *
 * ## Only changed fields are sent
 *
 * The body is diffed against the record the form was seeded from, not against
 * "whatever the inputs hold". A field the operator never touched is absent from
 * the request, so a concurrent change to it is preserved rather than
 * overwritten with a stale echo.
 *
 * ## Cleared is not the same as untouched
 *
 * `linkedProductId`, `seoTitle` and `seoDescription` are the three fields the
 * contract lets a caller clear, and `null` is how it says so. An omitted field
 * could never express "remove this", and a form that always sent them would
 * wipe SEO text the operator never looked at. So the diff — not the input's
 * emptiness — decides which of the two happens.
 *
 * ## What is not editable here, and why each one is not
 *
 * ```text
 * slug         chosen once at create; the contract rejects it on PATCH
 * status       APP11-B02 owns every transition; the panel commands them
 * assets       replaced as a complete ordered set by its own operation
 * archivedAt   lifecycle evidence the server writes; never a client input
 * ```
 *
 * None of them appears in `GalleryAuthoringValues`, so the form cannot send one
 * by accident — the absence is structural rather than a rule a component has to
 * remember.
 *
 * The authoring PATCH is deliberately **token-free** (`FU-APP11-B01-01`): the
 * contract publishes no `expectedUpdatedAt` on this body, so none is invented
 * here. Media and publication remain guarded, and those are the operations that
 * carry the token.
 */
import type {
  AdminGalleryEntryDetailResponse,
  UpdateGalleryEntryBody,
} from '@embroidery/api-client';

import { parseDisplayOrder } from './gallery-create-values';

const SEO_TITLE_MAX_LENGTH = 200;
const SEO_DESCRIPTION_MAX_LENGTH = 320;
const TITLE_MAX_LENGTH = 200;

/** What the inputs hold. Numbers are raw strings, exactly as typed. */
export interface GalleryAuthoringValues {
  readonly title: string;
  readonly description: string;
  readonly displayOrder: string;
  /** Empty string means "no product linked", which is a value the operator can set. */
  readonly linkedProductId: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly isIndexable: boolean;
}

/** Seeds the form from the authoritative record. */
export function authoringValuesFromDetail(
  entry: AdminGalleryEntryDetailResponse,
): GalleryAuthoringValues {
  return {
    title: entry.title,
    description: entry.description,
    displayOrder: String(entry.displayOrder),
    linkedProductId: entry.linkedProductId ?? '',
    seoTitle: entry.seoTitle ?? '',
    seoDescription: entry.seoDescription ?? '',
    isIndexable: entry.isIndexable,
  };
}

export interface GalleryAuthoringErrors {
  readonly title?: string;
  readonly displayOrder?: string;
  readonly seoTitle?: string;
  readonly seoDescription?: string;
}

export interface GalleryAuthoringMessages {
  readonly titleRequired: string;
  readonly displayOrderInvalid: string;
  readonly seoTitleTooLong: string;
  readonly seoDescriptionTooLong: string;
}

/**
 * Client-side validation mirrors the update contract's bounds.
 *
 * `description` is deliberately **not** required here even though publication
 * requires it. The contract accepts an empty description on PATCH, and refusing
 * to save one would trap an operator who cleared it mid-edit with no way to
 * persist the rest of their work. The publication panel is where an empty
 * description is reported, because that is where it actually blocks something.
 */
export function validateGalleryAuthoring(
  values: GalleryAuthoringValues,
  messages: GalleryAuthoringMessages,
): GalleryAuthoringErrors {
  const errors: {
    title?: string;
    displayOrder?: string;
    seoTitle?: string;
    seoDescription?: string;
  } = {};

  const title = values.title.trim();
  if (title === '' || title.length > TITLE_MAX_LENGTH) {
    errors.title = messages.titleRequired;
  }
  if (parseDisplayOrder(values.displayOrder) === null) {
    errors.displayOrder = messages.displayOrderInvalid;
  }
  if (values.seoTitle.trim().length > SEO_TITLE_MAX_LENGTH) {
    errors.seoTitle = messages.seoTitleTooLong;
  }
  if (values.seoDescription.trim().length > SEO_DESCRIPTION_MAX_LENGTH) {
    errors.seoDescription = messages.seoDescriptionTooLong;
  }
  return errors;
}

export function hasGalleryAuthoringErrors(errors: GalleryAuthoringErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}

/**
 * A nullable text field's diff: `undefined` to omit, a string to set, `null` to
 * clear. Trimmed on both sides so re-saving a value whose only change is
 * surrounding whitespace sends nothing.
 */
function diffNullableText(initial: string, current: string): string | null | undefined {
  const before = initial.trim();
  const after = current.trim();
  if (before === after) {
    return undefined;
  }
  return after === '' ? null : after;
}

/**
 * The PATCH body: exactly the fields that changed, and nothing else.
 *
 * Returns `null` when nothing changed, which the caller treats as "no request
 * to make" rather than sending an empty body the server would have to
 * interpret.
 */
export function buildGalleryUpdateBody(
  initial: GalleryAuthoringValues,
  current: GalleryAuthoringValues,
): UpdateGalleryEntryBody | null {
  const body: {
    title?: string;
    description?: string;
    displayOrder?: number;
    linkedProductId?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    isIndexable?: boolean;
  } = {};
  let changed = false;

  const title = current.title.trim();
  if (title !== initial.title.trim() && title !== '') {
    body.title = title;
    changed = true;
  }

  // `description` is NOT NULL on the record, so it is set — never cleared to
  // null — and an empty string is a legitimate value the contract accepts.
  const description = current.description.trim();
  if (description !== initial.description.trim()) {
    body.description = description;
    changed = true;
  }

  const displayOrder = parseDisplayOrder(current.displayOrder);
  if (displayOrder !== null && displayOrder !== parseDisplayOrder(initial.displayOrder)) {
    body.displayOrder = displayOrder;
    changed = true;
  }

  const linkedProductId = diffNullableText(initial.linkedProductId, current.linkedProductId);
  if (linkedProductId !== undefined) {
    body.linkedProductId = linkedProductId;
    changed = true;
  }

  const seoTitle = diffNullableText(initial.seoTitle, current.seoTitle);
  if (seoTitle !== undefined) {
    body.seoTitle = seoTitle;
    changed = true;
  }

  const seoDescription = diffNullableText(initial.seoDescription, current.seoDescription);
  if (seoDescription !== undefined) {
    body.seoDescription = seoDescription;
    changed = true;
  }

  if (current.isIndexable !== initial.isIndexable) {
    body.isIndexable = current.isIndexable;
    changed = true;
  }

  return changed ? body : null;
}

/**
 * Dirty state is "a save would send something", computed from the same diff the
 * request uses. Deriving both from one function is what keeps the
 * unsaved-change prompt honest: the screen can never warn about changes it
 * would not send, or stay silent about changes it would.
 */
export function isGalleryAuthoringDirty(
  initial: GalleryAuthoringValues,
  current: GalleryAuthoringValues,
): boolean {
  return buildGalleryUpdateBody(initial, current) !== null;
}
