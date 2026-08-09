import '@testing-library/jest-dom';

import { TextDecoder, TextEncoder } from 'node:util';

/**
 * `TextEncoder`/`TextDecoder`, which jsdom does not install as globals.
 *
 * Every browser this Admin app supports has had both since 2016; jsdom is the
 * only environment in the stack that omits them. Without the polyfill the gap is
 * silent and misleading: `@embroidery/design-document`'s canonicalization ends
 * with `new TextEncoder().encode(...)`, so `prepareDesignDocument` returns
 * `CANONICALIZATION_FAILED` under test and succeeds in the browser — a component
 * would look broken in jsdom while working in production, or, far worse, a
 * component that genuinely mis-handled a document would look *correctly* broken
 * for the wrong reason.
 *
 * Assigned only when absent, so a future jsdom that ships them wins.
 */
const globals = globalThis as unknown as Record<string, unknown>;
globals['TextEncoder'] ??= TextEncoder;
globals['TextDecoder'] ??= TextDecoder;
