/**
 * @jest-environment node
 */
import { renderToStaticMarkup } from 'react-dom/server';

import HomePage from '../../src/app/page';

describe('storefront home page', () => {
  it('renders the bootstrap landing content as server markup', () => {
    const markup = renderToStaticMarkup(<HomePage />);
    // The shared shell (root layout) owns the <main> landmark now; the page renders
    // only its own heading and content into that slot (APP1-S01A §14).
    expect(markup).toContain('<h1>');
    expect(markup).not.toContain('<main');
    expect(markup).toContain('Embroidery Commerce Storefront');
  });
});
