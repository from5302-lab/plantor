export default function WritingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#ffffff" }}>
      {children}
    </div>
  );
}
