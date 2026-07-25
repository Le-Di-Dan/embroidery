import {
  STATUS_EXIT_CODE,
  decideBootstrapPreflight,
  inspectBootstrapEnv,
  resolveBootstrapEnvironment,
} from './staff-bootstrap-policy';

const FULL = {
  STAFF_BOOTSTRAP_EMAIL: 'admin@example.test',
  STAFF_BOOTSTRAP_PASSWORD: 'correct horse battery',
  STAFF_BOOTSTRAP_DISPLAY_NAME: 'Operator',
} as const;

function env(node: string | undefined, extra: Record<string, string | undefined> = {}) {
  return { ...(node === undefined ? {} : { NODE_ENV: node }), ...extra } as NodeJS.ProcessEnv;
}

describe('resolveBootstrapEnvironment', () => {
  it.each([
    ['development', 'development'],
    ['test', 'development'],
    ['production', 'production'],
  ])('maps %s to %s policy', (raw, expected) => {
    expect(resolveBootstrapEnvironment(raw)).toBe(expected);
  });

  it.each([undefined, '', 'staging', 'prod'])('treats %s as unknown', (raw) => {
    expect(resolveBootstrapEnvironment(raw)).toBeUndefined();
  });
});

describe('inspectBootstrapEnv', () => {
  it('collects all present credentials in development', () => {
    const result = inspectBootstrapEnv(env('development', FULL));
    expect(result.missing).toEqual([]);
    expect(result.credentials).toEqual({
      email: 'admin@example.test',
      password: 'correct horse battery',
      displayName: 'Operator',
    });
  });

  it.each(['STAFF_BOOTSTRAP_EMAIL', 'STAFF_BOOTSTRAP_PASSWORD', 'STAFF_BOOTSTRAP_DISPLAY_NAME'])(
    'flags a single missing variable %s',
    (name) => {
      const partial: Record<string, string> = { ...FULL };
      delete partial[name];
      const result = inspectBootstrapEnv(env('development', partial));
      expect(result.missing).toEqual([name]);
      expect(result.credentials).toBeUndefined();
    },
  );

  it('treats whitespace-only email and display name as missing', () => {
    const result = inspectBootstrapEnv(
      env('development', {
        ...FULL,
        STAFF_BOOTSTRAP_EMAIL: '   ',
        STAFF_BOOTSTRAP_DISPLAY_NAME: ' ',
      }),
    );
    expect(result.missing).toEqual(['STAFF_BOOTSTRAP_EMAIL', 'STAFF_BOOTSTRAP_DISPLAY_NAME']);
  });

  it('does not trim or reject a whitespace-bearing password', () => {
    const result = inspectBootstrapEnv(
      env('development', { ...FULL, STAFF_BOOTSTRAP_PASSWORD: '  spaced pw value  ' }),
    );
    expect(result.missing).toEqual([]);
    expect(result.credentials?.password).toBe('  spaced pw value  ');
  });
});

describe('decideBootstrapPreflight', () => {
  it('proceeds (undefined) when development has all variables', () => {
    expect(decideBootstrapPreflight(inspectBootstrapEnv(env('development', FULL)))).toBeUndefined();
  });

  it('proceeds when production has all variables', () => {
    expect(decideBootstrapPreflight(inspectBootstrapEnv(env('production', FULL)))).toBeUndefined();
  });

  it('fails development when any variable is missing', () => {
    const decision = decideBootstrapPreflight(inspectBootstrapEnv(env('development', {})));
    expect(decision?.status).toBe('FAILED_MISSING_ENV_DEVELOPMENT');
    expect(decision?.message).toContain('STAFF_BOOTSTRAP_EMAIL');
  });

  it('skips production when variables are missing', () => {
    const decision = decideBootstrapPreflight(inspectBootstrapEnv(env('production', {})));
    expect(decision?.status).toBe('SKIPPED_MISSING_ENV_PRODUCTION');
  });

  it('skips production on partial variables', () => {
    const decision = decideBootstrapPreflight(
      inspectBootstrapEnv(env('production', { STAFF_BOOTSTRAP_EMAIL: FULL.STAFF_BOOTSTRAP_EMAIL })),
    );
    expect(decision?.status).toBe('SKIPPED_MISSING_ENV_PRODUCTION');
  });

  it('fails closed on an unknown environment', () => {
    const decision = decideBootstrapPreflight(inspectBootstrapEnv(env('staging', FULL)));
    expect(decision?.status).toBe('FAILED_BOOTSTRAP');
  });

  it('never includes the password value in any decision message', () => {
    for (const node of ['development', 'production', 'staging']) {
      const decision = decideBootstrapPreflight(
        inspectBootstrapEnv(env(node, { STAFF_BOOTSTRAP_PASSWORD: 'S3cret-should-not-leak' })),
      );
      if (decision !== undefined) {
        expect(decision.message).not.toContain('S3cret-should-not-leak');
      }
    }
  });
});

describe('STATUS_EXIT_CODE', () => {
  it('exits 0 only for success and production-skip states', () => {
    expect(STATUS_EXIT_CODE.CREATED).toBe(0);
    expect(STATUS_EXIT_CODE.REUSED_EXISTING).toBe(0);
    expect(STATUS_EXIT_CODE.SKIPPED_MISSING_ENV_PRODUCTION).toBe(0);
    expect(STATUS_EXIT_CODE.FAILED_MISSING_ENV_DEVELOPMENT).toBe(1);
    expect(STATUS_EXIT_CODE.FAILED_EXISTING_ADMIN_MISMATCH).toBe(1);
    expect(STATUS_EXIT_CODE.FAILED_EXISTING_ADMIN_NOT_ACTIVE).toBe(1);
    expect(STATUS_EXIT_CODE.FAILED_BOOTSTRAP).toBe(1);
  });
});
