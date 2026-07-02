"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, type User } from "firebase/auth";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, Timestamp } from "firebase/firestore";
import { auth, db, functions } from "@/lib/firebase";
import { SERVICES } from "@/data/site";
import { formatDateTime, formatWon, tsToDate } from "@/lib/format";
import type { MemberFamily, MemberChild, Subscription as MemberSub, Signup, SignupStatus, SignupChild, RenewalRequest } from "@/lib/types";

import { useAuth } from "@/lib/auth-context";
import { T } from "@/lib/design-tokens";
import { CenterMsg } from "@/components/ui/center-msg";
import { SendToastProvider, useSendToast } from "@/lib/send-toast";
import { SignupRow } from "./signup-row";
import { MembersTab } from "./members-tab";
import { PlanTab } from "./plan-tab";

import { MessagesTab } from "./messages-tab";


function RenewalApproveButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={loading}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      className="w-full h-9 rounded-lg bg-p-green text-white text-[13px] font-semibold border-none"
      style={{
        cursor: loading ? "wait" : "pointer",
        opacity: loading ? 0.7 : 1,
        transform: pressed && !loading ? "scale(0.97)" : "scale(1)",
        transition: "transform 0.1s ease, opacity 0.15s",
      }}
    >
      {loading ? "처리 중…" : "입금 확인"}
    </button>
  );
}

export function AdminShell() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  if (loading) return <CenterMsg>인증 확인 중…</CenterMsg>;
  if (!user) { router.replace("/"); return null; }

  if (role !== "admin") {
    return (
      <CenterMsg>
        <p className="mb-4 text-p-secondary">이 계정({user.email})은 운영자가 아닙니다.</p>
        <button
          onClick={() => signOut(auth)}
          className="rounded border border-black/10 px-5 py-2 text-[13px] font-medium text-p-secondary bg-transparent cursor-pointer"
        >로그아웃</button>
      </CenterMsg>
    );
  }

  return (
    <SendToastProvider>
      <Dashboard user={user} />
    </SendToastProvider>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ user }: { user: User }) {
  const { startTask } = useSendToast();
  const [activeTab, setActiveTab] = useState<"members" | "plan" | "messages">("members");
  const [draftByChild, setDraftByChild] = useState<Record<string, number>>({});
  const [showSignups, setShowSignups] = useState(false);
  const [showRenewals, setShowRenewals] = useState(false);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [renewalRequests, setRenewalRequests] = useState<RenewalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [families, setFamilies] = useState<MemberFamily[]>([]);
  const [allChildren, setAllChildren] = useState<MemberChild[]>([]);
  const [allSubs, setAllSubs] = useState<MemberSub[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  // 회원 데이터 로드 (항상)
  useEffect(() => {
    const userPlantorIds: Record<string, string> = {};
    let unsubFamilies: (() => void) | undefined;
    let unsubChildren: (() => void) | undefined;
    let unsubSubs: (() => void) | undefined;

    getDocs(collection(db, "users")).then((usersSnap) => {
      usersSnap.docs.forEach((d) => { userPlantorIds[d.id] = d.data().plantor_id ?? ""; });

      unsubFamilies = onSnapshot(query(collection(db, "families"), orderBy("createdAt", "desc")), (snap) => {
        setFamilies(snap.docs.map((d) => {
          const data = d.data();
          const plantorId = data.userId ? (userPlantorIds[data.userId] || null) : null;
          return {
            id: d.id,
            parentName: data.parentName ?? "",
            phone: data.phone ?? "",
            signupId: data.signupId ?? "",
            userId: data.userId ?? null,
            createdAt: tsToDate(data.createdAt),
            parentPlantorId: plantorId ?? data.parentPlantorId ?? undefined,
            momId: data.momId ?? undefined,
            couponCode: data.couponCode ?? null,
            couponDiscount: data.couponDiscount ?? 0,
            isTest: data.isTest ?? false,
            aiPackageEndDate: data.aiPackageEndDate ?? undefined,
          };
        }));
      });

      unsubChildren = onSnapshot(query(collection(db, "children")), (snap) => {
        setAllChildren(snap.docs.map((d) => {
          const data = d.data();
          return { id: d.id, familyId: data.familyId ?? "", name: data.name ?? "", grade: data.grade ?? "", loginId: data.loginId ?? "", createdAt: tsToDate(data.createdAt) };
        }));
      });

      unsubSubs = onSnapshot(query(collection(db, "subscriptions")), (snap) => {
        setAllSubs(snap.docs.map((d) => {
          const data = d.data();
          return { id: d.id, familyId: data.familyId ?? "", childId: data.childId ?? "", serviceSlug: data.serviceSlug ?? "", monthlyPrice: data.monthlyPrice ?? 0, status: data.status ?? "active", startDate: tsToDate(data.startDate), endDate: tsToDate(data.endDate), discount: data.discount ?? 0, agencyFee: data.agencyFee ?? 0 };
        }).filter((s) => s.status !== "transferred"));
        setMembersLoading(false);
      });
    });

    return () => { unsubFamilies?.(); unsubChildren?.(); unsubSubs?.(); };
  }, []);

  // 확정 대기 초안(draft) 과제 수 — 학생별 집계 (플랜 관리 탭 뱃지/배너용)
  useEffect(() => {
    return onSnapshot(query(collection(db, "tasks"), where("status", "==", "draft")), (snap) => {
      const counts: Record<string, number> = {};
      snap.docs.forEach((d) => {
        const cid = d.data().childId;
        if (cid) counts[cid] = (counts[cid] ?? 0) + 1;
      });
      setDraftByChild(counts);
    });
  }, []);

  // 연장 신청 로드
  useEffect(() => {
    return onSnapshot(
      query(collection(db, "renewalRequests"), where("status", "==", "pending"), orderBy("createdAt", "desc")),
      (snap) => setRenewalRequests(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          familyId: data.familyId ?? "",
          childId: data.childId ?? "",
          subscriptionId: data.subscriptionId ?? null,
          childName: data.childName ?? "",
          serviceName: data.serviceName ?? "",
          serviceSlug: data.serviceSlug ?? "",
          months: data.months ?? 0,
          amount: data.amount ?? 0,
          couponCode: data.couponCode ?? null,
          couponNote: data.couponNote ?? null,
          couponDiscount: data.couponDiscount ?? 0,
          referralCode: data.referralCode ?? null,
          referralDiscount: data.referralDiscount ?? 0,
          walletCouponIds: data.walletCouponIds ?? [],
          walletDiscount: data.walletDiscount ?? 0,
          finalAmount: data.finalAmount ?? data.amount ?? 0,
          currentEndDate: data.currentEndDate ? (data.currentEndDate as Timestamp).toDate() : null,
          isParentService: data.isParentService ?? false,
          isNewChild: data.isNewChild ?? false,
          newChildGrade: data.newChildGrade ?? "",
          newChildLoginId: data.newChildLoginId ?? "",
          status: data.status ?? "pending",
          createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : null,
        };
      })),
      (err) => { alert("연장신청 로딩 오류: " + err.message); }
    );
  }, []);

  // 신청 목록 로드
  useEffect(() => {
    return onSnapshot(query(collection(db, "signups"), orderBy("createdAt", "desc")), (snap) => {
      setSignups(snap.docs.map((d) => {
        const data = d.data();
        const createdAt = tsToDate(data.createdAt);
        let children: SignupChild[];
        if (Array.isArray(data.children)) {
          children = data.children.map((c: Record<string, unknown>) => ({
            name: String(c?.name ?? ""), grade: String(c?.grade ?? ""),
            loginId: String(c?.loginId ?? ""),
            selectedServices: Array.isArray(c?.selectedServices) ? (c.selectedServices as string[]) : [],
            serviceMonths: (c?.serviceMonths ?? {}) as Record<string, number>,
          }));
        } else {
          children = [{ name: String(data.childName ?? ""), grade: String(data.childGrade ?? ""), loginId: "", selectedServices: Array.isArray(data.selectedServices) ? data.selectedServices : [] }];
        }
        return {
          id: d.id,
          parentName: data.parentName ?? "",
          phone: data.phone ?? "",
          children,
          estimatedMonthly: data.estimatedMonthly ?? 0,
          couponCode: data.couponCode ?? null,
          couponDiscount: data.couponDiscount ?? 0,
          finalMonthly: data.finalMonthly ?? data.estimatedMonthly ?? 0,
          status: (data.status ?? "pending") as SignupStatus,
          createdAt,
          convertedFamilyId: data.convertedFamilyId ?? null,
          userId: data.userId ?? null,
          parentId: data.parentId ?? null,
          referralCode: data.referralCode ?? null,
          referrerId: data.referrerId ?? null,
          referralDiscount: data.referralDiscount ?? 0,
          parentServices: Array.isArray(data.parentServices) ? data.parentServices as string[] : [],
          parentServiceMonths: (data.parentServiceMonths ?? {}) as Record<string, number>,
          depositTotal: data.depositTotal ?? 0,
        };
      }));
      setLoading(false);
    }, (err) => { setError(err.message); setLoading(false); });
  }, []);

  async function changeStatus(id: string, status: SignupStatus) {
    try { await updateDoc(doc(db, "signups", id), { status }); }
    catch (err) { alert(err instanceof Error ? err.message : "상태 변경 중 오류가 발생했습니다."); }
  }

  // 계정 생성 전, 신청서의 로그인 ID 수정 (approveSignup이 이 필드들을 읽어 계정 생성)
  async function editParentId(signupId: string, newId: string) {
    await updateDoc(doc(db, "signups", signupId), { parentId: newId });
  }
  async function editChildId(signup: Signup, childIdx: number, newId: string) {
    const children = signup.children.map((c, i) => (i === childIdx ? { ...c, loginId: newId } : c));
    await updateDoc(doc(db, "signups", signup.id), { children });
  }

  async function deleteSignup(id: string) {
    try {
      await deleteDoc(doc(db, "signups", id));
    } catch (err) { alert(err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다."); }
  }

  async function handleResetPassword(signupId: string) {
    if (!confirm("비밀번호를 012345로 초기화하시겠습니까?")) return;
    try {
      const { httpsCallable } = await import("firebase/functions");
      const resetPassword = httpsCallable(functions, "resetPassword");
      await resetPassword({ signupId, newPassword: "012345" });
      alert("✅ 비밀번호가 012345로 초기화되었습니다.");
    } catch (err) { alert(err instanceof Error ? `변경 실패: ${err.message}` : "비밀번호 변경 중 오류가 발생했습니다."); }
  }

  async function handleResetAttendance(childId: string, childName: string) {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const today = kst.toISOString().slice(0, 10);
    if (!confirm(`${childName}의 오늘(${today}) 출석 기록을 초기화할까요?\n(attendanceSessions + learningLogs 삭제)`)) return;
    try {
      const [sessSnap, logSnap] = await Promise.all([
        getDocs(query(collection(db, "attendanceSessions"), where("childId", "==", childId), where("date", "==", today))),
        getDocs(query(collection(db, "learningLogs"), where("childId", "==", childId), where("date", "==", today))),
      ]);
      await Promise.all([
        ...sessSnap.docs.map((d) => deleteDoc(d.ref)),
        ...logSnap.docs.map((d) => deleteDoc(d.ref)),
      ]);
      alert(`✅ ${childName} 출석 초기화 완료 (세션 ${sessSnap.size}개, 로그 ${logSnap.size}개 삭제)`);
    } catch (err) { alert(err instanceof Error ? err.message : "오류"); }
  }

  async function handleResetByFamily(familyId: string, loginId: string) {
    try {
      const { httpsCallable } = await import("firebase/functions");
      const resetFn = httpsCallable(functions, "resetPassword");
      await resetFn({ familyId, newPassword: "012345" });
      const msg = `https://plantor.web.app\nID: ${loginId}\n임시비밀번호: 012345`;
      await navigator.clipboard.writeText(msg);
      alert("✅ 비밀번호가 012345로 초기화되었습니다.\n\n클립보드에 복사됨:\n" + msg);
    } catch (err) { alert(err instanceof Error ? `변경 실패: ${err.message}` : "오류"); }
  }

  async function handleResetDirectClass(classId: string, loginId: string) {
    try {
      const { httpsCallable } = await import("firebase/functions");
      const resetFn = httpsCallable(functions, "resetPassword");
      await resetFn({ directClassId: classId, newPassword: "012345" });
      const msg = `https://plantor.web.app\nID: ${loginId}\n임시비밀번호: 012345`;
      await navigator.clipboard.writeText(msg);
      alert("✅ 비밀번호가 012345로 초기화되었습니다.\n\n클립보드에 복사됨:\n" + msg);
    } catch (err) { alert(err instanceof Error ? `변경 실패: ${err.message}` : "오류"); }
  }

  async function approveAsFamily(signup: Signup) {
    if (signup.convertedFamilyId) { alert(`이미 가족으로 등록되어 있습니다 (familyId: ${signup.convertedFamilyId})`); return; }

    // momsaipack 포함 시 만료일 미리 계산 (선택 개월수 기준)
    const hasAiPack = signup.parentServices?.includes("momsaipack") ?? false;
    const aiEndDate = hasAiPack
      ? toLocalDateStr(calcNewEndDate(null, signup.parentServiceMonths?.momsaipack ?? 1))
      : undefined;

    setShowSignups(false);
    startTask({
      label: `${signup.parentName} 가입 승인`,
      successText: "승인 완료",
      task: async () => {
        const { httpsCallable } = await import("firebase/functions");
        const approveFn = httpsCallable<
          { signupId: string; momsaipackEndDate?: string },
          { success: boolean; parentUid: string; familyId: string; childIds: string[]; isNewFamily: boolean }
        >(functions, "approveSignup");
        await approveFn({ signupId: signup.id, ...(aiEndDate ? { momsaipackEndDate: aiEndDate } : {}) });
      },
    });
  }

  function toLocalDateStr(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function calcNewEndDate(currentEndDate: Date | null, months: number): Date {
    const now = new Date();
    const base = currentEndDate && currentEndDate > now ? currentEndDate : now;
    return new Date(base.getFullYear(), base.getMonth() + months + 1, 0);
  }

  async function approveRenewalCore(req: RenewalRequest) {
    const newEnd = calcNewEndDate(req.currentEndDate, req.months);

    if (req.serviceSlug === "momsaipack") {
      const { httpsCallable: hc } = await import("firebase/functions");
      const confirmFn = hc(functions, "confirmAiPackagePayment");
      const endDateStr = toLocalDateStr(newEnd);
      await confirmFn({ familyId: req.familyId, endDate: endDateStr, silent: true });
      await updateDoc(doc(db, "renewalRequests", req.id), { status: "approved" });
    } else {
      let childId = req.childId || null;

      // 신규 자녀: CF로 Auth + Firestore 동시 생성
      if (req.isNewChild && req.newChildLoginId) {
        const { httpsCallable: hc2 } = await import("firebase/functions");
        const createChildFn = hc2<
          { familyId: string; name: string; grade: string; loginId: string },
          { success: boolean; childId: string; childUid: string }
        >(functions, "createChildAccount");
        const result = await createChildFn({
          familyId: req.familyId,
          name: req.childName,
          grade: req.newChildGrade ?? "",
          loginId: req.newChildLoginId,
        });
        childId = result.data.childId;
      }

      // 학부모 서비스(childId=null) 안전망: 신청 doc에 subscriptionId가 없어도
      // 기존 학부모 sub가 있으면 신규 생성 대신 그 sub를 연장. 중복 sub 방지.
      let targetSubId = req.subscriptionId as string | undefined;
      if (!targetSubId && (req.isParentService || !childId)) {
        const existingSnap = await getDocs(query(
          collection(db, "subscriptions"),
          where("familyId", "==", req.familyId),
          where("serviceSlug", "==", req.serviceSlug),
          where("childId", "==", null),
          where("status", "==", "active"),
        ));
        if (!existingSnap.empty) targetSubId = existingSnap.docs[0].id;
      }

      if (targetSubId) {
        await updateDoc(doc(db, "subscriptions", targetSubId), { endDate: Timestamp.fromDate(newEnd), status: "active" });
      } else {
        const svc = SERVICES.find((s) => s.slug === req.serviceSlug);
        await addDoc(collection(db, "subscriptions"), {
          familyId: req.familyId, childId, serviceSlug: req.serviceSlug,
          monthlyPrice: svc?.pricePerMonth ?? req.amount / req.months,
          agencyFee: svc?.agencyFee ?? 0, status: "active",
          startDate: Timestamp.fromDate(new Date()), endDate: Timestamp.fromDate(newEnd),
          discount: 0, createdAt: serverTimestamp(),
        });
      }
      await updateDoc(doc(db, "renewalRequests", req.id), { status: "approved" });
    }

    // 지갑 쿠폰 소진 처리 (쿠폰 useCount는 고객 신청 시점에 이미 반영됨)
    for (const wId of (req.walletCouponIds ?? [])) {
      try {
        const wSnap = await getDoc(doc(db, "families", req.familyId, "couponWallet", wId));
        if (wSnap.exists() && !wSnap.data().used) {
          await updateDoc(doc(db, "families", req.familyId, "couponWallet", wId), { used: true, usedAt: serverTimestamp() });
        }
      } catch { /* skip */ }
    }
  }

  function approveRenewalGroup(familyId: string, reqs: RenewalRequest[]) {
    const family = families.find((f) => f.id === familyId);
    // (childId, serviceSlug) 기준 dedup된 항목으로 합계/카운트/SMS payload 계산
    // (Firestore에 중복 doc이 있어도 화면/금액/SMS는 한 번만 반영)
    const seen = new Set<string>();
    const dedupedReqs = reqs.filter((r) => {
      const key = `${r.childId ?? "parent"}|${r.serviceSlug}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    const total = dedupedReqs.reduce((s, r) => s + r.finalAmount, 0);
    const parentName = family?.parentName ?? "";
    if (!confirm(`${parentName}님 · ${dedupedReqs.length}건 총 ${formatWon(total)} 입금 확인하시겠습니까?`)) return;
    startTask({
      label: `${parentName} 연장 승인`,
      successText: "연장 완료",
      task: async () => {
        // 중복 doc 포함 전체에 대해 approve (모두 pending에서 제거)
        for (const req of reqs) await approveRenewalCore(req);
        const { httpsCallable } = await import("firebase/functions");
        const smsFn = httpsCallable(functions, "sendRenewalConfirmationSms");
        const services = dedupedReqs.map((req) => {
          const svc = SERVICES.find((s) => s.slug === req.serviceSlug);
          const newEnd = calcNewEndDate(req.currentEndDate, req.months);
          return {
            childName: req.childName,
            serviceName: svc?.name ?? req.serviceName,
            newEndDate: newEnd.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }),
          };
        });
        await smsFn({ familyId, services }).catch(() => {/* SMS 실패해도 승인은 완료 */});

        // 가계부 수입 자동 기록 (어드민 개인 가계부) — 중복 방지
        if (total > 0) {
          const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD
          const paymentKey = `renewal_${familyId}_${today}_${total}`;
          const dup = await getDocs(query(collection(db, "vaultEntries"), where("paymentKey", "==", paymentKey)));
          if (dup.empty) {
            await addDoc(collection(db, "vaultEntries"), {
              date: today,
              type: "income",
              amount: total,
              category: "수업료",
              memo: `${parentName} 구독연장`,
              receiptUrl: null,
              recurringId: null,
              paymentKey,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }).catch(() => {/* 가계부 기록 실패해도 승인은 완료 */});
          }
        }
      },
    });
  }

  function exportCsv() {
    const header = ["신청일", "부모", "연락처", "자녀이름", "학년", "자녀ID", "서비스", "월결제(자녀)", "상태"];
    const rows = signups.flatMap((s) => s.children.map((c) => [s.createdAt ? s.createdAt.toISOString() : "", s.parentName, s.phone, c.name, c.grade, c.loginId, c.selectedServices.join("|"), "", s.status]));
    const csv = "\uFEFF" + [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `plantor-signups-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const [signupSearch, setSignupSearch] = useState("");
  const pendingCount = signups.filter((s) => s.status === "pending" || s.status === "accountPending").length;
  const pendingSignups = signups.filter((s) => s.status === "pending" || s.status === "accountPending");
  const filteredSignups = signupSearch.trim()
    ? pendingSignups.filter((s) => {
        const q = signupSearch.trim().toLowerCase();
        return s.parentName?.toLowerCase().includes(q) || s.phone?.includes(q);
      })
    : pendingSignups;
  const pendingRenewals = renewalRequests;

  // 24시간 경과 미입금 — 운영자가 직접 정리할 수 있게 알림
  const overdueCutoff = Date.now() - 24 * 60 * 60 * 1000;
  const overdueSignups = signups.filter(
    (s) => s.status === "pending" && s.createdAt != null && s.createdAt.getTime() < overdueCutoff
  );
  const overdueRenewals = pendingRenewals.filter(
    (r) => r.createdAt != null && r.createdAt.getTime() < overdueCutoff
  );
  const overdueTotal = overdueSignups.length + overdueRenewals.length;
  const draftTotal = Object.values(draftByChild).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-p-bg">
      <main className="mx-auto max-w-[1100px] px-6 py-7 max-[600px]:px-3 max-[600px]:py-4">
        {/* 24시간 경과 미입금 알림 */}
        {overdueTotal > 0 && (
          <div className="mb-4 rounded-xl border border-[rgba(200,0,0,0.18)] bg-[#fff5f5] px-4 py-3.5 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[13px] leading-relaxed text-[#a01818]">
              <strong className="font-bold">⏰ 24시간 경과 미입금 {overdueTotal}건</strong>
              <span className="text-[#c05858]"> (신규 {overdueSignups.length} · 연장 {overdueRenewals.length})</span>
              <br />
              입금이 확인되지 않은 신청이에요. 확인 후 취소 처리해 주세요.
            </div>
            <div className="flex gap-2">
              {overdueSignups.length > 0 && (
                <button onClick={() => setShowSignups(true)} className="rounded-md border border-[rgba(200,0,0,0.25)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#a01818] cursor-pointer">
                  신규 {overdueSignups.length} 보기
                </button>
              )}
              {overdueRenewals.length > 0 && (
                <button onClick={() => setShowRenewals(true)} className="rounded-md border border-[rgba(200,0,0,0.25)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#a01818] cursor-pointer">
                  연장 {overdueRenewals.length} 보기
                </button>
              )}
            </div>
          </div>
        )}

        {/* 헤더 */}
        <div className="mb-5 flex items-center gap-2.5 flex-wrap">
          {/* 탭 — 모바일 가로 스크롤 */}
          <div className="flex gap-[3px] bg-p-bg rounded-lg p-[3px] max-[600px]:overflow-x-auto max-[600px]:w-full no-scrollbar">
            {(["members", "plan", "messages"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="rounded-md border-none cursor-pointer px-4 py-[5px] text-[13px] font-semibold flex items-center gap-1.5"
                style={{
                  backgroundColor: activeTab === tab ? "#ffffff" : "transparent",
                  color: activeTab === tab ? "rgba(0,0,0,0.95)" : "#a39e98",
                  boxShadow: activeTab === tab ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                }}
              >
                {tab === "members" ? "회원" : tab === "plan" ? "플랜 관리" : "발송현황"}
                {tab === "plan" && draftTotal > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full bg-p-green text-white text-[10px] font-bold leading-none">
                    {draftTotal}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 탭 컨텐츠 */}
        {activeTab === "members" && (
          <MembersTab families={families} allChildren={allChildren} allSubs={allSubs} membersLoading={membersLoading} onResetByFamily={handleResetByFamily} onResetDirectClass={handleResetDirectClass} onResetAttendance={handleResetAttendance} pendingSignupCount={pendingCount} pendingRenewalCount={pendingRenewals.length} onShowSignups={() => setShowSignups(true)} onShowRenewals={() => setShowRenewals(true)} />
        )}
        {activeTab === "plan" && (
          <PlanTab allChildren={allChildren} allSubs={allSubs} draftByChild={draftByChild} />
        )}
        {activeTab === "messages" && <MessagesTab families={families} allChildren={allChildren} />}
      </main>

      {/* 대기중 신청 드로어 */}
      {showSignups && (
        <>
          <div onClick={() => setShowSignups(false)} className="fixed inset-0 bg-[rgba(0,0,0,0.35)] z-[100]" />
          <div
            className="fixed top-0 right-0 bottom-0 w-[480px] max-[600px]:w-full bg-white overflow-y-auto px-5 py-6 z-[101]"
            style={{ boxShadow: "-4px 0 24px rgba(0,0,0,0.12)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-[15px] font-bold text-black/95">신규 신청 · {pendingCount}</span>
              <button
                onClick={() => setShowSignups(false)}
                className="bg-transparent border-none cursor-pointer text-xl text-p-muted px-2 py-1 leading-none"
              >×</button>
            </div>
            <input
              type="text"
              value={signupSearch}
              onChange={(e) => setSignupSearch(e.target.value)}
              placeholder="이름 또는 전화번호"
              className="w-full mb-4 rounded-lg border border-black/10 bg-p-bg px-3.5 py-2 text-[13px] outline-none focus:border-black/25"
            />

            {error && (
              <div className="mb-4 rounded bg-[#fff5f5] border border-[rgba(200,0,0,0.15)] px-3.5 py-2.5 text-[13px] text-[#c00000]">
                오류: {error}
              </div>
            )}

            {loading ? (
              <CenterMsg>불러오는 중…</CenterMsg>
            ) : filteredSignups.length === 0 ? (
              <div className="rounded-xl border-[1.5px] border-dashed border-black/[0.12] py-12 px-6 text-center text-sm text-p-muted">
                {signupSearch.trim() ? "검색 결과가 없습니다." : "대기 중인 신청이 없습니다."}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredSignups.map((s) => (
                  <SignupRow key={s.id} signup={s} onChangeStatus={changeStatus} onApproveAsFamily={approveAsFamily} onDelete={deleteSignup} onResetPassword={handleResetPassword} onEditParentId={editParentId} onEditChildId={editChildId} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* 연장신청 드로어 */}
      {showRenewals && (
        <>
          <div onClick={() => setShowRenewals(false)} className="fixed inset-0 bg-[rgba(0,0,0,0.35)] z-[100]" />
          <div
            className="fixed top-0 right-0 bottom-0 w-[440px] max-[600px]:w-full bg-white overflow-y-auto px-5 py-6 z-[101]"
            style={{ boxShadow: "-4px 0 24px rgba(0,0,0,0.12)" }}
          >
            <div className="flex items-center justify-between mb-5">
              <span className="text-[15px] font-bold text-black/95">연장 신청 · {pendingRenewals.length}</span>
              <button
                onClick={() => setShowRenewals(false)}
                className="bg-transparent border-none cursor-pointer text-xl text-p-muted px-2 py-1 leading-none"
              >×</button>
            </div>

            {pendingRenewals.length === 0 ? (
              <div className="rounded-xl border-[1.5px] border-dashed border-black/[0.12] py-12 px-6 text-center text-sm text-p-muted">
                대기 중인 연장 신청이 없습니다.
              </div>
            ) : (() => {
              const grouped = pendingRenewals.reduce<Record<string, RenewalRequest[]>>((acc, r) => {
                (acc[r.familyId] ??= []).push(r); return acc;
              }, {});
              // 가족별로 (childId, serviceSlug) 기준 dedup — query가 createdAt desc 정렬이라
              // 먼저 만난 것(최신)만 keep. 숨겨진 중복 doc도 approve 대상에 포함시키려면
              // approveRenewalGroup에 reqs 그대로 전달.
              const dedupedByFamily: Record<string, RenewalRequest[]> = {};
              for (const [fid, reqs] of Object.entries(grouped)) {
                const seen = new Set<string>();
                dedupedByFamily[fid] = reqs.filter((r) => {
                  const key = `${r.childId ?? "parent"}|${r.serviceSlug}`;
                  if (seen.has(key)) return false;
                  seen.add(key);
                  return true;
                });
              }
              return (
                <div className="flex flex-col gap-3.5">
                  {Object.entries(grouped).map(([familyId, reqs]) => {
                    const displayReqs = dedupedByFamily[familyId];
                    const family = families.find((f) => f.id === familyId);
                    const totalFinal = displayReqs.reduce((s, r) => s + r.finalAmount, 0);
                    const totalOrig = displayReqs.reduce((s, r) => s + r.amount, 0);
                    const hasDiscount = totalFinal < totalOrig;
                    const createdAt = displayReqs[0]?.createdAt;
                    return (
                      <div
                        key={familyId}
                        className="bg-white border border-black/10 rounded-xl px-[18px] py-4"
                        style={{ boxShadow: T.shadow }}
                      >
                        {/* 가족 헤더 */}
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="text-sm font-bold text-black/95">{family?.parentName ?? familyId}</div>
                            <div className="text-[11px] text-p-muted mt-0.5">
                              신청일 {createdAt ? formatDateTime(createdAt) : "-"}
                            </div>
                          </div>
                          <div className="text-right">
                            {hasDiscount && (
                              <div className="text-[11px] text-p-muted line-through">{formatWon(totalOrig)}</div>
                            )}
                            <div className="text-base font-extrabold text-black/95">{formatWon(totalFinal)}</div>
                          </div>
                        </div>

                        {/* 서비스 행 목록 (중복은 표시에서 제외, 승인 시는 reqs 전체로 처리) */}
                        <div className="flex flex-col gap-1.5 mb-3">
                          {displayReqs.map((req) => {
                            const svc = SERVICES.find((s) => s.slug === req.serviceSlug);
                            const newEnd = calcNewEndDate(req.currentEndDate, req.months);
                            return (
                              <div key={req.id} className="bg-p-bg rounded-lg px-3 py-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-[13px] font-semibold text-black/95">{(req.childName && req.childName !== "null") ? req.childName : "학부모"} · {svc?.name ?? req.serviceName}</span>
                                  <span className="text-[13px] font-bold text-black/95">
                                    {req.months}개월 ·{" "}
                                    {req.finalAmount < req.amount
                                      ? <><span className="line-through text-p-muted font-normal text-[11px]">{formatWon(req.amount)}</span> {formatWon(req.finalAmount)}</>
                                      : formatWon(req.finalAmount)}
                                  </span>
                                </div>
                                <div className="text-[11px] text-p-muted mt-[3px]">
                                  {req.currentEndDate?.toLocaleDateString("ko-KR") ?? "-"}
                                  {" → "}
                                  <span className="font-semibold text-p-green">{newEnd.toLocaleDateString("ko-KR")}</span>
                                  {req.currentEndDate && req.currentEndDate < new Date() && (
                                    <span className="ml-1.5 rounded-full px-1.5 py-px text-[10px] font-bold bg-[#fff5f5] text-[#c00000] border border-[rgba(200,0,0,0.2)]">만료재신청</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* 가족 단위 승인 버튼 하나 */}
                        <RenewalApproveButton loading={false} onClick={() => approveRenewalGroup(familyId, reqs)} />
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}
