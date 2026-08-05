/**
 * The input form gate (`IMP-D047` PO-04, PO-11).
 *
 * Tested on bytes, because that is where it runs. Every case here is refused
 * *before* a parser exists, which is the only order in which refusing a DOCTYPE
 * or an entity declaration means anything.
 */
import { TEMPLATE_SVG_LIMITS } from './template-svg-policy';
import { readTemplateSvgSource } from './svg-source-form';

const utf8 = (text: string): Buffer => Buffer.from(text, 'utf8');

const MINIMAL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>';

/** Written as an escape: a literal BOM in source is invisible to a reviewer. */
const BOM_CHARACTER = '\uFEFF';

describe('byte gate', () => {
  it('accepts the boundary and refuses the boundary plus one', () => {
    const padding = ' '.repeat(TEMPLATE_SVG_LIMITS.maxSourceBytes - MINIMAL.length);
    expect(readTemplateSvgSource(utf8(MINIMAL + padding)).ok).toBe(true);
    expect(readTemplateSvgSource(utf8(`${MINIMAL + padding} `)).ok).toBe(false);
  });

  it('refuses an empty file', () => {
    expect(readTemplateSvgSource(Buffer.alloc(0)).ok).toBe(false);
  });
});

describe('encoding', () => {
  it('refuses bytes that are not UTF-8 rather than replacing them', () => {
    // A lone continuation byte. The permissive decoder would turn it into
    // U+FFFD and hand on content nobody wrote.
    expect(readTemplateSvgSource(Buffer.from([0x3c, 0x73, 0x76, 0x67, 0x80])).ok).toBe(false);
  });

  it('refuses a UTF-8 BOM, leading or embedded', () => {
    expect(
      readTemplateSvgSource(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8(MINIMAL)])).ok,
    ).toBe(false);
    expect(readTemplateSvgSource(utf8(`<svg${BOM_CHARACTER} xmlns="x"/>`)).ok).toBe(false);
  });

  it('accepts ordinary UTF-8 text', () => {
    const result = readTemplateSvgSource(utf8(MINIMAL));
    expect(result.ok).toBe(true);
    expect(result.ok && result.text).toBe(MINIMAL);
  });
});

describe('forbidden XML form', () => {
  it.each([
    ['DOCTYPE', `<!DOCTYPE svg>${MINIMAL}`],
    ['lowercase doctype', `<!doctype svg>${MINIMAL}`],
    ['mixed-case doctype', `<!DoCtYpE svg>${MINIMAL}`],
    ['internal entity', `<!DOCTYPE svg [<!ENTITY x "y">]>${MINIMAL}`],
    ['external entity', `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>${MINIMAL}`],
    ['parameter entity', `<!DOCTYPE svg [<!ENTITY % x SYSTEM "http://h/e">%x;]>${MINIMAL}`],
    ['XML declaration', `<?xml version="1.0"?>${MINIMAL}`],
    ['stylesheet PI', `<?xml-stylesheet href="a.css"?>${MINIMAL}`],
    ['CDATA', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><![CDATA[x]]></svg>'],
    ['comment', `<!-- hello -->${MINIMAL}`],
  ])('refuses %s', (_label, text) => {
    expect(readTemplateSvgSource(utf8(text)).ok).toBe(false);
  });
});
