"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  collection, deleteDoc, doc, getDocs, onSnapshot, query,
  serverTimestamp, setDoc, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { T } from "@/lib/design-tokens";
import { useSendToast } from "@/lib/send-toast";
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

/** 학년 문자열을 숫자로 변환 (초1=1 … 초6=6, 중1=7 … 중3=9, 고1=10 … 고3=12) */
function gradeToNum(g: string): number {
  const m = g.match(/^(초|중|고)(\d)$/);
  if (!m) return 99;
  const base = m[1] === "초" ? 0 : m[1] === "중" ? 6 : 9;
  return base + parseInt(m[2], 10);
}

function buildAttendanceSms(studentName: string, attendance: string, checkInTime: string | null, date: string): string {
  const lines = [`[플랜토 출석안내]`, ``, `안녕하세요, ${studentName} 학생의 수업이 시작되어 알려드립니다.`];
  if (checkInTime) {
    const converted = to12h(checkInTime).replace(/\s*AM/, " am").replace(/\s*PM/, " pm");
    if (converted) lines.push(``, `■ 출석일시: ${date.replace(/-/g, ".")} ${converted}`);
  }
  lines.push(``, `감사합니다.`);
  return lines.join("\n");
}

function buildLessonEndSms(studentName: string, content: string): string {
  const lines = [`안녕하세요^^`, `충쌤입니다,`, ``, `${studentName} 오늘 수업이 종료되었습니다.`];
  if (content.trim()) lines.push(``, `[수업내용]`, content.trim());
  lines.push(``, `감사합니다.`);
  return lines.join("\n");
}

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function getDayName(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+09:00");
  return DAY_NAMES[d.getDay()];
}

function SmsPreviewModal({ phone, text, label, onClose }: { phone: string; text: string; label: string; onClose: () => void }) {
  const [editableText, setEditableText] = useState(text);
  const { startSend } = useSendToast();

  function handleSend() {
    startSend({ label, phones: [phone], text: editableText });
    onClose();
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
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>💬 카톡 미리보기</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "#a39e98", cursor: "pointer", padding: 4 }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: "#615d59", marginBottom: 6 }}>수신: {phone}</div>
        <textarea
          value={editableText}
          onChange={(e) => setEditableText(e.target.value)}
          style={{
            width: "100%", backgroundColor: "#f6f5f4",
            borderRadius: 8, padding: "12px 14px", fontSize: 13, lineHeight: 1.65,
            color: "rgba(0,0,0,0.85)", margin: "0 0 16px", maxHeight: 320, minHeight: 160,
            border: "1px solid rgba(0,0,0,0.1)", outline: "none", resize: "vertical",
            fontFamily: "inherit",
          }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="rounded border border-black/10 bg-white px-3.5 py-1.5 text-[13px] font-medium text-p-secondary cursor-pointer">취소</button>
          <button onClick={handleSend} style={{
            borderRadius: 6, border: "none", backgroundColor: "#38a848", color: "#fff",
            padding: "7px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>
            발송
          </button>
        </div>
      </div>
    </>
  );
}

function StudentHistoryModal({
  classId, studentName, parentPhone, onClose, onSmsRequest,
}: {
  classId: string; studentName: string; parentPhone: string;
  onClose: () => void;
  onSmsRequest: (phone: string, text: string, label: string) => void;
}) {
  const [historyLogs, setHistoryLogs] = useState<LessonLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingContent, setEditingContent] = useState<Record<string, string>>({});
  const [editingTime, setEditingTime] = useState<Record<string, string>>({});

  useEffect(() => {
    getDocs(
      query(
        collection(db, "lessonLogs"),
        where("classId", "==", classId),
        where("studentName", "==", studentName),
      )
    ).then((snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          classId: data.classId ?? "",
          studentName: data.studentName ?? "",
          date: data.date ?? "",
          attendance: data.attendance ?? "",
          checkInTime: data.checkInTime ?? null,
          content: data.content ?? "",
        } as LessonLog;
      });
      items.sort((a, b) => b.date.localeCompare(a.date));
      setHistoryLogs(items);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [classId, studentName]);

  function updateLog(date: string, patch: Partial<LessonLog>) {
    setHistoryLogs((prev) => prev.map((l) => l.date === date ? { ...l, ...patch } : l));
  }

  async function saveAttendance(log: LessonLog, attendance: string) {
    const docId = `${classId}_${studentName}_${log.date}`;
    if (!attendance) {
      await deleteDoc(doc(db, "lessonLogs", docId));
      setHistoryLogs((prev) => prev.filter((l) => l.date !== log.date));
      return;
    }
    const checkInTime = (attendance === "출석" || attendance === "지각" || attendance === "보강") && !log.checkInTime
      ? toKSTTimeStr() : log.checkInTime;
    await setDoc(doc(db, "lessonLogs", docId), {
      classId, studentName, date: log.date, attendance, checkInTime,
      content: log.content, createdAt: serverTimestamp(),
    }, { merge: true });
    updateLog(log.date, { attendance, checkInTime });
  }

  async function saveContent(log: LessonLog) {
    const key = log.date;
    const value = editingContent[key];
    if (value === undefined) return;
    const docId = `${classId}_${studentName}_${log.date}`;
    await setDoc(doc(db, "lessonLogs", docId), {
      classId, studentName, date: log.date, attendance: log.attendance,
      checkInTime: log.checkInTime, content: value, createdAt: serverTimestamp(),
    }, { merge: true });
    updateLog(log.date, { content: value });
    setEditingContent((prev) => { const next = { ...prev }; delete next[key]; return next; });
  }

  async function saveTime(log: LessonLog) {
    const key = log.date;
    const raw = editingTime[key];
    if (raw === undefined) return;
    const h24 = to24h(raw);
    if (h24) {
      const docId = `${classId}_${studentName}_${log.date}`;
      await setDoc(doc(db, "lessonLogs", docId), {
        classId, studentName, date: log.date, attendance: log.attendance,
        checkInTime: h24, content: log.content, createdAt: serverTimestamp(),
      }, { merge: true });
      updateLog(log.date, { checkInTime: h24 });
    }
    setEditingTime((prev) => { const next = { ...prev }; delete next[key]; return next; });
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", zIndex: 300 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: "min(560px, 94vw)", maxHeight: "85vh", backgroundColor: "#fff", borderRadius: 12,
        boxShadow: T.shadowFloat, zIndex: 301, display: "flex", flexDirection: "column",
      }}>
        {/* 헤더 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px 16px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "rgba(0,0,0,0.95)" }}>{studentName} 수업일지</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "#a39e98", cursor: "pointer", padding: 4 }}>✕</button>
        </div>

        {/* 목록 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 24px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#a39e98", fontSize: 13 }}>불러오는 중...</div>
          ) : historyLogs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#a39e98", fontSize: 13 }}>수업 기록이 없습니다.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {historyLogs.map((log) => {
                const attStyle = log.attendance ? ATT_COLOR[log.attendance] : undefined;
                const dayName = getDayName(log.date);
                const contentValue = editingContent[log.date] ?? log.content;
                const timeValue = editingTime[log.date] ?? to12h(log.checkInTime);

                return (
                  <div key={log.id} style={{
                    border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "12px 14px",
                  }}>
                    {/* 날짜 + 출석 + 시간 + 알림버튼 */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.95)", marginRight: 2 }}>
                        {log.date.replace(/-/g, ".")} ({dayName})
                      </span>
                      <select
                        value={log.attendance}
                        onChange={(e) => saveAttendance(log, e.target.value)}
                        style={{
                          fontSize: 11, fontWeight: 600, borderRadius: 6, border: "1px solid rgba(0,0,0,0.1)",
                          padding: "3px 20px 3px 6px", cursor: "pointer", outline: "none", height: 26,
                          backgroundColor: attStyle?.bg ?? "#fff", color: attStyle?.text ?? "#615d59",
                          appearance: "none" as const,
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23615d59'/%3E%3C/svg%3E")`,
                          backgroundRepeat: "no-repeat", backgroundPosition: "right 5px center", backgroundSize: "8px 5px",
                        }}
                      >
                        <option value="">-</option>
                        {ATTENDANCE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                      <input
                        value={timeValue}
                        onChange={(e) => setEditingTime((prev) => ({ ...prev, [log.date]: e.target.value }))}
                        onBlur={() => saveTime(log)}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        style={{
                          fontSize: 11, fontFamily: "monospace", color: "#615d59", textAlign: "center",
                          border: "1px solid rgba(0,0,0,0.08)", borderRadius: 4,
                          padding: "3px 2px", outline: "none", width: 72, height: 26, boxSizing: "border-box",
                        }}
                      />
                      <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                        <button
                          disabled={!log.attendance}
                          onClick={() => {
                            if (!log.attendance || !parentPhone) return;
                            onSmsRequest(parentPhone, buildAttendanceSms(studentName, log.attendance, log.checkInTime, log.date), `${studentName} 출결알림`);
                          }}
                          style={{
                            fontSize: 10, fontWeight: 600, borderRadius: 5,
                            border: "1px solid rgba(0,0,0,0.1)", backgroundColor: log.attendance ? "#eff6ff" : "#f6f5f4",
                            color: log.attendance ? "#1d4ed8" : "#a39e98",
                            padding: "3px 7px", cursor: log.attendance ? "pointer" : "default", height: 26,
                          }}
                        >출결</button>
                        <button
                          onClick={() => {
                            if (!parentPhone) return;
                            onSmsRequest(parentPhone, buildLessonEndSms(studentName, log.content), `${studentName} 수업종료`);
                          }}
                          style={{
                            fontSize: 10, fontWeight: 600, borderRadius: 5,
                            border: "1px solid rgba(0,0,0,0.1)", backgroundColor: "#fff5f5",
                            color: "#c00000", padding: "3px 7px", cursor: "pointer", height: 26,
                          }}
                        >종료</button>
                      </div>
                    </div>
                    {/* 수업내용 */}
                    <textarea
                      ref={(t) => { if (t) { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; } }}
                      value={contentValue}
                      onChange={(e) => setEditingContent((prev) => ({ ...prev, [log.date]: e.target.value }))}
                      onBlur={() => saveContent(log)}
                      rows={1}
                      onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }}
                      style={{
                        fontSize: 13, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6,
                        padding: "6px 8px", outline: "none", color: "rgba(0,0,0,0.9)",
                        width: "100%", boxSizing: "border-box", resize: "none", overflow: "hidden",
                        lineHeight: 1.5, fontFamily: "inherit", minHeight: 30,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
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
  const [smsModal, setSmsModal] = useState<{ phone: string; text: string; label: string } | null>(null);
  const [historyStudent, setHistoryStudent] = useState<{ classId: string; studentName: string; parentPhone: string } | null>(null);
  const isMobile = useMediaQuery("(max-width: 768px)");

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

  const allStudents = useMemo(() =>
    directClasses.flatMap((cls) =>
      cls.students.map((s) => ({
        classId: cls.id,
        className: cls.name,
        studentName: s.name,
        grade: s.grade ?? cls.grades[0] ?? "",
        parentPhone: s.parentPhone,
      }))
    ).sort((a, b) => gradeToNum(a.grade) - gradeToNum(b.grade) || a.studentName.localeCompare(b.studentName, "ko")),
    [directClasses],
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

  function handleTimeBlur(classId: string, studentName: string) {
    const key = `${classId}_${studentName}`;
    const raw = editingTime[key];
    if (raw === undefined) return;
    const h24 = to24h(raw);
    if (h24) {
      setEditingTime((prev) => { const next = { ...prev }; next[key] = to12h(h24); return next; });
      const docId = logDocId(classId, studentName);
      const existing = getLog(classId, studentName);
      setDoc(doc(db, "lessonLogs", docId), {
        classId, studentName, date: selectedDate,
        attendance: existing?.attendance ?? "", checkInTime: h24,
        content: existing?.content ?? "", createdAt: serverTimestamp(),
      }, { merge: true });
    }
    setEditingTime((prev) => { const next = { ...prev }; delete next[key]; return next; });
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
      {smsModal && <SmsPreviewModal phone={smsModal.phone} text={smsModal.text} label={smsModal.label} onClose={() => setSmsModal(null)} />}
      {historyStudent && (
        <StudentHistoryModal
          classId={historyStudent.classId}
          studentName={historyStudent.studentName}
          parentPhone={historyStudent.parentPhone}
          onClose={() => setHistoryStudent(null)}
          onSmsRequest={(phone, text, label) => { setHistoryStudent(null); setSmsModal({ phone, text, label }); }}
        />
      )}

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
      ) : isMobile ? (
        /* ── 모바일 카드 레이아웃 ── */
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {allStudents.map((student) => {
            const log = getLog(student.classId, student.studentName);
            const key = `${student.classId}_${student.studentName}`;
            const contentValue = editingContent[key] ?? log?.content ?? "";
            const timeValue = editingTime[key] ?? to12h(log?.checkInTime);
            const attStyle = log?.attendance ? ATT_COLOR[log.attendance] : undefined;

            return (
              <div key={key} className="bg-white border border-black/10 rounded-xl" style={{ boxShadow: T.shadow, padding: "12px 14px" }}>
                {/* 상단: 학년+이름 | 출석 | 시간 | 알림버튼 */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <span
                    onClick={() => setHistoryStudent({ classId: student.classId, studentName: student.studentName, parentPhone: student.parentPhone })}
                    style={{ fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                  >
                    {student.grade && <span style={{ fontSize: 11, fontWeight: 500, color: "#a39e98" }}>{student.grade}</span>}
                    <span style={{ color: "#38a848", textDecoration: "underline", textUnderlineOffset: 2 }}>{student.studentName}</span>
                  </span>
                  <select
                    value={log?.attendance ?? ""}
                    onChange={(e) => setAttendance(student.classId, student.studentName, e.target.value)}
                    style={{
                      fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid rgba(0,0,0,0.1)",
                      padding: "4px 22px 4px 8px", cursor: "pointer", outline: "none", height: 30, boxSizing: "border-box" as const,
                      backgroundColor: attStyle?.bg ?? "#fff", color: attStyle?.text ?? "#615d59",
                      appearance: "none" as const,
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23615d59'/%3E%3C/svg%3E")`,
                      backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center", backgroundSize: "10px 6px",
                    }}
                  >
                    <option value="">-</option>
                    {ATTENDANCE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  <input
                    value={timeValue}
                    onChange={(e) => setEditingTime((prev) => ({ ...prev, [key]: e.target.value }))}
                    onBlur={() => handleTimeBlur(student.classId, student.studentName)}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    style={{
                      fontSize: 11, fontFamily: "monospace", color: "#615d59", textAlign: "center",
                      border: "1px solid rgba(0,0,0,0.08)", borderRadius: 4,
                      padding: "4px 2px", outline: "none", width: 76, height: 30, boxSizing: "border-box",
                    }}
                  />
                  <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                    <button
                      title="출결알림"
                      disabled={!log?.attendance}
                      onClick={() => {
                        if (!log?.attendance || !student.parentPhone) return;
                        setSmsModal({ phone: student.parentPhone, text: buildAttendanceSms(student.studentName, log.attendance, log.checkInTime, selectedDate), label: `${student.studentName} 출결알림` });
                      }}
                      style={{
                        fontSize: 11, fontWeight: 600, borderRadius: 5,
                        border: "1px solid rgba(0,0,0,0.1)", backgroundColor: log?.attendance ? "#eff6ff" : "#f6f5f4",
                        color: log?.attendance ? "#1d4ed8" : "#a39e98",
                        padding: "4px 8px", cursor: log?.attendance ? "pointer" : "default", height: 30, boxSizing: "border-box" as const,
                      }}
                    >출결</button>
                    <button
                      title="수업종료"
                      onClick={() => {
                        if (!student.parentPhone) return;
                        setSmsModal({ phone: student.parentPhone, text: buildLessonEndSms(student.studentName, log?.content ?? ""), label: `${student.studentName} 수업종료` });
                      }}
                      style={{
                        fontSize: 11, fontWeight: 600, borderRadius: 5,
                        border: "1px solid rgba(0,0,0,0.1)", backgroundColor: "#fff5f5",
                        color: "#c00000", padding: "4px 8px", cursor: "pointer", height: 30, boxSizing: "border-box" as const,
                      }}
                    >종료</button>
                  </div>
                </div>
                {/* 수업내용 */}
                <textarea
                  ref={(t) => { if (t) { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; } }}
                  value={contentValue}
                  onChange={(e) => setEditingContent((prev) => ({ ...prev, [key]: e.target.value }))}
                  onBlur={() => saveContent(student.classId, student.studentName)}
                  rows={2}
                  onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }}
                  style={{
                    fontSize: 14, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6,
                    padding: "8px 10px", outline: "none", color: "rgba(0,0,0,0.9)",
                    width: "100%", boxSizing: "border-box", resize: "none", overflow: "hidden",
                    lineHeight: 1.5, fontFamily: "inherit", minHeight: 60,
                  }}
                />
              </div>
            );
          })}
        </div>
      ) : (
        /* ── 데스크톱 테이블 레이아웃 ── */
        <div className="bg-white border border-black/10 rounded-xl overflow-hidden" style={{ boxShadow: T.shadow }}>
          {/* 헤더 */}
          <div style={{
            display: "grid", gridTemplateColumns: "100px 80px 72px 1fr 88px",
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
                  display: "grid", gridTemplateColumns: "100px 80px 72px 1fr 88px",
                  gap: 8, padding: "8px 14px", alignItems: "start",
                  borderBottom: "1px solid rgba(0,0,0,0.05)",
                }}
              >
                {/* 학생 */}
                <span
                  onClick={() => setHistoryStudent({ classId: student.classId, studentName: student.studentName, parentPhone: student.parentPhone })}
                  style={{ fontSize: 13, fontWeight: 600, height: 30, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}
                >
                  {student.grade && <span style={{ fontSize: 11, fontWeight: 500, color: "#a39e98" }}>{student.grade}</span>}
                  <span style={{ color: "#38a848", textDecoration: "underline", textUnderlineOffset: 2 }}>{student.studentName}</span>
                </span>

                {/* 출석 */}
                <select
                  value={log?.attendance ?? ""}
                  onChange={(e) => setAttendance(student.classId, student.studentName, e.target.value)}
                  style={{
                    fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid rgba(0,0,0,0.1)",
                    padding: "4px 22px 4px 8px", cursor: "pointer", outline: "none", height: 30, boxSizing: "border-box" as const,
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
                  onBlur={() => handleTimeBlur(student.classId, student.studentName)}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  style={{
                    fontSize: 11, fontFamily: "monospace", color: "#615d59", textAlign: "center",
                    border: "1px solid rgba(0,0,0,0.08)", borderRadius: 4,
                    padding: "4px 2px", outline: "none", width: "100%", boxSizing: "border-box", height: 30,
                  }}
                />

                {/* 수업내용 (줄바꿈 지원) */}
                <textarea
                  ref={(t) => { if (t) { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; } }}
                  value={contentValue}
                  onChange={(e) => setEditingContent((prev) => ({ ...prev, [key]: e.target.value }))}
                  onBlur={() => saveContent(student.classId, student.studentName)}
                  rows={1}
                  onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }}
                  style={{
                    fontSize: 13, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6,
                    padding: "4px 8px", outline: "none", color: "rgba(0,0,0,0.9)",
                    width: "100%", boxSizing: "border-box", resize: "none", overflow: "hidden",
                    lineHeight: 1.5, fontFamily: "inherit", minHeight: 30,
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
                        text: buildAttendanceSms(student.studentName, log.attendance, log.checkInTime, selectedDate),
                        label: `${student.studentName} 출결알림`,
                      });
                    }}
                    style={{
                      fontSize: 11, fontWeight: 600, borderRadius: 5,
                      border: "1px solid rgba(0,0,0,0.1)", backgroundColor: log?.attendance ? "#eff6ff" : "#f6f5f4",
                      color: log?.attendance ? "#1d4ed8" : "#a39e98",
                      padding: "4px 8px", cursor: log?.attendance ? "pointer" : "default", height: 30, boxSizing: "border-box" as const,
                    }}
                  >출결</button>
                  <button
                    title="수업종료"
                    onClick={() => {
                      if (!student.parentPhone) return;
                      setSmsModal({
                        phone: student.parentPhone,
                        text: buildLessonEndSms(student.studentName, log?.content ?? ""),
                        label: `${student.studentName} 수업종료`,
                      });
                    }}
                    style={{
                      fontSize: 11, fontWeight: 600, borderRadius: 5,
                      border: "1px solid rgba(0,0,0,0.1)", backgroundColor: "#fff5f5",
                      color: "#c00000", padding: "4px 8px", cursor: "pointer", height: 30, boxSizing: "border-box" as const,
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
