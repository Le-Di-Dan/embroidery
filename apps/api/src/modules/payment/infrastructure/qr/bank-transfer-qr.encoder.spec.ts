/**
 * The optical half of the QR proof (`APP7-B03` §18).
 *
 * The rendered PNG is decoded by two packages that know nothing about the
 * encoder — `pngjs` turns the file back into pixels and `jsqr` reads a QR out of
 * them — and the recovered string must be byte-identical to the payload that
 * went in. A camera pointed at this image recovers the same bytes, which is what
 * "a banking application can read it" means in an automated environment.
 *
 * `REAL_BANK_APP_SCAN` is deliberately **not** simulated here. A physical scan
 * with a Vietnamese banking application cannot be performed by a test process,
 * and asserting it anyway would be the fabricated evidence `APP7-B03` §18
 * forbids.
 *
 * Docker-free: no database, no container, no network — which is also the
 * property being demonstrated, since a hosted QR service would need all three.
 */
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

import { buildBankTransferQrPayload } from '../../domain/deposit/bank-transfer-qr.payload';
import { depositTransferReference } from '../../domain/deposit/deposit-reference';
import { BankTransferQrEncoder } from './bank-transfer-qr.encoder';

const PAYLOAD = buildBankTransferQrPayload({
  bankBin: '970418',
  accountNumber: '31410000123456',
  amount: '1500000.00',
  transferReference: depositTransferReference('ORD-7K3MPQ2XVD'),
});

/** PNG magic number, checked so "an image was returned" is not assumed. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('APP7-B03 — the local bank-transfer QR encoder', () => {
  const encoder = new BankTransferQrEncoder();

  it('renders a real PNG', async () => {
    const png = await encoder.encodePng(PAYLOAD);
    expect(png.byteLength).toBeGreaterThan(0);
    expect(png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)).toBe(true);
  });

  it('decodes back to the exact payload it was given', async () => {
    const png = await encoder.encodePng(PAYLOAD);
    const decoded = decodeQr(png);
    expect(decoded).toBe(PAYLOAD);
  });

  it('round-trips the amount and the reference through the image', async () => {
    const decoded = decodeQr(await encoder.encodePng(PAYLOAD));
    // Read out of the pixels, not out of the builder's inputs.
    expect(decoded).toContain('54071500000');
    expect(decoded).toContain('ORD7K3MPQ2XVDDC');
    expect(decoded).toContain('31410000123456');
    expect(decoded).toContain('970418');
  });

  it('is deterministic, so nothing needs to store the bytes', async () => {
    const first = await encoder.encodePng(PAYLOAD);
    const second = await encoder.encodePng(PAYLOAD);
    expect(second.equals(first)).toBe(true);
  });
});

/** PNG -> RGBA -> QR, using neither the encoder nor any of its internals. */
function decodeQr(png: Buffer): string {
  const image = PNG.sync.read(png);
  const result = jsQR(Uint8ClampedArray.from(image.data), image.width, image.height);
  expect(result).not.toBeNull();
  return (result as { data: string }).data;
}
