"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, doc, getDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { useAuth, validateId } from "@/lib/auth-context";
import { type ChildEntry, SIGNUP_SERVICES } from "../child-input-row";
import { useServices } from "@/lib/services-context";

type FormState = {
  parentName: string;
  phone: string;
  parentId: string;
  password: string;
  children: ChildEntry[];
  parentServices: string[];
  agreed: boolean;
};

type CouponInfo = { code: string; discountType: "fixed" | "percent"; discountAmount: number };
type ReferralInfo = { code: string; familyId: string; referrerName: string };

const emptyChild = (): ChildEntry => ({ name: "", grade: "", loginId: "", selectedServices: [] });
const EMPTY: FormState = { parentName: "", phone: "", parentId: "", password: "", children: [], parentServices: [], agreed: false };

export function useSignupForm() {
  const { role } = useAuth();
  const router = useRouter();
  const { signupServices } = useServices();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeValidating, setCodeValidating] = useState(false);
  const [couponInfo, setCouponInfo] = useState<CouponInfo | null>(null);
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [codeError, setCodeError] = useState("");

  useEffect(() => {
    if (role === "admin") { router.replace("/admin"); return; }
    if (role === "parent") { router.replace("/account"); return; }
    if (role === "student") { router.replace("/learn"); return; }
  }, [role, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("slug");
    if (slug && SIGNUP_SERVICES.some((s) => s.slug === slug)) {
      setForm((prev) => ({
        ...prev,
        children: prev.children.map((c, i) =>
          i === 0 ? { ...c, selectedServices: [slug] } : c
        ),
      }));
    }
  }, []);

  const estimatedTotal = useMemo(() => {
    const childTotal = form.children.reduce((sum, child) => {
      return sum + child.selectedServices.reduce((s, slug) => {
        const svc = SIGNUP_SERVICES.find((x) => x.slug === slug);
        return s + (svc?.pricePerMonth ?? 0);
      }, 0);
    }, 0);
    const parentTotal = form.parentServices.reduce((sum, slug) => {
      const svc = signupServices.find((x) => x.slug === slug);
      return sum + (svc?.pricePerMonth ?? 0);
    }, 0);
    return childTotal + parentTotal;
  }, [form.children, form.parentServices, signupServices]);

  function updateChild(idx: number, patch: Partial<ChildEntry>) {
    setForm((prev) => ({ ...prev, children: prev.children.map((c, i) => i === idx ? { ...c, ...patch } : c) }));
  }

  function toggleChildService(idx: number, slug: string) {
    setForm((prev) => ({
      ...prev,
      children: prev.children.map((c, i) => {
        if (i !== idx) return c;
        return { ...c, selectedServices: c.selectedServices.includes(slug) ? c.selectedServices.filter((s) => s !== slug) : [...c.selectedServices, slug] };
      }),
    }));
  }

  function toggleParentService(slug: string) {
    setForm((prev) => ({
      ...prev,
      parentServices: prev.parentServices.includes(slug)
        ? prev.parentServices.filter((s) => s !== slug)
        : [...prev.parentServices, slug],
    }));
  }

  function addChild() {
    setForm((prev) => ({ ...prev, children: [...prev.children, emptyChild()] }));
  }

  function removeChild(idx: number) {
    setForm((prev) => ({ ...prev, children: prev.children.filter((_, i) => i !== idx) }));
  }

  async function handleValidateCode() {
    const raw = codeInput.trim();
    if (!raw) return;
    setCodeValidating(true); setCodeError(""); setCouponInfo(null); setReferralInfo(null);
    try {
      const couponSnap = await getDoc(doc(db, "coupons", raw.toUpperCase()));
      if (couponSnap.exists()) {
        const data = couponSnap.data();
        if (data.usedBy) { setCodeError("이미 사용된 코드예요."); return; }
        if (data.maxUses && (data.useCount ?? 0) >= data.maxUses) { setCodeError("최대 사용 횟수에 도달한 코드예요."); return; }
        if (data.expiresAt && (data.expiresAt as Timestamp).toDate() < new Date()) { setCodeError("쿠폰 사용기간이 만료되었습니다."); return; }
        const phone = form.phone.replace(/-/g, "");
        if (phone && Array.isArray(data.usedPhones) && data.usedPhones.includes(phone)) {
          setCodeError("이미 사용한 코드예요."); return;
        }
        setCouponInfo({ code: raw.toUpperCase(), discountType: data.discountType, discountAmount: data.discountAmount });
        return;
      }
      const refSnap = await getDoc(doc(db, "referralCodes", raw.toLowerCase()));
      if (refSnap.exists()) {
        const data = refSnap.data();
        setReferralInfo({ code: raw.toLowerCase(), familyId: data.familyId, referrerName: data.referrerName });
        return;
      }
      setCodeError("존재하지 않는 코드예요.");
    } catch (err) { setCodeError(err instanceof Error ? err.message : "코드 확인 중 오류가 발생했습니다."); }
    finally { setCodeValidating(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.parentName.trim()) return setError("부모님 성함을 입력해 주세요.");
    if (!form.phone.trim()) return setError("연락처를 입력해 주세요.");

    const idErr = validateId(form.parentId);
    if (idErr) return setError(`부모님 아이디: ${idErr}`);
    if (form.password.length < 6) return setError("비밀번호는 6자 이상이어야 해요.");

    if (form.children.length === 0 && form.parentServices.length === 0)
      return setError("자녀 서비스 또는 학부모 서비스를 1개 이상 선택해 주세요.");

    for (let i = 0; i < form.children.length; i++) {
      const c = form.children[i];
      const label = `자녀 ${i + 1}`;
      if (!c.name.trim()) return setError(`${label}의 이름을 입력해 주세요.`);
      if (!c.grade) return setError(`${label}의 학년을 선택해 주세요.`);
      if (!c.loginId.trim()) return setError(`${label}의 ID를 입력해 주세요.`);
      const childIdErr = validateId(c.loginId.trim());
      if (childIdErr) return setError(`${label} 아이디: ${childIdErr}`);
      if (c.selectedServices.length === 0) return setError(`${label}의 서비스를 1개 이상 선택해 주세요.`);
    }
    if (!form.agreed) return setError("개인정보 수집·이용에 동의해 주세요.");

    setSubmitting(true);
    try {
      const checkId = httpsCallable<{ type: string; id: string }, { available: boolean; reason?: string }>(functions, "checkIdAvailability");
      // 전화번호 중복 체크
      const phoneRes = await checkId({ type: "phone", id: form.phone.trim() });
      if (!phoneRes.data.available) {
        if (phoneRes.data.reason === "signup") {
          setError("이미 같은 전화번호로 신청이 접수되어 있어요. 문의사항은 오픈톡방으로 연락해 주세요.");
        } else {
          setError("이미 등록된 회원이에요. 기존 회원이시라면 아이 학습 홈에서 연장신청을 이용해 주세요.");
        }
        setSubmitting(false);
        return;
      }
      // 부모 ID 중복 체크
      const parentRes = await checkId({ type: "parent", id: form.parentId });
      if (!parentRes.data.available) {
        setError(`부모님 아이디(${form.parentId})는 이미 사용 중이에요. 기존 회원이시라면 아이 학습 홈에서 연장신청을 이용해 주세요.`);
        setSubmitting(false);
        return;
      }
      for (let i = 0; i < form.children.length; i++) {
        const c = form.children[i];
        const childRes = await checkId({ type: "child", id: c.loginId.trim() });
        if (!childRes.data.available) {
          setError(`자녀 ${i + 1} 아이디(${c.loginId})는 이미 사용 중인 아이디예요. 기존 회원이시라면 연장신청을 이용해 주세요.`);
          setSubmitting(false);
          return;
        }
      }
    } catch {
      setError("아이디 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      setSubmitting(false);
      return;
    }

    const couponDiscount = couponInfo
      ? couponInfo.discountType === "fixed"
        ? Math.min(couponInfo.discountAmount, estimatedTotal)
        : Math.round(estimatedTotal * couponInfo.discountAmount / 100)
      : 0;
    const referralDiscount = referralInfo ? Math.round(estimatedTotal * 0.1) : 0;

    try {
      await addDoc(collection(db, "signups"), {
        parentName: form.parentName.trim(),
        phone: form.phone.trim(),
        parentId: form.parentId.toLowerCase(),
        password: form.password,
        children: form.children.map((c) => ({
          name: c.name.trim(),
          grade: c.grade,
          loginId: c.loginId.trim().toLowerCase(),
          selectedServices: c.selectedServices,
        })),
        parentServices: form.parentServices,
        estimatedMonthly: estimatedTotal,
        couponCode: couponInfo?.code ?? null,
        couponDiscount,
        referralCode: referralInfo?.code ?? null,
        referrerId: referralInfo?.familyId ?? null,
        referralDiscount,
        finalMonthly: estimatedTotal - couponDiscount - referralDiscount,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "신청 저장 중 문제가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return {
    form, setForm, submitting, error, done,
    codeInput, setCodeInput, codeValidating, couponInfo, referralInfo, codeError,
    setCouponInfo, setReferralInfo, setCodeError,
    estimatedTotal, updateChild, toggleChildService, toggleParentService, addChild, removeChild,
    handleValidateCode, handleSubmit,
  };
}
