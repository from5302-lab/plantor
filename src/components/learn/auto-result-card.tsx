"use client";

import { SERVICES } from "@/data/site";
import type { LearningLog, AutoUnit, DailykorDetail, DailykorPassage, DailykorVocaItem } from "@/lib/types";

// 자동인증 결과를 원본 성적표 "표 모양" 그대로 페이지에 기록/표시.
// 오토보카·클래스카드(문법/듣기/본문) 각각의 표 레이아웃을 재현한다.

function statusBadge(status?: string) {
  if (status === "완료") return { bg: "#f0faf1", fg: "#2a8438", label: "완료 ✓" };
  if (status === "진행중") return { bg: "#fff8e6", fg: "#a86a00", label: "진행중" };
  return { bg: "#f6f5f4", fg: "#a39e98", label: "시작전" };
}

// "N분 M초"(또는 "N분"/"M초") → 초. 파싱 실패 시 0.
function parseKoTime(t?: string): number {
  if (!t) return 0;
  const min = Number(t.match(/(\d+)\s*분/)?.[1] ?? 0);
  const sec = Number(t.match(/(\d+)\s*초/)?.[1] ?? 0);
  return min * 60 + sec;
}
// 초 → "N분 M초" (초 단위 0이면 "N분", 1분 미만이면 "M초")
function formatKoTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}초`;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

// 완료/미완료 pill 뱃지 (헤더 status 뱃지와 동일 스타일로 통일)
function CompletionBadge({ done }: { done: boolean }) {
  const s = done ? { bg: "#f0faf1", fg: "#2a8438", label: "완료 ✓" } : { bg: "#f6f5f4", fg: "#a39e98", label: "미완료" };
  return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: s.bg, color: s.fg }}>{s.label}</span>;
}

const th = "px-2.5 py-1.5 text-[11px] font-bold text-center whitespace-nowrap";
const td = "px-2.5 py-1.5 text-[12px] text-center whitespace-nowrap border-t border-black/[0.06]";

// ── 오토보카 성적표 ────────────────────────────────────────────────────────────
function AutovocaTable({ units }: { units: AutoUnit[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-black/90" style={{ minWidth: 460 }}>
        <thead>
          <tr>
            <th className={th} style={{ background: "#eef1f2", color: "#615d59" }}>요일</th>
            <th className={th} style={{ background: "#dbe6fb", color: "#2d4a86" }}>유닛</th>
            <th className={th} style={{ background: "#dbe6fb", color: "#2d4a86" }}>학습시간</th>
            <th className={th} style={{ background: "#dbe6fb", color: "#2d4a86" }}>테스트</th>
            <th className={th} style={{ background: "#f7dbe0", color: "#9a3b4b" }}>누적오답복습</th>
            <th className={th} style={{ background: "#f7ecc4", color: "#8a6d10" }}>포인트</th>
          </tr>
        </thead>
        <tbody>
          {units.map((u, i) => (
            <tr key={i}>
              <td className={td} style={{ color: "#615d59", fontWeight: 600 }}>오늘</td>
              <td className={td} style={{ textAlign: "left" }}>{u.unitLabel ?? "-"}</td>
              <td className={td}>{u.studyMinutes != null ? `${u.studyMinutes}분` : "-"}</td>
              <td className={td}>{u.testScore != null ? `${u.testScore}점` : "-"}</td>
              <td className={td}>{u.wrongReviewCount != null ? `${u.wrongReviewCount}개` : "-"}</td>
              <td className={td} style={{ fontWeight: 700, color: "#2a8438" }}>{u.points != null ? `+${u.points}P` : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 클래스카드 유닛 (문법/듣기/본문 공통, 성적표 형태) ─────────────────────────
function ClasscardUnit({ unit }: { unit: AutoUnit }) {
  const scores = unit.scores ? Object.entries(unit.scores) : [];
  const hasHeaderLine = unit.unitLabel || unit.dateRangeRaw || unit.studyMinutes != null || unit.avgScore != null;

  return (
    <div className="mb-2 last:mb-0 rounded-lg overflow-hidden border border-black/[0.08]">
      {hasHeaderLine && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 340 }}>
            <thead>
              <tr>
                <th className={th} style={{ background: "#e4ecf7", color: "#2d4a86", textAlign: "left" }}>유닛명</th>
                {(unit.dateRangeRaw || unit.studyMinutes != null) && (
                  <th className={th} style={{ background: "#e4ecf7", color: "#2d4a86" }}>학습</th>
                )}
                {unit.avgScore != null && <th className={th} style={{ background: "#e4ecf7", color: "#2d4a86" }}>평균</th>}
                <th className={th} style={{ background: "#e4ecf7", color: "#2d4a86" }}>완료</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={td} style={{ textAlign: "left", fontWeight: 600 }}>
                  {unit.type && <span className="text-[9px] font-bold mr-1 px-1 py-px rounded bg-black/5 text-p-secondary align-middle">{unit.type}</span>}
                  {unit.unitLabel ?? "-"}
                </td>
                {(unit.dateRangeRaw || unit.studyMinutes != null) && (
                  <td className={td}>{unit.dateRangeRaw ?? `${unit.studyMinutes}분`}</td>
                )}
                {unit.avgScore != null && <td className={td} style={{ fontWeight: 700 }}>{unit.avgScore}점</td>}
                <td className={td}>{unit.completed ? "✓" : "–"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {scores.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: scores.length * 70 }}>
            <thead>
              <tr>{scores.map(([k]) => <th key={k} className={th} style={{ background: "#f4f6f8", color: "#615d59" }}>{k}</th>)}</tr>
            </thead>
            <tbody>
              <tr>{scores.map(([k, v]) => <td key={k} className={td}>{v}</td>)}</tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── 클래스카드: 성적표 대신 완료 인증만 표기 ──────────────────────────────────
function ClasscardCompletion({ units }: { units: AutoUnit[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {units.map((u, i) => (
        <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-black/[0.08] bg-p-bg px-2 py-1 text-[12px]">
          {u.type && <span className="text-[9px] font-bold px-1 py-px rounded bg-black/5 text-p-secondary">{u.type}</span>}
          <span className="text-black/80">{u.unitLabel ?? "학습"}</span>
          {u.completed && <span className="font-bold" style={{ color: "#2a8438" }}>✓</span>}
        </span>
      ))}
    </div>
  );
}

export function AutoResultCard({ log, loading, error }: { log?: LearningLog; loading?: boolean; error?: string }) {
  const svcName = log ? SERVICES.find((s) => s.slug === log.serviceSlug)?.name : null;
  const units = log?.scrapedData?.units ?? [];
  const voca = log?.scrapedData?.voca ?? [];
  const isEmpty = units.length === 0 && voca.length === 0; // 어휘만 학습한 경우도 표시

  if (loading && isEmpty) {
    return <div className="mx-4 mb-3 rounded-lg bg-p-bg px-4 py-3 text-[12px] text-p-muted">진도 확인 중…</div>;
  }
  if (error && isEmpty) {
    return <div className="mx-4 mb-3 rounded-lg bg-[#fff5f5] px-4 py-3 text-[12px] text-[#c00000]">진도 자동 확인에 실패했어요. 잠시 후 다시 시도해 주세요.</div>;
  }
  if (!log || isEmpty) return null;

  const badge = statusBadge(log.autoStatus);
  const isAutovoca = log.serviceSlug === "autovoca";
  const isClasscard = log.serviceSlug === "classcard-middle";
  // 매일국어 리포트의 셀 숫자(점수)·색상(등급)은 오늘 학습 여부를 나타내는 것이지 성취 점수가 아님
  //  → 오해 방지 위해 점수·등급 표시하지 않고 "했나/안했나"(완료 여부)만 표기
  const isDailykor = log.serviceSlug === "dailykor";

  return (
    <div className="mx-4 mb-3 rounded-xl border border-black/[0.08] bg-white p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[12px] font-bold text-black/90">{svcName ?? "자동 인증"} {isClasscard || isDailykor ? "완료 인증" : "성적표"}</span>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: badge.bg, color: badge.fg }}>{badge.label}</span>
      </div>
      {isAutovoca ? (
        <AutovocaTable units={units} />
      ) : isClasscard ? (
        <ClasscardCompletion units={units} />
      ) : isDailykor ? (
        <DailykorCompletion units={units} detail={log.scrapedData?.detail} voca={log.scrapedData?.voca} />
      ) : (
        units.map((u, i) => <ClasscardUnit key={i} unit={u} />)
      )}
    </div>
  );
}

// 라벨 위 / 값 아래의 지표 셀 (Toss식 또렷한 숫자 위계)
function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-p-muted mb-0.5">{label}</div>
      <div className={`${strong ? "text-[15px]" : "text-[14px]"} font-semibold text-black/90 tabular-nums leading-none`}>{value}</div>
    </div>
  );
}

// 훈련시간 3단계 (준비·독해·실전) — 라벨은 흐리게, 값은 또렷하게
function TrainTime({ p }: { p: DailykorPassage }) {
  const steps: Array<[string, string]> = [];
  if (p.prepTime) steps.push(["준비", p.prepTime]);
  if (p.readingTime) steps.push(["독해", p.readingTime]);
  if (p.practiceTime) steps.push(["실전", p.practiceTime]);
  if (steps.length === 0) return null;
  return (
    <div className="mt-2 pt-2 border-t border-black/[0.06] flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
      {steps.map(([k, v]) => (
        <span key={k}>
          <span className="text-p-muted">{k}</span>{" "}
          <span className="text-black/80 font-medium tabular-nums">{v}</span>
        </span>
      ))}
    </div>
  );
}

// ── 매일국어: "오늘 학습 완료" 여부 + 오늘의 학습 상세(지문별) ────────────────────
function DailykorCompletion({ units, detail, voca }: { units: AutoUnit[]; detail?: DailykorDetail | null; voca?: DailykorVocaItem[] | null }) {
  const done = units.some((u) => u.completed);

  // 신규(passages) 우선, 없으면 레거시 평면 필드를 지문 1개로 정규화(과거 로그 호환)
  const passages: DailykorPassage[] = detail?.passages
    ?? (detail && (detail.passageCode || detail.prepTime)
      ? [{
          passageCode: detail.passageCode, type: detail.type, accuracy: detail.accuracy,
          readingSpeed: detail.readingSpeed, prepTime: detail.prepTime,
          readingTime: detail.readingTime, practiceTime: detail.practiceTime,
        }]
      : []);
  const multi = passages.length > 1;
  // 모든 지문의 훈련시간을 초로 합산 → 전체 학습시간
  const totalSec = passages.reduce((s, p) => s + parseKoTime(p.prepTime) + parseKoTime(p.readingTime) + parseKoTime(p.practiceTime), 0);

  return (
    <div>
      <div className="flex items-center gap-1.5 text-[13px]">
        <span className="text-black/80">오늘의 학습</span>
        <CompletionBadge done={done} />
        {multi && <span className="text-[11px] text-p-muted">지문 {passages.length}개</span>}
      </div>

      {passages.map((p, i) => {
        const hasBody = p.accuracy || p.readingSpeed || p.prepTime || p.readingTime || p.practiceTime;
        if (!p.type && !p.passageCode && !hasBody) return null;
        return (
          <div key={i} className="mt-2 rounded-[10px] border border-black/[0.06] bg-p-bg/50 px-3 py-2.5">
            {/* 헤더: 유형(강조) + 지문코드(캡션) */}
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <div className="flex items-baseline gap-1.5 min-w-0">
                {multi && <span className="text-[10px] font-bold text-p-green shrink-0">{i + 1}</span>}
                <span className="text-[13px] font-semibold text-black/90 truncate">{p.type ?? "지문"}</span>
              </div>
              {p.passageCode && <span className="text-[11px] font-medium text-p-muted shrink-0 tabular-nums">{p.passageCode}</span>}
            </div>
            {/* 지표: 정답률 · 분당 독해속도 */}
            {(p.accuracy || p.readingSpeed) && (
              <div className="flex gap-6">
                {p.accuracy && <Stat label="정답률" value={p.accuracy} strong />}
                {p.readingSpeed && <Stat label="분당 독해속도" value={p.readingSpeed} strong />}
              </div>
            )}
            <TrainTime p={p} />
          </div>
        );
      })}

      {/* 요약: 전체 학습시간 + 오늘 총 경험치 — '오늘의 학습'에 속하므로 구분선 위 */}
      {(totalSec > 0 || detail?.xp) && (
        <div className="mt-2.5 flex gap-8">
          {totalSec > 0 && <Stat label="전체 학습시간" value={formatKoTime(totalSec)} strong />}
          {detail?.xp && <Stat label="획득 경험치" value={detail.xp} strong />}
        </div>
      )}
      {voca && voca.length > 0 && (
        // 구분선으로 '오늘의 학습'(+요약)과 '어휘력 센터' 분리
        <div className="mt-3 pt-3 border-t border-black/[0.08]">
          {/* 섹션 헤더 — '오늘의 학습' 헤더와 동일 양식(제목 → 완료뱃지 → 카운트) */}
          <div className="flex items-center gap-1.5 text-[13px]">
            <span className="text-black/80">어휘력 센터</span>
            <CompletionBadge done />
            <span className="text-[11px] text-p-muted">{voca.reduce((n, v) => n + v.sets.length, 0)}세트</span>
          </div>
          {/* 카테고리 → 세트: 이 detail만 박스 안 */}
          <div className="mt-2 rounded-[10px] border border-black/[0.06] bg-p-bg/50 px-3 py-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            {voca.map((v, i) => (
              <span key={i}>
                <span className="text-p-muted">{v.category}</span>{" "}
                <span className="text-black/80 font-medium tabular-nums">{v.sets.join("·")}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
