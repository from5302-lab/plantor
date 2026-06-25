"use client";

import { useRef, useState } from "react";
import imageCompression from "browser-image-compression";

type Props = {
  imageUrl: string | null;
  onCapture: (file: File) => void;
  onRemove: () => void;
};

export function ReceiptCapture({ imageUrl, onCapture, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(imageUrl);
  const [compressing, setCompressing] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCompressing(true);
    try {
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 1200,
        maxSizeMB: 0.8,
        useWebWorker: true,
        fileType: "image/jpeg",
      });
      const url = URL.createObjectURL(compressed);
      setPreview(url);
      onCapture(compressed as File);
    } catch {
      // fallback: 원본 사용
      const url = URL.createObjectURL(file);
      setPreview(url);
      onCapture(file);
    } finally {
      setCompressing(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onRemove();
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <label
        style={{
          fontSize: "14px",
          fontWeight: 500,
          color: "rgba(0,0,0,0.95)",
          display: "block",
          marginBottom: "6px",
        }}
      >
        영수증
      </label>

      {preview ? (
        <div style={{ position: "relative" }}>
          <img
            src={preview}
            alt="영수증"
            style={{
              width: "100%",
              maxHeight: "200px",
              objectFit: "cover",
              borderRadius: "8px",
              border: "1px solid rgba(0,0,0,0.1)",
            }}
          />
          <button
            type="button"
            onClick={handleRemove}
            style={{
              position: "absolute",
              top: "8px",
              right: "8px",
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              border: "none",
              borderRadius: "50%",
              width: "28px",
              height: "28px",
              fontSize: "14px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={compressing}
          style={{
            width: "100%",
            padding: "20px",
            border: "2px dashed rgba(0,0,0,0.15)",
            borderRadius: "8px",
            background: "#fafaf9",
            color: "#615d59",
            fontSize: "14px",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <span style={{ fontSize: "24px" }}>📷</span>
          {compressing ? "압축 중..." : "촬영 또는 선택"}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        style={{ display: "none" }}
      />
    </div>
  );
}
