/**
 * The deterministic notification intent key (`APP4-B01`).
 *
 * Docker-free: the derivation is a pure function, and the properties that matter
 * — same tuple collapses, any difference separates, nothing sensitive survives —
 * are provable without a database.
 */
import { canonicalIntentKeyInput, deriveNotificationIntentKey } from './notification-intent-key';

const BASE = {
  sourceEventId: 'challenge-0001',
  normalizedRecipient: 'an@vidu.com',
  templateKey: 'verification.code',
  templateVersion: 1,
};

describe('deriveNotificationIntentKey', () => {
  it('is deterministic for the same tuple', () => {
    expect(deriveNotificationIntentKey(BASE)).toBe(deriveNotificationIntentKey({ ...BASE }));
  });

  it('is a SHA-256 hex digest', () => {
    expect(deriveNotificationIntentKey(BASE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['source event', { sourceEventId: 'challenge-0002' }],
    ['recipient', { normalizedRecipient: 'khac@vidu.com' }],
    ['template key', { templateKey: 'secure-link.request-access' }],
    ['template version', { templateVersion: 2 }],
  ])('changes when the %s changes', (_label, override) => {
    expect(deriveNotificationIntentKey({ ...BASE, ...override })).not.toBe(
      deriveNotificationIntentKey(BASE),
    );
  });

  it('never carries the recipient in the persisted key', () => {
    const key = deriveNotificationIntentKey(BASE);
    expect(key).not.toContain('an@vidu.com');
    expect(key).not.toContain('vidu');
    expect(key).not.toContain(BASE.sourceEventId);
  });

  it('has no random component', () => {
    const keys = new Set(Array.from({ length: 5 }, () => deriveNotificationIntentKey(BASE)));
    expect(keys.size).toBe(1);
  });

  /**
   * The encoding must be injective. Without percent-encoding, a delimiter inside
   * one component could make two different tuples canonicalize identically — and
   * a collision here silently suppresses a real second notification.
   */
  it('cannot be collided by a delimiter inside a component', () => {
    const a = deriveNotificationIntentKey({
      ...BASE,
      sourceEventId: 'a:b',
      normalizedRecipient: 'c@vidu.com',
    });
    const b = deriveNotificationIntentKey({
      ...BASE,
      sourceEventId: 'a',
      normalizedRecipient: 'b:c@vidu.com',
    });
    expect(a).not.toBe(b);
    expect(canonicalIntentKeyInput({ ...BASE, sourceEventId: 'a:b' })).toContain('a%3Ab');
  });

  it('is versioned, so a later tuple change cannot collide with this one', () => {
    expect(canonicalIntentKeyInput(BASE).startsWith('app4-notification:v1:')).toBe(true);
  });
});
