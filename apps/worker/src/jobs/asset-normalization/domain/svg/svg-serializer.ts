/**
 * The canonical Template SVG serializer (`IMP-D047` PO-13).
 *
 * One locked spelling for everything a serializer normally gets to choose:
 * attribute order, quoting, escaping, whitespace and the empty-element form. The
 * output contains no newline at all, so "LF line endings and no trailing
 * newline" is satisfied by construction rather than by a normalization pass that
 * could be forgotten.
 *
 * Determinism here is narrow and deliberate: identical accepted source bytes
 * plus this policy and these dependency versions produce identical output. Two
 * semantically equivalent but textually different sources are **not** promised
 * to converge, and nothing here tries to make them.
 */
import type { CanonicalElement } from './svg-document';
import { TEMPLATE_SVG_EXPLICIT_CLOSE_ELEMENTS } from './template-svg-policy';

const ESCAPES: Readonly<Record<string, string>> = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
});

/**
 * XML attribute escaping, applied even though the value grammar cannot produce
 * any of these characters.
 *
 * Defence in depth against the serializer outliving the grammar: if a future
 * validator ever admitted a character that closes an attribute, the file would
 * still serialize as data rather than as markup.
 */
function escapeAttributeValue(value: string): string {
  return value.replace(/[&<>"]/g, (character) => ESCAPES[character] ?? character);
}

function serializeElement(element: CanonicalElement, into: string[]): void {
  const attributes = element.attributes
    .map((attribute) => ` ${attribute.name}="${escapeAttributeValue(attribute.value)}"`)
    .join('');

  const explicitClose = TEMPLATE_SVG_EXPLICIT_CLOSE_ELEMENTS.includes(element.name);
  if (!explicitClose && element.children.length === 0) {
    into.push(`<${element.name}${attributes}/>`);
    return;
  }

  into.push(`<${element.name}${attributes}>`);
  for (const child of element.children) serializeElement(child, into);
  into.push(`</${element.name}>`);
}

/** The canonical text form of a validated document. */
export function serializeCanonicalSvg(root: CanonicalElement): string {
  const parts: string[] = [];
  serializeElement(root, parts);
  return parts.join('');
}

/** The canonical bytes: UTF-8, no BOM, no XML declaration, no trailing newline. */
export function serializeCanonicalSvgBytes(root: CanonicalElement): Buffer {
  return Buffer.from(serializeCanonicalSvg(root), 'utf8');
}
