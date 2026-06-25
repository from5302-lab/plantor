# 교과서 라이브러리 — 컨텍스트 메모리

**호출 키워드**: "교과서 라이브러리"라고 부르면 이 작업을 이어서 진행한다.

## 무엇인가

중1~고3 한국 교과서 단원 데이터베이스. 출판사·학년·교육과정·과목별로 정리된 JSON 라이브러리 + 웹뷰어.

- **위치**: `docs/textbook-library/` (이 파일과 같은 레벨)
- **메인 데이터**: `docs/textbook-library/data/books.json`
- **웹뷰어**: `docs/textbook-library/index.html`
- **수집 절차/출처**: `docs/textbook-library/README.md`

## 현재 상태 (2026-05-27 기준)

총 **605권** 라이브러리:

| 분류 | 권수 | 설명 |
|---|---|---|
| ✓ verified | 120 | 출판사 1차 자료에서 단원까지 확인 |
| ≈ 표준 시드 | 53 | 교육과정 표준 단원으로 시드 |
| 📋 카탈로그 stub | 432 | 출판사·저자·과목·학년만, 단원 미수집 |

**학년별 권수**: 중1 85, 중2 96, 중3 66, 고1 96, 고2 95, 고3 167.

## Plantor `/note` 통합 상태

`src/lib/note/textbook-catalog.ts`와 `src/lib/note/unit-catalog.ts`에 라이브러리 데이터가 빌트인되어 있다.

- `PUBLISHERS` enum: 12개 (천재교육·비상교육·미래엔·YBM·동아출판·금성출판사·지학사·좋은책신사고·NE능률·창비교육·교학사·박영사)
- `TEXTBOOK_SEED`: 243개 중학 교과서 시드
- `UNIT_CATALOG`: 국·영·수·사·과·역 단원 트리 (중1·중2·중3 + 사회1·사회2·역사1·역사2)

`meta-dialog.tsx`가 위 두 파일을 import해서 단원 정보 다이얼로그를 그린다.

## 재생성 방법

`books.json`을 갱신한 뒤 plantor 카탈로그를 다시 빌드하려면:

```bash
cd docs/textbook-library/data
python3 << 'EOF'
# (plantor-textbook-catalog.ts와 plantor-unit-catalog.ts를 books.json에서 생성하는 스크립트)
# 자세한 내용은 plantor-import.json 참고
EOF

cp plantor-textbook-catalog.ts ../../../src/lib/note/textbook-catalog.ts
cp plantor-unit-catalog.ts ../../../src/lib/note/unit-catalog.ts
npx tsc --noEmit
```

## 데이터 출처 (다시 수집·검증할 때 참고)

**텍스트 TOC를 직접 추출한 사이트 — 자동화 가능**
- EXAM4YOU 중등·고등 교과서 목차 다운로드: https://exam4you.com (정회원 필요, 영어 12개 출판사 풀데이터)
- 미래엔 자습서: https://eduteacher.mirae-n.com (국·영·수·사·과·역 전과목)
- NE능률 NE Books: https://m.nebooks.co.kr (영어 풀데이터)
- YBM Y클라우드: https://www.ybmcloud.com/textbook/ (영어·수학·과학)
- 영어과외TV: https://englishtutortv.com (모든 출판사 영어 본문 제목까지)
- 수학카페: https://mathcafe.co.kr/9 (중학 수학 표준 단원)
- 나무위키 교육과정 페이지: 표준 단원
- 지학사 PDF 미리보기: `jihak.co.kr/upload/public/pdf-viewer/TB/{id}.pdf`

**이미지 TOC만 제공 — 수동 전사 필요**
- 천재교육·천재교과서 text.tsherpa.co.kr
- 비상교육 textbook.visang.com
- 동아출판 promotion.douclass.com
- 지학사 textbook.jihak.co.kr (PDF 미리보기는 텍스트 가능)
- 미래엔 22txbook.m-teacher.co.kr

**공식 메타데이터**
- 한국교육과정평가원 교과서 검정: https://tbh.kice.re.kr/inf/if001List.do
- 한국교과서협회: https://www.ktbook.com / https://www.ktbookmall.com
- 2022 개정 인정 도서 PDF: https://clik.nanet.go.kr/clikr-collection/policyinfo/202/1010/2024/CLIKC4251296808179160_attach_1.pdf

## 알려진 빈 칸

- 중1 역사: 역사 교과는 중2부터 시작 (의도된 공백)
- 중3 사회: 사회 ①·②는 중1·중2에서 끝남
- 카탈로그 stub 432권은 단원 미수집 → 출판사 사이트에서 확인 후 ✓로 전환 필요
- 표준 시드 53권의 출판사별 미세 차이는 1차 자료로 추후 확인

## 작업 재개 시 권장 순서

1. `docs/textbook-library/data/books.json` 읽어 현재 상태 파악
2. 빈 칸 또는 stub 권 골라서 출판사 사이트 가서 단원 채우기
3. JSON 갱신 → plantor 카탈로그 재빌드 → `npx tsc --noEmit` 통과 확인
4. `/note` 페이지에서 시각 확인
