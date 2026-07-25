'use client';

const ERROR_COPY = {
  title: 'Không thể xác minh phiên đăng nhập',
  detail:
    'Hiện chưa thể kết nối tới dịch vụ xác thực. Đây là sự cố tạm thời của máy chủ, ' +
    'không phải do bạn đã đăng xuất. Vui lòng thử lại.',
  retry: 'Thử lại',
} as const;

/**
 * Protected-route error boundary. A dependency failure while resolving the
 * staff session (network/timeout/5xx) surfaces here — never as a silent
 * redirect to `/login` — so a transient API outage is not misread as
 * signed-out. `reset()` re-runs the server resolution.
 */
export default function ProtectedError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main>
      <h1>{ERROR_COPY.title}</h1>
      <p>{ERROR_COPY.detail}</p>
      <button type="button" onClick={reset}>
        {ERROR_COPY.retry}
      </button>
    </main>
  );
}
