"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePlan = void 0;
const https_1 = require("firebase-functions/v2/https");
const config_1 = require("./config");
exports.generatePlan = (0, https_1.onCall)({ secrets: [config_1.openaiApiKey] }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "로그인 필요");
    const { childId, serviceSlug } = request.data;
    if (!childId || !serviceSlug)
        throw new https_1.HttpsError("invalid-argument", "childId, serviceSlug 필요");
    // 병렬로 Firestore 조회
    const [profileSnap, knowledgeSnap, childSnap] = await Promise.all([
        config_1.db.collection("studentProfiles").doc(childId).get(),
        config_1.db.collection("serviceKnowledge").doc(serviceSlug).get(),
        config_1.db.collection("children").doc(childId).get(),
    ]);
    if (!profileSnap.exists)
        throw new https_1.HttpsError("not-found", "학생 프로필이 없습니다. 먼저 문진표를 작성해 주세요.");
    if (!knowledgeSnap.exists)
        throw new https_1.HttpsError("not-found", "해당 서비스의 커리큘럼이 없습니다.");
    const profile = profileSnap.data();
    const knowledge = knowledgeSnap.data();
    const child = (_a = childSnap.data()) !== null && _a !== void 0 ? _a : {};
    const dayNames = ["월", "화", "수", "목", "금", "토", "일"];
    const availDays = ((_b = profile.availableDays) !== null && _b !== void 0 ? _b : []).map((d) => dayNames[d]).join(", ");
    const units = (_c = knowledge.units) !== null && _c !== void 0 ? _c : [];
    const curriculumSummary = units.slice(0, 6).map(u => { var _a; return `[${u.label}] ${((_a = u.chapters) !== null && _a !== void 0 ? _a : []).slice(0, 4).map(c => c.label).join(" / ")}`; }).join("\n");
    const prompt = `당신은 초등·중등 맞춤 학습 코칭 플래너입니다.

학생 정보:
- 이름: ${(_d = child.name) !== null && _d !== void 0 ? _d : "??"}, 학년: ${(_e = child.grade) !== null && _e !== void 0 ? _e : "??"}
- 학습 목표: ${((_f = profile.goals) !== null && _f !== void 0 ? _f : []).join(", ") || "없음"}
- 현재 수준: ${(_g = profile.level) !== null && _g !== void 0 ? _g : "중"}
- 학습 가능 요일: ${availDays || "미정"}
- 하루 학습 시간: ${(_h = profile.dailyMinutes) !== null && _h !== void 0 ? _h : 30}분
- 특이사항: ${profile.notes || "없음"}

서비스: ${serviceSlug}
커리큘럼 앞부분:
${curriculumSummary || "(커리큘럼 없음)"}

위 학생에게 맞는 주간 반복 과제를 3~5개 생성하세요.
- 학생 수준(${profile.level})에 맞는 챕터를 선택하세요.
- scheduleDays는 학습 가능 요일 안에서 적절히 분산하세요.
- 하루 ${(_j = profile.dailyMinutes) !== null && _j !== void 0 ? _j : 30}분을 초과하지 않도록 과제량을 조절하세요.

반드시 JSON 객체로 출력하세요: {"tasks": [...]}
각 task는 title(string), scheduleDays(number[]) 두 필드만 포함합니다.`;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const OpenAI = require("openai");
    const client = new OpenAI.default({ apiKey: config_1.openaiApiKey.value() });
    const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
    });
    const raw = (_o = (_m = (_l = (_k = response.choices[0]) === null || _k === void 0 ? void 0 : _k.message) === null || _l === void 0 ? void 0 : _l.content) === null || _m === void 0 ? void 0 : _m.trim()) !== null && _o !== void 0 ? _o : "{}";
    let tasks;
    try {
        const parsed = JSON.parse(raw);
        tasks = Array.isArray(parsed) ? parsed : ((_p = parsed.tasks) !== null && _p !== void 0 ? _p : []);
        if (!Array.isArray(tasks))
            throw new Error("not array");
    }
    catch (_q) {
        throw new https_1.HttpsError("internal", `AI 응답 파싱 실패: ${raw.slice(0, 100)}`);
    }
    return { tasks, serviceSlug };
});
//# sourceMappingURL=ai-plan.js.map