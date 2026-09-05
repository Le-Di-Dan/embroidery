/**
 * The `APP12-V01` professional UI/UX measurement probe.
 *
 * ## What this exists for, and why it is not the H08 measure module
 *
 * `h08-measure.mjs` answers conformance questions — does this pair clear 4.5:1,
 * does the document scroll sideways, is this target 24px. Those have thresholds,
 * so a machine can return a verdict.
 *
 * `APP12-V01` asks a different kind of question, and the Product Owner's
 * correction of the checkpoint says so explicitly: a screen can pass every rule
 * in H08 and still read as verbose, flat, cramped or amateur. **No threshold
 * decides that.** What a machine can do is remove the guesswork from the
 * judgement — how many characters a customer is actually asked to read before
 * the price, how many distinct visual text layers a screen really has once the
 * cascade has run, whether the primary action is painted differently from the
 * three controls beside it, how deep the card nesting goes.
 *
 * So this module returns **quantities, never verdicts**. Every classification in
 * the audit is made by a human reading these numbers next to the screenshot the
 * same navigation produced. That division is what keeps the critique honest: the
 * numbers cannot be argued with, and the taste is attributable.
 *
 * ## Nothing secret crosses this boundary
 *
 * The probe reads *rendered* text, and V01 opens a live `ORDER_ACCESS` surface,
 * so this is not a theoretical concern. Three rules hold throughout:
 *
 * - no element `value` is ever read, so a typed contact, code or address cannot
 *   escape through a form control;
 * - free text is reduced to a **character count** and never returned, and the
 *   only samples kept are heading text and action labels — approved product
 *   copy, and the two things a critique about hierarchy cannot be written
 *   without;
 * - selectors are composed from tag and class only, never from an id that a
 *   route might have derived from an order.
 *
 * Test-only. Never imported by application code.
 */

/** The maximum number of text blocks returned per screen. */
const TEXT_BLOCK_CAP = 220;
/** The maximum number of actions returned per screen. */
const ACTION_CAP = 120;

/**
 * Measures one rendered screen.
 *
 * Everything is read after layout, from the composited result — a token's
 * declared value says what a designer meant, and this checkpoint is about what
 * a customer sees.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<object>} quantities only
 */
export async function measureUx(page) {
  return page.evaluate(
    ([textCap, actionCap]) => {
      const visible = (element) => {
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (Number(style.opacity) === 0) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const selectorOf = (element) => {
        const cls =
          typeof element.className === 'string' && element.className.trim() !== ''
            ? '.' + element.className.trim().split(/\s+/).slice(0, 2).join('.')
            : '';
        return element.tagName.toLowerCase() + cls;
      };

      /** Text contributed by this element's OWN child text nodes, not descendants. */
      const ownText = (element) => {
        let text = '';
        for (const node of element.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? '';
        }
        return text.replace(/\s+/g, ' ').trim();
      };

      const px = (value) => Math.round(Number.parseFloat(value) || 0);

      const main = document.querySelector('main') ?? document.body;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      /* ---------------------------------------------------------------- text */
      const blocks = [];
      let mainChars = 0;
      let paragraphChars = 0;
      let paragraphs = 0;
      for (const element of main.querySelectorAll('*')) {
        if (!visible(element)) continue;
        const text = ownText(element);
        if (text === '') continue;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const words = text.split(' ').filter(Boolean).length;
        mainChars += text.length;
        const tag = element.tagName.toLowerCase();
        if (tag === 'p' || tag === 'li' || (tag === 'div' && words > 8)) {
          paragraphs += 1;
          paragraphChars += text.length;
        }
        if (blocks.length < textCap) {
          blocks.push({
            selector: selectorOf(element),
            tag,
            chars: text.length,
            words,
            fontSizePx: px(style.fontSize),
            fontWeight: Number(style.fontWeight) || style.fontWeight,
            color: style.color,
            lineHeightPx: px(style.lineHeight),
            letterSpacing: style.letterSpacing,
            textTransform: style.textTransform,
            widthPx: Math.round(rect.width),
            top: Math.round(rect.top + window.scrollY),
            aboveFold: rect.top + window.scrollY < viewportHeight,
          });
        }
      }

      /* --------------------------------------------------------- typography */
      // A "layer" is one (size, weight, colour) triple as painted. The count of
      // distinct layers is the screen's real typographic vocabulary; how many of
      // them are *separable* is the hierarchy question the PO raised, and that
      // is decided by a human from this list.
      const layerMap = new Map();
      for (const block of blocks) {
        const key = `${String(block.fontSizePx)}/${String(block.fontWeight)}/${block.color}`;
        const existing = layerMap.get(key);
        if (existing === undefined) {
          layerMap.set(key, {
            fontSizePx: block.fontSizePx,
            fontWeight: block.fontWeight,
            color: block.color,
            count: 1,
            chars: block.chars,
          });
        } else {
          existing.count += 1;
          existing.chars += block.chars;
        }
      }
      const layers = [...layerMap.values()].sort((a, b) => b.chars - a.chars);

      /* ----------------------------------------------------------- headings */
      const headings = [];
      for (const element of document.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
        if (!visible(element)) continue;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
        headings.push({
          level: Number(element.tagName.slice(1)),
          sample: text.slice(0, 48),
          chars: text.length,
          fontSizePx: px(style.fontSize),
          fontWeight: Number(style.fontWeight) || style.fontWeight,
          color: style.color,
          top: Math.round(rect.top + window.scrollY),
        });
      }

      /* ------------------------------------------------------------ actions */
      // Every control a user could read as "the thing to press". Buttons, links
      // that are painted as buttons, and submit inputs — with the paint recorded
      // rather than judged, because "is the primary action obvious" is exactly
      // the question a threshold cannot answer.
      const actions = [];
      const ACTION_SELECTOR = 'button, [role="button"], input[type="submit"], a[href]';
      for (const element of document.querySelectorAll(ACTION_SELECTOR)) {
        if (!visible(element)) continue;
        if (actions.length >= actionCap) break;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const label = (element.getAttribute('aria-label') ?? element.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim();
        const tag = element.tagName.toLowerCase();
        const painted =
          style.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
          px(style.borderTopWidth) > 0 ||
          px(style.paddingLeft) >= 8;
        actions.push({
          tag,
          kind: tag === 'a' ? (painted ? 'link-button' : 'link') : 'button',
          label: label.slice(0, 40),
          chars: label.length,
          widthPx: Math.round(rect.width),
          heightPx: Math.round(rect.height),
          background: style.backgroundColor,
          color: style.color,
          borderColor: style.borderTopColor,
          borderWidthPx: px(style.borderTopWidth),
          radiusPx: px(style.borderTopLeftRadius),
          fontSizePx: px(style.fontSize),
          fontWeight: Number(style.fontWeight) || style.fontWeight,
          disabled: element.hasAttribute('disabled'),
          top: Math.round(rect.top + window.scrollY),
          aboveFold: rect.top + window.scrollY < viewportHeight,
          inMain: main.contains(element),
        });
      }

      /* ----------------------------------------------------------- controls */
      const controls = [];
      for (const element of main.querySelectorAll('input, select, textarea')) {
        if (!visible(element)) continue;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        controls.push({
          tag: element.tagName.toLowerCase(),
          type: element.getAttribute('type') ?? '',
          widthPx: Math.round(rect.width),
          heightPx: Math.round(rect.height),
          fontSizePx: px(style.fontSize),
          paddingXPx: px(style.paddingLeft),
          paddingYPx: px(style.paddingTop),
          borderWidthPx: px(style.borderTopWidth),
        });
      }

      /* ----------------------------------------------------------- surfaces */
      // A "surface" is a box that paints itself apart from its parent — a card,
      // a panel, a bordered group. Their count and their nesting depth is the
      // measurable half of "card inside card inside card".
      const surfaces = [];
      let maxDepth = 0;
      const isSurface = (element) => {
        const style = window.getComputedStyle(element);
        const hasBackground =
          style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
        const hasBorder = px(style.borderTopWidth) > 0 || px(style.borderLeftWidth) > 0;
        const hasShadow = style.boxShadow !== 'none';
        return hasBackground || hasBorder || hasShadow;
      };
      const walk = (element, depth) => {
        for (const child of element.children) {
          if (!visible(child)) continue;
          const rect = child.getBoundingClientRect();
          let next = depth;
          if (isSurface(child) && rect.width > 80 && rect.height > 40) {
            next = depth + 1;
            maxDepth = Math.max(maxDepth, next);
            const style = window.getComputedStyle(child);
            surfaces.push({
              selector: selectorOf(child),
              depth: next,
              widthPx: Math.round(rect.width),
              heightPx: Math.round(rect.height),
              paddingTopPx: px(style.paddingTop),
              paddingLeftPx: px(style.paddingLeft),
              background: style.backgroundColor,
              borderWidthPx: px(style.borderTopWidth),
              radiusPx: px(style.borderTopLeftRadius),
            });
          }
          walk(child, next);
        }
      };
      walk(main, 0);

      /* ------------------------------------------------------------ spacing */
      // The vertical gap between consecutive top-level sections of `main`: the
      // rhythm a reader experiences as "these belong together" or "this is new".
      const gaps = [];
      const sections = [...main.children].filter((child) => visible(child));
      for (let index = 1; index < sections.length; index += 1) {
        const previous = sections[index - 1].getBoundingClientRect();
        const current = sections[index].getBoundingClientRect();
        gaps.push(Math.round(current.top - previous.bottom));
      }

      const doc = document.documentElement;
      const aboveFoldBlocks = blocks.filter((block) => block.aboveFold);

      return {
        document: {
          viewportWidth,
          viewportHeight,
          scrollHeight: doc.scrollHeight,
          screensTall: Math.round((doc.scrollHeight / viewportHeight) * 10) / 10,
          horizontalOverflowPx: doc.scrollWidth - doc.clientWidth,
        },
        text: {
          mainChars,
          paragraphs,
          paragraphChars,
          meanParagraphChars: paragraphs === 0 ? 0 : Math.round(paragraphChars / paragraphs),
          blockCount: blocks.length,
          blocks,
        },
        typography: {
          layerCount: layers.length,
          distinctSizes: new Set(blocks.map((block) => block.fontSizePx)).size,
          distinctColors: new Set(blocks.map((block) => block.color)).size,
          layers: layers.slice(0, 24),
        },
        headings,
        actions,
        controls,
        surfaces: { count: surfaces.length, maxDepth, boxes: surfaces.slice(0, 60) },
        spacing: { sectionGaps: gaps },
        aboveFold: {
          chars: aboveFoldBlocks.reduce((total, block) => total + block.chars, 0),
          blocks: aboveFoldBlocks.length,
          headings: headings.filter((heading) => heading.top < viewportHeight).length,
          actions: actions.filter((action) => action.aboveFold && action.inMain).length,
        },
      };
    },
    [TEXT_BLOCK_CAP, ACTION_CAP],
  );
}
