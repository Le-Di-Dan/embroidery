import { AuthenticateStaffUseCase } from './authenticate-staff.use-case';
import { StaffLoginFailedError, StaffRateLimitedError } from '../domain/staff-auth.errors';
import { LoginRateLimiter } from '../infrastructure/rate-limit/login-rate-limiter';
import { SessionTokenService } from '../infrastructure/crypto/session-token.service';
import type {
  AdminAccount,
  AdminAccountRepository,
} from '../domain/repositories/admin-account.repository';
import type { AdminSessionRepository } from '../domain/repositories/admin-session.repository';
import type { StaffAuthConfig } from '../config/staff-auth.config';

const CONFIG = {
  idleTimeoutMs: 30 * 60 * 1000,
  absoluteTimeoutMs: 12 * 60 * 60 * 1000,
  identifierRateLimit: { max: 5, windowMs: 60_000 },
  ipRateLimit: { max: 20, windowMs: 60_000 },
  globalRateLimit: { max: 100, windowMs: 60_000 },
} as StaffAuthConfig;

function account(status: AdminAccount['status'] = 'ACTIVE'): AdminAccount {
  return {
    id: 'admin-1' as AdminAccount['id'],
    email: 'ops@example.test',
    displayName: 'Ops',
    status,
    lockedAt: undefined,
    disabledAt: undefined,
    replacedByAdminAccountId: undefined,
    createdAt: new Date(0),
  };
}

interface Fakes {
  useCase: AuthenticateStaffUseCase;
  verify: jest.Mock;
  verifyDummy: jest.Mock;
  issue: jest.Mock;
  rotate: jest.Mock;
  bindActor: jest.Mock;
  loginSucceeded: jest.Mock;
  loginFailed: jest.Mock;
}

function build(options: {
  account?: AdminAccount | undefined;
  credential?: { credentialReference: string } | undefined;
  verifyResult?: { ok: boolean; needsRehash: boolean };
}): Fakes {
  const verify = jest.fn(() =>
    Promise.resolve(options.verifyResult ?? { ok: false, needsRehash: false }),
  );
  const verifyDummy = jest.fn(() => Promise.resolve());
  const rotate = jest.fn(() => Promise.resolve());
  const issue = jest.fn(() => Promise.resolve());
  const bindActor = jest.fn();
  const loginSucceeded = jest.fn(() => Promise.resolve());
  const loginFailed = jest.fn(() => Promise.resolve());

  const accounts = {
    findByEmail: () => Promise.resolve(options.account),
    findActiveCredential: () => Promise.resolve(options.credential),
    rotateCredential: rotate,
  } as unknown as AdminAccountRepository;
  const sessions = { issue } as unknown as AdminSessionRepository;
  const hasher = {
    verify,
    verifyDummy,
    hash: () => Promise.resolve('rehashed-ref'),
  } as unknown as ConstructorParameters<typeof AuthenticateStaffUseCase>[2];
  const transactions = {
    runInTransaction: (work: () => Promise<unknown>) => work(),
  } as unknown as ConstructorParameters<typeof AuthenticateStaffUseCase>[5];
  const requestContext = { bindActor } as unknown as ConstructorParameters<
    typeof AuthenticateStaffUseCase
  >[6];
  const audit = { loginSucceeded, loginFailed } as unknown as ConstructorParameters<
    typeof AuthenticateStaffUseCase
  >[7];

  const useCase = new AuthenticateStaffUseCase(
    accounts,
    sessions,
    hasher,
    new SessionTokenService(),
    new LoginRateLimiter(() => 0),
    transactions,
    requestContext,
    audit,
    { now: () => new Date(1000) },
    CONFIG,
  );
  return { useCase, verify, verifyDummy, issue, rotate, bindActor, loginSucceeded, loginFailed };
}

const COMMAND = { email: 'ops@example.test', password: 'operator-secret-1', ipAddress: '10.0.0.1' };

describe('AuthenticateStaffUseCase', () => {
  it('runs a dummy scrypt and fails uniformly for an unknown account', async () => {
    const f = build({ account: undefined, credential: undefined });
    await expect(f.useCase.authenticate(COMMAND)).rejects.toBeInstanceOf(StaffLoginFailedError);
    expect(f.verifyDummy).toHaveBeenCalledTimes(1);
    expect(f.verify).not.toHaveBeenCalled();
    expect(f.issue).not.toHaveBeenCalled();
    expect(f.bindActor).not.toHaveBeenCalled();
    expect(f.loginFailed).toHaveBeenCalledWith('INVALID_CREDENTIALS');
  });

  it('fails uniformly on a wrong password', async () => {
    const f = build({
      account: account(),
      credential: { credentialReference: 'ref' },
      verifyResult: { ok: false, needsRehash: false },
    });
    await expect(f.useCase.authenticate(COMMAND)).rejects.toBeInstanceOf(StaffLoginFailedError);
    expect(f.verify).toHaveBeenCalledTimes(1);
    expect(f.issue).not.toHaveBeenCalled();
    expect(f.loginFailed).toHaveBeenCalledWith('INVALID_CREDENTIALS');
  });

  it('verifies the password even for a locked account, then fails without a session', async () => {
    const f = build({
      account: account('LOCKED'),
      credential: { credentialReference: 'ref' },
      verifyResult: { ok: true, needsRehash: false },
    });
    await expect(f.useCase.authenticate(COMMAND)).rejects.toBeInstanceOf(StaffLoginFailedError);
    expect(f.verify).toHaveBeenCalledTimes(1);
    expect(f.bindActor).not.toHaveBeenCalled();
    expect(f.issue).not.toHaveBeenCalled();
    expect(f.loginFailed).toHaveBeenCalledWith('ACCOUNT_NOT_ACTIVE');
  });

  it('issues a session and binds the admin actor on success', async () => {
    const f = build({
      account: account(),
      credential: { credentialReference: 'ref' },
      verifyResult: { ok: true, needsRehash: false },
    });
    const result = await f.useCase.authenticate(COMMAND);
    expect(result.rawToken).toEqual(expect.any(String));
    expect(f.bindActor).toHaveBeenCalledTimes(1);
    expect(f.issue).toHaveBeenCalledTimes(1);
    expect(f.loginSucceeded).toHaveBeenCalledWith('admin-1');
    expect(f.rotate).not.toHaveBeenCalled();
  });

  it('rehashes the credential when parameters are obsolete', async () => {
    const f = build({
      account: account(),
      credential: { credentialReference: 'ref' },
      verifyResult: { ok: true, needsRehash: true },
    });
    await f.useCase.authenticate(COMMAND);
    expect(f.rotate).toHaveBeenCalledTimes(1);
  });

  it('rejects with a rate-limit error before any lookup once the limit is hit', async () => {
    const f = build({ account: account(), credential: { credentialReference: 'ref' } });
    // Exhaust the identifier window (max 5), then the 6th attempt is limited.
    for (let i = 0; i < 5; i += 1) {
      f.verify.mockResolvedValueOnce({ ok: false, needsRehash: false });
      await f.useCase.authenticate(COMMAND).catch(() => undefined);
    }
    await expect(f.useCase.authenticate(COMMAND)).rejects.toBeInstanceOf(StaffRateLimitedError);
    expect(f.loginFailed).toHaveBeenCalledWith('RATE_LIMITED');
  });
});
