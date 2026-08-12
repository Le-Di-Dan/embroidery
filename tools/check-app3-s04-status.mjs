/**
 * `APP3-S04`'s legitimate statuses, and whether it has shipped.
 *
 * Kept out of the gate module so the runtime rules and the status vocabulary can
 * be read — and mutated by a test — independently.
 */
import { isS04Delivered } from './app3-accepted-paths.mjs';

export { isS04Delivered };

/**
 * The statuses `APP3-S04` may legitimately be recorded under.
 *
 * `GROUP_BLOCKED` is part of the delivered status rather than a footnote: the
 * capability row names `group`, this checkpoint could not implement it under
 * accepted authority, and a bare "COMPLETE" would read as though it had.
 */
export function s04StatusLines() {
  return [
    'APP3-S04 = BLOCKED_BY_APP3-S06_CORRECTION_REVIEW',
    'APP3-S04 = READY — NOT STARTED',
    'APP3-S04 = COMPLETE — REVIEW_DELIVERED — GROUP_BLOCKED',
    'APP3-S04 = COMPLETE — REVIEW_ACCEPTED — GROUP_BLOCKED',
  ];
}
