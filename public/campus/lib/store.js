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
