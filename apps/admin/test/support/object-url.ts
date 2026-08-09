/**
 * jsdom implements neither `createObjectURL` nor `revokeObjectURL`.
 *
 * Installing them is not only a polyfill: recording every call is how the
 * revocation assertions are made at all. The url encodes a counter, so a stale
 * handle is distinguishable from a fresh one — which is the difference between
 * "the object URL was replaced" and "the previous Side's artwork is still on
 * screen".
 */
export interface ObjectUrlRecorder {
  readonly created: string[];
  readonly revoked: string[];
}

export function installObjectUrl(prefix: string): ObjectUrlRecorder {
  const created: string[] = [];
  const revoked: string[] = [];

  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    configurable: true,
    value: (blob: Blob) => {
      const url = `blob:${prefix}/${String(created.length)}/${String(blob.size)}`;
      created.push(url);
      return url;
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    writable: true,
    configurable: true,
    value: (url: string) => {
      revoked.push(url);
    },
  });

  return { created, revoked };
}
