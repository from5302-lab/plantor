#!/usr/bin/env python3
"""
Plantor × Classcard 학습 자동 인증 스크래퍼
Cowork Scheduled Task로 매일 실행

flow:
  Classcard 로그인 → 오늘 학습 현황 스크랩 → Plantor autoLog 엔드포인트 POST
"""

import requests
import json
import re
from datetime import date
from bs4 import BeautifulSoup

# ── 설정 ──────────────────────────────────────────────────────────────────────

CLASSCARD_ID  = "from302"
CLASSCARD_PW  = "vision00^^"
CLASSCARD_BASE = "https://www.classcard.net"
B_S_IDX       = "19167"

AUTOLOG_URL   = "https://autolog-mhiwnrzqba-uc.a.run.app"
COWORK_SECRET = "plantor-cowork-2026"

TODAY = date.today().strftime("%Y-%m-%d")

# Classcard login_id → Plantor childId
# 어드민 패널 > 회원 탭 > 각 학생 클릭 > URL의 childId 확인 후 입력
# Classcard login_id → Plantor childId
# classcard-middle 활성 구독자만 포함 (Firestore 확인 완료)
STUDENT_MAP = {
    "loea120423": "notion_sugar07c_loea120423",  # 중2 이정민
    "sogmi79":    "notion_viky8282_sogmi79",     # 중1 정윤오
    # 추가 학생 등록 시 여기에 추가
}

# 스크랩할 클래스 목록
CLASSES = [
    # ClassMain 타입 (어휘 / 본문) — JSON API
    {"type": "classMain", "class_idx": "1708319", "name": "능률보카 중등기본"},
    {"type": "classMain", "class_idx": "1998157", "name": "YBM 단어"},
    {"type": "classMain", "class_idx": "1883945", "name": "YBM 본문"},
    {"type": "classMain", "class_idx": "1111034", "name": "능률김 단어/본문"},
    # GClass 타입 (문법) — HTML
    {"type": "gClass", "g_class_idx": "65419",  "name": "문법164"},
    {"type": "gClass", "g_class_idx": "116419", "name": "문법(기타)"},
    # GClass 타입 (듣기) — HTML
    {"type": "gClass", "g_class_idx": "82592",  "name": "듣기평가"},
    {"type": "gClass", "g_class_idx": "95899",  "name": "고1 모의고사"},
]


# ── 로그인 ─────────────────────────────────────────────────────────────────────

def login() -> requests.Session:
    sess = requests.Session()
    sess.headers.update({"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"})

    login_page = sess.get(f"{CLASSCARD_BASE}/login")
    soup = BeautifulSoup(login_page.text, "html.parser")
    sess_key = soup.find("input", {"name": "sess_key"})
    if not sess_key:
        raise RuntimeError("sess_key를 찾을 수 없습니다. 로그인 페이지 구조가 바뀐 것 같습니다.")

    resp = sess.post(f"{CLASSCARD_BASE}/LoginProc", data={
        "sess_key":  sess_key["value"],
        "login_id":  CLASSCARD_ID,
        "login_pwd": CLASSCARD_PW,
        "redirect":  "",
    })
    result = resp.json()
    if result.get("result") != "ok":
        raise RuntimeError(f"로그인 실패: {result}")

    print(f"로그인 성공: {result.get('name')}")
    return sess


def set_date_range(sess: requests.Session, from_date: str, to_date: str):
    sess.post(
        f"{CLASSCARD_BASE}/ClassMainAsync/setClassUserSetReportViewDate",
        data={"view_date_from": from_date, "view_date_to": to_date},
        headers={"X-Requested-With": "XMLHttpRequest"},
    )


# ── ClassMain 스크랩 (어휘 / 본문) ────────────────────────────────────────────

def scrape_classMain(sess: requests.Session, class_idx: str) -> dict[str, dict]:
    """
    Returns: { login_id: { status, scores, studyMinutes } }
    """
    # 세트 목록 조회
    sets_resp = sess.post(
        f"{CLASSCARD_BASE}/ReportAsync/getClassUserSetReport_v2",
        data={"class_idx": class_idx, "b_s_idx": B_S_IDX, "b_s_type": "2",
              "view_sort": "1", "view_days": "1",   # view_days=1: 오늘만
              "login_user_idx": "5101739"},
        headers={"X-Requested-With": "XMLHttpRequest"},
    )
    try:
        data = sets_resp.json()
    except Exception:
        return {}

    results: dict[str, dict] = {}
    set_list = data if isinstance(data, list) else data.get("set_user_list", [])

    for item in set_list:
        login_id = item.get("login_id") or item.get("std_login_id", "")
        if not login_id:
            continue

        learn_start     = str(item.get("learn_start", "0"))
        learn_completed = item.get("learn_completed", False)
        start_date      = item.get("start_date") or item.get("mem_date") or ""

        # 오늘 날짜 활동만 카운트
        if not start_date.startswith(TODAY):
            continue

        if learn_completed:
            status = "완료"
        elif learn_start == "1":
            status = "진행중"
        else:
            status = "시작전"

        scores = {
            "암기":  _safe_int(item.get("mem_score")),
            "리콜":  _safe_int(item.get("recall_score")),
            "스펠":  _safe_int(item.get("spell_score")),
            "테스트": _safe_int(item.get("test_score")),
        }
        scores = {k: v for k, v in scores.items() if v is not None}

        prev = results.get(login_id, {})
        # 같은 학생 여러 세트: 더 높은 상태 유지
        results[login_id] = {
            "status":       _higher_status(prev.get("status", "시작전"), status),
            "scores":       {**prev.get("scores", {}), **scores},
            "studyMinutes": prev.get("studyMinutes", 0),
        }

    return results


# ── GClass 스크랩 (문법 / 듣기) ───────────────────────────────────────────────

def scrape_gClass(sess: requests.Session, g_class_idx: str) -> dict[str, dict]:
    """
    Returns: { login_id: { status, scores, studyMinutes } }
    """
    resp = sess.get(f"{CLASSCARD_BASE}/GClass/report/{g_class_idx}")
    soup = BeautifulSoup(resp.text, "html.parser")

    results: dict[str, dict] = {}

    # 학생별 탭 (sort-student)
    for item in soup.select(".sort-student-item"):
        login_id = item.get("data-login-id", "")
        if not login_id:
            continue

        for study in item.select(".study-item"):
            # 학습 날짜 확인
            from_to_el = study.select_one(".item-from-to")
            if not from_to_el:
                continue
            from_to = from_to_el.get_text(" ", strip=True)
            if not _is_today(from_to):
                continue

            # 완료 여부
            status_el = study.select_one(".item-status")
            is_done = status_el and "done" in (status_el.get("class") or [])

            # 평균 점수
            avg_el = study.select_one(".item-average")
            avg_score = _parse_score(avg_el.get_text(strip=True) if avg_el else "")

            # 소요 시간 (분)
            minutes = _parse_minutes(from_to)

            # 세부 점수
            scores: dict[str, int] = {}
            for score_item in study.select(".score-board-item"):
                title_el = score_item.select_one(".title")
                score_el = score_item.select_one(".score")
                if title_el and score_el:
                    score_val = _parse_score(score_el.get_text(strip=True))
                    if score_val is not None:
                        scores[title_el.get_text(strip=True)] = score_val

            if avg_score is not None:
                status = "완료" if is_done else "진행중"
            else:
                status = "시작전"

            prev = results.get(login_id, {})
            results[login_id] = {
                "status":       _higher_status(prev.get("status", "시작전"), status),
                "scores":       {**prev.get("scores", {}), **scores},
                "studyMinutes": prev.get("studyMinutes", 0) + minutes,
            }

    # 듣기 타입 (report-table)
    for row in soup.select("table.report-table tbody tr"):
        cells = row.select("td")
        if len(cells) < 3:
            continue

        # 학생명 셀에서 login_id 추출 (data-idx 또는 rowspan으로 구분)
        user_el = row.select_one("td[data-idx]")
        if not user_el:
            continue
        login_id = user_el.select_one(".std-login-id")
        login_id = login_id.get_text(strip=True) if login_id else ""
        if not login_id:
            continue

        date_cell = cells[1] if len(cells) > 1 else None
        if not date_cell:
            continue
        date_text = date_cell.get_text(" ", strip=True)
        if not _is_today(date_text):
            continue

        test_cell  = cells[2] if len(cells) > 2 else None
        test_score = _parse_score(test_cell.get_text(strip=True) if test_cell else "")
        minutes    = _parse_minutes(date_text)

        status = "완료" if test_score and test_score >= 80 else "진행중"
        scores = {"테스트": test_score} if test_score is not None else {}

        prev = results.get(login_id, {})
        results[login_id] = {
            "status":       _higher_status(prev.get("status", "시작전"), status),
            "scores":       {**prev.get("scores", {}), **scores},
            "studyMinutes": prev.get("studyMinutes", 0) + minutes,
        }

    return results


# ── autoLog POST ───────────────────────────────────────────────────────────────

def post_auto_log(child_id: str, status: str, scores: dict, study_minutes: int):
    payload = {
        "childId":     child_id,
        "serviceSlug": "classcard-middle",
        "date":        TODAY,
        "autoStatus":  status,
        "scrapedData": {
            "scores":       scores,
            "studyMinutes": study_minutes,
        },
    }
    resp = requests.post(
        AUTOLOG_URL,
        json=payload,
        headers={"Authorization": f"Bearer {COWORK_SECRET}"},
        timeout=10,
    )
    return resp.json()


# ── 유틸 ──────────────────────────────────────────────────────────────────────

STATUS_RANK = {"시작전": 0, "진행중": 1, "완료": 2}

def _higher_status(a: str, b: str) -> str:
    return a if STATUS_RANK.get(a, 0) >= STATUS_RANK.get(b, 0) else b

def _safe_int(val):
    try:
        return int(val) if val not in (None, "", "null") else None
    except (ValueError, TypeError):
        return None

def _parse_score(text: str):
    m = re.search(r"(\d+)점", text)
    return int(m.group(1)) if m else None

def _parse_minutes(text: str) -> int:
    """'02/24 16:33 ~ 02/24 16:53' 형태에서 소요 분 계산"""
    times = re.findall(r"(\d{2}:\d{2})", text)
    if len(times) < 2:
        return 0
    try:
        from datetime import datetime
        t1 = datetime.strptime(times[0], "%H:%M")
        t2 = datetime.strptime(times[1], "%H:%M")
        diff = (t2 - t1).seconds // 60
        return max(0, diff)
    except Exception:
        return 0

def _is_today(text: str) -> bool:
    """텍스트에 오늘 날짜(MM/DD)가 포함되어 있는지 확인"""
    today_mmdd = date.today().strftime("%m/%d")
    return today_mmdd in text


# ── 메인 ──────────────────────────────────────────────────────────────────────

def run():
    print(f"\n[클래스카드] {TODAY}")

    # 매핑 미입력 학생 안내
    empty = [k for k, v in STUDENT_MAP.items() if not v]
    if empty:
        print(f"[주의] childId 미입력 학생: {empty}")
        print("어드민 패널 > 회원 탭에서 childId 확인 후 STUDENT_MAP에 입력해주세요.\n")

    sess = login()
    set_date_range(sess, TODAY, TODAY)

    # 학생별 최종 상태 집계
    # { login_id: { status, scores, studyMinutes } }
    aggregated: dict[str, dict] = {}

    for cls in CLASSES:
        cls_name = cls["name"]
        try:
            if cls["type"] == "classMain":
                data = scrape_classMain(sess, cls["class_idx"])
            else:
                data = scrape_gClass(sess, cls["g_class_idx"])

            for login_id, info in data.items():
                prev = aggregated.get(login_id, {})
                aggregated[login_id] = {
                    "status":       _higher_status(prev.get("status", "시작전"), info["status"]),
                    "scores":       {**prev.get("scores", {}), **info.get("scores", {})},
                    "studyMinutes": prev.get("studyMinutes", 0) + info.get("studyMinutes", 0),
                }
            print(f"[{cls_name}] {len(data)}명 활동 감지")

        except Exception as e:
            print(f"[{cls_name}] 스크랩 실패: {e}")

    # 활동 없는 학생은 시작전으로 채우기
    for login_id in STUDENT_MAP:
        if login_id not in aggregated:
            aggregated[login_id] = {"status": "시작전", "scores": {}, "studyMinutes": 0}

    # autoLog POST
    print()
    for login_id, info in aggregated.items():
        child_id = STUDENT_MAP.get(login_id, "")
        if not child_id:
            print(f"  SKIP {login_id}: childId 미입력")
            continue

        status = info["status"]
        try:
            result = post_auto_log(child_id, status, info["scores"], info["studyMinutes"])
            print(f"  {login_id} → {status} ({info['studyMinutes']}분) [{result.get('result')}]")
        except Exception as e:
            print(f"  {login_id} → POST 실패: {e}")

    print("\n=== 완료 ===\n")


if __name__ == "__main__":
    run()
