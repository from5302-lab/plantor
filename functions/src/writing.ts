import { onCall, HttpsError } from "firebase-functions/v2/https";
import { openaiApiKey } from "./config";
import OpenAI from "openai";

const SYSTEM_PROMPT_S3 = `You are an expert ESL writing assessor specializing in Korean-speaking students.
You will receive a short paragraph (4-5 sentences) written by a Korean student learning English.

Grade the writing on these 3 axes, each out of 10:
1. grammar — Grammar & Mechanics (spelling, punctuation, articles, prepositions, tense, subject-verb agreement)
2. vocabulary — Vocabulary Range (word diversity, academic vocabulary usage, avoidance of repetition)
3. sentenceComplexity — Sentence Complexity (variety of sentence structures: simple, compound, complex)

Pay special attention to errors common among Korean speakers:
- Article omission or misuse (a/the)
- Preposition confusion (in/on/at)
- Because + so double conjunction
- Subject-verb agreement with uncountable nouns
- Direct translation patterns from Korean

Respond ONLY with valid JSON, no markdown:
{
  "scores": { "grammar": <0-10>, "vocabulary": <0-10>, "sentenceComplexity": <0-10> },
  "feedback": { "grammar": "<1-2 sentence feedback in Korean>", "vocabulary": "<feedback in Korean>", "sentenceComplexity": "<feedback in Korean>" },
  "errorPatterns": ["<pattern 1 in Korean>", "<pattern 2>"],
  "strengths": ["<strength 1 in Korean>"],
  "overallComment": "<2-3 sentence overall comment in Korean>"
}`;

const SYSTEM_PROMPT_S4 = `You are an expert ESL writing assessor specializing in Korean-speaking students.
You will receive an essay introduction paragraph written by a Korean student.

Grade the writing on these 3 axes, each out of 10:
1. organization — Organization (logical flow, transition words, paragraph structure with hook → background → thesis)
2. argument — Argument & Evidence (clarity of thesis statement, strength of position, relevance of supporting ideas)
3. voiceStyle — Voice & Style (academic tone vs conversational, word choice formality, confidence of voice)

Pay special attention to:
- Whether there is a clear hook (attention grabber)
- Whether background context is provided
- Whether the thesis statement is specific and arguable (not just "I think X is good/bad")
- Korean students tend to be indirect — look for whether the thesis is stated clearly
- Whether the tone is appropriately academic (not too casual, not overly formal)

Respond ONLY with valid JSON, no markdown:
{
  "scores": { "organization": <0-10>, "argument": <0-10>, "voiceStyle": <0-10> },
  "feedback": { "organization": "<1-2 sentence feedback in Korean>", "argument": "<feedback in Korean>", "voiceStyle": "<feedback in Korean>" },
  "errorPatterns": ["<pattern 1 in Korean>", "<pattern 2>"],
  "strengths": ["<strength 1 in Korean>"],
  "overallComment": "<2-3 sentence overall comment in Korean, encouraging tone>"
}`;

export const gradeWriting = onCall(
  {
    secrets: [openaiApiKey],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request) => {
    const { section, prompt, response } = request.data as {
      section: number;
      prompt: string;
      response: string;
    };

    if (!response || response.trim().length < 10) {
      throw new HttpsError("invalid-argument", "응답이 너무 짧습니다.");
    }

    if (section !== 3 && section !== 4) {
      throw new HttpsError("invalid-argument", "유효하지 않은 섹션입니다.");
    }

    const client = new OpenAI({ apiKey: openaiApiKey.value() });

    const systemPrompt = section === 3 ? SYSTEM_PROMPT_S3 : SYSTEM_PROMPT_S4;
    const userMessage = `Topic/Prompt: "${prompt}"\n\nStudent's response:\n${response}`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "";

    try {
      const parsed = JSON.parse(text);
      return parsed;
    } catch {
      throw new HttpsError("internal", "AI 응답 파싱 실패");
    }
  },
);
