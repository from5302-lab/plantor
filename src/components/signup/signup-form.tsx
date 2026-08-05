"use client";

import { useState } from "react";
import { T } from "@/lib/design-tokens";
import { ChildInputRow, Field } from "./child-input-row";
import { useSignupForm } from "./hooks/useSignupForm";
import { useServices } from "@/lib/services-context";
import { AuthModal } from "@/components/auth/auth-modal";
import { MonthsPicker } from "@/components/ui/months-picker";
import { isApplicationClosed } from "@/lib/application-window";

export function SignupForm() {
  const { signupServices } = useServices();
  const [loginOpen, setLoginOpen] = useState(false);

  const {
    form, setForm, submitting, error, existingMember, done,
    depositTotal, updateChild, toggleChildService, setChildServiceMonths,
    toggleParentService, setParentServiceMonths, addChild, removeChild,
    handleSubmit,
  } = useSignupForm();

  const parentOnlyServices = signupServices.filter(
    (s) => s.targetGrades?.includes("학부모")
  );
  const childServices = signupServices.filter(
    (s) => !s.targetGrades?.includes("학부모")
  );

  if (isApplicationClosed()) {
    return (
      <div className="bg-white border border-black/10 rounded-[16px] px-8 py-14 text-center" style={{ boxShadow: T.shadow }}>
        <div className="flex justify-center mb-5">
          <img src="/favicon.svg" alt="" width={56} height={56} />
        </div>
        <h2 className="m-0 text-2xl font-bold tracking-[-0.5px] text-black/95">
          이번 달 신청이 마감되었어요
        </h2>
        <p className="mt-4 text-[15px] leading-[1.7] text-p-secondary">
          신청은 <strong>매달 25일</strong>까지 받아요.
          <br />
          다음 달 1일에 다시 열립니다.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="bg-[#f0faf1] border border-[rgba(56,168,72,0.15)] rounded-[16px] px-8 py-14 text-center" style={{ boxShadow: T.shadow }}>
        <div className="flex justify-center mb-5">
          <img src="/favicon.svg" alt="" width={64} height={64} />
        </div>
        <h2 className="m-0 text-2xl font-bold tracking-[-0.5px] text-black/95">
          신청이 접수되었습니다
        </h2>
        <p className="mt-4 text-[15px] leading-[1.7] text-p-secondary">
          입력하신 연락처로 입금 안내를 드립니다.
          <br />
          입금이 확인되면 학습 프로그램 ID/PW를 즉시 발급해 드립니다.
        </p>
        <p className="mt-3 text-xs text-p-muted">
          입금자명은 신청 시 입력하신 부모님 성함과 동일하게 보내주세요.
          <br />
          학습은 신청 다음 달 1일부터 시작됩니다.
        </p>
        <p className="mt-4 rounded-lg bg-[#fffaf0] border border-[rgba(180,120,0,0.15)] px-4 py-3 text-xs leading-[1.7] text-[#8a6d00]">
          신청 후 <strong>24시간 이내</strong>에 입금이 확인되지 않으면 신청이 취소될 수 있어요.
        </p>
      </div>
    );
  }

  return (
    <>
      <header className="mb-6 text-center">
        <h1 className="m-0 text-[28px] font-bold tracking-[-0.5px] text-black/90">
          지금 바로 신청하세요
        </h1>
      </header>
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-black/10 rounded-[16px] px-7 py-7 max-[600px]:px-4 max-[600px]:py-5 flex flex-col gap-0"
        style={{ boxShadow: T.shadow }}
      >
        {/* 부모 정보 */}
        <fieldset className="border-none p-0 m-0">
          <legend className="mb-4 text-[10px] font-bold tracking-[0.12em] uppercase text-p-muted">
            부모님 정보
          </legend>
          <div className="flex flex-col gap-3.5">
            <Field label="이름 (입금자명과 동일하게)" required value={form.parentName} onChange={(v) => setForm({ ...form, parentName: v })} />
            <Field label="연락처" required type="tel" value={form.phone} onChange={(v) => {
                const digits = v.replace(/\D/g, "").slice(0, 11);
                const formatted = digits.length <= 3 ? digits
                  : digits.length <= 7 ? `${digits.slice(0,3)}-${digits.slice(3)}`
                  : `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
                setForm({ ...form, phone: formatted });
              }} />
            <Field
              label="부모님 아이디 (영문 소문자 + 숫자, 6~15자)"
              required
              value={form.parentId}
              onChange={(v) => setForm({ ...form, parentId: v.toLowerCase() })}
            />
            <Field
              label="비밀번호 (6자 이상)"
              required
              type="password"
              value={form.password}
              onChange={(v) => setForm({ ...form, password: v })}
            />
            {parentOnlyServices.length > 0 && (
              <div>
                <label className="text-[10px] font-bold tracking-[0.12em] uppercase text-p-muted block mb-2">
                  학부모 서비스 <span className="text-[11px] text-p-muted font-normal">(복수 선택 가능)</span>
                </label>
                <div className="flex flex-col gap-2">
                  {parentOnlyServices.map((svc) => {
                    const checked = form.parentServices.includes(svc.slug);
                    return (
                      <div key={svc.slug}>
                        <label
                          className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-3.5 py-3 ${checked ? "border-[1.5px] border-p-green bg-[#f0faf1]" : "border border-black/10 bg-white"}`}
                        >
                          <input type="checkbox" checked={checked} onChange={() => toggleParentService(svc.slug)} className="mt-0.5 w-3.5 h-3.5 accent-p-green" />
                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-black/95 flex items-center gap-1.5">
                                {svc.emoji} {svc.name}
                              </span>
                              <span className={`text-[13px] font-bold shrink-0 ${checked ? "text-p-green" : "text-p-secondary"}`}>{svc.priceLabel}</span>
                            </div>
                            <p className="m-0 mt-0.5 text-[11px] text-p-muted">{svc.hook}</p>
                          </div>
                        </label>
                        {checked && (
                          <MonthsPicker
                            value={form.parentServiceMonths?.[svc.slug] ?? null}
                            onChange={(m) => setParentServiceMonths(svc.slug, m)}
                            className="flex gap-1 mt-1.5 mb-0.5 ml-1"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </fieldset>

        <div className="my-6 h-px bg-black/[0.07]" />

        {/* 자녀 정보 */}
        <fieldset className="border-none p-0 m-0">
          <legend className="mb-4 text-[10px] font-bold tracking-[0.12em] uppercase text-p-muted">
            자녀 정보
          </legend>
          {form.children.length === 0 && (
            <p className="text-[13px] text-p-muted mb-1">
              학부모 서비스만 신청하시는 경우 자녀 정보는 입력하지 않아도 됩니다.
            </p>
          )}

          <div className="flex flex-col gap-3">
            {form.children.map((child, idx) => (
              <ChildInputRow
                key={idx}
                index={idx}
                child={child}
                canRemove={true}
                onUpdate={(patch) => updateChild(idx, patch)}
                onToggleService={(slug) => toggleChildService(idx, slug)}
                onChangeMonths={(slug, m) => setChildServiceMonths(idx, slug, m)}
                onRemove={() => removeChild(idx)}
                services={childServices}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={addChild}
            className="mt-3 w-full rounded border border-dashed border-black/[0.15] py-2.5 text-[13px] font-medium text-p-secondary bg-transparent cursor-pointer"
          >
            + 자녀 추가
          </button>

          {depositTotal > 0 && (
            <div className="mt-3 rounded-lg bg-p-bg px-3.5 py-2.5 text-[13px] text-p-secondary">
              총 입금액 <span className="text-[11px] text-p-muted">(선택 기간 기준)</span>: <strong className="text-black/95 font-bold">₩{depositTotal.toLocaleString()}</strong>
            </div>
          )}
        </fieldset>

        <div className="my-6 h-px bg-black/[0.07]" />

        {/* 동의 */}
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={form.agreed}
            onChange={(e) => setForm({ ...form, agreed: e.target.checked })}
            className="mt-0.5 w-[15px] h-[15px] accent-p-green"
          />
          <span className="text-[13px] text-black/95">
            <strong>개인정보 수집·이용에 동의합니다 (필수)</strong>
            <br />
            <span className="text-[11px] text-p-muted">
              수집 항목: 부모/자녀 이름, 학년, 자녀 ID, 연락처. 이용 목적: 학습 프로그램 발급 및 안내. 보유 기간: 서비스 이용 종료 후 1년.
            </span>
          </span>
        </label>

        {error && (
          <div className="mt-4 rounded bg-[#fff5f5] border border-[rgba(200,0,0,0.15)] px-3.5 py-2.5 text-[13px] text-[#c00000]">
            {error}
            {existingMember && (
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="mt-2.5 w-full rounded bg-p-green py-2.5 text-[13px] font-bold text-white border-none cursor-pointer"
              >
                로그인하고 연장신청하기
              </button>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full rounded bg-p-green py-3.5 text-[15px] font-bold text-white border-none"
          style={{ cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? "신청 중…" : "신청하기"}
        </button>
      </form>
      {loginOpen && <AuthModal onClose={() => setLoginOpen(false)} />}
    </>
  );
}
