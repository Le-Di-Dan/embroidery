/**
 * The Template SVG rejection corpus (`IMP-D047` §6.17.3).
 *
 * Every case asserts the same thing: the **whole file** is refused. That is the
 * point of PO-05 — a sanitizer that quietly removed the offending part would
 * hand an Admin a Template that renders differently from the one they approved,
 * and nobody would be told. So there is no "cleaned" outcome to assert here, and
 * no case where output exists.
 *
 * The cases are grouped by the attack or malformation they represent rather than
 * by the rule that catches them, because which rule fires is an implementation
 * detail that must be free to change; that the file is refused is not.
 */
import { sanitizeTemplateSvg } from './template-svg-sanitizer';

const NS = 'http://www.w3.org/2000/svg';

/** Wraps `body` in a minimal valid root, so each case varies only in content. */
const svg = (body: string, attributes = `xmlns="${NS}" viewBox="0 0 100 100"`): Buffer =>
  Buffer.from(`<svg ${attributes}>${body}</svg>`, 'utf8');

const rejects = (source: Buffer): void => {
  expect(sanitizeTemplateSvg(source)).toBeUndefined();
};

describe('active content', () => {
  it.each([
    ['script element', '<script>alert(1)</script>'],
    ['script with CDATA-free body', '<script type="text/javascript">alert(1)</script>'],
    ['handler on a shape', '<path d="M0 0Z" onload="alert(1)"/>'],
    ['handler on a group', '<g onclick="alert(1)"><path d="M0 0Z"/></g>'],
    ['mouse handler', '<rect x="0" y="0" width="1" height="1" onmouseover="alert(1)"/>'],
    ['handler in mixed case', '<path d="M0 0Z" OnLoad="alert(1)"/>'],
    ['handlerlike attribute', '<path d="M0 0Z" onfocusin="alert(1)"/>'],
  ])('refuses %s', (_label, body) => {
    rejects(svg(body));
  });

  it('refuses a handler on the root, where the attribute set is only two names', () => {
    rejects(svg('<path d="M0 0Z"/>', `xmlns="${NS}" viewBox="0 0 1 1" onload="alert(1)"`));
  });
});

describe('foreign content and namespaces', () => {
  it.each([
    [
      'foreignObject with HTML',
      '<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(1)"/></body></foreignObject>',
    ],
    ['inline XHTML child', '<h1 xmlns="http://www.w3.org/1999/xhtml">x</h1>'],
    ['MathML child', '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>'],
    ['unknown namespace child', '<thing xmlns="http://example.com/evil"/>'],
    ['namespaced allowed name', '<x:path xmlns:x="http://example.com" d="M0 0Z"/>'],
  ])('refuses %s', (_label, body) => {
    rejects(svg(body));
  });

  it('refuses a root outside the SVG namespace even when it is called svg', () => {
    rejects(Buffer.from('<svg xmlns="http://example.com" viewBox="0 0 1 1"/>', 'utf8'));
  });

  it('refuses a root with no namespace at all', () => {
    rejects(Buffer.from('<svg viewBox="0 0 1 1"/>', 'utf8'));
  });

  it('refuses an xmlns whose value is not the SVG namespace', () => {
    rejects(Buffer.from(`<svg xmlns="${NS}x" viewBox="0 0 1 1"/>`, 'utf8'));
  });
});

describe('external resources and references', () => {
  it.each([
    ['image element', '<image href="http://example.com/x.png" width="1" height="1"/>'],
    ['image with xlink', '<image xlink:href="x.png" width="1" height="1"/>'],
    ['anchor', '<a href="http://example.com"><path d="M0 0Z"/></a>'],
    ['use', '<use href="#a"/>'],
    ['use with xlink', '<use xlink:href="#a"/>'],
    ['defs and symbol', '<defs><symbol id="a"><path d="M0 0Z"/></symbol></defs>'],
    ['linear gradient', '<linearGradient id="g"><stop offset="0"/></linearGradient>'],
    ['pattern', '<pattern id="p"><path d="M0 0Z"/></pattern>'],
    ['marker', '<marker id="m"><path d="M0 0Z"/></marker>'],
    ['mask', '<mask id="m"><path d="M0 0Z"/></mask>'],
    ['clip path', '<clipPath id="c"><path d="M0 0Z"/></clipPath>'],
    ['filter', '<filter id="f"><feGaussianBlur stdDeviation="2"/></filter>'],
    ['metadata', '<metadata>x</metadata>'],
    ['title', '<title>x</title>'],
    ['desc', '<desc>x</desc>'],
    ['switch', '<switch><path d="M0 0Z"/></switch>'],
  ])('refuses %s', (_label, body) => {
    rejects(svg(body));
  });

  it.each([
    ['fill by fragment', 'url(#g)'],
    ['fill by absolute URL', 'url(http://example.com/g.svg#g)'],
    ['fill by data URL', 'url(data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['blob scheme', 'blob:http://example.com/x'],
    ['file scheme', 'file:///etc/passwd'],
    ['protocol relative', '//example.com/x'],
    ['relative path', './x.svg#g'],
    ['bare fragment', '#g'],
    ['css variable', 'var(--brand)'],
  ])('refuses a paint that is %s', (_label, value) => {
    rejects(svg(`<path d="M0 0Z" fill="${value}"/>`));
  });
});

describe('CSS, text and fonts', () => {
  it.each([
    ['style element', '<style>path{fill:red}</style>'],
    ['style attribute', '<path d="M0 0Z" style="fill:red"/>'],
    ['class attribute', '<path d="M0 0Z" class="brand"/>'],
    ['text element', '<text x="0" y="0">hello</text>'],
    ['tspan', '<text x="0" y="0"><tspan>hello</tspan></text>'],
    ['textPath', '<textPath href="#p">hello</textPath>'],
    ['font element', '<font-face font-family="x"/>'],
    ['font-family attribute', '<path d="M0 0Z" font-family="Inter"/>'],
    ['currentColor paint', '<path d="M0 0Z" fill="currentColor"/>'],
    ['context-fill paint', '<path d="M0 0Z" fill="context-fill"/>'],
    ['vector-effect', '<path d="M0 0Z" vector-effect="non-scaling-stroke"/>'],
  ])('refuses %s', (_label, body) => {
    rejects(svg(body));
  });

  it('refuses free text content between elements', () => {
    rejects(svg('hello<path d="M0 0Z"/>'));
  });
});

describe('animation', () => {
  it.each([
    ['animate', '<path d="M0 0Z"><animate attributeName="fill" to="red"/></path>'],
    [
      'animate on href',
      '<path d="M0 0Z"><animate attributeName="href" values="javascript:alert(1)"/></path>',
    ],
    ['set on a handler', '<path d="M0 0Z"><set attributeName="onload" to="alert(1)"/></path>'],
    ['animateTransform', '<g><animateTransform attributeName="transform" type="rotate"/></g>'],
    ['animateMotion', '<path d="M0 0Z"><animateMotion path="M0 0L1 1"/></path>'],
    ['discard', '<discard begin="1s"/>'],
  ])('refuses %s', (_label, body) => {
    rejects(svg(body));
  });
});

describe('DOM clobbering', () => {
  it.each(['id', 'name'])('refuses the %s attribute outright', (attribute) => {
    rejects(svg(`<path d="M0 0Z" ${attribute}="attributes"/>`));
  });

  it.each(['attributes', 'ownerDocument', 'children', 'nodeName', 'localName', 'documentElement'])(
    'refuses an id that would clobber %s',
    (value) => {
      rejects(svg(`<g id="${value}"><path d="M0 0Z"/></g>`));
    },
  );
});

describe('malformed and hostile XML', () => {
  it.each([
    ['unclosed tag', `<svg xmlns="${NS}" viewBox="0 0 1 1"><g></svg>`],
    ['mismatched tag', `<svg xmlns="${NS}" viewBox="0 0 1 1"><g></path></svg>`],
    ['two roots', `<svg xmlns="${NS}" viewBox="0 0 1 1"/><svg xmlns="${NS}" viewBox="0 0 1 1"/>`],
    ['no root', '   '],
    ['unquoted attribute', `<svg xmlns=${NS} viewBox="0 0 1 1"/>`],
    ['stray less-than', `<svg xmlns="${NS}" viewBox="0 0 1 1"><path d="M0 0Z" <</svg>`],
    ['undefined entity', `<svg xmlns="${NS}" viewBox="0 0 1 1">&missing;</svg>`],
    [
      'billion laughs',
      `<!DOCTYPE s [<!ENTITY a "aa"><!ENTITY b "&a;&a;">]><svg xmlns="${NS}">&b;</svg>`,
    ],
    [
      'XXE file read',
      `<!DOCTYPE s [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="${NS}">&x;</svg>`,
    ],
    ['not XML at all', 'hello world'],
    ['HTML document', '<html><body><svg></svg></body></html>'],
  ])('refuses %s', (_label, text) => {
    rejects(Buffer.from(text, 'utf8'));
  });

  it('refuses an mXSS payload that depends on HTML parser recovery', () => {
    // Inert as XML, active once an HTML parser re-shapes it. Refused before
    // either parser could disagree, because the form gate and the strict XML
    // parse both run first.
    rejects(
      Buffer.from(
        `<svg xmlns="${NS}" viewBox="0 0 1 1"><style><a id="</style><img src=1 onerror=alert(1)>"></style></svg>`,
        'utf8',
      ),
    );
  });
});

describe('viewBox', () => {
  it.each([
    ['missing', `xmlns="${NS}"`],
    ['empty', `xmlns="${NS}" viewBox=""`],
    ['three values', `xmlns="${NS}" viewBox="0 0 10"`],
    ['five values', `xmlns="${NS}" viewBox="0 0 10 10 10"`],
    ['fractional width', `xmlns="${NS}" viewBox="0 0 10.5 10"`],
    ['zero width', `xmlns="${NS}" viewBox="0 0 0 10"`],
    ['negative height', `xmlns="${NS}" viewBox="0 0 10 -10"`],
    ['over the width ceiling', `xmlns="${NS}" viewBox="0 0 4097 10"`],
    ['over the height ceiling', `xmlns="${NS}" viewBox="0 0 10 4097"`],
    ['percentage', `xmlns="${NS}" viewBox="0 0 100% 10"`],
    ['NaN', `xmlns="${NS}" viewBox="0 0 NaN 10"`],
  ])('refuses a viewBox that is %s', (_label, attributes) => {
    rejects(svg('<path d="M0 0Z"/>', attributes));
  });

  it('refuses width and height on the root, which are not the metadata source', () => {
    rejects(svg('<path d="M0 0Z"/>', `xmlns="${NS}" viewBox="0 0 10 10" width="10" height="10"`));
  });
});

describe('values', () => {
  it.each([
    ['unit', '<rect x="0" y="0" width="10px" height="10"/>'],
    ['percentage', '<rect x="0" y="0" width="50%" height="10"/>'],
    ['NaN', '<circle cx="NaN" cy="0" r="1"/>'],
    ['Infinity', '<circle cx="Infinity" cy="0" r="1"/>'],
    ['calc', '<circle cx="calc(1 + 1)" cy="0" r="1"/>'],
    ['negative radius', '<circle cx="0" cy="0" r="-1"/>'],
    ['named colour', '<path d="M0 0Z" fill="red"/>'],
    ['hsl colour', '<path d="M0 0Z" fill="hsl(0 100% 50%)"/>'],
    ['legacy rgb', '<path d="M0 0Z" fill="rgb(255, 0, 0)"/>'],
    ['opacity above one', '<path d="M0 0Z" opacity="1.5"/>'],
    ['bad enumeration', '<path d="M0 0Z" fill-rule="arcs"/>'],
    ['CSS transform syntax', '<g transform="translateX(10px)"><path d="M0 0Z"/></g>'],
    ['3D transform', '<g transform="translate3d(1 2 3)"><path d="M0 0Z"/></g>'],
    ['odd point count', '<polyline points="0 0 1"/>'],
    ['single point', '<polygon points="0 0"/>'],
    ['malformed path', '<path d="M0 0L"/>'],
    ['bad arc flag', '<path d="M0 0A1 1 0 3 0 1 1"/>'],
    ['empty path', '<path d=""/>'],
  ])('refuses %s', (_label, body) => {
    rejects(svg(body));
  });

  it('refuses a geometry attribute on an element it does not belong to', () => {
    rejects(svg('<circle cx="0" cy="0" r="1" d="M0 0Z"/>'));
    rejects(svg('<path d="M0 0Z" points="0 0 1 1"/>'));
    rejects(svg('<rect x="0" y="0" width="1" height="1" cx="0"/>'));
  });

  it('refuses a repeated attribute rather than choosing one', () => {
    // XML makes this a parse error; the assertion is that it never silently
    // becomes "the last one wins".
    rejects(svg('<path d="M0 0Z" fill="#fff" fill="#000"/>'));
  });
});

describe('complexity', () => {
  it('refuses one element past the ceiling', () => {
    const shape = '<path d="M0 0Z"/>';
    expect(sanitizeTemplateSvg(svg(shape.repeat(9_999)))).toBeDefined();
    rejects(svg(shape.repeat(10_000)));
  });

  it('refuses one level past the depth ceiling', () => {
    const nest = (depth: number): string =>
      `${'<g>'.repeat(depth)}<path d="M0 0Z"/>${'</g>'.repeat(depth)}`;
    // The root counts as depth 1, so 62 groups put the shape at exactly 64.
    expect(sanitizeTemplateSvg(svg(nest(62)))).toBeDefined();
    rejects(svg(nest(63)));
  });

  it('refuses a file past the byte ceiling before parsing it', () => {
    const filler = ' '.repeat(1024 * 1024);
    rejects(svg(`<path d="M0 0Z"/>${filler}`));
  });
});

describe('encoding and case evasion', () => {
  it.each([
    ['uppercase element', '<PATH d="M0 0Z"/>'],
    ['mixed-case element', '<Path d="M0 0Z"/>'],
    ['uppercase attribute', '<path D="M0 0Z"/>'],
    ['numeric entity in a name', '<pat&#104; d="M0 0Z"/>'],
  ])('refuses %s', (_label, body) => {
    rejects(svg(body));
  });

  it('refuses a numeric character reference that spells a forbidden value', () => {
    // `&#106;avascript:` decodes to `javascript:` after parsing. The value
    // grammar sees the decoded text, so the encoding buys nothing.
    rejects(svg('<path d="M0 0Z" fill="&#106;avascript:alert(1)"/>'));
  });
});
