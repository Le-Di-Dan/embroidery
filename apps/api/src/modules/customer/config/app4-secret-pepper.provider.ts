/**
 * The API's handle on the two APP4 peppers (`APP4-B03`, `ADR-APP4-001` §5.3).
 *
 * **Lazily resolved**, and this diverges from `DESIGN_SESSION_AUTH_CONFIG`'s
 * eager factory on purpose. The reason is the one `DeliveryEnvelopeKeyProvider`
 * already records for the envelope key, in this same phase: a Nest factory would
 * make every API process — and the `staff-bootstrap` CLI, which boots the same
 * `AppModule` — refuse to start without a pepper, including the many paths that
 * never issue an APP4 secret. `.env.example` ships both variables empty, so an
 * eager read would break local bootstrap for a capability the process is not
 * using, and `staff-bootstrap` is the very command an operator would run *to*
 * configure the system.
 *
 * It is still fail-closed where it matters. Nothing can mint a verification code
 * without a validated pepper, because {@link require} is the only way to obtain
 * one and it throws — naming the variable, never the value — when the
 * environment does not carry a usable pair. The failure surfaces at the issuance
 * call, which is the request that would otherwise have produced a credential
 * nobody could verify.
 *
 * The validated pair is memoized, so the environment is read once per process.
 * Neither value is logged, serialized or placed in a request context.
 */
import { Injectable } from '@nestjs/common';

import {
  loadApp4SecretPepperConfig,
  type App4SecretPepperConfig,
} from './app4-secret-pepper.config';

@Injectable()
export class App4SecretPepperProvider {
  private cached: App4SecretPepperConfig | undefined;

  require(): App4SecretPepperConfig {
    this.cached ??= loadApp4SecretPepperConfig(process.env);
    return this.cached;
  }
}
