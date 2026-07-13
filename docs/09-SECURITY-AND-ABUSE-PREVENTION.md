# 09 — Security and Abuse Prevention

**Status:** Product security baseline  
**Version:** 0.1.0

## 1. Security objectives

- Protect customer data.
- Protect design assets.
- Prevent unauthorized export.
- Reduce editor abuse.
- Protect Admin account.
- Prevent payment manipulation.
- Preserve audit evidence.
- Maintain recoverability.

## 2. Customer access

- Customer may use guest flow.
- Submission requires verification.
- Secure links must be unguessable.
- Secure links should be revocable or expire.
- Sensitive actions may require re-verification.
- Customer can access only their own request.

## 3. Admin access

- Strong password policy.
- MFA is strongly recommended.
- Rate limiting.
- Login alerts where practical.
- Secure session handling.
- Session revocation.
- Recovery procedure.
- No hard-coded credentials.

## 4. File upload security

Uploads must be validated by:

- Size.
- MIME type.
- File signature.
- Extension consistency.
- Image decode.
- SVG sanitization.
- Malware scanning where practical.
- Pixel dimension limit.
- Processing timeout.
- Storage isolation.

Never trust client-provided MIME type.

## 5. Asset access

- Private assets require authorization.
- Expiring signed URLs where appropriate.
- Original store-owned templates are not public by default.
- Production files are strictly internal.
- Customer previews should be lower-value derivatives.
- Direct object storage listing is prohibited.

## 6. Watermark strategy

Use layered controls:

- Repeated watermark.
- Dynamic request/session identifier.
- Optional masked customer identifier.
- Limited resolution.
- No export UI.
- No stable public preview URL.
- Rate limiting.
- Abuse monitoring.

Do not claim absolute screenshot prevention.

## 7. Abuse prevention

Protect editor and upload services with:

- Request throttling.
- Session quota.
- Upload quota.
- Concurrent session limits.
- CAPTCHA or challenge when risk is high.
- Spam detection.
- Duplicate request detection.
- Expiration of abandoned sessions.
- Admin blocklist or denylist capability.

## 8. Payment security

- Server-side amount verification.
- Idempotency.
- Signature verification.
- Replay protection.
- Currency verification.
- Order reference verification.
- Provider reconciliation.
- Never trust redirect query alone.
- Sensitive provider payloads must not be logged in full.

## 9. Application security

Baseline controls:

- Server-side authorization.
- CSRF protection where applicable.
- XSS prevention.
- SQL injection prevention.
- Secure headers.
- Content Security Policy.
- Clickjacking protection.
- Rate limiting.
- Dependency scanning.
- Secret management.
- Secure cookie configuration.
- Input validation.
- Output encoding.

## 10. Data retention

Retention periods remain to be finalized.

Policy must distinguish:

- Temporary editor session.
- Submitted request.
- Customer upload.
- Approved design.
- Production file.
- Payment record.
- Audit log.
- Backup.

## 11. Backup security

- Backup must be encrypted or access-controlled.
- Backup must exist outside the store’s primary server.
- Restore must be tested.
- Backup deletion policy must be documented.
