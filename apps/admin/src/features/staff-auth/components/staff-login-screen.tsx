import { StaffLoginBrandPanel } from './staff-login-brand-panel';
import { StaffLoginForm } from './staff-login-form';

/**
 * Full staff login screen: static editorial brand panel beside the auth card.
 * A Server Component — only the inner form is client-interactive — so the brand
 * copy renders in server HTML. Layout (two-column desktop, stacked mobile) is
 * owned by SCSS.
 */
export function StaffLoginScreen() {
  return (
    <main className="staff-login">
      <StaffLoginBrandPanel />
      <div className="staff-login__form-panel">
        <div className="staff-login__card">
          <StaffLoginForm />
        </div>
      </div>
    </main>
  );
}
