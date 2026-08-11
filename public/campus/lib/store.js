// ══════════════════════════════════════════════════════════════════
//  멀티플랜토 캐릭터 저장소 — plantor 계정에 묶인다
//
//  이 페이지들은 plantor.web.app/campus 에서 서빙된다. plantor 본체와
//  origin이 같으므로 Firebase Auth 세션이 그대로 공유된다 — 다시 로그인할 필요가 없다.
//
//  저장 위치: users/{uid}.campus = {look, body, updatedAt}
//    plantor의 기존 사용자 문서 안에 넣는다. 맵 진입 시 읽기 한 번으로
//    role·이름·캐릭터를 함께 가져온다.
//
//  비로그인(손님)은 localStorage에 저장한다. 로그인하면 그 값을 계정으로 한 번 옮긴다.
// ══════════════════════════════════════════════════════════════════
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js';
import { FIREBASE_CONFIG } from './firebase-config.js';
import { sanitizeCharacter } from './avatar.js';
import { sanitizeRoom, DEFAULT_ROOM } from './room.js';
import { sanitizePlace } from './decor.js';
import { ITEMS, sanitizeInv, sanitizeBells, sanitizeEarned, dayKey } from './items.js';

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

export const GUEST_KEY = 'mp.character.v1';
export const PLANTOR_HOME = '/';          // 로그인 모달이 있는 plantor 홈

// ── 로그인 상태 ────────────────────────────────────────────────────
let profile = null;          // {uid, name, role} | null  (비로그인이면 null)
let ready = false;
const waiters = [];

onAuthStateChanged(auth, async u => {
  if (u){
    let data = {};
    try { data = (await getDoc(doc(db, 'users', u.uid))).data() || {}; } catch {}
    profile = {uid: u.uid, name: data.name || u.displayName || '학생', role: data.role || null};
  } else profile = null;
  ready = true;
  while (waiters.length) waiters.shift()(profile);
});

/** 최초 인증 확인이 끝날 때까지 기다린다. */
export function whenReady(){
  return ready ? Promise.resolve(profile) : new Promise(r => waiters.push(r));
}
export const currentUser = () => profile;

// ── 손님 저장(localStorage) ────────────────────────────────────────
const guestRead = () => {
  try { return sanitizeCharacter(JSON.parse(localStorage.getItem(GUEST_KEY))); }
  catch { return null; }
};
const guestWrite = (look, body) => {
  try { localStorage.setItem(GUEST_KEY, JSON.stringify({v:1, look, body})); return true; }
  catch { return false; }   // 시크릿 모드 등에서 막힐 수 있다
};
const guestClear = () => { try { localStorage.removeItem(GUEST_KEY); } catch {} };

// ── 읽기/쓰기 ──────────────────────────────────────────────────────
/** 로그인이면 계정에서, 아니면 localStorage에서 읽는다. 없으면 null. */
export async function loadCharacter(){
  const me = await whenReady();
  if (!me) return guestRead();
  try {
    const snap = await getDoc(doc(db, 'users', me.uid));
    const c = sanitizeCharacter(snap.data()?.campus);
    if (c) return c;
  } catch (e){ console.warn('[campus] 계정에서 캐릭터를 읽지 못했습니다', e); }
  return guestRead();                    // 계정에 없으면 손님 저장분을 넘겨준다
}

/** 저장 결과를 {ok, where, error} 로 돌려준다. 조용히 실패하지 않는다. */
export async function saveCharacter(look, body){
  const me = await whenReady();
  if (!me){
    return guestWrite(look, body)
      ? {ok:true, where:'guest'}
      : {ok:false, where:'guest', error:'브라우저가 저장을 막고 있습니다(시크릿 모드 등).'};
  }
  try {
    // merge:true — 사용자 문서의 다른 필드(role·familyId 등)를 건드리지 않는다.
    await setDoc(doc(db, 'users', me.uid),
                 {campus: {look, body, updatedAt: serverTimestamp()}}, {merge:true});
    guestClear();                        // 계정으로 옮겼으니 손님 사본은 지운다
    return {ok:true, where:'account'};
  } catch (e){
    console.warn('[campus] 계정 저장 실패', e);
    return {ok:false, where:'account', error: e?.code || String(e)};
  }
}

export async function clearCharacter(){
  const me = await whenReady();
  guestClear();
  if (!me) return {ok:true, where:'guest'};
  try {
    await setDoc(doc(db, 'users', me.uid), {campus: null}, {merge:true});
    return {ok:true, where:'account'};
  } catch (e){ return {ok:false, where:'account', error: e?.code || String(e)}; }
}

// ── 개인 자습실 배치 ───────────────────────────────────────────────
//  users/{uid}.campus.room = [{t, x, z, r}]
//  비로그인은 저장하지 않는다(어느 계정의 방인지 정해지지 않았으므로).
export async function loadRoom(){
  const me = await whenReady();
  if (!me) return DEFAULT_ROOM.slice();
  try {
    const snap = await getDoc(doc(db, 'users', me.uid));
    const r = sanitizeRoom(snap.data()?.campus?.room);
    if (r && r.length) return r;
  } catch (e){ console.warn('[campus] 방 배치를 읽지 못했습니다', e); }
  return DEFAULT_ROOM.slice();
}

// ── 인벤토리·벨·채집 기록 ──────────────────────────────────────────
//  로그인: users/{uid}.campus.{inv, bells, picked}
//  게스트: localStorage — 방문자도 줍고 사고팔 수는 있다(계정으로 승격은 안 한다.
//  캐릭터와 달리 아이템은 게스트→계정 이전 시 복제 수단이 되므로 옮기지 않는다).
const INV_KEY = 'mp.inv.v1';
// picked 는 {d:'YYYY-MM-DD', ids:[treeId]} 한 덩어리다. 날짜가 오늘이 아니면 빈 것으로
// 친다(자정 리셋). 날짜별 맵으로 두면 merge 저장 때 옛 날짜가 계속 쌓인다.
const pickedToday = p => (p && p.d === dayKey() && Array.isArray(p.ids)) ? p.ids : [];
const invRead = () => {
  try {
    const d = JSON.parse(localStorage.getItem(INV_KEY)) || {};
    return {inv: sanitizeInv(d.inv), bells: sanitizeBells(d.bells),
            earned: sanitizeEarned(d.earned), picked: pickedToday(d.picked)};
  } catch { return {inv:{}, bells:0, earned:0, picked:[]}; }
};
const invWrite = (inv, bells, picked, earned) => {
  try {
    localStorage.setItem(INV_KEY, JSON.stringify(
      {v:1, inv, bells, earned, picked:{d: dayKey(), ids: picked}}));
    return true;
  } catch { return false; }
};

/** 인벤·벨·오늘 흔든 나무를 한 번에 읽는다. */
export async function loadInv(){
  const me = await whenReady();
  if (!me) return invRead();
  try {
    const c = (await getDoc(doc(db, 'users', me.uid))).data()?.campus || {};
    return {inv: sanitizeInv(c.inv), bells: sanitizeBells(c.bells),
            earned: sanitizeEarned(c.earned), picked: pickedToday(c.picked)};
  } catch (e){ console.warn('[campus] 인벤토리를 읽지 못했습니다', e); }
  return {inv:{}, bells:0, earned:0, picked:[]};
}

/** 인벤·벨·채집 기록 저장. picked 는 오늘 날짜 키로만 남긴다(어제 기록은 버린다). */
export async function saveInv(inv, bells, picked, earned = 0){
  const me = await whenReady();
  if (!me){
    return invWrite(inv, bells, picked, earned)
      ? {ok:true, where:'guest'}
      : {ok:false, where:'guest', error:'브라우저가 저장을 막고 있습니다.'};
  }
  try {
    // 전 품목을 0까지 명시해서 쓴다 — merge 는 맵을 합치기만 해서, 수량이 0이 되며
    // 키가 빠진 아이템은 서버에 옛 수량이 남아 다음 로드 때 되살아난다.
    const full = {};
    for (const k in ITEMS) full[k] = Math.floor(inv[k]) > 0 ? Math.floor(inv[k]) : 0;
    await setDoc(doc(db, 'users', me.uid),
      {campus: {inv: full, bells, earned, picked: {d: dayKey(), ids: picked},
                updatedAt: serverTimestamp()}},
      {merge:true});
    return {ok:true, where:'account'};
  } catch (e){ return {ok:false, where:'account', error: e?.code || String(e)}; }
}

// ── 공용 공간 꾸미기 ───────────────────────────────────────────────
//  campusPlaces/{levelId}.items — 캠퍼스·학습센터·상점처럼 **모두가 보는** 공간.
//  누구나 읽고 운영자만 쓴다(규칙은 firestore.rules).
//  학생 개인방은 여기가 아니라 users/{uid}.campus.room 에 따로 있다.
export async function loadPlace(levelId){
  try {
    const snap = await getDoc(doc(db, 'campusPlaces', levelId));
    return sanitizePlace(snap.data()?.items) || [];
  } catch (e){
    console.warn('[campus] 공간 배치를 읽지 못했습니다', levelId, e);
    return [];
  }
}

export async function savePlace(levelId, items){
  const me = await whenReady();
  if (!me) return {ok:false, error:'로그인이 필요합니다.'};
  const clean = sanitizePlace(items) || [];
  try {
    await setDoc(doc(db, 'campusPlaces', levelId),
                 {items: clean, updatedAt: serverTimestamp(), by: me.uid});
    return {ok:true};
  } catch (e){
    return {ok:false, error: e?.code === 'permission-denied'
      ? '운영자만 공용 공간을 꾸밀 수 있습니다.' : (e?.code || String(e))};
  }
}

export async function saveRoom(items){
  const me = await whenReady();
  if (!me) return {ok:false, error:'로그인이 필요합니다.'};
  const clean = sanitizeRoom(items) || [];
  try {
    await setDoc(doc(db, 'users', me.uid),
                 {campus: {room: clean, updatedAt: serverTimestamp()}}, {merge:true});
    return {ok:true};
  } catch (e){ return {ok:false, error: e?.code || String(e)}; }
}
