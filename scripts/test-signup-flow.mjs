#!/usr/bin/env node
/**
 * Plantor 신청 흐름 + 보안 규칙 통합 테스트.
 *
 * 검증 항목:
 *   1. 유효한 데이터 → CREATE 성공
 *   2. 필수 필드 누락 → CREATE 거절 (보안 규칙)
 *   3. 잘못된 status → CREATE 거절
 *   4. 익명으로 READ → 거절 (운영자만 가능)
 *   5. 메시지 템플릿 출력
 *
 * 사용:  node scripts/test-signup-flow.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase/app";
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  serverTimestamp,
} from "firebase/firestore";

// ── env.local 파싱 ────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

// ── Firebase 초기화 ───────────────────────────────────────
const app = initializeApp({
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
const db = getFirestore(app);

// ── 작은 테스트 러너 ──────────────────────────────────────
let pass = 0;
let fail = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    pass++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${e.message ?? e}`);
    fail++;
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg ?? "expectation failed");
}

// ── 테스트 시작 ───────────────────────────────────────────
console.log("\n🌱 Plantor signup flow test\n");

// 1) 유효한 데이터 → CREATE 성공
console.log("[1] 유효한 신청 데이터 CREATE (멀티 자녀)");
let createdId = null;
await check("올바른 페이로드는 통과", async () => {
  const ref = await addDoc(collection(db, "signups"), {
    parentName: "테스트엄마",
    phone: "010-0000-0000",
    children: [
      {
        name: "테스트자녀1",
        grade: "초2",
        loginId: "test_kid_1",
        selectedServices: ["class5", "dailykor"],
      },
      {
        name: "테스트자녀2",
        grade: "중1",
        loginId: "test_kid_2",
        selectedServices: ["classcard-middle"],
      },
    ],
    estimatedMonthly: 63000,
    status: "pending",
    createdAt: serverTimestamp(),
  });
  expect(typeof ref.id === "string" && ref.id.length > 0);
  createdId = ref.id;
});
if (createdId) console.log(`     → 생성된 docId: ${createdId}`);

// 2) 필수 필드 누락 → 거절
console.log("\n[2] 보안 규칙: 필수 필드 누락은 거절");
await check("phone 누락 → 거절", async () => {
  let rejected = false;
  try {
    await addDoc(collection(db, "signups"), {
      parentName: "테스트",
      // phone 누락
      children: [
        { name: "자녀", grade: "초1", loginId: "x", selectedServices: ["class5"] },
      ],
      status: "pending",
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    rejected = true;
    if (!String(e).toLowerCase().includes("permission")) {
      throw new Error(`예상한 PERMISSION_DENIED 가 아니라: ${e.message}`);
    }
  }
  expect(rejected, "거절되어야 하는데 통과되었음");
});

await check("children 빈 배열 → 거절", async () => {
  let rejected = false;
  try {
    await addDoc(collection(db, "signups"), {
      parentName: "테스트",
      phone: "010-0000-0000",
      children: [],
      status: "pending",
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    rejected = true;
  }
  expect(rejected, "빈 children 가 통과되었음");
});

// 3) 잘못된 status → 거절
console.log("\n[3] 보안 규칙: status 위조는 거절");
await check("status='confirmed' 로 직접 생성 시도 → 거절", async () => {
  let rejected = false;
  try {
    await addDoc(collection(db, "signups"), {
      parentName: "위조시도",
      phone: "010-0000-0000",
      children: [
        { name: "자녀", grade: "초1", loginId: "x", selectedServices: ["class5"] },
      ],
      status: "confirmed", // ← 일반 사용자가 status 를 confirmed 로 생성
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    rejected = true;
  }
  expect(rejected, "status=confirmed 가 통과되었음 — 보안 구멍!");
});

// 4) 익명으로 READ → 거절
console.log("\n[4] 보안 규칙: 비로그인 READ 는 거절");
await check("signups 컬렉션 익명 read → permission denied", async () => {
  let rejected = false;
  try {
    await getDocs(collection(db, "signups"));
  } catch (e) {
    rejected = true;
    if (!String(e).toLowerCase().includes("permission")) {
      throw new Error(`예상한 PERMISSION_DENIED 가 아니라: ${e.message}`);
    }
  }
  expect(rejected, "익명 read 가 통과되었음 — 보안 구멍!");
});

// 4-2) 새 컬렉션들도 비로그인 read/write 거절 확인
console.log("\n[4-2] families/children/subscriptions: 비로그인 접근 거절");
for (const col of ["families", "children", "subscriptions"]) {
  await check(`${col} 익명 read → permission denied`, async () => {
    let rejected = false;
    try {
      await getDocs(collection(db, col));
    } catch (e) {
      rejected = true;
    }
    expect(rejected, `${col} 익명 read 가 통과되었음`);
  });
  await check(`${col} 익명 create → permission denied`, async () => {
    let rejected = false;
    try {
      await addDoc(collection(db, col), { evil: "payload" });
    } catch (e) {
      rejected = true;
    }
    expect(rejected, `${col} 익명 create 가 통과되었음`);
  });
}

// 5) 메시지 템플릿 미리보기
console.log("\n[5] 카톡 메시지 템플릿 미리보기");
const { buildPaymentGuide } = await import("../src/lib/messages.ts").catch(
  () => ({})
);
if (typeof buildPaymentGuide === "function") {
  const msg = buildPaymentGuide({
    parentName: "김다영",
    childName: "찬영",
    childGrade: "초2",
    selectedServices: ["dailykor", "class5"],
  });
  console.log("─".repeat(60));
  console.log(msg);
  console.log("─".repeat(60));
} else {
  console.log("  (TS 직접 import 불가 → admin 페이지에서 시각 확인 필요)");
}

// ── 결과 ────────────────────────────────────────────────
console.log(`\n📊 결과: ${pass} pass, ${fail} fail\n`);
if (createdId) {
  console.log(
    `🧪 테스트로 생성된 신청 1건이 실제 Firestore 에 들어갔습니다 (id: ${createdId}).`
  );
  console.log(
    `   /admin 에서 보면 "테스트엄마" 행이 보일 거예요. 끝나면 거절/삭제하세요.\n`
  );
}
process.exit(fail > 0 ? 1 : 0);
