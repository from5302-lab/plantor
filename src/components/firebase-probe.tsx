"use client";

import { useEffect, useState } from "react";
import { firebaseApp } from "@/lib/firebase";

export function FirebaseProbe() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setProjectId(firebaseApp.options.projectId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
    }
  }, []);

  if (error) {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
        🔴 Firebase 연결 실패: {error}
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="rounded-md border border-zinc-500/30 bg-zinc-500/10 px-3 py-2 text-sm text-zinc-400">
        ⏳ Firebase 연결 확인 중…
      </div>
    );
  }

  return (
    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
      ✅ Firebase 연결됨 · <code className="font-mono">{projectId}</code>
    </div>
  );
}
