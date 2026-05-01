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
exports.notifyParentOnScreenshot = exports.notifyExpiringSubscriptionD0 = exports.notifyExpiringSubscriptionD3 = exports.notifyExpiringSubscriptionD7 = exports.notifyExpiringDirectClassD0 = exports.notifyExpiringDirectClassD3 = exports.notifyExpiringDirectClassD7 = exports.notifyAdminOnRenewal = exports.notifyAdminOnSignup = exports.notifyNewSignup = void 0;
exports.sendDirectClassExpiryNotice = sendDirectClassExpiryNotice;
exports.sendSubscriptionExpiryNotice = sendSubscriptionExpiryNotice;
const admin = __importStar(require("firebase-admin"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-functions/v2/firestore");
const config_1 = require("./config");
const utils_1 = require("./utils");
// ─── 신청 접수 시 입금 안내 SMS ───────────────────────────────────────────────
exports.notifyNewSignup = (0, firestore_1.onDocumentCreated)({ document: "signups/{signupId}", secrets: [config_1.solapiApiKey, config_1.solapiApiSecret] }, async (event) => {
    var _a;
    const signup = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!signup)
        return;
    const { parentName, phone, children, parentServices, estimatedMonthly, couponCode, couponDiscount, referralCode, referralDiscount, finalMonthly, } = signup;
    if (!phone)
        return;
    const lines = [
        `[플랜토] ${parentName}님, 신청해 주셔서 감사합니다 🌱`,
        ``,
        `📋 신청 내역:`,
    ];
    (children !== null && children !== void 0 ? children : []).forEach((c) => {
        var _a;
        const svcNames = ((_a = c.selectedServices) !== null && _a !== void 0 ? _a : [])
            .map((slug) => { var _a, _b; return (_b = (_a = config_1.SERVICE_META[slug]) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : slug; })
            .join(", ");
        lines.push(`· ${c.name} (${c.grade}) — ${svcNames}`);
    });
    (parentServices !== null && parentServices !== void 0 ? parentServices : []).forEach((slug) => {
        var _a, _b;
        lines.push(`· ${(_b = (_a = config_1.SERVICE_META[slug]) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : slug} (학부모)`);
    });
    const base = estimatedMonthly !== null && estimatedMonthly !== void 0 ? estimatedMonthly : 0;
    const discount = (couponDiscount !== null && couponDiscount !== void 0 ? couponDiscount : 0) + (referralDiscount !== null && referralDiscount !== void 0 ? referralDiscount : 0);
    const monthly = (finalMonthly !== null && finalMonthly !== void 0 ? finalMonthly : 0) > 0 ? (finalMonthly !== null && finalMonthly !== void 0 ? finalMonthly : 0) : base;
    const won = monthly > 0 ? `${monthly.toLocaleString("ko-KR")}원` : "추후 안내";
    lines.push(``, `월 결제 합계: ${won}`);
    if (couponCode && (couponDiscount !== null && couponDiscount !== void 0 ? couponDiscount : 0) > 0) {
        lines.push(`쿠폰 할인 (${couponCode}): -${(couponDiscount).toLocaleString("ko-KR")}원`);
    }
    if (referralCode && (referralDiscount !== null && referralDiscount !== void 0 ? referralDiscount : 0) > 0) {
        lines.push(`추천인 할인: -${(referralDiscount).toLocaleString("ko-KR")}원`);
    }
    if (discount > 0 && monthly > 0) {
        lines.push(`최종 결제: ${(monthly - discount).toLocaleString("ko-KR")}원`);
    }
    lines.push(``, `입금 계좌 (${config_1.BANK_NAME})`, `${config_1.BANK_ACCOUNT} (${config_1.BANK_HOLDER})`, ``, `입금 확인 후 안내드리겠습니다.`);
    const smsText = lines.join("\n");
    const normalizedPhone = phone.replace(/-/g, "");
    try {
        await (0, utils_1.sendSms)(normalizedPhone, smsText, config_1.solapiApiKey.value(), config_1.solapiApiSecret.value());
    }
    catch (e) {
        console.error(`[notifyNewSignup] SMS 발송 실패 (${phone}):`, e);
    }
    // 쿠폰 사용 즉시 처리 — 신청 접수 시점에 useCount/usedPhones 업데이트
    // (어드민 승인 전에 동일 쿠폰 중복 사용 방지)
    const couponCodeVal = signup.couponCode;
    if (couponCodeVal) {
        try {
            const couponRef = utils_1.db.collection("coupons").doc(couponCodeVal.toUpperCase());
            await couponRef.update({
                useCount: admin.firestore.FieldValue.increment(1),
                usedPhones: admin.firestore.FieldValue.arrayUnion(normalizedPhone),
            });
        }
        catch (e) {
            console.error(`[notifyNewSignup] 쿠폰 처리 실패 (${couponCodeVal}):`, e);
        }
    }
});
// ─── 신규 신청 접수 시 운영자 이메일 알림 ────────────────────────────────────
exports.notifyAdminOnSignup = (0, firestore_1.onDocumentCreated)({ document: "signups/{signupId}", secrets: [config_1.gmailUser, config_1.gmailAppPassword] }, async (event) => {
    var _a;
    const signup = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!signup)
        return;
    const { parentName, phone, children, parentServices } = signup;
    const childRows = (children !== null && children !== void 0 ? children : []).map((c) => {
        var _a;
        const svcIcons = ((_a = c.selectedServices) !== null && _a !== void 0 ? _a : []).map((slug) => {
            var _a;
            const meta = config_1.SERVICE_META[slug];
            return `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:8px">
          ${(0, utils_1.serviceIconHtml)(slug)}<span style="font-size:13px">${(_a = meta === null || meta === void 0 ? void 0 : meta.name) !== null && _a !== void 0 ? _a : slug}</span></span>`;
        }).join("");
        return `<div style="padding:10px 12px;background:#f5f5f5;border-radius:8px;margin-bottom:8px">
        <b>${c.name}</b> <span style="color:#888;font-size:13px">${c.grade}</span>
        <div style="margin-top:6px">${svcIcons || "서비스 미선택"}</div>
      </div>`;
    }).join("");
    const parentRow = (parentServices !== null && parentServices !== void 0 ? parentServices : []).length > 0
        ? `<div style="padding:10px 12px;background:#ede9f9;border-radius:8px;margin-bottom:8px">
          <b style="color:#6b46c1">학부모 서비스</b>
          <div style="margin-top:6px">${(parentServices !== null && parentServices !== void 0 ? parentServices : []).map((slug) => {
            var _a, _b;
            return `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:8px">
              <span style="font-size:13px">${(_b = (_a = config_1.SERVICE_META[slug]) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : slug}</span></span>`;
        }).join("")}</div>
        </div>`
        : "";
    const html = `
      <h2 style="margin:0 0 20px">📋 신규 수강신청이 들어왔어요</h2>
      <p style="margin:0 0 6px"><b>학부모:</b> ${parentName}</p>
      <p style="margin:0 0 16px"><b>연락처:</b> ${phone}</p>
      <div style="margin-bottom:20px">${childRows}${parentRow}</div>
      <a href="${config_1.SITE_URL}/admin" style="color:#38a848">👉 관리자 페이지 바로가기</a>
    `;
    try {
        await (0, utils_1.sendAdminEmail)(`[플랜토] 신규 신청 — ${parentName}`, html, config_1.gmailUser.value(), config_1.gmailAppPassword.value());
    }
    catch (_b) {
        // 이메일 실패해도 신청은 유지
    }
});
// ─── 연장신청 접수 시 운영자 이메일 알림 ─────────────────────────────────────
exports.notifyAdminOnRenewal = (0, firestore_1.onDocumentCreated)({ document: "renewalRequests/{requestId}", secrets: [config_1.gmailUser, config_1.gmailAppPassword] }, async (event) => {
    var _a, _b, _c;
    const req = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!req)
        return;
    const familyId = req.familyId;
    if (!familyId)
        return;
    // 중복 방지: 2분 이내 동일 familyId 메일 이미 발송됐으면 스킵
    const lockRef = utils_1.db.doc(`renewalEmailLocks/${familyId}`);
    try {
        await utils_1.db.runTransaction(async (t) => {
            const lock = await t.get(lockRef);
            if (lock.exists) {
                const age = Date.now() - lock.data().sentAt.toMillis();
                if (age < 2 * 60 * 1000)
                    throw new Error("duplicate");
            }
            t.set(lockRef, { sentAt: admin.firestore.FieldValue.serverTimestamp() });
        });
    }
    catch (e) {
        if (e.message === "duplicate")
            return;
        throw e;
    }
    let parentName = familyId;
    try {
        const snap = await utils_1.db.collection("families").doc(familyId).get();
        parentName = (_c = (_b = snap.data()) === null || _b === void 0 ? void 0 : _b.parentName) !== null && _c !== void 0 ? _c : familyId;
    }
    catch ( /* 무시 */_d) { /* 무시 */ }
    const reqsSnap = await utils_1.db.collection("renewalRequests")
        .where("familyId", "==", familyId)
        .where("status", "==", "pending")
        .get();
    if (reqsSnap.empty)
        return;
    const items = reqsSnap.docs.map((d) => d.data());
    const grandTotal = items.reduce((s, i) => { var _a, _b; return s + ((_b = (_a = i.finalAmount) !== null && _a !== void 0 ? _a : i.totalPrice) !== null && _b !== void 0 ? _b : 0); }, 0);
    const createdAt = new Date().toLocaleDateString("ko-KR", {
        year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const rows = items.map((item) => {
        var _a, _b, _c, _d;
        const icon = (0, utils_1.serviceIconHtml)(item.serviceSlug);
        const name = (_b = (_a = config_1.SERVICE_META[item.serviceSlug]) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : item.serviceSlug;
        const endStr = item.endDate ? (0, utils_1.fmtDate)(item.endDate) : "";
        const newEndStr = item.newEndDate ? `<span style="color:#38a848;font-weight:600">${(0, utils_1.fmtDate)(item.newEndDate)}</span>` : "";
        const dateRow = endStr ? `<div style="font-size:12px;color:#888;margin-top:4px">${endStr} → ${newEndStr}</div>` : "";
        const discountParts = [];
        if (item.couponCode && item.couponDiscount) {
            const label = item.couponNote ? `${item.couponCode} · ${item.couponNote}` : item.couponCode;
            discountParts.push(`쿠폰 [${label}] −${(0, utils_1.fmtWon)(item.couponDiscount)}`);
        }
        if (item.referralCode && item.referralDiscount)
            discountParts.push(`추천 −${(0, utils_1.fmtWon)(item.referralDiscount)}`);
        if (item.walletDiscount)
            discountParts.push(`쿠폰함 −${(0, utils_1.fmtWon)(item.walletDiscount)}`);
        const discountRow = discountParts.length > 0
            ? `<div style="font-size:11px;color:#1a7f4b;margin-top:4px">${discountParts.join("  ")}</div>` : "";
        return `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:12px;background:#f5f7fa;border-radius:8px;margin-bottom:8px">
          <div>
            <div style="font-size:14px;font-weight:600">${icon}${item.childName} · ${name}</div>
            ${dateRow}
            ${discountRow}
          </div>
          <div style="font-size:14px;font-weight:600;white-space:nowrap;padding-left:12px">${item.months}개월 · ${(0, utils_1.fmtWon)((_d = (_c = item.finalAmount) !== null && _c !== void 0 ? _c : item.totalPrice) !== null && _d !== void 0 ? _d : 0)}</div>
        </div>`;
    }).join("");
    const html = `
      <h2 style="margin:0 0 20px">🎉 연장신청이 들어왔어요!!</h2>
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
          <div>
            <div style="font-size:16px;font-weight:700">${parentName}</div>
            <div style="font-size:13px;color:#888;margin-top:2px">신청일 ${createdAt}</div>
          </div>
          <div style="font-size:20px;font-weight:700">${(0, utils_1.fmtWon)(grandTotal)}</div>
        </div>
        ${rows}
      </div>
      <a href="${config_1.SITE_URL}/admin" style="color:#38a848;font-weight:600">👉 관리자 페이지 바로가기</a>
    `;
    try {
        await (0, utils_1.sendAdminEmail)(`[플랜토] 연장신청 — ${parentName} ${(0, utils_1.fmtWon)(grandTotal)}`, html, config_1.gmailUser.value(), config_1.gmailAppPassword.value());
    }
    catch (_e) {
        // 이메일 실패해도 신청은 유지
    }
});
// ─── 템플릿 로드 + 플레이스홀더 치환 ──────────────────────────────────────────
async function loadTemplate(templateId, fallback) {
    try {
        const snap = await utils_1.db.collection("smsTemplates").doc(templateId).get();
        if (snap.exists)
            return snap.data().body || fallback;
    }
    catch ( /* 템플릿 로드 실패 시 폴백 */_a) { /* 템플릿 로드 실패 시 폴백 */ }
    return fallback;
}
function fillTemplate(tpl, vars) {
    return Object.entries(vars).reduce((text, [key, val]) => text.replace(new RegExp(`\\{${key}\\}`, "g"), val), tpl);
}
// ─── 1:1 수업 만료 안내 공통 로직 ───────────────────────────────────────────────
const DIRECT_CLASS_FALLBACK = [
    `안녕하세요^^`,
    `충쌤입니다,`,
    ``,
    `{childNames} 다음달 학습비 입금 기간입니다`,
    `매달 1일 전까지 익월 학습비 {amount}원을`,
    `아래계좌에 학생이름으로 입금해주세요,`,
    ``,
    `감사합니다.`,
    ``,
    `3333 36 972 5919`,
    `카카오뱅크 이충선`,
].join("\n");
async function sendDirectClassExpiryNotice(daysAhead, apiKey, apiSecret) {
    var _a, _b;
    const now = new Date();
    const from = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + (daysAhead + 1) * 24 * 60 * 60 * 1000);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);
    const snap = await utils_1.db.collection("directClasses")
        .where("status", "==", "active")
        .where("expiry", ">=", fromStr)
        .where("expiry", "<", toStr)
        .get();
    if (snap.empty)
        return;
    const tpl = await loadTemplate(`directClass_d${daysAhead}`, DIRECT_CLASS_FALLBACK);
    for (const doc of snap.docs) {
        try {
            const cls = doc.data();
            const students = (_a = cls.students) !== null && _a !== void 0 ? _a : [];
            const firstStudent = students[0];
            const parentPhone = firstStudent === null || firstStudent === void 0 ? void 0 : firstStudent.parentPhone;
            if (!parentPhone)
                continue;
            const studentNames = students.map((s) => { var _a; return (_a = s.name) !== null && _a !== void 0 ? _a : ""; }).filter(Boolean).join(", ");
            const tuition = (_b = cls.tuition) !== null && _b !== void 0 ? _b : 0;
            const text = fillTemplate(tpl, {
                childNames: studentNames,
                amount: tuition.toLocaleString("ko-KR"),
                bankInfo: `3333 36 972 5919\n카카오뱅크 이충선`,
            });
            await (0, utils_1.sendSms)(parentPhone, text, apiKey, apiSecret);
        }
        catch (_c) {
            // 한 건 실패해도 계속
        }
    }
}
// ─── D-7 1:1 수업료 만료 알림 ─────────────────────────────────────────────────
exports.notifyExpiringDirectClassD7 = (0, scheduler_1.onSchedule)({ schedule: "0 2 * * *", timeZone: "UTC", secrets: [config_1.solapiApiKey, config_1.solapiApiSecret] }, async () => {
    await sendDirectClassExpiryNotice(7, config_1.solapiApiKey.value(), config_1.solapiApiSecret.value());
});
// ─── D-3 1:1 수업료 만료 알림 ─────────────────────────────────────────────────
exports.notifyExpiringDirectClassD3 = (0, scheduler_1.onSchedule)({ schedule: "0 2 * * *", timeZone: "UTC", secrets: [config_1.solapiApiKey, config_1.solapiApiSecret] }, async () => {
    await sendDirectClassExpiryNotice(3, config_1.solapiApiKey.value(), config_1.solapiApiSecret.value());
});
// ─── D-0 1:1 수업료 만료 당일 알림 ───────────────────────────────────────────
exports.notifyExpiringDirectClassD0 = (0, scheduler_1.onSchedule)({ schedule: "0 2 * * *", timeZone: "UTC", secrets: [config_1.solapiApiKey, config_1.solapiApiSecret] }, async () => {
    await sendDirectClassExpiryNotice(0, config_1.solapiApiKey.value(), config_1.solapiApiSecret.value());
});
// ─── 구독 만료 안내 공통 로직 ────────────────────────────────────────────────────
const SUBSCRIPTION_FALLBACK = [
    `[플랜토] {parentName}님, 구독 만료 안내드립니다.`,
    ``,
    `{childNames}의 {serviceNames} 구독이 {endDate}에 만료됩니다.`,
    ``,
    `연장을 원하시면 사이트에 로그인해서`,
    `연장신청을 해주세요.`,
    ``,
    `👉 {siteUrl}`,
    `아이디: {parentId}`,
    ``,
    `감사합니다 🌱`,
].join("\n");
async function sendSubscriptionExpiryNotice(daysAhead, apiKey, apiSecret) {
    var _a, _b, _c, _d, _e;
    // endDate 저장 시간대가 코드경로마다 다를 수 있으므로 넓은 범위로 조회
    // 대상일의 KST 자정(=UTC-9h) ~ 대상일 다음날 UTC 자정까지 (33시간 윈도우)
    const KST_OFFSET = 9 * 60 * 60 * 1000;
    const nowKst = new Date(Date.now() + KST_OFFSET);
    const targetYear = nowKst.getUTCFullYear();
    const targetMonth = nowKst.getUTCMonth();
    const targetDay = nowKst.getUTCDate() + daysAhead;
    const from = new Date(Date.UTC(targetYear, targetMonth, targetDay) - KST_OFFSET); // 대상일 00:00 KST
    const to = new Date(Date.UTC(targetYear, targetMonth, targetDay + 1)); // 대상일+1 00:00 UTC
    // Firestore 복합 쿼리 대신 status만 필터 후 코드에서 날짜 필터링
    const allActive = await utils_1.db.collection("subscriptions")
        .where("status", "==", "active")
        .get();
    const matching = allActive.docs.filter((d) => {
        const ed = d.data().endDate;
        if (!(ed === null || ed === void 0 ? void 0 : ed.toDate))
            return false;
        const ms = ed.toDate().getTime();
        return ms >= from.getTime() && ms < to.getTime();
    });
    if (matching.length === 0)
        return 0;
    // familyId 기준 그룹핑
    const grouped = new Map();
    for (const d of matching) {
        const data = d.data();
        const fid = data.familyId;
        if (!fid)
            continue; // familyId 없으면 스킵
        if (!grouped.has(fid))
            grouped.set(fid, []);
        grouped.get(fid).push({
            childId: data.childId,
            serviceSlug: data.serviceSlug,
            endDate: data.endDate,
            docId: d.id,
        });
    }
    const tpl = await loadTemplate(`subscription_d${daysAhead}`, SUBSCRIPTION_FALLBACK);
    let sentCount = 0;
    for (const [familyId, subs] of grouped) {
        try {
            const familySnap = await utils_1.db.collection("families").doc(familyId).get();
            if (!familySnap.exists)
                continue;
            const family = familySnap.data();
            const phone = (_a = family.phone) === null || _a === void 0 ? void 0 : _a.replace(/-/g, "");
            if (!phone)
                continue;
            const parentName = (_b = family.parentName) !== null && _b !== void 0 ? _b : "";
            const userId = family.userId;
            let parentId = "";
            if (userId) {
                const userSnap = await utils_1.db.collection("users").doc(userId).get();
                parentId = (_d = (_c = userSnap.data()) === null || _c === void 0 ? void 0 : _c.plantor_id) !== null && _d !== void 0 ? _d : "";
            }
            const childIds = [...new Set(subs.map((s) => s.childId))];
            const childNames = [];
            for (const cid of childIds) {
                const cSnap = await utils_1.db.collection("children").doc(cid).get();
                if (cSnap.exists)
                    childNames.push((_e = cSnap.data().name) !== null && _e !== void 0 ? _e : "");
            }
            const serviceNames = subs
                .map((s) => { var _a, _b; return (_b = (_a = config_1.SERVICE_META[s.serviceSlug]) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : s.serviceSlug; })
                .join(", ");
            const endDate = subs[0].endDate.toDate().toLocaleDateString("ko-KR");
            const text = fillTemplate(tpl, {
                parentName,
                parentId,
                childNames: childNames.filter(Boolean).join(", "),
                serviceNames,
                endDate,
                amount: "",
                bankInfo: `${config_1.BANK_ACCOUNT}\n${config_1.BANK_NAME} ${config_1.BANK_HOLDER}`,
                siteUrl: config_1.SITE_URL,
            });
            await (0, utils_1.sendSms)(phone, text, apiKey, apiSecret);
            sentCount++;
        }
        catch (_f) {
            // 한 가족 실패해도 계속
        }
    }
    return sentCount;
}
// ─── D-7 구독 만료 알림 ─────────────────────────────────────────────────────────
exports.notifyExpiringSubscriptionD7 = (0, scheduler_1.onSchedule)({ schedule: "0 2 * * *", timeZone: "UTC", secrets: [config_1.solapiApiKey, config_1.solapiApiSecret] }, async () => {
    await sendSubscriptionExpiryNotice(7, config_1.solapiApiKey.value(), config_1.solapiApiSecret.value());
});
// ─── D-3 구독 만료 알림 ─────────────────────────────────────────────────────────
exports.notifyExpiringSubscriptionD3 = (0, scheduler_1.onSchedule)({ schedule: "0 2 * * *", timeZone: "UTC", secrets: [config_1.solapiApiKey, config_1.solapiApiSecret] }, async () => {
    await sendSubscriptionExpiryNotice(3, config_1.solapiApiKey.value(), config_1.solapiApiSecret.value());
});
// ─── D-0 구독 만료 당일 알림 ────────────────────────────────────────────────────
exports.notifyExpiringSubscriptionD0 = (0, scheduler_1.onSchedule)({ schedule: "0 2 * * *", timeZone: "UTC", secrets: [config_1.solapiApiKey, config_1.solapiApiSecret] }, async () => {
    await sendSubscriptionExpiryNotice(0, config_1.solapiApiKey.value(), config_1.solapiApiSecret.value());
});
// ─── 인증샷 제출 시 학부모 SMS 발송 ──────────────────────────────────────────
exports.notifyParentOnScreenshot = (0, firestore_1.onDocumentCreated)({ document: "learningLogs/{logId}", secrets: [config_1.solapiApiKey, config_1.solapiApiSecret] }, async (event) => {
    var _a, _b, _c, _d;
    const log = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!(log === null || log === void 0 ? void 0 : log.screenshotUrl) || !(log === null || log === void 0 ? void 0 : log.childId))
        return;
    const childSnap = await utils_1.db.collection("children").doc(log.childId).get();
    if (!childSnap.exists)
        return;
    const childData = childSnap.data();
    const familyId = childData.familyId;
    const childName = ((_b = childData.name) !== null && _b !== void 0 ? _b : "");
    if (!familyId)
        return;
    const familySnap = await utils_1.db.collection("families").doc(familyId).get();
    if (!familySnap.exists)
        return;
    const phone = familySnap.data().phone;
    if (!phone)
        return;
    const serviceName = (_d = (_c = config_1.SERVICE_META[log.serviceSlug]) === null || _c === void 0 ? void 0 : _c.name) !== null && _d !== void 0 ? _d : log.serviceSlug;
    const smsText = `[플랜토] ${childName}이(가) ${serviceName} 학습을 완료했어요! 📚\n확인하기 👉 ${config_1.SITE_URL}/parent`;
    try {
        await (0, utils_1.sendSms)(phone, smsText, config_1.solapiApiKey.value(), config_1.solapiApiSecret.value());
    }
    catch ( /* SMS 실패해도 로그는 유지 */_e) { /* SMS 실패해도 로그는 유지 */ }
});
//# sourceMappingURL=notifications.js.map