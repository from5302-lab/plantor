"use client";

import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { SERVICES } from "@/data/site";
import { ServiceIcon } from "@/components/ui/service-icon";
import { Select } from "@/components/ui/select";
import { MonthsPicker } from "@/components/ui/months-picker";

const GRADES = ["미취학", "초1", "초2", "초3", "초4", "초5", "초6", "중1", "중2", "중3"];
export const SIGNUP_SERVICES = SERVICES.filter(
  (s) => (s.category === "subscription" || s.category === "premium") && s.pricePerMonth !== null
);

export type ChildEntry = {
  name: string;
  grade: string;
  loginId: string;
  selectedServices: string[];
  serviceMonths: Record<string, number>;
  loginIdError?: string;
};

// ─── Field ────────────────────────────────────────────────────────────────────

export function Field({
  label, required, type = "text", value, onChange, onBlur, placeholder, error,
}: {
  label: string; required?: boolean; type?: string;
  value: string; onChange: (v: string) => void;
  onBlur?: () => void; placeholder?: string; error?: string;
}) {
  return (
    <div>
      <label className="label">
        {label} {required && <span className="text-p-green">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className={`input-base${error ? " border-[#c00000]" : ""}`}
      />
      {error && <div className="text-xs text-[#c00000] mt-1">{error}</div>}
    </div>
  );
}

// ─── ChildInputRow ────────────────────────────────────────────────────────────

export function ChildInputRow({
  index, child, canRemove, onUpdate, onToggleService, onChangeMonths, onRemove, services,
}: {
  index: number;
  child: ChildEntry;
  canRemove: boolean;
  onUpdate: (patch: Partial<ChildEntry>) => void;
  onToggleService: (slug: string) => void;
  onChangeMonths: (slug: string, months: number) => void;
  onRemove: () => void;
  services?: typeof SIGNUP_SERVICES;
}) {
  async function checkLoginId(id: string) {
    const trimmed = id.trim().toLowerCase();
    if (!trimmed || trimmed.length < 6) return;
    try {
      const checkId = httpsCallable<{ type: string; id: string }, { available: boolean }>(functions, "checkIdAvailability");
      const res = await checkId({ type: "child", id: trimmed });
      onUpdate({ loginIdError: res.data.available ? "" : "이미 사용 중인 아이디예요. 기존 회원이시라면 연장신청을 이용해 주세요." });
    } catch { /* 네트워크 오류 시 무시 */ }
  }

  return (
    <div className="bg-p-bg border border-black/[0.08] rounded-lg p-[18px] flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-black/95 flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.svg" alt="" width={14} height={14} />자녀 {index + 1}
        </span>
        {canRemove && (
          <button type="button" onClick={onRemove} className="bg-none border-none cursor-pointer text-xs text-p-muted">삭제</button>
        )}
      </div>

      <Field label="자녀 이름" required value={child.name} onChange={(v) => onUpdate({ name: v })} />

      <div>
        <label className="label">학년 <span className="text-p-green">*</span></label>
        <Select value={child.grade} onChange={(v) => onUpdate({ grade: v })} options={GRADES} placeholder="학년 선택" required ariaLabel={`자녀 ${index + 1} 학년`} />
      </div>

      <Field
        label="자녀 아이디 (영문 소문자 + 숫자, 6~15자)"
        required
        value={child.loginId}
        onChange={(v) => onUpdate({ loginId: v.toLowerCase(), loginIdError: "" })}
        onBlur={() => checkLoginId(child.loginId)}
        error={child.loginIdError}
      />

      <div>
        <label className="label" style={{ marginBottom: 8 }}>
          신청 서비스 <span className="text-p-green">*</span>{" "}
          <span className="text-[11px] text-p-muted font-normal">(복수 선택 가능)</span>
        </label>
        <div className="flex flex-col gap-2">
          {(services ?? SIGNUP_SERVICES).map((svc) => {
            const checked = child.selectedServices.includes(svc.slug);
            return (
              <div key={svc.slug}>
                <label
                  className={[
                    "flex cursor-pointer items-start gap-2.5 rounded-lg px-3.5 py-3",
                    checked
                      ? "border-[1.5px] border-p-green bg-[#f0faf1]"
                      : "border border-black/10 bg-white",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleService(svc.slug)}
                    className="mt-0.5 w-3.5 h-3.5 accent-p-green"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-black/95 flex items-center gap-1.5">
                        <ServiceIcon service={svc} size={16} /> {svc.name}
                      </span>
                      <span className={`text-[13px] font-bold shrink-0 ${checked ? "text-p-green" : "text-p-secondary"}`}>{svc.priceLabel}</span>
                    </div>
                    <p className="m-0 mt-0.5 text-[11px] text-p-muted">{svc.hook}</p>
                  </div>
                </label>
                {checked && (
                  <MonthsPicker
                    value={child.serviceMonths?.[svc.slug] ?? null}
                    onChange={(m) => onChangeMonths(svc.slug, m)}
                    className="flex gap-1 mt-1.5 mb-0.5 ml-1"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
