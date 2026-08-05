# 아카이브 — `updateChildLoginId`

> **2026-08-01 복원됨.** 아래는 삭제 당시의 기록이다.
> 삭제 후 어드민 폼에 `로그인 아이디` 입력란이 남아 있고 저장 시 `children.loginId`만
> 직접 쓰고 있다는 걸 발견해(= 학생이 로그인 불가가 되는 경로) 같은 날 되살렸다.
> 현재 위치: `functions/src/auth.ts` · 호출부: `members-tab.tsx` 가족 수정 저장
> 정합성 점검: `node scripts/audit-login-ids.js`

**2026-08-01 삭제됨.** 배포돼 있었으나 소스가 이 레포에 없던 고아 Cloud Function.

| 항목 | 값 |
|---|---|
| 트리거 | callable (어드민 전용) |
| 리전 | us-central1 (gen2) |
| 마지막 배포 | 2026-07-02 |
| 복원한 출처 | `gs://gcf-v2-sources-440286878236-us-central1/updateChildLoginId/function-source.zip` |

## 왜 삭제했나
- 웹앱에 호출부 0건, 어드민 UI에 아이디 변경 기능 자체가 없음
- 로그 보존기간(30일) 내 실행 0건
- 이 레포 git 이력에 존재한 적 없음 (`git log -S` 0건)
- 남아 있으면 `firebase deploy --only functions` 가 매번 abort됨

## 어쩌다 사라졌나 (추정)
아카이브본에서 이 함수는 `auth.ts:692`에 있었는데, 현재 `auth.ts:688`에는
`updateStudentPhone`이 있다. 같은 자리에 다른 함수가 들어온 걸로 보아
**의도적 제거가 아니라 편집 중 덮어쓴 사고**일 가능성이 있다.
기능이 다시 필요하면 아래 코드를 `functions/src/auth.ts`에 되살리고
`index.ts` export에 추가하면 된다.

## 원본 코드

```ts

// ─────────────────────────────────────────────────────────
// updateChildLoginId — 자녀 로그인 아이디 변경.
//   children.loginId + Auth 이메일({id}@plantor.app) + users.plantor_id 를 함께 전환.
//   (셋을 함께 바꾸지 않으면 학생이 새 아이디로 로그인·조회를 못 해 학생페이지가 깨짐)
// ─────────────────────────────────────────────────────────
export const updateChildLoginId = onCall(async (request) => {
  await assertAdmin(request.auth);

  const { childId, newLoginId } = request.data as { childId: string; newLoginId: string };
  const next = (newLoginId ?? "").trim().toLowerCase();
  if (!childId || next.length < 4) {
    throw new HttpsError("invalid-argument", "childId와 4자 이상 아이디가 필요합니다.");
  }

  const childSnap = await db.collection("children").doc(childId).get();
  if (!childSnap.exists) throw new HttpsError("not-found", "학생 정보를 찾을 수 없습니다.");
  const child = childSnap.data()!;
  const oldLoginId = (child.loginId as string | undefined)?.toLowerCase() ?? "";
  if (next === oldLoginId) return { success: true };

  // 중복 검사: 다른 자녀 loginId / 학부모 plantor_id 가 이미 쓰는 아이디면 차단
  const [childDup, parentDup] = await Promise.all([
    db.collection("children").where("loginId", "==", next).limit(1).get(),
    db.collection("users").where("plantor_id", "==", next).limit(1).get(),
  ]);
  if ((!childDup.empty && childDup.docs[0].id !== childId) || !parentDup.empty) {
    throw new HttpsError("already-exists", "이미 사용 중인 아이디입니다.");
  }

  // Auth uid 해석: authUid 우선, 없으면 기존 아이디 이메일로 조회
  const authUid = child.authUid as string | undefined;
  const uid = authUid ?? (oldLoginId
    ? await auth.getUserByEmail(idToEmail(oldLoginId)).then((u) => u.uid).catch(() => null)
    : null);

  if (uid) {
    try {
      await auth.updateUser(uid, { email: idToEmail(next) });
      await db.collection("users").doc(uid).update({ plantor_id: next });
    } catch (e) {
      functions.logger.error("학생 로그인 계정(Auth/plantor_id) 전환 실패", { childId, uid, error: String(e) });
      throw new HttpsError("internal", "로그인 계정 전환에 실패했습니다. 아이디를 확인해주세요.");
    }
  } else {
    functions.logger.warn("학생 Auth 계정 없음 — children.loginId 만 갱신", { childId, next });
  }

  await db.collection("children").doc(childId).update({ loginId: next });
  return { success: true };
});
```
