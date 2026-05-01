"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteFamily = exports.checkIdAvailability = exports.repairUserDocs = exports.cleanupOrphanSubscriptions = exports.confirmAiPackagePayment = exports.sendRenewalConfirmationSms = exports.updateChildName = exports.updateParentName = exports.resetPassword = exports.approveSignup = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const config_1 = require("./config");
const utils_1 = require("./utils");
// 학부모 + 자녀 계정 생성 + SMS 발송 (승인 시)
exports.approveSignup = (0, https_1.onCall)({ secrets: [config_1.solapiApiKey, config_1.solapiApiSecret] }, async (request) => {
    await (0, utils_1.assertAdmin)(request.auth);
    const { signupId, momsaipackEndDate } = request.data;
    const snap = await utils_1.db.collection("signups").doc(signupId).get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "신청서를 찾을 수 없습니다.");
    const signup = snap.data();
    const { parentId, password, parentName, phone, children, parentServices } = signup;
    // 학부모 계정 생성
    let parentUid;
    try {
        const parentUser = await utils_1.auth.createUser({
            email: (0, utils_1.idToEmail)(parentId),
            password,
            displayName: parentName,
        });
        parentUid = parentUser.uid;
    }
    catch (e) {
        const err = e;
        if (err.code === "auth/email-already-exists") {
            const existing = await utils_1.auth.getUserByEmail((0, utils_1.idToEmail)(parentId));
            parentUid = existing.uid;
        }
        else {
            throw e;
        }
    }
    await utils_1.db.collection("users").doc(parentUid).set({
        name: parentName,
        plantor_id: parentId.toLowerCase(),
        role: "parent",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    // 자녀 계정 생성
    for (const child of children) {
        let childUid;
        try {
            const childUser = await utils_1.auth.createUser({
                email: (0, utils_1.idToEmail)(child.loginId),
                password,
                displayName: child.name,
            });
            childUid = childUser.uid;
        }
        catch (e) {
            const err = e;
            if (err.code === "auth/email-already-exists") {
                const existing = await utils_1.auth.getUserByEmail((0, utils_1.idToEmail)(child.loginId));
                childUid = existing.uid;
            }
            else {
                throw e;
            }
        }
        await utils_1.db.collection("users").doc(childUid).set({
            name: child.name,
            plantor_id: child.loginId.toLowerCase(),
            role: "student",
            grade: child.grade,
            parentUid,
            selectedServices: child.selectedServices,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    // 비밀번호 즉시 삭제 (보안) + 승인 시각 기록
    await utils_1.db.collection("signups").doc(signupId).update({
        password: admin.firestore.FieldValue.delete(),
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // 쿠폰 useCount/usedPhones는 notifyNewSignup 트리거에서 신청 접수 시점에 이미 처리됨
    // 서비스별 접속 링크 조회
    const allSlugs = [...new Set(children.flatMap((c) => c.selectedServices))];
    const svcDocs = await Promise.all(allSlugs.map((slug) => utils_1.db.collection("serviceOverrides").doc(slug).get()));
    const svcMap = {};
    svcDocs.forEach((d, i) => {
        if (d.exists)
            svcMap[allSlugs[i]] = d.data();
    });
    // 자녀별 아이디 + 서비스 접속 링크
    const childBlocks = children.map((c) => {
        const lines = [`자녀 아이디: ${c.loginId}`];
        const urlSet = new Map();
        c.selectedServices.forEach((slug) => {
            const svc = svcMap[slug];
            if ((svc === null || svc === void 0 ? void 0 : svc.studentUrl) || (svc === null || svc === void 0 ? void 0 : svc.parentUrl))
                urlSet.set(slug, svc);
        });
        urlSet.forEach((svc) => {
            if (svc.studentUrl)
                lines.push(`학생 접속: ${svc.studentUrl}`);
            if (svc.parentUrl)
                lines.push(`학부모 접속: ${svc.parentUrl}`);
        });
        return lines.join("\n");
    });
    const hasAiPack = (parentServices !== null && parentServices !== void 0 ? parentServices : []).includes("momsaipack");
    const aiPackBlock = hasAiPack ? (() => {
        const lines = [
            ``,
            `🤖 Mom& AI 패키지`,
            `ChatGPT · 제미나이 · 캔바 공유 계정 이용 가능`,
        ];
        if (momsaipackEndDate) {
            const [y, m, d] = momsaipackEndDate.split("-");
            lines.push(`이용 기간: ~${y}.${m}.${d}`);
        }
        lines.push(``, `👉 ${config_1.SITE_URL} 로그인 후`, `상단 [AI 패키지] 탭을 확인해 주세요!`);
        return lines;
    })() : [];
    const smsLines = [
        `[플랜토] ${parentName}님, 가입이 승인됐어요!`,
        ``,
        `학부모 아이디: ${parentId}`,
        `비밀번호: ${password}`,
        ...(childBlocks.length > 0 ? [``, ...childBlocks] : []),
        ...aiPackBlock,
        ``,
        `[Mom&] 맘이랑 멤버십 오픈톡방`,
        `https://open.kakao.com/o/gs9aP64h`,
    ];
    const smsText = smsLines.join("\n");
    try {
        await (0, utils_1.sendSms)(phone, smsText, config_1.solapiApiKey.value(), config_1.solapiApiSecret.value());
    }
    catch (_a) {
        // SMS 실패해도 승인은 완료
    }
    return { success: true, parentUid };
});
// 비밀번호 리셋 (어드민 전용)
exports.resetPassword = (0, https_1.onCall)({ secrets: [config_1.solapiApiKey, config_1.solapiApiSecret] }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    await (0, utils_1.assertAdmin)(request.auth);
    const { signupId, familyId, directClassId, newPassword } = request.data;
    if (!newPassword || newPassword.length < 6) {
        throw new https_1.HttpsError("invalid-argument", "비밀번호는 6자 이상이어야 합니다.");
    }
    let parentId = "";
    let phone = "";
    let parentName = "";
    let childLoginIds = [];
    if (directClassId) {
        const classSnap = await utils_1.db.collection("directClasses").doc(directClassId).get();
        if (!classSnap.exists)
            throw new https_1.HttpsError("not-found", "수업 정보를 찾을 수 없습니다.");
        const cls = classSnap.data();
        const students = ((_a = cls.students) !== null && _a !== void 0 ? _a : []);
        const first = students[0];
        phone = (_c = (_b = first === null || first === void 0 ? void 0 : first.parentPhone) !== null && _b !== void 0 ? _b : cls.parentPhone) !== null && _c !== void 0 ? _c : "";
        parentName = (_d = cls.parentName) !== null && _d !== void 0 ? _d : (first ? `${first.name}맘` : cls.name);
        parentId = (_e = first === null || first === void 0 ? void 0 : first.parentLoginId) !== null && _e !== void 0 ? _e : "";
        childLoginIds = students.map((s) => { var _a; return (_a = s.studentLoginId) !== null && _a !== void 0 ? _a : ""; }).filter(Boolean);
    }
    else if (familyId) {
        const familySnap = await utils_1.db.collection("families").doc(familyId).get();
        if (!familySnap.exists)
            throw new https_1.HttpsError("not-found", "가족 정보를 찾을 수 없습니다.");
        const family = familySnap.data();
        phone = (_f = family.phone) !== null && _f !== void 0 ? _f : "";
        parentName = (_g = family.parentName) !== null && _g !== void 0 ? _g : "";
        if (family.userId) {
            const userSnap = await utils_1.db.collection("users").doc(family.userId).get();
            parentId = (_j = (_h = userSnap.data()) === null || _h === void 0 ? void 0 : _h.plantor_id) !== null && _j !== void 0 ? _j : "";
        }
        const childrenSnap = await utils_1.db.collection("children").where("familyId", "==", familyId).get();
        childLoginIds = childrenSnap.docs.map((d) => d.data().loginId);
    }
    else if (signupId) {
        const snap = await utils_1.db.collection("signups").doc(signupId).get();
        if (!snap.exists)
            throw new https_1.HttpsError("not-found", "신청서를 찾을 수 없습니다.");
        const signup = snap.data();
        parentId = (_k = signup.parentId) !== null && _k !== void 0 ? _k : "";
        phone = (_l = signup.phone) !== null && _l !== void 0 ? _l : "";
        parentName = (_m = signup.parentName) !== null && _m !== void 0 ? _m : "";
        childLoginIds = ((_o = signup.children) !== null && _o !== void 0 ? _o : []).map((c) => c.loginId);
    }
    else {
        throw new https_1.HttpsError("invalid-argument", "signupId 또는 familyId가 필요합니다.");
    }
    if (parentId) {
        try {
            const parentUser = await utils_1.auth.getUserByEmail((0, utils_1.idToEmail)(parentId));
            await utils_1.auth.updateUser(parentUser.uid, { password: newPassword });
        }
        catch ( /* 계정 없으면 무시 */_p) { /* 계정 없으면 무시 */ }
    }
    for (const loginId of childLoginIds) {
        if (!loginId)
            continue;
        try {
            const childUser = await utils_1.auth.getUserByEmail((0, utils_1.idToEmail)(loginId));
            await utils_1.auth.updateUser(childUser.uid, { password: newPassword });
        }
        catch ( /* 계정 없으면 무시 */_q) { /* 계정 없으면 무시 */ }
    }
    const smsText = `[플랜토] ${parentName}님, 비밀번호가 초기화됐어요.\n\n새 비밀번호: ${newPassword}\n\n👉 plantor.web.app`;
    try {
        await (0, utils_1.sendSms)(phone, smsText, config_1.solapiApiKey.value(), config_1.solapiApiSecret.value());
    }
    catch ( /* SMS 실패해도 리셋은 완료 */_r) { /* SMS 실패해도 리셋은 완료 */ }
    return { success: true };
});
// 학부모 이름 수정 (어드민 전용) — Firestore + Auth displayName 동시 업데이트
exports.updateParentName = (0, https_1.onCall)(async (request) => {
    await (0, utils_1.assertAdmin)(request.auth);
    const { familyId, newName } = request.data;
    if (!familyId || !(newName === null || newName === void 0 ? void 0 : newName.trim())) {
        throw new https_1.HttpsError("invalid-argument", "familyId와 newName이 필요합니다.");
    }
    const familySnap = await utils_1.db.collection("families").doc(familyId).get();
    if (!familySnap.exists)
        throw new https_1.HttpsError("not-found", "가족 정보를 찾을 수 없습니다.");
    const userId = familySnap.data().userId;
    await utils_1.db.collection("families").doc(familyId).update({ parentName: newName.trim() });
    if (userId) {
        try {
            await utils_1.auth.updateUser(userId, { displayName: newName.trim() });
        }
        catch ( /* Auth 계정 없으면 무시 */_a) { /* Auth 계정 없으면 무시 */ }
    }
    return { success: true };
});
// 학생 이름 수정 (어드민 전용) — Firestore children + Auth displayName 동시 업데이트
exports.updateChildName = (0, https_1.onCall)(async (request) => {
    await (0, utils_1.assertAdmin)(request.auth);
    const { childId, newName } = request.data;
    if (!childId || !(newName === null || newName === void 0 ? void 0 : newName.trim())) {
        throw new https_1.HttpsError("invalid-argument", "childId와 newName이 필요합니다.");
    }
    const childSnap = await utils_1.db.collection("children").doc(childId).get();
    if (!childSnap.exists)
        throw new https_1.HttpsError("not-found", "학생 정보를 찾을 수 없습니다.");
    const userId = childSnap.data().userId;
    await utils_1.db.collection("children").doc(childId).update({ name: newName.trim() });
    if (userId) {
        try {
            await utils_1.auth.updateUser(userId, { displayName: newName.trim() });
        }
        catch ( /* Auth 계정 없으면 무시 */_a) { /* Auth 계정 없으면 무시 */ }
    }
    return { success: true };
});
// 입금 확인 후 연장 완료 SMS 발송 (어드민 전용)
exports.sendRenewalConfirmationSms = (0, https_1.onCall)({ secrets: [config_1.solapiApiKey, config_1.solapiApiSecret] }, async (request) => {
    await (0, utils_1.assertAdmin)(request.auth);
    const { familyId, services } = request.data;
    const familySnap = await utils_1.db.collection("families").doc(familyId).get();
    if (!familySnap.exists)
        throw new https_1.HttpsError("not-found", "가족을 찾을 수 없습니다.");
    const { parentName, phone } = familySnap.data();
    if (!phone)
        throw new https_1.HttpsError("failed-precondition", "전화번호가 없습니다.");
    const serviceLines = services.map((s) => `· ${s.childName} · ${s.serviceName} → ${s.newEndDate}까지`).join("\n");
    const smsText = [
        `[플랜토] ${parentName}님, 입금이 확인되었습니다 ✅`,
        ``,
        `구독이 연장되었어요:`,
        serviceLines,
        ``,
        `감사합니다 🌱`,
    ].join("\n");
    await (0, utils_1.sendSms)(phone, smsText, config_1.solapiApiKey.value(), config_1.solapiApiSecret.value());
    return { success: true };
});
// AI 패키지 입금확인 — endDate 설정 + SMS 발송
exports.confirmAiPackagePayment = (0, https_1.onCall)({ secrets: [config_1.solapiApiKey, config_1.solapiApiSecret] }, async (request) => {
    await (0, utils_1.assertAdmin)(request.auth);
    const { familyId, endDate } = request.data;
    if (!familyId || !endDate)
        throw new https_1.HttpsError("invalid-argument", "familyId와 endDate가 필요합니다.");
    const familySnap = await utils_1.db.collection("families").doc(familyId).get();
    if (!familySnap.exists)
        throw new https_1.HttpsError("not-found", "가족 정보를 찾을 수 없습니다.");
    const { parentName, phone, userId } = familySnap.data();
    await utils_1.db.collection("families").doc(familyId).update({ aiPackageEndDate: endDate });
    if (userId) {
        await utils_1.db.collection("users").doc(userId).update({ aiPackageEndDate: endDate });
    }
    const [y, m, d] = endDate.split("-");
    const formatted = `${y}.${m}.${d}`;
    const smsText = `[플랜토] ${parentName}님, Mom& AI 패키지 입금이 확인되었어요! ✅\n\nChatGPT · 제미나이 · 캔바 공유 계정을 이용하실 수 있습니다.\n\n이용 기간: ~${formatted}\n\n👉 plantor.web.app 에서 학부모 계정으로 로그인하시면 상단 메뉴에 [AI 패키지] 탭이 생성됩니다.`;
    try {
        await (0, utils_1.sendSms)(phone, smsText, config_1.solapiApiKey.value(), config_1.solapiApiSecret.value());
    }
    catch (_a) {
        // SMS 실패해도 활성화는 완료
    }
    return { success: true };
});
// childId가 null 또는 빈 문자열인 orphan 구독 삭제 (어드민 전용)
exports.cleanupOrphanSubscriptions = (0, https_1.onCall)(async (request) => {
    await (0, utils_1.assertAdmin)(request.auth);
    const [nullSnap, emptySnap] = await Promise.all([
        utils_1.db.collection("subscriptions").where("childId", "==", null).get(),
        utils_1.db.collection("subscriptions").where("childId", "==", "").get(),
    ]);
    const batch = utils_1.db.batch();
    [...nullSnap.docs, ...emptySnap.docs].forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return { success: true, deleted: nullSnap.size + emptySnap.size };
});
// users 문서 복구 — children 컬렉션 기반으로 role/plantor_id 동기화
exports.repairUserDocs = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    await (0, utils_1.assertAdmin)(request.auth);
    const childrenSnap = await utils_1.db.collection("children").get();
    let fixed = 0;
    for (const childDoc of childrenSnap.docs) {
        const data = childDoc.data();
        const loginId = (_a = data.loginId) === null || _a === void 0 ? void 0 : _a.toLowerCase();
        if (!loginId)
            continue;
        try {
            const userRecord = await utils_1.auth.getUserByEmail((0, utils_1.idToEmail)(loginId));
            await utils_1.db.collection("users").doc(userRecord.uid).set({
                name: (_b = data.name) !== null && _b !== void 0 ? _b : "",
                plantor_id: loginId,
                role: "student",
                grade: (_c = data.grade) !== null && _c !== void 0 ? _c : "",
                parentUid: (_d = data.userId) !== null && _d !== void 0 ? _d : null,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            fixed++;
        }
        catch (_e) {
            // Auth 계정 없으면 무시
        }
    }
    return { success: true, fixed };
});
// ID/전화번호 중복 체크 (비인증 허용 — 회원가입 폼에서 호출)
exports.checkIdAvailability = (0, https_1.onCall)({ invoker: "public" }, async (request) => {
    const { type, id } = request.data;
    const trimmed = (id !== null && id !== void 0 ? id : "").trim().toLowerCase();
    if (type === "phone") {
        const phone = (id !== null && id !== void 0 ? id : "").trim();
        if (!phone)
            throw new https_1.HttpsError("invalid-argument", "전화번호가 필요합니다.");
        const [signupSnap, familySnap] = await Promise.all([
            utils_1.db.collection("signups").where("phone", "==", phone).where("status", "==", "pending").limit(1).get(),
            utils_1.db.collection("families").where("phone", "==", phone).limit(1).get(),
        ]);
        if (!signupSnap.empty)
            return { available: false, reason: "signup" };
        if (!familySnap.empty)
            return { available: false, reason: "family" };
        return { available: true };
    }
    if (!trimmed || trimmed.length < 4) {
        throw new https_1.HttpsError("invalid-argument", "ID가 너무 짧습니다.");
    }
    if (type === "parent") {
        const snap = await utils_1.db.collection("users").where("plantor_id", "==", trimmed).limit(1).get();
        return { available: snap.empty };
    }
    else if (type === "child") {
        const snap = await utils_1.db.collection("children").where("loginId", "==", trimmed).limit(1).get();
        return { available: snap.empty };
    }
    else {
        throw new https_1.HttpsError("invalid-argument", "type은 parent, child, phone 중 하나여야 합니다.");
    }
});
// 가족 전체 삭제 — Firestore + Auth 계정 완전 제거 (어드민 전용)
exports.deleteFamily = (0, https_1.onCall)(async (request) => {
    var _a, _b;
    await (0, utils_1.assertAdmin)(request.auth);
    const { familyId } = request.data;
    if (!familyId)
        throw new https_1.HttpsError("invalid-argument", "familyId가 필요합니다.");
    const batch = utils_1.db.batch();
    // 독립 쿼리 병렬 실행
    const [childrenSnap, subsSnap, familySnap, renewalSnap] = await Promise.all([
        utils_1.db.collection("children").where("familyId", "==", familyId).get(),
        utils_1.db.collection("subscriptions").where("familyId", "==", familyId).get(),
        utils_1.db.collection("families").doc(familyId).get(),
        utils_1.db.collection("renewalRequests").where("familyId", "==", familyId).get(),
    ]);
    // 자녀 Auth 계정 + Firestore 삭제
    for (const childDoc of childrenSnap.docs) {
        const loginId = (_a = childDoc.data().loginId) === null || _a === void 0 ? void 0 : _a.toLowerCase();
        if (loginId) {
            try {
                const userRecord = await utils_1.auth.getUserByEmail((0, utils_1.idToEmail)(loginId));
                await utils_1.auth.deleteUser(userRecord.uid);
                batch.delete(utils_1.db.collection("users").doc(userRecord.uid));
            }
            catch ( /* Auth 계정 없으면 무시 */_c) { /* Auth 계정 없으면 무시 */ }
        }
        batch.delete(utils_1.db.collection("studentProfiles").doc(childDoc.id));
        batch.delete(childDoc.ref);
    }
    subsSnap.forEach((d) => batch.delete(d.ref));
    renewalSnap.forEach((d) => batch.delete(d.ref));
    // 학부모 Auth + users + signups 삭제
    let familyPhone = "";
    if (familySnap.exists) {
        const familyData = familySnap.data();
        familyPhone = (_b = familyData.phone) !== null && _b !== void 0 ? _b : "";
        const userId = familyData.userId;
        if (userId) {
            try {
                await utils_1.auth.deleteUser(userId);
            }
            catch ( /* Auth 계정 없으면 무시 */_d) { /* Auth 계정 없으면 무시 */ }
            batch.delete(utils_1.db.collection("users").doc(userId));
        }
        batch.delete(familySnap.ref);
    }
    if (familyPhone) {
        const signupsSnap = await utils_1.db.collection("signups").where("phone", "==", familyPhone).get();
        signupsSnap.forEach((d) => batch.delete(d.ref));
    }
    await batch.commit();
    return { success: true };
});
//# sourceMappingURL=auth.js.map