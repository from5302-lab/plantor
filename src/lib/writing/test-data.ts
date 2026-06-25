import type { WritingPromptQ } from "./test-types";

/* ══════════════════════════════════════════════════════════════════════════
   Section 1: Short Response
   ══════════════════════════════════════════════════════════════════════════ */

export const SHORT_RESPONSE_PROMPT: WritingPromptQ = {
  id: "s1",
  instruction: "Write a short paragraph (4-5 sentences) responding to the prompt below.",
  prompt: "Should students have homework on weekends? Why or why not?",
  minWords: 30,
  timeLimitSec: 300,
};

/* ══════════════════════════════════════════════════════════════════════════
   Section 2: Essay Introduction
   ══════════════════════════════════════════════════════════════════════════ */

export const ESSAY_INTRO_PROMPT: WritingPromptQ = {
  id: "s2",
  instruction: "Write an introduction paragraph for an essay on the topic below. Include a hook, background information, and a clear thesis statement.",
  prompt: "Some people believe that technology helps students learn better, while others think it is a distraction. What is your opinion?",
  minWords: 50,
  timeLimitSec: 420,
};
