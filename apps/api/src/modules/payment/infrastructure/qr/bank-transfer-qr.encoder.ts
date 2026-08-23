/**
 * Renders a bank-transfer payload as a PNG QR image (`APP7-B03` §17).
 *
 * ### The dependency, and what it is allowed to be
 *
 * ```text
 * package  qrcode@1.5.4        MIT
 * runtime  local, in-process   no network request of any kind
 * role     matrix + PNG only   it is told a string and returns pixels
 * ```
 *
 * `qrcode` is a pure-JavaScript encoder: it computes the QR matrix and writes a
 * PNG. It performs no HTTP request, resolves no host and holds no credential —
 * which is the property `APP7-G01` §6 requires, because a hosted QR service
 * would put the merchant account number and the deposit amount into a third
 * party's request log for no benefit. `vietqr.io` and every other remote
 * generator are excluded by that rule, not by preference.
 *
 * The **payload** is not this library's business. `bank-transfer-qr.payload.ts`
 * owns the EMVCo/NAPAS field structure and the CRC, and this adapter only turns
 * the finished string into an image. Keeping the boundary there is what lets the
 * standards proof test the payload independently of how it is drawn.
 *
 * ### Error correction
 *
 * Level `M` — the level the VietQR ecosystem uses. `L` would produce a smaller
 * image that a phone camera recovers less reliably from a reflective screen;
 * `H` grows the matrix for a payload that is already short.
 */
import { Injectable } from '@nestjs/common';
import { toBuffer } from 'qrcode';

import {
  DEPOSIT_QR_MARGIN_MODULES,
  DEPOSIT_QR_MODULE_SCALE,
} from '../../domain/deposit/deposit-qr.policy';

@Injectable()
export class BankTransferQrEncoder {
  /**
   * The PNG bytes for one payload.
   *
   * Deterministic for a given payload, which is what makes persisting the image
   * unnecessary rather than merely undesirable.
   */
  async encodePng(payload: string): Promise<Buffer> {
    return toBuffer(payload, {
      errorCorrectionLevel: 'M',
      type: 'png',
      scale: DEPOSIT_QR_MODULE_SCALE,
      margin: DEPOSIT_QR_MARGIN_MODULES,
    });
  }
}
