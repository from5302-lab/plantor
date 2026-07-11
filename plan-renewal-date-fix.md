# plan — 구독 만료 알림 날짜 기준을 1:1과 통일 (옵션 B)

> 작성일: 2026-06-26 · 상태: 검토 대기 (승인 전 구현 금지)

## 목표
구독(subscriptions) 만료 알림의 D-day 기준을 1:1 수업(directClasses)과 동일하게 맞춘다.
**옵션 B = 만료일 당일을 D-0으로** (만료일까지 서비스 유효).

- 만료일 6/30 → D-7: 6/23, D-3: 6/27, D-0: 6/30 (1:1과 동일)
- 현재 구독은 만료일을 하루 앞당겨 읽어 6/26(=실제 D-4)에 발송됨 → 이걸 6/27로 정정

## 근본 원인 (확인 완료)
- 화면의 "~2026.6.30" = endDate의 **KST 달력 날짜** (브라우저 `toLocaleDateString("ko-KR")`, members-tab.tsx:216)
- 1:1 `expiry`는 `"2026-06-30"` KST 날짜 문자열 → 그 날짜를 D-0으로 셈
- 구독은 endDate(Timestamp)를 **33시간 윈도우**로 매칭 → 6/30 00:00 KST 저장값이 "대상일 29" 버킷에 걸려 하루 일찍 발송
- 부수 버그: 33시간 윈도우가 인접일과 9시간 겹쳐, **자정 저장 구독자는 같은 D-알림이 이틀 연속 중복 발송**됨

## 실제 endDate 저장 형태 (active 34건 조사)
| 패턴 | 건수 | 예시(KST) | KST 달력 날짜 |
|---|---|---|---|
| 00:00 KST | 30 | 6/30 00:00 | 6/30 ✓ |
| 09:00 KST (=UTC 자정) | 2 | 6/30 09:00 | 6/30 ✓ |
| 23:59 KST | 2 | 12/31 23:59 | 12/31 ✓ |

→ 시각은 제각각이어도 **KST 달력 날짜는 모두 의도한 만료일과 일치**. "endDate의 KST 날짜"로 비교하면 세 패턴 모두 안전하게 통일됨.

## 변경 (1곳, surgical)
**파일:** `functions/src/notifications.ts` — `sendSubscriptionExpiryNotice` 내부 (현재 472~493행)

날짜 윈도우 매칭을, 1:1과 동일한 **KST 날짜 정확 일치**로 교체:

```ts
const KST_OFFSET = 9 * 60 * 60 * 1000;
// 오늘(KST) + daysAhead 의 KST 달력 날짜 (YYYY-MM-DD)
const nowKst = new Date(Date.now() + KST_OFFSET);
const targetStr = new Date(
  Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate() + daysAhead)
).toISOString().slice(0, 10);

const allActive = await db.collection("subscriptions")
  .where("status", "==", "active")
  .get();

// endDate 의 KST 달력 날짜가 대상일과 정확히 일치 = 만료일 당일을 D-0으로 (1:1과 동일)
const matching = allActive.docs.filter((d) => {
  const ed = d.data().endDate;
  if (!ed?.toDate) return false;
  const edKstStr = new Date(ed.toDate().getTime() + KST_OFFSET).toISOString().slice(0, 10);
  return edKstStr === targetStr;
});
```

- 그 아래 familyId 그룹핑·발송 로직은 **그대로** (건드리지 않음)
- 1:1 `sendDirectClassExpiryNotice`도 그대로 (이미 기준점이라 변경 없음)

## 효과
1. 구독·1:1 모두 만료일 당일 = D-0으로 통일 → 같은 만료일이면 같은 날 발송
2. 6/30 구독자: 오늘(6/26) 발송 안 됨, **내일 6/27(D-3)** 발송 — 1:1과 동일
3. 자정 저장 구독자의 **이틀 중복 발송 버그도 제거** (정확 일치라 1버킷만)

## 검증 (verify)
- [ ] `functions`에서 `npm run build` 통과 (타입 OK)
- [ ] 배포 전, 수정 로직을 로컬 스크립트로 dry-run:
      "6/27 기준 D-3 대상 = 6/30 만료 구독 9건/8가족"이 나오는지,
      "6/26 기준 발송 대상 0건"인지 확인
- [ ] 배포 후 6/27 11시(KST) 스케줄 발송 결과로 최종 확인

## 배포
- `firebase deploy --only functions:notifyExpiringSubscriptionD7,functions:notifyExpiringSubscriptionD3,functions:notifyExpiringSubscriptionD0`
- (외부 영향 작업 → 승인 후 실행)

## 이번 변경 범위 밖 (별도 처리, 운영자 액션)
전화번호 누락으로 알림이 안 가는 데이터 3건 — 어드민에서 번호 입력 필요:
- 양화정 (notion_pink_j, 클래스5) — 구독 phone 없음
- 이미진 (notion_would098, 매일국어) — 구독 phone 없음
- 정휘운 (directClasses, 매일국어 프리미엄) — students[0].parentPhone 없음

→ 번호 채우면, 오늘 누락된 양화정·이미진에게 D-3 수동 1회 재발송 가능 (원하면 별도 진행)

## 미해결 질문
- 없음 (정책 = 옵션 B로 확정). 승인 시 구현 시작.
