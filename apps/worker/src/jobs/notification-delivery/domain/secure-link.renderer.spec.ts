/**
 * The secure-link fragment form (`APP4-B05` §13, `ADR-APP4-001` §11) and its
 * per-scope landing (`APP12-S03-C1`).
 *
 * Two independent claims, and they fail for different reasons:
 *
 * 1. *where the token sits* — `?t=`, `/t/<token>` and `#t=` all "contain the
 *    token" and all render a clickable link, and only the third keeps it out of
 *    every access log;
 * 2. *where the link points* — a link whose token the landing page refuses as
 *    wrong-scope is a correctly-formed URL and a broken delivery.
 */
import { randomBytes } from 'node:crypto';
import type { SecureLinkLanding } from '@embroidery/notification-delivery';

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
  describe('the landing each scope lands on', () => {
    it('sends a REQUEST_ACCESS link to the custom-request surface', () => {
      expect(renderSecureLinkUrl(ORIGIN, TOKEN, 'REQUEST_ACCESS')).toBe(
        `${ORIGIN}/truy-cap#t=${TOKEN}`,
      );
    });

    it('sends an ORDER_ACCESS link to the Ready-Made order surface', () => {
      // The whole correction. Before it, this composed `/truy-cap`, where the
      // customer's own token is refused as wrong-scope.
      expect(renderSecureLinkUrl(ORIGIN, TOKEN, 'ORDER_ACCESS')).toBe(
        `${ORIGIN}/truy-cap/don-hang#t=${TOKEN}`,
      );
    });

    it('gives the two scopes different paths', () => {
      // Stated separately from the two literals above so that a future edit
      // which "simplifies" both to one constant fails here rather than silently
      // restoring the defect.
      const request = new URL(renderSecureLinkUrl(ORIGIN, TOKEN, 'REQUEST_ACCESS'));
      const order = new URL(renderSecureLinkUrl(ORIGIN, TOKEN, 'ORDER_ACCESS'));

      expect(request.pathname).not.toBe(order.pathname);
      expect(request.origin).toBe(order.origin);
    });

    it('refuses a landing it cannot route rather than choosing one', () => {
      // Reachable only from an envelope sealed by another build: the type says
      // the set is closed, and this asserts the runtime agrees rather than
      // silently composing `undefined` into the path.
      const unknown = 'ACCOUNT_ACCESS' as SecureLinkLanding;

      expect(() => renderSecureLinkUrl(ORIGIN, TOKEN, unknown)).toThrow(
        /refusing to compose a link/,
      );
    });

    it('never lets a landing put anything but a known path into the URL', () => {
      // The landing is an identifier, not a path fragment. If it were ever used
      // as one, this string would appear in the composed URL.
      const injected = '/evil.example/#' as SecureLinkLanding;

      expect(() => renderSecureLinkUrl(ORIGIN, TOKEN, injected)).toThrow();
    });
  });

  describe('the release wave', () => {
    // `APP12-S03-C1` §24. Composition is a pure function of origin, token and
    // landing: it reads no environment and consults no release gate, so both
    // routes are delivered identically whether or not Wave 2 is released.
    //
    // That separation is deliberate. Wave 2 withholds the `REQUEST_ACCESS`
    // *runtime* — the grant resolution refuses that scope
    // (`GrantScopeReleaseGate`) — and a link that composed differently by wave
    // would mean a customer's saved message stopped working when a flag moved.
    const RELEASE_ENV = 'CUSTOM_EMBROIDERY_RELEASE_ENABLED';

    it('composes the same two URLs whether Wave 2 is released or not', () => {
      const previous = process.env[RELEASE_ENV];
      try {
        const compose = (): readonly string[] => [
          renderSecureLinkUrl(ORIGIN, TOKEN, 'REQUEST_ACCESS'),
          renderSecureLinkUrl(ORIGIN, TOKEN, 'ORDER_ACCESS'),
        ];

        process.env[RELEASE_ENV] = 'false';
        const withheld = compose();
        process.env[RELEASE_ENV] = 'true';
        const released = compose();

        expect(withheld).toEqual([
          `${ORIGIN}/truy-cap#t=${TOKEN}`,
          `${ORIGIN}/truy-cap/don-hang#t=${TOKEN}`,
        ]);
        expect(released).toEqual(withheld);
      } finally {
        if (previous === undefined) delete process.env[RELEASE_ENV];
        else process.env[RELEASE_ENV] = previous;
      }
    });
  });

  describe.each<SecureLinkLanding>(['REQUEST_ACCESS', 'ORDER_ACCESS'])('%s', (landing) => {
    it('puts the token only after the fragment separator', () => {
      const [serverVisible, fragment] = renderSecureLinkUrl(ORIGIN, TOKEN, landing).split('#');

      // Everything a server, gateway or proxy could log.
      expect(serverVisible).not.toContain(TOKEN);
      expect(serverVisible).not.toContain('?');
      expect(serverVisible?.startsWith(`${ORIGIN}/`)).toBe(true);
      expect(fragment).toBe(`t=${TOKEN}`);
    });

    it('produces exactly one fragment separator', () => {
      // A second `#` would truncate the fragment at the first one, silently
      // delivering a link whose token the landing page never sees.
      expect(renderSecureLinkUrl(ORIGIN, TOKEN, landing).split('#')).toHaveLength(2);
    });

    it('leaves a real base64url token byte-identical after the separator', () => {
      // The round trip that matters: `URL`-based composition would percent-encode
      // some of base64url's alphabet, and the landing page compares what it reads
      // to P01's 43-character accepted form.
      const token = p01ShapedToken();
      const url = renderSecureLinkUrl(ORIGIN, token, landing);

      expect(url.slice(url.indexOf('#t=') + 3)).toBe(token);
      expect(new URL(url).hash).toBe(`#t=${token}`);
    });

    it('keeps the configured origin exactly', () => {
      expect(new URL(renderSecureLinkUrl(ORIGIN, TOKEN, landing)).origin).toBe(ORIGIN);
    });
  });
});
