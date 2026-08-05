/**
 * DOMPurify, configured to the APP3 policy (`IMP-D047` PO-01, PO-02).
 *
 * DOMPurify is the active-content and XSS defence layer and nothing more. Its
 * defaults permit HTML, SVG and MathML and it is a *removal* engine — it takes
 * a document and hands back a smaller one. The APP3 contract is the opposite
 * shape: a closed allowlist, a value grammar and whole-file rejection. So every
 * option below is stated explicitly rather than inherited, and `DOMPurify.removed`
 * is never read: the security decision is the repository's own validation, and
 * the sanitizer's job is to prove that validation missed nothing.
 *
 * A fresh window and a fresh configuration object per call. A shared window
 * would let one Template's document state reach the next, and DOMPurify holds a
 * reference to the window it was created with.
 */
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

import type { SvgDomElement } from '../../domain/svg/svg-document';
import {
  SVG_NAMESPACE,
  TEMPLATE_SVG_ALL_ATTRIBUTES,
  TEMPLATE_SVG_ELEMENTS,
} from '../../domain/svg/template-svg-policy';

/**
 * The XML media type, so the sanitizer parses with XML rules rather than HTML
 * ones. HTML parsing is where mutation-XSS lives: a payload that is inert as
 * XML can become active after an HTML parser's error recovery re-shapes it.
 */
const XML_MEDIA_TYPE = 'application/xhtml+xml';

function buildConfig(): Record<string, unknown> {
  return {
    ALLOWED_TAGS: [...TEMPLATE_SVG_ELEMENTS],
    ALLOWED_ATTR: [...TEMPLATE_SVG_ALL_ATTRIBUTES, 'xmlns'],
    NAMESPACE: SVG_NAMESPACE,
    PARSER_MEDIA_TYPE: XML_MEDIA_TYPE,
    RETURN_DOM: true,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false,
    WHOLE_DOCUMENT: false,
    IN_PLACE: false,
    KEEP_CONTENT: false,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOW_SELF_CLOSE_IN_ATTR: false,
    SAFE_FOR_TEMPLATES: false,
    SANITIZE_DOM: true,
    SANITIZE_NAMED_PROPS: true,
    FORCE_BODY: false,
    ADD_TAGS: [],
    ADD_ATTR: [],
    ADD_URI_SAFE_ATTR: [],
    ADD_DATA_URI_TAGS: [],
    // No custom element and no customized built-in may be recognized: an
    // unknown tag that DOMPurify accepted would still fail the allowlist, but
    // leaving the door open is how a later config edit widens two rules at once.
    CUSTOM_ELEMENT_HANDLING: {
      tagNameCheck: null,
      attributeNameCheck: null,
      allowCustomizedBuiltInElements: false,
    },
  };
}

/**
 * Sanitizes `text` and hands the resulting root element to `use`.
 *
 * The window lives exactly as long as the callback, and is closed on every path.
 * The sanitized root is the returned container's first element child: with an
 * SVG `NAMESPACE`, DOMPurify hands back a namespaced container holding the
 * cleaned tree.
 */
export function withSanitizedSvgRoot<T>(
  text: string,
  use: (root: SvgDomElement) => T | undefined,
): T | undefined {
  const dom = new JSDOM('');
  try {
    const purify = createDOMPurify(dom.window);
    const container: unknown = purify.sanitize(text, buildConfig());
    const root = (container as { firstElementChild: unknown } | null)?.firstElementChild;
    if (root === null || root === undefined) return undefined;
    return use(root as SvgDomElement);
  } finally {
    dom.window.close();
  }
}
