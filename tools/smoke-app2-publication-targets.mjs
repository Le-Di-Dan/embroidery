/**
 * APP2-A04-C1 — touch-target measurement for the production publication smoke.
 *
 * Separated from the scenario file because it answers a different question:
 * the scenarios ask whether the publication interaction behaves correctly, this
 * asks whether its controls are physically usable on a touch screen. Keeping it
 * apart also keeps the one permitted exclusion in a single obvious place, where
 * widening it is a visible act rather than an edit buried among assertions.
 *
 * Pure measurement — no navigation, no mutation, no reporting.
 */

/** Project minimum interactive target, mirroring `$size-touch-target-min`. */
export const TOUCH_TARGET_MIN = 44;

/**
 * The only elements exempt from measurement, named exactly rather than matched
 * by pattern.
 *
 * `admin-shell__skip-link` is parked off-canvas via `transform: translateY(-200%)`
 * and revealed only on `:focus-visible`. It is a keyboard affordance in the APP1
 * shell and is never presented to a pointer, so its height is not a touch-target
 * measurement.
 *
 * A closed list is the point. A predicate ("skip anything visually hidden", "skip
 * links") could quietly grow until it swallowed a real failure — which is exactly
 * how the 16px publication back link could have been made to disappear instead of
 * being fixed.
 */
export const TOUCH_TARGET_EXCLUSIONS = Object.freeze(['admin-shell__skip-link']);

/**
 * Returns every visible interactive control in the current viewport whose
 * computed box is shorter than the minimum, each carrying the selector,
 * accessible name and measured size needed to act on it.
 *
 * Geometry is read from `getBoundingClientRect()`, not inferred from class names,
 * so a control that *looks* styled correctly but renders short is still caught.
 */
export async function measureUndersizedTargets(page, state) {
  return page.evaluate(
    ({ state: where, min, allowed }) =>
      [...document.querySelectorAll('button, a[href], [role="button"]')]
        .filter((control) => {
          if (allowed.includes(control.className)) return false;
          const box = control.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && box.height < min;
        })
        .map((control) => {
          const box = control.getBoundingClientRect();
          const className = control.getAttribute('class') ?? '';
          return {
            state: where,
            selector: `${control.tagName.toLowerCase()}.${className.split(' ')[0]}`,
            name: (control.getAttribute('aria-label') ?? control.textContent ?? '')
              .trim()
              .slice(0, 40),
            height: Math.round(box.height),
            width: Math.round(box.width),
          };
        }),
    { state, min: TOUCH_TARGET_MIN, allowed: [...TOUCH_TARGET_EXCLUSIONS] },
  );
}
