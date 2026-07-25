const HOME_COPY = {
  heading: 'Embroidery Commerce Storefront',
  status:
    'Ứng dụng storefront đã khởi tạo (checkpoint CP0). Tính năng nghiệp vụ chưa được triển khai.',
} as const;

export default function HomePage() {
  // The shared shell (root layout) owns the <main> landmark; this page renders
  // its own <h1> and content into that slot (APP1-S01A §14). Scaffold placeholder
  // preserved — no Homepage redesign in this checkpoint.
  return (
    <>
      <h1>{HOME_COPY.heading}</h1>
      <p>{HOME_COPY.status}</p>
    </>
  );
}
