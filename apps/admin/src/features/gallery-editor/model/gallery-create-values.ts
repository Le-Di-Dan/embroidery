/**
 * The create-bootstrap form model: what the inputs hold, and the exact body the
 * create operation accepts.
 *
 * ## Why there is a bootstrap and not a `/gallery/new` screen
 *
 * The approved route authority has two Admin gallery addresses — the list and
 * `/gallery/{entryId}` — and the editor is addressed by an id only the server
 * can issue. A full create screen would therefore be a second editor that
 * cannot save anything except by first creating the record, which is exactly
 * what this small interaction does with far less surface. It asks for the
 * fields the create body actually requires and nothing else.
 *
 * ## The field set is the contract's, not a design preference
 *
 * `CreateGalleryEntryBody` requires `title`, `slug`, `description`,
 * `displayOrder` and `isIndexable`. `isIndexable` is included **because the
 * generated request declares it required** — supplying a default here would be
 * this screen deciding a published entry's crawlability on the operator's
 * behalf. `linkedProductId`, `seoTitle` and `seoDescription` are optional on
 * the body and belong to the editor, so they are not asked for here. `status`,
 * `assets` and `archivedAt` are not part of the body at all: creation is always
 * a DRAFT, media is a separate operation, and archival is not something this
 * build performs.
 *
 * ## The slug is explicit and caller-owned
 *
 * It is shown, validated against the canonical public grammar before the
 * request is sent, and never generated silently. A suggestion from the title is
 * offered as an action the operator triggers and can then edit — because the
 * value becomes the entry's permanent public address, and a hidden default
 * would be a permanent decision nobody made. Nothing here promises that it can
 * be changed later; it cannot.
 */
import type { CreateGalleryEntryBody } from '@embroidery/api-client';

/** What the inputs hold. Numbers are raw strings, exactly as typed. */
export interface GalleryCreateValues {
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly displayOrder: string;
  readonly isIndexable: boolean;
}

/**
 * The starting state.
 *
 * `displayOrder` starts at `0` — the smallest value the contract accepts, and
 * the position the approved help text describes as first. It is a visible,
 * editable value in the form, not a hidden default: the operator sees the
 * number the entry will be created with.
 *
 * `isIndexable` starts `true` because an entry authored to be shown is normally
 * meant to be found, and the control sits beside it with the approved
 * explanation of what turning it off does — and does not do.
 */
export const EMPTY_GALLERY_CREATE_VALUES: GalleryCreateValues = {
  title: '',
  slug: '',
  description: '',
  displayOrder: '0',
  isIndexable: true,
};

/**
 * The canonical public slug grammar, mirroring the contract's own pattern:
 * lowercase alphanumeric groups joined by single hyphens, no leading, trailing
 * or doubled hyphen, and nothing else. Validating here does not make this
 * screen the authority — the server re-validates — it only means a request is
 * worth sending.
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX_LENGTH = 80;
const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 4000;
/** The contract's own upper bound for `displayOrder`. */
const DISPLAY_ORDER_MAX = 2147483647;

export function isCanonicalGallerySlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(slug);
}

/**
 * A non-negative integer within the contract's range, or `null`.
 *
 * Parsed strictly from the digits the operator typed rather than through
 * `Number`, which would accept `1e3`, `0x10`, `  7  ` and `1.0` and persist
 * something other than what was entered.
 */
export function parseDisplayOrder(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number.parseInt(trimmed, 10);
  return value > DISPLAY_ORDER_MAX ? null : value;
}

/**
 * A slug suggestion from a title.
 *
 * Vietnamese diacritics are decomposed and their combining marks dropped, `đ`
 * is mapped explicitly because it is not a decomposable form, and everything
 * that is not a lowercase alphanumeric becomes a single hyphen. The result is
 * a *suggestion*: it is written into the visible field, where the operator can
 * change it, and it is never applied to a submission they did not see.
 */
export function suggestGallerySlug(title: string): string {
  return (
    title
      .normalize('NFD')
      // The combining marks NFD just separated out, by codepoint rather than by
      // literal: a literal range in this position is invisible in a diff and one
      // stray editor normalization away from silently matching nothing.
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, SLUG_MAX_LENGTH)
      .replace(/-+$/g, '')
  );
}

export interface GalleryCreateErrors {
  readonly title?: string;
  readonly slug?: string;
  readonly description?: string;
  readonly displayOrder?: string;
}

export interface GalleryCreateMessages {
  readonly titleRequired: string;
  readonly slugRequired: string;
  readonly slugInvalid: string;
  readonly descriptionRequired: string;
  readonly displayOrderInvalid: string;
}

/**
 * Client-side validation mirrors the create contract so the operator is not
 * made to round-trip for an empty title. The server remains the authority;
 * passing here only means the request is worth sending.
 */
export function validateGalleryCreate(
  values: GalleryCreateValues,
  messages: GalleryCreateMessages,
): GalleryCreateErrors {
  const errors: {
    title?: string;
    slug?: string;
    description?: string;
    displayOrder?: string;
  } = {};

  const title = values.title.trim();
  if (title === '' || title.length > TITLE_MAX_LENGTH) {
    errors.title = messages.titleRequired;
  }

  const slug = values.slug.trim();
  if (slug === '') {
    errors.slug = messages.slugRequired;
  } else if (!isCanonicalGallerySlug(slug)) {
    errors.slug = messages.slugInvalid;
  }

  // `description` is NOT NULL on the record and required for publication, so an
  // entry created without one could never be published without a second visit.
  const description = values.description.trim();
  if (description === '' || description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = messages.descriptionRequired;
  }

  if (parseDisplayOrder(values.displayOrder) === null) {
    errors.displayOrder = messages.displayOrderInvalid;
  }

  return errors;
}

export function hasGalleryCreateErrors(errors: GalleryCreateErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}

/**
 * The exact create body, or `null` when the values do not form one.
 *
 * Five fields, which are the five the contract requires. Nothing optional is
 * smuggled in: an entry is created, then edited — there is no hidden follow-up
 * PATCH behind this call.
 */
export function buildGalleryCreateBody(values: GalleryCreateValues): CreateGalleryEntryBody | null {
  const displayOrder = parseDisplayOrder(values.displayOrder);
  const title = values.title.trim();
  const slug = values.slug.trim();
  const description = values.description.trim();
  if (
    displayOrder === null ||
    title === '' ||
    description === '' ||
    !isCanonicalGallerySlug(slug)
  ) {
    return null;
  }
  return { title, slug, description, displayOrder, isIndexable: values.isIndexable };
}

/** Dirty as soon as the operator has typed anything the empty state did not hold. */
export function isGalleryCreateDirty(values: GalleryCreateValues): boolean {
  return (
    values.title.trim() !== '' ||
    values.slug.trim() !== '' ||
    values.description.trim() !== '' ||
    values.displayOrder !== EMPTY_GALLERY_CREATE_VALUES.displayOrder ||
    values.isIndexable !== EMPTY_GALLERY_CREATE_VALUES.isIndexable
  );
}
