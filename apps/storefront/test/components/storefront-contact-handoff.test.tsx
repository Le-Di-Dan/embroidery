/**
 * APP10-I01 — Storefront Zalo/Messenger simple external handoff.
 *
 * Design status: the four approved I01 frames — FIG-APP10-I01-FOOTER-DESKTOP
 * (842:3), -FOOTER-MOBILE (842:48), -CTA-STATES (843:3), -HANDOFF-SPEC (843:44),
 * approved under FIG-APPROVAL-APP10-D01-PO-001 — draw the CTAs as flat
 * rectangles at the end of the footer. PO review at `APP10-E01` rejected that
 * placement against the running Storefront and directed a floating circular dock
 * at the bottom-right instead, with the footer returned to its pre-I01 form. The
 * frames are stale against this suite until redrawn (`FU-APP10-E01-01`).
 *
 * The cases below were rewritten to the directed composition rather than
 * deleted: every claim I01 made about the *handoff* — configured URLs used
 * verbatim, external-navigation semantics, malformed values omitted, no provider
 * SDK, no network call — is unchanged and still asserted here. Only the claims
 * about *where the group sits* moved, and they moved deliberately.
 *
 * The component reads `process.env` at render time on purpose, so each case sets
 * the two values and renders the real shell — every assertion is about the page a
 * customer actually gets, not about a resolver in isolation.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderWithProviders, screen, within } from '@embroidery/frontend-testing';

import { StorefrontShell } from '../../src/features/storefront-shell';

const ZALO_URL = 'https://zalo.me/xuong-theu-demo';
const MESSENGER_URL = 'https://m.me/xuong.theu.demo';
const GROUP_NAME = 'Kết nối';
const CAPTION = 'Mở ứng dụng bên ngoài';
/** The accessible name a circular CTA carries: the channel, then the handoff. */
const nameOf = (channel: string) => `${channel} — ${CAPTION}`;

function setConfig(zalo: string | undefined, messenger: string | undefined) {
  if (zalo === undefined) {
    delete process.env.NEXT_PUBLIC_ZALO_CONTACT_URL;
  } else {
    process.env.NEXT_PUBLIC_ZALO_CONTACT_URL = zalo;
  }
  if (messenger === undefined) {
    delete process.env.NEXT_PUBLIC_MESSENGER_CONTACT_URL;
  } else {
    process.env.NEXT_PUBLIC_MESSENGER_CONTACT_URL = messenger;
  }
}

afterEach(() => setConfig(undefined, undefined));

function renderShell() {
  return renderWithProviders(
    <StorefrontShell>
      <h1>Trang mẫu</h1>
    </StorefrontShell>,
  );
}

/** Every anchor on the page — the dock is no longer scoped to one landmark. */
function pageAnchors(): HTMLAnchorElement[] {
  return [...document.querySelectorAll('a')];
}

describe('APP10-I01 — both channels configured', () => {
  beforeEach(() => setConfig(ZALO_URL, MESSENGER_URL));

  it('renders the Zalo and Messenger CTAs on their configured URLs, in the approved order', () => {
    renderShell();
    const dock = screen.getByRole('region', { name: GROUP_NAME });
    const links = within(dock).getAllByRole('link');
    expect(links).toHaveLength(2);
    // DOM order is the approved channel order; the stylesheet's `column-reverse`
    // puts Zalo nearest the thumb without reordering the markup.
    expect(links[0]).toHaveAccessibleName(nameOf('Zalo'));
    expect(links[0]).toHaveAttribute('href', ZALO_URL);
    expect(links[1]).toHaveAccessibleName(nameOf('Messenger'));
    expect(links[1]).toHaveAttribute('href', MESSENGER_URL);
  });

  it('opens each channel as a secure external handoff, named in real text not aria-label', () => {
    renderShell();
    const dock = screen.getByRole('region', { name: GROUP_NAME });
    for (const link of within(dock).getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      // Repository-standard attributes for a new browsing context.
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      // The name is text inside the link, never an attribute replacing content:
      // a translation tool can reach it, and the pointer tooltip repeats it.
      expect(link).not.toHaveAttribute('aria-label');
      expect(link.textContent).toContain(CAPTION);
      expect(link.getAttribute('title')).toContain(CAPTION);
    }
    // The circle's visible mark is decorative: the name span carries the meaning,
    // so no CTA is ever announced as a single letter.
    const marks = dock.querySelectorAll('.storefront-shell__handoff-dock-mark');
    expect(marks).toHaveLength(2);
    for (const mark of marks) {
      expect(mark).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('is a floating pair of links outside the footer, not an embedded chat surface', () => {
    renderShell();
    const dock = screen.getByRole('region', { name: GROUP_NAME });
    const footer = screen.getByRole('contentinfo');

    // No launcher, panel, composer, badge or inbox affordance of any kind. A
    // floating position is not a chat surface, and this dock has no state to
    // open or close (BR-018, D-015).
    expect(within(dock).queryAllByRole('button')).toHaveLength(0);
    expect(within(dock).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(dock).queryAllByRole('dialog')).toHaveLength(0);
    expect(dock.querySelector('iframe, script, embed, object')).toBeNull();

    // It is page-level chrome: a sibling of `<main>` and the footer, inside
    // neither. The stylesheet fixes it to the bottom-right from that position.
    expect(footer.contains(dock)).toBe(false);
    expect(screen.getByRole('main').contains(dock)).toBe(false);
    expect(dock.className).toContain('storefront-shell__handoff-dock');

    // And the footer is exactly its pre-I01 self, whatever is configured.
    expect(within(footer).getAllByRole('link')).toHaveLength(1);
    expect(within(footer).queryByText(GROUP_NAME)).toBeNull();
  });
});

describe('APP10-I01 — partial and absent configuration', () => {
  it('omits only the unconfigured channel, with no placeholder in its place', () => {
    setConfig(ZALO_URL, undefined);
    renderShell();
    const dock = screen.getByRole('region', { name: GROUP_NAME });
    const links = within(dock).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName(nameOf('Zalo'));
    expect(within(dock).queryByText('Messenger')).toBeNull();
    // No dead or disabled stand-in for the missing channel.
    expect(dock.querySelector('[aria-disabled], button, [disabled]')).toBeNull();
  });

  it('omits the whole dock when neither channel is configured, leaving the pre-I01 page', () => {
    setConfig(undefined, undefined);
    renderShell();
    expect(screen.queryByRole('region', { name: GROUP_NAME })).toBeNull();
    expect(screen.queryByText(GROUP_NAME)).toBeNull();
    const footer = screen.getByRole('contentinfo');
    // The approved APP1-S01A footer still renders in full.
    expect(within(footer).getByText('Studio thêu thủ công theo yêu cầu.')).toBeInTheDocument();
    expect(
      within(footer).getByText('© Xưởng Thêu · Studio thêu theo yêu cầu.'),
    ).toBeInTheDocument();
    expect(within(footer).getAllByRole('link')).toHaveLength(1);
  });

  it.each([
    ['blank', '   '],
    ['relative path', '/lien-he'],
    ['bare host', 'zalo.me/xuong-theu'],
    ['free text', 'hoi qua Zalo'],
    ['javascript scheme', 'javascript:void(0)'],
    ['data scheme', 'data:text/html,hi'],
    ['mailto scheme', 'mailto:hello@example.com'],
    ['embedded credentials', 'https://user:pass@zalo.me/xuong-theu'],
  ])('never renders a malformed Zalo value (%s)', (_label, malformed) => {
    setConfig(malformed, MESSENGER_URL);
    renderShell();
    const dock = screen.getByRole('region', { name: GROUP_NAME });
    const links = within(dock).getAllByRole('link');
    // The malformed channel is simply absent; the valid one is unaffected.
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', MESSENGER_URL);
    for (const anchor of pageAnchors()) {
      expect(anchor.getAttribute('href')).not.toBe(malformed.trim());
    }
  });

  it('shows a customer no configuration error and no dead href when both values are unusable', () => {
    setConfig('javascript:void(0)', 'not a url');
    renderShell();
    expect(screen.queryByRole('region', { name: GROUP_NAME })).toBeNull();
    for (const anchor of pageAnchors()) {
      const href = anchor.getAttribute('href') ?? '';
      expect(href).not.toBe('');
      expect(href).not.toBe('#');
      expect(href.startsWith('javascript:')).toBe(false);
    }
    expect(screen.queryByText(/NEXT_PUBLIC_/)).toBeNull();
  });
});

describe('APP10-I01 — security boundary of the handoff URL', () => {
  it('renders the configured URL unmutated: no token, id, or page state is appended', () => {
    setConfig(ZALO_URL, MESSENGER_URL);
    renderShell();
    const dock = screen.getByRole('region', { name: GROUP_NAME });
    for (const link of within(dock).getAllByRole('link')) {
      const href = link.getAttribute('href') ?? '';
      expect([ZALO_URL, MESSENGER_URL]).toContain(href);
      // Nothing is composed onto the operator's URL at all.
      expect(href).not.toContain('#');
      expect(href).not.toContain('?');
      expect(href).not.toContain(window.location.href);
    }
  });

  it('makes no network request and injects no provider script while rendering', () => {
    const original = globalThis.fetch;
    const fetchMock = jest.fn(() => {
      throw new Error('the contact handoff must never call out');
    });
    globalThis.fetch = fetchMock;
    try {
      setConfig(ZALO_URL, MESSENGER_URL);
      const { container } = renderShell();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(container.querySelector('script, iframe, embed, object')).toBeNull();
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('APP10-I01 — source boundaries', () => {
  const featureDir = join(__dirname, '..', '..', 'src', 'features', 'storefront-shell');
  const sources = [
    join(featureDir, 'components', 'storefront-contact-handoff.tsx'),
    join(featureDir, 'model', 'contact-handoff.ts'),
    join(featureDir, 'components', 'storefront-footer.tsx'),
    // The dock's new host: the shell must not have gained a provider seam either.
    join(featureDir, 'components', 'storefront-shell.tsx'),
  ].map((path) => ({ path, text: readFileSync(path, 'utf8') }));

  it('imports no provider SDK, API client, or third-party package at all', () => {
    for (const { path, text } of sources) {
      const specifiers = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
        (match) => match[1] ?? '',
      );
      for (const specifier of specifiers) {
        // React itself is the framework, not a third party the handoff reaches.
        const relative = specifier.startsWith('.') || specifier === 'react';
        expect({ path, specifier, relative }).toEqual({ path, specifier, relative: true });
      }
    }
  });

  it('hard-codes no provider URL and reaches no backend', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: /https?:\/\//.test(text) }).toEqual({ path, hit: false });
      expect({ path, hit: /\bfetch\s*\(|axios|\/api\//.test(text) }).toEqual({ path, hit: false });
    }
  });
});
