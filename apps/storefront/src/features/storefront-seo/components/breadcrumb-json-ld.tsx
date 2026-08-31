import {
  buildBreadcrumbListJsonLd,
  serializeJsonLd,
  type BreadcrumbItem,
} from '../model/breadcrumb-json-ld';

/**
 * Emits the `BreadcrumbList` JSON-LD for a page that renders a visible trail.
 *
 * A Server Component with no client behaviour: the document is composed on the
 * server from facts the page already has and arrives in the first HTML byte, so
 * a crawler that runs no JavaScript still sees it.
 *
 * `dangerouslySetInnerHTML` is the only way to place raw JSON inside a
 * `<script>` — React would otherwise HTML-escape the text into something no
 * parser accepts. The content is never a caller-supplied string: it is built
 * from typed fields and passed through `serializeJsonLd`, which makes
 * `</script>` unwritable.
 */
export function BreadcrumbJsonLd({ items }: { items: readonly BreadcrumbItem[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildBreadcrumbListJsonLd(items)) }}
    />
  );
}
