/**
 * What one sitemap inventory item looks like on the wire (`APP11-B04`).
 *
 * Three fields, and the list of what is *absent* is the point: no title, no
 * description, no `isIndexable`, no lifecycle status, no id of any kind, no
 * category, no asset or storage fact, no priority, no changefreq and no URL. A
 * `sitemap.ts` needs a kind, an address and a freshness stamp; every further
 * field would be a private fact travelling for no consumer.
 *
 * `updatedAt` is the entity's own authoritative `updated_at`, serialized once
 * here. Never request time, never `now()`, never an object's last-modified
 * header: a fabricated stamp would tell a crawler a page changed when it did
 * not, and would do it on every single crawl.
 */
import type { PublicSitemapEntryKind } from '../domain/public-sitemap.policy';

export interface PublicSitemapEntryView {
  readonly kind: PublicSitemapEntryKind;
  readonly slug: string;
  /** ISO 8601 instant, from the entity's own `updated_at`. */
  readonly updatedAt: string;
}

export interface PublicSitemapView {
  readonly items: readonly PublicSitemapEntryView[];
}

/** One repository row, narrowed to the wire. */
export function toPublicSitemapEntry(
  kind: PublicSitemapEntryKind,
  row: { readonly slug: string; readonly updatedAt: Date },
): PublicSitemapEntryView {
  return { kind, slug: row.slug, updatedAt: row.updatedAt.toISOString() };
}
