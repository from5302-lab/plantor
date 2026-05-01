"use client";

import { useEffect, useState, useCallback } from "react";
import {
  collection, deleteDoc, doc, getDocs, onSnapshot, query,
  serverTimestamp, setDoc, where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { T } from "@/lib/design-tokens";
import type { DirectClass } from "@/lib/types";

type LessonLog = {
  id: string;
  classId: string;
  studentName: string;
  date: string;
  attendance: string;
  checkInTime: string | null;
  content: string;
};

const ATTENDANCE_OPTIONS = ["출석", "결석", "지각", "보강", "조퇴", "온라인 과제"] as const;

const ATT_COLOR: Record<string, { bg: string; text: string }> = {
  "출석":       { bg: "#f0faf1", text: "#1a7f4b" },
  "결석":       { bg: "#fff5f5", text: "#c00000" },
  "지각":       { bg: "#fffbeb", text: "#b45309" },
  "보강":       { bg: "#f5f3ff", text: "#7c3aed" },
  "조퇴":       { bg: "#f6f5f4", text: "#615d59" },
  "온라인 과제": { bg: "#eff6ff", text: "#1d4ed8" },
};

function toKSTDateStr(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

function toKSTTimeStr(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.toISOString().slice(11, 16);
}

/** 24h "HH:mm" → "h:mm AM/PM" */
function to12h(time24: string | null | undefined): string {
  if (!time24) return "";
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  if (isNaN(h)) return "";
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m} ${period}`;
}

/** "h:mm AM/PM" → 24h "HH:mm" */
function to24h(time12: string): string {
  const match = time12.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return "";
  let h = parseInt(match[1], 10);
  const m = match[2];
  const period = match[3].toUpperCase();
  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;
  return `${String(h).padStart(2, "0")}:${m}`;
}

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function getDayName(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+09:00");
  return DAY_NAMES[d.getDay()];
}

function SmsPreviewModal({ phone, text, onClose }: { phone: string; text: string; onClose: () => void }) {
  const [sending, setSending] = useState(false);

  async function handleSend() {
    setSending(true);
    try {
      const fn = httpsCallable<{ phones: string[]; text: string }, { success: boolean }>(functions, "sendBulkSms");
      await fn({ phones: [phone], text });
      alert("문자가 발송됐어요.");
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "발송 실패");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", zIndex: 300 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: "min(420px, 92vw)", backgroundColor: "#fff", borderRadius: 12,
        boxShadow: T.shadowFloat, zIndex: 301, padding: "24px 24px 20px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>📱 문자 미리보기</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "#a39e98", cursor: "pointer", padding: 4 }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: "#615d59", marginBottom: 6 }}>수신: {phone}</div>
        <pre style={{
          whiteSpace: "pre-wrap", wordBreak: "break-word", backgroundColor: "#f6f5f4",
          borderRadius: 8, padding: "12px 14px", fontSize: 13, lineHeight: 1.65,
          color: "rgba(0,0,0,0.85)", margin: "0 0 16px", maxHeight: 320, overflowY: "auto",
        }}>{text}</pre>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="rounded border border-black/10 bg-white px-3.5 py-1.5 text-[13px] font-medium text-p-secondary cursor-pointer">취소</button>
          <button onClick={handleSend} disabled={sending} style={{
            borderRadius: 6, border: "none", backgroundColor: "#38a848", color: "#fff",
            padding: "7px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>
            {sending ? "발송 중…" : "발송"}
          </button>
        </div>
      </div>
    </>
  );
}

export function LessonJournalTab() {
  const [directClasses, setDirectClasses] = useState<DirectClass[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => toKSTDateStr(new Date()));
  const [logs, setLogs] = useState<LessonLog[]>([]);
  const [editingContent, setEditingContent] = useState<Record<string, string>>({});
  const [editingTime, setEditingTime] = useState<Record<string, string>>({});
  const [smsModal, setSmsModal] = useState<{ phone: string; text: string } | null>(null);

  // Load active direct classes
  useEffect(() => {
    return onSnapshot(
      query(collection(db, "directClasses"), where("status", "==", "active")),
      (snap) => {
        const parsed = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name ?? "",
            parentName: data.parentName ?? undefined,
            serviceSlugs: data.serviceSlugs ?? [],
            agencyFee: data.agencyFee ?? 0,
            grades: data.grades ?? [],
            schedule: data.schedule ?? [],
            tuition: data.tuition ?? 0,
            students: data.students ?? [],
            notes: data.notes ?? "",
            status: data.status ?? "active",
            expiry: data.expiry ?? null,
            createdAt: data.createdAt ? data.createdAt.toDate() : null,
          } as DirectClass;
        });
        parsed.sort((a, b) => {
          const ga = a.grades[0] ?? "";
          const gb = b.grades[0] ?? "";
          return ga.localeCompare(gb, "ko") || a.name.localeCompare(b.name, "ko");
        });
        setDirectClasses(parsed);
      }
    );
  }, []);

  // Load lesson logs for selected date
  useEffect(() => {
    return onSnapshot(
      query(collection(db, "lessonLogs"), where("date", "==", selectedDate)),
      (snap) => {
        setLogs(snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            classId: data.classId ?? "",
            studentName: data.studentName ?? "",
            date: data.date ?? "",
            attendance: data.attendance ?? "",
            checkInTime: data.checkInTime ?? null,
            content: data.content ?? "",
          };
        }));
      }
    );
  }, [selectedDate]);

  // Flatten all students from active direct classes
  const allStudents = directClasses.flatMap((cls) =>
    cls.students.map((s) => ({
      classId: cls.id,
      className: cls.name,
      studentName: s.name,
      grade: s.grade ?? cls.grades[0] ?? "",
      parentPhone: s.parentPhone,
    }))
  );

  function getLog(classId: string, studentName: string): LessonLog | undefined {
    return logs.find((l) => l.classId === classId && l.studentName === studentName);
  }

  function logDocId(classId: string, studentName: string): string {
    return `${classId}_${studentName}_${selectedDate}`;
  }

  async function setAttendance(classId: string, studentName: string, attendance: string) {
    const docId = logDocId(classId, studentName);
    const existing = getLog(classId, studentName);
    // 기본값(-)으로 돌리면 시간도 초기화
    const checkInTime = !attendance
      ? null
      : (attendance === "출석" || attendance === "지각" || attendance === "보강") && !existing?.checkInTime
        ? toKSTTimeStr()
        : existing?.checkInTime ?? null;

    if (!attendance) {
      // 기본값 선택 시 문서 삭제
      await deleteDoc(doc(db, "lessonLogs", docId));
      setEditingTime((prev) => { const next = { ...prev }; delete next[`${classId}_${studentName}`]; return next; });
      return;
    }

    await setDoc(doc(db, "lessonLogs", docId), {
      classId, studentName, date: selectedDate,
      attendance,
      checkInTime,
      content: existing?.content ?? "",
      createdAt: serverTimestamp(),
    }, { merge: true });
  }

  async function saveContent(classId: string, studentName: string) {
    const key = `${classId}_${studentName}`;
    const value = editingContent[key];
    if (value === undefined) return;
    const docId = logDocId(classId, studentName);
    const existing = getLog(classId, studentName);
    await setDoc(doc(db, "lessonLogs", docId), {
      classId, studentName, date: selectedDate,
      attendance: existing?.attendance ?? "",
      checkInTime: existing?.checkInTime ?? null,
      content: value,
      createdAt: serverTimestamp(),
    }, { merge: true });
    setEditingContent((prev) => { const next = { ...prev }; delete next[key]; return next; });
  }

  async function saveTime(classId: string, studentName: string) {
    const key = `${classId}_${studentName}`;
    const value = editingTime[key];
    if (value === undefined) return;
    const docId = logDocId(classId, studentName);
    const existing = getLog(classId, studentName);
    await setDoc(doc(db, "lessonLogs", docId), {
      classId, studentName, date: selectedDate,
      attendance: existing?.attendance ?? "",
      checkInTime: value || null,
      content: existing?.content ?? "",
      createdAt: serverTimestamp(),
    }, { merge: true });
    setEditingTime((prev) => { const next = { ...prev }; delete next[key]; return next; });
  }

  function buildAttendanceSms(studentName: string, attendance: string, checkInTime: string | null): string {
    const lines = [
      `안녕하세요^^`,
      `충쌤입니다,`,
      ``,
      `${studentName} ${attendance} 알려드립니다.`,
    ];
    if (checkInTime) lines.push(`출석시간: ${checkInTime}`);
    lines.push(``, `감사합니다.`);
    return lines.join("\n");
  }

  function buildLessonEndSms(studentName: string, content: string): string {
    const lines = [
      `안녕하세요^^`,
      `충쌤입니다,`,
      ``,
      `${studentName} 오늘 수업이 종료되었습니다.`,
    ];
    if (content.trim()) {
      lines.push(``, `[수업 내용]`, content.trim());
    }
    lines.push(``, `감사합니다.`);
    return lines.join("\n");
  }

  function shiftDate(days: number) {
    const d = new Date(selectedDate + "T00:00:00+09:00");
    d.setDate(d.getDate() + days);
    setSelectedDate(toKSTDateStr(d));
  }

  const dayName = getDayName(selectedDate);
  const isToday = selectedDate === toKSTDateStr(new Date());

  const navBtnStyle = {
    background: "none", border: "none", cursor: "pointer",
    fontSize: 18, color: "#615d59", padding: "4px 8px",
  };

  return (
    <>
      {smsModal && <SmsPreviewModal phone={smsModal.phone} text={smsModal.text} onClose={() => setSmsModal(null)} />}

      {/* 날짜 네비게이션 */}
      <div className="bg-white border border-black/10 rounded-xl mb-4 overflow-hidden" style={{ boxShadow: T.shadow }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "12px 16px" }}>
          <button onClick={() => shiftDate(-1)} style={navBtnStyle}>◀</button>
          <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(0,0,0,0.95)" }}>
            {selectedDate.replace(/-/g, ".")} ({dayName})
          </span>
          <button onClick={() => shiftDate(1)} style={navBtnStyle}>▶</button>
          {!isToday && (
            <button
              onClick={() => setSelectedDate(toKSTDateStr(new Date()))}
              style={{ fontSize: 12, fontWeight: 600, color: "#38a848", background: "none", border: "1px solid rgba(56,168,72,0.3)", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}
            >오늘</button>
          )}
        </div>
      </div>

      {/* 출석 테이블 */}
      {allStudents.length === 0 ? (
        <div className="rounded-xl border-[1.5px] border-dashed border-black/[0.12] bg-white py-12 px-6 text-center text-sm text-p-muted">
          활성 직강 학생이 없습니다.
        </div>
      ) : (
        <div className="bg-white border border-black/10 rounded-xl overflow-hidden" style={{ boxShadow: T.shadow }}>
          {/* 헤더 */}
          <div style={{
            display: "grid", gridTemplateColumns: "56px 80px 72px 1fr 88px",
            gap: 8, padding: "10px 14px", borderBottom: "1px solid rgba(0,0,0,0.08)",
            fontSize: 11, fontWeight: 700, color: "#a39e98", letterSpacing: "0.04em",
          }}>
            <span>학생</span>
            <span>출석</span>
            <span>시간</span>
            <span>수업내용</span>
            <span style={{ textAlign: "center" }}>알림</span>
          </div>

          {/* 학생 행 */}
          {allStudents.map((student) => {
            const log = getLog(student.classId, student.studentName);
            const key = `${student.classId}_${student.studentName}`;
            const contentValue = editingContent[key] ?? log?.content ?? "";
            const timeValue = editingTime[key] ?? to12h(log?.checkInTime);
            const attStyle = log?.attendance ? ATT_COLOR[log.attendance] : undefined;

            return (
              <div
                key={key}
                style={{
                  display: "grid", gridTemplateColumns: "56px 80px 72px 1fr 88px",
                  gap: 8, padding: "8px 14px", alignItems: "center",
                  borderBottom: "1px solid rgba(0,0,0,0.05)",
                }}
              >
                {/* 학생 */}
                <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(0,0,0,0.95)" }}>{student.studentName}</span>

                {/* 출석 */}
                <select
                  value={log?.attendance ?? ""}
                  onChange={(e) => setAttendance(student.classId, student.studentName, e.target.value)}
                  style={{
                    fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid rgba(0,0,0,0.1)",
                    padding: "4px 22px 4px 8px", cursor: "pointer", outline: "none",
                    backgroundColor: attStyle?.bg ?? "#fff", color: attStyle?.text ?? "#615d59",
                    appearance: "none" as const,
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23615d59'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center", backgroundSize: "10px 6px",
                  }}
                >
                  <option value="">-</option>
                  {ATTENDANCE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>

                {/* 시간 (편집 가능, 12시간제) */}
                <input
                  value={timeValue}
                  onChange={(e) => setEditingTime((prev) => ({ ...prev, [key]: e.target.value }))}
                  onBlur={() => {
                    const raw = editingTime[key];
                    if (raw === undefined) return;
                    const h24 = to24h(raw);
                    if (h24) {
                      setEditingTime((prev) => { const next = { ...prev }; next[key] = to12h(h24); return next; });
                      const docId = logDocId(student.classId, student.studentName);
                      const existing = getLog(student.classId, student.studentName);
                      setDoc(doc(db, "lessonLogs", docId), {
                        classId: student.classId, studentName: student.studentName, date: selectedDate,
                        attendance: existing?.attendance ?? "", checkInTime: h24,
                        content: existing?.content ?? "", createdAt: serverTimestamp(),
                      }, { merge: true });
                    }
                    setEditingTime((prev) => { const next = { ...prev }; delete next[key]; return next; });
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  style={{
                    fontSize: 11, fontFamily: "monospace", color: "#615d59", textAlign: "center",
                    border: "1px solid rgba(0,0,0,0.08)", borderRadius: 4,
                    padding: "4px 2px", outline: "none", width: "100%", boxSizing: "border-box",
                  }}
                />

                {/* 수업내용 (줄바꿈 지원) */}
                <textarea
                  value={contentValue}
                  onChange={(e) => setEditingContent((prev) => ({ ...prev, [key]: e.target.value }))}
                  onBlur={() => saveContent(student.classId, student.studentName)}
                  rows={1}
                  onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }}
                  style={{
                    fontSize: 13, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6,
                    padding: "5px 8px", outline: "none", color: "rgba(0,0,0,0.9)",
                    width: "100%", boxSizing: "border-box", resize: "none", overflow: "hidden",
                    lineHeight: 1.5, fontFamily: "inherit",
                  }}
                />

                {/* 액션 버튼 */}
                <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                  <button
                    title="출결알림"
                    disabled={!log?.attendance}
                    onClick={() => {
                      if (!log?.attendance || !student.parentPhone) return;
                      setSmsModal({
                        phone: student.parentPhone,
                        text: buildAttendanceSms(student.studentName, log.attendance, log.checkInTime),
                      });
                    }}
                    style={{
                      fontSize: 11, fontWeight: 600, borderRadius: 5,
                      border: "1px solid rgba(0,0,0,0.1)", backgroundColor: log?.attendance ? "#eff6ff" : "#f6f5f4",
                      color: log?.attendance ? "#1d4ed8" : "#a39e98",
                      padding: "4px 8px", cursor: log?.attendance ? "pointer" : "default",
                    }}
                  >출결</button>
                  <button
                    title="수업종료"
                    onClick={() => {
                      if (!student.parentPhone) return;
                      setSmsModal({
                        phone: student.parentPhone,
                        text: buildLessonEndSms(student.studentName, log?.content ?? ""),
                      });
                    }}
                    style={{
                      fontSize: 11, fontWeight: 600, borderRadius: 5,
                      border: "1px solid rgba(0,0,0,0.1)", backgroundColor: "#fff5f5",
                      color: "#c00000", padding: "4px 8px", cursor: "pointer",
                    }}
                  >종료</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
