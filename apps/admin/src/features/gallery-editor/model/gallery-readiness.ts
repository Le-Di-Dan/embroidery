/**
 * Publication readiness, as an **advisory** mirror of the server's rule.
 *
 * ## The four requirements, and there is no fifth
 *
 * ```text
 * title        non-empty
 * slug         present
 * description  non-empty
 * assets       at least one persisted attached image
 * ```
 *
 * A linked product, `seoTitle`, `seoDescription`, `isIndexable` and alt text are
 * deliberately **not** requirements, and none of them appears below. A
 * `noindex` entry is publishable: turning indexing off keeps the page out of
 * search results and the sitemap, and that is a different question from whether
 * the entry may exist publicly at all. Adding any of them here would be this
 * screen refusing something the server would have allowed.
 *
 * ## Evaluated from persisted state, never from the form
 *
 * The input is the authoritative detail record, not the operator's unsaved
 * inputs. The server recomputes readiness inside the publish transaction from
 * its own locked row, so a readiness answer derived from a title that exists
 * only in a text box would be a promise this screen cannot keep. Unsaved work is
 * reported separately — as unsaved work — and the panel requires a save before
 * offering publish, rather than chaining a hidden write behind the button.
 *
 * ## Advisory means advisory
 *
 * The server remains the authority. This exists so an operator can see what is
 * missing before pressing a button that would refuse, not so the client can
 * decide the outcome.
 */
import type { AdminGalleryEntryDetailResponse } from '@embroidery/api-client';

/** The closed requirement set, in the order the panel lists them. */
export const GALLERY_PUBLICATION_REQUIREMENTS = ['title', 'slug', 'description', 'asset'] as const;

export type GalleryPublicationRequirement = (typeof GALLERY_PUBLICATION_REQUIREMENTS)[number];

export interface GalleryReadiness {
  readonly ready: boolean;
  readonly unsatisfied: readonly GalleryPublicationRequirement[];
}

/** True when the value carries a character that is not whitespace. */
function present(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function evaluateGalleryReadiness(entry: AdminGalleryEntryDetailResponse): GalleryReadiness {
  const satisfied: Record<GalleryPublicationRequirement, boolean> = {
    title: present(entry.title),
    slug: present(entry.slug),
    description: present(entry.description),
    // `assets` is the persisted association set. Counting the local selection
    // would report an image the entry does not yet have.
    asset: entry.assets.length > 0,
  };
  const unsatisfied = GALLERY_PUBLICATION_REQUIREMENTS.filter(
    (requirement) => !satisfied[requirement],
  );
  return { ready: unsatisfied.length === 0, unsatisfied };
}

/**
 * The server's requirement codes, mapped onto this screen's vocabulary.
 *
 * A refused publish names the requirements it objected to in the envelope's
 * structured details. They are used only to *emphasise* rows the panel already
 * renders from the refetched record — never to author a message, and never as a
 * substitute for re-reading persisted state.
 */
const SERVER_REQUIREMENT_CODES: Readonly<Record<string, GalleryPublicationRequirement>> = {
  GALLERY_ENTRY_TITLE_REQUIRED: 'title',
  GALLERY_ENTRY_SLUG_REQUIRED: 'slug',
  GALLERY_ENTRY_DESCRIPTION_REQUIRED: 'description',
  GALLERY_ENTRY_ELIGIBLE_ASSET_REQUIRED: 'asset',
};

/** Translates the envelope's detail codes; anything unrecognised is dropped. */
export function requirementsFromDetailCodes(
  codes: readonly string[],
): readonly GalleryPublicationRequirement[] {
  const mapped = codes
    .map((code) => SERVER_REQUIREMENT_CODES[code])
    .filter(
      (requirement): requirement is GalleryPublicationRequirement => requirement !== undefined,
    );
  return [...new Set(mapped)];
}
