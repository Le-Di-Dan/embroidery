import type { CheckoutSelectionResult } from './checkout-selection';

/**
 * What the server resolved and the client island renders (`APP12-S02` §39).
 *
 * The whole of the read — the Product, the current purchase projection, and the
 * query hints checked against it — happens on the server, in one request, and
 * arrives here as data. The island below it has no API client for the catalog
 * and therefore cannot re-read, re-resolve or refresh the selection: the
 * summary a customer sees is the one this request produced, and it is the same
 * one `generateMetadata` and the page body agree on.
 *
 * Everything in this shape is plain, serializable and already public. There is
 * no internal Product id, no category id, no variant id, no `isDisplayOutOfStock`
 * and no SEO block — a checkout has no use for any of them, and a field that is
 * not passed cannot be rendered by mistake.
 */
export interface ReadyMadeCheckoutView {
  /** The public Product slug; the return path is composed from it. */
  readonly slug: string;
  /** The Product's own name, as the item snapshot line renders it (`907:205`). */
  readonly name: string;
  /**
   * The first already-public media path, or absent (`907:203`).
   *
   * The same publication-gated delivery route the Product page's gallery uses,
   * in the same persisted order. A Product with no deliverable image renders the
   * drawn thumbnail slot empty rather than a placeholder that claims a picture.
   */
  readonly thumbnailUrl?: string;
  /** The hint resolution, decided on the server against the live projection. */
  readonly selection: CheckoutSelectionResult;
}
