/**
 * APP4 pepper configuration (`APP4-P01`, `ADR-APP4-001` §5.3).
 *
 * Every case here is a fail-closed case plus one: the loader must refuse a
 * missing pepper, a weak pepper, a shared pepper and a borrowed pepper. The
 * error-message assertions matter as much as the throws — a configuration error
 * that echoes the value it rejected publishes the secret into whatever collects
 * startup logs.
 *
 * All values below are synthetic.
 */
import {
  loadApp4SecretPepperConfig,
  MIN_PEPPER_LENGTH,
  SECURE_LINK_TOKEN_PEPPER_ENV,
  VERIFICATION_CODE_PEPPER_ENV,
} from './app4-secret-pepper.config';

const VERIFICATION = 'synthetic-verification-pepper-0001';
const SECURE_LINK = 'synthetic-secure-link-pepper-00002';

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    [VERIFICATION_CODE_PEPPER_ENV]: VERIFICATION,
    [SECURE_LINK_TOKEN_PEPPER_ENV]: SECURE_LINK,
    ...overrides,
  };
}

describe('loadApp4SecretPepperConfig', () => {
  it('loads both peppers and keeps them distinct', () => {
    const config = loadApp4SecretPepperConfig(env());
    expect(config.verificationCodePepper).toBe(VERIFICATION);
    expect(config.secureLinkTokenPepper).toBe(SECURE_LINK);
    expect(config.verificationCodePepper).not.toBe(config.secureLinkTokenPepper);
  });

  it.each([[VERIFICATION_CODE_PEPPER_ENV], [SECURE_LINK_TOKEN_PEPPER_ENV]])(
    'fails closed when %s is missing',
    (name) => {
      expect(() => loadApp4SecretPepperConfig(env({ [name]: undefined }))).toThrow(
        new RegExp(`${name} is required`),
      );
    },
  );

  it.each([[VERIFICATION_CODE_PEPPER_ENV], [SECURE_LINK_TOKEN_PEPPER_ENV]])(
    'fails closed when %s is blank',
    (name) => {
      expect(() => loadApp4SecretPepperConfig(env({ [name]: '   ' }))).toThrow(
        new RegExp(`${name} is required`),
      );
    },
  );

  it.each([[VERIFICATION_CODE_PEPPER_ENV], [SECURE_LINK_TOKEN_PEPPER_ENV]])(
    'fails closed when %s is shorter than the minimum',
    (name) => {
      expect(() => loadApp4SecretPepperConfig(env({ [name]: 'too-short' }))).toThrow(
        new RegExp(`${name} must be at least ${String(MIN_PEPPER_LENGTH)} characters`),
      );
    },
  );

  it('accepts a pepper of exactly the minimum length', () => {
    const exact = 'x'.repeat(MIN_PEPPER_LENGTH);
    expect(() =>
      loadApp4SecretPepperConfig(env({ [VERIFICATION_CODE_PEPPER_ENV]: exact })),
    ).not.toThrow();
  });

  it('refuses one value serving as both peppers', () => {
    expect(() =>
      loadApp4SecretPepperConfig(env({ [SECURE_LINK_TOKEN_PEPPER_ENV]: VERIFICATION })),
    ).toThrow(/must be different values/);
  });

  it.each([['NOTIFICATION_DELIVERY_ENVELOPE_KEY'], ['DESIGN_SESSION_SECRET_PEPPER']])(
    'refuses a pepper that reuses %s',
    (foreign) => {
      expect(() => loadApp4SecretPepperConfig(env({ [foreign]: VERIFICATION }))).toThrow(
        new RegExp(`${VERIFICATION_CODE_PEPPER_ENV} must not reuse the value of ${foreign}`),
      );
      expect(() => loadApp4SecretPepperConfig(env({ [foreign]: SECURE_LINK }))).toThrow(
        new RegExp(`${SECURE_LINK_TOKEN_PEPPER_ENV} must not reuse the value of ${foreign}`),
      );
    },
  );

  it('ignores an unset foreign secret rather than treating it as a collision', () => {
    expect(() =>
      loadApp4SecretPepperConfig(env({ NOTIFICATION_DELIVERY_ENVELOPE_KEY: '' })),
    ).not.toThrow();
  });

  it('never puts a secret value into an error message', () => {
    const cases: Array<() => unknown> = [
      () => loadApp4SecretPepperConfig(env({ [VERIFICATION_CODE_PEPPER_ENV]: undefined })),
      () => loadApp4SecretPepperConfig(env({ [VERIFICATION_CODE_PEPPER_ENV]: 'too-short' })),
      () => loadApp4SecretPepperConfig(env({ [SECURE_LINK_TOKEN_PEPPER_ENV]: VERIFICATION })),
      () => loadApp4SecretPepperConfig(env({ NOTIFICATION_DELIVERY_ENVELOPE_KEY: VERIFICATION })),
    ];
    for (const run of cases) {
      let message = '';
      try {
        run();
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).not.toBe('');
      expect(message).not.toContain(VERIFICATION);
      expect(message).not.toContain(SECURE_LINK);
      expect(message).not.toContain('too-short');
      // The variable NAME is the one identifying detail an operator needs.
      expect(message).toMatch(/_PEPPER|_KEY/);
    }
  });
});
