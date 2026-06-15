import type { PassageAnalysis } from "./types";

// PDF 18번(목적) 지문을 정답 기준으로 전사한 샘플. 렌더러 개발/검증용.
export const SAMPLE_18: PassageAnalysis = {
  topicTag: "목적",
  grade: "고2",
  titleEn:
    "Notice of the Temporary Unavailability of Underground Parking and Alternative Parking Information",
  titleKo: "지하 주차장 일시적 이용 불가와 대체 주차 정보의 안내",
  summary: [
    "필수 보수 공사를 시행하는 4월 1일~7일 동안 지하 주차장 이용이 불가함",
    "정문 맞은편에 위치한 임시 외부 주차장을 이용할 것을 부탁드림",
  ],
  content:
    "City Sports Center는 회원들에게 사전에 공지한 대로 지하 주차장의 필수 보수 공사를 진행할 예정으로, 그 결과 4월 1일부터 7일까지 지하 주차장을 이용할 수 없기에, 이 기간 동안 정문 맞은편의 임시 외부 주차장을 이용해 주실 것을 요청하며, 가능한 한 빨리 작업을 마칠 것을 약속하면서 불편에 대해 사과하고 이해와 협조를 구하고 있다.",
  flow: [
    {
      stage: "도입",
      range: "1~2",
      text: "City Sports Center를 지속적으로 이용해 주셔서 감사드리며, 사전에 공지해 드린 대로, 지하 주차장의 필수 보수 공사를 시행하고자 함",
    },
    {
      stage: "전개",
      range: "3~4",
      text: "4월 1일~7일 동안 지하 주차장 시설은 이용 불가하고, 이 기간 동안 정문 맞은편에 위치한 임시 외부 주차장을 이용해 주실 것을 부탁드림",
    },
    {
      stage: "마무리",
      range: "5~6",
      text: "가능한 한 빨리 작업을 마무리하는 데 전념할 것이며, 이로 인한 불편에 대해 진심으로 사과드리며, 안내와 협조에 감사드림",
    },
  ],
  sentences: [
    {
      num: 1,
      chunks: [
        { text: "We", role: "S" },
        { text: "greatly" },
        { text: "appreciate", role: "V", gloss: "~에 감사한다", highlight: true },
        { text: "your continued use", role: "O", gloss: "지속적인 이용" },
        { text: "of our sports center" },
      ],
      ko: "저희 스포츠 센터를 지속적으로 이용해 주셔서 대단히 감사합니다.",
      notes: [],
    },
    {
      num: 2,
      chunks: [
        { text: "As previously announced,", role: "conj", gloss: "사전에 공지된 바와 같이", bracket: true },
        { text: "we", role: "S" },
        { text: "will be conducting", role: "V", gloss: "~을 시행하다", highlight: true },
        { text: "essential maintenance", role: "O", gloss: "필수적인 유지·보수" },
        { text: "on our underground parking lot", role: "M", gloss: "지하 주차장에" },
      ],
      ko: "사전에 공지된 바와 같이, 저희는 지하 주차장의 필수 보수 공사를 시행하고자 합니다.",
      notes: [
        "유사관계대명사 as: '사전에 공지된 바와 같이'의 의미로 일반적으로 관용 표현으로 쓰이며, As was previously announced에서 was가 생략된 절로, 주어가 없는 불완전한 절이며 공지된 바이자 선행사는 뒤에 이어지는 주절 전체의 내용이다.",
        "will be -ing: 앞으로 미래에 진행되고 있을 예정임을 부드럽고 공식적으로 나타내기 위해, 단순 미래시제(will+동사원형)가 아닌 미래진행 will be conducting이 쓰였다.",
      ],
      grammarPlus: {
        title: "유사 관계대명사 as",
        body: "접속사 as가 관계대명사 역할(=접속사 역할과 함께, 이어지는 불완전한 절에 없는 주어·목적어 중 하나의 역할)을 할 때 유사관계대명사라고 한다. '~ 같이, ~처럼'을 뜻하는 절을 연결하는 접속사와, 앞이나 뒤에 있는 '주절' 전체를 가리키는 대명사의 역할을 동시에 하는 경우이며 보통 단수로 취급된다. e.g. as follows 다음과 같이 / as (was) expected 예상한 대로 / as is well known 잘 알려진 대로 / as is often the case (with ~) ~에게 흔히 있는 일이지만",
      },
      check: {
        label: "현재분사 vs. 과거분사",
        prompt:
          "As previously announced, we will be ___ essential maintenance on our underground parking lot.",
        options: ["conducting", "conducted"],
        answer: 0,
      },
    },
    {
      num: 3,
      chunks: [
        { text: "As a result,", role: "conj", gloss: "그 결과" },
        { text: "the underground parking facility", role: "S", gloss: "지하 주차장 시설" },
        { text: "will be", role: "V" },
        { text: "unavailable", role: "C", gloss: "이용할 수 없는", highlight: true },
        { text: "from April 1st to April 7th.", role: "M", gloss: "4월 1일부터 4월 7일까지" },
      ],
      ko: "그 결과, 4월 1일부터 4월 7일까지 지하 주차장 시설은 이용 불가합니다.",
      notes: [],
      check: {
        label: "형용사 vs. 부사",
        prompt:
          "As a result, the underground parking facility will be ___ from April 1st to April 7th.",
        options: ["unavailable", "unavailably"],
        answer: 0,
      },
    },
    {
      num: 4,
      chunks: [
        { text: "During this period,", role: "M", gloss: "이 기간 동안" },
        { text: "we", role: "S" },
        { text: "kindly ask", role: "V", highlight: true },
        { text: "you", role: "O" },
        { text: "to use", role: "OC", gloss: "이용하도록" },
        { text: "the temporary outdoor parking lot", gloss: "임시 외부 주차장" },
        { text: "located across from the main entrance.", role: "M", gloss: "정문 맞은편에 위치한" },
      ],
      ko: "이 기간 동안, 정문 맞은편에 위치한 임시 외부 주차장을 이용해 주시기를 정중히 부탁드립니다.",
      notes: [
        "ask+목적어+목적격보어(to부정사): '…에게 ~하도록 요청하다'의 의미를 갖는 5형식 동사 ask는 목적격보어로 to부정사를 취한다. 따라서 ask 뒤에 목적어로 you, 목적격보어로 to use 이하의 to부정사구가 이어지고 있다.",
        "과거분사구: located 이하는 앞의 명사구 the temporary outdoor parking lot을 수식하는 과거분사구로, 수식받는 명사구가 '위치된' 대상이므로 수동 관계를 나타내는 과거분사 located가 쓰였다.",
      ],
      check: {
        label: "현재분사 vs. 과거분사",
        prompt:
          "During this period, we kindly ask you to use the temporary outdoor parking lot ___ across from the main entrance.",
        options: ["locating", "located"],
        answer: 1,
      },
    },
    {
      num: 5,
      chunks: [
        { text: "We", role: "S" },
        { text: "are committed to", role: "V", gloss: "~하는 데 전념하다", highlight: true },
        { text: "completing the work", role: "O", gloss: "~을 끝마치는 것" },
        { text: "as quickly as possible.", role: "M", gloss: "가능한 한 빨리" },
      ],
      ko: "가능한 한 빨리 작업을 마무리하는 데 전념하겠습니다.",
      notes: [
        "be committed to+동명사: '~할 것을 약속하다, ~하는 데 최선을 다하다(전념하다)'의 의미를 갖는 표현으로, 전치사 to의 목적어로 동명사구 completing ~ possible이 쓰였다.",
        "as+형용사/부사+as possible: '가능한 한 ~한/하게'의 의미를 갖는 원급 비교 표현으로, 여기서는 동명사 completing을 수식하는 부사 quickly가 쓰였다. 'as+원급+as+주어+can/could'로 바꿔 쓸 수 있다.",
      ],
      check: {
        label: "동사원형 vs. 동명사",
        prompt: "We are committed to ___ the work as quickly as possible.",
        options: ["complete", "completing"],
        answer: 1,
      },
    },
    {
      num: 6,
      chunks: [
        { text: "We", role: "S" },
        { text: "sincerely apologize for", role: "V", gloss: "~에 대해 진심으로 사과하다", highlight: true },
        { text: "any inconvenience", role: "O", gloss: "불편" },
        { text: "this may cause", gloss: "(관계사 생략 절)", bracket: true },
        { text: "and appreciate", role: "V", gloss: "~에 감사하다", highlight: true },
        { text: "your patience and cooperation.", role: "O", gloss: "인내와 협조" },
      ],
      ko: "이로 인해 발생할 수 있는 모든 불편에 대해 진심으로 사과드리며 여러분의 인내와 협조에 감사드립니다.",
      notes: [
        "목적격 관계대명사의 생략: 동사 cause의 목적어가 없는 불완전한 절(this may cause)이 앞의 명사구 any inconvenience를 선행사로 수식하고 있으며, this 앞에 목적격 관계대명사 that 또는 which가 생략되었다.",
      ],
      check: {
        label: "능동태 vs 수동태 / 병렬연결",
        prompt:
          "We sincerely apologize for any inconvenience this may ___ and ___ your patience and cooperation.",
        options: ["cause / appreciate", "be caused / appreciating"],
        answer: 0,
      },
    },
  ],
  words: [
    { en: "appreciate", ko: "~에 감사하다" },
    { en: "continued", ko: "지속적인" },
    { en: "previously", ko: "사전에" },
    { en: "announce", ko: "~을 공지하다" },
    { en: "conduct", ko: "~을 시행하다" },
    { en: "essential", ko: "필수적인" },
    { en: "maintenance", ko: "유지, 보수" },
    { en: "underground", ko: "지하의" },
    { en: "parking lot", ko: "주차장" },
    { en: "as a result", ko: "그 결과" },
    { en: "facility", ko: "시설" },
    { en: "unavailable", ko: "이용할 수 없는" },
    { en: "temporary", ko: "임시의, 일시적인" },
    { en: "outdoor", ko: "외부의" },
    { en: "across from ~", ko: "~의 맞은편에" },
    { en: "main entrance", ko: "정문" },
    { en: "be committed to ~", ko: "~에 전념하다, ~을 약속하다" },
    { en: "complete", ko: "~을 끝마치다, ~을 완성하다" },
    { en: "as ~ as possible", ko: "가능한 한 ~하게" },
    { en: "sincerely", ko: "진심으로" },
    { en: "apologize", ko: "~에 대해 사과하다" },
    { en: "inconvenience", ko: "불편" },
    { en: "patience", ko: "인내" },
    { en: "cooperation", ko: "협조" },
  ],
  question: {
    stem: "다음 글의 목적으로 가장 적절한 것은?",
    passage:
      "Dear Members of the City Sports Center,\n\nWe greatly appreciate your continued use of our sports center. As previously announced, we will be conducting essential maintenance on our underground parking lot. As a result, the underground parking facility will be unavailable from April 1st to April 7th. During this period, we kindly ask you to use the temporary outdoor parking lot located across from the main entrance. We are committed to completing the work as quickly as possible. We sincerely apologize for any inconvenience this may cause and appreciate your patience and cooperation.",
    choices: [
      "스포츠 센터의 주차 관리 직원 채용을 공고하려고",
      "공사 지연으로 인한 휴관 기간 연장을 공지하려고",
      "무단 주차 시 차량이 견인될 수 있음을 경고하려고",
      "새로운 차량 등록 시스템의 도입 일정을 안내하려고",
      "주차장 보수 공사 기간 중 임시 주차장 이용을 요청하려고",
    ],
    answer: 5,
    explanation:
      "스포츠 센터의 지하 주차장 보수 공사 기간 동안 회원들에게 임시 외부 주차장을 이용해 달라고 부탁하는 글이므로, 글의 목적으로 가장 적절한 것은 ⑤이다.",
  },
  questionTypes: ["주제·제목·요지·주장", "어법", "서술형", "빈칸"],
};
