// 학년·과목별 단원 트리. 모든 단원에 숫자 prefix 부착.
// 교육과정 차이:
//  - 중1, 중2: 2022 개정 교육과정 적용 (2025·2026년부터 순차 적용)
//  - 중3: 2015 개정 교육과정 적용 (2027년부터 2022 개정 예정)
// 사회·역사: 권 단위라 학년 무관 (사회1·사회2·역사1·역사2)
// 데이터 출처: textbook-library (EXAM4YOU + 미래엔 자습서 + 지학사 PDF + namu wiki)

export type UnitEntry = {
  large: string;
  middle?: string;
  smalls?: string[];
};

type Catalog = Record<string, Partial<Record<string, UnitEntry[]>>>;

export const UNIT_CATALOG: Catalog = {
  국어: {
    중1: [
      { large: "1. 표현과 소통의 즐거움", smalls: ["(1) 길 (김종상)", "(2) 사랑하는 별 하나 (이성선)", "(3) 매체로 소통하기", "미래를 여는 창의 활동: 나를 상징하는 그림말 만들기", "국어로 만나는 세상: 다양한 매체로 만난 시"] },
      { large: "2. 간추리고 쓰고", smalls: ["(1) 요약하며 읽기", "(2) 정보를 전달하는 글쓰기", "미래를 여는 창의 활동: 우리 지역 박물관 소개 책자 만들기", "국어로 만나는 세상: 생활 속에서 만나는 요약"] },
      { large: "3. 능동적인 언어생활", smalls: ["(1) 추론하며 듣기", "(2) 품사의 종류와 특성", "미래를 여는 창의 활동: 우리들의 소식을 전달하는 라디오 뉴스 만들기", "국어로 만나는 세상: 세상을 움직인 연설가"] },
      { large: "4. 성장의 시간", smalls: ["(1) 옥수수 뺑소니 (박상기)", "(2) 정서를 표현하는 글쓰기 (안녕, 나의 몽글기 / 이다행)", "미래를 여는 창의 활동: 나를 찾는 자서전 쓰기", "국어로 만나는 세상: 문학이 삶이 숨 쉬는 문학관"] },
    ],
    중2: [
      { large: "1. 시선과 목소리", smalls: ["(1) 세상에서 가장 따뜻했던 저녁 (복효근)", "(2) 내가 그린 히말라야시다 그림 (성석제)"] },
      { large: "2. 한글은 바르게, 발표는 효과적으로", smalls: ["(1) 우리의 훈민정음", "(2) 정보를 담은 그림, 픽토그램"] },
      { large: "3. 생활 속의 문학 읽기", smalls: ["한 학기 한 권 읽기"] },
      { large: "4. 함께 이해하는 설명", smalls: ["(1) 세금, 얼마나 알고 있나요 (조준현)", "(2) 설명하는 글 쓰기"] },
      { large: "5. 상황에 맞는 대화", smalls: ["(1) 담화와 국어 생활", "(2) 들판에서 (이강백)"] },
    ],
  },
  영어: {
    중1: [
      { large: "1과 Are You Ready?", smalls: ["본문 What's in Your School Survived Kit?"] },
      { large: "2과 My Happy Life", smalls: ["본문 Then and Now"] },
      { large: "3과 Be Open to Differences", smalls: ["본문 We Have a Cat on Our Team!"] },
      { large: "4과 Let's Travel Together!", smalls: ["본문 Plan B Was Great, Too!"] },
      { large: "5과 Think Green, Live Green", smalls: ["본문 Small Actions, Big Change"] },
      { large: "6과 Dear Future Me", smalls: ["본문 Who Do I Want to Be?"] },
      { large: "7과 You Know What?", smalls: ["본문 Amazing Facts About the World"] },
      { large: "Special Reading 1 The World of Picasso", smalls: [] },
      { large: "Special Reading 2 The King with Donkey Ears", smalls: [] },
    ],
    중2: [
      { large: "1과 Together with Friends", smalls: ["본문 What Kind of Friend Are You?"] },
      { large: "2과 The Joy of Helping", smalls: ["본문 Warm Hearts for Our Community"] },
      { large: "3과 Happy School Days", smalls: ["본문 The School Heroes Awards"] },
      { large: "4과 Always Stay Healthy", smalls: ["본문 Sleep Matters for Teenagers"] },
      { large: "Special Lesson 1 THE BRIDGE RIDDLE", smalls: [] },
      { large: "5과 We're All Special", smalls: ["본문 The Dot"] },
      { large: "6과 Let's Travel!", smalls: ["본문 Yeji's Family Trip to the Rainbow State"] },
      { large: "7과 Buy, Sell, Share", smalls: ["본문 My Day with the Sharing Economy"] },
      { large: "8과 Technology All Around Us", smalls: ["본문 A Chat with an AI Chatbot"] },
      { large: "Special Lesson 2 Fly Away Home", smalls: [] },
    ],
    중3: [
      { large: "1과 All about Me", smalls: ["본문 My Dream House"] },
      { large: "2과 Experience Different Cultures!", smalls: ["본문 Let's Learn about Cultural Differences"] },
      { large: "3과 Future Dreams, Future Jobs", smalls: ["본문 The World of Wonderful Jobs"] },
      { large: "4과 Are You a Digital Citizen?", smalls: ["본문 Time for Digital Detox"] },
      { large: "5과 Love for My Country", smalls: ["본문 My Wish"] },
      { large: "6과 Meet the World", smalls: ["본문 Hello! New Zealand"] },
      { large: "7과 How to Get Along with People", smalls: ["본문 Three Things about a Proper Apology"] },
      { large: "8과 Have Fun with Art!", smalls: ["본문 Pop Art: Art for Everyone"] },
      { large: "9과 You Can Do It, Too", smalls: ["본문 Great Help with a Beautiful Mind"] },
      { large: "Special Lesson The Necklace", smalls: [] },
    ],
  },
  수학: {
    중1: [
      { large: "Ⅰ. 소인수분해", smalls: ["1 소수와 합성수", "2 소인수분해", "3 최대공약수와 최소공배수"] },
      { large: "Ⅱ. 정수와 유리수", smalls: ["1 정수와 유리수", "2 정수와 유리수 대소 관계", "3 정수와 유리수 덧셈", "4 정수와 유리수 뺄셈", "5 정수와 유리수 곱셈", "6 정수와 유리수 나눗셈"] },
      { large: "Ⅲ. 문자와 식", smalls: ["1 문자의 사용과 식의 값", "2 일차식과 수의 곱셈, 나눗셈", "3 일차식의 덧셈과 뺄셈", "4 등식과 방정식", "5 일차방정식의 풀이"] },
      { large: "Ⅳ. 좌표평면과 그래프", smalls: ["1 순서쌍과 좌표", "2 그래프", "3 정비례", "4 반비례"] },
      { large: "Ⅴ. 기본 도형과 작도", smalls: ["1 점, 선, 면", "2 각", "3 위치 관계", "4 평행선의 성질", "5 간단한 도형의 작도", "6 삼각형의 작도", "7 삼각형의 합동 조건"] },
      { large: "Ⅵ. 평면도형의 성질", smalls: ["1 다각형", "2 삼각형의 내각과 외각", "3 다각형의 내각과 외각의 크기의 합", "4 원과 부채꼴", "5 부채꼴의 호의 길이와 넓이"] },
      { large: "Ⅶ. 입체도형의 성질", smalls: ["1 다면체", "2 회전체", "3 기둥과 뿔의 부피", "4 기둥과 뿔의 겉넓이", "5 구의 부피와 겉넓이"] },
      { large: "Ⅷ. 자료의 정리와 해석", smalls: ["1 대푯값", "2 줄기와 잎 그림", "3 도수분포표와 히스토그램", "4 상대도수와 그 그래프", "5 통계적 문제해결"] },
    ],
    중2: [
      { large: "1. 유리수와 순환소수", smalls: [] },
      { large: "2. 식의 계산", smalls: [] },
      { large: "3. 부등식과 연립방정식", smalls: [] },
      { large: "4. 일차함수와 그래프", smalls: [] },
      { large: "5. 삼각형과 사각형의 성질", smalls: [] },
      { large: "6. 도형의 닮음과 피타고라스 정리", smalls: [] },
      { large: "7. 확률", smalls: [] },
    ],
    중3: [
      { large: "Ⅰ. 실수와 그 계산", smalls: ["1 제곱근과 실수", "2 근호를 포함한 식의 계산"] },
      { large: "Ⅱ. 인수분해와 이차방정식", smalls: ["1 다항식의 곱셈", "2 인수분해", "3 이차방정식"] },
      { large: "Ⅲ. 이차함수", smalls: ["1 이차함수와 그 그래프"] },
      { large: "Ⅳ. 삼각비", smalls: ["1 삼각비", "2 삼각비의 활용"] },
      { large: "Ⅴ. 원의 성질", smalls: ["1 원과 직선", "2 원주각"] },
      { large: "Ⅵ. 통계", smalls: ["1 산포도", "2 상자그림과 산점도"] },
    ],
  },
  사회: {
    사회1: [
      { large: "Ⅰ. 세계화 시대, 지리의 힘", smalls: [] },
      { large: "Ⅱ. 아시아", smalls: [] },
      { large: "Ⅲ. 유럽", smalls: [] },
      { large: "Ⅳ. 아프리카", smalls: [] },
      { large: "Ⅴ. 아메리카", smalls: [] },
      { large: "Ⅵ. 오세아니아와 극지방", smalls: [] },
      { large: "Ⅶ. 인간과 사회생활", smalls: [] },
      { large: "Ⅷ. 다양한 문화의 이해", smalls: [] },
      { large: "Ⅸ. 민주주의와 시민", smalls: [] },
      { large: "Ⅹ. 정치과정과 시민 참여", smalls: [] },
      { large: "Ⅺ. 일상생활과 법", smalls: [] },
      { large: "Ⅻ. 인권과 기본권", smalls: [] },
    ],
    사회2: [
      { large: "Ⅰ. 사회 변동과 사회 문제", smalls: [] },
      { large: "Ⅱ. 경제 활동과 시장 경제", smalls: [] },
      { large: "Ⅲ. 국민 경제와 국제 거래", smalls: [] },
      { large: "Ⅳ. 기후 변화와 지속가능한 세계", smalls: [] },
      { large: "Ⅴ. 지역의 변화와 미래", smalls: [] },
    ],
  },
  역사: {
    역사1: [
      { large: "Ⅰ. 역사 학습의 기초", smalls: [] },
      { large: "Ⅱ. 문명의 발생과 고대 세계의 형성", smalls: [] },
      { large: "Ⅲ. 세계 종교의 확산과 지역 문화의 발전", smalls: [] },
      { large: "Ⅳ. 지역 세계의 교류와 변화", smalls: [] },
      { large: "Ⅴ. 제국주의와 국민 국가 건설 운동", smalls: [] },
      { large: "Ⅵ. 세계 대전과 사회 변동", smalls: [] },
      { large: "Ⅶ. 현대 세계의 전개와 과제", smalls: [] },
    ],
  },
  과학: {
    중1: [
      { large: "Ⅰ. 과학과 인류의 지속가능한 삶", smalls: ["과학과 인류의 지속가능한 삶", "대단원 마무리하기"] },
      { large: "Ⅱ. 생물의 구성과 다양성", smalls: ["1 생물의 구성", "2 생물의 다양성"] },
      { large: "Ⅲ. 열", smalls: ["1 열", "2 비열과 열팽창"] },
      { large: "Ⅳ. 물질의 상태 변화", smalls: ["1 입자의 운동과 물질의 상태", "2 상태 변화와 열에너지"] },
      { large: "Ⅴ. 힘의 작용", smalls: ["1 여러 가지 힘", "2 힘과 물체의 운동"] },
      { large: "Ⅵ. 기체의 성질", smalls: ["1 기체의 압력과 부피 관계", "2 기체의 온도와 부피 관계"] },
      { large: "Ⅶ. 태양계", smalls: ["1 태양계 구성 천체와 태양의 활동", "2 지구와 달의 운동"] },
    ],
    중2: [
      { large: "Ⅰ. 물질의 특성", smalls: ["1 물질의 특성", "2 혼합물의 분리"] },
      { large: "Ⅱ. 지권의 변화", smalls: ["1 지권의 구성", "2 지권의 변화"] },
      { large: "Ⅲ. 빛과 파동", smalls: ["1 빛", "2 파동"] },
      { large: "Ⅳ. 물질의 구성", smalls: ["1 물질을 구성하는 성분", "2 물질을 구성하는 입자"] },
      { large: "Ⅴ. 식물과 에너지", smalls: ["1 광합성", "2 식물의 호흡과 에너지"] },
      { large: "Ⅵ. 동물과 에너지", smalls: ["1 소화와 순환", "2 호흡과 배설"] },
      { large: "Ⅶ. 전기와 자기", smalls: ["1 전기", "2 자기"] },
      { large: "Ⅷ. 별과 우주", smalls: ["1 별의 특성", "2 우리은하와 우주"] },
    ],
  },
};

export function getLargeUnits(subject: string, grade: string): string[] {
  const entries = UNIT_CATALOG[subject]?.[grade] ?? [];
  return Array.from(new Set(entries.map((e) => e.large)));
}

export function getMiddleUnits(subject: string, grade: string, large: string): string[] {
  const entries = UNIT_CATALOG[subject]?.[grade] ?? [];
  return Array.from(
    new Set(
      entries
        .filter((e) => e.large === large)
        .map((e) => e.middle)
        .filter((m): m is string => !!m),
    ),
  );
}

export function getSmallUnits(
  subject: string,
  grade: string,
  large: string,
  middle?: string,
): string[] {
  const entries = UNIT_CATALOG[subject]?.[grade] ?? [];
  if (middle) {
    const match = entries.find((e) => e.large === large && e.middle === middle);
    return match?.smalls ?? [];
  }
  const match = entries.find((e) => e.large === large && !e.middle);
  return match?.smalls ?? [];
}

export function hasUnitCatalog(subject: string, grade: string): boolean {
  return !!UNIT_CATALOG[subject]?.[grade]?.length;
}
