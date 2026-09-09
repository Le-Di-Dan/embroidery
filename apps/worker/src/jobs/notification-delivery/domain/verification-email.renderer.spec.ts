/**
 * The verification email's content rules (`APP12-N01.B01` §8, §9).
 *
 * The renderer is where a message could quietly acquire something it must never
 * carry, so the negative cases here are as load-bearing as the positive ones.
 */
import {
  BRAND_NAME,
  renderVerificationEmail,
  validityMinutes,
} from './verification-email.renderer';

const ISSUED_AT = new Date('2026-09-09T10:00:00.000Z');

function render(overrides: { code?: string; ttlMs?: number } = {}) {
  const ttlMs = overrides.ttlMs ?? 600_000;
  return renderVerificationEmail({
    code: overrides.code ?? '481902',
    issuedAt: ISSUED_AT,
    expiresAt: new Date(ISSUED_AT.getTime() + ttlMs),
  });
}

describe('renderVerificationEmail', () => {
  it('subjects the message with the brand verification intent', () => {
    expect(render().subject).toBe(`Mã xác thực ${BRAND_NAME}`);
  });

  it('always produces both a text and an HTML part', () => {
    const content = render();

    expect(content.text.length).toBeGreaterThan(0);
    expect(content.html).toContain('<html');
  });

  it('carries the code in both parts', () => {
    const content = render({ code: '135790' });

    expect(content.text).toContain('135790');
    expect(content.html).toContain('135790');
  });

  it('states the expiry the challenge was issued with, not a TTL of its own', () => {
    expect(render({ ttlMs: 600_000 }).text).toContain('10 phút');
    expect(render({ ttlMs: 300_000 }).text).toContain('5 phút');
    expect(render({ ttlMs: 900_000 }).html).toContain('15 phút');
  });

  it('tells a recipient who did not ask that they may ignore it', () => {
    expect(render().text).toContain('Nếu bạn không yêu cầu mã này');
  });

  it('names the brand', () => {
    expect(render().text).toContain(BRAND_NAME);
    expect(render().html).toContain(BRAND_NAME);
  });

  it('carries nothing but the code', () => {
    const content = render();
    const whole = `${content.subject}\n${content.text}\n${content.html}`;

    // The message is a code and an explanation. Anything below would be a
    // credential, an identifier or a debugging leftover in a customer's inbox.
    for (const forbidden of [
      'password',
      'Bearer',
      'session',
      'token',
      'ORDER_ACCESS',
      'challengeId',
      'requestId',
      'SMTP',
    ]) {
      expect(whole).not.toContain(forbidden);
    }
  });

  it('escapes a code so it cannot inject markup', () => {
    // The code is server-minted decimal digits, so this can never occur in
    // practice — which is exactly why the escaping must be asserted rather than
    // assumed by whoever changes the minter next.
    const content = renderVerificationEmail({
      code: '<script>alert(1)</script>',
      issuedAt: ISSUED_AT,
      expiresAt: new Date(ISSUED_AT.getTime() + 600_000),
    });

    expect(content.html).not.toContain('<script>');
    expect(content.html).toContain('&lt;script&gt;');
  });
});

describe('validityMinutes', () => {
  it('rounds up so a customer is never told less time than they have', () => {
    expect(validityMinutes(ISSUED_AT, new Date(ISSUED_AT.getTime() + 599_000))).toBe(10);
  });

  it('never reports zero minutes', () => {
    expect(validityMinutes(ISSUED_AT, ISSUED_AT)).toBe(1);
    expect(validityMinutes(ISSUED_AT, new Date(ISSUED_AT.getTime() - 5_000))).toBe(1);
  });
});
