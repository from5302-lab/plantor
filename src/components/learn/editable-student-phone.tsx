"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

// 학생 본인이 자기 연락처를 입력 (미완료 알림 문자 발송용)
export function EditableStudentPhone({ childId, phone }: { childId: string; phone: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(phone);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await httpsCallable(functions, "updateStudentPhone")({ childId, phone: val });
      setEditing(false);
    } catch (e) { alert(e instanceof Error ? e.message : "연락처 저장에 실패했어요."); }
    finally { setSaving(false); }
  }

  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <input
          value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          autoFocus disabled={saving} placeholder="010-0000-0000" inputMode="numeric"
          className="w-[128px] rounded-md border px-2 py-1 text-[12px] outline-none"
          style={{ borderColor: "#097fe8", color: "rgba(0,0,0,0.9)" }}
        />
        <button onClick={save} disabled={saving} className="text-[11px] font-bold" style={{ color: "#097fe8" }}>저장</button>
      </span>
    );
  }
  return (
    <button
      onClick={() => { setVal(phone); setEditing(true); }}
      title="내 연락처 (미완료 알림 문자 발송용)"
      className="rounded-full px-2.5 py-[3px] text-[11px] font-semibold whitespace-nowrap cursor-pointer border-none"
      style={{ backgroundColor: phone ? "#f0faf1" : "#fff6e5", color: phone ? "#2a8438" : "#92660a" }}
    >
      {phone ? `📱 ${phone}` : "📱 내 연락처 입력"}
    </button>
  );
}
