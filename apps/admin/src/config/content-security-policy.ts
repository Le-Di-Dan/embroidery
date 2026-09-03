/**
 * The Admin Content-Security-Policy (`APP12-H01` §12, hardened by
 * `APP12-H02` §19 — `FU-APP12-H01-01`).
 *
 * ## Why the policy moved out of `next.config.ts`
 *
 * H01 published a static policy from `next.config.ts` `headers()`. A static
 * header cannot carry a nonce, and without a nonce the App Router's streamed
 * RSC payload — emitted as inline `<script>self.__next_f.push(...)</script>`
 * elements — can only run under `script-src 'unsafe-inline'`. That grant is
 * exactly what a CSP exists to remove: it re-permits *every* injected inline
 * script, so the policy stopped nothing an XSS would actually do.
 *
 * A nonce is per-response by definition, so the only place it can be minted is
 * the request path. That makes the proxy the policy's single authority and
 * leaves `next.config.ts` with none: two CSP headers on one response are two
 * policies the browser enforces independently, and the weaker one's
 * `'unsafe-inline'` would still be published for a scanner to read.
 *
 * ## How Next consumes the nonce
 *
 * Not through an API — through the **request** header. `parseRequestHeaders`
 * (`next/dist/server/app-render/app-render.js`) reads `content-security-policy`
 * off the incoming request, extracts the first `'nonce-…'` source from
 * `script-src` (falling back to `default-src`), and hands it to the renderer,
 * which stamps it onto every framework `<script>` it emits. So the proxy sets
 * the header **twice**: on the forwarded request, where the renderer finds it,
 * and on the response, where the browser enforces it. Setting only the response
 * header produces a policy no framework script satisfies — a blank page.
 *
 * ## What is granted, and what is not
 *
 * Every source is `'self'`: this staff surface loads no third-party script, style,
 * font, frame or beacon, and `default-src` closes the rest. `object-src 'none'`
 * and `base-uri 'self'` remove the two classic injection escapes;
 * `form-action 'self'` stops an injected form posting a customer's input
 * off-origin; `frame-ancestors 'self'` restates the gateway's
 * `X-Frame-Options: SAMEORIGIN` in the header modern browsers enforce.
 *
 * `style-src` keeps `'unsafe-inline'` and that is a real requirement, not
 * convenience: React writes element `style` attributes, and the placement
 * background and payment-evidence surfaces position by inline style. A style
 * nonce cannot cover an attribute — only a `<style>` element — so nonce-ing
 * styles would break the app while claiming a stricter policy. `script-src`
 * grants no `'unsafe-inline'` and no `'unsafe-eval'` in production; the nonce
 * replaces both.
 *
 * Development adds precisely what Turbopack HMR needs — `'unsafe-eval'` for its
 * module runtime and `ws:`/`wss:` for the HMR socket — and nothing else. Those
 * are absent from a production response.
 */

/** The header name, written once so a typo is a compile-time rename. */
export const CONTENT_SECURITY_POLICY_HEADER = 'content-security-policy';

/**
 * Bytes of entropy behind each nonce. 16 bytes is 128 bits, well past the
 * for-practical-purposes-unguessable bar a per-response value needs, and it
 * encodes to 24 base64 characters — short enough that it costs nothing to
 * repeat on every framework script tag.
 */
const NONCE_BYTE_LENGTH = 16;

/**
 * Mints a fresh nonce.
 *
 * `crypto.getRandomValues` is the CSPRNG, not `Math.random`: a predictable
 * nonce is a nonce an injected script can simply write down. It is a Web Crypto
 * global in both the edge and the Node.js proxy runtimes, so no import is
 * needed and no runtime-specific branch exists to get wrong.
 *
 * The value is a per-response token, never a secret to persist: nothing stores
 * it, nothing compares it across requests, and it is meaningless once the
 * response it was minted for has been parsed.
 */
export function createContentSecurityPolicyNonce(): string {
  const bytes = new Uint8Array(NONCE_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export interface ContentSecurityPolicyOptions {
  /** The nonce minted for this one response. */
  readonly nonce: string;
  /**
   * Whether this process is serving a production build. Development needs the
   * two HMR allowances; production must carry neither.
   */
  readonly isProduction: boolean;
}

/** Builds the policy string for one response. */
export function buildContentSecurityPolicy({
  nonce,
  isProduction,
}: ContentSecurityPolicyOptions): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    // `'strict-dynamic'` is deliberately absent. It would let a nonced script
    // load further scripts without one, and this app has no such loader; adding
    // it would widen the policy to buy nothing.
    `script-src 'self' 'nonce-${nonce}'${isProduction ? '' : " 'unsafe-eval'"}`,
    `connect-src 'self' blob:${isProduction ? '' : ' ws: wss:'}`,
  ].join('; ');
}
