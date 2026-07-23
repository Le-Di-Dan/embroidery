'use client';

// Test-only fixture (not production UI): exercises the client-component test
// path — state/interaction, an SCSS side-effect import, next/link, next/image
// and a next/navigation hook — for the APP0-T02A component-test foundation.
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import './sample-widget.scss';

export function SampleWidget() {
  const [count, setCount] = useState(0);
  const router = useRouter();

  return (
    <section className="sample-widget">
      <h2>Sample widget</h2>
      <p>count: {count}</p>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        increment
      </button>
      <button type="button" onClick={() => router.back()}>
        go back
      </button>
      <Link href="/dashboard">Dashboard</Link>
      <Image src="/logo.png" alt="brand logo" width={48} height={48} />
    </section>
  );
}
