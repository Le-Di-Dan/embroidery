/**
 * Staff login request contract and validation (ADR-APP1-001 §12, FU-A03).
 *
 * The DTO class exists only so Swagger has a named request schema; validation is
 * a small hand-rolled check (a dedicated validation library is an open decision,
 * `app-config.ts`) that produces the canonical stable `errors[]` shape. It never
 * echoes the password and does not enforce the minimum-length policy — that
 * would leak credential rules and help enumeration; a short password simply
 * fails verification uniformly.
 */
import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import type { ApiFieldError } from '@embroidery/contracts';

import { MAX_PASSWORD_BYTES } from '../../infrastructure/crypto/scrypt-password-hasher';

/** RFC 5321 practical maximum for an email address. */
const MAX_EMAIL_BYTES = 254;

/** Bounded, backtracking-safe address shape: `local@domain.tld`. */
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export class StaffLoginRequest {
  @ApiProperty({ format: 'email', maxLength: MAX_EMAIL_BYTES, example: 'admin@example.test' })
  email!: string;

  @ApiProperty({ writeOnly: true, description: 'Plain password; never stored or echoed.' })
  password!: string;
}

export interface ParsedStaffLogin {
  readonly email: string;
  readonly password: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateEmail(value: unknown, errors: ApiFieldError[]): string {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push({ field: 'email', code: 'REQUIRED', message: 'Email is required.' });
    return '';
  }
  const trimmed = value.trim();
  if (Buffer.byteLength(trimmed, 'utf8') > MAX_EMAIL_BYTES) {
    errors.push({ field: 'email', code: 'TOO_LONG', message: 'Email is too long.' });
    return '';
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    errors.push({ field: 'email', code: 'INVALID', message: 'Email is not valid.' });
    return '';
  }
  return trimmed;
}

function validatePassword(value: unknown, errors: ApiFieldError[]): string {
  if (typeof value !== 'string' || value === '') {
    errors.push({ field: 'password', code: 'REQUIRED', message: 'Password is required.' });
    return '';
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_PASSWORD_BYTES) {
    errors.push({ field: 'password', code: 'TOO_LONG', message: 'Password is too long.' });
    return '';
  }
  return value;
}

/**
 * Parses and validates a login body, throwing a 400 with field-level `errors[]`
 * on any problem (FU-A03). The returned password is untouched (only length- and
 * type-checked); the use case owns normalization.
 */
export function parseStaffLoginRequest(body: unknown): ParsedStaffLogin {
  const errors: ApiFieldError[] = [];
  const record = isRecord(body) ? body : {};
  const email = validateEmail(record['email'], errors);
  const password = validatePassword(record['password'], errors);

  if (errors.length > 0) {
    throw new BadRequestException({
      code: 'BAD_REQUEST',
      message: 'The request is invalid.',
      errors,
    });
  }
  return { email, password };
}
