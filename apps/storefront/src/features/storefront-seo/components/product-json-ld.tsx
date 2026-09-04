import { serializeJsonLd } from '../model/json-ld-serialization';
import { buildProductJsonLd, type ProductJsonLdInput } from '../model/product-json-ld';

/**
 * Emits the `Product` JSON-LD for a published Ready-Made Product (`APP12-H06`).
 *
 * A Server Component with no client behaviour, exactly like `BreadcrumbJsonLd`:
 * the document is composed on the server from facts the page already holds and
 * arrives in the first HTML byte, so a crawler that runs no JavaScript still
 * sees it. It renders no visible output.
 *
 * `dangerouslySetInnerHTML` is the only way to place raw JSON inside a
 * `<script>` — React would otherwise HTML-escape the text into something no
 * parser accepts. The content is never a caller-supplied string: it is built
 * from typed fields and passed through `serializeJsonLd`, which makes
 * `</script>` unwritable.
 */
export function ProductJsonLd(input: ProductJsonLdInput) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildProductJsonLd(input)) }}
    />
  );
}
