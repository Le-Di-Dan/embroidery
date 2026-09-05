/**
 * The `APP12-H08` mechanical measurements: contrast, reflow, target size and
 * keyboard focus.
 *
 * Everything here reads the **rendered** page rather than the stylesheet. That
 * is the whole point: a token's declared value says what a designer intended,
 * and `APP12-H08` §8 asks what a browser actually painted after cascade,
 * inheritance, opacity and the shell's own background have had their say.
 *
 * Nothing returned by this module can carry a secret. Contrast returns colours
 * and ratios, reflow returns two integers, target size returns rectangles, and
 * the focus walk returns each element's role, tag and accessible name — where
 * that name is read from `aria-label`, the associated `<label>` or the visible
 * text of a button or link, all of which are approved product copy. It never
 * reads an input's `value`, so a typed contact, code, address or amount cannot
 * cross the boundary.
 *
 * Test-only. Never imported by application code.
 */
import { readFileSync } from 'node:fs';

/**
 * Every colour the locked design-token file declares, read from the file.
 *
 * `APP12-H08` needs to answer one question about contrast that a list of
 * hex strings in a spec cannot: **is this failure the token layer's, or did a
 * component invent a colour?** The first is `APP12-V02`'s to repair under
 * `PO-APP12-004`'s bounded authority; the second would be an H08 defect under
 * §13's "small contrast defects", because a one-off value in a component is
 * exactly the kind of local mistake this gate exists to catch.
 *
 * So the set is derived from `packages/styles/src/settings/_color.scss` at run
 * time rather than transcribed. A transcription would rot the moment a token
 * moved, and — worse — would quietly turn a newly invented component colour
 * into "one of the known ones".
 *
 * `rgba(...)` declarations are skipped: the scrim is a compositing layer, and
 * axe reports the *composited* result rather than the declared value, so it
 * could never match anyway.
 */
export function lockedColorTokens(colorScssPath) {
  const source = readFileSync(colorScssPath, 'utf8');
  const tokens = new Map();
  for (const line of source.split('\n')) {
    const match = /^\$([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/.exec(line.trim());
    if (match !== null) tokens.set(match[2].toLowerCase(), match[1]);
  }
  return tokens;
}

/**
 * WCAG 2.2 SC 2.5.8 Target Size (Minimum), AA — 24×24 CSS pixels.
 *
 * The criterion has exceptions (spacing, inline, essential, user-agent
 * control), so this returns measurements and lets the spec apply them rather
 * than pretending a number alone is a verdict.
 */
export const MIN_TARGET_PX = 24;

/**
 * Every rendered contrast pair axe judged to fail, with its measured ratio.
 *
 * Runs axe's `color-contrast` rule alone and keeps the rule's own measurement
 * data — foreground, background, ratio, the threshold it was held to, and the
 * font size and weight that chose that threshold. `h08-axe.mjs` deliberately
 * drops per-node data because it also scans secret-bearing screens; here the
 * data is two colours and a number, so it is kept.
 */
export async function measureContrast(page) {
  return page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: { type: 'rule', values: ['color-contrast'] },
    });
    const failures = [];
    for (const violation of result.violations) {
      for (const node of violation.nodes) {
        const checks = [...(node.any ?? []), ...(node.all ?? [])];
        const check = checks.find(
          (candidate) =>
            candidate.data !== undefined &&
            candidate.data !== null &&
            candidate.data.contrastRatio !== undefined,
        );
        if (check === undefined) continue;
        failures.push({
          target: String(node.target),
          impact: node.impact,
          fg: check.data.fgColor,
          bg: check.data.bgColor,
          ratio: check.data.contrastRatio,
          required: check.data.expectedContrastRatio,
          fontSizePt: check.data.fontSize,
          fontWeight: check.data.fontWeight,
        });
      }
    }
    return {
      failures,
      passes: result.passes === undefined ? 0 : result.passes.length,
      incomplete: result.incomplete === undefined ? 0 : result.incomplete.length,
    };
  });
}

/**
 * Horizontal overflow of the document, in CSS pixels.
 *
 * SC 1.4.10 Reflow is failed by content that requires scrolling in **two**
 * directions. A vertical scrollbar is normal; a horizontal one is the failure.
 * One pixel of tolerance absorbs sub-pixel rounding, which is a rendering
 * artefact rather than content a reader has to scroll to.
 */
export async function measureOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const overflowPx = doc.scrollWidth - doc.clientWidth;
    // The widest element actually sticking out, named by selector so a failure
    // says which box to look at rather than only that one exists.
    let widest;
    if (overflowPx > 1) {
      const limit = doc.clientWidth + 1;
      for (const element of document.body.querySelectorAll('*')) {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.right <= limit) continue;
        const id = element.id === '' ? '' : '#' + element.id;
        const cls =
          typeof element.className === 'string' && element.className !== ''
            ? '.' + element.className.trim().split(/\s+/).slice(0, 2).join('.')
            : '';
        widest = {
          selector: element.tagName.toLowerCase() + id + cls,
          right: Math.round(rect.right),
        };
        break;
      }
    }
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      overflowPx,
      overflows: overflowPx > 1,
      ...(widest === undefined ? {} : { widest }),
    };
  });
}

/**
 * The rendered box of every interactive control currently on screen.
 *
 * Only visible, enabled controls are measured: a `display: none` responsive
 * sibling has no target to be too small, and a disabled control cannot be
 * activated at all. The selector is composed from tag, id and the first two
 * classes, which is enough to find the box again and carries no content.
 */
export async function measureTargets(page) {
  return page.evaluate((minPx) => {
    const SELECTOR =
      'a[href], button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
    const measured = [];
    for (const element of document.querySelectorAll(SELECTOR)) {
      if (element.hasAttribute('disabled')) continue;
      if (element.closest('fieldset[disabled]') !== null) continue;
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      // A control whose own box is small but whose label wraps it — the pattern
      // the purchase pills and the queue filters both use — is measured on the
      // label, because that is the area a finger actually hits.
      const label = element.closest('label');
      const box = label === null ? rect : label.getBoundingClientRect();
      const id = element.id === '' ? '' : '#' + element.id;
      const cls =
        typeof element.className === 'string' && element.className !== ''
          ? '.' + element.className.trim().split(/\s+/).slice(0, 2).join('.')
          : '';
      measured.push({
        selector: element.tagName.toLowerCase() + id + cls,
        width: Math.round(box.width),
        height: Math.round(box.height),
        centreX: box.left + box.width / 2,
        centreY: box.top + box.height / 2,
        // SC 2.5.8's inline exception: a control inside a sentence is sized by
        // the text around it and is explicitly out of scope.
        inline: style.display === 'inline' || element.closest('p') !== null,
        undersized: Math.round(box.width) < minPx || Math.round(box.height) < minPx,
      });
    }

    // SC 2.5.8's **spacing** exception, applied mechanically rather than by eye.
    //
    // The criterion's own words: an undersized target conforms when a circle of
    // `minPx` diameter centred on its bounding box does not intersect the circle
    // of any other target. Two such circles intersect when their centres are
    // closer than `minPx` apart. A 22px-tall header nav link 80px from its
    // neighbour is therefore conforming; a 20px link stacked 8px below another
    // is not — a distinction no reading of the height alone can make, which is
    // why this is computed rather than asserted as a bare `>= 24`.
    for (const target of measured) {
      if (!target.undersized || target.inline) {
        target.spacingExempt = false;
        continue;
      }
      let clear = true;
      for (const other of measured) {
        if (other === target) continue;
        const dx = other.centreX - target.centreX;
        const dy = other.centreY - target.centreY;
        if (Math.sqrt(dx * dx + dy * dy) < minPx) {
          clear = false;
          break;
        }
      }
      target.spacingExempt = clear;
    }
    return measured;
  }, MIN_TARGET_PX);
}

/**
 * A safe description of whatever currently has focus.
 *
 * Never reads `value`. The name comes from `aria-label`, `aria-labelledby`, the
 * associated `<label>`, or the element's own text — all approved product copy.
 */
export async function describeActive(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) {
      return { tag: 'body', type: '', role: '', id: '', name: '', visible: false };
    }
    const style = window.getComputedStyle(active);
    const rect = active.getBoundingClientRect();
    const labelledBy = active.getAttribute('aria-labelledby');
    const labelled =
      labelledBy === null
        ? undefined
        : labelledBy
            .split(/\s+/)
            .map((id) => {
              const target = document.getElementById(id);
              return target === null ? '' : (target.textContent ?? '');
            })
            .join(' ');
    const ownLabel =
      active.labels !== undefined && active.labels !== null && active.labels.length > 0
        ? active.labels[0].textContent
        : undefined;
    const text = active.tagName === 'INPUT' ? '' : (active.textContent ?? '');
    const name = (active.getAttribute('aria-label') ?? labelled ?? ownLabel ?? text)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    return {
      tag: active.tagName.toLowerCase(),
      type: active.getAttribute('type') ?? '',
      role: active.getAttribute('role') ?? '',
      id: active.id,
      name,
      // Focus that lands on a zero-area element is focus lost.
      visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden',
      inViewport: rect.top < window.innerHeight && rect.bottom > 0,
      // The one thing a keyboard user needs to see, read from the focused
      // element's own computed style — what the browser actually painted.
      outline: style.outlineStyle + '/' + style.outlineWidth,
      boxShadow: style.boxShadow === 'none' ? 'none' : 'set',
    };
  });
}

/**
 * Walks `Tab` a bounded number of times and records where focus went.
 *
 * Bounded rather than "until it wraps": a genuine keyboard trap never wraps,
 * and a loop waiting for one would hang instead of failing. The caller compares
 * the sequence against the reading order it expects.
 */
export async function walkTabOrder(page, steps) {
  const seen = [];
  for (let index = 0; index < steps; index += 1) {
    await page.keyboard.press('Tab');
    seen.push(await describeActive(page));
  }
  return seen;
}

/**
 * Whether focus is *drawn* — measured as a difference, not as an attribute.
 *
 * ## Why reading the focused element's own outline is not enough
 *
 * SC 2.4.7 Focus Visible asks for a visible indicator, and says nothing about
 * which element carries it. This repository has at least one control where it is
 * carried by a **sibling**: the purchase option is a natively-focusable radio at
 * `opacity: 0` with the ring drawn by `&__option-input:focus-visible +
 * &__option-pill`. Reading `outlineStyle` on the radio reports `none`, so an
 * audit that trusted it would report a missing indicator on a control that
 * visibly has one — a false finding, and the most expensive kind, because it
 * sends someone to "fix" correct code.
 *
 * So this measures what a person would: it snapshots every element that could
 * plausibly be drawing the ring — the control, its two siblings, its label and
 * its parent — blurs, snapshots again, and restores focus. If nothing about any
 * of them changed, nothing changed on screen either, and the indicator really is
 * absent.
 *
 * Focus is restored programmatically afterwards, so the caller's tab walk
 * continues from where it was.
 */
export async function measureFocusIndicator(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (active === null || active === document.body || !(active instanceof HTMLElement)) {
      return { focused: false, drawn: false, hosts: 0 };
    }
    const hosts = [
      active,
      active.nextElementSibling,
      active.previousElementSibling,
      active.closest('label'),
      active.parentElement,
    ].filter((element, index, all) => element !== null && all.indexOf(element) === index);

    const snapshot = () =>
      hosts.map((element) => {
        const style = window.getComputedStyle(element);
        return [
          style.outlineStyle,
          style.outlineWidth,
          style.outlineColor,
          style.outlineOffset,
          style.boxShadow,
          style.borderColor,
          style.borderWidth,
          style.backgroundColor,
          style.color,
          style.textDecorationLine,
        ].join('|');
      });

    const withFocus = snapshot();
    active.blur();
    const withoutFocus = snapshot();
    active.focus();

    return {
      focused: true,
      drawn: withFocus.some((value, index) => value !== withoutFocus[index]),
      hosts: hosts.length,
    };
  });
}
