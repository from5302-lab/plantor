#!/usr/bin/env node
/**
 * 카톡 안내 메시지 템플릿 미리보기 (TS 코드와 동일 로직을 JS로 복제)
 * src/lib/messages.ts 와 src/data/site.ts 를 수정하면 이 스크립트도 같이 갱신해야 함.
 */

const SITE = {
  bank: { name: "[은행명]", account: "[계좌번호]", holder: "[예금주]" },
  enrollmentFee: 6000,
  newSignupDiscount: 5000,
};

const SERVICES = [
  { slug: "class5", name: "초등 클래스5", priceLabel: "월 15,000원", pricePerMonth: 15000 },
  { slug: "dailykor", name: "매일국어", priceLabel: "월 33,000원", pricePerMonth: 33000 },
  { slug: "classcard-middle", name: "중등 클래스카드 (내신본문암기)", priceLabel: "월 15,000원", pricePerMonth: 15000 },
  { slug: "english-1on1", name: "1:1 온라인 영어과외", priceLabel: "별도 문의", pricePerMonth: 0 },
  { slug: "mom-webinar", name: "[Mom&] 맘이랑 금요웨비나", priceLabel: "무료", pricePerMonth: 0 },
];

const formatWon = (n) => `₩${n.toLocaleString("ko-KR")}`;

function buildPaymentGuide({ parentName, childName, childGrade, selectedServices }) {
  const lines = [];
  lines.push(`안녕하세요, ${parentName}님 🌱`);
  lines.push(`Plantor 신청해 주셔서 감사합니다.`);
  lines.push("");
  lines.push(`▫ 자녀: ${childName} (${childGrade})`);
  lines.push(`▫ 신청 서비스:`);
  let monthly = 0;
  for (const slug of selectedServices) {
    const svc = SERVICES.find((s) => s.slug === slug);
    if (!svc) continue;
    lines.push(`   - ${svc.name} / ${svc.priceLabel}`);
    monthly += svc.pricePerMonth ?? 0;
  }
  const firstPayment = monthly + SITE.enrollmentFee - SITE.newSignupDiscount;
  lines.push("");
  lines.push(`💰 첫 결제: ${formatWon(firstPayment)}`);
  lines.push(
    `   (월 ${formatWon(monthly)} + 가맹비 ${formatWon(SITE.enrollmentFee)} - 신규 할인 ${formatWon(SITE.newSignupDiscount)})`
  );
  lines.push("");
  lines.push(`🏦 입금 계좌`);
  lines.push(`   ${SITE.bank.name} ${SITE.bank.account}`);
  lines.push(`   예금주: ${SITE.bank.holder}`);
  lines.push(`   입금자명: ${parentName} (필수)`);
  lines.push("");
  lines.push(`입금 확인 후 학습 프로그램 ID/PW를 즉시 발급해 드립니다.`);
  lines.push(`궁금한 점은 이 톡방으로 답장 주세요!`);
  return lines.join("\n");
}

const sample = buildPaymentGuide({
  parentName: "김다영",
  childName: "찬영",
  childGrade: "초2",
  selectedServices: ["dailykor", "class5"],
});

console.log("─".repeat(60));
console.log(sample);
console.log("─".repeat(60));
