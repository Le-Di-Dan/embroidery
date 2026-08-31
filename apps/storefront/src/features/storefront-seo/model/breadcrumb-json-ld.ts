import { toAbsolutePublicUrl } from '../../../config/public-origin';

/**
 * `BreadcrumbList` structured data for the two public detail pages that already
 * present a visible trail (`APP11-S04`).
 *
 * ## The visible trail is the authority
 *
 * Structured data describes what the page shows. Product Detail renders
 * `Khám phá / <category> / <name>` and Gallery Detail renders
 * `Bộ sưu tập / <title>`, so those are the trails emitted — three levels and two
 * levels respectively, from the same copy and the same route builders the
 * rendered `<nav>` uses. Inventing a hierarchy a visitor cannot see is how a
 * store ends up telling a search engine about a taxonomy it does not have, and
 * `NESTED_COLLECTION_WORK_MODEL = false` means there is no middle crumb between
 * the gallery feed and an entry to add even if one were wanted.
 *
 * No other page gets one. The Homepage, Discover and the gallery feed draw no
 * breadcrumb, so none is described.
 *
 * ## Only public route and title facts
 *
 * An item carries a name and an absolute URL, both of which are already on the
 * rendered page. `galleryEntryId`, `assetId`, `isIndexable`, storage keys, Admin
 * state and anything customer-shaped are structurally unable to reach here: the
 * builder's input is a list of `{ name, path }` pairs and there is no field for
 * them.
 *
 * The last item is deliberately given no `item` URL. It is the page the visitor
 * is already on — the same reason the visible crumb is text rather than a link —
 * and `schema.org` treats a trailing name-only item as the current page.
 */

/** One visible crumb, in the order the page renders it. */
export interface BreadcrumbItem {
  readonly name: string;
  /** Root-relative path from a route builder. Absent for the current page. */
  readonly path?: string;
}

interface BreadcrumbListElement {
  readonly '@type': 'ListItem';
  readonly position: number;
  readonly name: string;
  readonly item?: string;
}

export interface BreadcrumbListJsonLd {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'BreadcrumbList';
  readonly itemListElement: readonly BreadcrumbListElement[];
}

/**
 * Builds the JSON-LD document for a visible trail.
 *
 * `position` is 1-based and consecutive, as the vocabulary requires. Each linked
 * item is resolved to an absolute URL through the one origin authority, so a
 * crumb and the page's own canonical can never name two different hosts.
 */
export function buildBreadcrumbListJsonLd(items: readonly BreadcrumbItem[]): BreadcrumbListJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem' as const,
      position: index + 1,
      name: item.name,
      ...(item.path === undefined ? {} : { item: toAbsolutePublicUrl(item.path) }),
    })),
  };
}

/**
 * Serializes a JSON-LD document for embedding in an HTML `<script>` element.
 *
 * `JSON.stringify` escapes quotes and control characters but not `<`, and an
 * operator-authored title containing `</script>` would otherwise terminate the
 * element and inject whatever followed into the document. Escaping `<` as its
 * unicode form keeps the JSON byte-for-byte equivalent for any parser while
 * making the sequence impossible to write. `&` is escaped for the same reason a
 * step further out — it cannot start a tag, but it is the other character an
 * HTML parser gives meaning to inside raw text.
 *
 * The document is always built by `buildBreadcrumbListJsonLd` from typed fields,
 * so no raw JSON string is ever concatenated into markup.
 */
export function serializeJsonLd(document: BreadcrumbListJsonLd): string {
  return JSON.stringify(document).replace(/</g, '\\u003c').replace(/&/g, '\\u0026');
}
