import { SERVICES, SITE } from "@/data/site";
import { formatWon } from "@/lib/format";

// 운영자가 부모에게 카톡/SMS로 보낼 입금 안내 메시지 빌더
export function buildPaymentGuide(args: {
  parentName: string;
  childName: string;
  childGrade: string;
  selectedServices: string[];
}): string {
  const lines: string[] = [];

  lines.push(`안녕하세요, ${args.parentName}님 🌱`);
  lines.push(`Plantor 신청해 주셔서 감사합니다.`);
  lines.push("");
  lines.push(`▫ 자녀: ${args.childName} (${args.childGrade})`);
  lines.push(`▫ 신청 서비스:`);

  let monthly = 0;
  for (const slug of args.selectedServices) {
    const svc = SERVICES.find((s) => s.slug === slug);
    if (!svc) continue;
    lines.push(`   - ${svc.name} / ${svc.priceLabel}`);
    monthly += svc.pricePerMonth ?? 0;
  }

  const firstPayment = monthly + SITE.enrollmentFee - SITE.newSignupDiscount;

  lines.push("");
  lines.push(`💰 첫 결제: ${formatWon(firstPayment)}`);
  lines.push(
    `   (월 ${formatWon(monthly)} + 가맹비 ${formatWon(
      SITE.enrollmentFee
    )} - 신규 할인 ${formatWon(SITE.newSignupDiscount)})`
  );
  lines.push("");
  lines.push(`🏦 입금 계좌`);
  lines.push(`   ${SITE.bank.name} ${SITE.bank.account}`);
  lines.push(`   예금주: ${SITE.bank.holder}`);
  lines.push(`   입금자명: ${args.parentName} (필수)`);
  lines.push("");
  lines.push(`입금 확인 후 학습 프로그램 ID/PW를 즉시 발급해 드립니다.`);
  lines.push(`궁금한 점은 이 톡방으로 답장 주세요!`);

  return lines.join("\n");
}
