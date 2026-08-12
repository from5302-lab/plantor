// ══════════════════════════════════════════════════════════════════
//  캠퍼스 실시간 접속자 — Firebase Realtime Database (룸 단위)
//
//  왜 Firestore가 아닌가: 좌표는 초당 여러 번 갱신된다. Firestore는 쓰기당
//  과금이라 이런 트래픽에 맞지 않는다. RTDB는 대역폭 과금이라 유리하다.
//
//  왜 룸 단위인가: 전원이 전원을 구독하면 비용이 접속자 수의 제곱으로 는다
//  (10명이면 각자 9명분을 받는다). 같은 룸 사람만 구독하면 룸 수만큼 나뉜다.
//    전체 구독:  비용 ∝ N²
//    룸 구독  :  비용 ∝ N² / 룸수
//
//  경로
//    /campus/rooms/{roomId}/{uid}/meta = {name, look, body}   ← 입장 시 1회
//    /campus/rooms/{roomId}/{uid}/pos  = {x, z, y, m, at}     ← 스로틀 갱신
//
//  meta와 pos를 나눈 이유: 룸 노드에 통째로 구독을 걸면 누가 한 걸음 옮길 때마다
//  같은 룸 전원의 look/body까지 다시 내려온다. 자식별로 걸어 pos만 흐르게 한다.
//
//  비용 통제
//    · 최대 5Hz(200ms). 움직이지 않으면 아예 보내지 않는다
//    · 위치가 0.05 미만으로 바뀌면 무시
//    · 가만히 있어도 30초마다 하트비트 한 번(상대가 나를 유령으로 지우지 않게)
// ══════════════════════════════════════════════════════════════════
import { getApp } from 'https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js';
import {
  getDatabase, ref, set, update, remove, onValue, onChildAdded, onChildRemoved,
  onDisconnect, serverTimestamp, off,
} from 'https://www.gstatic.com/firebasejs/12.12.0/firebase-database.js';
import { sanitizeCharacter } from './avatar.js';
import { FIREBASE_CONFIG } from './firebase-config.js';

// Realtime Database 인스턴스가 아직 없으면 동기화 없이 혼자 쓰는 맵으로 동작한다.
// (설정에 databaseURL이 없는데 getDatabase를 부르면 예외가 나 맵 전체가 죽는다)
export const NET_READY = !!FIREBASE_CONFIG.databaseURL;

const ROOT = 'campus/rooms';
const SEND_MS  = 200;      // 5Hz 상한
const BEAT_MS  = 30000;    // 하트비트
const STALE_MS = 90000;    // 이보다 오래된 좌표는 접속이 끊긴 것으로 본다
const MOVE_EPS = 0.05;

/**
 * 캠퍼스에 입장한다.
 * @param me       {uid, name, look, body}
 * @param handlers {onJoin(uid, info), onLeave(uid), onPose(uid, pose)}
 * @returns {publish(x,z,yaw,act,roomId), updateMeta(look,body), leave()}
 *
 * act 는 'idle' | 'walk' | 'run' | 'sit'. 예전에는 moving 불리언(m)만 보냈는데,
 * 달리기·앉기가 생기면서 상태가 넷이 됐다. 옛 클라이언트가 보낸 m 도 계속 읽는다.
 */
export function joinCampus(me, handlers){
  if (!NET_READY){
    console.warn('[campus] Realtime Database 미설정 — 접속자 동기화 없이 실행합니다');
    return null;
  }
  const db = getDatabase(getApp());

  let room = null;          // 현재 룸 id
  let myRef = null;         // /campus/rooms/{room}/{uid}
  let posRef = null;
  let meta = {name: String(me.name || '학생').slice(0, 20), look: me.look, body: me.body};

  let roomSubs = null;      // 현재 룸 구독 해제 함수
  const posSubs = new Map();// uid → 해제 함수
  const seen = new Set();   // 지금 룸에서 내가 그리고 있는 uid

  // ── 룸 이동 ─────────────────────────────────────────────────────
  function enterRoom(next){
    if (next === room) return;

    // 이전 룸 정리 — 구독 해제, 내 노드 제거, 그리던 아바타 전부 내림
    roomSubs?.();
    for (const un of posSubs.values()) un();
    posSubs.clear();
    for (const uid of seen) handlers.onLeave(uid);
    seen.clear();
    if (myRef){ onDisconnect(myRef).cancel(); remove(myRef); }

    room = next;
    myRef  = ref(db, `${ROOT}/${room}/${me.uid}`);
    posRef = ref(db, `${ROOT}/${room}/${me.uid}/pos`);
    onDisconnect(myRef).remove();      // 탭을 닫거나 끊기면 서버가 지운다
    set(ref(db, `${ROOT}/${room}/${me.uid}/meta`), meta);
    lastSent = 0; lx = null;           // 새 룸에선 첫 좌표를 바로 보낸다

    const roomRef = ref(db, `${ROOT}/${room}`);
    const onAdd = onChildAdded(roomRef, snap => {
      const uid = snap.key;
      if (uid === me.uid) return;                      // 나는 내가 그린다
      const m = snap.val()?.meta;
      const c = sanitizeCharacter(m);                  // 남이 보낸 값은 반드시 정화한다
      if (!c) return;
      seen.add(uid);
      handlers.onJoin(uid, {name: String(m?.name || '학생').slice(0, 20), ...c});

      const pRef = ref(db, `${ROOT}/${room}/${uid}/pos`);
      const un = onValue(pRef, s => {
        const p = s.val();
        if (!p || typeof p.x !== 'number' || typeof p.z !== 'number') return;
        if (typeof p.at === 'number' && Date.now() - p.at > STALE_MS) return;
        // a = 새 필드(동작 이름), m = 옛 필드(움직임 여부). 둘 다 받아 준다.
        const act = typeof p.a === 'string' ? p.a : (p.m ? 'walk' : 'idle');
        handlers.onPose(uid, {x: p.x, z: p.z, yaw: p.y || 0, act});
      });
      posSubs.set(uid, () => off(pRef, 'value', un));
    });
    const onRemove = onChildRemoved(roomRef, snap => {
      const uid = snap.key;
      if (uid === me.uid) return;
      posSubs.get(uid)?.(); posSubs.delete(uid);
      if (seen.delete(uid)) handlers.onLeave(uid);
    });
    roomSubs = () => {
      off(roomRef, 'child_added', onAdd);
      off(roomRef, 'child_removed', onRemove);
    };
  }

  // ── 내 좌표 발행 ────────────────────────────────────────────────
  let lastSent = 0, lx = null, lz = null, ly = null, lm = null;

  function publish(x, z, yaw, act, roomId){
    if (roomId !== room) enterRoom(roomId);

    const now = Date.now();
    const movedEnough = lx === null
      || Math.hypot(x - lx, z - lz) > MOVE_EPS
      || Math.abs(yaw - ly) > MOVE_EPS;
    const stateChanged = act !== lm;
    const beat = now - lastSent > BEAT_MS;
    if (!movedEnough && !stateChanged && !beat) return;
    if (now - lastSent < SEND_MS) return;

    lastSent = now; lx = x; lz = z; ly = yaw; lm = act;
    // m 도 같이 보낸다 — 아직 옛 코드가 떠 있는 탭이 있을 수 있다
    update(posRef, {x: +x.toFixed(2), z: +z.toFixed(2), y: +yaw.toFixed(2),
                    a: act, m: act === 'walk' || act === 'run', at: serverTimestamp()});
  }

  /**
   * 맵에서 캐릭터를 바꿨을 때 남들에게도 반영한다.
   *
   * ⚠ RTDB 는 undefined 를 **던진다**(Firestore 처럼 조용히 무시하지 않는다).
   *   꾸미기에서 옛 model 칸을 비우면 look.model 이 undefined 로 들어오는데,
   *   그대로 넘기면 여기서 예외가 나 저장 뒤 창 닫기·알림이 통째로 안 돈다 —
   *   저장은 됐는데 아무 반응이 없어 보였다. 경계에서 턴다.
   */
  const noUndef = v => JSON.parse(JSON.stringify(v ?? null));
  function updateMeta(look, body){
    const l = noUndef(look), b = noUndef(body);
    meta = {...meta, look: l, body: b};
    if (room) update(ref(db, `${ROOT}/${room}/${me.uid}/meta`), {look: l, body: b});
  }

  function leave(){
    roomSubs?.();
    for (const un of posSubs.values()) un();
    posSubs.clear(); seen.clear();
    if (myRef) remove(myRef);
    room = null;
  }
  addEventListener('pagehide', leave);

  return {publish, updateMeta, leave, get room(){ return room; }};
}
