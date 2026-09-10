/**
 * The two things every customer-facing email is made of (`APP12-E01-C1` §12).
 *
 * There are now two customer intents on the email boundary — the verification
 * code (`APP12-N01`) and the `ORDER_ACCESS` secure link (`APP12-E01-C1`) — and
 * they are rendered by two separate functions, on purpose. What they share is
 * only this: the brand they sign with, the three-part shape a transport needs,
 * and the escape a Vietnamese string needs before it enters markup.
 *
 * ### Why this file is deliberately three declarations long
 *
 * `ADR-DB2-003` places a shared template layer outside this phase, and §12 of
 * the correction says so again: *reuse low-level primitives, do not create a
 * template framework*. So there is no layout function here, no slot, no theme
 * and no message catalog. The moment this file grows a `renderShell(...)` that
 * both renderers pass content into, the two messages stop being independently
 * readable and a change to one silently reshapes the other — which is the exact
 * failure `FU-APP12-E01-01` was: one render path serving two intents.
 *
 * The duplicated inline styles in the two renderers are the price of that, and
 * they are worth it. A transactional email's markup is read by a dozen clients
 * that each strip something different; keeping each message's markup whole and
 * in one place is what makes it reviewable.
 */

/** The brand every customer-facing message signs with. */
export const BRAND_NAME = 'Nét Thêu';

/**
 * One rendered message.
 *
 * Both bodies are always produced. A mail client that renders text-only, a
 * screen reader, and a spam filter that scores HTML-only mail harshly all read
 * the text part; sending HTML alone is how a transactional message lands in a
 * junk folder.
 */
export interface EmailContent {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** Escapes the five characters that change meaning inside HTML text. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
