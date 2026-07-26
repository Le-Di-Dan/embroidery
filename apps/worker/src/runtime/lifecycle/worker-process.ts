/**
 * The process-termination seam (APP2-I02-C1 §6).
 *
 * Injected rather than called directly so a test can observe a fatal exit
 * instead of killing the Jest worker — and so there is exactly **one** place in
 * the runtime that can end the process.
 *
 * Terminating the process is not a convenience here. A JavaScript handler that
 * ignores its `AbortSignal` cannot be cancelled: Node has no way to stop a
 * running promise. The process boundary is therefore the *only* mechanism that
 * can guarantee the handler stops before its lease is released to someone else.
 */

export interface WorkerProcess {
  exit(code: number): void;
}

export const WORKER_PROCESS = Symbol('WORKER_PROCESS');

export const systemWorkerProcess: WorkerProcess = {
  exit: (code) => {
    process.exit(code);
  },
};

/**
 * Time reserved between the hard-stop deadline and the lease expiring
 * (`fatalExitSafetyMs`).
 *
 * It is the budget for closing the application context and the connection pool
 * and calling `exit`. It is deliberately **not** an environment variable and
 * not a policy field: it is a property of this runtime's shutdown path, not an
 * operational tuning knob, and an operator lowering it could only ever make the
 * fatal exit race the lease it exists to beat.
 *
 * Policy validation requires `leaseSafetyMarginMs` to exceed it, so the
 * margin-derived deadline can never be the tighter of the two by accident.
 */
export const FATAL_EXIT_SAFETY_MS = 250;
