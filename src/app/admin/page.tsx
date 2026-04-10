import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata: Metadata = {
  title: "운영자 — Plantor",
  description: "Plantor 운영자 전용 페이지",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminShell />;
}
