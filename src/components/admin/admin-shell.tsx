"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, type User } from "firebase/auth";
import { addDoc, arrayRemove, collection, deleteDoc, doc, getDoc, getDocs, increment, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where, Timestamp } from "firebase/firestore";
import { auth, db, functions } from "@/lib/firebase";
import { SERVICES, SITE } from "@/data/site";
import { formatDateTime, formatWon, tsToDate } from "@/lib/format";
import type { MemberFamily, MemberChild, Subscription as MemberSub, Signup, SignupStatus, SignupChild, RenewalRequest, Referral, WalletCoupon } from "@/lib/types";
import { convertSignupToFamily } from "@/lib/families";
import { useAuth } from "@/lib/auth-context";
import { T } from "@/lib/design-tokens";
import { CenterMsg } from "@/components/ui/center-msg";
import { SignupRow } from "./signup-row";
import { MembersTab } from "./members-tab";
import { LearningTab } from "./learning-tab";
import { CouponTab } from "./coupon-tab";
import { ReferralsTab } from "./referrals-tab";
import { PlanTab } from "./plan-tab";
import { LessonJournalTab } from "./lesson-journal-tab";


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

  return <Dashboard user={user} />;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<"members" | "learning" | "plan" | "coupons" | "referrals" | "journal">("members");
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
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [approvingFamilyId, setApprovingFamilyId] = useState<string | null>(null);

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
        }));
        setMembersLoading(false);
      });
    });

    return () => { unsubFamilies?.(); unsubChildren?.(); unsubSubs?.(); };
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

  // 추천 로드
  useEffect(() => {
    return onSnapshot(
      query(collection(db, "referrals"), orderBy("createdAt", "desc")),
      (snap) => setReferrals(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          referrerId: data.referrerId ?? "",
          referrerName: data.referrerName ?? "",
          referralCode: data.referralCode ?? "",
          refereeSignupId: data.refereeSignupId ?? "",
          refereeName: data.refereeName ?? "",
          refereeFamilyId: data.refereeFamilyId ?? null,
          referralDiscount: data.referralDiscount ?? 0,
          rewardAmount: data.rewardAmount ?? 0,
          status: data.status ?? "pending",
          createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : null,
          rewardedAt: data.rewardedAt ? (data.rewardedAt as Timestamp).toDate() : null,
        };
      }))
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
        };
      }));
      setLoading(false);
    }, (err) => { setError(err.message); setLoading(false); });
  }, []);

  async function changeStatus(id: string, status: SignupStatus) {
    try { await updateDoc(doc(db, "signups", id), { status }); }
    catch (err) { alert(err instanceof Error ? err.message : "상태 변경 중 오류가 발생했습니다."); }
  }

  async function deleteSignup(id: string) {
    try {
      const snap = await getDoc(doc(db, "signups", id));
      if (snap.exists()) {
        const data = snap.data();
        // 승인 완료된 신청이었다면 쿠폰 사용 복구
        if (data.couponCode && data.convertedFamilyId) {
          const phone = (data.phone ?? "").replace(/-/g, "");
          await updateDoc(doc(db, "coupons", (data.couponCode as string).toUpperCase()), {
            useCount: increment(-1),
            usedPhones: arrayRemove(phone),
          }).catch(() => {});
        }
      }
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

  /** 기존 가족 카드에 구독 병합 (만료일 연장 + 없는 서비스 신규 추가) */
  async function mergeIntoExistingFamily(signup: Signup, familyId: string) {
    const now = new Date();
    let extendedCount = 0;
    let addedCount = 0;

    for (const signupChild of signup.children) {
      let childId: string | null = null;
      if (signupChild.loginId) {
        const snap = await getDocs(query(collection(db, "children"), where("familyId", "==", familyId), where("loginId", "==", signupChild.loginId)));
        if (!snap.empty) childId = snap.docs[0].id;
      }
      if (!childId) {
        const snap = await getDocs(query(collection(db, "children"), where("familyId", "==", familyId), where("name", "==", signupChild.name)));
        if (!snap.empty) childId = snap.docs[0].id;
      }
      if (!childId) {
        const ref = await addDoc(collection(db, "children"), {
          familyId, userId: signup.userId ?? null,
          name: signupChild.name, grade: signupChild.grade,
          loginId: signupChild.loginId, createdAt: serverTimestamp(),
        });
        childId = ref.id;
      }

      for (const slug of signupChild.selectedServices) {
        const subSnap = await getDocs(query(collection(db, "subscriptions"), where("childId", "==", childId), where("serviceSlug", "==", slug)));
        if (!subSnap.empty) {
          const sub = subSnap.docs[0];
          const currentEnd = (sub.data().endDate as Timestamp)?.toDate();
          const base = currentEnd && currentEnd > now ? currentEnd : now;
          const newEnd = new Date(base);
          newEnd.setDate(newEnd.getDate() + 30);
          await updateDoc(sub.ref, { endDate: Timestamp.fromDate(newEnd), status: "active" });
          extendedCount++;
        } else {
          const svc = SERVICES.find((s) => s.slug === slug);
          const newEnd = new Date(now);
          newEnd.setDate(newEnd.getDate() + 30);
          await addDoc(collection(db, "subscriptions"), {
            familyId, childId, serviceSlug: slug,
            monthlyPrice: svc?.pricePerMonth ?? 0,
            agencyFee: svc?.agencyFee ?? 0,
            status: "active",
            startDate: Timestamp.fromDate(now),
            endDate: Timestamp.fromDate(newEnd),
            discount: 0,
            createdAt: serverTimestamp(),
          });
          addedCount++;
        }
      }
    }

    // 쿠폰 useCount/usedPhones는 approveSignup CF에서 이미 처리됨
    await updateDoc(doc(db, "signups", signup.id), { status: "confirmed", convertedFamilyId: familyId });
    const parts = [];
    if (extendedCount > 0) parts.push(`구독 ${extendedCount}건 만료일 연장`);
    if (addedCount > 0) parts.push(`신규 서비스 ${addedCount}건 추가`);
    alert(`✅ 기존 회원 카드 업데이트 완료\n${parts.join(" · ")}`);
    setShowSignups(false);
  }

  async function approveAsFamily(signup: Signup) {
    if (signup.convertedFamilyId) { alert(`이미 가족으로 등록되어 있습니다 (familyId: ${signup.convertedFamilyId})`); return; }
    try {
      const { httpsCallable } = await import("firebase/functions");

      // momsaipack 포함 시 만료일 미리 계산 (당월 말일 기준)
      const hasAiPack = signup.parentServices?.includes("momsaipack") ?? false;
      const aiEndDate = hasAiPack ? (() => {
        const d = new Date();
        return toLocalDateStr(new Date(d.getFullYear(), d.getMonth() + 2, 0));
      })() : undefined;

      const approveFn = httpsCallable<{ signupId: string; momsaipackEndDate?: string }, { success: boolean; parentUid: string }>(functions, "approveSignup");
      const cfResult = await approveFn({ signupId: signup.id, ...(aiEndDate ? { momsaipackEndDate: aiEndDate } : {}) });
      const uid = cfResult.data.parentUid;

      const existingSnap = await getDocs(query(collection(db, "families"), where("userId", "==", uid)));
      if (!existingSnap.empty) {
        await mergeIntoExistingFamily({ ...signup, userId: uid }, existingSnap.docs[0].id);
        return;
      }

      // convertSignupToFamily 내부 batch에서 status="confirmed" + convertedFamilyId 처리
      // 쿠폰 useCount/usedPhones는 approveSignup CF에서 이미 처리됨
      const result = await convertSignupToFamily({
        ...signup, userId: uid,
        parentId: signup.parentId,
        referralCode: signup.referralCode,
        referrerId: signup.referrerId,
        referralDiscount: signup.referralDiscount,
      });
      if (signup.referrerId && signup.referralCode) {
        try {
          const referrerName = families.find((f) => f.id === signup.referrerId)?.parentName ?? "";
          await addDoc(collection(db, "families", signup.referrerId, "couponWallet"), {
            discountPercent: 10, note: `${signup.parentName} 추천 보상`, used: false, createdAt: serverTimestamp(),
          });
          await addDoc(collection(db, "referrals"), {
            referrerId: signup.referrerId, referrerName, referralCode: signup.referralCode,
            refereeSignupId: signup.id, refereeName: signup.parentName, refereeFamilyId: result.familyId,
            referralDiscount: signup.referralDiscount ?? 0, rewardAmount: 0,
            status: "rewarded", createdAt: serverTimestamp(), rewardedAt: serverTimestamp(),
          });
        } catch { /* 추천 보상 실패해도 승인은 완료 */ }
      }
      if (hasAiPack && aiEndDate) {
        // SMS는 approveSignup에서 이미 포함 발송 — DB만 업데이트
        try {
          await updateDoc(doc(db, "families", result.familyId), { aiPackageEndDate: aiEndDate });
          if (uid) {
            await updateDoc(doc(db, "users", uid), { aiPackageEndDate: aiEndDate });
          }
        } catch { /* aiPackageEndDate 설정 실패해도 승인은 완료 */ }
      }
      alert(`✅ 승인 완료\n계정 생성 + 가족 등록 완료\n자녀 ${result.childIds.length}명`);
      setShowSignups(false);
    } catch (err) { alert(err instanceof Error ? `승인 실패: ${err.message}` : "승인 중 오류가 발생했습니다."); }
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
      await confirmFn({ familyId: req.familyId, endDate: endDateStr });
      await updateDoc(doc(db, "renewalRequests", req.id), { status: "approved" });
    } else {
      let childId = req.childId || null;

      // 신규 자녀: children 문서 생성 + approveSignup으로 Auth 계정 생성
      if (req.isNewChild && req.newChildLoginId) {
        const childDoc = await addDoc(collection(db, "children"), {
          familyId: req.familyId,
          name: req.childName,
          grade: req.newChildGrade ?? "",
          loginId: req.newChildLoginId.toLowerCase(),
          createdAt: serverTimestamp(),
        });
        childId = childDoc.id;
      }

      if (req.subscriptionId) {
        await updateDoc(doc(db, "subscriptions", req.subscriptionId), { endDate: Timestamp.fromDate(newEnd), status: "active" });
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

  async function approveRenewalGroup(familyId: string, reqs: RenewalRequest[]) {
    const family = families.find((f) => f.id === familyId);
    const total = reqs.reduce((s, r) => s + r.finalAmount, 0);
    if (!confirm(`${family?.parentName ?? ""}님 · ${reqs.length}건 총 ${formatWon(total)} 입금 확인하시겠습니까?`)) return;
    setApprovingFamilyId(familyId);
    try {
      for (const req of reqs) await approveRenewalCore(req);
      const { httpsCallable } = await import("firebase/functions");
      const smsFn = httpsCallable(functions, "sendRenewalConfirmationSms");
      const services = reqs.map((req) => {
        const svc = SERVICES.find((s) => s.slug === req.serviceSlug);
        const newEnd = calcNewEndDate(req.currentEndDate, req.months);
        return {
          childName: req.childName,
          serviceName: svc?.name ?? req.serviceName,
          newEndDate: newEnd.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }),
        };
      });
      await smsFn({ familyId, services }).catch(() => {/* SMS 실패해도 승인은 완료 */});
    } catch (err) { alert(err instanceof Error ? err.message : "승인 오류"); }
    finally { setApprovingFamilyId(null); }
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

  return (
    <div className="min-h-screen bg-p-bg">
      <main className="mx-auto max-w-[1100px] px-6 py-7 max-[600px]:px-3 max-[600px]:py-4">
        {/* 헤더 */}
        <div className="mb-5 flex items-center gap-2.5 flex-wrap">
          {/* 탭 — 모바일 가로 스크롤 */}
          <div className="flex gap-[3px] bg-p-bg rounded-lg p-[3px] max-[600px]:overflow-x-auto max-[600px]:w-full no-scrollbar">
            {(["members", "learning", "journal", "plan", "coupons", "referrals"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="rounded-md border-none cursor-pointer px-4 py-[5px] text-[13px] font-semibold"
                style={{
                  backgroundColor: activeTab === tab ? "#ffffff" : "transparent",
                  color: activeTab === tab ? "rgba(0,0,0,0.95)" : "#a39e98",
                  boxShadow: activeTab === tab ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                }}
              >
                {tab === "members" ? "회원" : tab === "learning" ? "학습" : tab === "journal" ? "수업일지" : tab === "plan" ? "계획" : tab === "coupons" ? "쿠폰" : "추천"}
              </button>
            ))}
          </div>
        </div>

        {/* 탭 컨텐츠 */}
        {activeTab === "members" && (
          <MembersTab families={families} allChildren={allChildren} allSubs={allSubs} membersLoading={membersLoading} onResetByFamily={handleResetByFamily} onResetDirectClass={handleResetDirectClass} onResetAttendance={handleResetAttendance} pendingSignupCount={pendingCount} pendingRenewalCount={pendingRenewals.length} onShowSignups={() => setShowSignups(true)} onShowRenewals={() => setShowRenewals(true)} />
        )}
        {activeTab === "learning" && (
          <LearningTab allChildren={allChildren} allSubs={allSubs} onResetAttendance={handleResetAttendance} />
        )}
        {activeTab === "journal" && <LessonJournalTab />}
        {activeTab === "plan" && <PlanTab allChildren={allChildren} allSubs={allSubs} />}
        {activeTab === "coupons" && <CouponTab />}
        {activeTab === "referrals" && <ReferralsTab referrals={referrals} families={families} />}
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
                  <SignupRow key={s.id} signup={s} onChangeStatus={changeStatus} onApproveAsFamily={approveAsFamily} onDelete={deleteSignup} onResetPassword={handleResetPassword} />
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
              return (
                <div className="flex flex-col gap-3.5">
                  {Object.entries(grouped).map(([familyId, reqs]) => {
                    const family = families.find((f) => f.id === familyId);
                    const totalFinal = reqs.reduce((s, r) => s + r.finalAmount, 0);
                    const totalOrig = reqs.reduce((s, r) => s + r.amount, 0);
                    const hasDiscount = totalFinal < totalOrig;
                    const isLoading = approvingFamilyId === familyId;
                    const createdAt = reqs[0]?.createdAt;
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

                        {/* 서비스 행 목록 */}
                        <div className="flex flex-col gap-1.5 mb-3">
                          {reqs.map((req) => {
                            const svc = SERVICES.find((s) => s.slug === req.serviceSlug);
                            const newEnd = calcNewEndDate(req.currentEndDate, req.months);
                            return (
                              <div key={req.id} className="bg-p-bg rounded-lg px-3 py-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-[13px] font-semibold text-black/95">{req.childName} · {svc?.name ?? req.serviceName}</span>
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
                                {(req.couponCode || req.referralCode || req.walletDiscount > 0) && (
                                  <div className="text-[11px] text-[#1a7f4b] mt-0.5">
                                    {req.couponCode && `쿠폰 [${req.couponCode}${req.couponNote ? ` · ${req.couponNote}` : ""}] −${formatWon(req.couponDiscount)} `}
                                    {req.referralCode && `추천 −${formatWon(req.referralDiscount)} `}
                                    {req.walletDiscount > 0 && `쿠폰함 −${formatWon(req.walletDiscount)}`}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* 가족 단위 승인 버튼 하나 */}
                        <RenewalApproveButton loading={isLoading} onClick={() => approveRenewalGroup(familyId, reqs)} />
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
