import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenAI, Type } from "@google/genai";
import * as admin from "firebase-admin";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

const SHEETS_COLLECTION = "m2gosaSheets";

// 무료 티어 과부하 대비 폴백 체인: 앞 모델이 막히면 다음 모델로.
// 품질 우선이면 맨 앞에 "gemini-2.5-pro"를 추가.
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];

const ROLE_VALUES = ["S", "V", "O", "IO", "DO", "C", "OC", "M", "conj"];

// PassageAnalysis 와 1:1 대응하는 Gemini responseSchema
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    topicTag: { type: Type.STRING },
    grade: { type: Type.STRING },
    titleEn: { type: Type.STRING },
    titleKo: { type: Type.STRING },
    summary: { type: Type.ARRAY, items: { type: Type.STRING } },
    content: { type: Type.STRING },
    flow: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          stage: { type: Type.STRING },
          range: { type: Type.STRING },
          text: { type: Type.STRING },
        },
        required: ["stage", "range", "text"],
      },
    },
    sentences: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          num: { type: Type.INTEGER },
          chunks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                role: { type: Type.STRING, enum: ROLE_VALUES, nullable: true },
                gloss: { type: Type.STRING, nullable: true },
                bracket: { type: Type.BOOLEAN, nullable: true },
                highlight: { type: Type.BOOLEAN, nullable: true },
              },
              required: ["text"],
            },
          },
          ko: { type: Type.STRING },
          mz: { type: Type.STRING, nullable: true },
          notes: { type: Type.ARRAY, items: { type: Type.STRING } },
          grammarPlus: {
            type: Type.OBJECT,
            nullable: true,
            properties: {
              title: { type: Type.STRING },
              body: { type: Type.STRING },
            },
            required: ["title", "body"],
          },
          check: {
            type: Type.OBJECT,
            nullable: true,
            properties: {
              label: { type: Type.STRING },
              prompt: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              answer: { type: Type.INTEGER },
            },
            required: ["label", "prompt", "options", "answer"],
          },
        },
        required: ["num", "chunks", "ko", "notes"],
      },
    },
    words: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          en: { type: Type.STRING },
          ko: { type: Type.STRING },
        },
        required: ["en", "ko"],
      },
    },
    question: {
      type: Type.OBJECT,
      properties: {
        stem: { type: Type.STRING },
        passage: { type: Type.STRING },
        choices: { type: Type.ARRAY, items: { type: Type.STRING } },
        answer: { type: Type.INTEGER },
        explanation: { type: Type.STRING, nullable: true },
      },
      required: ["stem", "passage", "choices", "answer"],
    },
    questionTypes: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "topicTag",
    "grade",
    "titleEn",
    "titleKo",
    "summary",
    "content",
    "flow",
    "sentences",
    "words",
    "question",
    "questionTypes",
  ],
};

const SYSTEM_PROMPT = `당신은 한국 고등학교 영어 모의고사·수능 지문을 분석해 주는 전문 영어 강사입니다.
주어진 영어 지문을 한 문장씩 정밀하게 구문분석하여, 한국 고등학생용 "지문분석 학습지" 데이터를 JSON으로 생성합니다.

[작성 원칙]
1. 문장 분해(chunks): 각 문장을 "의미 단위"로 끊어 chunks 배열로 만든다.
   - text: 해당 영어 조각(원문 그대로, 순서대로 이어붙이면 원문 문장이 되도록).
   - role: 문장 성분 라벨. 주어=S, 동사=V, 목적어=O, 간접목적어=IO, 직접목적어=DO, 보어=C, 목적격보어=OC, 부사구·전치사구 등 수식어=M, 접속사·연결어=conj. 성분 라벨이 불필요한 조각은 role을 생략.
   - gloss: 그 조각의 핵심 한글 뜻(짧게). 불필요하면 생략. 동사·핵심 어휘 위주로.
   - bracket: 종속절·삽입구처럼 하나로 묶어 볼 조각이면 true.
   - highlight: 시험에 자주 나오는 핵심 동사/표현이면 true.
2. ko: 그 문장의 자연스러운 한국어 해석(격식 있는 표준 해석).
2-1. mz: "쉬운 해석". 영어 원문이나 표준 해석을 이해하기 어려운, 문해력이 낮은 학생을 위한 맞춤형 해석이다.
   - 어려운 한자어·추상어를 쉬운 일상어로 풀고, 친근한 MZ세대 말투로 의미를 풀어 설명한다.
   - 예: "걱정돼 죽겠다는 거임 ㅋㅋ", "한마디로 ~하라는 거", "쉽게 말하면 ~임".
   - 단, 비속어·혐오·성적 표현은 금지. 핵심 의미는 정확히 전달할 것. 너무 과한 유행어 남발 금지(자연스럽게).
3. notes: 그 문장의 구문 포인트 해설(①②… 순서). 어법·구문상 중요한 것만. 없으면 빈 배열.
4. grammarPlus: 심화 문법 설명이 필요한 문장에만(없으면 생략).
5. check: 어법 선택 문제로 낼 만한 포인트가 있으면 작성. prompt에는 정답 자리를 "___"로 표시.
   options는 [정답후보, 오답후보] 두 개. answer는 정답 인덱스(0 또는 1).
6. flow: 글의 흐름을 도입/전개/마무리(혹은 반전 등) 단계로 나누고 각 단계의 문장 범위(range, 예 "1~2")와 요약(text).
7. summary: 글 전체를 핵심 흐름 2~3단계 문구로(화살표로 연결될 예정).
8. content: 글 전체 내용을 한 단락 한국어 요약.
9. words: 지문의 핵심 어휘·표현과 뜻(WORDS & EXPRESSIONS). 15~25개.
10. question:
    - stem: 유형에 맞는 발문(예: 목적→"다음 글의 목적으로 가장 적절한 것은?", 심경→"...심경 변화로 가장 적절한 것은?", 주장→"...주장하는 바로 가장 적절한 것은?").
    - passage: 입력된 영어 지문 원문 그대로(줄바꿈 포함).
    - choices: 한국어 선택지 5개(심경류는 "A → B" 형태도 가능). 오답도 그럴듯하게.
    - answer: 1~5 정답 번호.
    - explanation: 정답 근거 한 줄 해설.
11. topicTag: 글의 유형(목적/심경/주장/주제 등). grade: "고2"(특별한 단서 없으면).
12. titleEn/titleKo: 지문에 어울리는 제목(영문/국문). 지문에 제목이 있으면 그대로.
13. questionTypes: 이 지문으로 출제 가능한 유형들(예: 목적, 어법, 빈칸, 서술형, 주제·제목·요지·주장 등).

모든 한국어는 자연스럽고 정확하게. 추측이 필요한 부분도 한국 모의고사 해설지 톤으로 작성하세요.`;

export const analyzePassage = onCall(
  {
    secrets: [geminiApiKey],
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (request) => {
    const { passage, topic } = request.data as { passage: string; topic?: string };

    if (!passage || passage.trim().length < 30) {
      throw new HttpsError("invalid-argument", "지문이 너무 짧습니다.");
    }

    const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });

    const topicLine = topic
      ? `이 지문의 출제 유형은 "${topic}"입니다. 발문과 선택지를 이 유형에 맞게 작성하세요.`
      : `이 지문에 가장 적합한 출제 유형을 스스로 판단하세요.`;

    // 무료 티어 과부하(503/UNAVAILABLE)·일시 한도(429)는 백오프 재시도
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const isTransient = (m: string) =>
      /503|UNAVAILABLE|overloaded|high demand|429|RESOURCE_EXHAUSTED|deadline/i.test(m);

    try {
      let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null =
        null;
      let lastErr: unknown = null;

      // 모델 폴백: 각 모델을 최대 2회 시도, 일시적 오류면 다음 모델로 넘어감
      outer: for (const model of MODELS) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            response = await ai.models.generateContent({
              model,
              contents: `${topicLine}\n\n[영어 지문]\n${passage.trim()}`,
              config: {
                systemInstruction: SYSTEM_PROMPT,
                responseMimeType: "application/json",
                responseSchema: RESPONSE_SCHEMA,
                maxOutputTokens: 32768,
                temperature: 0.4,
              },
            });
            break outer;
          } catch (err) {
            lastErr = err;
            const m = err instanceof Error ? err.message : String(err);
            if (!isTransient(m)) throw err; // 일시적 오류가 아니면 즉시 중단
            if (attempt < 2) await sleep(3000); // 같은 모델 한 번 더, 그다음 모델 교체
          }
        }
      }

      if (!response) throw lastErr ?? new Error("AI 응답 없음");

      const text = response.text;
      if (!text) {
        throw new HttpsError("internal", "분석 결과가 비어 있습니다.");
      }
      const analysis = JSON.parse(text);

      // 공유/기록용으로 Firestore에 저장하고 id를 함께 반환
      const ref = await admin.firestore().collection(SHEETS_COLLECTION).add({
        data: analysis,
        uid: request.auth?.uid ?? null, // 로그인 시 내 기록으로 묶임
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { ...analysis, id: ref.id };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      if (isTransient(msg)) {
        throw new HttpsError(
          "unavailable",
          "AI 서버가 잠시 혼잡합니다. 30초 후 다시 시도해 주세요.",
        );
      }
      throw new HttpsError("internal", `분석 실패: ${msg}`);
    }
  },
);

// 공유 링크용: 저장된 분석지를 id로 읽어 반환 (로그인 불필요, admin 권한으로 읽음)
export const getM2gosaSheet = onCall(
  { timeoutSeconds: 30, memory: "256MiB" },
  async (request) => {
    const { id } = request.data as { id?: string };
    if (!id || typeof id !== "string") {
      throw new HttpsError("invalid-argument", "잘못된 링크입니다.");
    }
    const snap = await admin
      .firestore()
      .collection(SHEETS_COLLECTION)
      .doc(id)
      .get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "분석지를 찾을 수 없습니다.");
    }
    return snap.data()?.data;
  },
);

// 로그인 사용자의 분석 기록 목록(가벼운 메타만)
export const getMyM2gosaSheets = onCall(
  { timeoutSeconds: 30, memory: "256MiB" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const snap = await admin
      .firestore()
      .collection(SHEETS_COLLECTION)
      .where("uid", "==", uid)
      .get();
    const items = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        titleKo: x.data?.titleKo ?? "",
        titleEn: x.data?.titleEn ?? "",
        topicTag: x.data?.topicTag ?? "",
        createdAt: x.createdAt?.toMillis?.() ?? 0,
      };
    });
    items.sort((a, b) => b.createdAt - a.createdAt);
    return items.slice(0, 100);
  },
);
