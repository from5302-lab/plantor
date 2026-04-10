"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SERVICES, SITE } from "@/data/site";

const GRADES = [
  "미취학",
  "초1",
  "초2",
  "초3",
  "초4",
  "초5",
  "초6",
  "중1",
  "중2",
  "중3",
];

type FormState = {
  parentName: string;
  phone: string;
  childName: string;
  childGrade: string;
  selectedServices: string[];
  agreed: boolean;
};

const EMPTY: FormState = {
  parentName: "",
  phone: "",
  childName: "",
  childGrade: "",
  selectedServices: [],
  agreed: false,
};

export function SignupForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // ?slug=class5 같은 쿼리 파라미터로 사전 선택
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("slug");
    if (slug && SERVICES.some((s) => s.slug === slug)) {
      setForm((prev) => ({ ...prev, selectedServices: [slug] }));
    }
  }, []);

  const estimatedTotal = useMemo(() => {
    return form.selectedServices.reduce((sum, slug) => {
      const svc = SERVICES.find((s) => s.slug === slug);
      return sum + (svc?.pricePerMonth ?? 0);
    }, 0);
  }, [form.selectedServices]);

  function toggleService(slug: string) {
    setForm((prev) => ({
      ...prev,
      selectedServices: prev.selectedServices.includes(slug)
        ? prev.selectedServices.filter((s) => s !== slug)
        : [...prev.selectedServices, slug],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.parentName.trim()) return setError("부모님 성함을 입력해 주세요.");
    if (!form.phone.trim()) return setError("연락처를 입력해 주세요.");
    if (!form.childName.trim())
      return setError("자녀 이름을 입력해 주세요.");
    if (!form.childGrade) return setError("자녀 학년을 선택해 주세요.");
    if (form.selectedServices.length === 0)
      return setError("신청하실 서비스를 1개 이상 선택해 주세요.");
    if (!form.agreed)
      return setError("개인정보 수집·이용에 동의해 주세요.");

    setSubmitting(true);
    try {
      await addDoc(collection(db, "signups"), {
        parentName: form.parentName.trim(),
        phone: form.phone.trim(),
        childName: form.childName.trim(),
        childGrade: form.childGrade,
        selectedServices: form.selectedServices,
        estimatedMonthly: estimatedTotal,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      setDone(true);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? `신청 저장 실패: ${err.message}`
          : "신청 저장 중 문제가 발생했습니다."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center sm:p-12 dark:border-emerald-900 dark:bg-emerald-950/40">
        <div className="mb-4 text-6xl">🌱</div>
        <h2 className="text-2xl font-bold text-emerald-900 sm:text-3xl dark:text-emerald-100">
          신청이 접수되었습니다
        </h2>
        <p className="mt-4 text-base leading-7 text-emerald-800 dark:text-emerald-200">
          입력하신 연락처로 입금 안내를 드립니다.
          <br />
          입금이 확인되면 학습 프로그램 ID/PW를 즉시 발급해 드립니다.
        </p>
        <p className="mt-6 text-xs text-emerald-700/80 dark:text-emerald-300/80">
          입금자명은 신청 시 입력하신 부모님 성함과 동일하게 보내주세요.
          <br />
          무료 웨비나/엄마 커뮤니티에 관심 있으시면 아래 오픈채팅으로 들어와
          주세요.
        </p>
        <a
          href={SITE.kakaoOpenChat}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full border border-emerald-600 px-6 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
        >
          🙋‍♀️ 맘& 오픈채팅 입장
        </a>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {/* 부모 정보 */}
      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
          부모님 정보
        </legend>
        <Field
          label="성함 (입금자명과 동일하게)"
          required
          value={form.parentName}
          onChange={(v) => setForm({ ...form, parentName: v })}
          placeholder="예) 김다영"
        />
        <Field
          label="연락처 (입금 안내가 가는 번호)"
          required
          type="tel"
          value={form.phone}
          onChange={(v) => setForm({ ...form, phone: v })}
          placeholder="예) 010-1234-5678"
        />
      </fieldset>

      {/* 자녀 정보 */}
      <fieldset className="space-y-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <legend className="mb-2 text-sm font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
          자녀 정보
        </legend>
        <Field
          label="자녀 이름"
          required
          value={form.childName}
          onChange={(v) => setForm({ ...form, childName: v })}
          placeholder="예) 찬영"
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            학년 <span className="text-emerald-600">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {GRADES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setForm({ ...form, childGrade: g })}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  form.childGrade === g
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </fieldset>

      {/* 서비스 선택 */}
      <fieldset className="space-y-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <legend className="mb-2 text-sm font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
          신청 서비스 (복수 선택 가능)
        </legend>
        <div className="space-y-2">
          {SERVICES.map((svc) => {
            const checked = form.selectedServices.includes(svc.slug);
            return (
              <label
                key={svc.slug}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                  checked
                    ? "border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/30"
                    : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleService(svc.slug)}
                  className="mt-1 h-4 w-4 accent-emerald-600"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-zinc-900 dark:text-white">
                      {svc.emoji} {svc.name}
                    </span>
                    <span className="shrink-0 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {svc.priceLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {svc.hook}
                  </p>
                </div>
              </label>
            );
          })}
        </div>

        {estimatedTotal > 0 && (
          <div className="rounded-2xl bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-800">
            예상 월 결제액:{" "}
            <strong className="text-emerald-700 dark:text-emerald-300">
              ₩{estimatedTotal.toLocaleString()}
            </strong>
            <span className="ml-1 text-zinc-500 dark:text-zinc-400">
              (가맹비 ₩6,000, 신규 할인 ₩5,000 별도)
            </span>
          </div>
        )}
      </fieldset>

      {/* 동의 */}
      <fieldset className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={form.agreed}
            onChange={(e) => setForm({ ...form, agreed: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-emerald-600"
          />
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            <strong>개인정보 수집·이용에 동의합니다 (필수)</strong>
            <br />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              수집 항목: 부모/자녀 이름, 학년, 연락처. 이용 목적: 학습
              프로그램 발급 및 안내. 보유 기간: 서비스 이용 종료 후 1년.
            </span>
          </span>
        </label>
      </fieldset>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-emerald-600 py-4 text-base font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "신청 중…" : "🌱 신청하기"}
      </button>
    </form>
  );
}

function Field({
  label,
  required,
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  label: string;
  required?: boolean;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label} {required && <span className="text-emerald-600">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500"
      />
    </div>
  );
}
