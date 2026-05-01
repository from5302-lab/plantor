"use client";

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";

type Template = {
  id: string;
  title: string;
  body: string;
  variables: string[];
};

const SEED: Template[] = [
  {
    id: "directClass_d7",
    title: "1:1 수업 만료 D-7",
    body: "안녕하세요^^\n충쌤입니다,\n\n{childNames} 다음달 학습비 입금 기간입니다\n매달 1일 전까지 익월 학습비 {amount}원을\n아래계좌에 학생이름으로 입금해주세요,\n\n감사합니다.\n\n3333 36 972 5919\n카카오뱅크 이충선",
    variables: ["childNames", "amount", "bankInfo"],
  },
  {
    id: "directClass_d3",
    title: "1:1 수업 만료 D-3",
    body: "안녕하세요^^\n충쌤입니다,\n\n{childNames} 다음달 학습비 입금 기간입니다\n매달 1일 전까지 익월 학습비 {amount}원을\n아래계좌에 학생이름으로 입금해주세요,\n\n감사합니다.\n\n3333 36 972 5919\n카카오뱅크 이충선",
    variables: ["childNames", "amount", "bankInfo"],
  },
  {
    id: "directClass_d0",
    title: "1:1 수업 만료 D-0",
    body: "안녕하세요^^\n충쌤입니다,\n\n{childNames} 다음달 학습비 입금 기간입니다\n매달 1일 전까지 익월 학습비 {amount}원을\n아래계좌에 학생이름으로 입금해주세요,\n\n감사합니다.\n\n3333 36 972 5919\n카카오뱅크 이충선",
    variables: ["childNames", "amount", "bankInfo"],
  },
  {
    id: "subscription_d7",
    title: "구독 만료 D-7",
    body: "[플랜토] {parentName}님, 구독 만료 안내드립니다.\n\n{childNames}의 {serviceNames} 구독이 {endDate}에 만료됩니다.\n\n연장을 원하시면 사이트에 로그인해서\n연장신청을 해주세요.\n\n👉 {siteUrl}\n아이디: {parentId}\n\n감사합니다 🌱",
    variables: ["parentName", "parentId", "childNames", "serviceNames", "endDate", "amount", "bankInfo", "siteUrl"],
  },
  {
    id: "subscription_d3",
    title: "구독 만료 D-3",
    body: "[플랜토] {parentName}님, 구독 만료 안내드립니다.\n\n{childNames}의 {serviceNames} 구독이 {endDate}에 만료됩니다.\n\n연장을 원하시면 사이트에 로그인해서\n연장신청을 해주세요.\n\n👉 {siteUrl}\n아이디: {parentId}\n\n감사합니다 🌱",
    variables: ["parentName", "parentId", "childNames", "serviceNames", "endDate", "amount", "bankInfo", "siteUrl"],
  },
  {
    id: "subscription_d0",
    title: "구독 만료 D-0",
    body: "[플랜토] {parentName}님, 오늘 구독이 만료됩니다.\n\n{childNames}의 {serviceNames} 구독이 오늘({endDate}) 만료됩니다.\n\n연장을 원하시면 사이트에 로그인해서\n연장신청을 해주세요.\n\n👉 {siteUrl}\n아이디: {parentId}\n\n감사합니다 🌱",
    variables: ["parentName", "parentId", "childNames", "serviceNames", "endDate", "amount", "bankInfo", "siteUrl"],
  },
];

export function SmsTemplateTab() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editMap, setEditMap] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<Record<string, string>>({});
  const [seeding, setSeeding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(collection(db, "smsTemplates"), (snap) => {
      const docs = snap.docs.map((d) => ({
        id: d.id,
        title: (d.data().title as string) ?? d.id,
        body: (d.data().body as string) ?? "",
        variables: (d.data().variables as string[]) ?? [],
      }));
      setTemplates(docs);

      if (docs.length === 0 && !seeding) {
        setSeeding(true);
        Promise.all(
          SEED.map((s) =>
            setDoc(doc(db, "smsTemplates", s.id), {
              title: s.title,
              body: s.body,
              variables: s.variables,
              updatedAt: serverTimestamp(),
            })
          )
        ).finally(() => setSeeding(false));
      }
    });
  }, [seeding]);

  function handleEdit(id: string, value: string) {
    setEditMap((prev) => ({ ...prev, [id]: value }));
  }

  async function handleSave(tpl: Template) {
    const body = editMap[tpl.id] ?? tpl.body;
    setSaving(tpl.id);
    try {
      await setDoc(doc(db, "smsTemplates", tpl.id), {
        title: tpl.title,
        body,
        variables: tpl.variables,
        updatedAt: serverTimestamp(),
      });
      setSaved(tpl.id);
      setEditMap((prev) => { const next = { ...prev }; delete next[tpl.id]; return next; });
      setTimeout(() => setSaved(null), 2000);
    } finally {
      setSaving(null);
    }
  }

  async function handleManualSend(e: React.MouseEvent, templateId: string) {
    e.stopPropagation();
    if (!confirm("이 템플릿의 대상자에게 문자를 수동 발송하시겠습니까?")) return;
    setSending(templateId);
    setSendResult((prev) => { const next = { ...prev }; delete next[templateId]; return next; });
    try {
      const fn = httpsCallable<{ templateId: string }, { success: boolean; sent?: number; debug?: string }>(functions, "triggerExpirySms");
      const res = await fn({ templateId });
      const sent = res.data.sent ?? 0;
      setSendResult((prev) => ({ ...prev, [templateId]: sent > 0 ? `${sent}건 발송 완료` : "대상 없음" }));
      setTimeout(() => setSendResult((prev) => { const next = { ...prev }; delete next[templateId]; return next; }), 5000);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? "오류";
      setSendResult((prev) => ({ ...prev, [templateId]: `실패: ${msg}` }));
    } finally {
      setSending(null);
    }
  }

  // 정렬: directClass D-7,3,0 → subscription D-7,3,0
  const sorted = [...templates].sort((a, b) => {
    const order = ["directClass_d7", "directClass_d3", "directClass_d0", "subscription_d7", "subscription_d3", "subscription_d0"];
    return (order.indexOf(a.id) ?? 99) - (order.indexOf(b.id) ?? 99);
  });

  if (seeding) {
    return <p className="text-[14px] text-black/50 text-center py-12">템플릿 초기화 중...</p>;
  }

  return (
    <div className="flex flex-col gap-[1px] rounded-xl overflow-hidden border border-black/10">
      {sorted.map((tpl) => {
        const isOpen = openId === tpl.id;
        const current = editMap[tpl.id] ?? tpl.body;
        const dirty = current !== tpl.body;
        const result = sendResult[tpl.id];
        return (
          <div key={tpl.id} className="bg-white">
            {/* 헤더 행 */}
            <div
              onClick={() => setOpenId(isOpen ? null : tpl.id)}
              className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-black/[0.02] transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-black/30 transition-transform" style={{ display: "inline-block", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
                <span className="text-[13px] font-semibold text-black/80">{tpl.title}</span>
              </div>
              <div className="flex items-center gap-2">
                {result && (
                  <span className={`text-[12px] font-medium ${result.startsWith("실패") ? "text-red-500" : result === "대상 없음" ? "text-black/40" : "text-green-600"}`}>
                    {result}
                  </span>
                )}
                <button
                  onClick={(e) => handleManualSend(e, tpl.id)}
                  disabled={sending === tpl.id}
                  className="rounded-md border border-black/10 cursor-pointer px-3 py-[4px] text-[12px] font-medium bg-white text-black/60 hover:bg-black/[0.03] transition-colors"
                  style={{ opacity: sending === tpl.id ? 0.5 : 1 }}
                >
                  {sending === tpl.id ? "발송 중..." : "수동 발송"}
                </button>
              </div>
            </div>
            {/* 본문 (토글) */}
            {isOpen && (
              <div className="px-5 pb-4">
                <textarea
                  value={current}
                  onChange={(e) => handleEdit(tpl.id, e.target.value)}
                  rows={Math.max(5, current.split("\n").length + 1)}
                  className="w-full rounded-lg border border-black/10 bg-[#fafafa] p-3 text-[13px] leading-relaxed font-mono resize-y outline-none focus:border-[#38a848]/50"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => handleSave(tpl)}
                    disabled={!dirty || saving === tpl.id}
                    className="rounded-md border-none cursor-pointer px-4 py-[6px] text-[13px] font-semibold transition-colors"
                    style={{
                      backgroundColor: dirty ? "#38a848" : "#e5e5e5",
                      color: dirty ? "#fff" : "#aaa",
                      opacity: saving === tpl.id ? 0.6 : 1,
                    }}
                  >
                    {saving === tpl.id ? "저장 중..." : saved === tpl.id ? "저장됨 ✓" : "저장"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {templates.length === 0 && !seeding && (
        <p className="text-[14px] text-black/50 text-center py-12 bg-white">템플릿을 불러오는 중...</p>
      )}
    </div>
  );
}
