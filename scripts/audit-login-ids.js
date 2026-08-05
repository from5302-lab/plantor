/**
 * 학생 로그인 아이디 정합성 점검 (읽기 전용).
 *
 * children.loginId · Auth 이메일({id}@plantor.app) · users.plantor_id 세 곳이
 * 어긋나면 학생은 옛 아이디로도 새 아이디로도 로그인할 수 없다.
 *   - 새 아이디: Auth에 해당 이메일이 없어 로그인 실패
 *   - 옛 아이디: 로그인은 되지만 plantor_id로 children 조회가 안 돼 "학생 정보를 찾을 수 없습니다"
 *
 * 아이디 변경은 반드시 updateChildLoginId 콜러블로만 해야 하며(셋을 함께 전환),
 * 이 스크립트는 그 불변조건이 지켜지고 있는지 확인한다.
 * 배경: docs/archive/updateChildLoginId.md
 *
 * 사용법:
 *   node scripts/audit-login-ids.js
 */
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();
const auth = admin.auth();

const toEmail = (id) => `${id}@plantor.app`;

async function main() {
  const snap = await db.collection("children").get();
  let ok = 0;
  const bad = [];

  for (const d of snap.docs) {
    const child = d.data();
    const loginId = (child.loginId || "").toLowerCase();
    if (!loginId) continue;

    const issues = [];
    let uid = child.authUid || null;

    try {
      const user = await auth.getUserByEmail(toEmail(loginId));
      if (uid && user.uid !== uid) issues.push(`authUid 불일치 (children=${uid} / auth=${user.uid})`);
      uid = user.uid;
    } catch {
      issues.push(`Auth 계정 없음 (${toEmail(loginId)}) — 이 아이디로 로그인 불가`);
    }

    if (uid) {
      const userSnap = await db.collection("users").doc(uid).get();
      const plantorId = (userSnap.data()?.plantor_id || "").toLowerCase();
      if (!userSnap.exists) issues.push("users 문서 없음");
      else if (plantorId !== loginId) issues.push(`users.plantor_id="${plantorId}" ≠ loginId="${loginId}"`);
    }

    if (issues.length) bad.push({ name: child.name, loginId, issues });
    else ok++;
  }

  console.log(`정상 ${ok}명 / 문제 ${bad.length}명`);
  for (const b of bad) {
    console.log(`  ✗ ${b.name} (${b.loginId})`);
    for (const i of b.issues) console.log(`      - ${i}`);
  }
  process.exitCode = bad.length > 0 ? 1 : 0;
}

main().catch((e) => { console.error("실패:", e.message); process.exit(1); });
