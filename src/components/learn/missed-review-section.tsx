"use client";

import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SERVICES } from "@/data/site";
import { ServiceIcon } from "@/components/ui/service-icon";
import { REASONS_6HDL } from "@/lib/types";
import type { Task, TaskCheck } from "@/lib/types";
import { makeupOptions, shortDate } from "./task-checklist";

/** 못한 과제 돌아보기 대상: 최근 7일 과거 날짜에 스케줄됐는데 체크 문서가 없는 과제.
 *  (과제 생성일 이전 날짜는 제외 — 늦게 등록한 과제에 과거 사유를 묻지 않는다) */
export function missedTargets(tasks: Task[], checks: TaskCheck[], today: string): Array<{ task: Task; date: string }> {
  const out: Array<{ task: Task; date: string }> = [];
  for (let n = 7; n >= 1; n--) {
    const d = new Date(today + "T00:00:00");
    d.setDate(d.getDate() - n);
    const date = d.toLocaleDateString("sv-SE");
    const dow = (d.getDay() + 6) % 7; // 0=월
    for (const task of tasks) {
      if (task.active === false || !task.scheduleDays.includes(dow)) continue;
      if (task.createdAt && task.createdAt.toLocaleDateString("sv-SE") > date) continue;
      if (checks.some((c) => c.taskId === task.id && c.date === date)) continue;
      out.push({ task, date });
    }
  }
  return out;
}

/**
 * 못한 과제 돌아보기 — 어제(최근 7일) 못한 과제의 6hdl 사유·만회일을 다음날 입력한다.
 * 입력하면 not_done 체크가 생기고, 만회일이 되면 "만회 과제" 섹션으로 이어진다.
 */
export function MissedReviewSection({ items, childId, today, readOnly = false }: {
  items: Array<{ task: Task; date: string }>; // missedTargets() 결과
  childId: string;
  today: string;
  readOnly?: boolean;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);       // 입력 펼친 항목
  const [reasonSlug, setReasonSlug] = useState<string | null>(null); // 선택한 6hdl 사유
  const [reasonNote, setReasonNote] = useState("");
  const [saving, setSaving] = useState(false);

  if (items.length === 0) return null;

  function openItem(key: string) {
    setOpenKey(key === openKey ? null : key);
    setReasonSlug(null);
    setReasonNote("");
  }

  // 사유 + 만회일을 한 번에 저장 → 만회 과제로 전환
  async function handleSave(task: Task, date: string, makeupDate: string | null) {
    if (readOnly || saving || !reasonSlug) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "taskChecks"), {
        taskId: task.id, childId, date,
        status: "not_done", detail: null,
        reason: reasonSlug, reasonNote: reasonNote.trim() || null,
        makeupDate,
        checkedBy: "student", checkedAt: serverTimestamp(),
      });
      setOpenKey(null);
      setReasonSlug(null);
      setReasonNote("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 실패");
    } finally { setSaving(false); }
  }

  return (
    <>
      <div className="text-[10px] font-bold tracking-[0.1em] text-p-muted uppercase pl-1 mb-1.5 mt-5">못한 과제 돌아보기</div>
      <div className="bg-white border border-black/10 rounded-xl overflow-hidden">
        {items.map(({ task, date }, i) => {
          const key = `${task.id}-${date}`;
          const svc = SERVICES.find((s) => s.slug === task.serviceSlug);
          const part = svc?.parts?.find((p) => p.slug === task.partSlug);
          const label = task.progressLabel ? `${svc?.name ?? task.serviceSlug} ${task.progressLabel}` : part ? part.name : task.title;
          const isOpen = openKey === key;
          return (
            <div key={key} style={{ borderTop: i > 0 ? "1px solid rgba(0,0,0,0.05)" : "none" }}>
              <div className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-[14px] font-semibold text-black/95">
                    {svc && <ServiceIcon service={svc} size={16} />}
                    <span className="truncate">{label}</span>
                  </div>
                  <div className="text-[11px] text-p-secondary mt-0.5">{shortDate(date)} 과제 · 아직 사유가 없어요</div>
                </div>
                {!readOnly && (
                  <button onClick={() => openItem(key)}
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-lg cursor-pointer bg-white text-p-secondary shrink-0"
                    style={{ border: "1px solid rgba(0,0,0,0.12)" }}>
                    {isOpen ? "접기" : "왜 못했지?"}
                  </button>
                )}
              </div>

              {isOpen && (
                <div className="px-5 pb-4">
                  <div className="bg-p-bg rounded-[10px] p-4">
                    <div className="text-[11px] font-bold text-p-muted mb-3 tracking-[0.06em]">왜 못했나요?</div>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {REASONS_6HDL.map((r) => (
                        <button key={r.slug} onClick={() => setReasonSlug(r.slug)}
                          className="flex flex-col items-center gap-1 py-2.5 rounded-lg bg-white cursor-pointer"
                          style={{ border: reasonSlug === r.slug ? "1.5px solid #38a848" : "1px solid rgba(0,0,0,0.1)" }}>
                          <span className="text-lg">{r.icon}</span>
                          <span className="text-[11px] font-semibold text-p-secondary">{r.name}</span>
                        </button>
                      ))}
                    </div>
                    <input value={reasonNote} onChange={(e) => setReasonNote(e.target.value)}
                      placeholder="메모 (선택)"
                      className="w-full h-[32px] rounded-[7px] px-2.5 text-xs text-black/95 bg-white box-border mb-3"
                      style={{ border: "1px solid rgba(0,0,0,0.1)" }} />
                    {/* 만회일 선택 = 저장. 사유를 먼저 골라야 활성화 */}
                    <div className="text-[11px] font-bold text-p-muted mb-1 tracking-[0.06em]">언제 다시 할까?</div>
                    <div className="text-[11px] text-p-secondary mb-2">네가 정한 날에 다시 도전! 그날 학습이 확인되면 만회 완료로 기록돼요.</div>
                    <div className="flex flex-wrap gap-2">
                      {makeupOptions(today).map((opt) => (
                        <button key={opt.label} onClick={() => handleSave(task, date, opt.value)}
                          disabled={!reasonSlug || saving}
                          className="px-3 py-2 rounded-lg bg-white cursor-pointer text-[12px] font-semibold text-p-secondary"
                          style={{ border: "1px solid rgba(0,0,0,0.1)", opacity: !reasonSlug || saving ? 0.45 : 1 }}>
                          {opt.label}{opt.value ? ` (${shortDate(opt.value)})` : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
