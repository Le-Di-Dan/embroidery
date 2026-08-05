/**
 * The Template SVG acceptance corpus and determinism proof (`IMP-D047` §6.17.3).
 *
 * Acceptance is asserted on **bytes**, not on a snapshot: a snapshot records
 * whatever the code did on the day it was written, so it would have accepted a
 * serializer change as the new truth. Every case here states the exact output,
 * so a change to attribute order, number formatting or the empty-element form
 * fails loudly and has to be re-ruled.
 */
import { createHash } from 'node:crypto';

import { TEMPLATE_SVG_LIMITS } from '../domain/svg/template-svg-policy';
import { sanitizeTemplateSvg } from './template-svg-sanitizer';

const NS = 'http://www.w3.org/2000/svg';

const svg = (body: string, attributes = `xmlns="${NS}" viewBox="0 0 100 100"`): Buffer =>
  Buffer.from(`<svg ${attributes}>${body}</svg>`, 'utf8');

const output = (source: Buffer): string => {
  const result = sanitizeTemplateSvg(source);
  expect(result).toBeDefined();
  return (result as { bytes: Buffer }).bytes.toString('utf8');
};

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

describe('allowed primitives', () => {
  it.each([
    ['path', '<path d="M0 0L10 10Z"/>', '<path d="M0 0L10 10Z"/>'],
    [
      'rect',
      '<rect x="1" y="2" width="3" height="4" rx="1" ry="1"/>',
      '<rect height="4" rx="1" ry="1" width="3" x="1" y="2"/>',
    ],
    ['circle', '<circle cx="1" cy="2" r="3"/>', '<circle cx="1" cy="2" r="3"/>'],
    ['ellipse', '<ellipse cx="1" cy="2" rx="3" ry="4"/>', '<ellipse cx="1" cy="2" rx="3" ry="4"/>'],
    ['line', '<line x1="0" y1="0" x2="1" y2="1"/>', '<line x1="0" x2="1" y1="0" y2="1"/>'],
    ['polyline', '<polyline points="0,0 1,1"/>', '<polyline points="0 0 1 1"/>'],
    ['polygon', '<polygon points="0,0 1,1 2,0"/>', '<polygon points="0 0 1 1 2 0"/>'],
  ])('accepts %s and serializes it canonically', (_label, body, expected) => {
    expect(output(svg(body))).toBe(`<svg xmlns="${NS}" viewBox="0 0 100 100">${expected}</svg>`);
  });

  it('gives svg and g explicit closing tags and shapes the empty-element form', () => {
    expect(output(svg('<g><path d="M0 0Z"/></g>'))).toBe(
      `<svg xmlns="${NS}" viewBox="0 0 100 100"><g><path d="M0 0Z"/></g></svg>`,
    );
    expect(output(svg('<g></g>'))).toBe(`<svg xmlns="${NS}" viewBox="0 0 100 100"><g></g></svg>`);
    expect(output(svg(''))).toBe(`<svg xmlns="${NS}" viewBox="0 0 100 100"></svg>`);
  });

  it('accepts nested groups', () => {
    expect(output(svg('<g><g><g><path d="M0 0Z"/></g></g></g>'))).toContain(
      '<g><g><g><path d="M0 0Z"/></g></g></g>',
    );
  });
});

describe('presentation attributes', () => {
  it('accepts every allowed presentation attribute at once', () => {
    const body =
      '<path d="M0 0Z" transform="translate(1 2)" fill="#F00" fill-opacity="0.5" ' +
      'fill-rule="evenodd" stroke="#00FF00" stroke-width="2" stroke-opacity="1" ' +
      'stroke-linecap="round" stroke-linejoin="bevel" stroke-miterlimit="4" ' +
      'stroke-dasharray="4,2" stroke-dashoffset="1" opacity="0.25"/>';
    expect(output(svg(body))).toBe(
      `<svg xmlns="${NS}" viewBox="0 0 100 100"><path d="M0 0Z" fill="#ff0000" ` +
        'fill-opacity="0.5" fill-rule="evenodd" opacity="0.25" stroke="#00ff00" ' +
        'stroke-dasharray="4 2" stroke-dashoffset="1" stroke-linecap="round" ' +
        'stroke-linejoin="bevel" stroke-miterlimit="4" stroke-opacity="1" ' +
        'stroke-width="2" transform="translate(1 2)"/></svg>',
    );
  });

  it('sorts attributes lexicographically regardless of source order', () => {
    const forward = output(svg('<path d="M0 0Z" fill="#000" opacity="1" stroke="#fff"/>'));
    const reverse = output(svg('<path stroke="#fff" opacity="1" fill="#000" d="M0 0Z"/>'));
    expect(forward).toBe(reverse);
  });

  it('emits the root xmlns first and viewBox second', () => {
    expect(output(svg('<path d="M0 0Z"/>', `viewBox="0 0 10 10" xmlns="${NS}"`))).toBe(
      `<svg xmlns="${NS}" viewBox="0 0 10 10"><path d="M0 0Z"/></svg>`,
    );
  });

  it('accepts presentation attributes on a group', () => {
    expect(output(svg('<g fill="#000" transform="scale(2)"><path d="M0 0Z"/></g>'))).toContain(
      '<g fill="#000000" transform="scale(2)">',
    );
  });
});

describe('transforms', () => {
  it.each([
    ['matrix(1,0,0,1,0,0)', 'matrix(1 0 0 1 0 0)'],
    ['translate(5)', 'translate(5)'],
    ['translate(1 2)', 'translate(1 2)'],
    ['scale(2)', 'scale(2)'],
    ['scale(2 3)', 'scale(2 3)'],
    ['rotate(45)', 'rotate(45)'],
    ['rotate(45 1 2)', 'rotate(45 1 2)'],
    ['skewX(10)', 'skewX(10)'],
    ['skewY(10)', 'skewY(10)'],
    ['translate(1 2) rotate(45) scale(2)', 'translate(1 2) rotate(45) scale(2)'],
  ])('accepts %s', (input, expected) => {
    expect(output(svg(`<g transform="${input}"><path d="M0 0Z"/></g>`))).toContain(
      `transform="${expected}"`,
    );
  });
});

describe('path command families', () => {
  it.each([
    ['M0 0Z', 'M0 0Z'],
    ['m0 0z', 'm0 0z'],
    ['M0 0L1 1', 'M0 0L1 1'],
    ['M0 0l1 1', 'M0 0l1 1'],
    ['M0 0H5', 'M0 0H5'],
    ['M0 0h5', 'M0 0h5'],
    ['M0 0V5', 'M0 0V5'],
    ['M0 0v5', 'M0 0v5'],
    ['M0 0C1 1 2 2 3 3', 'M0 0C1 1 2 2 3 3'],
    ['M0 0c1 1 2 2 3 3', 'M0 0c1 1 2 2 3 3'],
    ['M0 0S1 1 2 2', 'M0 0S1 1 2 2'],
    ['M0 0s1 1 2 2', 'M0 0s1 1 2 2'],
    ['M0 0Q1 1 2 2', 'M0 0Q1 1 2 2'],
    ['M0 0q1 1 2 2', 'M0 0q1 1 2 2'],
    ['M0 0T1 1', 'M0 0T1 1'],
    ['M0 0t1 1', 'M0 0t1 1'],
    ['M0 0A1 1 0 0 1 2 2', 'M0 0A1 1 0 0 1 2 2'],
    ['M0 0a1 1 0 011 1', 'M0 0a1 1 0 0 1 1 1'],
  ])('accepts %s', (input, expected) => {
    expect(output(svg(`<path d="${input}"/>`))).toContain(`d="${expected}"`);
  });
});

describe('exact boundaries', () => {
  it('accepts the largest allowed viewBox', () => {
    expect(output(svg('<path d="M0 0Z"/>', `xmlns="${NS}" viewBox="0 0 4096 4096"`))).toContain(
      'viewBox="0 0 4096 4096"',
    );
  });

  it('reports width and height from the viewBox and from nothing else', () => {
    const result = sanitizeTemplateSvg(
      svg('<path d="M0 0Z"/>', `xmlns="${NS}" viewBox="-5 -7 320 240"`),
    );
    expect(result?.widthPx).toBe(320);
    expect(result?.heightPx).toBe(240);
  });

  it('accepts exactly the element ceiling', () => {
    const result = sanitizeTemplateSvg(svg('<path d="M0 0Z"/>'.repeat(9_999)));
    expect(result).toBeDefined();
  });

  it('accepts a file at exactly the byte ceiling', () => {
    const head = `<svg xmlns="${NS}" viewBox="0 0 10 10">`;
    const tail = '</svg>';
    const shape = '<path d="M0 0Z"/>';
    const filler = ' '.repeat(
      TEMPLATE_SVG_LIMITS.maxSourceBytes - head.length - tail.length - shape.length,
    );
    const source = Buffer.from(`${head}${shape}${filler}${tail}`, 'utf8');
    expect(source.length).toBe(TEMPLATE_SVG_LIMITS.maxSourceBytes);
    expect(sanitizeTemplateSvg(source)).toBeDefined();
  });
});

describe('canonical output form', () => {
  const source = svg('<g transform="translate(1,2)"><path d="M0 0 1 1" fill="#F00"/></g>');

  it('is UTF-8 with no BOM, no XML declaration and no trailing newline', () => {
    const bytes = sanitizeTemplateSvg(source)?.bytes as Buffer;
    expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
    expect(bytes.toString('utf8').startsWith('<svg ')).toBe(true);
    expect(bytes.toString('utf8')).not.toContain('<?xml');
    expect(bytes.toString('utf8')).not.toMatch(/\n$/);
  });

  it('contains no newline at all, so the line-ending rule holds by construction', () => {
    expect(sanitizeTemplateSvg(source)?.bytes.includes(0x0a)).toBe(false);
    expect(sanitizeTemplateSvg(source)?.bytes.includes(0x0d)).toBe(false);
  });

  it('re-canonicalizes its own output to the identical bytes', () => {
    const first = sanitizeTemplateSvg(source)?.bytes as Buffer;
    const second = sanitizeTemplateSvg(first)?.bytes as Buffer;
    expect(second.equals(first)).toBe(true);
    expect(sha256(second)).toBe(sha256(first));
  });
});

describe('determinism', () => {
  const cases = [
    svg('<path d="M0 0L1 1Z" fill="#F00"/>'),
    svg('<g transform="translate(1,2)"><rect x="0" y="0" width="5" height="5"/></g>'),
    svg('<polygon points="0,0 10,0 10,10"/>', `xmlns="${NS}" viewBox="0 0 4096 4096"`),
  ];

  it('produces identical bytes and digests across repetitions in one process', () => {
    for (const source of cases) {
      const runs = Array.from({ length: 25 }, () => sanitizeTemplateSvg(source)?.bytes as Buffer);
      const digests = new Set(runs.map(sha256));
      expect(digests.size).toBe(1);
      for (const run of runs) expect(run.equals(runs[0] as Buffer)).toBe(true);
    }
  });

  it('converges on the same output from textually different equivalent sources', () => {
    // Only the spellings the grammar canonicalizes converge. Two *structurally*
    // different documents are not promised to, and PO-13 says so explicitly.
    const a = svg('<path d="M0 0L1 1" fill="#F00" opacity="1.0"/>');
    const b = svg('<path opacity="1" fill="rgb(255 0 0)" d="M 0,0 L 1,1"/>');
    expect(output(a)).toBe(output(b));
  });

  it('does not converge two different documents', () => {
    expect(output(svg('<path d="M0 0Z"/>'))).not.toBe(output(svg('<path d="M0 1Z"/>')));
  });
});
