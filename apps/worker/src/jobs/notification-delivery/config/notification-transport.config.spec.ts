/**
 * Transport selection and its fail-closed rules (`APP12-N01.B01` §6, §21).
 *
 * The defect this guards against is the one `APP12-U01` found in production
 * wiring, not in a delivery: a deployment that resolves to the recording adapter
 * reports every send as successful and delivers nothing. So the cases that
 * matter most here are the refusals.
 */
import {
  loadNotificationTransportConfig,
  loadSmtpTransportConfig,
} from './notification-transport.config';

const SMTP_ENV = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_USERNAME: 'mailer',
  SMTP_PASSWORD: 's3cret-value',
  EMAIL_FROM_ADDRESS: 'no-reply@netheu.test',
  EMAIL_FROM_NAME: 'Nét Thêu',
} as const;

describe('loadNotificationTransportConfig', () => {
  describe('the variable must be stated', () => {
    it('refuses an unset transport rather than defaulting', () => {
      expect(() => loadNotificationTransportConfig({ NODE_ENV: 'development' })).toThrow(
        /NOTIFICATION_TRANSPORT is not set/,
      );
    });

    it('refuses an unknown transport', () => {
      expect(() =>
        loadNotificationTransportConfig({ NODE_ENV: 'development', NOTIFICATION_TRANSPORT: 'SES' }),
      ).toThrow(/must be one of/);
    });

    it('accepts the value case-insensitively', () => {
      expect(
        loadNotificationTransportConfig({
          NODE_ENV: 'development',
          NOTIFICATION_TRANSPORT: 'recording',
        }),
      ).toEqual({ transport: 'RECORDING' });
    });
  });

  describe('a delivering environment', () => {
    it.each(['production', 'staging'])('refuses RECORDING in %s', (nodeEnv) => {
      expect(() =>
        loadNotificationTransportConfig({
          NODE_ENV: nodeEnv,
          NOTIFICATION_TRANSPORT: 'RECORDING',
        }),
      ).toThrow(/delivers to nobody/);
    });

    it.each(['production', 'staging'])('requires the SMTP block in %s', (nodeEnv) => {
      expect(() =>
        loadNotificationTransportConfig({ NODE_ENV: nodeEnv, NOTIFICATION_TRANSPORT: 'SMTP' }),
      ).toThrow(/SMTP_HOST is not set/);
    });

    it('refuses an unencrypted session in production', () => {
      expect(() =>
        loadNotificationTransportConfig({
          NODE_ENV: 'production',
          NOTIFICATION_TRANSPORT: 'SMTP',
          ...SMTP_ENV,
          SMTP_SECURE: 'false',
          SMTP_REQUIRE_TLS: 'false',
        }),
      ).toThrow(/SMTP_REQUIRE_TLS=false is refused/);
    });

    it('accepts a complete SMTP configuration', () => {
      const config = loadNotificationTransportConfig({
        NODE_ENV: 'production',
        NOTIFICATION_TRANSPORT: 'SMTP',
        ...SMTP_ENV,
      });

      expect(config).toEqual({
        transport: 'SMTP',
        smtp: {
          host: 'smtp.example.test',
          port: 587,
          secure: false,
          requireTls: true,
          username: 'mailer',
          password: 's3cret-value',
          fromAddress: 'no-reply@netheu.test',
          fromName: 'Nét Thêu',
        },
      });
    });

    it('permits RECORDING outside a delivering environment', () => {
      expect(
        loadNotificationTransportConfig({ NODE_ENV: 'test', NOTIFICATION_TRANSPORT: 'RECORDING' }),
      ).toEqual({ transport: 'RECORDING' });
    });
  });

  describe('SMTP field validation', () => {
    it('requires every field, naming the variable', () => {
      for (const omitted of Object.keys(SMTP_ENV)) {
        const env: Record<string, string> = { ...SMTP_ENV };
        delete env[omitted];
        expect(() => loadSmtpTransportConfig(env)).toThrow(new RegExp(`${omitted} is not set`));
      }
    });

    it('rejects a non-numeric or out-of-range port', () => {
      expect(() => loadSmtpTransportConfig({ ...SMTP_ENV, SMTP_PORT: 'submission' })).toThrow(
        /SMTP_PORT must be an integer/,
      );
      expect(() => loadSmtpTransportConfig({ ...SMTP_ENV, SMTP_PORT: '70000' })).toThrow(
        /SMTP_PORT must be an integer/,
      );
    });

    it('rejects a non-boolean SMTP_SECURE', () => {
      expect(() => loadSmtpTransportConfig({ ...SMTP_ENV, SMTP_SECURE: 'yes' })).toThrow(
        /SMTP_SECURE must be "true" or "false"/,
      );
    });

    it.each([
      ['a display name', 'Nét Thêu <no-reply@netheu.test>'],
      ['no domain', 'no-reply'],
      ['two addresses', 'a@b.test,c@d.test'],
      ['a trailing at', 'no-reply@'],
    ])('rejects a sender address that is %s', (_label, value) => {
      expect(() => loadSmtpTransportConfig({ ...SMTP_ENV, EMAIL_FROM_ADDRESS: value })).toThrow(
        /EMAIL_FROM_ADDRESS/,
      );
    });

    it('preserves a password with surrounding whitespace', () => {
      // Trimming would turn a valid credential into an authentication failure
      // that reads as "wrong password" rather than "mangled by us".
      const config = loadSmtpTransportConfig({ ...SMTP_ENV, SMTP_PASSWORD: '  padded  ' });

      expect(config.password).toBe('  padded  ');
    });
  });

  describe('secret hygiene', () => {
    it('never puts the password in a validation error', () => {
      const password = 'super-secret-value';
      let message = '';
      try {
        loadSmtpTransportConfig({ ...SMTP_ENV, SMTP_PASSWORD: password, SMTP_PORT: 'nope' });
      } catch (error: unknown) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).not.toContain(password);
      expect(message).toContain('SMTP_PORT');
    });
  });
});
