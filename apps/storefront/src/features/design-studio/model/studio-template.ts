/**
 * Published Template list and preview reference (`APP3-S01`).
 *
 * Pure functions over the `APP3-B05` responses. Two rules are enforced by
 * construction here rather than by discipline at the call sites:
 *
 * - continuation is **keyset only**. `nextCursorOf` is the single place a cursor
 *   is read, it is returned exactly as the server issued it, and it is never
 *   parsed, composed or counted. B05 publishes `hasNext` and an opaque
 *   `nextCursor` and nothing else — there is no offset, page number or total to
 *   derive, so none is invented.
 * - the preview reference comes from the **published version's own document**.
 *   An asset id from anywhere else could not be delivered anyway: `APP3-B05A`
 *   re-proves that the exact current published version places that asset, so a
 *   reference guessed from elsewhere would simply 404.
 */
import type {
  PublicDesignTemplateDetailResponse,
  PublicDesignTemplateListResponse,
  PublicDesignTemplateSummaryResponse,
} from '@embroidery/api-client';

/**
 * The next page's cursor, or `undefined` when there is no usable one.
 *
 * `hasNext` and the cursor must **both** be present. A page that claims a
 * successor without supplying the cursor for it is a page the feed cannot
 * continue from, and treating the claim alone as permission is how a picker
 * ends up requesting the same page forever.
 */
export function nextCursorOf(
  page: PublicDesignTemplateListResponse | undefined,
): string | undefined {
  if (page === undefined) return undefined;
  if (!page.hasNext) return undefined;
  const cursor = page.nextCursor;
  return cursor === undefined || cursor === '' ? undefined : cursor;
}

/**
 * Every Template across the loaded pages, in server order, de-duplicated by
 * slug. Keyset pages do not normally repeat a row, but a Template published
 * between two page requests can shift the window; keeping the first occurrence
 * means a repeat is dropped rather than rendered twice under one React key.
 */
export function flattenTemplatePages(
  pages: readonly PublicDesignTemplateListResponse[],
): readonly PublicDesignTemplateSummaryResponse[] {
  const seen = new Set<string>();
  const rows: PublicDesignTemplateSummaryResponse[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.slug)) continue;
      seen.add(item.slug);
      rows.push(item);
    }
  }
  return rows;
}

/** The address of one deliverable Template asset, as `APP3-B05A` accepts it. */
export interface TemplatePreviewReference {
  readonly templateSlug: string;
  readonly version: number;
  readonly assetId: string;
}

/**
 * The image this Template's published version is previewed by, or `undefined`
 * when it places none.
 *
 * The **first** image element in array order, which is z-order bottom-first
 * (`ADR-DB1-012` §7). S01 shows one read-only preview image; it does not
 * composite the document, because compositing is the `APP3-S02` renderer and
 * building one here to fill a preview box would be absorbing the next
 * checkpoint.
 *
 * `undefined` is a valid, expected answer: a text-only Template is a real
 * Template, and the screen says so rather than showing a broken frame.
 */
export function previewReferenceOf(
  detail: PublicDesignTemplateDetailResponse,
): TemplatePreviewReference | undefined {
  const image = detail.document.elements.find((element) => element.type === 'image');
  if (image === undefined) return undefined;
  return {
    templateSlug: detail.slug,
    version: detail.publishedVersion.version,
    assetId: image.assetId,
  };
}
