import { SERVICES, SITE } from "@/data/site";
import { formatWon } from "@/lib/format";
import type { Signup, SignupChild } from "@/lib/types";

export type { SignupChild };

const PARENT_SVC_NAMES: Record<string, string> = {
  momsaipack: "💻 엄마들을 위한 AI 패키지",
};

// 운영자가 부모에게 SMS로 보낼 입금 안내 메시지 빌더
export function buildPaymentGuide(signup: Pick<Signup,
  "parentName" | "children" | "parentServices" | "estimatedMonthly" | "finalMonthly"
>, overrideMonthly?: number): string {
  const lines: string[] = [];

  lines.push(`[플랜토] ${signup.parentName}님, 신청해 주셔서 감사합니다 🌱`);
  lines.push("");
  lines.push("📋 신청 내역:");

  for (const child of signup.children ?? []) {
    const svcNames = (child.selectedServices ?? [])
      .map((slug) => {
        const svc = SERVICES.find((s) => s.slug === slug);
        return svc ? `${svc.name} (${svc.priceLabel})` : slug;
      })
      .join(", ");
    lines.push(`· ${child.name} (${child.grade}) — ${svcNames}`);
  }

  for (const slug of signup.parentServices ?? []) {
    lines.push(`· ${PARENT_SVC_NAMES[slug] ?? slug} (학부모)`);
  }

  const base = overrideMonthly
    ?? ((signup.finalMonthly ?? 0) > 0 ? signup.finalMonthly! : (signup.estimatedMonthly ?? 0));
  const monthly = base > 0 ? base : 0;

  lines.push("");
  lines.push(`월 결제 합계: ${monthly > 0 ? formatWon(monthly) : "추후 안내"}`);

  lines.push("");
  lines.push(`입금 계좌 (${SITE.bank.name})`);
  lines.push(`${SITE.bank.account} (${SITE.bank.holder})`);
  lines.push("");
  lines.push("입금 확인 후 안내드리겠습니다.");
  lines.push("");
  lines.push("※ 신청 후 24시간 이내에 입금이 확인되지 않으면 신청이 자동으로 취소될 수 있어요. 입금이 어려우시면 편하게 말씀해 주세요 🌱");
  lines.push("멤버십 오픈톡방: https://open.kakao.com/o/gs9aP64h");

  return lines.join("\n");
}
