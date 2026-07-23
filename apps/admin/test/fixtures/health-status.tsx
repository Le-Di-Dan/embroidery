'use client';

// Test-only fixture (not production UI): a client component that consumes the
// generated api-client operation through TanStack Query, so tests prove the
// public `@embroidery/api-client` import, provider integration and the
// no-live-network policy (the Axios instance is injected/mocked by the test).
import { healthReadiness, type ApiRequestOptions } from '@embroidery/api-client';
import { useQuery } from '@tanstack/react-query';

export function HealthStatus({ options }: { options: ApiRequestOptions }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['health', 'readiness'],
    queryFn: () => healthReadiness(options),
  });

  if (isPending) return <span>loading</span>;
  if (isError) return <span>error</span>;
  return <span>status: {data.status}</span>;
}
