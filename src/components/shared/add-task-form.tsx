"use client";

import { useEffect, useState } from "react";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Service } from "@/data/site";
import { useServices } from "@/lib/services-context";
import { X, Check, Pencil, ChevronDown } from "lucide-react";

const CLASS5_API = "/api/class5-library";

const ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23615d59'/%3E%3C/svg%3E")`;
const SEL: React.CSSProperties = {
  cursor: "pointer", borderRadius: 8, border: "1px solid rgba(0,0,0,0.1)",
  backgroundColor: "#fff", color: "rgba(0,0,0,0.95)",
  backgroundImage: ARROW, backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center", backgroundSize: "10px 6px",
  WebkitAppearance: "none", MozAppearance: "none", appearance: "none",
  outline: "none",
};

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

// ── Class5 API 캐시 ──────────────────────────────────────────────────────────

type C5Set = { value: string; label: string };
type C5Category = {
  hasLevel: boolean;
  levels: string[];
  sets: C5Set[] | Record<string, C5Set[]>;
};
type C5Data = Record<string, C5Category>;

let c5Cache: C5Data | null = null;

function useClass5Data() {
  const [data, setData] = useState<C5Data | null>(c5Cache);
  useEffect(() => {
    if (c5Cache) return;
    fetch(CLASS5_API).then(r => r.json()).then((d: C5Data) => {
      c5Cache = d;
      setData(d);
    }).catch(() => {});
  }, []);
  return data;
}

function getC5Sets(data: C5Data, partSlug: string, level: string): C5Set[] {
  // partSlug → API 카테고리명 매핑
  const catMap: Record<string, string> = {
    phonics: "Phonics", song: "Song", movie: "Movie",
    reading: "Reading", writing: "Writing", grammar: "Grammar",
  };
  const cat = data[catMap[partSlug] ?? ""];
  if (!cat) return [];
  if (!cat.hasLevel) return Array.isArray(cat.sets) ? cat.sets : [];
  const byLevel = cat.sets as Record<string, C5Set[]>;
  return byLevel[level] ?? [];
}

function getC5Levels(data: C5Data, partSlug: string): string[] {
  const catMap: Record<string, string> = {
    phonics: "Phonics", song: "Song", movie: "Movie",
    reading: "Reading", writing: "Writing", grammar: "Grammar",
  };
  const cat = data[catMap[partSlug] ?? ""];
  if (!cat?.hasLevel) return [];
  return cat.levels;
}

// ── 요일 선택 ─────────────────────────────────────────────────────────────────

function DayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex gap-1">
      {DAY_LABELS.map((label, i) => (
        <button key={i} onClick={() => onChange(value.includes(i) ? value.filter(x => x !== i) : [...value, i].sort())} type="button"
          className="flex-1 h-8 rounded-md text-xs font-semibold cursor-pointer"
          style={{
            border: value.includes(i) ? "2px solid #38a848" : "1px solid rgba(0,0,0,0.1)",
            backgroundColor: value.includes(i) ? "#38a848" : "transparent",
            color: value.includes(i) ? "#fff" : "#a39e98",
          }}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ── 세트 토글 리스트 ──────────────────────────────────────────────────────────

function SetToggleList({ sets, selected, onToggle }: {
  sets: C5Set[];
  selected: string | null;
  onToggle: (val: string) => void;
}) {
  if (sets.length === 0) return null;
  return (
    <div className="max-h-[180px] overflow-y-auto rounded-lg" style={{ border: "1px solid rgba(0,0,0,0.08)" }}>
      {sets.map(s => {
        const active = selected === s.value;
        return (
          <button key={s.value} type="button" onClick={() => onToggle(s.value)}
            className="w-full text-left px-3 py-2 text-[12px] cursor-pointer border-none flex items-center justify-between"
            style={{
              backgroundColor: active ? "#f0faf1" : "transparent",
              color: active ? "#2da040" : "rgba(0,0,0,0.8)",
              fontWeight: active ? 600 : 400,
              borderBottom: "1px solid rgba(0,0,0,0.04)",
            }}>
            <span className="truncate">{s.label}</span>
            {active && <Check size={14} className="text-p-green shrink-0 ml-2" />}
          </button>
        );
      })}
    </div>
  );
}

// ── 과제 1줄 (Row) ────────────────────────────────────────────────────────────

type TaskRow = {
  key: string;
  serviceSlug: string;
  partSlug: string;
  progressLabel: string;
  level: string;
  setName: string | null;
  scheduleDays: number[];
};

function buildTitle(row: TaskRow, services: Service[]): string {
  const svc = services.find(s => s.slug === row.serviceSlug);
  if (!svc) return "";

  // 클래스5: 파트(카테고리) + 레벨 + 세트
  if (row.serviceSlug === "class5" && row.partSlug) {
    const part = svc.parts?.find(p => p.slug === row.partSlug);
    if (!part) return "";
    let t = part.name;
    if (row.level && row.level !== "-") t += ` Lv.${row.level}`;
    if (row.setName) t += ` · ${row.setName}`;
    return t;
  }

  // 파트가 있는 서비스
  if (row.partSlug && svc.parts) {
    const part = svc.parts.find(p => p.slug === row.partSlug);
    return part?.name ?? "";
  }

  // progressLabel (오토보카)
  if (svc.progressLabel && row.progressLabel) return `${svc.name} ${row.progressLabel}`;

  return svc.name;
}

function TaskRowEditor({
  row, services, availableServices, c5Data, onChange, onRemove,
}: {
  row: TaskRow;
  services: Service[];
  availableServices: Service[];
  c5Data: C5Data | null;
  onChange: (r: TaskRow) => void;
  onRemove: () => void;
}) {
  const svc = services.find(s => s.slug === row.serviceSlug);
  const hasParts = (svc?.parts?.length ?? 0) > 0;
  const isProgressType = svc?.progressLabel === true;
  const isClass5 = row.serviceSlug === "class5";

  const levels = isClass5 && c5Data ? getC5Levels(c5Data, row.partSlug) : [];
  const sets = isClass5 && c5Data ? getC5Sets(c5Data, row.partSlug, row.level) : [];
  const [showSets, setShowSets] = useState(levels.length === 0 && sets.length > 0);

  return (
    <div className="bg-white rounded-xl px-4 py-3.5 mb-2" style={{ border: "1px solid rgba(0,0,0,0.1)" }}>
      <div className="flex flex-col gap-2">
        {/* 서비스 + 파트 + 삭제 */}
        <div className="flex gap-2 items-center">
          <select
            value={row.serviceSlug}
            onChange={e => {
              const newSvc = services.find(s => s.slug === e.target.value);
              onChange({
                ...row,
                serviceSlug: e.target.value,
                partSlug: newSvc?.parts?.[0]?.slug ?? "",
                progressLabel: "", level: "", setName: null,
              });
              setShowSets(false);
            }}
            style={{ ...SEL, height: 36, padding: "0 30px 0 10px", fontSize: 13, flex: "0 0 auto" }}
          >
            {availableServices.map(s => (
              <option key={s.slug} value={s.slug}>{s.name}</option>
            ))}
          </select>

          {hasParts && (
            <select
              value={row.partSlug}
              onChange={e => {
                onChange({ ...row, partSlug: e.target.value, level: "", setName: null });
                setShowSets(false);
              }}
              style={{ ...SEL, height: 36, padding: "0 30px 0 10px", fontSize: 13, flex: "1 1 auto", minWidth: 100 }}
            >
              {svc?.parts?.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
          )}
          <button onClick={onRemove}
            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-[13px] text-p-muted bg-transparent cursor-pointer"
            style={{ border: "1px solid rgba(0,0,0,0.1)" }}><X size={14} /></button>
        </div>

        {/* 클래스5: 레벨 드롭다운 */}
        {isClass5 && levels.length > 0 && (
          <select
            value={row.level}
            onChange={e => {
              onChange({ ...row, level: e.target.value, setName: null });
              setShowSets(true);
            }}
            style={{ ...SEL, height: 36, padding: "0 30px 0 10px", fontSize: 13 }}
          >
            <option value="">레벨 선택</option>
            {levels.map(lv => <option key={lv} value={lv}>Lv.{lv}</option>)}
          </select>
        )}

        {/* 클래스5: 세트 토글 — 레벨 없는 카테고리이거나, 레벨 선택 완료 시 */}
        {isClass5 && (sets.length > 0) && (levels.length === 0 || row.level) && (
          <>
            <button
              type="button"
              onClick={() => setShowSets(v => !v)}
              className="text-left px-3 h-9 rounded-lg text-[12px] font-semibold cursor-pointer"
              style={{
                border: "1px solid rgba(0,0,0,0.1)",
                backgroundColor: row.setName ? "#f0faf1" : "#fff",
                color: row.setName ? "#2da040" : "#a39e98",
              }}
            >
              {row.setName ? `${row.setName}` : `교재 선택 (${sets.length}개)`}
            </button>
            {showSets && (
              <SetToggleList
                sets={sets}
                selected={row.setName}
                onToggle={val => {
                  onChange({ ...row, setName: row.setName === val ? null : val });
                }}
              />
            )}
          </>
        )}

        {/* 오토보카: 진도 라벨 */}
        {isProgressType && (
          <input
            value={row.progressLabel}
            onChange={e => onChange({ ...row, progressLabel: e.target.value })}
            placeholder="n권 n유닛"
            className="h-9 rounded-lg px-2.5 text-[13px] text-black/95 bg-white flex-1"
            style={{ border: "1px solid rgba(0,0,0,0.1)" }}
          />
        )}

        {/* 요일 */}
        <DayPicker value={row.scheduleDays} onChange={days => onChange({ ...row, scheduleDays: days })} />
      </div>
    </div>
  );
}

// ── 일괄 추가 폼 (어드민/학생 공용) ───────────────────────────────────────────

export function AddTaskFormBatch({
  childId,
  subscribedSlugs,
  createdBy = "student",
  onDone,
}: {
  childId: string;
  subscribedSlugs: string[];
  createdBy?: "admin" | "student";
  onDone: () => void;
}) {
  const c5Data = useClass5Data();
  const { allServices } = useServices();
  const availableServices = allServices.filter(s => subscribedSlugs.includes(s.slug));
  const defaultSlug = availableServices[0]?.slug ?? "";
  const defaultPart = availableServices[0]?.parts?.[0]?.slug ?? "";

  const [rows, setRows] = useState<TaskRow[]>([
    { key: crypto.randomUUID(), serviceSlug: defaultSlug, partSlug: defaultPart, progressLabel: "", level: "", setName: null, scheduleDays: [0, 1, 2, 3, 4] },
  ]);
  const [saving, setSaving] = useState(false);

  function addRow() {
    setRows(prev => [...prev, {
      key: crypto.randomUUID(),
      serviceSlug: defaultSlug, partSlug: defaultPart,
      progressLabel: "", level: "", setName: null,
      scheduleDays: [0, 1, 2, 3, 4],
    }]);
  }

  const validRows = rows.filter(r => {
    const title = buildTitle(r, allServices);
    return title.trim() && r.scheduleDays.length > 0;
  });

  async function handleSaveAll() {
    if (validRows.length === 0) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const isAdmin = createdBy === "admin";
      for (const row of validRows) {
        const title = buildTitle(row, allServices);
        const ref = doc(collection(db, "tasks"));
        batch.set(ref, {
          childId,
          serviceSlug: row.serviceSlug,
          partSlug: row.partSlug || null,
          title: title.trim(),
          scheduleDays: row.scheduleDays,
          externalUrl: null,
          progressLabel: row.progressLabel.trim() || null,
          level: row.level ? Number(row.level) : null,
          setName: row.setName || null,
          order: Date.now(),
          active: true,
          createdBy,
          status: isAdmin ? "confirmed" : "draft",
          adminComment: null,
          createdAt: serverTimestamp(),
          confirmedAt: isAdmin ? serverTimestamp() : null,
        });
      }
      await batch.commit();
      onDone();
    } finally { setSaving(false); }
  }

  return (
    <div className="mb-6">
      <div className="text-[11px] font-bold text-p-muted tracking-[0.06em] mb-3">
        {createdBy === "admin" ? "과제 추가" : "주간 과제 구성"}
      </div>

      {rows.map(row => (
        <TaskRowEditor
          key={row.key}
          row={row}
          services={allServices}
          availableServices={availableServices}
          c5Data={c5Data}
          onChange={r => setRows(prev => prev.map(x => x.key === row.key ? r : x))}
          onRemove={() => setRows(prev => prev.filter(x => x.key !== row.key))}
        />
      ))}

      <button onClick={addRow}
        className="w-full h-10 rounded-xl border-[1.5px] border-dashed border-black/[0.15] bg-transparent text-p-muted text-[13px] font-semibold cursor-pointer mb-3 flex items-center justify-center gap-1">
        + 과제 더 추가
      </button>

      <div className="flex gap-2">
        <button onClick={onDone}
          className="flex-1 h-10 rounded-xl text-[13px] font-semibold cursor-pointer bg-white text-p-muted"
          style={{ border: "1px solid rgba(0,0,0,0.1)" }}>
          취소
        </button>
        <button onClick={handleSaveAll}
          disabled={validRows.length === 0 || saving}
          className="flex-[2] h-10 rounded-xl border-none text-[13px] font-bold cursor-pointer bg-p-green text-white"
          style={{ opacity: validRows.length === 0 || saving ? 0.5 : 1 }}>
          {saving ? "저장 중…" : createdBy === "admin"
            ? `${validRows.length}개 과제 확정 추가`
            : `${validRows.length}개 과제 일괄 저장`}
        </button>
      </div>
    </div>
  );
}

// ── 편집 가능한 과제 카드 (어드민/학생/학부모 공용) ────────────────────────────

export function EditableTaskCard({
  task,
  subscribedSlugs,
  role = "student",
  onDelete,
}: {
  task: import("@/lib/types").Task;
  subscribedSlugs: string[];
  role?: "student" | "admin" | "parent";
  onDelete: () => void;
}) {
  const c5Data = useClass5Data();
  const { allServices } = useServices();
  const svc = allServices.find(s => s.slug === task.serviceSlug);
  const isDraft = task.status === "draft";
  const today = new Date().getDay();
  const todayIdx = today === 0 ? 6 : today - 1;
  const isToday = task.scheduleDays.includes(todayIdx);

  const [editing, setEditing] = useState(false);
  const [row, setRow] = useState<TaskRow>({
    key: task.id,
    serviceSlug: task.serviceSlug,
    partSlug: task.partSlug ?? "",
    progressLabel: task.progressLabel ?? "",
    level: task.level ? String(task.level) : "",
    setName: task.setName ?? null,
    scheduleDays: [...task.scheduleDays],
  });
  const [saving, setSaving] = useState(false);

  const availableServices = allServices.filter(s => subscribedSlugs.includes(s.slug));

  async function handleSave() {
    const title = buildTitle(row, allServices);
    if (!title.trim() || row.scheduleDays.length === 0) return;
    setSaving(true);
    try {
      const { updateDoc, doc: docRef } = await import("firebase/firestore");
      await updateDoc(docRef(db, "tasks", task.id), {
        serviceSlug: row.serviceSlug,
        partSlug: row.partSlug || null,
        title: title.trim(),
        scheduleDays: row.scheduleDays,
        progressLabel: row.progressLabel.trim() || null,
        level: row.level ? Number(row.level) : null,
        setName: row.setName || null,
      });
      setEditing(false);
    } catch {
      alert("수정 저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally { setSaving(false); }
  }

  if (editing) {
    return (
      <div className="mb-2">
        <TaskRowEditor
          row={row}
          services={allServices}
          availableServices={availableServices}
          c5Data={c5Data}
          onChange={setRow}
          onRemove={() => setEditing(false)}
        />
        <div className="flex gap-2">
          {role === "student" ? (
            <button onClick={async () => {
              if (!confirm("삭제 요청을 보낼까요?")) return;
              try {
                const { updateDoc, doc: docRef, serverTimestamp: ts } = await import("firebase/firestore");
                await updateDoc(docRef(db, "tasks", task.id), { deleteRequested: true, deleteRequestedAt: ts() });
                setEditing(false);
              } catch {
                alert("삭제 요청에 실패했어요. 잠시 후 다시 시도해 주세요.");
              }
            }}
              className="flex-1 h-9 rounded-lg text-[12px] font-semibold cursor-pointer bg-white text-p-muted"
              style={{ border: "1px solid rgba(0,0,0,0.1)" }}>
              🙏 삭제 요청
            </button>
          ) : (
            <button onClick={onDelete}
              className="flex-1 h-9 rounded-lg text-[12px] font-semibold cursor-pointer bg-white text-[#c00000]"
              style={{ border: "1px solid rgba(200,0,0,0.2)" }}>
              과제 삭제
            </button>
          )}
          <button onClick={handleSave} disabled={saving}
            className="flex-[2] h-9 rounded-lg border-none text-[12px] font-bold cursor-pointer bg-p-green text-white"
            style={{ opacity: saving ? 0.5 : 1 }}>
            {saving ? "저장 중…" : "수정 저장"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-xl px-4 py-3.5 mb-2 relative"
      // 검토 중과 '오늘'이 똑같은 초록 테두리라 서로 구분되지 않았다.
      // 테두리는 검토 중(선생님 확인 필요)에만 쓰고, 오늘은 배지로만 알린다.
      style={{
        border: isDraft ? "1.5px solid #38a848" : "1px solid rgba(0,0,0,0.1)",
      }}
    >
      {isToday && !isDraft && (
        <div className="absolute top-2.5 right-9 text-[10px] font-bold text-p-teal tracking-[0.04em]">오늘</div>
      )}
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0">
          {svc ? (
            <span className="inline-block w-5 h-5">
              {svc.iconUrl ? <img src={svc.iconUrl} width={20} height={20} className="rounded" alt="" /> : <span>{svc.emoji}</span>}
            </span>
          ) : <span>📚</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-bold text-black/95">{task.title}</span>
            {task.level && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#f0f6ff", color: "#5aa3f2" }}>
                Lv.{task.level}
              </span>
            )}
            {isDraft && (
              <span className="text-[11px] rounded-full px-2 py-0.5 font-semibold"
                style={{ backgroundColor: "#eff6ff", color: "#38a848" }}>
                검토 중
              </span>
            )}
            {task.deleteRequested && (
              <span className="text-[11px] rounded-full px-2 py-0.5 font-semibold"
                style={{ backgroundColor: "#fff5f5", color: "#c00000" }}>
                삭제 요청
              </span>
            )}
          </div>
          {task.setName && (
            <div className="text-[11px] text-p-secondary mb-1 truncate">{task.setName}</div>
          )}
          <div className="flex gap-1">
            {DAY_LABELS.map((label, i) => (
              <span key={i}
                className="flex-1 text-center text-[11px] font-semibold py-1 rounded-md"
                // 요일 칩을 진초록으로 채우면 카드 3장에 초록 덩어리가 12개 생겨
                // 정작 이 화면의 액션(과제 추가)보다 강해진다.
                // DESIGN.md: Plantor Green 은 CTA·링크에 아껴 쓰는 유일한 채도색.
                // 여기서는 연한 배경 + 진한 글자로 낮춘다(대비 5.4:1, 선택 여부는 그대로 읽힌다).
                // 진초록을 걷어내니 이번엔 선택/비선택 배경(#eafaf1 vs #f6f5f4)이 너무 비슷해
                // 어느 요일에 하는지가 한눈에 안 들어왔다. 배경을 한 단계 진하게 + 얇은 링으로 잡는다.
                style={{
                  backgroundColor: task.scheduleDays.includes(i) ? "#d7f0e0" : "#f6f5f4",
                  color: task.scheduleDays.includes(i) ? "#1a6b2c" : "#a39e98",
                  boxShadow: task.scheduleDays.includes(i) ? "inset 0 0 0 1px rgba(26,107,44,0.22)" : "none",
                }}>
                {label}
              </span>
            ))}
          </div>
          {/* 삭제 요청 승인/거절 (어드민/학부모만) */}
          {task.deleteRequested && role !== "student" && (
            <div className="flex gap-2 mt-2">
              <button onClick={async () => {
                const { updateDoc, doc: docRef } = await import("firebase/firestore");
                await updateDoc(docRef(db, "tasks", task.id), { deleteRequested: false });
              }}
                className="flex-1 h-7 rounded text-[11px] font-semibold cursor-pointer bg-white text-p-muted"
                style={{ border: "1px solid rgba(0,0,0,0.1)" }}>거절</button>
              <button onClick={onDelete}
                className="flex-1 h-7 rounded text-[11px] font-semibold cursor-pointer text-white border-none"
                style={{ backgroundColor: "#c00000" }}>삭제 승인</button>
            </div>
          )}
        </div>
        <button onClick={() => setEditing(true)}
          className="shrink-0 text-[14px] text-p-muted bg-transparent border-none cursor-pointer px-1 py-0.5">
          <Pencil size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

