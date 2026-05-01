/**
 * 노션 [Mom&] 명단 → Firestore 마이그레이션 스크립트
 * Firebase CLI 저장 토큰 + Firestore REST API 사용 (서비스 계정 불필요)
 *
 * 실행: node scripts/import-notion.mjs
 */

import { readFileSync } from 'fs';

const PROJECT_ID = 'plantor-from302';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ── 1. Firebase CLI 토큰으로 액세스 토큰 발급 ──────────────────────────────────

const CONFIG_PATH = `${process.env.HOME}/.config/configstore/firebase-tools.json`;
const cliConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const refreshToken = cliConfig.tokens?.refresh_token;
if (!refreshToken) throw new Error('Firebase CLI 로그인 필요. `firebase login` 실행 후 재시도.');

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
if (!access_token) throw new Error('액세스 토큰 발급 실패. `firebase login --reauth` 후 재시도.');

console.log('✅ Firebase 인증 완료\n');

// ── 2. Firestore REST API 헬퍼 ─────────────────────────────────────────────────

function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string')  return { stringValue: v };
  if (typeof v === 'number')  return { integerValue: String(v) };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  throw new Error(`지원하지 않는 타입: ${typeof v}`);
}

function toFirestoreDoc(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFirestoreValue(v);
  }
  return { fields };
}

async function setDoc(collection, docId, data) {
  const url = `${FIRESTORE_BASE}/${collection}/${docId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(toFirestoreDoc(data)),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore 쓰기 실패 [${collection}/${docId}]: ${err}`);
  }
  return res.json();
}

// ── 3. 슬러그 / 상태 매핑 ──────────────────────────────────────────────────────

const SERVICE_MAP = {
  '초등 클래스5 / 월 1.5만원':                    { slug: 'class5',          price: 15000 },
  '중등 클래스카드 (내신본문암기) / 월 1.5만원':  { slug: 'classcard-middle', price: 15000 },
  '매일국어 / 월 3.3만원':                         { slug: 'dailykor',        price: 33000 },
};

const STATUS_MAP = {
  '등록완료': 'active',
  '입금완료': 'active',
  '퇴회':    'cancelled',
  '시작 전': 'pending',
};

// ── 4. 노션 원본 데이터 (28건) ──────────────────────────────────────────────────

const RAW = [
  // ── 등록완료 ──
  { momId:'bora8285',     parentName:'김보라',  phone:'01071438508',   childName:'김온유',       childLoginId:'onyoo7777',      grade:'초3',   subjects:['매일국어 / 월 3.3만원'],subjects:['매일국어 / 월 3.3만원'], endDate:'2026-05-31', status:'등록완료', discount:0,    agencyFee:22000 },
  { momId:'sora3061',     parentName:'임효주',  phone:'01053049293',   childName:'임효주',       childLoginId:'hj1231',         grade:'초5',   subjects:['매일국어 / 월 3.3만원'], endDate:'2026-04-30', status:'등록완료', discount:0,    agencyFee:22000 },
  { momId:'kdy3240',      parentName:'금다영',  phone:'010-7705-5095', childName:'찬영',         childLoginId:'ycy0222',        grade:'초3',   subjects:['초등 클래스5 / 월 1.5만원'], endDate:'2026-04-30', status:'등록완료', discount:0,    agencyFee:6000  },
  { momId:'msw0927',      parentName:'박정미',  phone:'01049005421',   childName:'보물',         childLoginId:'msw5421',        grade:'초1',   subjects:['초등 클래스5 / 월 1.5만원'], endDate:'2026-04-30', status:'등록완료', discount:0,    agencyFee:6000  },
  { momId:'sora3061',     parentName:'이희천',  phone:'01053049293',   childName:'효돌',         childLoginId:'hj1231',         grade:'초5',   subjects:['초등 클래스5 / 월 1.5만원'], endDate:'2026-04-30', status:'등록완료', discount:0,    agencyFee:6000  },
  { momId:'peekaboo82',   parentName:'최진우',  phone:'01071220191',   childName:'최진우',       childLoginId:'monkey16',       grade:'초4',   subjects:['초등 클래스5 / 월 1.5만원'], endDate:'2026-04-30', status:'등록완료', discount:0,    agencyFee:6000  },
  { momId:'sugar07c',     parentName:'강혜란',  phone:'01064199584',   childName:'이정훈',       childLoginId:'star140108',     grade:'초6',   subjects:['초등 클래스5 / 월 1.5만원'], endDate:'2026-04-30', status:'등록완료', discount:0,    agencyFee:6000  },
  { momId:'green4cat',    parentName:'이혜진',  phone:'01092688828',   childName:'한윤상',       childLoginId:'hys041117',      grade:'초3',   subjects:['초등 클래스5 / 월 1.5만원'], endDate:'2026-12-31', status:'등록완료', discount:5000, agencyFee:6000  },
  { momId:'saboran',      parentName:'오미영',  phone:'01033528328',   childName:'최도윤',       childLoginId:'dodalove',       grade:'초5',   subjects:['초등 클래스5 / 월 1.5만원'], endDate:'2026-12-31', status:'등록완료', discount:5000, agencyFee:6000  },
  { momId:'stylelash007', parentName:'허선미',  phone:'01072585007',   childName:'유나',         childLoginId:'milkshake01',    grade:'초1',   subjects:['매일국어 / 월 3.3만원'],     endDate:'2026-04-30', status:'등록완료', discount:0,    agencyFee:28000 },
  { momId:'zose1aos',     parentName:'정세희',  phone:'01094568795',   childName:'박지원',       childLoginId:'jiwon1120',      grade:'미취학', subjects:['초등 클래스5 / 월 1.5만원'], endDate:'2026-04-30', status:'등록완료', discount:5000, agencyFee:6000  },
  { momId:'zose1aos',     parentName:'정세희',  phone:'01094568795',   childName:'박지연',       childLoginId:'jiyeon0321',     grade:'초1',   subjects:['초등 클래스5 / 월 1.5만원'], endDate:'2026-04-30', status:'등록완료', discount:5000, agencyFee:6000  },
  { momId:'zose1aos',     parentName:'정세희',  phone:'01094568795',   childName:'박지유',       childLoginId:'jiyou0111',      grade:'초5',   subjects:['초등 클래스5 / 월 1.5만원'], endDate:'2026-04-30', status:'등록완료', discount:5000, agencyFee:6000  },
  { momId:'sugar07c',     parentName:'강혜란',  phone:'',              childName:'이정민',       childLoginId:'loea120423',     grade:'중1',   subjects:['중등 클래스카드 (내신본문암기) / 월 1.5만원'], endDate:'2026-04-30', status:'등록완료', discount:0, agencyFee:3000 },
  { momId:'viky8282',     parentName:'김보선',  phone:'01098969983',   childName:'정윤오',       childLoginId:'sogmi79',        grade:'중1',   subjects:['중등 클래스카드 (내신본문암기) / 월 1.5만원','매일국어 / 월 3.3만원'], endDate:'2026-04-30', status:'등록완료', discount:0, agencyFee:25000 },
  { momId:'ssong1214',    parentName:'송휘선',  phone:'',              childName:'김동한',       childLoginId:'hani0805',       grade:'초3',   subjects:['매일국어 / 월 3.3만원'],     endDate:'2026-04-30', status:'등록완료', discount:0,    agencyFee:22000 },
  { momId:'would098',     parentName:'이미진',  phone:'',              childName:'한우주',       childLoginId:'himjkk',         grade:'초3',   subjects:['매일국어 / 월 3.3만원'],     endDate:'2026-04-30', status:'등록완료', discount:0,    agencyFee:22000 },
  { momId:'camellia124',  parentName:'수현',    phone:'',              childName:'Hoony',        childLoginId:'8t_max',         grade:'미취학', subjects:['초등 클래스5 / 월 1.5만원'], endDate:'2026-06-30', status:'등록완료', discount:5000, agencyFee:6000  },
  { momId:'binghongcha21',parentName:'김민주',  phone:'',              childName:'사랑이(박수현)',childLoginId:'sarang',         grade:'미취학', subjects:['초등 클래스5 / 월 1.5만원'], endDate:'2026-04-30', status:'등록완료', discount:5000, agencyFee:6000  },
  { momId:'pink_j',       parentName:'양화정',  phone:'',              childName:'하린',         childLoginId:'luv_rin',        grade:'초1',   subjects:['초등 클래스5 / 월 1.5만원'], endDate:'2026-06-30', status:'등록완료', discount:5000, agencyFee:6000  },
  // ── 퇴회 ──
  { momId:'enbasein',     parentName:'김성화',  phone:'01062865433',   childName:'김지우',       childLoginId:'Jiwoo19',        grade:'초1',   subjects:['매일국어 / 월 3.3만원'],     endDate:'2026-01-31', status:'퇴회', discount:0, agencyFee:0 },
  { momId:'hsr0920',      parentName:'홍새롬',  phone:'01029984209',   childName:'오윤아',       childLoginId:'0803',           grade:'중1',   subjects:['중등 클래스카드 (내신본문암기) / 월 1.5만원','매일국어 / 월 3.3만원'], endDate:'2026-02-28', status:'퇴회', discount:0, agencyFee:0 },
  { momId:'enbasein',     parentName:'김성화',  phone:'01062865433',   childName:'김민우',       childLoginId:'mwoo10',         grade:'중3',   subjects:['중등 클래스카드 (내신본문암기) / 월 1.5만원'], endDate:'2026-02-28', status:'퇴회', discount:0, agencyFee:0 },
  { momId:'enbasein',     parentName:'김성화',  phone:'01062865433',   childName:'김현우',       childLoginId:'kimdimsim613',   grade:'중1',   subjects:['중등 클래스카드 (내신본문암기) / 월 1.5만원'], endDate:'2026-02-28', status:'퇴회', discount:0, agencyFee:0 },
  { momId:'desperado21',  parentName:'유나영',  phone:'',              childName:'채유완',       childLoginId:'chaeyouwan0529', grade:'초6',   subjects:['중등 클래스카드 (내신본문암기) / 월 1.5만원'], endDate:'2026-01-31', status:'퇴회', discount:0, agencyFee:0 },
  { momId:'byj94931',     parentName:'배유진',  phone:'',              childName:'봄봄',         childLoginId:'bom1227',        grade:'미취학', subjects:['초등 클래스5 / 월 1.5만원'], endDate:'2026-01-31', status:'퇴회', discount:0, agencyFee:0 },
  { momId:'desperado21',  parentName:'유나영',  phone:'',              childName:'채유준',       childLoginId:'Yujun2',         grade:'초1',   subjects:['초등 클래스5 / 월 1.5만원'], endDate:'2026-02-28', status:'퇴회', discount:5000, agencyFee:0 },
  { momId:'kdy3240',      parentName:'금다영',  phone:'010-7705-5095', childName:'찬영',         childLoginId:'ycy0222',        grade:'초2',   subjects:['초등 클래스5 / 월 1.5만원','매일국어 / 월 3.3만원'], endDate:'2026-01-31', status:'퇴회', discount:0, agencyFee:0 },
];

// ── 5. 그룹핑 ─────────────────────────────────────────────────────────────────

// families: active 레코드 우선, 없으면 첫 등장
const familyMap = new Map();
for (const r of RAW) {
  if (!familyMap.has(r.momId) || r.status === '등록완료') {
    familyMap.set(r.momId, { parentName: r.parentName, phone: r.phone, momId: r.momId });
  }
}

// children: 첫 등장 기준
const childMap = new Map();
for (const r of RAW) {
  const key = `${r.momId}__${r.childLoginId}`;
  if (!childMap.has(key)) {
    childMap.set(key, { name: r.childName, grade: r.grade, loginId: r.childLoginId, momId: r.momId });
  }
}

console.log(`📊 families: ${familyMap.size}개, children: ${childMap.size}개, 레코드: ${RAW.length}건\n`);

// ── 6. Firestore 쓰기 ──────────────────────────────────────────────────────────

const now = new Date();
const familyIdMap = new Map();
const childIdMap = new Map();

// families
for (const [momId, fam] of familyMap) {
  const docId = `notion_${momId}`;
  await setDoc('families', docId, {
    parentName: fam.parentName,
    phone: fam.phone,
    momId: fam.momId,
    signupId: '',
    userId: null,
    createdAt: now,
    source: 'notion_import',
  });
  familyIdMap.set(momId, docId);
  console.log(`  👨‍👩‍👧 family: ${fam.parentName} (${docId})`);
}

// children
for (const [key, child] of childMap) {
  const familyId = familyIdMap.get(child.momId);
  const docId = `notion_${child.momId}_${child.loginId}`;
  await setDoc('children', docId, {
    familyId,
    name: child.name,
    grade: child.grade,
    loginId: child.loginId,
    createdAt: now,
    source: 'notion_import',
  });
  childIdMap.set(key, docId);
  console.log(`  🧒 child: ${child.name} [${child.grade}] (${docId})`);
}

// subscriptions
let subCount = 0;
for (const r of RAW) {
  const childKey = `${r.momId}__${r.childLoginId}`;
  const childId = childIdMap.get(childKey);
  const status = STATUS_MAP[r.status] ?? 'cancelled';
  const endDate = new Date(r.endDate + 'T00:00:00+09:00');

  for (let i = 0; i < r.subjects.length; i++) {
    const svc = SERVICE_MAP[r.subjects[i]];
    if (!svc) { console.warn(`  ⚠️ 알 수 없는 과목: ${r.subjects[i]}`); continue; }

    const isFirst = i === 0;
    const docId = `notion_${r.momId}_${r.childLoginId}_${svc.slug}_${r.endDate.replace(/-/g, '')}`;

    await setDoc('subscriptions', docId, {
      childId,
      serviceSlug: svc.slug,
      monthlyPrice: svc.price,
      status,
      startDate: null,
      endDate,
      discount: isFirst ? (r.discount ?? 0) : 0,
      agencyFee: isFirst ? (r.agencyFee ?? 0) : 0,
      source: 'notion_import',
    });
    subCount++;
    console.log(`  📋 sub: [${svc.slug}/${status}] ${r.childName} ~${r.endDate}`);
  }
}

console.log(`\n✅ 완료! families: ${familyMap.size}, children: ${childMap.size}, subscriptions: ${subCount}`);
