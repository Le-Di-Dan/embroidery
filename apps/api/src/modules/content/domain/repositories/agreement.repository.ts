/**
 * AGG-21 Agreement persistence contract (TBL-068, TBL-069).
 *
 * Carries **G-DB7-01** (a current version must belong to its agreement) and
 * feeds **G-DB7-16** (GRD-008: an approval captures the effective version and
 * its exact content hash).
 *
 * A published version is immutable. That is enforced physically by an S24
 * trigger, so this contract offers no method that would edit one.
 */
import type { AgreementVersionState } from '@embroidery/database';

export type AgreementId = string & { readonly __brand: 'AgreementId' };
export type AgreementVersionId = string & { readonly __brand: 'AgreementVersionId' };

export interface Agreement {
  readonly id: AgreementId;
  readonly agreementType: string;
  readonly name: string;
  readonly currentVersionId: AgreementVersionId | undefined;
}

export interface AgreementVersion {
  readonly id: AgreementVersionId;
  readonly agreementId: AgreementId;
  readonly version: number;
  readonly status: AgreementVersionState;
  readonly content: string;
  /** `sha256:<64 hex>`; required once published, so GRD-008 can bind exactly. */
  readonly contentHash: string | undefined;
  readonly language: string;
  readonly effectiveFrom: Date | undefined;
}

export interface AddAgreementVersionInput {
  readonly id: AgreementVersionId;
  readonly agreementId: AgreementId;
  readonly content: string;
  readonly language: string;
}

export const AGREEMENT_REPOSITORY = Symbol('AGREEMENT_REPOSITORY');

export interface AgreementRepository {
  /** Creates the container for a policy type if absent. @requiresTransaction */
  ensureAgreement(agreementType: string, name: string): Promise<Agreement>;

  /** Adds a DRAFT version. @requiresTransaction */
  addVersion(input: AddAgreementVersionInput): Promise<AgreementVersion>;

  /**
   * Publishes a draft and makes it current, superseding the previous one.
   *
   * The content hash and effective instant are required at publish — the
   * schema's CHECKs enforce both, because an unhashed published term would
   * break GRD-008's exact-hash binding.
   *
   * @requiresTransaction
   */
  publishVersion(
    id: AgreementVersionId,
    contentHash: string,
    effectiveFrom: Date,
  ): Promise<AgreementVersion>;

  /** Points the agreement at one of its **own** versions (G-DB7-01). @requiresTransaction */
  setCurrentVersion(agreementId: AgreementId, versionId: AgreementVersionId): Promise<void>;

  /** @requiresTransaction — a reason is mandatory, and the schema agrees. */
  withdrawVersion(id: AgreementVersionId, reason: string): Promise<void>;

  findByType(agreementType: string): Promise<Agreement | undefined>;
  findVersion(id: AgreementVersionId): Promise<AgreementVersion | undefined>;
  currentVersion(agreementType: string): Promise<AgreementVersion | undefined>;

  /**
   * The published, in-force version of each requested policy type (GRD-008).
   *
   * One query for all types rather than one per type: an approval needs the
   * whole required set, and per-type queries would be an N+1 on the approval
   * path.
   */
  effectiveVersions(agreementTypes: readonly string[], at: Date): Promise<AgreementVersion[]>;
}
