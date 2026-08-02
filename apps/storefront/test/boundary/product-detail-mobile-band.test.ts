/**
 * @jest-environment node
 *
 * The Product Detail mobile content band (`APP2-S02-C1`).
 *
 * `APP2-S02` shipped the page inheriting the APP1 shell's 16px mobile gutter,
 * so the content measured 358px where the approved frame locks 24px / 342px.
 * The fix is a feature-local 8px inset rather than a wider global shell, and
 * these checks hold that shape: the inset exists, it is scoped below the
 * shell's own threshold, it is expressed in shared spacing tokens, and the
 * global shell is not touched.
 *
 * The *rendered* geometry is measured in a real browser by the production
 * smoke; jsdom computes no layout, so asserting pixels here would prove
 * nothing. What can be proved here is that the rule exists and is scoped.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..', 'src');
const DETAIL_SCSS = join(SRC, 'features', 'product-detail', 'styles', 'product-detail.scss');
const SHELL_SCSS = join(SRC, 'features', 'storefront-shell', 'styles', 'storefront-shell.scss');

const detail = readFileSync(DETAIL_SCSS, 'utf8');
const shell = readFileSync(SHELL_SCSS, 'utf8');

/** The `@media (max-width: …)` block that carries the mobile band. */
function mobileBlock(text: string): string {
  const start = text.indexOf('@media (max-width: #{$bp-shell-wide - 1px})');
  if (start < 0) return '';
  return text.slice(start, text.indexOf('\n}', text.indexOf('\n  }', start)) + 2);
}

describe('mobile content band', () => {
  it('declares the approved 24px gutter from a shared spacing token', () => {
    expect(detail).toMatch(/\$detail-mobile-gutter:\s*styles\.spacing\(24\);/);
  });

  it('insets Product Detail by the difference from the shell gutter', () => {
    const block = mobileBlock(detail);
    expect(block).toContain('.product-detail');
    // 24 (approved) − 16 (shell) = the 8px inset, expressed as the arithmetic
    // rather than a magic number, so the intent survives a shell change.
    expect(block).toMatch(/padding-inline:\s*\$detail-mobile-gutter - styles\.spacing\(16\);/);
  });

  it('scopes the inset below the shell threshold, leaving tablet and desktop alone', () => {
    expect(detail).toContain('@media (max-width: #{$bp-shell-wide - 1px})');
    expect(detail).toMatch(/\$bp-shell-wide:\s*768px;/);
  });

  it('mirrors the shell threshold it depends on, so the two cannot drift apart', () => {
    // The shell owns this constant; Product Detail copies the value and this
    // check fails the moment the original moves.
    expect(shell).toMatch(/\$bp-footer:\s*768px;/);
  });

  it('gives the thumbnail scroll viewport the whole band on mobile', () => {
    expect(mobileBlock(detail)).toMatch(/\.product-detail__thumbnails\s*\{\s*width:\s*100%;/);
  });

  it('leaves the global shell gutter exactly as APP1 set it', () => {
    // 16px on mobile, 24px from the footer breakpoint up. `APP2-S02-C1` moved
    // neither: widening the shell would have moved the Homepage and Discover to
    // satisfy one screen's authority.
    expect(shell).toMatch(/padding:\s*styles\.spacing\(24\) styles\.spacing\(16\);/);
    expect(shell).toMatch(/padding:\s*styles\.spacing\(32\) styles\.spacing\(24\);/);
  });

  it('keeps the desktop and tablet story at the 640px measure', () => {
    expect(detail).toMatch(/\$story-measure-max:\s*640px;/);
    expect(detail).toMatch(/max-width:\s*\$story-measure-max;/);
  });

  it('does not constrain the lightbox to the page band', () => {
    // The scrim is viewport-owned: fixed positioning takes it out of the flow,
    // so the page inset cannot narrow the large view.
    const scrim = detail.slice(detail.indexOf('.product-detail__scrim'));
    expect(scrim.slice(0, scrim.indexOf('}'))).toContain('position: fixed');
  });
});
