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
exports.resetPassword = exports.approveSignup = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();
const ADMIN_EMAIL = "from5302@gmail.com";
function idToEmail(id) {
    return `${id.toLowerCase()}@plantor.app`;
}
function assertAdmin(context) {
    if (!context.auth || context.auth.token.email !== ADMIN_EMAIL) {
        throw new functions.https.HttpsError("permission-denied", "관리자만 사용할 수 있습니다.");
    }
}
// 학부모 + 자녀 계정 생성 (승인 시 호출)
exports.approveSignup = functions.https.onCall(async (data, context) => {
    assertAdmin(context);
    const { signupId } = data;
    const snap = await db.collection("signups").doc(signupId).get();
    if (!snap.exists)
        throw new functions.https.HttpsError("not-found", "신청서를 찾을 수 없습니다.");
    const signup = snap.data();
    const { parentId, password, parentName, children } = signup;
    // 학부모 계정 생성
    let parentUid;
    try {
        const parentUser = await auth.createUser({
            email: idToEmail(parentId),
            password,
            displayName: parentName,
        });
        parentUid = parentUser.uid;
    }
    catch (e) {
        const err = e;
        if (err.code === "auth/email-already-exists") {
            const existing = await auth.getUserByEmail(idToEmail(parentId));
            parentUid = existing.uid;
        }
        else {
            throw e;
        }
    }
    await db.collection("users").doc(parentUid).set({
        name: parentName,
        plantor_id: parentId.toLowerCase(),
        role: "parent",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    // 자녀 계정 생성
    for (const child of children) {
        let childUid;
        try {
            const childUser = await auth.createUser({
                email: idToEmail(child.loginId),
                password,
                displayName: child.name,
            });
            childUid = childUser.uid;
        }
        catch (e) {
            const err = e;
            if (err.code === "auth/email-already-exists") {
                const existing = await auth.getUserByEmail(idToEmail(child.loginId));
                childUid = existing.uid;
            }
            else {
                throw e;
            }
        }
        await db.collection("users").doc(childUid).set({
            name: child.name,
            plantor_id: child.loginId.toLowerCase(),
            role: "student",
            grade: child.grade,
            parentUid,
            selectedServices: child.selectedServices,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    // signup 문서 확정 + 비밀번호 삭제
    await db.collection("signups").doc(signupId).update({
        status: "confirmed",
        password: admin.firestore.FieldValue.delete(),
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true };
});
// 비밀번호 리셋 (어드민 전용)
exports.resetPassword = functions.https.onCall(async (data, context) => {
    assertAdmin(context);
    const { signupId, newPassword } = data;
    if (!newPassword || newPassword.length < 6) {
        throw new functions.https.HttpsError("invalid-argument", "비밀번호는 6자 이상이어야 합니다.");
    }
    const snap = await db.collection("signups").doc(signupId).get();
    if (!snap.exists)
        throw new functions.https.HttpsError("not-found", "신청서를 찾을 수 없습니다.");
    const signup = snap.data();
    const { parentId, children } = signup;
    // 학부모 비밀번호 변경
    try {
        const parentUser = await auth.getUserByEmail(idToEmail(parentId));
        await auth.updateUser(parentUser.uid, { password: newPassword });
    }
    catch (_a) {
        // 계정 없으면 무시
    }
    // 자녀 비밀번호 변경
    for (const child of children) {
        try {
            const childUser = await auth.getUserByEmail(idToEmail(child.loginId));
            await auth.updateUser(childUser.uid, { password: newPassword });
        }
        catch (_b) {
            // 계정 없으면 무시
        }
    }
    return { success: true };
});
//# sourceMappingURL=index.js.map