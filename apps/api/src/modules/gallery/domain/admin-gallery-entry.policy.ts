/**
 * The locked authoring rules for an Admin gallery entry (`APP11-B01` §6).
 *
 * Everything here is a constant the API contract depends on, declared once so a
 * controller, a DTO and a use case cannot disagree about it. No value is
 * hard-coded at a call site (`CLAUDE.md` §5).
 *
 * Two rules shape the whole surface:
 *
 * - **Creation is DRAFT and nothing else.** A caller may not name a status on
 *   create or on patch; publication and archival are `APP11-B02`'s, through the
 *   repository's own `changeStatus`. So there is no editable-state set here —
 *   B01 never transitions anything.
 * - **The address is create-time.** `slug` is a public URL (`/bo-suu-tap/{slug}`
 *   in `APP11-B03`), so a rename would break every link that already pointed at
 *   the entry. It is accepted once, on create, and there is no field that moves
 *   it afterwards.
 */
import type { GalleryEntryState } from '@embroidery/database';

/** The one state a create may produce (LC-04 `DRAFT`). */
export const GALLERY_ENTRY_DRAFT_STATE = 'DRAFT' satisfies GalleryEntryState;

/**
 * The lifecycle values the Admin list filter accepts.
 *
 * Declared as literals rather than imported as a runtime value: presentation
 * must not pull the ORM schema namespace in (`BACKEND_CONVENTIONS.md` §3). The
 * assertion below is the safety net — if `GalleryEntryState` gains a member,
 * this file stops compiling instead of silently rejecting a valid filter.
 */
export const GALLERY_ENTRY_STATUS_FILTERS = [
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED',
] as const satisfies readonly GalleryEntryState[];

type MissingStatus = Exclude<GalleryEntryState, (typeof GALLERY_ENTRY_STATUS_FILTERS)[number]>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile-time exhaustiveness proof
type AssertNoMissingStatus = MissingStatus extends never ? true : ['missing', MissingStatus];

/**
 * The canonical public slug grammar, identical to the one the public product
 * and design-template routes already publish. A second slug format would mean
 * two definitions of what a public address looks like.
 */
export const GALLERY_ENTRY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * `gallery_entries.slug` is `text`, so the **column** imposes no limit. The cap
 * is policy, and it is the same 80 the catalog uses: it keeps a slug readable in
 * a URL and far inside the B-tree entry limit `uq_gallery_entries__slug`
 * depends on.
 */
export const GALLERY_ENTRY_SLUG_MAX_LENGTH = 80;

export const GALLERY_ENTRY_TITLE_MAX_LENGTH = 200;
export const GALLERY_ENTRY_DESCRIPTION_MAX_LENGTH = 4_000;
export const GALLERY_ENTRY_SEO_TITLE_MAX_LENGTH = 200;
export const GALLERY_ENTRY_SEO_DESCRIPTION_MAX_LENGTH = 320;

/**
 * `display_order` is `integer`, so the bound is the column's own, not an
 * invented business limit: curators order entries by hand and no product rule
 * caps how far apart two positions may sit.
 */
export const GALLERY_ENTRY_DISPLAY_ORDER_MIN = 0;
export const GALLERY_ENTRY_DISPLAY_ORDER_MAX = 2_147_483_647;
