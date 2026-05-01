/**
 * Notion 임포트된 families/children에 Firebase Auth 계정 생성
 * - 학부모: {momId}@plantor.app / 012345
 * - 자녀:   {loginId}@plantor.app / 012345
 *
 * 실행: node scripts/create-auth-accounts.mjs
 */

import { readFileSync } from 'fs';

const PROJECT_ID = 'plantor-from302';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const IDENTITY_BASE  = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}`;

// ── 1. 액세스 토큰 ──────────────────────────────────────────────────────────────

const CONFIG_PATH = `${process.env.HOME}/.config/configstore/firebase-tools.json`;
const cliConfig   = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const refreshToken = cliConfig.tokens?.refresh_token;
if (!refreshToken) throw new Error('`firebase login` 먼저 실행하세요.');

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }),
});
const { access_token } = await tokenRes.json();
if (!access_token) throw new Error('액세스 토큰 발급 실패.');
console.log('✅ Firebase 인증 완료\n');

// ── 2. 헬퍼 ───────────────────────────────────────────────────────────────────

const authHeader = { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' };

function idToEmail(id) { return `${id.toLowerCase()}@plantor.app`; }

async function listDocs(col) {
  const res = await fetch(`${FIRESTORE_BASE}/${col}?pageSize=300`, { headers: authHeader });
  const data = await res.json();
  return (data.documents ?? []).map(d => {
    const id = d.name.split('/').pop();
    const fields = {};
    for (const [k, v] of Object.entries(d.fields ?? {})) {
      fields[k] = v.stringValue ?? v.integerValue ?? v.booleanValue ?? v.nullValue ?? null;
    }
    return { id, ...fields };
  });
}

async function createAuthUser(email, password, displayName) {
  const res = await fetch(`${IDENTITY_BASE}/accounts`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ email, password, displayName }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Auth 생성 실패 [${email}]: ${data.error.message}`);
  return data.localId; // uid
}

async function patchDoc(col, docId, fields) {
  const fieldPaths = Object.keys(fields).join(',');
  const url = `${FIRESTORE_BASE}/${col}/${docId}?${Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&')}`;
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { stringValue: v }])) };
  const res = await fetch(url, { method: 'PATCH', headers: authHeader, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Firestore 업데이트 실패 [${col}/${docId}]: ${await res.text()}`);
}

// ── 3. Firestore에서 기존 데이터 읽기 ─────────────────────────────────────────

console.log('📂 Firestore 데이터 읽는 중...');
const families = await listDocs('families');
const children = await listDocs('children');
console.log(`  families: ${families.length}, children: ${children.length}\n`);

// ── 4. 학부모 계정 생성 ────────────────────────────────────────────────────────

let parentCreated = 0, parentSkipped = 0;

for (const fam of families) {
  const momId = fam.momId;
  if (!momId) { console.log(`  ⚠️  momId 없음 → skip (${fam.parentName})`); parentSkipped++; continue; }
  if (fam.userId) { console.log(`  ↩️  이미 계정 있음 → skip (${momId})`); parentSkipped++; continue; }

  const email = idToEmail(momId);
  try {
    const uid = await createAuthUser(email, '012345', fam.parentName ?? momId);
    // users/{uid} 문서 생성
    await patchDoc('users', uid, { plantor_id: momId, role: 'parent', name: fam.parentName ?? '' });
    // families/{id}.userId 업데이트
    await patchDoc('families', fam.id, { userId: uid });
    console.log(`  ✅ 학부모 ${fam.parentName} (${momId}) → uid: ${uid.slice(0, 8)}...`);
    parentCreated++;
  } catch (e) {
    if (e.message.includes('EMAIL_EXISTS')) {
      console.log(`  ↩️  이미 존재 → skip (${email})`);
      parentSkipped++;
    } else {
      console.error(`  ❌ ${e.message}`);
    }
  }
}

console.log(`\n학부모: 생성 ${parentCreated}, 스킵 ${parentSkipped}\n`);

// ── 5. 자녀 계정 생성 ─────────────────────────────────────────────────────────

let childCreated = 0, childSkipped = 0;

// 부모 uid 다시 읽기 (방금 업데이트됨)
const updatedFamilies = await listDocs('families');
const familyUidMap = Object.fromEntries(updatedFamilies.map(f => [f.id, f.userId ?? null]));

for (const child of children) {
  const loginId = child.loginId;
  if (!loginId || loginId === '-') { console.log(`  ⚠️  loginId 없음 → skip (${child.name})`); childSkipped++; continue; }

  const email = idToEmail(loginId);
  const parentUid = familyUidMap[child.familyId] ?? null;

  try {
    const uid = await createAuthUser(email, '012345', child.name ?? loginId);
    await patchDoc('users', uid, {
      plantor_id: loginId,
      role: 'student',
      name: child.name ?? '',
      ...(parentUid ? { parentUid } : {}),
    });
    console.log(`  ✅ 자녀 ${child.name} (${loginId}) → uid: ${uid.slice(0, 8)}...`);
    childCreated++;
  } catch (e) {
    if (e.message.includes('EMAIL_EXISTS')) {
      console.log(`  ↩️  이미 존재 → skip (${email})`);
      childSkipped++;
    } else {
      console.error(`  ❌ ${e.message}`);
    }
  }
}

console.log(`\n자녀: 생성 ${childCreated}, 스킵 ${childSkipped}`);
console.log('\n🎉 완료! 초기 비밀번호: 012345');
