import Link from 'next/link';

const ENGINES = ['konva', 'fabric', 'svg'] as const;

export default function SpikeIndexPage() {
  return (
    <main>
      <h1>APP0-R01 — 2D rendering feasibility spike</h1>
      <p>
        Research-only harness. No design is persisted, nothing is downloadable and no production
        route or API is involved.
      </p>
      <ul>
        {ENGINES.map((engine) => (
          <li key={engine}>
            <Link href={`/bench/${engine}`}>{engine}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
