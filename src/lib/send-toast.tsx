"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { T } from "@/lib/design-tokens";

type ToastStatus = "pending" | "success" | "error";
type ToastKind = "send" | "task";
type Toast = {
  id: number;
  label: string;
  status: ToastStatus;
  kind: ToastKind;
  message?: string;
  successText?: string;
};

type StartSendArgs = { label: string; phones: string[]; text: string };
type StartTaskArgs = {
  label: string;
  task: () => Promise<unknown>;
  successText?: string;
};
type Ctx = {
  startSend: (args: StartSendArgs) => void;
  startTask: (args: StartTaskArgs) => void;
};

const SendToastContext = createContext<Ctx | null>(null);

export function useSendToast(): Ctx {
  const ctx = useContext(SendToastContext);
  if (!ctx) throw new Error("useSendToast must be used inside <SendToastProvider>");
  return ctx;
}

export function SendToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const runWithToast = useCallback((toast: Omit<Toast, "id" | "status">, promise: Promise<unknown>, failFallback: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...toast, id, status: "pending" }]);
    promise
      .then(() => {
        setToasts((prev) => prev.map((t) => t.id === id ? { ...t, status: "success" } : t));
        setTimeout(() => remove(id), 2000);
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message.slice(0, 120) : failFallback;
        setToasts((prev) => prev.map((t) => t.id === id ? { ...t, status: "error", message } : t));
        setTimeout(() => remove(id), 5000);
      });
  }, [remove]);

  const startSend = useCallback(({ label, phones, text }: StartSendArgs) => {
    const fn = httpsCallable<{ phones: string[]; text: string }, { success: boolean }>(functions, "sendBulkSms");
    runWithToast({ label, kind: "send" }, fn({ phones, text }), "발송 실패");
  }, [runWithToast]);

  const startTask = useCallback(({ label, task, successText }: StartTaskArgs) => {
    runWithToast({ label, kind: "task", successText }, task(), "처리 실패");
  }, [runWithToast]);

  return (
    <SendToastContext.Provider value={{ startSend, startTask }}>
      {children}
      <div
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 950,
          display: "flex", flexDirection: "column", gap: 8,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </SendToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const isSend = toast.kind === "send";
  const palette = toast.status === "pending"
    ? { bg: "#615d59", icon: isSend ? "📨" : "⏳", text: isSend ? "발송 중…" : "처리 중…" }
    : toast.status === "success"
    ? { bg: "#1a7f4b", icon: "✅", text: toast.successText ?? (isSend ? "발송됨" : "완료") }
    : { bg: "#c00000", icon: "❌", text: toast.message ?? (isSend ? "발송 실패" : "처리 실패") };

  return (
    <div
      style={{
        backgroundColor: palette.bg, color: "#fff",
        borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 600,
        boxShadow: T.shadowFloat,
        minWidth: 240, maxWidth: "min(360px, 90vw)",
        display: "flex", alignItems: "center", gap: 8,
        pointerEvents: "auto",
      }}
    >
      <span>{palette.icon}</span>
      <span style={{ flex: 1, lineHeight: 1.4 }}>
        <span style={{ opacity: 0.85, marginRight: 6 }}>{toast.label}</span>
        {palette.text}
      </span>
      {toast.status === "error" && (
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 14, padding: 2, opacity: 0.85 }}
        >✕</button>
      )}
    </div>
  );
}
