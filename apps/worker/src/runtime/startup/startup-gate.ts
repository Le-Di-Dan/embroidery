/**
 * The worker startup gate (APP2-I03 §7).
 *
 * A dependency the poll runtime must satisfy *before* it claims anything, kept
 * deliberately abstract: the runtime is the generic job engine and has no
 * business knowing what object storage, or any future gate, is. It knows only
 * that a gate either opens or reports a safe class.
 *
 * Returning a result instead of throwing is the same choice the payload
 * contract makes (`PayloadValidationResult`): a failed gate is an expected
 * startup state that must leave the process up, unready and claiming nothing —
 * not an exception that unwinds through Nest's initialization and leaves the
 * database pool open with no handle to close it.
 */
export const WORKER_STARTUP_GATE = Symbol('WORKER_STARTUP_GATE');

export interface StartupGateOpen {
  readonly ok: true;
}

export interface StartupGateClosed {
  readonly ok: false;
  /** A stable, safe class. Never a provider message, endpoint or credential. */
  readonly errorClass: string;
}

export type StartupGateResult = StartupGateOpen | StartupGateClosed;

export interface WorkerStartupGate {
  /**
   * Resolves once the gate's precondition holds. Must be idempotent: the
   * runtime calls it once, but a supervisor may construct the graph again.
   */
  ensureReady(): Promise<StartupGateResult>;
}

/**
 * A gate that is always open.
 *
 * Used by the graphs that legitimately have no external precondition — the
 * runtime's own integration harness, which proves queue behaviour against a
 * disposable database and no object store. Production never binds this: the
 * worker composition root binds the object-storage bootstrap.
 */
export const openStartupGate: WorkerStartupGate = {
  ensureReady: (): Promise<StartupGateResult> => Promise.resolve({ ok: true }),
};
