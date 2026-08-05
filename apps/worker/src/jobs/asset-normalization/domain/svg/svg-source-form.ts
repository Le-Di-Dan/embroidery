/**
 * The input form gate (`IMP-D047` PO-04, PO-11).
 *
 * Everything here runs on **bytes and text, before a parser exists**. That order
 * is the entire point of the step: a DOCTYPE or an entity declaration is
 * dangerous because of what a parser does with it, so the only safe place to
 * refuse one is before parsing. Checking the parsed tree instead would mean the
 * expansion had already happened.
 *
 * The byte ceiling comes first for the same reason — a 1 MiB limit enforced
 * after decoding is a limit a 900 MiB file has already defeated.
 */
import { TEMPLATE_SVG_LIMITS } from './template-svg-policy';

/** UTF-8 BOM. Rejected on input; never emitted on output (PO-13). */
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/** The same code point as a character, for the mid-text check below. */
const BOM_CHARACTER = '\uFEFF';

/**
 * `<!` opens a DOCTYPE, an entity declaration, a CDATA section or a comment;
 * `<?` opens a processing instruction or an XML declaration. None of the six is
 * content this policy admits, and one rule covering all of them cannot be
 * widened by spelling: `<!doctype`, `<!DoCtYpE` and `<!ENTITY` all fail on the
 * two characters that introduce them.
 */
const FORBIDDEN_MARKUP = ['<!', '<?'];

export type SvgSourceFormResult =
  { readonly ok: true; readonly text: string } | { readonly ok: false };

const REJECTED = { ok: false } as const;

/**
 * Decodes and gates the source bytes, or refuses.
 *
 * `TextDecoder` in fatal mode is what makes "UTF-8" a real requirement rather
 * than a hope: the permissive default replaces every invalid sequence with
 * U+FFFD, which would let a file that is not UTF-8 at all parse as one that is,
 * with content nobody wrote.
 */
export function readTemplateSvgSource(bytes: Buffer): SvgSourceFormResult {
  if (bytes.length > TEMPLATE_SVG_LIMITS.maxSourceBytes) return REJECTED;
  if (bytes.length === 0) return REJECTED;
  if (bytes.subarray(0, BOM.length).equals(BOM)) return REJECTED;

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return REJECTED;
  }

  // A BOM anywhere else in the text is a zero-width no-break space, which is
  // invisible content in a file whose grammar has no text at all.
  if (text.includes(BOM_CHARACTER)) return REJECTED;
  if (FORBIDDEN_MARKUP.some((marker) => text.includes(marker))) return REJECTED;

  return { ok: true, text };
}
