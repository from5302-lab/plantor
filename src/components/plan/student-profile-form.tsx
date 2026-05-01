"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { T } from "@/lib/design-tokens";
import { Card } from "@/components/ui/card";
import { SERVICES } from "@/data/site";
import type { StudentProfile, StudyLevel, DaySchedule } from "@/lib/types";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const GOAL_OPTIONS = ["국어 강화", "영어 어휘", "독해력", "수학 개념", "받아쓰기", "문법", "연산"];
const MINUTES_OPTIONS = [30, 60, 90, 120] as const;
const SIGNUP_SERVICES = SERVICES.filter((s) => s.category === "subscription" || s.category === "premium");

const SVG_ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23615d59'/%3E%3C/svg%3E")`;
const selectStyle: React.CSSProperties = {
  height: 36, borderRadius: 8, border: T.border,
  padding: "0 32px 0 10px", fontSize: 13,
  color: T.textPrimary, backgroundColor: T.white,
  backgroundImage: SVG_ARROW, backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center", backgroundSize: "10px 6px",
  WebkitAppearance: "none", MozAppearance: "none", appearance: "none",
  outline: "none", cursor: "pointer",
};

function tsToDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === "object" && "toDate" in (ts as object)) return (ts as { toDate: () => Date }).toDate();
  return null;
}

export function StudentProfileForm({ childId, onClose }: { childId: string; onClose: () => void }) {
  const [goals, setGoals] = useState<string[]>([]);
  const [level, setLevel] = useState<StudyLevel>("중");
  const [availableDays, setAvailableDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [dailyMinutes, setDailyMinutes] = useState<number>(30);
  const [notes, setNotes] = useState("");
  const [schedule, setSchedule] = useState<DaySchedule[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDoc(doc(db, "studentProfiles", childId)).then((snap) => {
      if (snap.exists()) {
        const d = snap.data() as Omit<StudentProfile, "childId" | "updatedAt"> & { updatedAt: unknown };
        setGoals(d.goals ?? []);
        setLevel(d.level ?? "중");
        setAvailableDays(d.availableDays ?? [0, 1, 2, 3, 4]);
        setDailyMinutes(d.dailyMinutes ?? 30);
        setNotes(d.notes ?? "");
        setSchedule(d.schedule ?? []);
      }
      setLoading(false);
    });
  }, [childId]);

  function toggleGoal(g: string) {
    setGoals(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  }
  function toggleDay(d: number) {
    setAvailableDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());
  }
  function toggleScheduleDay(d: number) {
    setSchedule(prev => {
      if (prev.some(s => s.day === d)) return prev.filter(s => s.day !== d);
      return [...prev, { day: d, time: "" }].sort((a, b) => a.day - b.day);
    });
  }
  function addScheduleEntry(d: number) { setSchedule(prev => [...prev, { day: d, time: "" }]); }
  function removeScheduleEntry(idx: number) { setSchedule(prev => prev.filter((_, i) => i !== idx)); }
  function copyScheduleEntry(idx: number) {
    setSchedule(prev => [...prev.slice(0, idx + 1), { ...prev[idx] }, ...prev.slice(idx + 1)]);
  }
  function updateScheduleEntry(idx: number, field: keyof DaySchedule, val: string) {
    setSchedule(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val || undefined } : s));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await setDoc(doc(db, "studentProfiles", childId), {
        childId, goals, level, availableDays, dailyMinutes, notes, schedule,
        updatedAt: serverTimestamp(),
      });
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 1000);
    } finally { setSaving(false); }
  }

  if (loading) return (
    <div className="py-6 text-center text-p-muted text-[13px]">로딩 중…</div>
  );

  return (
    <Card style={{ padding: "20px 20px", marginBottom: 20 }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[11px] font-bold text-p-muted tracking-[0.1em] mb-0.5">PROFILE</div>
          <div className="text-[15px] font-bold text-black/95">나의 학습 프로필</div>
        </div>
        <button onClick={onClose} className="bg-transparent border-none cursor-pointer text-base text-p-muted px-1.5 py-1 opacity-60">✕</button>
      </div>

      <div className="flex flex-col gap-4">
        {/* 목표 */}
        <div>
          <div className="text-[11px] font-bold text-p-muted tracking-[0.06em] mb-2">학습 목표 (복수 선택)</div>
          <div className="flex flex-wrap gap-1.5">
            {GOAL_OPTIONS.map(g => (
              <button key={g} onClick={() => toggleGoal(g)} type="button"
                className="h-[30px] px-3 rounded-full text-xs font-semibold cursor-pointer"
                style={{
                  border: goals.includes(g) ? "1.5px solid #38a848" : T.border,
                  backgroundColor: goals.includes(g) ? "#eff6ff" : "#ffffff",
                  color: goals.includes(g) ? "#38a848" : "#615d59",
                }}>
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* 수준 + 일일 시간 */}
        <div className="flex gap-3">
          <div className="flex-1">
            <div className="text-[11px] font-bold text-p-muted tracking-[0.06em] mb-2">현재 수준</div>
            <div className="flex gap-1.5">
              {(["상", "중", "하"] as StudyLevel[]).map(lv => (
                <button key={lv} onClick={() => setLevel(lv)} type="button"
                  className="flex-1 h-[34px] rounded-lg text-[13px] font-bold cursor-pointer"
                  style={{
                    border: level === lv ? "1.5px solid #38a848" : T.border,
                    backgroundColor: level === lv ? "#eff6ff" : "#ffffff",
                    color: level === lv ? "#38a848" : "#a39e98",
                  }}>
                  {lv}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-bold text-p-muted tracking-[0.06em] mb-2">하루 학습 시간</div>
            <select value={dailyMinutes} onChange={e => setDailyMinutes(Number(e.target.value))} style={{ ...selectStyle, width: "100%" }}>
              {MINUTES_OPTIONS.map(m => (
                <option key={m} value={m}>{m}분</option>
              ))}
            </select>
          </div>
        </div>

        {/* 가능 요일 */}
        <div>
          <div className="text-[11px] font-bold text-p-muted tracking-[0.06em] mb-2">학습 가능 요일</div>
          <div className="flex gap-1">
            {DAY_LABELS.map((label, i) => (
              <button key={i} onClick={() => toggleDay(i)} type="button"
                className="flex-1 h-[34px] rounded-lg text-xs font-bold cursor-pointer"
                style={{
                  border: availableDays.includes(i) ? "1.5px solid #38a848" : T.border,
                  backgroundColor: availableDays.includes(i) ? "#38a848" : "transparent",
                  color: availableDays.includes(i) ? "#ffffff" : "#a39e98",
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 학습 시간 */}
        <div>
          <div className="text-[11px] font-bold text-p-muted tracking-[0.06em] mb-2">학습 시간 (요일별)</div>
          <div className="flex gap-1 mb-2.5">
            {DAY_LABELS.map((label, i) => {
              const sel = schedule.some(s => s.day === i);
              return (
                <button key={i} onClick={() => toggleScheduleDay(i)} type="button"
                  className="flex-1 h-[34px] rounded-lg text-xs font-bold cursor-pointer"
                  style={{
                    border: sel ? "1.5px solid #38a848" : T.border,
                    backgroundColor: sel ? "#38a848" : "transparent",
                    color: sel ? "#ffffff" : "#a39e98",
                  }}>
                  {label}
                </button>
              );
            })}
          </div>
          {schedule.length > 0 && (
            <div className="flex flex-col gap-3">
              {DAY_LABELS.map((label, dayIdx) => {
                const entries = schedule.map((s, i) => ({ ...s, idx: i })).filter(s => s.day === dayIdx);
                if (entries.length === 0) return null;
                return (
                  <div key={dayIdx}>
                    <div className="text-[11px] font-bold text-p-muted mb-1.5">{label}요일</div>
                    <div className="flex flex-col gap-1.5">
                      {entries.map(({ idx, time, serviceSlug }) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <select
                            value={serviceSlug ?? ""}
                            onChange={e => updateScheduleEntry(idx, "serviceSlug", e.target.value)}
                            className="flex-1 min-w-0"
                            style={{ height: 36, borderRadius: 8, border: T.border, padding: "0 28px 0 8px", fontSize: 12, color: T.textPrimary, backgroundColor: T.white, backgroundImage: SVG_ARROW, backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", backgroundSize: "10px 6px", WebkitAppearance: "none", MozAppearance: "none", appearance: "none", outline: "none", cursor: "pointer" }}
                          >
                            <option value="">서비스 선택</option>
                            {SIGNUP_SERVICES.map(svc => (
                              <option key={svc.slug} value={svc.slug}>{svc.name}</option>
                            ))}
                          </select>
                          <input
                            type="time"
                            value={time}
                            onChange={e => updateScheduleEntry(idx, "time", e.target.value)}
                            className="h-[36px] rounded-lg text-[13px] text-black/95 bg-white outline-none w-[110px]"
                            style={{ border: T.border, padding: "0 8px" }}
                          />
                          <button onClick={() => copyScheduleEntry(idx)} type="button" title="복사"
                            className="h-[30px] w-[30px] rounded-md border border-black/10 bg-white cursor-pointer text-[13px] text-p-muted flex items-center justify-center shrink-0">⎘</button>
                          <button onClick={() => removeScheduleEntry(idx)} type="button" title="삭제"
                            className="h-[30px] w-[30px] rounded-md border-none bg-transparent cursor-pointer text-base text-p-muted flex items-center justify-center shrink-0">×</button>
                        </div>
                      ))}
                      <button onClick={() => addScheduleEntry(dayIdx)} type="button"
                        className="h-[28px] rounded-md text-[11px] font-semibold cursor-pointer mt-0.5 bg-transparent"
                        style={{ border: "1px dashed #38a848", color: "#38a848" }}>
                        + 추가
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 특이사항 */}
        <div>
          <div className="text-[11px] font-bold text-p-muted tracking-[0.06em] mb-2">특이사항 / 선생님께 한마디</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="예: 받아쓰기를 특히 힘들어해요. 수학은 곱셈까지 완료했어요."
            rows={3}
            className="w-full rounded-lg px-3 py-2.5 text-[13px] text-black/95 resize-y box-border font-[inherit] leading-relaxed outline-none"
            style={{ border: T.border }}
          />
        </div>

        <button onClick={handleSave} disabled={saving}
          className="h-[42px] rounded-[10px] border-none text-white text-sm font-bold cursor-pointer transition-colors"
          style={{ backgroundColor: saved ? "#38a848" : "#38a848", opacity: saving ? 0.7 : 1 }}>
          {saving ? "저장 중…" : saved ? "✓ 저장됨" : "저장하기"}
        </button>
      </div>
    </Card>
  );
}

// 관리자가 특정 학생의 프로필 요약을 볼 때 사용
export function ProfileSummaryBadge({ childId }: { childId: string }) {
  const [profile, setProfile] = useState<StudentProfile | null>(null);

  useEffect(() => {
    getDoc(doc(db, "studentProfiles", childId)).then((snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setProfile({
          childId,
          goals: d.goals ?? [],
          level: d.level ?? "중",
          availableDays: d.availableDays ?? [],
          dailyMinutes: d.dailyMinutes ?? 30,
          notes: d.notes ?? "",
          updatedAt: tsToDate(d.updatedAt),
        });
      }
    });
  }, [childId]);

  if (!profile) return (
    <span className="text-[10px] text-p-muted rounded-full px-[7px] py-0.5 border border-dashed border-black/20">
      프로필 없음
    </span>
  );

  return (
    <span className="text-[10px] text-p-secondary rounded-full px-[7px] py-0.5 bg-p-bg">
      Lv.{profile.level} · {profile.dailyMinutes}분 · {profile.availableDays.length}일
    </span>
  );
}
