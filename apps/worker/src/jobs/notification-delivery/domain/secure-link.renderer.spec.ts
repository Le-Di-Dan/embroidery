/**
 * The secure-link fragment form (`APP4-B05` §13, `ADR-APP4-001` §11).
 *
 * The assertions are about *where the token sits*, not about string equality
 * alone: `?t=`, `/t/<token>` and `#t=` all "contain the token" and all render a
 * clickable link, and only the third keeps it out of every access log.
 */
import { randomBytes } from 'node:crypto';

import { renderSecureLinkUrl } from './secure-link.renderer';

/**
 * A token in P01's issued form — 32 CSPRNG bytes as unpadded base64url.
 *
 * Reproduced here rather than imported: the issuer lives in `apps/api`, and no
 * app imports another. What this test needs is the *encoding*, which is a Node
 * primitive both sides call, not the issuer's entropy policy.
 */
const p01ShapedToken = (): string => randomBytes(32).toString('base64url');

const ORIGIN = 'https://shop.test.invalid';
const TOKEN = 'aaaaBBBBccccDDDDeeeeFFFFggggHHHHiiiiJJJJkkk';

describe('renderSecureLinkUrl', () => {
  it('composes origin + /truy-cap + #t= + token', () => {
    expect(renderSecureLinkUrl(ORIGIN, TOKEN)).toBe(`${ORIGIN}/truy-cap#t=${TOKEN}`);
  });

  it('puts the token only after the fragment separator', () => {
    const [serverVisible, fragment] = renderSecureLinkUrl(ORIGIN, TOKEN).split('#');

    // Everything a server, gateway or proxy could log.
    expect(serverVisible).toBe(`${ORIGIN}/truy-cap`);
    expect(serverVisible).not.toContain(TOKEN);
    expect(serverVisible).not.toContain('?');
    expect(fragment).toBe(`t=${TOKEN}`);
  });

  it('produces exactly one fragment separator', () => {
    // A second `#` would truncate the fragment at the first one, silently
    // delivering a link whose token the landing page never sees.
    expect(renderSecureLinkUrl(ORIGIN, TOKEN).split('#')).toHaveLength(2);
  });

  it('leaves a real base64url token byte-identical after the separator', () => {
    // The round trip that matters: `URL`-based composition would percent-encode
    // some of base64url's alphabet, and the landing page compares what it reads
    // to P01's 43-character accepted form.
    const token = p01ShapedToken();
    const url = renderSecureLinkUrl(ORIGIN, token);

    expect(url.slice(url.indexOf('#t=') + 3)).toBe(token);
    expect(new URL(url).hash).toBe(`#t=${token}`);
  });
});
