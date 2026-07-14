"use client";

import { useState } from "react";
import { addDoc, collection, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { ChevronDown } from "lucide-react";
import { SERVICES } from "@/data/site";
import { ServiceIcon } from "@/components/ui/service-icon";
import { REASONS_6HDL } from "@/lib/types";
import type { Task, TaskCheck } from "@/lib/types";
import { makeupOptions, shortDate } from "./task-checklist";

// 클릭 시 교사 계정으로 진도를 실시간 스크래핑하는 서비스 (task-checklist와 동일)
const AUTO_VERIFIED_SLUGS = new Set(["autovoca", "classcard-middle", "dailykor", "class5"]);

// 다시 도전 항목: 사유 미입력(check null) 또는 만회 계획됨(not_done)
export type RetryItem = { task: Task; date: string; check: TaskCheck | null };

/** 최근 7일 과거 날짜 중 (a) 체크 없이 지나간 과제 + (b) not_done(만회 계획) 과제. 최신 날짜 먼저. */
export function retryTargets(tasks: Task[], checks: TaskCheck[], today: string): RetryItem[] {
  const out: RetryItem[] = [];
  for (let n = 1; n <= 7; n++) {
    const d = new Date(today + "T00:00:00");
    d.setDate(d.getDate() - n);
    const date = d.toLocaleDateString("sv-SE");
    const dow = (d.getDay() + 6) % 7; // 0=월
    for (const task of tasks) {
      if (task.active === false || !task.scheduleDays.includes(dow)) continue;
      if (task.createdAt && task.createdAt.toLocaleDateString("sv-SE") > date) continue;
      const check = checks.find((c) => c.taskId === task.id && c.date === date);
      if (!check) out.push({ task, date, check: null });                    // 사유 미입력
      else if (check.status === "not_done") out.push({ task, date, check }); // 만회 계획됨
      // done/made_up은 제외
    }
  }
  return out;
}

/**
 * 다시 도전 — 못한 과제를 한 곳에서 해결한다.
 * 사유 미입력 → [왜 못했지?] 6hdl+만회일 입력 → 계획됨 → [했어요!] 실제 학습 확인 시 만회 완료.
 * 어제 것만 기본 펼침, 그 이전은 접힘.
 */
export function RetrySection({ items, childId, today, readOnly = false }: {
  items: RetryItem[];  // retryTargets() 결과
  childId: string;
  today: string;
  readOnly?: boolean;
}) {
  const [showOlder, setShowOlder] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);       // 6hdl 입력 펼친 항목
  const [planKey, setPlanKey] = useState<string | null>(null);       // 만회일 재계획 펼친 항목
  const [reasonSlug, setReasonSlug] = useState<string | null>(null);
  const [reasonNote, setReasonNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  const yesterday = (() => { const d = new Date(today + "T00:00:00"); d.setDate(d.getDate() - 1); return d.toLocaleDateString("sv-SE"); })();
  const recent = items.filter((i) => i.date === yesterday);
  const older = items.filter((i) => i.date !== yesterday);

  if (items.length === 0) return null;

  function toggleReasonForm(key: string) {
    setOpenKey(key === openKey ? null : key);
    setPlanKey(null);
    setReasonSlug(null);
    setReasonNote("");
  }

  // 사유 + 만회일 한 번에 저장 → 같은 행이 "계획됨"으로 바뀐다
  async function handleSaveReason(item: RetryItem, makeupDate: string | null) {
    if (readOnly || busy || !reasonSlug) return;
    setBusy(itemKey(item));
    try {
      await addDoc(collection(db, "taskChecks"), {
        taskId: item.task.id, childId, date: item.date,
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
    } finally { setBusy(null); }
  }

  // 했어요! — 자동인증 과목은 실제 스크랩 확인 시 서버가 made_up 처리, 수동 과목은 즉시 made_up
  async function handleComplete(item: RetryItem) {
    if (readOnly || busy || !item.check) return;
    const key = itemKey(item);
    setBusy(key);
    setMsg((p) => ({ ...p, [key]: "" }));
    try {
      if (AUTO_VERIFIED_SLUGS.has(item.task.serviceSlug)) {
        const call = httpsCallable(functions, "verifyAutoProgress");
        const res = await call({ serviceSlug: item.task.serviceSlug });
        const status = (res.data as { autoStatus?: string })?.autoStatus;
        if (status !== "완료") {
          setMsg((p) => ({ ...p, [key]: `아직 완료로 확인되지 않았어요 (${status ?? "미확인"}) · 학습을 마친 뒤 다시 눌러 주세요` }));
        }
      } else {
        await updateDoc(doc(db, "taskChecks", item.check.id), { status: "made_up", madeUpAt: serverTimestamp() });
      }
    } catch (e) {
      setMsg((p) => ({ ...p, [key]: e instanceof Error ? e.message : "인증 실패" }));
    } finally { setBusy(null); }
  }

  async function handleReplan(item: RetryItem, makeupDate: string | null) {
    if (readOnly || !item.check) return;
    await updateDoc(doc(db, "taskChecks", item.check.id), { makeupDate }).catch(() => undefined);
    setPlanKey(null);
  }

  function itemKey(item: RetryItem) { return `${item.task.id}-${item.date}`; }

  function renderRow(item: RetryItem, i: number, dateLabel: boolean) {
    const key = itemKey(item);
    const { task, date, check } = item;
    const svc = SERVICES.find((s) => s.slug === task.serviceSlug);
    const part = svc?.parts?.find((p) => p.slug === task.partSlug);
    const label = task.progressLabel ? `${svc?.name ?? task.serviceSlug} ${task.progressLabel}` : part ? part.name : task.title;
    const reasonInfo = check?.reason ? REASONS_6HDL.find((r) => r.slug === check.reason) : null;
    const overdue = check?.makeupDate != null && check.makeupDate < today;

    return (
      <div key={key} style={{ borderTop: i > 0 ? "1px solid rgba(0,0,0,0.05)" : "none" }}>
        <div className="flex items-center gap-3 px-5 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[14px] font-semibold text-black/95">
              {svc && <ServiceIcon service={svc} size={16} />}
              <span className="truncate">{label}</span>
            </div>
            <div className="text-[11px] text-p-secondary mt-0.5">
              {dateLabel && <>{shortDate(date)} 과제 · </>}
              {check == null
                ? "아직 사유가 없어요"
                : (<>
                    {reasonInfo && <>{reasonInfo.icon} {reasonInfo.name} · </>}
                    {/* 만회일 — 탭하면 재계획 */}
                    <button onClick={() => !readOnly && setPlanKey(planKey === key ? null : key)}
                      className="bg-transparent border-none p-0 text-[11px] font-semibold cursor-pointer underline decoration-dotted underline-offset-2"
                      style={{ color: overdue ? "#c00000" : "#615d59" }}>
                      {check.makeupDate == null ? "🔁 만회일 정하기" : overdue ? `🔁 ${shortDate(check.makeupDate)} 밀림` : `🔁 ${shortDate(check.makeupDate)} 예정`}
                    </button>
                  </>)}
            </div>
            {msg[key] && <div className="text-[11px] font-medium mt-0.5" style={{ color: "#92660a" }}>{msg[key]}</div>}
          </div>
          {!readOnly && (
            check == null ? (
              <button onClick={() => toggleReasonForm(key)}
                className="text-[12px] font-semibold px-3 py-1.5 rounded-lg cursor-pointer bg-white text-p-secondary shrink-0"
                style={{ border: "1px solid rgba(0,0,0,0.12)" }}>
                {openKey === key ? "접기" : "왜 못했지?"}
              </button>
            ) : (
              <button onClick={() => handleComplete(item)} disabled={busy === key}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer border-none text-white shrink-0"
                style={{ backgroundColor: "#38a848", opacity: busy === key ? 0.5 : 1 }}>
                {busy === key ? "인증 중…" : "했어요!"}
              </button>
            )
          )}
        </div>

        {/* 6hdl 사유 + 만회일 입력 (사유 미입력 항목) */}
        {openKey === key && check == null && (
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
              <div className="text-[11px] font-bold text-p-muted mb-1 tracking-[0.06em]">언제 다시 할까?</div>
              <div className="text-[11px] text-p-secondary mb-2">네가 정한 날에 다시 도전! 그날 학습이 확인되면 만회 완료로 기록돼요.</div>
              <div className="flex flex-wrap gap-2">
                {makeupOptions(today).map((opt) => (
                  <button key={opt.label} onClick={() => handleSaveReason(item, opt.value)}
                    disabled={!reasonSlug || busy === key}
                    className="px-3 py-2 rounded-lg bg-white cursor-pointer text-[12px] font-semibold text-p-secondary"
                    style={{ border: "1px solid rgba(0,0,0,0.1)", opacity: !reasonSlug || busy === key ? 0.45 : 1 }}>
                    {opt.label}{opt.value ? ` (${shortDate(opt.value)})` : ""}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 만회일 재계획 (계획됨 항목) */}
        {planKey === key && check != null && (
          <div className="px-5 pb-3 flex flex-wrap gap-2">
            {makeupOptions(today).map((opt) => (
              <button key={opt.label} onClick={() => handleReplan(item, opt.value)}
                className="px-3 py-1.5 rounded-lg border border-black/10 bg-p-bg cursor-pointer text-[12px] font-semibold text-p-secondary">
                {opt.label}{opt.value ? ` (${shortDate(opt.value)})` : ""}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="text-[10px] font-bold tracking-[0.1em] text-p-muted uppercase pl-1 mb-1.5 mt-5">
        다시 도전 <span className="text-p-muted/70">({items.length})</span>
      </div>
      <div className="bg-white border border-black/10 rounded-xl overflow-hidden">
        {/* 어제 — 기본 펼침 */}
        {recent.length > 0 && (
          <>
            <div className="px-5 pt-3 pb-1 text-[11px] font-semibold text-p-muted">어제 ({shortDate(yesterday)})</div>
            {recent.map((item, i) => renderRow(item, i, false))}
          </>
        )}
        {/* 그 이전 — 접힘 */}
        {older.length > 0 && (
          <>
            <div onClick={() => setShowOlder((v) => !v)}
              className="flex items-center justify-center gap-1 py-2 cursor-pointer select-none"
              style={{ borderTop: recent.length > 0 ? "1px solid rgba(0,0,0,0.05)" : "none" }}>
              <span className="text-[11px] text-p-muted font-semibold">
                이전 못한 과제 {older.length}건 ({shortDate(older[older.length - 1].date)}~{shortDate(older[0].date)})
              </span>
              <ChevronDown size={12} className="text-p-muted" style={{ transform: showOlder ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
            </div>
            {showOlder && older.map((item, i) => renderRow(item, i, true))}
          </>
        )}
      </div>
    </>
  );
}
