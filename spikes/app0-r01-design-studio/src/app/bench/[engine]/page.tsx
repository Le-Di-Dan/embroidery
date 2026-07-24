import { notFound } from 'next/navigation';

import { BenchHarness } from './bench-harness';
import type { EngineId } from '../../../adapters/types';

const ENGINES: readonly EngineId[] = ['konva', 'fabric', 'svg'];

export function generateStaticParams() {
  return ENGINES.map((engine) => ({ engine }));
}

export default async function BenchPage({ params }: { params: Promise<{ engine: string }> }) {
  const { engine } = await params;
  if (!ENGINES.includes(engine as EngineId)) {
    notFound();
  }
  return <BenchHarness engine={engine as EngineId} />;
}
