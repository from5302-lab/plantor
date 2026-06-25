"use client";

import { useState } from "react";
import { Check } from "lucide-react";

export function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button onClick={handleCopy} title="복사" style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1, display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}>
      {copied
        ? <Check size={10} className="text-[#1a7f4b]" strokeWidth={3} />
        : <img src="/icons/copy.svg" width={13} height={13} alt="copy" style={{ display: "block" }} />}
    </button>
  );
}
