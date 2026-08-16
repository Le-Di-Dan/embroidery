/**
 * Grant-scoped custom-request status (`APP5-S02`).
 *
 * One export: the screen the `/truy-cap` route mounts inside the secure-link
 * query provider. Nothing else crosses — a second mount point would be a second
 * place a secure-link fragment could be read, which is the property `APP4-S02`
 * spent a checkpoint establishing and this one reuses rather than reopens.
 */
export { CustomRequestStatusScreen } from './ui/custom-request-status-screen';
