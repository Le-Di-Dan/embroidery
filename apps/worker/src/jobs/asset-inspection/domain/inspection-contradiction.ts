/**
 * A durable state that cannot be reconciled (APP2-W01 §18).
 *
 * Distinct from `AssetRejectedError` on purpose. A rejection says "this file is
 * not publishable" and is written as evidence; a contradiction says "the
 * database is telling me two incompatible things about this asset", and the
 * only safe response is to stop — no cleanup, no overwrite, no repair. Repair
 * is a decision a human makes with the evidence in front of them, and an
 * automatic one would destroy the evidence it needed.
 *
 * The reason is a short, closed-vocabulary phrase for the operator's log line.
 * It never carries a key, a checksum or a payload.
 */
export class AssetInspectionContradictionError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Asset inspection state is contradictory (${reason}).`);
    this.name = 'AssetInspectionContradictionError';
    this.reason = reason;
  }
}

export function contradiction(reason: string): AssetInspectionContradictionError {
  return new AssetInspectionContradictionError(reason);
}

export function isContradiction(error: unknown): error is AssetInspectionContradictionError {
  return error instanceof AssetInspectionContradictionError;
}
