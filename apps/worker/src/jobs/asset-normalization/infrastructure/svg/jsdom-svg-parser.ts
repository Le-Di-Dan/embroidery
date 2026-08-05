/**
 * Strict XML parsing for Template SVG (`IMP-D047` PO-04).
 *
 * `contentType: 'image/svg+xml'` selects jsdom's **XML** parser, and that choice
 * is the security boundary, not a convenience: the HTML parser never fails. It
 * recovers from an unclosed tag, invents a tree for `<svg><g></svg>` and accepts
 * two roots — so a file that a strict parser refuses would be silently repaired
 * into a different document, and every downstream check would then be validating
 * markup nobody wrote. Verified against jsdom 29.1.1: malformed XML, an
 * undefined entity and a second root each throw here.
 *
 * The window options are the locked minimum. `runScripts` is never passed, so no
 * script in a document can execute; `resources` is never passed, so nothing is
 * fetched; `url` is never passed, so there is no base URL to resolve a reference
 * against. Each of those is a default, and each is written down because a future
 * edit that added one would look harmless.
 */
import { JSDOM } from 'jsdom';

import type { SvgDomElement } from '../../domain/svg/svg-document';

const SVG_CONTENT_TYPE = 'image/svg+xml';

/**
 * Parses `text` and hands the root element to `use`.
 *
 * The window is closed in `finally` on every path — success, rejection and
 * throw alike. A jsdom window holds timers and an event loop registration, so a
 * worker that leaked one per job would accumulate them for the life of the
 * process; and each call gets its own window, so no state can travel between
 * two Templates.
 */
export function withStrictSvgRoot<T>(
  text: string,
  use: (root: SvgDomElement) => T | undefined,
): T | undefined {
  let dom: JSDOM;
  try {
    dom = new JSDOM(text, { contentType: SVG_CONTENT_TYPE });
  } catch {
    // A parse failure is a property of the file, not of this deployment. The
    // native message is dropped: it quotes the offending markup, and that markup
    // is customer content.
    return undefined;
  }

  try {
    const root: unknown = dom.window.document.documentElement;
    return root === null || root === undefined ? undefined : use(root as SvgDomElement);
  } finally {
    dom.window.close();
  }
}
