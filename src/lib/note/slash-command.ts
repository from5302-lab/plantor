import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { slashRender } from "@/components/note/slash-menu";

declare module "@tiptap/core" {
  interface Storage {
    slashCommand: { subject: string | undefined };
  }
}

export type SlashItem = {
  title: string;
  desc?: string;
  aliases?: string[];
  subjects?: string[]; // 우선 노출 과목 (특수 블럭)
  special?: boolean; // 학습 특수 블럭 여부
  run: (editor: Editor, range: Range) => void;
};

// 슬래시(`/`)와 입력한 검색어를 지운 뒤 체이닝 시작
const at = (editor: Editor, range: Range) =>
  editor.chain().focus().deleteRange(range);

const ITEMS: SlashItem[] = [
  // 기본 블럭 (항상 노출)
  { title: "제목 1", aliases: ["h1", "heading", "제목"], run: (e, r) => at(e, r).setNode("heading", { level: 1 }).run() },
  { title: "제목 2", aliases: ["h2"], run: (e, r) => at(e, r).setNode("heading", { level: 2 }).run() },
  { title: "제목 3", aliases: ["h3"], run: (e, r) => at(e, r).setNode("heading", { level: 3 }).run() },
  { title: "글머리 목록", aliases: ["bullet", "ul", "list", "목록"], run: (e, r) => at(e, r).toggleBulletList().run() },
  { title: "번호 목록", aliases: ["ordered", "ol", "번호"], run: (e, r) => at(e, r).toggleOrderedList().run() },
  { title: "체크박스", aliases: ["todo", "task", "check", "체크"], run: (e, r) => at(e, r).toggleTaskList().run() },
  { title: "인용", aliases: ["quote", "blockquote"], run: (e, r) => at(e, r).toggleBlockquote().run() },
  { title: "코드 블록", aliases: ["code", "코드"], run: (e, r) => at(e, r).setCodeBlock().run() },
  { title: "토글", aliases: ["toggle", "details", "접기"], run: (e, r) => at(e, r).setDetails().run() },
  { title: "콜아웃", aliases: ["callout", "note", "강조"], run: (e, r) => at(e, r).toggleWrap("callout").run() },
  { title: "구분선", aliases: ["hr", "divider", "구분"], run: (e, r) => at(e, r).setHorizontalRule().run() },

  // 학습 특수 블럭
  { title: "수식 (블럭)", desc: "LaTeX 수식", aliases: ["math", "latex", "수식"], special: true, subjects: ["수학", "과학", "화학"], run: (e, r) => at(e, r).insertBlockMath({ latex: "" }).run() },
  { title: "수식 (인라인)", desc: "문장 속 수식", aliases: ["imath", "인라인수식"], special: true, subjects: ["수학", "과학", "화학"], run: (e, r) => at(e, r).insertInlineMath({ latex: "" }).run() },
  { title: "분자식", desc: "SMILES 구조식", aliases: ["chem", "smiles", "분자", "화학식"], special: true, subjects: ["화학", "과학"], run: (e, r) => at(e, r).insertContent({ type: "chem", attrs: { smiles: "" } }).run() },
  { title: "그래프", desc: "함수식 그래프", aliases: ["graph", "plot", "그래프", "함수"], special: true, subjects: ["수학", "과학"], run: (e, r) => at(e, r).insertContent({ type: "graph", attrs: { fn: "" } }).run() },
  { title: "구문분석", desc: "영어 문장 태깅", aliases: ["syntax", "구문", "문장분석", "parse"], special: true, subjects: ["영어"], run: (e, r) => at(e, r).insertContent({ type: "syntax", attrs: { sentence: "", tokens: [] } }).run() },
];

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addStorage() {
    return { subject: undefined as string | undefined };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: "/",
        startOfLine: false,
        allowSpaces: false,
        command: ({ editor, range, props }) => props.run(editor, range),
        items: ({ query, editor }) => {
          const subject = (editor.storage.slashCommand?.subject ?? "") as string;
          const q = query.trim().toLowerCase();
          const matches = (it: SlashItem) =>
            !q ||
            it.title.toLowerCase().includes(q) ||
            (it.aliases ?? []).some((a) => a.includes(q));

          // 정렬: 과목 관련 특수 블럭 → 기본 블럭 → 기타 특수 블럭
          const rank = (it: SlashItem) => {
            if (it.special && it.subjects?.includes(subject)) return 0;
            if (!it.special) return 1;
            return 2;
          };

          return ITEMS.filter(matches)
            .sort((a, b) => rank(a) - rank(b))
            .slice(0, 10);
        },
        render: slashRender,
      }),
    ];
  },
});
