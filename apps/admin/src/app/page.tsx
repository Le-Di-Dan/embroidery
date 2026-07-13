const HOME_COPY = {
  heading: 'Embroidery Commerce Admin',
  status: 'Ứng dụng admin đã khởi tạo (checkpoint CP0). Tính năng nghiệp vụ chưa được triển khai.',
} as const;

export default function HomePage() {
  return (
    <main>
      <h1>{HOME_COPY.heading}</h1>
      <p>{HOME_COPY.status}</p>
    </main>
  );
}
