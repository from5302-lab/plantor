"use client";

import { T } from "@/lib/design-tokens";
import { ModalOverlay } from "@/components/ui/modal-overlay";

export function ConsentModal({ onAgree, onCancel }: { onAgree: () => void; onCancel: () => void }) {
  return (
    <ModalOverlay onClose={onCancel}>
      <div className="bg-white rounded-2xl max-w-[360px] w-full px-7 py-8" style={{ boxShadow: T.shadowFloat }}>
        <div className="text-center mb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.svg" alt="" width={48} height={48} />
        </div>
        <h2 className="m-0 mb-2 text-lg font-bold text-black/95 text-center" style={{ letterSpacing: "-0.2px" }}>수업 모니터링 안내</h2>
        <p className="m-0 mb-5 text-[13px] text-p-secondary text-center" style={{ lineHeight: 1.6 }}>수업 중 아래 정보가 수집돼요</p>

        <div className="bg-p-bg rounded-xl px-4 py-3.5 mb-5 flex flex-col gap-2.5">
          {[
            { icon: "⏱️", text: "화면 공유 유지 시간" },
            { icon: "📋", text: "학습 외 탭 이탈 여부" },
            { icon: "📸", text: "수업 종료 후 인증샷" },
          ].map((item) => (
            <div key={item.text} className="flex items-center gap-2.5">
              <span className="text-base shrink-0">{item.icon}</span>
              <span className="text-[13px] font-medium text-black/95">{item.text}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-2.5 mt-6">
          <button
            onClick={onCancel}
            className="btn-secondary flex-1 h-11 rounded border border-black/10 bg-transparent text-sm font-semibold text-p-secondary cursor-pointer"
          >
            취소
          </button>
          <button
            onClick={onAgree}
            className="h-11 rounded border-none bg-p-teal text-sm font-semibold text-white cursor-pointer"
            style={{ flex: 2 }}
          >
            동의하고 시작 →
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
