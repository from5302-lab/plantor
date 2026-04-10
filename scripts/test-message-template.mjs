#!/usr/bin/env node
/**
 * 카톡 안내 메시지 템플릿 미리보기 (TS 코드와 동일 로직을 JS로 복제)
 * src/lib/messages.ts 와 src/data/site.ts 를 수정하면 이 스크립트도 같이 갱신해야 함.
 */

const SITE = {
  bank: { name: "[은행명]", account: "[계좌번호]", holder: "[예금주]" },
};

const SERVICES = [
  { slug: "class5", name: "초등 클래스5", priceLabel: "월 15,000원", pricePerMonth: 15000 },
  { slug: "dailykor", name: "매일국어", priceLabel: "월 33,000원", pricePerMonth: 33000 },
  { slug: "classcard-middle", name: "중등 클래스카드 (내신본문암기)", priceLabel: "월 15,000원", pricePerMonth: 15000 },
];

const formatWon = (n) => `₩${n.toLocaleString("ko-KR")}`;

function buildPaymentGuide({ parentName, children }) {
  const lines = [];
  lines.push(`안녕하세요, ${parentName}님 🌱`);
  lines.push(`Plantor 신청해 주셔서 감사합니다.`);
  lines.push("");

  let monthlyTotal = 0;
  for (const child of children) {
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
  lines.push(`   입금자명: ${parentName} (필수)`);
  lines.push("");
  lines.push(`입금 확인 후 학습 프로그램 ID/PW를 즉시 발급해 드립니다.`);
  lines.push(`궁금한 점은 이 톡방으로 답장 주세요!`);
  return lines.join("\n");
}

const sample = buildPaymentGuide({
  parentName: "김다영",
  children: [
    {
      name: "찬영",
      grade: "초2",
      loginId: "ycy0222",
      selectedServices: ["dailykor", "class5"],
    },
    {
      name: "민영",
      grade: "중1",
      loginId: "myj0610",
      selectedServices: ["classcard-middle"],
    },
  ],
});

console.log("─".repeat(60));
console.log(sample);
console.log("─".repeat(60));
