'use client';

import { useEffect, useRef, useState } from 'react';

import { installRunner } from '../../../harness/runner';
import { waitForFonts } from '../../../harness/assets';
import type { EngineId, RendererAdapter } from '../../../adapters/types';

const FONTS = ['Arial', 'Georgia', 'Verdana'];

/**
 * Every candidate is imported lazily and only in the browser. Nothing here runs
 * during server rendering, which is what makes the Next 16 App Router
 * integration safe for engines that touch `window`, `document` or `canvas` at
 * module scope.
 */
const FACTORIES: Readonly<Record<EngineId, () => Promise<RendererAdapter>>> = {
  konva: async () => (await import('../../../adapters/konva/adapter')).konvaFactory.create(),
  fabric: async () => (await import('../../../adapters/fabric/adapter')).fabricFactory.create(),
  svg: async () => (await import('../../../adapters/svg/adapter')).svgFactory.create(),
};

export function BenchHarness({ engine }: { engine: EngineId }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    let cancelled = false;
    const start = async () => {
      await waitForFonts(FONTS);
      if (cancelled) {
        return;
      }
      installRunner(container, FACTORIES);
      setReady(true);
    };
    void start();
    return () => {
      cancelled = true;
      // React Strict Mode mounts twice in development; tearing the runner and
      // the engine down here is what proves no duplicate stage survives.
      window.__spike?.destroy();
      delete window.__spike;
      setReady(false);
    };
  }, []);

  return (
    <main>
      <h1>Bench: {engine}</h1>
      <div data-testid="spike-ready" data-ready={ready ? 'true' : 'false'} />
      <div data-testid="spike-stage" ref={containerRef} />
    </main>
  );
}
