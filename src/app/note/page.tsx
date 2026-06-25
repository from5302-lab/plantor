import type { Metadata } from "next";
import { Suspense } from "react";
import { NoteShell } from "@/components/note/note-shell";

export const metadata: Metadata = {
  title: "Planote",
  description: "타이핑 기반 학습 필기 노트.",
};

export default function NotePage() {
  return (
    <Suspense>
      <NoteShell />
    </Suspense>
  );
}
