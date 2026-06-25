"use client";

import { useState } from "react";
import { getWeekDates } from "@/lib/learn-utils";
import { Card } from "@/components/ui/card";

export type JournalLog = { date: string; attendance: string; checkInTime: string | null; content: string };
export type JournalStudent = { studentName: string; grade: string; logs: JournalLog[] };

const ATT_COLOR: Record<string, string> = {
  "출석": "#1a7f4b", "보강": "#1a7f4b", "온라인 과제": "#2a8438",
  "지각": "#92660a", "조퇴": "#92660a", "결석": "#c00000",
};

const navBtn: React.CSSProperties = {
  background: "none", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6,
  width: 22, height: 22, cursor: "pointer", fontSize: 13, lineHeight: 1, color: "#615d59",
};

/** 한 학생의 주간 수업일지 — 자녀 카드 안과 직강 패널 양쪽에서 재사용. */
export function StudentWeekJournal({ logs }: { logs: JournalLog[] }) {
  const [offset, setOffset] = useState(0);
  const week = getWeekDates(offset);
  const label = offset === 0 ? "이번 주" : offset === -1 ? "지난 주" : offset < 0 ? `${-offset}주 전` : `${offset}주 후`;
  const weekLogs = logs.filter((l) => l.date >= week[0] && l.date <= week[6]).sort((a, b) => (a.date < b.date ? -1 : 1));

  return (
    <div className="bg-p-bg rounded-lg px-3.5 py-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <button onClick={() => setOffset((o) => o - 1)} style={navBtn}>‹</button>
        <span className="text-[11px] font-semibold tracking-[0.08em] text-p-muted">{label} 수업일지</span>
        <button onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0} style={{ ...navBtn, opacity: offset >= 0 ? 0.3 : 1 }}>›</button>
      </div>
      {weekLogs.length === 0 ? (
        <div className="text-[11px] text-p-muted text-center py-2">{label} 수업일지가 없어요</div>
      ) : (
        <div className="flex flex-col gap-2">
          {weekLogs.map((l, i) => (
            <div key={i} className="bg-white rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] font-bold text-black/80">{l.date.slice(5).replace("-", ".")}</span>
                {l.attendance && (
                  <span className="text-[11px] font-semibold" style={{ color: ATT_COLOR[l.attendance] ?? "#615d59" }}>{l.attendance}</span>
                )}
                {l.checkInTime && <span className="text-[10px] text-p-muted">{l.checkInTime}</span>}
              </div>
              {l.content && <div className="text-[12px] text-black/85 whitespace-pre-wrap leading-relaxed">{l.content}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 구독 카드가 없는(직강 전용) 학생들의 수업일지 패널. */
export function DirectJournalPanel({ students }: { students: JournalStudent[] }) {
  if (!students || students.length === 0) return null;
  return (
    <Card style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(0,0,0,0.95)", marginBottom: 12 }}>📓 수업일지</div>
      {students.map((s) => (
        <div key={s.studentName} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.95)", marginBottom: 6 }}>
            {s.studentName}{s.grade ? <span style={{ color: "#a39e98", fontWeight: 400 }}> · {s.grade}</span> : null}
          </div>
          <StudentWeekJournal logs={s.logs} />
        </div>
      ))}
    </Card>
  );
}
