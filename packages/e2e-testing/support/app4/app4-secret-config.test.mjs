/**
 * Unit tests for the APP4 ephemeral secret builder (APP4-E01-H01).
 *
 * The builder is the one piece of H01 with rules rather than plumbing: three
 * values that must satisfy three different production parsers, and that
 * `loadApp4SecretPepperConfig` rejects outright if any two are equal. Those are
 * the rules asserted here — never a literal value, and no assertion that would
 * print secret material on failure.
 */
import { Buffer } from 'node:buffer';

import { describe, expect, it } from '@jest/globals';

import {
  app4SecretEnv,
  app4SecretValues,
  createApp4SecretConfig,
} from '../orchestration/config.mjs';

describe('createApp4SecretConfig', () => {
  it('decodes the envelope key to exactly 32 bytes', () => {
    const app4 = createApp4SecretConfig('run1');
    expect(Buffer.from(app4.notificationDeliveryEnvelopeKey, 'base64')).toHaveLength(32);
  });

  it('gives both peppers at least the 32-character minimum', () => {
    const app4 = createApp4SecretConfig('run1');
    expect(app4.verificationCodePepper.length).toBeGreaterThanOrEqual(32);
    expect(app4.secureLinkTokenPepper.length).toBeGreaterThanOrEqual(32);
  });

  it('never reuses one value for another key', () => {
    // The production config refuses a pair that shares a value, so a builder
    // that derived all three from one seed would fail at startup, not here.
    const app4 = createApp4SecretConfig('run1');
    expect(new Set(app4SecretValues(app4)).size).toBe(3);
  });

  it('generates fresh material per run', () => {
    // Two runs on one machine must not share a pepper: the identifier-scoped
    // state of one run would otherwise be replayable against the next.
    const first = app4SecretValues(createApp4SecretConfig('run1'));
    const second = app4SecretValues(createApp4SecretConfig('run1'));
    expect(first.some((value, index) => value === second[index])).toBe(false);
  });

  it('maps every value onto the environment name its consumer reads', () => {
    const app4 = createApp4SecretConfig('run1');
    const env = app4SecretEnv(app4);
    expect(Object.keys(env).sort()).toEqual([
      'DESIGN_SESSION_SECRET_PEPPER',
      'NOTIFICATION_DELIVERY_ENVELOPE_KEY',
      'SECURE_LINK_TOKEN_SECRET_PEPPER',
      'STOREFRONT_PUBLIC_ORIGIN',
      'VERIFICATION_CODE_SECRET_PEPPER',
    ]);
    // Booleans only: a failure here must not print the operands.
    expect(env['NOTIFICATION_DELIVERY_ENVELOPE_KEY'] === app4.notificationDeliveryEnvelopeKey).toBe(
      true,
    );
  });

  it('keeps the storefront origin an unresolvable test host', () => {
    // IMP-D050: a test value is the only place an example origin may exist, and
    // `.invalid` (RFC 6761) can never resolve to something real.
    expect(createApp4SecretConfig('run1').storefrontOrigin).toMatch(/^https:\/\/[\w.-]+\.invalid$/);
  });
});
