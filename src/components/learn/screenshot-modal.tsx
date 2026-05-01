"use client";

import { useState, useRef, useCallback } from "react";
import { T } from "@/lib/design-tokens";
import { ModalOverlay } from "@/components/ui/modal-overlay";

/** Canvas로 이미지 압축 (최대 400px, JPEG 60%) */
async function compressImage(file: File | Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 800;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => { URL.revokeObjectURL(url); resolve(blob!); }, "image/jpeg", 0.85);
    };
    img.src = url;
  });
}

export function ScreenshotModal({ onSubmit, onCancel }: { onSubmit: (blob: Blob) => void; onCancel: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const loadImage = useCallback(async (raw: Blob) => {
    setError(null);
    if (!raw.type.startsWith("image/")) { setError("이미지 파일만 붙여넣을 수 있어요."); return; }
    const compressed = await compressImage(raw);
    setBlob(compressed);
    setPreview(URL.createObjectURL(compressed));
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) { await loadImage(await item.getType(imageType)); return; }
      }
      setError("클립보드에 이미지가 없어요. 스크린샷을 먼저 찍어주세요.");
    } catch { setError("클립보드 접근 권한이 필요해요. 브라우저 주소창 옆 자물쇠 아이콘에서 허용해 주세요."); }
  }, [loadImage]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) await loadImage(file);
  }, [loadImage]);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await loadImage(file);
  }, [loadImage]);

  const handleKeyDown = useCallback(async (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "v") await handlePaste();
  }, [handlePaste]);

  async function handleSubmit() {
    if (!blob) return;
    setSubmitting(true);
    try { onSubmit(blob); } finally { setSubmitting(false); }
  }

  return (
    <ModalOverlay onClose={onCancel} align="top" onKeyDown={handleKeyDown}>
      <div className="bg-white rounded-2xl px-6 py-7 max-w-[380px] w-full my-auto" style={{ boxShadow: T.shadowFloat }}>
        <h2 className="m-0 mb-1 text-[17px] font-bold text-black/95" style={{ letterSpacing: "-0.2px" }}>📸 인증샷 제출</h2>
        <p className="m-0 mb-5 text-[13px] text-p-secondary">학습 결과 화면을 캡처해서 붙여넣어 주세요</p>

        {!preview && (
          <div className="bg-p-bg rounded-xl px-3.5 py-3 mb-4 flex flex-col gap-1.5">
            <div className="text-xs font-semibold text-p-secondary mb-0.5">스크린샷 찍는 방법</div>
            {[{ os: "Mac", shortcut: "Cmd ⌘ + Shift + 4" }, { os: "Win", shortcut: "Win + Shift + S" }].map((item) => (
              <div key={item.os} className="flex justify-between items-center">
                <span className="text-xs text-p-muted">{item.os}</span>
                <code className="text-[11px] font-semibold bg-white border border-black/10 rounded px-1.5 py-0.5 text-black/95">{item.shortcut}</code>
              </div>
            ))}
          </div>
        )}

        <div
          ref={dropRef}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={!preview ? handlePaste : undefined}
          className={[
            "rounded-xl mb-4 flex items-center justify-center flex-col gap-2 overflow-hidden relative",
            preview
              ? "border-none bg-transparent"
              : "border-2 border-dashed border-black/15 bg-p-bg min-h-[120px] cursor-pointer",
          ].join(" ")}
        >
          {preview ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="인증샷 미리보기" className="w-full max-h-[220px] object-contain rounded-xl block" />
              <button
                onClick={() => { setPreview(null); setBlob(null); }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 border-none text-white text-sm cursor-pointer flex items-center justify-center"
              >
                ×
              </button>
            </>
          ) : (
            <>
              <span className="text-[28px]">📋</span>
              <div className="text-center">
                <div className="text-[13px] font-semibold text-p-secondary">클릭하거나 Cmd+V / Ctrl+V</div>
                <div className="text-[11px] text-p-muted mt-0.5">드래그 앤 드롭도 가능해요</div>
              </div>
            </>
          )}
        </div>

        {!preview && (
          <label className="block text-center text-xs text-p-muted cursor-pointer mb-4">
            <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
            또는 파일 직접 선택 →
          </label>
        )}

        {error && (
          <div className="px-3 py-2.5 mb-4 bg-[#fff5f5] border border-[#fed7d7] rounded text-xs text-[#c53030]" style={{ lineHeight: 1.5 }}>{error}</div>
        )}

        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            className="btn-secondary flex-1 h-11 rounded border border-black/10 bg-transparent text-sm font-semibold text-p-secondary cursor-pointer"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={!blob || submitting}
            className="h-11 rounded border-none text-sm font-semibold transition-colors duration-150"
            style={{
              flex: 2,
              backgroundColor: blob ? T.teal : "rgba(0,0,0,0.1)",
              color: blob ? T.white : T.textMuted,
              cursor: blob ? "pointer" : "default",
            }}
          >
            {submitting ? "제출 중…" : "제출하기 →"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
