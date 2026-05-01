import { SERVICES, SITE } from "@/data/site";
import { formatWon } from "@/lib/format";
import type { Signup, SignupChild } from "@/lib/types";

export type { SignupChild };

const PARENT_SVC_NAMES: Record<string, string> = {
  momsaipack: "💻 엄마들을 위한 AI 패키지",
  "mom-webinar": "🙋‍♀️ [Mom&] 맘이랑 금요웨비나",
};

// 운영자가 부모에게 SMS로 보낼 입금 안내 메시지 빌더
export function buildPaymentGuide(signup: Pick<Signup,
  "parentName" | "children" | "parentServices" | "estimatedMonthly" | "finalMonthly" | "couponCode" | "couponDiscount" | "referralCode" | "referralDiscount"
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
  const discount = (signup.couponDiscount ?? 0) + (signup.referralDiscount ?? 0);
  const monthly = base > 0 ? base : 0;

  lines.push("");
  lines.push(`월 결제 합계: ${monthly > 0 ? formatWon(monthly) : "추후 안내"}`);
  if (signup.couponCode && (signup.couponDiscount ?? 0) > 0) {
    lines.push(`쿠폰 할인 (${signup.couponCode}): -${formatWon(signup.couponDiscount!)}`);
  }
  if (signup.referralCode && (signup.referralDiscount ?? 0) > 0) {
    lines.push(`추천인 할인: -${formatWon(signup.referralDiscount!)}`);
  }
  if (discount > 0 && monthly > 0) {
    lines.push(`최종 결제: ${formatWon(monthly - discount)}`);
  }

  lines.push("");
  lines.push(`입금 계좌 (${SITE.bank.name})`);
  lines.push(`${SITE.bank.account} (${SITE.bank.holder})`);
  lines.push("");
  lines.push("입금 확인 후 안내드리겠습니다.");
  lines.push("멤버십 오픈톡방: https://open.kakao.com/o/gs9aP64h");

  return lines.join("\n");
}
