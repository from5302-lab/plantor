import { SITE } from "@/data/site";

const WHAT_TO_EXPECT = [
  { emoji: "💬", title: "광고 없는 현실 후기", desc: "써본 엄마들 이야기만 나와요. 블로그 체험단 아님. 진짜임." },
  { emoji: "🆕", title: "Plantor 신규 프로그램 선공개", desc: "새 서비스는 여기서 먼저 풀려요. 먼저 들어온 분들이 먼저 써봐요." },
  { emoji: "🤝", title: "혼자 고민하지 않아도 되는 곳", desc: "\"학원 보내야 해?\" \"AI가 다 한다는데?\" 같은 질문, 혼자 검색하지 마세요." },
  { emoji: "⏱️", title: "딱 30분", desc: "매주 금요일 저녁, 아이 재우기 전 잠깐. 부담 없이 들어왔다 나가면 돼요." },
];

export function WebinarTab() {
  return (
    <div className="max-w-[680px] mx-auto px-4 pb-16">
      {/* Hero */}
      <div className="text-center pt-10 pb-8">
        <p className="m-0 mb-3 text-[11px] font-semibold tracking-[0.12em] uppercase text-p-muted">
          매주 금요일 · 무료 · 온라인
        </p>
        <h2 className="m-0 mb-5 text-[clamp(24px,4vw,34px)] font-bold tracking-[-0.8px] text-black/95 leading-tight">
          🙋‍♀️ 금요일 밤,<br />엄마들의 30분
        </h2>
        <p className="m-0 mb-7 text-[15px] leading-[1.7] text-p-secondary">
          &ldquo;뭘 시켜야 하지&rdquo; — 그 고민, 혼자 하지 마세요.<br />
          매주 금요일, 같은 고민 하는 엄마들이 모입니다.
        </p>
        <a
          href={SITE.kakaoOpenChat}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center h-[52px] px-9 rounded bg-p-green text-white text-[15px] font-bold no-underline"
        >
          카카오 오픈채팅 무료 참여 →
        </a>
        <p className="mt-2.5 text-xs text-p-muted">신청서 없어요. 카톡 들어오면 끝.</p>
      </div>

      {/* 기대할 것들 */}
      <div className="grid gap-3.5 mb-10" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {WHAT_TO_EXPECT.map((item) => (
          <div key={item.title} className="bg-p-bg border border-black/10 rounded-xl p-[22px]">
            <div className="text-[26px] mb-2.5">{item.emoji}</div>
            <h3 className="m-0 mb-1.5 text-sm font-semibold text-black/95">{item.title}</h3>
            <p className="m-0 text-[13px] leading-[1.65] text-p-secondary">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* 참여 방법 */}
      <h3 className="m-0 mb-3.5 text-base font-bold text-black/95 text-center">참여 방법은 하나예요</h3>
      <div className="flex flex-col gap-2.5 mb-7">
        {[
          { step: "1", text: "아래 카카오 오픈채팅 링크를 눌러요" },
          { step: "2", text: "채팅방에 들어오면 끝이에요 (신청서 없음)" },
          { step: "3", text: "매주 금요일 저녁, 알림 받고 들어오세요" },
        ].map(({ step, text }) => (
          <div key={step} className="flex items-center gap-3.5 bg-white border border-black/10 rounded-xl px-[18px] py-3.5">
            <div className="w-[30px] h-[30px] rounded-full bg-p-green text-white flex items-center justify-center text-[13px] font-bold shrink-0">{step}</div>
            <span className="text-sm text-black/95 font-medium">{text}</span>
          </div>
        ))}
      </div>

      <div className="text-center">
        <a
          href={SITE.kakaoOpenChat}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center h-[52px] px-9 rounded bg-p-green text-white text-[15px] font-bold no-underline"
        >
          무료로 참여하기 →
        </a>
        <p className="mt-2.5 text-xs text-p-muted">무료예요. 부담 없이 들어왔다 나가도 돼요.</p>
      </div>
    </div>
  );
}
