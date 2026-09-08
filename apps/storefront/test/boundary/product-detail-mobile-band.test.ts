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
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..', 'src');
const DETAIL_STYLES_DIR = join(SRC, 'features', 'product-detail', 'styles');

/**
 * The feature's whole stylesheet, however many files it is written in.
 *
 * `APP12-H01` split `product-detail.scss` into an entry plus five responsibility
 * partials (FU-APP12-S01-03), so a check that read the one file would now be
 * asserting against a list of `@use` lines. Reading the directory keeps every
 * rule below exactly as strict as it was, and makes it indifferent to how the
 * feature chooses to divide its styles next.
 */
function readFeatureStyles(stylesDir: string): string {
  return readdirSync(stylesDir)
    .filter((file) => file.endsWith('.scss'))
    .sort()
    .map((file) => readFileSync(join(stylesDir, file), 'utf8'))
    .join('\n');
}
/**
 * The shell's whole stylesheet, for the same reason.
 *
 * `APP12-V02` §41 split it too: adding the reduced transactional footer would
 * have taken the single file past the 400-line hard limit, so the footer and the
 * local layout constants — including the threshold this feature mirrors — came
 * out into partials. Every value is unchanged; only the file holding it moved.
 */
const SHELL_STYLES_DIR = join(SRC, 'features', 'storefront-shell', 'styles');

const detail = readFeatureStyles(DETAIL_STYLES_DIR);
const shell = readFeatureStyles(SHELL_STYLES_DIR);

/** The `@media (max-width: …)` block that carries the mobile band. */
function mobileBlock(text: string): string {
  const start = text.search(/@media \(max-width: #\{(?:tokens\.)?\$bp-shell-wide - 1px\}\)/);
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
    expect(block).toMatch(
      /padding-inline:\s*(?:tokens\.)?\$detail-mobile-gutter - styles\.spacing\(16\);/,
    );
  });

  it('scopes the inset below the shell threshold, leaving tablet and desktop alone', () => {
    expect(detail).toMatch(/@media \(max-width: #\{(?:tokens\.)?\$bp-shell-wide - 1px\}\)/);
    expect(detail).toMatch(/\$bp-shell-wide:\s*768px;/);
  });

  it('mirrors the shell threshold it depends on, so the two cannot drift apart', () => {
    // The shell owns this constant; Product Detail copies the value and this
    // check fails the moment the original moves.
    expect(shell).toMatch(/\$bp-footer:\s*768px;/);
  });

  it('keeps the lightbox above every shell layer, and mirrors the one it clears', () => {
    // `APP12-M01.S1-C1`. The scrim is portalled into `document.body`, so it now
    // shares the root stacking context with the shell's own layers and the two
    // numbers are finally comparable — which is the only reason picking one is
    // meaningful at all. The shell owns `$z-drawer` and draws its header one
    // below it; this pair fails the moment either side moves.
    expect(shell).toMatch(/\$z-drawer:\s*100;/);
    const layer = /\$scrim-layer:\s*(\d+);/.exec(detail)?.[1];
    expect(layer).toBeDefined();
    expect(Number(layer)).toBeGreaterThan(100);
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
    expect(detail).toMatch(/max-width:\s*(?:tokens\.)?\$story-measure-max;/);
  });

  it('does not constrain the lightbox to the page band', () => {
    // The scrim is viewport-owned: fixed positioning takes it out of the flow,
    // so the page inset cannot narrow the large view.
    const scrim = detail.slice(detail.indexOf('.product-detail__scrim'));
    expect(scrim.slice(0, scrim.indexOf('}'))).toContain('position: fixed');
  });
});
