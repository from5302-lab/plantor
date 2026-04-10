import { SERVICES, SITE } from "@/data/site";
import { formatWon } from "@/lib/format";

export type SignupChild = {
  name: string;
  grade: string;
  loginId: string;
  selectedServices: string[];
};

// 운영자가 부모에게 카톡/SMS로 보낼 입금 안내 메시지 빌더
export function buildPaymentGuide(args: {
  parentName: string;
  children: SignupChild[];
}): string {
  const lines: string[] = [];

  lines.push(`안녕하세요, ${args.parentName}님 🌱`);
  lines.push(`Plantor 신청해 주셔서 감사합니다.`);
  lines.push("");

  let monthlyTotal = 0;
  for (const child of args.children) {
    lines.push(`▫ ${child.name} (${child.grade}) — ID: ${child.loginId}`);
    for (const slug of child.selectedServices) {
      const svc = SERVICES.find((s) => s.slug === slug);
      if (!svc) continue;
      lines.push(`   - ${svc.name} / ${svc.priceLabel}`);
      monthlyTotal += svc.pricePerMonth ?? 0;
    }
    lines.push("");
  }

  if (monthlyTotal > 0) {
    lines.push(`💰 월 결제 합계: ${formatWon(monthlyTotal)}`);
    lines.push("");
  }

  lines.push(`🏦 입금 계좌`);
  lines.push(`   ${SITE.bank.name} ${SITE.bank.account}`);
  lines.push(`   예금주: ${SITE.bank.holder}`);
  lines.push(`   입금자명: ${args.parentName} (필수)`);
  lines.push("");
  lines.push(`입금 확인 후 학습 프로그램 ID/PW를 즉시 발급해 드립니다.`);
  lines.push(`궁금한 점은 이 톡방으로 답장 주세요!`);

  return lines.join("\n");
}
