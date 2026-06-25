import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminPreviewShell } from "@/components/admin/admin-preview-shell";

export const metadata: Metadata = {
  title: "미리보기 — Plantor",
  robots: { index: false, follow: false },
};

export default function AdminPreviewPage() {
  return (
    <Suspense>
      <AdminPreviewShell />
    </Suspense>
  );
}
