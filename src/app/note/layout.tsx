import type { Metadata } from "next";
import "katex/dist/katex.min.css";

export const metadata: Metadata = {
  icons: { icon: "/planote-icon.svg" },
};

export default function NoteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#ffffff" }}>
      {children}
    </div>
  );
}
