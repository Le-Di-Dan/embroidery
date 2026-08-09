/**
 * Does *this* Version's document place *this* Asset (`APP3-B05A` §6)?
 *
 * The question is deliberately not answerable from `design_template_assets`. That
 * association is durable and cumulative: `APP3-B03A` records every Asset an Admin
 * has ever placed in the Template, and removing an image from the document in a
 * later Version does not remove the row. So an association left over from an
 * older immutable Version would keep authorizing artwork the currently public
 * Version no longer shows — which is precisely the leak this module exists to
 * close. Both facts are required, and this is the half SQL cannot express.
 *
 * ## Read through P01, never around it
 *
 * The stored document is interpreted by `validateDesignDocumentStructure`, the
 * same authority every writer passed through. Two consequences follow, and both
 * are wanted:
 *
 * A document the current P01 authority cannot safely interpret yields **no**
 * references, so delivery fails closed. It is not repaired, migrated or partially
 * read on the way past — this is an anonymous GET, and a read path that fixed a
 * document would be mutating store data on a stranger's request.
 *
 * Only a genuine `image` element counts. The pre-validation reader
 * `assetIdsIn` — correct for its own job, which is building an allowlist *before*
 * a candidate has been validated — accepts an `assetId` property on an element of
 * any type, and a text or shape element carrying a stray `assetId` must not be
 * able to authorize bytes. Here the element type is proved, not assumed.
 */
import { validateDesignDocumentStructure } from '@embroidery/design-document';

/**
 * True when the document is structurally valid **and** places the Asset through
 * an image element. Anything else — an unreadable document, a document that
 * dropped the image, an id that only ever appeared on another element type — is
 * false.
 */
export function publishedDocumentPlacesAsset(document: unknown, assetId: string): boolean {
  const parsed = validateDesignDocumentStructure(document);
  if (!parsed.ok) return false;

  return parsed.value.elements.some(
    (element) => element.type === 'image' && element.assetId === assetId,
  );
}
