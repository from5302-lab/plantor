# 같은 이름 자녀 박스 통합

> 목표: 같은 가족 내 동일 이름의 자녀를 하나의 박스로 합쳐서 모든 구독을 함께 표시

---

## 수정 파일: `src/components/admin/members-tab.tsx`

### 1. children.map 직전에 그룹핑 로직 추가 (~2042줄)

children 배열을 `name` 기준으로 그룹핑:

```ts
// 같은 이름 자녀 통합
const grouped = Object.values(
  children.reduce<Record<string, { primary: MemberChild; ids: string[] }>>((acc, c) => {
    if (!acc[c.name]) {
      acc[c.name] = { primary: c, ids: [c.id] };
    } else {
      acc[c.name].ids.push(c.id);
    }
    return acc;
  }, {})
);
```

### 2. children.map을 grouped.map으로 교체

- `child` → `group.primary` (이름, 학년, loginId 등 헤더 표시용)
- 구독 필터: `allSubs.filter((s) => group.ids.includes(s.childId))` (모든 child ID의 구독 통합)
- key: `group.primary.id`
- 나머지 로직(이름편집, 학년편집, 비번초기화, SMS 등)은 `group.primary` 기준 — 기존과 동일

---

## 작업 순서
1. children → grouped 변환 로직 추가
2. children.map → grouped.map 교체 + childId 필터 수정
3. 빌드 확인
