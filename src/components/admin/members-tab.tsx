"use client";

import { useState, useRef, useEffect } from "react";
import { doc, updateDoc, deleteDoc, writeBatch, collection, query, where, getDocs, onSnapshot, orderBy, setDoc, addDoc, Timestamp, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { T } from "@/lib/design-tokens";
import { SITE, SERVICES } from "@/data/site";
import type { Service } from "@/data/site";
import { loadServices, filterSignupServices } from "@/lib/load-services";
import { ServiceIcon } from "@/components/ui/service-icon";
import { formatDateTime, formatWon } from "@/lib/format";
import { CenterMsg } from "@/components/ui/center-msg";
import { CopyBtn } from "@/components/ui/copy-btn";
import { useSendToast } from "@/lib/send-toast";
import { StudentLearningGrid } from "@/components/shared/student-learning-grid";
import { X, Settings, BarChart3, KeyRound } from "lucide-react";

import type { MemberFamily, MemberChild, Subscription as MemberSub, DirectClass, DirectClassStudent, DaySchedule } from "@/lib/types";
export type { MemberFamily, MemberChild, MemberSub };

const INPUT_CLS = "w-full box-border border border-black/10 rounded px-[10px] py-[7px] text-[13px] text-black/90 bg-white outline-none font-[inherit]";
const LABEL_CLS = "block text-[11px] font-semibold text-p-secondary mb-1 tracking-[0.02em]";

const MODAL_BTN_PRIMARY_CLS = "bg-p-green text-white border-none rounded px-4 py-2 text-[13px] font-semibold cursor-pointer";
const MODAL_BTN_GHOST_CLS = "bg-transparent text-p-secondary border border-black/10 rounded px-4 py-2 text-[13px] font-semibold cursor-pointer";

// ── 타입 ──────────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "active" | "stopped";

type StatusStyle = { value: string; label: string; color: string; bg: string; border: string };

const STATUS_ACTIVE: StatusStyle  = { value: "active",    label: "구독중", color: "#1a7f4b", bg: "#f0fff4", border: "rgba(26,127,75,0.2)" };
const STATUS_STOPPED: StatusStyle = { value: "cancelled", label: "정지중", color: "#92660a", bg: "#fffbeb", border: "rgba(180,130,0,0.2)" };

// 배지 드롭다운 옵션 (select 값 기준)
const BADGE_OPTIONS: StatusStyle[] = [STATUS_ACTIVE, STATUS_STOPPED];

// 실제 저장값 + 만료 계산 (배지/드롭다운용)
// endDate 당일 KST 23:59:59까지는 구독중으로 표기
function rawStatus(sub: MemberSub): string {
  if (!sub.endDate || sub.status !== "active") return sub.status;
  const kst = (d: Date) => new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return kst(new Date()) > kst(sub.endDate) ? "expired" : "active";
}

// 필터용: active | stopped
function effectiveStatus(sub: MemberSub): "active" | "stopped" {
  return rawStatus(sub) === "active" ? "active" : "stopped";
}

// 서비스별 기본 할인 규칙
const DEFAULT_DISCOUNT: Record<string, number> = { class5: 5000, dailykor: 3000 };
const AI_PACKAGE_PRICE = 10000;
function effectiveDiscount(s: MemberSub) { return s.discount ?? DEFAULT_DISCOUNT[s.serviceSlug] ?? 0; }

function statusStyle(status: string): StatusStyle {
  return status === "active" ? STATUS_ACTIVE : STATUS_STOPPED;
}

function won(n: number, zeroLabel = "-") {
  if (n === 0) return zeroLabel;
  const man = n / 10000;
  return `${man % 1 === 0 ? man.toFixed(0) : man.toFixed(1)}만`;
}

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}

// ── 공용 상수 ──────────────────────────────────────────────────────────────────

const DIRECT_GRADE_OPTIONS = ["초1","초2","초3","초4","초5","초6","중1","중2","중3","고1","고2","고3"];
const GRADE_SORT_ORDER = ["미취학", ...DIRECT_GRADE_OPTIONS];
const CLASS_SERVICES_DIRECT = SERVICES.filter((s) => (s.category === "subscription" || s.category === "premium") && s.slug !== "coming-soon-math-science");

function calcStudentsAgencyFee(students: Array<{ name?: string; serviceSlugs?: string[] }>, requireNonEmpty = false): number {
  return students
    .filter((s) => !requireNonEmpty || (s.name ?? "").trim() !== "")
    .reduce((total, student) => {
      return total + (student.serviceSlugs ?? []).reduce((sum, slug) => {
        const svc = CLASS_SERVICES_DIRECT.find((sv) => sv.slug === slug);
        return sum + (svc?.agencyFee ?? 0);
      }, 0);
    }, 0);
}

// ── 재무 셀 ───────────────────────────────────────────────────────────────────

function MoneyCell({ label, value, color, size = 12 }: { label: string; value: number; color?: string; size?: number }) {
  return (
    <div style={{ textAlign: "center", minWidth: 52, flexShrink: 0 }}>
      <div style={{ fontSize: 9, color: "#a39e98", marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: size, fontWeight: 600, color: color ?? "rgba(0,0,0,0.95)" }}>{won(value)}</div>
    </div>
  );
}

function FinanceBox({ revenue, discount, agencyFee, profit, size, personal }: { revenue: number; discount: number; agencyFee: number; profit: number; size?: number; personal?: boolean }) {
  if (personal) {
    // 개인 박스: 가맹비·순이익 제외, 실입금(매출−할인)만
    return (
      <div className="mt-finance-box flex items-center bg-p-bg rounded-lg border border-black/10" style={{ padding: "6px 10px", gap: 4, flexShrink: 0 }}>
        <MoneyCell label="매출"  value={revenue}   size={size} />
        <MoneyCell label="할인" value={discount} color="#c00000" size={size} />
        <div style={{ width: 1, height: 28, backgroundColor: "rgba(0,0,0,0.08)" }} />
        <MoneyCell label="실입금" value={revenue - discount} color="#1a7f4b" size={size} />
      </div>
    );
  }
  return (
    <div className="mt-finance-box flex items-center bg-p-bg rounded-lg border border-black/10" style={{ padding: "6px 10px", gap: 4, flexShrink: 0 }}>
      <MoneyCell label="매출"  value={revenue}   size={size} />
      <MoneyCell label="할인" value={discount} color="#c00000" size={size} />
      <MoneyCell label="가맹비" value={agencyFee} color="#92660a" size={size} />
      <div style={{ width: 1, height: 28, backgroundColor: "rgba(0,0,0,0.08)" }} />
      <MoneyCell label="순이익" value={profit} color={profit > 0 ? "#1a7f4b" : "#c00000"} size={size} />
    </div>
  );
}

// ── 편집 가능한 학년 ──────────────────────────────────────────────────────────

const GRADE_OPTIONS = ["미취학", "초1", "초2", "초3", "초4", "초5", "초6", "중1", "중2", "중3"];

function EditableGrade({ childId, grade }: { childId: string; grade: string }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setSaving(true);
    try {
      await updateDoc(doc(db, "children", childId), { grade: val });
    } catch (err) { alert(err instanceof Error ? err.message : "학년 변경 오류"); }
    finally { setSaving(false); setEditing(false); }
  }

  if (editing) {
    return (
      <select
        value={grade}
        onChange={handleChange}
        onBlur={() => setEditing(false)}
        autoFocus
        disabled={saving}
        style={{ fontSize: 11, border: "1px solid #097fe8", borderRadius: 4, padding: "2px 4px", outline: "none", color: "rgba(0,0,0,0.95)", backgroundColor: "#ffffff" }}
      >
        {GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      title="클릭하여 학년 수정"
      style={{ fontSize: 13, color: "#a39e98", cursor: "pointer", borderRadius: 3, padding: "1px 3px" }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(9,127,232,0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      {grade || "-"}
    </span>
  );
}

// ── 편집 가능한 날짜 ──────────────────────────────────────────────────────────

function EditableDate({ sub }: { sub: MemberSub }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const toInputVal = (d: Date | null) =>
    d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (!val) { setEditing(false); return; }
    setSaving(true);
    try {
      const ts = Timestamp.fromDate(new Date(val + "T00:00:00+09:00"));
      await updateDoc(doc(db, "subscriptions", sub.id), { endDate: ts });
    } catch (err) { alert(err instanceof Error ? err.message : "날짜 변경 오류"); }
    finally { setSaving(false); setEditing(false); }
  }

  if (editing) {
    return (
      <input
        type="date"
        defaultValue={toInputVal(sub.endDate)}
        onChange={handleChange}
        onBlur={() => setEditing(false)}
        autoFocus
        disabled={saving}
        style={{ fontSize: 11, border: "1px solid #097fe8", borderRadius: 4, padding: "2px 4px", outline: "none", width: 110 }}
      />
    );
  }

  const daysLeft = sub.endDate ? Math.ceil((sub.endDate.getTime() - Date.now()) / 86400000) : null;
  const isUrgent = daysLeft !== null && daysLeft <= 7 && effectiveStatus(sub) === "active";

  return (
    <span
      onClick={() => setEditing(true)}
      title="클릭하여 날짜 수정"
      style={{ fontSize: 11, color: isUrgent ? "#c00000" : "#a39e98", fontWeight: isUrgent ? 700 : undefined, cursor: "pointer", whiteSpace: "nowrap", borderRadius: 3, padding: "1px 3px" }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(9,127,232,0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      {sub.endDate ? `~${sub.endDate.toLocaleDateString("ko-KR")}` : "-"}
    </span>
  );
}

// ── 구독 상태 뱃지 ─────────────────────────────────────────────────────────────

function SubStatusBadge({ sub }: { sub: MemberSub }) {
  const [updating, setUpdating] = useState(false);
  const raw = rawStatus(sub);
  const selectVal = raw === "active" ? "active" : "cancelled";
  const s = BADGE_OPTIONS.find((o) => o.value === selectVal)!;

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (next === sub.status) return;
    setUpdating(true);
    try { await updateDoc(doc(db, "subscriptions", sub.id), { status: next }); }
    catch (err) { alert(err instanceof Error ? err.message : "상태 변경 오류"); }
    finally { setUpdating(false); }
  }

  return (
    <select value={selectVal} onChange={handleChange} disabled={updating}
      style={{ appearance: "none", WebkitAppearance: "none", border: `1px solid ${s.border}`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600, color: s.color, backgroundColor: s.bg, cursor: "pointer", outline: "none", textAlign: "center", textAlignLast: "center" }}>
      {BADGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ── 자녀 카드 삭제 버튼 (자녀 doc + 모든 구독 doc 삭제) ──────────────────────

function KeyBtn({ onClick }: { onClick: () => void }) {
  const [active, setActive] = useState(false);
  function handle() {
    setActive(true);
    onClick();
    setTimeout(() => setActive(false), 1000);
  }
  return (
    <button
      onClick={handle}
      title="비밀번호 초기화"
      style={{
        background: "none", border: "none", cursor: "pointer",
        fontSize: 14, padding: "0 2px", lineHeight: 1,
        transform: active ? "scale(0.88)" : "scale(1)",
        transition: "transform 0.1s ease",
        filter: active ? "brightness(0.8)" : "none",
      }}
    >
      <KeyRound size={14} strokeWidth={1.5} color="rgba(0,0,0,0.95)" />
    </button>
  );
}

const deleteXStyle = (deleting: boolean): React.CSSProperties => ({
  position: "absolute", top: 10, right: 12, background: "none", border: "none",
  cursor: "pointer", fontSize: 16, lineHeight: 1, color: "#c0a0a0",
  opacity: deleting ? 0.2 : 1, padding: "2px 4px",
});

function SmsSendBtn({ family, childNames, serviceNames, endDate, parentId, isDirect, tuition, disabled }: {
  family: MemberFamily; childNames: string; serviceNames: string; endDate: string; parentId: string;
  isDirect?: boolean; tuition?: number; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const text = isDirect
    ? [
        `안녕하세요^^`,
        `충쌤입니다,`,
        ``,
        `${childNames} 다음달 학습비 입금 기간입니다`,
        `매달 1일 전까지 익월 학습비 ${(tuition ?? 0).toLocaleString("ko-KR")}원을`,
        `아래계좌에 학생이름으로 입금해주세요,`,
        ``,
        `감사합니다.`,
        ``,
        `${SITE.bank.account}`,
        `${SITE.bank.name} ${SITE.bank.holder}`,
      ].join("\n")
    : [
        `[플랜토] ${family.parentName}님, 구독 만료 안내드립니다.`,
        ``,
        `${childNames}의 ${serviceNames} 구독이 ${endDate}에 만료됩니다.`,
        ``,
        `연장을 원하시면 사이트에 로그인해서`,
        `연장신청을 해주세요.`,
        ``,
        `👉 https://plantor.web.app`,
        `아이디: ${parentId}`,
        ``,
        `감사합니다 🌱`,
      ].join("\n");
  return (
    <>
      <button
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        title={disabled ? "만료 7일 이내일 때 활성화" : "만료 알림 카톡"}
        style={{
          background: "none", border: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: 14, padding: "2px 4px", lineHeight: 1,
          filter: disabled ? "grayscale(1)" : "none",
        }}
      >🔔</button>
      {open && <SmsPreviewModal phone={family.phone} parentName={family.parentName} initialText={text} onClose={() => setOpen(false)} />}
    </>
  );
}

function SmsPreviewModal({ phone, parentName, initialText, onClose }: {
  phone: string; parentName: string; initialText: string; onClose: () => void;
}) {
  const [text, setText] = useState(initialText);
  const { startSend } = useSendToast();

  function handleSend() {
    if (!text.trim() || !phone) return;
    startSend({ label: `${parentName} 만료알림`, phones: [phone.replace(/[\s-]/g, "")], text });
    onClose();
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 200 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(420px, 92vw)", backgroundColor: "#fff", borderRadius: 12, boxShadow: "0 8px 40px rgba(0,0,0,0.15)", zIndex: 201, padding: "24px 24px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>만료 알림 카톡 발송</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "#a39e98", cursor: "pointer", padding: 4 }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: "#a39e98", marginBottom: 12 }}>
          수신자: <span style={{ color: "#615d59", fontWeight: 600 }}>{parentName}</span> {phone && <span>({phone})</span>}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          style={{ width: "100%", boxSizing: "border-box", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: 12, fontSize: 13, lineHeight: 1.6, outline: "none", resize: "vertical", fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={onClose} className={MODAL_BTN_GHOST_CLS}>취소</button>
          <button onClick={handleSend} disabled={!text.trim()} className={MODAL_BTN_PRIMARY_CLS}>
            발송
          </button>
        </div>
      </div>
    </>
  );
}

function DeleteSubBtn({ subId }: { subId: string }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("이 과목 구독을 삭제하시겠습니까?")) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "subscriptions", subId));
    } catch (err) { alert(err instanceof Error ? err.message : "삭제 오류"); setDeleting(false); }
  }

  return (
    <button onClick={handleDelete} disabled={deleting} title="과목 삭제"
      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, lineHeight: 1, color: "#c0a0a0", opacity: deleting ? 0.2 : 1, padding: "2px 4px" }}>×</button>
  );
}

// 학부모 서비스 (community 카테고리 중 유료) + momsaipack
const PARENT_SERVICE_SLUGS = new Set(
  SERVICES.filter((s) => s.category === "community" && s.pricePerMonth && s.pricePerMonth > 0).map((s) => s.slug)
);
// 자녀 서비스 (subscription + premium)
const CHILD_SERVICES = SERVICES.filter((s) => (s.category === "subscription" || s.category === "premium") && s.pricePerMonth !== null && s.pricePerMonth > 0);

function ServiceAddSection({ familyId, children, allSubs, hasAiPackage, userId }: {
  familyId: string;
  children: { id: string; name: string }[];
  allSubs: MemberSub[];
  hasAiPackage: boolean;
  userId: string | null;
}) {
  const [slug, setSlug] = useState("");
  const [target, setTarget] = useState(""); // childId or "__parent__"
  const [saving, setSaving] = useState(false);

  // 사용 가능한 서비스 목록: 대상에 따라 다름
  const isParentTarget = target === "__parent__";
  const existingSlugs = isParentTarget
    ? [...(hasAiPackage ? ["momsaipack"] : []), ...allSubs.filter((s) => PARENT_SERVICE_SLUGS.has(s.serviceSlug)).map((s) => s.serviceSlug)]
    : allSubs.filter((s) => s.childId === target).map((s) => s.serviceSlug);

  const parentServices: { slug: string; name: string; priceLabel: string }[] = [
    ...SERVICES.filter((s) => PARENT_SERVICE_SLUGS.has(s.slug)).map((s) => ({ slug: s.slug, name: s.name, priceLabel: s.priceLabel })),
    { slug: "momsaipack", name: "Mom& AI 패키지", priceLabel: "₩10,000/월" },
  ];
  const availableServices = isParentTarget
    ? parentServices.filter((s) => !existingSlugs.includes(s.slug))
    : CHILD_SERVICES.filter((s) => !existingSlugs.includes(s.slug));

  async function handleAdd() {
    if (!slug || !target) return;
    setSaving(true);
    try {
      const now = new Date();
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1 + 1, 0); // 다음 달 말일
      const endDateStr = endDate.toLocaleDateString("sv-SE"); // YYYY-MM-DD

      if (isParentTarget && slug === "momsaipack") {
        // AI 패키지: aiPackageEndDate 필드로 관리
        await updateDoc(doc(db, "families", familyId), { aiPackageEndDate: endDateStr });
        if (userId) await updateDoc(doc(db, "users", userId), { aiPackageEndDate: endDateStr });
      } else if (isParentTarget) {
        const svc = SERVICES.find((s) => s.slug === slug);
        // 학부모 서비스: subscriptions 컬렉션에 childId=null로 저장 (학부모 본인 구독)
        await addDoc(collection(db, "subscriptions"), {
          familyId,
          childId: null,
          serviceSlug: slug,
          monthlyPrice: svc?.pricePerMonth ?? 0,
          agencyFee: svc?.agencyFee ?? 0,
          discount: 0,
          status: "active",
          startDate: Timestamp.fromDate(now),
          endDate: Timestamp.fromDate(endDate),
          createdAt: serverTimestamp(),
        });
      } else {
        // 자녀 서비스
        const svc = SERVICES.find((s) => s.slug === slug);
        await addDoc(collection(db, "subscriptions"), {
          familyId,
          childId: target,
          serviceSlug: slug,
          monthlyPrice: svc?.pricePerMonth ?? 0,
          agencyFee: svc?.agencyFee ?? 0,
          discount: 0,
          status: "active",
          startDate: Timestamp.fromDate(now),
          endDate: Timestamp.fromDate(endDate),
          createdAt: serverTimestamp(),
        });
      }
      setSlug("");
      setTarget("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "추가 오류");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-p-bg rounded-lg px-4 py-[14px]">
      <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#615d59" }}>서비스 추가</p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {/* 대상 선택 */}
        <select value={target} onChange={(e) => { setTarget(e.target.value); setSlug(""); }}
          style={{ appearance: "none", WebkitAppearance: "none", fontSize: 12, padding: "6px 28px 6px 10px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, background: `white url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23a39e98'/%3E%3C/svg%3E") no-repeat right 8px center`, cursor: "pointer", outline: "none", minWidth: 100, color: target ? "rgba(0,0,0,0.9)" : "#a39e98" }}>
          <option value="">대상 선택</option>
          <option value="__parent__">학부모</option>
          {children.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {/* 서비스 선택 */}
        <select value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!target}
          style={{ appearance: "none", WebkitAppearance: "none", flex: 1, fontSize: 12, padding: "6px 28px 6px 10px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, background: `white url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23a39e98'/%3E%3C/svg%3E") no-repeat right 8px center`, cursor: "pointer", outline: "none", minWidth: 120, opacity: target ? 1 : 0.5, color: slug ? "rgba(0,0,0,0.9)" : "#a39e98" }}>
          <option value="">서비스 선택</option>
          {availableServices.map((s) => (
            <option key={s.slug} value={s.slug}>{s.name} ({s.priceLabel})</option>
          ))}
        </select>
        {/* 추가 버튼 */}
        <button onClick={handleAdd} disabled={!slug || !target || saving}
          style={{ fontSize: 12, padding: "6px 14px", borderRadius: 6, border: "none", background: "#38a848", color: "white", cursor: slug && target && !saving ? "pointer" : "default", opacity: !slug || !target || saving ? 0.4 : 1, fontWeight: 600 }}>
          {saving ? "추가 중…" : "추가"}
        </button>
      </div>
    </div>
  );
}

function AiPackageEditableDate({ familyId, userId, endDate }: { familyId: string; userId: string | null; endDate: string }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const today = new Date().toLocaleDateString("sv-SE");
  const isActive = endDate >= today;
  const daysLeft = Math.ceil((new Date(endDate + "T00:00:00+09:00").getTime() - Date.now()) / 86400000);
  const isUrgent = daysLeft <= 7 && isActive;

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (!val) { setEditing(false); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, "families", familyId), { aiPackageEndDate: val });
      if (userId) await updateDoc(doc(db, "users", userId), { aiPackageEndDate: val });
    } catch (err) { alert(err instanceof Error ? err.message : "날짜 변경 오류"); }
    finally { setSaving(false); setEditing(false); }
  }

  if (editing) {
    return (
      <input
        type="date"
        defaultValue={endDate}
        onChange={handleChange}
        onBlur={() => setEditing(false)}
        autoFocus
        disabled={saving}
        style={{ fontSize: 11, border: "1px solid #097fe8", borderRadius: 4, padding: "2px 4px", outline: "none", width: 110 }}
      />
    );
  }

  const displayDate = new Date(endDate + "T00:00:00+09:00").toLocaleDateString("ko-KR");
  return (
    <span
      onClick={() => setEditing(true)}
      title="클릭하여 날짜 수정"
      style={{ fontSize: 11, color: isUrgent ? "#c00000" : "#a39e98", fontWeight: isUrgent ? 700 : undefined, cursor: "pointer", whiteSpace: "nowrap", borderRadius: 3, padding: "1px 3px" }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(9,127,232,0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      ~{displayDate}
    </span>
  );
}

function AiPackageStatusBadge({ familyId, userId, endDate }: { familyId: string; userId: string | null; endDate: string }) {
  const [updating, setUpdating] = useState(false);
  const today = new Date().toLocaleDateString("sv-SE");
  const isActive = endDate >= today;
  const selectVal = isActive ? "active" : "cancelled";
  const s = BADGE_OPTIONS.find((o) => o.value === selectVal)!;

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (e.target.value === "cancelled" && isActive) {
      if (!confirm("AI 패키지를 비활성화하시겠습니까?")) return;
      setUpdating(true);
      try {
        await updateDoc(doc(db, "families", familyId), { aiPackageEndDate: null });
        if (userId) await updateDoc(doc(db, "users", userId), { aiPackageEndDate: null });
      }
      catch (err) { alert(err instanceof Error ? err.message : "상태 변경 오류"); }
      finally { setUpdating(false); }
    }
  }

  return (
    <select value={selectVal} onChange={handleChange} disabled={updating}
      style={{ appearance: "none", WebkitAppearance: "none", border: `1px solid ${s.border}`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600, color: s.color, backgroundColor: s.bg, cursor: "pointer", outline: "none", textAlign: "center", textAlignLast: "center" }}>
      {BADGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function AiPackageRow({ familyId, userId, endDate }: { familyId: string; userId: string | null; endDate?: string }) {
  if (!endDate) return null;
  const [deleting, setDeleting] = useState(false);
  async function handleDelete() {
    if (!confirm("Mom& AI 패키지를 삭제하시겠습니까?")) return;
    setDeleting(true);
    try {
      await updateDoc(doc(db, "families", familyId), { aiPackageEndDate: null });
      if (userId) await updateDoc(doc(db, "users", userId), { aiPackageEndDate: null });
    } catch (err) { alert(err instanceof Error ? err.message : "삭제 오류"); setDeleting(false); }
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto 24px", alignItems: "center", gap: 8 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#615d59", overflow: "hidden" }}>
        <span style={{ fontSize: 14 }}>💻</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Mom&amp; AI 패키지</span>
      </span>
      <AiPackageStatusBadge familyId={familyId} userId={userId} endDate={endDate} />
      <div style={{ textAlign: "right" }}>
        <AiPackageEditableDate familyId={familyId} userId={userId} endDate={endDate} />
      </div>
      <span />
    </div>
  );
}

function DeleteFamilyBtn({ familyId, childIds }: { familyId: string; childIds: string[] }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("이 가족 전체를 삭제하시겠습니까?\n(가족 + 자녀 + 구독 전부 삭제)")) return;
    setDeleting(true);
    try {
      const batch = writeBatch(db);
      for (const childId of childIds) {
        const subsSnap = await getDocs(query(collection(db, "subscriptions"), where("childId", "==", childId)));
        subsSnap.docs.forEach((d) => batch.delete(d.ref));
        batch.delete(doc(db, "children", childId));
      }
      batch.delete(doc(db, "families", familyId));
      await batch.commit();
    } catch (err) { alert(err instanceof Error ? err.message : "삭제 오류"); setDeleting(false); }
  }

  return (
    <button onClick={handleDelete} disabled={deleting} title="가족 전체 삭제" style={deleteXStyle(deleting)}>×</button>
  );
}

// ── 가족 집계 ─────────────────────────────────────────────────────────────────

function calcTotals(subs: MemberSub[], statusFilter?: StatusFilter, serviceSlug?: string | null) {
  const filtered = subs.filter((s) => {
    if (serviceSlug && s.serviceSlug !== serviceSlug) return false;
    if (!statusFilter || statusFilter === "all") return effectiveStatus(s) === "active";
    return effectiveStatus(s) === statusFilter;
  });
  const revenue   = filtered.reduce((a, s) => a + (s.monthlyPrice ?? 0), 0);
  const discount  = filtered.reduce((a, s) => a + effectiveDiscount(s), 0);
  const agencyFee = filtered.reduce((a, s) => a + (s.agencyFee  ?? 0), 0);
  return { revenue, discount, agencyFee, profit: revenue - discount - agencyFee, count: filtered.length };
}

// ── 가족 필터 헬퍼 ────────────────────────────────────────────────────────────

function familyHasStatus(family: MemberFamily, children: MemberChild[], allSubs: MemberSub[], filter: StatusFilter) {
  if (filter === "all") return true;
  // 자녀 sub + 학부모 sub(childId null 또는 구 "__parent__") 모두 포함
  const subs = allSubs.filter((s) => children.some((c) => c.id === s.childId) || (!s.childId && s.familyId === family.id));
  if (filter === "active") {
    const todayStr = new Date().toISOString().slice(0, 10);
    return subs.some((s) => effectiveStatus(s) === "active") || !!(family.aiPackageEndDate && family.aiPackageEndDate >= todayStr);
  }
  // "stopped": 정지된 구독 또는 만료된 AI 패키지가 있으면 포함
  const todayStr = new Date().toISOString().slice(0, 10);
  return subs.some((s) => effectiveStatus(s) === "stopped")
    || !!(family.aiPackageEndDate && family.aiPackageEndDate < todayStr);
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export function MembersTab({
  families,
  allChildren,
  allSubs,
  membersLoading,
  onResetByFamily,
  onResetDirectClass,
  onResetAttendance,
  pendingSignupCount = 0,
  pendingRenewalCount = 0,
  onShowSignups,
  onShowRenewals,
}: {
  families: MemberFamily[];
  allChildren: MemberChild[];
  allSubs: MemberSub[];
  membersLoading: boolean;
  onResetByFamily: (familyId: string, loginId: string) => void;
  onResetDirectClass: (classId: string, loginId: string) => void;
  onResetAttendance?: (childId: string, childName: string) => void;
  pendingSignupCount?: number;
  pendingRenewalCount?: number;
  onShowSignups?: () => void;
  onShowRenewals?: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [svcFilter, setSvcFilter] = useState<string | null>(null);
  const [directClasses, setDirectClasses] = useState<DirectClass[]>([]);
  const [activeServices, setActiveServices] = useState<Service[]>(
    SERVICES.filter((s) => ((s.category === "subscription" || s.category === "premium") && s.pricePerMonth) || (s.category === "community" && s.pricePerMonth && s.pricePerMonth > 0))
  );

  useEffect(() => {
    loadServices()
      .then((all) => {
        const signupSvcs = filterSignupServices(all);
        // 학부모 유료 서비스도 포함 (community 카테고리 중 유료)
        const parentSvcs = all.filter((s) => s.category === "community" && s.pricePerMonth && s.pricePerMonth > 0 && !signupSvcs.some((x) => x.slug === s.slug));
        setActiveServices([...signupSvcs, ...parentSvcs].sort((a, b) => (a.order ?? 999) - (b.order ?? 999)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "directClasses"), orderBy("createdAt", "asc")),
      (snap) => {
        const parsed: DirectClass[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name ?? "",
            parentName: data.parentName ?? undefined,
            serviceSlugs: data.serviceSlugs ?? (data.serviceSlug ? [data.serviceSlug] : []),
            agencyFee: data.agencyFee ?? 0,
            grades: data.grades ?? [],
            schedule: data.schedule ?? [],
            tuition: data.tuition ?? 0,
            students: data.students ?? [],
            notes: data.notes ?? "",
            status: data.status ?? "active",
            serviceExpiry: data.serviceExpiry ?? {},
            expiry: data.expiry ?? null,
            createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : null,
          };
        });
        parsed.sort((a, b) => {
          const aExp = a.expiry ? new Date(a.expiry + "T00:00:00+09:00").getTime() : Infinity;
          const bExp = b.expiry ? new Date(b.expiry + "T00:00:00+09:00").getTime() : Infinity;
          if (aExp !== bExp) return aExp - bExp;
          const ga = DIRECT_GRADE_OPTIONS.indexOf(a.grades[0] ?? "");
          const gb = DIRECT_GRADE_OPTIONS.indexOf(b.grades[0] ?? "");
          if (ga !== gb) return ga - gb;
          return a.name.localeCompare(b.name, "ko");
        });
        setDirectClasses(parsed);
      }
    );
  }, []);

  const directStudentCount = directClasses
    .filter((c) => c.status === "active")
    .reduce((acc, c) => acc + c.students.length, 0);

  // ── 대시보드 집계 (테스트 계정 제외) ────────────────────────────────────────
  const testFamilyIds = new Set(families.filter((f) => f.isTest).map((f) => f.id));
  const testChildIds = new Set(
    allChildren.filter((c) => testFamilyIds.has(c.familyId)).map((c) => c.id)
  );
  const activeSubs     = allSubs.filter((s) => rawStatus(s) === "active");
  const realActiveSubs = activeSubs.filter((s) => {
    // 학부모 sub: childId null 또는 (구) "__parent__" → familyId로 테스트 여부 판단
    if (!s.childId || s.childId === "__parent__") return !(s.familyId && testFamilyIds.has(s.familyId));
    return !testChildIds.has(s.childId);
  });
  const activeDirectClasses = directClasses.filter((c) => c.status === "active");

  // 서비스 필터 선택 시 대시보드 수치도 해당 서비스만 반영
  const isDirect   = svcFilter === "__direct__";
  const isPlantor  = svcFilter === "__plantor__";
  const isAll      = !svcFilter;
  const isSvcSlug  = svcFilter && !isDirect && !isPlantor; // 개별 서비스 slug 필터
  const dashboardSubs  = isDirect ? [] : isSvcSlug ? realActiveSubs.filter((s) => s.serviceSlug === svcFilter) : realActiveSubs;
  const dashboardDirect = (isDirect || isAll) ? activeDirectClasses : [];
  const includeDirectRevenue = isDirect || isAll;
  const directRevenue  = includeDirectRevenue ? dashboardDirect.reduce((a, c) => a + (c.tuition ?? 0), 0) : 0;
  const directAgency   = includeDirectRevenue ? dashboardDirect.reduce((a, c) => a + (c.agencyFee ?? 0), 0) : 0;
  // AI 패키지 매출 (aiPackageEndDate 기반, 구독 문서 없음)
  const includeAiPackage = isAll || svcFilter === "momsaipack";
  const today = new Date().toISOString().slice(0, 10);
  const aiPackageCount = includeAiPackage ? families.filter((f) => !f.isTest && f.aiPackageEndDate && f.aiPackageEndDate >= today).length : 0;
  const aiPackageRevenue = aiPackageCount * AI_PACKAGE_PRICE;
  const totalRevenue   = dashboardSubs.reduce((a, s) => a + (s.monthlyPrice ?? 0), 0) + directRevenue + aiPackageRevenue;
  const totalDiscount  = isDirect ? 0 : dashboardSubs.reduce((a, s) => a + effectiveDiscount(s), 0);
  const totalAgency    = dashboardSubs.reduce((a, s) => a + (s.agencyFee ?? 0), 0) + directAgency;
  const totalProfit    = totalRevenue - totalDiscount - totalAgency;
  // 서비스별 카운트: 구독 + 직강 학생 합산
  const directSvcCounts: Record<string, number> = {};
  activeDirectClasses.forEach((cls) => {
    const studentCount = cls.students?.length || 1;
    (cls.serviceSlugs ?? []).forEach((slug) => {
      directSvcCounts[slug] = (directSvcCounts[slug] ?? 0) + studentCount;
    });
  });
  const svcCounts = Object.fromEntries(activeServices.map((s) => [
    s.slug,
    (realActiveSubs.filter((sub) => sub.serviceSlug === s.slug).length) + (directSvcCounts[s.slug] ?? 0),
  ]));
  // ── 가족 분류 ────────────────────────────────────────────────────────────────
  // momsaipack은 구독 없이 aiPackageEndDate로 집계
  svcCounts["momsaipack"] = families.filter(
    (f) => !f.isTest && f.aiPackageEndDate && f.aiPackageEndDate >= today
  ).length;
  // site.ts에 정의된 서비스만 표시, momsaipack/coming-soon 제외
  const knownSlugs = new Set(SERVICES.map((s) => s.slug));
  const sortedServices = [...activeServices]
    .filter((s) => knownSlugs.has(s.slug) && s.slug !== "momsaipack" && !s.slug.startsWith("coming-soon"))
    .sort((a, b) => (svcCounts[b.slug] ?? 0) - (svcCounts[a.slug] ?? 0));
  const activeIds = new Set<string>([
    ...(allSubs.filter((s) => rawStatus(s) === "active").map((s) => s.familyId || allChildren.find((c) => c.id === s.childId)?.familyId).filter(Boolean) as string[]),
    ...families.filter((f) => f.aiPackageEndDate && f.aiPackageEndDate >= today).map((f) => f.id),
  ]);
  const activeFamilies   = families.filter((f) => activeIds.has(f.id));
  const inactiveFamilies = families.filter((f) => !activeIds.has(f.id));

  // "구독중" → 활성 가족만 / "정지중" → 전체 가족
  const basePool = statusFilter === "stopped"
    ? [...activeFamilies, ...inactiveFamilies]
    : activeFamilies;

  const q = searchQuery.trim().toLowerCase();
  const filteredFamilies = basePool.filter((f) => {
    const ch = allChildren.filter((c) => c.familyId === f.id);
    if (!familyHasStatus(f, ch, allSubs, statusFilter)) return false;
    if (svcFilter === "momsaipack") {
      // AI 패키지는 구독 대신 aiPackageEndDate로 체크
      if (!f.aiPackageEndDate) return false;
    } else if (svcFilter === "__plantor__" || svcFilter === "__direct__") {
      // 전체 플랜토 / 직강 필터 — 가족 목록은 서비스 필터 없이 전체 표시
    } else if (svcFilter) {
      const hasSvc = allSubs.some((s) => (ch.some((c) => c.id === s.childId) || (!s.childId && s.familyId === f.id)) && s.serviceSlug === svcFilter && effectiveStatus(s) === "active");
      if (!hasSvc) return false;
    }
    if (!q) return true;
    if (f.parentName.toLowerCase().includes(q)) return true;
    if ((f.momId ?? "").toLowerCase().includes(q)) return true;
    return ch.some((c) => c.name.toLowerCase().includes(q) || c.loginId.toLowerCase().includes(q));
  });

  // 구독중 필터: 만료일 임박순 정렬
  const getEarliestEndDate = (fam: MemberFamily): Date | null => {
    const ch = allChildren.filter((c) => c.familyId === fam.id);
    const activeSubs = allSubs.filter(
      (s) => ch.some((c) => c.id === s.childId) && effectiveStatus(s) === "active" && s.endDate
    );
    return activeSubs.reduce<Date | null>(
      (min, s) => (!min || s.endDate!.getTime() < min.getTime() ? s.endDate! : min),
      null
    );
  };

  const sortedFamilies = [...filteredFamilies].sort((a, b) => {
    // 1. 만료일 (null → 마지막)
    const aEnd = getEarliestEndDate(a);
    const bEnd = getEarliestEndDate(b);
    const aT = aEnd ? aEnd.getTime() : Infinity;
    const bT = bEnd ? bEnd.getTime() : Infinity;
    if (aT !== bT) return aT - bT;
    // 2. 학년 (첫 번째 자녀 기준)
    const aChild = allChildren.find((c) => c.familyId === a.id);
    const bChild = allChildren.find((c) => c.familyId === b.id);
    const aG = GRADE_SORT_ORDER.indexOf(aChild?.grade ?? "");
    const bG = GRADE_SORT_ORDER.indexOf(bChild?.grade ?? "");
    if (aG !== bG) return aG - bG;
    // 3. 이름 (첫 번째 자녀)
    const aName = aChild?.name ?? a.parentName;
    const bName = bChild?.name ?? b.parentName;
    return aName.localeCompare(bName, "ko");
  });

  // 필터 카운트 — 실제 필터 결과와 동일한 로직으로 계산
  function countForFilter(filter: StatusFilter) {
    const pool = filter === "stopped" ? [...activeFamilies, ...inactiveFamilies] : activeFamilies;
    return pool.filter((f) => {
      const ch = allChildren.filter((c) => c.familyId === f.id);
      return familyHasStatus(f, ch, allSubs, filter);
    }).length;
  }

  const FILTER_BTNS: { value: StatusFilter; label: string; count: number }[] = [
    { value: "active",  label: "구독중", count: realActiveSubs.length },
    { value: "stopped", label: "정지중", count: countForFilter("stopped") },
  ];

  if (membersLoading) return <CenterMsg>불러오는 중…</CenterMsg>;

  return (
    <>
      {/* ── 대시보드 ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-black/10 rounded-xl mb-4" style={{ boxShadow: T.shadow }}>
        <div className="mt-dashboard-row" style={{ display: "flex", alignItems: "center" }}>
          {/* 아이콘 필터 영역 — 좌우 스크롤 */}
          <div style={{ flex: 1, minWidth: 0, overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none", padding: "16px 16px" }} className="hide-scrollbar">
            <div style={{ display: "inline-flex", gap: 14, alignItems: "flex-end", whiteSpace: "nowrap", padding: "4px" }}>
              {/* 전체 아이콘: 플랜토 + 직강 + 서비스 + AI패키지 — 인원수 내림차순 */}
              {[
                { key: "__plantor__", icon: <img src="/favicon.svg" width={22} height={22} alt="" style={{ display: "block" }} />, count: activeFamilies.length, color: "#38a848" },
                { key: "__direct__", icon: <span style={{ fontSize: 22, lineHeight: 1, display: "flex", width: 22, height: 22, alignItems: "center", justifyContent: "center" }}>🎓</span>, count: activeDirectClasses.length, color: "#7a7a7a" },
                ...sortedServices.filter((s) => (svcCounts[s.slug] ?? 0) > 0).map((svc) => {
                  const iconUrl = svc.iconUrl || SERVICES.find((s) => s.slug === svc.slug)?.iconUrl;
                  return {
                  key: svc.slug,
                  icon: iconUrl
                    ? <img src={iconUrl} width={22} height={22} alt="" style={{ display: "block", borderRadius: 4 }} />
                    : <span style={{ fontSize: 22, lineHeight: 1, display: "flex", width: 22, height: 22, alignItems: "center", justifyContent: "center" }}>{svc.emoji}</span>,
                  count: svcCounts[svc.slug] ?? 0,
                  color: "#a39e98",
                  title: svc.name,
                }}),
                ...((svcCounts["momsaipack"] ?? 0) > 0 ? [{
                  key: "momsaipack",
                  icon: <span style={{ fontSize: 22, lineHeight: 1, display: "flex", width: 22, height: 22, alignItems: "center", justifyContent: "center" }}>💻</span>,
                  count: svcCounts["momsaipack"] ?? 0,
                  color: "#a39e98",
                  title: "Mom& AI 패키지",
                }] : []),
              ]
                .sort((a, b) => b.count - a.count)
                .map((item) => {
                  const active = svcFilter === item.key;
                  const isSpecial = item.key === "__plantor__" || item.key === "__direct__";
                  return (
                    <button
                      key={item.key}
                      onClick={() => {
                        if (item.key === "__plantor__") setSvcFilter(null);
                        else if (item.key === "__direct__") setSvcFilter(active ? null : "__direct__");
                        else { setSvcFilter(active ? null : item.key); if (!active) setStatusFilter("active"); }
                      }}
                      title={(item as { title?: string }).title}
                      style={{ background: "none", border: "none", padding: "2px 4px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, borderRadius: 6, boxShadow: active ? "0 0 0 2px #38a848" : "none", flexShrink: 0 }}
                    >
                      {item.icon}
                      <span style={{ fontSize: 11, fontWeight: 600, color: active ? "#38a848" : (isSpecial ? item.color : "#a39e98"), lineHeight: 1 }}>{item.count}</span>
                    </button>
                  );
                })}
            </div>
          </div>
          {/* 구분선 + 매출박스 */}
          <div className="mt-dashboard-finance" style={{ borderLeft: "1px solid rgba(0,0,0,0.08)", padding: "12px 16px", flexShrink: 0 }}>
            <FinanceBox revenue={totalRevenue} discount={totalDiscount} agencyFee={totalAgency} profit={totalProfit} size={14} />
          </div>
        </div>
      </div>
      <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>

      {/* ── 필터 버튼 + 검색창 ────────────────────────────────────────────────── */}
      <div className="mt-members-filter-row" style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 8, marginBottom: 16 }}>
        <div className="mt-members-filter-btns" style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "nowrap", justifyContent: "space-between", width: "100%" }}>
        {FILTER_BTNS.map(({ value, label, count }) => {
          const active = statusFilter === value && svcFilter !== "__direct__";
          const s = statusStyle(value === "stopped" ? "cancelled" : value);
          return (
            <button key={value} onClick={() => { setSvcFilter(null); setStatusFilter(value); }} style={{
              borderRadius: 8, padding: "4px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: active ? "none" : "1px solid rgba(0,0,0,0.1)",
              backgroundColor: active ? s.bg : "#ffffff",
              color: active ? s.color : "#615d59",
              outline: active ? `1.5px solid ${s.border}` : "none",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              {label}
              <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>{count}</span>
            </button>
          );
        })}

        {/* 구분선 */}
        <div style={{ width: 1, height: 20, backgroundColor: "rgba(0,0,0,0.1)", flexShrink: 0 }} />

        {/* 대기중 */}
        <button onClick={onShowSignups} style={{
          borderRadius: 8, padding: "4px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
          border: pendingSignupCount > 0 ? "none" : "1px solid rgba(0,0,0,0.1)",
          backgroundColor: pendingSignupCount > 0 ? "#f0fff4" : "#ffffff",
          color: pendingSignupCount > 0 ? "#1a7f4b" : "#615d59",
          outline: pendingSignupCount > 0 ? "1.5px solid rgba(26,127,75,0.2)" : "none",
          display: "flex", alignItems: "center", gap: 5,
        }}>
          신규신청 <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>{pendingSignupCount}</span>
        </button>

        {/* 연장신청 */}
        <button onClick={onShowRenewals} style={{
          borderRadius: 8, padding: "4px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
          border: pendingRenewalCount > 0 ? "none" : "1px solid rgba(0,0,0,0.1)",
          backgroundColor: pendingRenewalCount > 0 ? "#f0f7ff" : "#ffffff",
          color: pendingRenewalCount > 0 ? "#097fe8" : "#615d59",
          outline: pendingRenewalCount > 0 ? "1.5px solid rgba(9,127,232,0.2)" : "none",
          display: "flex", alignItems: "center", gap: 5,
        }}>
          연장신청 <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>{pendingRenewalCount}</span>
        </button>
        </div>

        <div className="mt-members-search" style={{ position: "relative", width: "100%" }}>
          <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#a39e98", pointerEvents: "none" }}>🔍</span>
          <input
            type="text"
            placeholder="이름 · 아이디 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: "4px 12px 4px 28px",
              fontSize: 12, outline: "none", width: "100%", color: "rgba(0,0,0,0.95)",
              backgroundColor: "#ffffff", boxSizing: "border-box",
            }}
          />
        </div>
      </div>
      <style>{`
        @media (max-width: 600px) {
          .mt-dashboard-row { flex-direction: column !important; align-items: stretch !important; }
          .mt-dashboard-finance { border-left: none !important; border-top: 1px solid rgba(0,0,0,0.08) !important; width: 100%; box-sizing: border-box; }
          .mt-dashboard-finance > div { width: 100%; justify-content: space-between; }
          .mt-finance-box { width: 100%; justify-content: space-between; flex-shrink: 1 !important; }
          .mt-family-info { width: 100%; }
          .mt-family-settings { margin-left: auto !important; }
          .mt-family-createdat { margin-left: auto; }
        }
      `}</style>


      {/* ── 회원 카드 목록 ─────────────────────────────────────────────────────── */}
      {isDirect ? (
        <DirectStudentList classes={directClasses} searchQuery={searchQuery} onReset={onResetDirectClass} />
      ) : families.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/[0.12] bg-white px-6 py-16 text-center text-sm text-p-muted">
          등록된 회원이 없습니다.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sortedFamilies.length > 0 && (
            <FamilyList families={sortedFamilies} allChildren={allChildren} allSubs={allSubs} onResetByFamily={onResetByFamily} onResetAttendance={onResetAttendance} statusFilter={statusFilter} svcFilter={svcFilter} />
          )}
          {statusFilter === "active" && !isPlantor && svcFilter !== "momsaipack" && directClasses.length > 0 && (
            <DirectStudentList classes={directClasses} searchQuery={searchQuery} onReset={onResetDirectClass} serviceSlug={svcFilter ?? undefined} />
          )}
          {sortedFamilies.length === 0 && !isDirect && directClasses.length === 0 && (
            <div className="rounded-xl border border-dashed border-black/[0.12] bg-white px-6 py-12 text-center text-sm text-p-muted">
              해당하는 회원이 없습니다.
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── 이름 인라인 수정 (공용) ────────────────────────────────────────────────────


// ── 직강 편집 모달용 상수 ──────────────────────────────────────────────────────

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const emptyStudentFn = (): DirectClassStudent => ({ name: "", serviceSlugs: [], studentPhone: "", studentLoginId: "", parentPhone: "", parentLoginId: "" });
const ONLINE_SERVICE = { slug: "online-class", name: "온라인 수업" };

const SVG_ARROW_URL = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23615d59'/%3E%3C/svg%3E")`;
const scheduleSelectStyle: React.CSSProperties = {
  height: 36, borderRadius: 8, border: "1px solid rgba(0,0,0,0.1)", padding: "0 28px 0 8px", fontSize: 12,
  color: "rgba(0,0,0,0.95)", backgroundColor: "#ffffff",
  backgroundImage: SVG_ARROW_URL, backgroundRepeat: "no-repeat",
  backgroundPosition: "right 8px center", backgroundSize: "10px 6px",
  WebkitAppearance: "none", appearance: "none", outline: "none", cursor: "pointer", minWidth: 130,
};
const scheduleTimeStyle: React.CSSProperties = {
  height: 36, borderRadius: 8, border: "1px solid rgba(0,0,0,0.1)", padding: "0 10px", fontSize: 13,
  color: "rgba(0,0,0,0.95)", backgroundColor: "#ffffff", outline: "none", width: 118,
};
const scheduleIconBtn = (color: string = "#a39e98"): React.CSSProperties => ({
  background: "none", border: "none", cursor: "pointer", fontSize: 14,
  color, padding: "2px 4px", lineHeight: 1, flexShrink: 0,
});

// ── 스케줄 에디터 (공용) ───────────────────────────────────────────────────────

function ScheduleEditor({
  schedule, onChange, serviceOptions,
}: {
  schedule: DaySchedule[];
  onChange: (s: DaySchedule[]) => void;
  serviceOptions: Array<{ slug: string; name: string }>;
}) {
  const entries = schedule.length > 0 ? schedule : [{ day: 0, time: "" }];
  const selectedDays = [...new Set(entries.map((s) => s.day))].sort((a, b) => a - b);

  function toggleDay(d: number) {
    if (schedule.some((s) => s.day === d)) {
      onChange(schedule.filter((s) => s.day !== d));
    } else {
      onChange([...schedule, { day: d, time: "" }].sort((a, b) => a.day - b.day));
    }
  }
  function addEntry(d: number) {
    onChange([...schedule, { day: d, time: "" }]);
  }
  function removeEntry(idx: number) {
    if (schedule.length <= 1) return;
    onChange(schedule.filter((_, i) => i !== idx));
  }
  function copyEntry(idx: number) {
    const next = [...schedule.slice(0, idx + 1), { ...schedule[idx] }, ...schedule.slice(idx + 1)];
    onChange(next);
  }
  function updateEntry(idx: number, field: keyof DaySchedule, value: string) {
    onChange(schedule.map((s, i) => i === idx ? { ...s, [field]: value || undefined } : s));
  }
  function updateEntryDay(idx: number, day: number) {
    const next = schedule.map((s, i) => i === idx ? { ...s, day } : s);
    onChange(next);
  }

  const allSvcOptions = [ONLINE_SERVICE, ...serviceOptions];

  return (
    <div>
      {/* 요일 버튼 */}
      {/* 스케줄 항목 행들 */}
      {entries.map((s, idx) => (
        <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <select value={s.day} onChange={(e) => updateEntryDay(idx, Number(e.target.value))}
            style={{ ...scheduleSelectStyle, minWidth: 56, padding: "0 20px 0 8px" }}>
            {DAY_LABELS.map((label, i) => <option key={i} value={i}>{label}</option>)}
          </select>
          <select value={s.serviceSlug ?? ""} onChange={(e) => updateEntry(idx, "serviceSlug", e.target.value)} style={scheduleSelectStyle}>
            <option value="">서비스 선택</option>
            {allSvcOptions.map((svc) => <option key={svc.slug} value={svc.slug}>{svc.name}</option>)}
          </select>
          <input type="time" value={s.time} onChange={(e) => updateEntry(idx, "time", e.target.value)} style={scheduleTimeStyle} />
          <button onClick={() => copyEntry(idx)} title="복사" style={scheduleIconBtn()}>📋</button>
          <button onClick={() => addEntry(s.day)} title="이 요일에 추가" style={{ ...scheduleIconBtn("#38a848"), border: "1px solid #38a848", borderRadius: 4, fontSize: 12, fontWeight: 700, padding: "2px 6px" }}>+</button>
          <button onClick={() => removeEntry(idx)} title="삭제" style={{ ...scheduleIconBtn(), fontSize: 16 }}>×</button>
        </div>
      ))}
    </div>
  );
}

// ── 직강 수정 모달 ────────────────────────────────────────────────────────────

function DirectClassEditModal({ cls, onClose }: { cls: DirectClass; onClose: () => void }) {
  const firstStudent = cls.students[0];
  const [form, setForm] = useState({
    name: cls.name,
    parentName: cls.parentName ?? "",
    parentPhone: firstStudent?.parentPhone ?? "",
    parentLoginId: firstStudent?.parentLoginId ?? "",
    expiry: cls.expiry ?? "",
    serviceSlugs: cls.serviceSlugs,
    serviceExpiry: { ...(cls.serviceExpiry ?? {}) } as Record<string, string>,
    grades: cls.grades,
    schedule: cls.schedule,
    tuition: cls.tuition ? String(cls.tuition) : "",
    students: (cls.students.length > 0 ? cls.students : [emptyStudentFn()]).map((s) => ({
      ...s,
      serviceSlugs: s.serviceSlugs ?? [...cls.serviceSlugs],
    })),
    notes: cls.notes,
    status: cls.status as "active" | "inactive",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const totalAgencyFee = calcStudentsAgencyFee(form.students);
  function toggleGrade(g: string) {
    setForm((p) => ({ ...p, grades: p.grades.includes(g) ? p.grades.filter((x) => x !== g) : [...p.grades, g] }));
  }
  type FormStudent = typeof form.students[0];
  function setStudentField(idx: number, field: keyof DirectClassStudent, value: string) {
    setForm((p) => ({ ...p, students: p.students.map((s, i) => i === idx ? { ...s, [field]: value } : s) as FormStudent[] }));
  }
  function toggleStudentService(idx: number, slug: string) {
    setForm((p) => ({
      ...p,
      students: p.students.map((s, i) => {
        if (i !== idx) return s;
        const cur = s.serviceSlugs ?? [];
        return { ...s, serviceSlugs: cur.includes(slug) ? cur.filter((x) => x !== slug) : [...cur, slug] };
      }) as FormStudent[],
    }));
  }
  function addStudent() { setForm((p) => ({ ...p, students: [...p.students, { ...emptyStudentFn(), serviceSlugs: [] }] as FormStudent[] })); }
  function removeStudent(idx: number) { setForm((p) => ({ ...p, students: p.students.filter((_, i) => i !== idx) })); }

  async function handleSave() {
    if (!form.name.trim()) { setError("이름을 입력해주세요."); return; }
    setSaving(true); setError("");
    try {
      const allStudentSlugs = [...new Set(form.students.flatMap((s) => s.serviceSlugs ?? []))];
      const agencyFee = calcStudentsAgencyFee(form.students, true);
      // 학부모 정보를 모든 학생에 공통 적용
      const studentsWithParent = form.students
        .filter((s) => s.name.trim() !== "")
        .map((s) => ({ ...s, parentPhone: form.parentPhone.trim(), parentLoginId: form.parentLoginId.trim() }));
      await updateDoc(doc(db, "directClasses", cls.id), {
        name: form.name.trim(),
        parentName: form.parentName.trim() || null,
        expiry: form.expiry || null,
        serviceSlugs: allStudentSlugs, agencyFee,
        serviceExpiry: form.serviceExpiry,
        grades: form.grades, schedule: form.schedule,
        tuition: form.tuition ? Number(form.tuition) : 0,
        students: studentsWithParent,
        notes: form.notes.trim(), status: form.status,
      });
      // 학생/학부모 loginId가 있으면 Auth 계정 자동 생성
      const hasLoginIds = studentsWithParent.some((s) => s.studentLoginId || s.parentLoginId);
      if (hasLoginIds) {
        try {
          const ensureFn = httpsCallable(functions, "ensureDirectClassAccounts");
          await ensureFn({ classId: cls.id });
        } catch (e) {
          void e;
        }
      }
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "저장 실패"); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 200 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(680px, 95vw)", maxHeight: "90vh", overflowY: "auto", backgroundColor: "#ffffff", borderRadius: 12, boxShadow: T.shadowFloat, zIndex: 201, padding: "28px 28px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>수업 수정</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "#a39e98", cursor: "pointer", lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label className={LABEL_CLS}>수업명 *</label>
            <input className={INPUT_CLS} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label className={LABEL_CLS}>엄마 이름 <span style={{ fontWeight: 400, color: "#a39e98" }}>(입금자 확인용)</span></label>
              <input className={INPUT_CLS} value={form.parentName} onChange={(e) => setForm((p) => ({ ...p, parentName: e.target.value }))} placeholder="예: 김영희" />
            </div>
            <div>
              <label className={LABEL_CLS}>수업 만료일</label>
              <input type="date" className={INPUT_CLS} value={form.expiry} onChange={(e) => setForm((p) => ({ ...p, expiry: e.target.value }))} />
            </div>
            <div>
              <label className={LABEL_CLS}>학부모 연락처</label>
              <input className={INPUT_CLS} value={form.parentPhone} onChange={(e) => setForm((p) => ({ ...p, parentPhone: e.target.value }))} placeholder="010-0000-0000" />
            </div>
            <div>
              <label className={LABEL_CLS}>학부모 아이디</label>
              <input className={INPUT_CLS + " font-mono"} value={form.parentLoginId} onChange={(e) => setForm((p) => ({ ...p, parentLoginId: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <label className={LABEL_CLS + " mb-0"}>상태</label>
            {(["active", "inactive"] as const).map((s) => (
              <button key={s} onClick={() => setForm((p) => ({ ...p, status: s }))} style={{ padding: "6px 14px", borderRadius: 4, fontSize: 13, fontWeight: 600, border: form.status === s ? "none" : "1px solid rgba(0,0,0,0.1)", backgroundColor: form.status === s ? (s === "active" ? "#38a848" : "#e0e0e0") : "transparent", color: form.status === s ? (s === "active" ? "#ffffff" : "#615d59") : "#a39e98", cursor: "pointer" }}>
                {s === "active" ? "운영 중" : "정지"}
              </button>
            ))}
          </div>
          <div>
            <label className={LABEL_CLS}>학습 요일 &amp; 시간</label>
            <ScheduleEditor
              schedule={form.schedule}
              onChange={(s) => setForm((p) => ({ ...p, schedule: s }))}
              serviceOptions={CLASS_SERVICES_DIRECT.filter((s) => form.students.some((st) => (st.serviceSlugs ?? []).includes(s.slug))) || CLASS_SERVICES_DIRECT}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>월 수업료 (원)</label>
            <input className={INPUT_CLS + " max-w-[220px]"} type="text" inputMode="numeric" value={form.tuition ? Number(form.tuition).toLocaleString("ko-KR") : ""}
              onChange={(e) => {
                const raw = e.target.value.replace(/,/g, "");
                if (raw === "" || /^\d+$/.test(raw)) setForm((p) => ({ ...p, tuition: raw }));
              }} />
            {totalAgencyFee > 0 && form.tuition && <div style={{ marginTop: 6, fontSize: 12, color: "#615d59" }}>순수익 <strong style={{ color: "#38a848" }}>{formatWon(Number(form.tuition) - totalAgencyFee)}/월</strong></div>}
          </div>
          <div>
            <label className={LABEL_CLS}>대상 학년</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DIRECT_GRADE_OPTIONS.map((g) => (
                <button key={g} onClick={() => toggleGrade(g)} style={{ padding: "5px 10px", borderRadius: 9999, fontSize: 12, fontWeight: 600, border: form.grades.includes(g) ? "none" : "1px solid rgba(0,0,0,0.1)", backgroundColor: form.grades.includes(g) ? "#f0faf1" : "transparent", color: form.grades.includes(g) ? "#38a848" : "#a39e98", cursor: "pointer" }}>{g}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <label className={LABEL_CLS + " mb-0"}>학생</label>
              <button onClick={addStudent} style={{ fontSize: 12, fontWeight: 600, color: "#38a848", background: "none", border: "none", cursor: "pointer" }}>+ 학생 추가</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {form.students.map((s, idx) => (
                <div key={idx} className="bg-p-bg rounded-lg px-4 py-[14px] relative">
                  {form.students.length > 1 && <button onClick={() => removeStudent(idx)} style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#a39e98" }}>✕</button>}
                  <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#615d59" }}>학생 {idx + 1}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label className={LABEL_CLS}>이름</label>
                      <input className={INPUT_CLS} value={s.name} onChange={(e) => setStudentField(idx, "name", e.target.value)} />
                    </div>
                    <div><label className={LABEL_CLS}>학생 연락처</label><input className={INPUT_CLS} value={s.studentPhone} onChange={(e) => setStudentField(idx, "studentPhone", e.target.value)} /></div>
                    <div><label className={LABEL_CLS}>학생 아이디</label><input className={INPUT_CLS} value={s.studentLoginId} onChange={(e) => setStudentField(idx, "studentLoginId", e.target.value)} /></div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label className={LABEL_CLS}>이용 서비스</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {CLASS_SERVICES_DIRECT.map((svc) => {
                          const sel = (s.serviceSlugs ?? []).includes(svc.slug);
                          return (
                            <button key={svc.slug} type="button" onClick={() => toggleStudentService(idx, svc.slug)}
                              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 9px", borderRadius: 7, cursor: "pointer", border: sel ? "none" : "1px solid rgba(0,0,0,0.1)", backgroundColor: sel ? "#eff6ff" : "transparent", outline: sel ? "1.5px solid #38a848" : "none" }}>
                              {svc.iconUrl ? <img src={svc.iconUrl} width={14} height={14} style={{ objectFit: "contain", borderRadius: 2, display: "block" }} alt={svc.name} /> : <span style={{ fontSize: 13 }}>{svc.emoji}</span>}
                              <span style={{ fontSize: 11, fontWeight: 600, color: sel ? "#38a848" : "#615d59" }}>{svc.name}</span>
                              {sel && <span style={{ fontSize: 10, color: "#38a848" }}>✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className={LABEL_CLS}>메모</label>
            <textarea className={INPUT_CLS} style={{ minHeight: 72, resize: "vertical" }} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </div>
          {error && <p style={{ margin: 0, color: "#c0392b", fontSize: 13 }}>{error}</p>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={onClose} className={MODAL_BTN_GHOST_CLS}>취소</button>
            <button onClick={handleSave} disabled={saving} className={MODAL_BTN_PRIMARY_CLS} style={{ opacity: saving ? 0.7 : 1 }}>
              {saving ? "저장 중…" : "수정 완료"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── 인라인 날짜 편집기 ─────────────────────────────────────────────────────────

function InlineDateField({ value, onSave }: { value?: string | null; onSave: (val: string | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSaving(true);
    try {
      await onSave(e.target.value || null);
    } catch (err) { alert(err instanceof Error ? err.message : "날짜 변경 오류"); }
    finally { setSaving(false); setEditing(false); }
  }

  if (editing) {
    return (
      <input type="date" defaultValue={value ?? ""} onChange={handleChange}
        onBlur={() => setEditing(false)} autoFocus disabled={saving}
        style={{ fontSize: 11, border: "1px solid #097fe8", borderRadius: 4, padding: "2px 4px", outline: "none", width: 110 }} />
    );
  }

  const endDate = value ? new Date(value + "T00:00:00+09:00") : null;
  const daysLeft = endDate ? Math.ceil((endDate.getTime() - Date.now()) / 86400000) : null;
  const isUrgent = daysLeft !== null && daysLeft <= 7;

  return (
    <span onClick={() => setEditing(true)} title="클릭하여 만료일 수정"
      style={{ fontSize: 11, color: isUrgent ? "#c00000" : "#a39e98", fontWeight: isUrgent ? 700 : undefined, cursor: "pointer", whiteSpace: "nowrap", borderRadius: 3, padding: "1px 3px" }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(9,127,232,0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      {endDate ? `~${endDate.toLocaleDateString("ko-KR")}` : <span style={{ color: "rgba(0,0,0,0.25)" }}>만료일</span>}
    </span>
  );
}

// ── EditableText (범용 인라인 편집기) ─────────────────────────────────────────

function EditableText({
  value, onSave, bold, mono, muted, fontSize: fs,
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
  bold?: boolean;
  mono?: boolean;
  muted?: boolean;
  fontSize?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!editing) setVal(value); }, [value, editing]);

  async function save() {
    const t = val.trim();
    if (t === value) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(t); setEditing(false); }
    catch (e) { alert(String(e)); setVal(value); setEditing(false); }
    finally { setSaving(false); }
  }

  const base: React.CSSProperties = {
    fontSize: fs ?? (bold ? 15 : 13),
    fontWeight: bold ? 700 : undefined,
    fontFamily: mono ? "monospace" : undefined,
    color: muted ? "#a39e98" : "rgba(0,0,0,0.95)",
    borderRadius: 3,
    padding: "1px 3px",
  };

  if (editing) {
    return (
      <input autoFocus value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setVal(value); } }}
        disabled={saving}
        style={{ ...base, border: "1px solid #38a848", outline: "none", width: bold ? 110 : 140, backgroundColor: "#ffffff" }}
      />
    );
  }
  return (
    <span onClick={() => { setVal(value); setEditing(true); }} title="클릭하여 수정"
      style={{ ...base, cursor: "pointer" }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(9,127,232,0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      {value || <span style={{ color: "#a39e98", fontWeight: 400 }}>-</span>}
    </span>
  );
}

// ── 직강 학생 카드 ─────────────────────────────────────────────────────────────

// ── 플랜토 가족 수정 모달 ──────────────────────────────────────────────────────

function FamilyEditModal({ family, children, allSubs, onClose }: {
  family: MemberFamily;
  children: MemberChild[];
  allSubs: MemberSub[];
  onClose: () => void;
}) {
  const [parentForm, setParentForm] = useState({ name: family.parentName, phone: family.phone });
  const [childForms, setChildForms] = useState<{ id: string; name: string; grade: string; loginId: string }[]>(
    children.map((c) => ({ id: c.id, name: c.name, grade: c.grade, loginId: c.loginId }))
  );
  const [schedules, setSchedules] = useState<Record<string, DaySchedule[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const init: Record<string, DaySchedule[]> = {};
      await Promise.all(children.map(async (child) => {
        try {
          const { getDoc } = await import("firebase/firestore");
          const snap = await getDoc(doc(db, "studentProfiles", child.id));
          init[child.id] = (snap.data()?.schedule as DaySchedule[] | undefined) ?? [];
        } catch { init[child.id] = []; }
      }));
      setSchedules(init);
      setLoading(false);
    }
    load();
  }, [children]);

  async function handleSave() {
    setSaving(true); setError("");
    try {
      // 부모 정보 업데이트
      await updateDoc(doc(db, "families", family.id), {
        parentName: parentForm.name.trim(),
        phone: parentForm.phone.trim(),
      });
      // 자녀별 정보 + 스케줄 업데이트
      await Promise.all(childForms.map(async (cf) => {
        await updateDoc(doc(db, "children", cf.id), {
          name: cf.name.trim(),
          grade: cf.grade,
          loginId: cf.loginId.trim(),
        });
        await setDoc(doc(db, "studentProfiles", cf.id), {
          childId: cf.id,
          schedule: schedules[cf.id] ?? [],
          updatedAt: Timestamp.now(),
        }, { merge: true });
      }));
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "저장 실패"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm(`${family.parentName} 가족 데이터를 완전히 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) return;
    setDeleting(true);
    try {
      const fn = httpsCallable<{ familyId: string }, { success: boolean }>(functions, "deleteFamily");
      await fn({ familyId: family.id });
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "삭제 실패"); setDeleting(false); }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 200 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(620px, 95vw)", maxHeight: "90vh", overflowY: "auto", backgroundColor: "#ffffff", borderRadius: 12, boxShadow: T.shadowFloat, zIndex: 201, padding: "28px 28px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>회원 수정</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "#a39e98", cursor: "pointer", lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        {loading ? (
          <div style={{ textAlign: "center", color: "#a39e98", padding: "24px 0" }}>불러오는 중…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* 학부모 정보 + 구독 현황 */}
            <div className="bg-p-bg rounded-lg px-4 py-[14px]">
              <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "#615d59" }}>학부모</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className={LABEL_CLS}>이름</label>
                  <input className={INPUT_CLS} value={parentForm.name} onChange={(e) => setParentForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className={LABEL_CLS}>연락처</label>
                  <input className={INPUT_CLS} value={parentForm.phone} onChange={(e) => setParentForm((p) => ({ ...p, phone: e.target.value }))} placeholder="010-0000-0000" />
                </div>
              </div>
              {/* 학부모 구독 */}
              {(() => {
                const parentSubs = allSubs.filter((s) => !s.childId && s.familyId === family.id);
                if (!family.aiPackageEndDate && parentSubs.length === 0) return null;
                return (
                  <div style={{ marginTop: 14 }}>
                    <label className={LABEL_CLS}>구독 중인 서비스</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {family.aiPackageEndDate && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#615d59" }}>
                          <span>💻</span>
                          <span style={{ flex: 1 }}>Mom& AI 패키지</span>
                          <span style={{ fontSize: 11, color: "#a39e98" }}>~{new Date(family.aiPackageEndDate + "T00:00:00+09:00").toLocaleDateString("ko-KR")}</span>
                          <button onClick={async () => { if (!confirm("AI 패키지를 삭제하시겠습니까?")) return; await updateDoc(doc(db, "families", family.id), { aiPackageEndDate: null }); if (family.userId) await updateDoc(doc(db, "users", family.userId), { aiPackageEndDate: null }); }}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#c0a0a0", padding: "0 2px", lineHeight: 1 }}>×</button>
                        </div>
                      )}
                      {parentSubs.map((sub) => {
                        const svc = SERVICES.find((s) => s.slug === sub.serviceSlug);
                        return (
                          <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#615d59" }}>
                            {svc && <ServiceIcon service={svc} size={14} />}
                            <span style={{ flex: 1 }}>{svc?.name ?? sub.serviceSlug}</span>
                            <span style={{ fontSize: 11, color: "#a39e98" }}>~{sub.endDate?.toLocaleDateString("ko-KR") ?? "-"}</span>
                            <button onClick={async () => { if (!confirm(`${svc?.name ?? sub.serviceSlug} 구독을 삭제하시겠습니까?`)) return; await deleteDoc(doc(db, "subscriptions", sub.id)); }}
                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#c0a0a0", padding: "0 2px", lineHeight: 1 }}>×</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* 자녀별 */}
            {childForms.map((cf, ci) => {
              const childSubs = allSubs.filter((s) => s.childId === cf.id && rawStatus(s) !== "expired");
              return (
              <div key={cf.id} className="bg-p-bg rounded-lg px-4 py-[14px]">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#615d59" }}>학생 {ci + 1}</p>
                  <button
                    onClick={async () => {
                      if (!confirm(`${cf.name} 학생과 모든 구독 기록을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) return;
                      try {
                        const subsSnap = await getDocs(query(collection(db, "subscriptions"), where("childId", "==", cf.id)));
                        const batch = writeBatch(db);
                        subsSnap.docs.forEach((d) => batch.delete(d.ref));
                        batch.delete(doc(db, "children", cf.id));
                        batch.delete(doc(db, "studentProfiles", cf.id));
                        await batch.commit();
                        setChildForms((prev) => prev.filter((x) => x.id !== cf.id));
                      } catch (e) { setError(e instanceof Error ? e.message : "자녀 삭제 실패"); }
                    }}
                    disabled={saving || deleting}
                    style={{ height: 28, padding: "0 10px", borderRadius: 5, border: "1px solid rgba(192,0,0,0.25)", backgroundColor: "transparent", fontSize: 11, color: "#c0392b", cursor: "pointer" }}
                  >
                    자녀 삭제
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <div>
                    <label className={LABEL_CLS}>이름</label>
                    <input className={INPUT_CLS} value={cf.name}
                      onChange={(e) => setChildForms((prev) => prev.map((x, i) => i === ci ? { ...x, name: e.target.value } : x))} />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>학년</label>
                    <select value={cf.grade}
                      onChange={(e) => setChildForms((prev) => prev.map((x, i) => i === ci ? { ...x, grade: e.target.value } : x))}
                      style={{ ...scheduleSelectStyle, width: "100%", minWidth: 0, height: 38 }}>
                      {GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label className={LABEL_CLS}>로그인 아이디</label>
                    <input className={INPUT_CLS + " font-mono"} value={cf.loginId}
                      onChange={(e) => setChildForms((prev) => prev.map((x, i) => i === ci ? { ...x, loginId: e.target.value } : x))} />
                  </div>
                </div>
                <label className={LABEL_CLS}>학습 스케줄</label>
                <ScheduleEditor
                  schedule={schedules[cf.id] ?? []}
                  onChange={(s) => setSchedules((prev) => ({ ...prev, [cf.id]: s }))}
                  serviceOptions={CLASS_SERVICES_DIRECT}
                />
                {childSubs.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <label className={LABEL_CLS}>구독 중인 서비스</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {childSubs.map((sub) => {
                        const svc = SERVICES.find((s) => s.slug === sub.serviceSlug);
                        return (
                          <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#615d59" }}>
                            {svc && <ServiceIcon service={svc} size={14} />}
                            <span style={{ flex: 1 }}>{svc?.name ?? sub.serviceSlug}</span>
                            <span style={{ fontSize: 11, color: "#a39e98" }}>~{sub.endDate?.toLocaleDateString("ko-KR") ?? "-"}</span>
                            <button onClick={async () => { if (!confirm(`${svc?.name ?? sub.serviceSlug} 구독을 삭제하시겠습니까?`)) return; await deleteDoc(doc(db, "subscriptions", sub.id)); }}
                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#c0a0a0", padding: "0 2px", lineHeight: 1 }}>×</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
            })}

            {/* 서비스 추가 */}
            <ServiceAddSection familyId={family.id} children={childForms} allSubs={allSubs} hasAiPackage={!!family.aiPackageEndDate} userId={family.userId} />

            {error && <p style={{ margin: 0, color: "#c0392b", fontSize: 13 }}>{error}</p>}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={handleDelete} disabled={deleting || saving}
                style={{ marginRight: "auto", height: 36, padding: "0 12px", borderRadius: 6, border: "1px solid rgba(192,0,0,0.25)", backgroundColor: "transparent", fontSize: 13, color: "#c0392b", cursor: "pointer", opacity: deleting ? 0.6 : 1 }}>
                {deleting ? "삭제 중…" : "가족 삭제"}
              </button>
              <button onClick={onClose} className={MODAL_BTN_GHOST_CLS}>취소</button>
              <button onClick={handleSave} disabled={saving} className={MODAL_BTN_PRIMARY_CLS} style={{ opacity: saving ? 0.7 : 1 }}>
                {saving ? "저장 중…" : "수정 완료"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function DirectStudentCard({ cls, onReset, serviceSlug }: { cls: DirectClass; onReset: (classId: string, loginId: string) => void; serviceSlug?: string }) {
  const [editing, setEditing] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [expandedLearningLoginId, setExpandedLearningLoginId] = useState<string | null>(null);
  const [childIdMap, setChildIdMap] = useState<Record<string, string>>({});
  const { startTask } = useSendToast();
  const parentStudent = cls.students[0] ?? { name: "", studentPhone: "", studentLoginId: "", parentPhone: "", parentLoginId: "" };

  // loginId → childId 매핑 (children 컬렉션 조회)
  useEffect(() => {
    const loginIds = cls.students.map((s) => s.studentLoginId?.toLowerCase()).filter(Boolean) as string[];
    if (loginIds.length === 0) return;
    const unsubs = loginIds.map((lid) => {
      const q = query(collection(db, "children"), where("loginId", "==", lid));
      return onSnapshot(q, (snap) => {
        if (!snap.empty) {
          setChildIdMap((prev) => ({ ...prev, [lid]: snap.docs[0].id }));
        }
      });
    });
    return () => unsubs.forEach((u) => u());
  }, [cls.students]);
  const firstStudentName = cls.students[0]?.name ?? cls.name;
  const parentLabel = cls.parentName || `${firstStudentName}맘`;
  const className = cls.name !== firstStudentName ? cls.name : null;

  // 새 만료일 미리보기 (현재 만료일 기준 +1개월 말일)
  function calcNewExpiry(current: string | null | undefined): string {
    const base = current ? new Date(current + "T00:00:00+09:00") : new Date();
    const now = new Date();
    const from = base > now ? base : now;
    const d = new Date(from.getFullYear(), from.getMonth() + 2, 0);
    return d.toLocaleDateString("ko-KR");
  }

  function handleConfirmPayment() {
    const fn = httpsCallable<{ classId: string }, { newExpiry: string }>(functions, "confirmDirectClassPayment");
    startTask({
      label: `${cls.students.map(s => s.name).join(", ")} 입금확인`,
      task: () => fn({ classId: cls.id }),
      successText: "입금확인 완료",
    });
    setConfirmingPayment(false);
  }

  async function updateClass(field: string, value: unknown) {
    await updateDoc(doc(db, "directClasses", cls.id), { [field]: value });
  }

  async function updateStudentField(idx: number, field: keyof DirectClassStudent, value: string) {
    const base = cls.students.length > 0 ? cls.students : [parentStudent];
    const updated = base.map((s, i) => i === idx ? { ...s, [field]: value } : s);
    await updateDoc(doc(db, "directClasses", cls.id), { students: updated });
  }

  return (
    <>
    {editing && <DirectClassEditModal cls={cls} onClose={() => setEditing(false)} />}
    {confirmingPayment && (
      <>
        <div onClick={() => setConfirmingPayment(false)} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 200 }} />
        <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(360px, 92vw)", backgroundColor: "#ffffff", borderRadius: 12, boxShadow: T.shadowFloat, zIndex: 201, padding: "24px 24px 20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>입금 확인</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#a39e98" }}>학생</span>
              <span style={{ fontWeight: 600 }}>{cls.students.map(s => s.name).join(", ")}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#a39e98" }}>수업료</span>
              <span style={{ fontWeight: 600 }}>{cls.tuition.toLocaleString("ko-KR")}원</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#a39e98" }}>현재 만료일</span>
              <span>{cls.expiry ? new Date(cls.expiry + "T00:00:00+09:00").toLocaleDateString("ko-KR") : "-"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#a39e98" }}>연장 후 만료일</span>
              <span style={{ fontWeight: 700, color: "#1a7f4b" }}>{calcNewExpiry(cls.expiry)}</span>
            </div>
          </div>
          <p style={{ margin: "0 0 16px", fontSize: 12, color: "#a39e98" }}>확인 시 만료일이 연장되고 SMS가 자동 발송됩니다.</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setConfirmingPayment(false)} style={{ padding: "8px 16px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.1)", background: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#615d59" }}>취소</button>
            <button onClick={handleConfirmPayment} style={{ padding: "8px 16px", borderRadius: 4, border: "none", backgroundColor: "#1a7f4b", color: "#ffffff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              ✅ 입금 확인
            </button>
          </div>
        </div>
      </>
    )}
    <div className="relative bg-white border border-black/10 rounded-xl p-5" style={{ boxShadow: T.shadow }}>
      {/* 학부모 헤더 — FamilyCard 동일 구조 */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <span
              onClick={parentStudent.parentLoginId ? () => window.open(`/admin/preview?type=parent&loginId=${encodeURIComponent(parentStudent.parentLoginId)}&name=${encodeURIComponent(parentLabel)}`, "_blank") : undefined}
              title={parentStudent.parentLoginId ? "학부모 화면 미리보기 (새창)" : undefined}
              style={{ fontSize: 15, fontWeight: 700, color: "rgba(0,0,0,0.95)", cursor: parentStudent.parentLoginId ? "pointer" : "default" }}
            >{parentLabel}</span>
            <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "2px 7px", backgroundColor: "rgba(92,78,220,0.08)", color: "#5c4edc", border: "1px solid rgba(92,78,220,0.2)" }}>1:1수업</span>
            {parentStudent.parentLoginId && (
              <>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: "#a39e98", backgroundColor: "#f6f5f4", borderRadius: 4, padding: "2px 6px" }}>
                  <EditableText value={parentStudent.parentLoginId} onSave={(v) => updateStudentField(0, "parentLoginId", v)} muted fontSize={11} />
                </span>
                <CopyBtn text={parentStudent.parentLoginId} />
              </>
            )}
            <KeyBtn onClick={() => onReset(cls.id, parentStudent.parentLoginId)} />
            <button onClick={() => setEditing(true)} title="수정" style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1 }}><Settings size={14} strokeWidth={1.5} color="rgba(0,0,0,0.95)" /></button>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#a39e98", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            {parentStudent.parentPhone && (
              <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <span style={{ fontSize: 12, color: "#a39e98" }}>{formatPhone(parentStudent.parentPhone)}</span>
                <CopyBtn text={parentStudent.parentPhone} />
              </span>
            )}
          </div>
        </div>
        {!serviceSlug && cls.tuition > 0 && (
          <FinanceBox
            revenue={cls.tuition}
            discount={0}
            agencyFee={cls.agencyFee}
            profit={cls.tuition - cls.agencyFee}
            personal
          />
        )}
      </div>

      {/* 학생 목록 — 다중 학생 지원 */}
      <div className="rounded-lg bg-p-bg px-[14px] py-3 text-[13px]">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(cls.students.length > 0 ? cls.students : [parentStudent])
            .map((student, si) => ({ student, si }))
            .filter(({ student }) => !serviceSlug || (student.serviceSlugs ?? cls.serviceSlugs).includes(serviceSlug))
            .map(({ student, si }) => {
            const studentGrade = student.grade ?? cls.grades[si] ?? cls.grades[0] ?? "";
            const studentSlugs = student.serviceSlugs ?? cls.serviceSlugs;
            return (
              <div key={si}>
                {/* 학생 이름/학년/아이디 행 */}
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: studentSlugs.length > 0 ? 6 : 0 }}>
                  <strong
                    onClick={student.studentLoginId && childIdMap[student.studentLoginId.toLowerCase()] ? () => window.open(`/admin/preview?type=learn&loginId=${encodeURIComponent(student.studentLoginId!)}&name=${encodeURIComponent(student.name || "")}`, "_blank") : undefined}
                    title={student.studentLoginId && childIdMap[student.studentLoginId.toLowerCase()] ? "학생 화면 미리보기 (새창)" : undefined}
                    style={{ color: "rgba(0,0,0,0.95)", cursor: student.studentLoginId && childIdMap[student.studentLoginId.toLowerCase()] ? "pointer" : "default" }}
                  >{student.name || cls.name}</strong>
                  <select value={studentGrade}
                    onChange={async (e) => {
                      if (cls.students.length > 1) {
                        updateStudentField(si, "grade", e.target.value);
                      } else {
                        updateClass("grades", [e.target.value]);
                      }
                    }}
                    style={{ fontSize: 13, color: "#a39e98", cursor: "pointer", borderRadius: 3, padding: "1px 3px", border: "none", background: "transparent", outline: "none" }}>
                    {DIRECT_GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                  {student.studentLoginId && (
                    <>
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: "#a39e98", backgroundColor: "rgba(0,0,0,0.05)", borderRadius: 4, padding: "2px 6px" }}>
                        <EditableText value={student.studentLoginId} onSave={(v) => updateStudentField(si, "studentLoginId", v)} mono muted fontSize={11} />
                      </span>
                      <CopyBtn text={student.studentLoginId} />
                    </>
                  )}
                  <KeyBtn onClick={() => onReset(cls.id, student.studentLoginId ?? "")} />
                  {student.studentPhone && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                      <EditableText value={student.studentPhone} onSave={(v) => updateStudentField(si, "studentPhone", v)} muted fontSize={12} />
                      <CopyBtn text={student.studentPhone} />
                    </span>
                  )}
                  {student.studentLoginId && childIdMap[student.studentLoginId.toLowerCase()] && (
                    <button
                      onClick={() => setExpandedLearningLoginId(expandedLearningLoginId === student.studentLoginId ? null : (student.studentLoginId ?? null))}
                      className="ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-md cursor-pointer"
                      style={{
                        border: expandedLearningLoginId === student.studentLoginId ? "1.5px solid #38a848" : "1px solid rgba(0,0,0,0.1)",
                        backgroundColor: expandedLearningLoginId === student.studentLoginId ? "#f0faf1" : "#fff",
                        color: expandedLearningLoginId === student.studentLoginId ? "#2da040" : "#a39e98",
                      }}>
                      <BarChart3 size={12} strokeWidth={1.5} className="inline-block mr-0.5" /> 학습
                    </button>
                  )}
                </div>
                {/* FamilyCard와 동일한 1fr 68px 110px 그리드 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                  {/* 수업명 행 — 구독행과 동일 그리드 */}
                  {(() => {
                    const daysLeftDirect = cls.expiry ? Math.ceil((new Date(cls.expiry + "T00:00:00+09:00").getTime() - Date.now()) / 86400000) : null;
                    const showDirectSms = daysLeftDirect !== null && daysLeftDirect >= 0 && daysLeftDirect <= 7;
                    const directPhone = parentStudent.parentPhone ?? "";
                    const directParentName = cls.parentName ?? `${parentStudent.name}맘`;
                    const directChildNames = cls.students.map((s) => s.name).filter(Boolean).join(", ");
                    const directServiceNames = (cls.serviceSlugs ?? []).map((sl) => CLASS_SERVICES_DIRECT.find((sv) => sv.slug === sl)?.name ?? sl).join(", ");
                    const directEndDate = cls.expiry ? new Date(cls.expiry + "T00:00:00+09:00").toLocaleDateString("ko-KR") : "";
                    const directParentId = parentStudent.parentLoginId ?? "";
                    return (
                      <div style={{ display: "grid", gridTemplateColumns: showDirectSms ? "1fr 68px 110px 24px" : "1fr 68px 110px", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#615d59", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cls.name}</span>
                        <button onClick={() => setConfirmingPayment(true)} style={{ appearance: "none", WebkitAppearance: "none", fontSize: 11, fontWeight: 600, color: "#1a7f4b", backgroundColor: "rgba(26,127,75,0.08)", border: "1px solid rgba(26,127,75,0.2)", borderRadius: 4, padding: "2px 6px", cursor: "pointer", width: 68, textAlign: "center" }}>입금확인</button>
                        <div style={{ textAlign: "right" }}>
                          <InlineDateField value={cls.expiry} onSave={(v) => updateDoc(doc(db, "directClasses", cls.id), { expiry: v })} />
                        </div>
                        {showDirectSms && (
                          <SmsSendBtn
                            family={{ id: cls.id, parentName: directParentName, phone: directPhone } as MemberFamily}
                            childNames={directChildNames}
                            serviceNames={directServiceNames || cls.name}
                            endDate={directEndDate}
                            parentId={directParentId}
                            isDirect
                            tuition={cls.tuition ?? 0}
                          />
                        )}
                      </div>
                    );
                  })()}
                  {/* 서비스 행 */}
                  {studentSlugs.map((slug) => {
                    const svc = SERVICES.find((s) => s.slug === slug);
                    if (!svc) return null;
                    return (
                      <div key={slug} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#615d59" }}>
                        <ServiceIcon service={svc} size={14} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{svc.name}</span>
                      </div>
                    );
                  })}
                </div>
                {/* 학습 그리드 */}
                {expandedLearningLoginId === student.studentLoginId && student.studentLoginId && childIdMap[student.studentLoginId.toLowerCase()] && (
                  <StudentLearningGrid
                    childId={childIdMap[student.studentLoginId.toLowerCase()]}
                    childName={student.name}
                    subscribedSlugs={studentSlugs}
                  />
                )}
              </div>
            );
          })}
        </div>
        {cls.notes && (
          <div style={{ fontSize: 12, color: "#a39e98", marginTop: 8 }}>
            <EditableText value={cls.notes} onSave={(v) => updateClass("notes", v)} muted fontSize={12} />
          </div>
        )}
      </div>
    </div>
    </>
  );
}

// ── 직강 학생 목록 ─────────────────────────────────────────────────────────────

function DirectStudentList({ classes, searchQuery, onReset, serviceSlug }: { classes: DirectClass[]; searchQuery: string; onReset: (classId: string, loginId: string) => void; serviceSlug?: string }) {
  const q = searchQuery.trim().toLowerCase();
  const filtered = classes.filter((c) => {
    if (serviceSlug) {
      if (c.status !== "active") return false;
      if (!c.students.some((s) => (s.serviceSlugs ?? c.serviceSlugs).includes(serviceSlug))) return false;
    }
    if (!q) return true;
    if (c.name.toLowerCase().includes(q) || (c.parentName ?? "").toLowerCase().includes(q) || c.notes.toLowerCase().includes(q)) return true;
    return c.students.some((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.studentPhone ?? "").includes(q) ||
      (s.studentLoginId ?? "").toLowerCase().includes(q) ||
      (s.parentPhone ?? "").includes(q) ||
      (s.parentLoginId ?? "").toLowerCase().includes(q)
    );
  });

  if (filtered.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {filtered.map((cls) => <DirectStudentCard key={cls.id} cls={cls} onReset={onReset} serviceSlug={serviceSlug} />)}
    </div>
  );
}

// ── 가족 목록 ─────────────────────────────────────────────────────────────────

function FamilyList({ families, allChildren, allSubs, onResetByFamily, onResetAttendance, statusFilter, svcFilter }: {
  families: MemberFamily[];
  allChildren: MemberChild[];
  allSubs: MemberSub[];
  onResetByFamily: (familyId: string, loginId: string) => void;
  onResetAttendance?: (childId: string, childName: string) => void;
  statusFilter: StatusFilter;
  svcFilter?: string | null;
}) {
  const [editingFamilyId, setEditingFamilyId] = useState<string | null>(null);
  const [expandedLearningChildId, setExpandedLearningChildId] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  if (families.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {families.map((family) => {
        const children = allChildren.filter((c) => c.familyId === family.id);
        const familySubs = allSubs.filter((s) => children.some((c) => c.id === s.childId) || (!s.childId && s.familyId === family.id));
        const baseTotals = family.isTest
          ? { revenue: 0, discount: 0, agencyFee: 0, profit: 0, count: 0 }
          : calcTotals(familySubs, undefined, svcFilter && svcFilter !== "__direct__" ? svcFilter : null);
        const aiActive = !family.isTest && family.aiPackageEndDate && family.aiPackageEndDate >= today && (!svcFilter || svcFilter === "momsaipack");
        const totals = aiActive
          ? { ...baseTotals, revenue: baseTotals.revenue + AI_PACKAGE_PRICE, profit: baseTotals.profit + AI_PACKAGE_PRICE }
          : baseTotals;
        const parentId = family.momId ?? family.parentPlantorId ?? (family.userId ? `uid:${family.userId.slice(0, 8)}` : "-");

        return (
          <div key={family.id} className="relative bg-white border border-black/10 rounded-xl p-5" style={{ boxShadow: T.shadow }}>
            {editingFamilyId === family.id && (
              <FamilyEditModal family={family} children={children} allSubs={familySubs} onClose={() => setEditingFamilyId(null)} />
            )}
            {/* 가족/자녀 삭제는 수정 모달에서 처리 */}
            {/* 학부모 헤더 */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: (children.length > 0 || !!family.aiPackageEndDate) ? 14 : 0 }}>
              <div className="mt-family-info">
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <span
                    onClick={family.userId ? () => window.open(`/admin/preview?type=parent&uid=${family.userId}&name=${encodeURIComponent(family.parentName)}`, "_blank") : undefined}
                    title={family.userId ? "학부모 화면 미리보기 (새창)" : undefined}
                    style={{ fontSize: 15, fontWeight: 700, color: "rgba(0,0,0,0.95)", cursor: family.userId ? "pointer" : "default" }}
                  >{family.parentName}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "2px 7px", backgroundColor: "rgba(56,168,72,0.08)", color: "#38a848", border: "1px solid rgba(56,168,72,0.2)" }}>플랜토</span>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "#a39e98", backgroundColor: "#f6f5f4", borderRadius: 4, padding: "2px 6px" }}>{parentId}</span>
                  <CopyBtn text={parentId} />
                  <KeyBtn onClick={() => onResetByFamily(family.id, parentId)} />
                  <button onClick={() => setEditingFamilyId(family.id)} title="수정" className="mt-family-settings" style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1 }}><Settings size={14} strokeWidth={1.5} color="rgba(0,0,0,0.95)" /></button>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: "#a39e98", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                  {family.phone && <span style={{ display: "flex", alignItems: "center", gap: 2 }}>{formatPhone(family.phone)}<CopyBtn text={family.phone} /></span>}
                  {family.createdAt && <span className="mt-family-createdat">가입 {formatDateTime(family.createdAt)}</span>}
                </div>
              </div>

              {/* 재무 박스 — 우측 상단 */}
              {totals.revenue > 0 && (
                <FinanceBox
                  revenue={totals.revenue}
                  discount={totals.discount}
                  agencyFee={totals.agencyFee}
                  profit={totals.profit}
                  personal
                />
              )}
            </div>

            {/* 자녀 목록 + AI 패키지 */}
            {(children.length > 0 || !!family.aiPackageEndDate || allSubs.some((s) => !s.childId && s.familyId === family.id)) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* 학부모 서비스 (AI패키지 + 고전독서모임 등) */}
                {(() => {
                  const parentSubs = allSubs.filter((s) => !s.childId && s.familyId === family.id);
                  const hasParentRow = !!family.aiPackageEndDate || parentSubs.length > 0;
                  if (!hasParentRow) return null;
                  return (
                    <div className="rounded-lg bg-p-bg px-[14px] py-[10px] text-[13px]">
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {family.aiPackageEndDate && (
                          <AiPackageRow familyId={family.id} userId={family.userId} endDate={family.aiPackageEndDate} />
                        )}
                        {parentSubs.map((sub) => {
                          const svc = SERVICES.find((s) => s.slug === sub.serviceSlug);
                          return (
                            <div key={sub.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto 24px", alignItems: "center", gap: 8 }}>
                              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#615d59", overflow: "hidden" }}>
                                {svc && <ServiceIcon service={svc} size={14} />}
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{svc?.name ?? sub.serviceSlug}</span>
                              </span>
                              <SubStatusBadge sub={sub} />
                              <div style={{ textAlign: "right" }}>
                                <EditableDate sub={sub} />
                              </div>
                              <span />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                {/* 같은 이름 자녀 통합 */}
                {Object.values(
                  children.reduce<Record<string, { primary: MemberChild; ids: string[] }>>((acc, c) => {
                    if (!acc[c.name]) {
                      acc[c.name] = { primary: c, ids: [c.id] };
                    } else {
                      acc[c.name].ids.push(c.id);
                    }
                    return acc;
                  }, {})
                ).map((group) => {
                  const child = group.primary;
                  const allChildSubs = allSubs.filter((s) => s.childId !== null && group.ids.includes(s.childId));
                  // 서비스 필터 시 해당 서비스를 안 듣는 자녀 숨김
                  const isSvcSlugFilter = svcFilter && svcFilter !== "__plantor__" && svcFilter !== "__direct__" && svcFilter !== "momsaipack";
                  if (isSvcSlugFilter && !allChildSubs.some((s) => s.serviceSlug === svcFilter)) return null;
                  const subs = (statusFilter === "all"
                    ? allChildSubs
                    : allChildSubs.filter((s) => effectiveStatus(s) === statusFilter)
                  ).filter((s) => !isSvcSlugFilter || s.serviceSlug === svcFilter);
                  // 매칭 구독 없는 자녀 숨김 (statusFilter가 active/stopped일 때)
                  if (statusFilter !== "all" && subs.length === 0) return null;
                  // 자녀 단위 통합 만료 알림 (수강중인 모든 과목을 한 번에)
                  const activeChildSubs = allChildSubs.filter((s) => effectiveStatus(s) === "active");
                  const childSvcNames = activeChildSubs
                    .map((s) => SERVICES.find((x) => x.slug === s.serviceSlug)?.name ?? s.serviceSlug)
                    .join(", ");
                  const childNearestEnd = activeChildSubs.reduce<Date | null>(
                    (min, s) => (s.endDate && (!min || s.endDate < min) ? s.endDate : min),
                    null
                  );
                  const childDaysLeft = childNearestEnd ? Math.ceil((childNearestEnd.getTime() - Date.now()) / 86400000) : null;
                  const showChildSms = activeChildSubs.length > 0 && childDaysLeft !== null && childDaysLeft >= 0 && childDaysLeft <= 7;
                  return (
                    <div key={child.id} className="relative rounded-lg bg-p-bg text-[13px] overflow-hidden">
                      {/* 자녀 헤더 */}
                      <div className="px-[14px] py-3">
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: subs.length > 0 ? 10 : 0 }}>
                          <span
                            onClick={() => window.open(`/admin/preview?type=learn&childId=${child.id}&name=${encodeURIComponent(child.name)}`, "_blank")}
                            title="학생 화면 미리보기 (새창) · 이름 수정은 ⚙"
                            style={{ fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.95)", cursor: "pointer" }}
                          >{child.name}</span>
                          <EditableGrade childId={child.id} grade={child.grade} />
                          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#a39e98", backgroundColor: "rgba(0,0,0,0.05)", borderRadius: 4, padding: "2px 6px" }}>
                            {child.loginId || "-"}
                          </span>
                          {child.loginId && <CopyBtn text={child.loginId} />}
                          <KeyBtn onClick={() => onResetByFamily(family.id, child.loginId || parentId)} />
                          <button
                            onClick={() => setExpandedLearningChildId(expandedLearningChildId === child.id ? null : child.id)}
                            className="ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-md cursor-pointer"
                            style={{
                              border: expandedLearningChildId === child.id ? "1.5px solid #38a848" : "1px solid rgba(0,0,0,0.1)",
                              backgroundColor: expandedLearningChildId === child.id ? "#f0faf1" : "#fff",
                              color: expandedLearningChildId === child.id ? "#2da040" : "#a39e98",
                            }}>
                            <BarChart3 size={12} strokeWidth={1.5} className="inline-block mr-0.5" /> 학습
                          </button>
                          {activeChildSubs.length > 0 && (
                            <SmsSendBtn
                              family={family}
                              childNames={child.name}
                              serviceNames={childSvcNames}
                              endDate={childNearestEnd?.toLocaleDateString("ko-KR") ?? ""}
                              parentId={parentId}
                              disabled={!showChildSms}
                            />
                          )}
                        </div>

                        {/* 구독 목록 */}
                        {subs.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {subs.map((sub) => {
                              const svc = SERVICES.find((s) => s.slug === sub.serviceSlug);
                              return (
                                <div key={sub.id} className="mt-child-sub-row" style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr auto auto",
                                  alignItems: "center",
                                  gap: 8,
                                }}>
                                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#615d59", overflow: "hidden" }}>
                                    {svc && <ServiceIcon service={svc} size={14} />}
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{svc?.name ?? sub.serviceSlug}</span>
                                  </span>
                                  <SubStatusBadge sub={sub} />
                                  <div style={{ textAlign: "right" }}>
                                    <EditableDate sub={sub} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* 학습 그리드 */}
                      {expandedLearningChildId === child.id && (
                        <StudentLearningGrid
                          childId={child.id}
                          childName={child.name}
                          subscribedSlugs={allChildSubs.filter(s => effectiveStatus(s) === "active").map(s => s.serviceSlug)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
