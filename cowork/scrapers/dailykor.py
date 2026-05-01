"""
매일국어 → Plantor autoLog 연동 스크래퍼
"""

import requests
import json
import re
from datetime import date
from bs4 import BeautifulSoup

DAILYKOR_BASE = "https://www.dailykor.com"
ACADEMY_ID    = "from302"
ACADEMY_PWD   = "vision00^^"

AUTOLOG_URL   = "https://autolog-mhiwnrzqba-uc.a.run.app"
COWORK_SECRET = "plantor-cowork-2026"
SERVICE_SLUG  = "dailykor"

TODAY = date.today().strftime("%Y-%m-%d")

# dailykor student_idx → Plantor childId
STUDENT_MAP = {
    194015: "notion_bora8285_onyoo7777",         # 김온유
    193628: "notion_sora3061_hj1231",             # 임효주
    186855: "notion_stylelash007_milkshake01",    # 유나
    186432: "notion_viky8282_sogmi79",            # 정윤오
    184938: "zeqKyfMOH2el8evZc2XI",              # 김동한
    184911: "notion_would098_himjkk",             # 한우주
    162868: "Xzz9sb4Eg3wNj7Tchp0k",             # 조민준
    # 추가 학생 등록 시 여기에 추가
}

STATUS_RANK = {"시작전": 0, "진행중": 1, "완료": 2}

COLOR_TO_STATUS = {
    "bg-primary":   "완료",    # 파랑: 최우수
    "bg-success":   "완료",    # 초록: 양호
    "bg-warning":   "진행중",  # 노랑: 보통
    "bg-danger":    "진행중",  # 빨강: 미흡
    "bg-secondary": "완료",    # 회색: 초등 완료
}

COLOR_TO_GRADE = {
    "bg-primary":   "최우수",
    "bg-success":   "양호",
    "bg-warning":   "보통",
    "bg-danger":    "미흡",
    "bg-secondary": "완료",
}

def _higher_status(a, b):
    return a if STATUS_RANK.get(a, 0) >= STATUS_RANK.get(b, 0) else b


# ── 세션 로그인 ────────────────────────────────────────────────────────────────

def _login():
    sess = requests.Session()
    sess.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer":    DAILYKOR_BASE,
    })
    sess.get(f"{DAILYKOR_BASE}/academy")
    sess.post(
        f"{DAILYKOR_BASE}/academy/auth/login",
        data={"academy_id": ACADEMY_ID, "academy_pwd": ACADEMY_PWD},
        allow_redirects=False,
    )
    dashboard = sess.get(f"{DAILYKOR_BASE}/academy/dashboard")
    if "로그아웃" not in dashboard.text:
        raise RuntimeError("매일국어 로그인 실패")
    return sess


# ── 오늘 학습 현황 스크랩 ──────────────────────────────────────────────────────

def _scrape_today(sess):
    """오늘 날짜 기준 학생별 status 반환: { student_idx: (status, scores) }"""
    year_month = TODAY[:7]  # "YYYY-MM"

    # 중고등 리포트
    resp = sess.post(
        f"{DAILYKOR_BASE}/academy/student/ajax_sreport",
        data={"filter_sdate": year_month},
        headers={"X-Requested-With": "XMLHttpRequest",
                 "Referer": f"{DAILYKOR_BASE}/academy/student/sreport"},
    )
    results = _parse_report(resp.text, "btn_dailyreport", "data-study_date")

    # 초등 리포트
    resp2 = sess.post(
        f"{DAILYKOR_BASE}/academy/elementary/ajax_sreport_tab1",
        data={"filter_sdate": year_month},
        headers={"X-Requested-With": "XMLHttpRequest",
                 "Referer": f"{DAILYKOR_BASE}/academy/elementary/sreport"},
    )
    el = _parse_report(resp2.text, "btn_learning_modal", "data-date_round")
    for idx, val in el.items():
        if idx in results:
            results[idx] = (_higher_status(results[idx][0], val[0]),
                            {**results[idx][1], **val[1]})
        else:
            results[idx] = val

    return results


def _parse_report(html, td_class, date_attr):
    """공통 HTML 파싱: 오늘 날짜 데이터만 추출"""
    soup    = BeautifulSoup(html, "html.parser")
    results = {}

    for row in soup.find_all("tr"):
        tds = row.find_all("td")
        if not tds or not tds[0].get_text(strip=True).isdigit():
            continue

        for td in row.find_all("td", class_=td_class):
            study_date  = td.get(date_attr, "")
            student_idx = td.get("data-student_idx")
            if not student_idx or study_date != TODAY:
                continue

            idx    = int(student_idx)
            score  = td.get_text(strip=True)
            score  = int(score) if score.isdigit() else None
            classes = td.get("class", [])

            status = "시작전"
            grade  = None
            for cls in classes:
                if cls in COLOR_TO_STATUS:
                    status = COLOR_TO_STATUS[cls]
                    grade  = COLOR_TO_GRADE[cls]
                    break

            scores = {"등급": grade, "점수": score} if grade else {}
            scores = {k: v for k, v in scores.items() if v is not None}

            prev = results.get(idx)
            if prev:
                results[idx] = (_higher_status(prev[0], status), {**prev[1], **scores})
            else:
                results[idx] = (status, scores)

    return results


# ── autoLog POST ───────────────────────────────────────────────────────────────

def post_auto_log(child_id, status, scores):
    resp = requests.post(
        AUTOLOG_URL,
        json={
            "childId":     child_id,
            "serviceSlug": SERVICE_SLUG,
            "date":        TODAY,
            "autoStatus":  status,
            "scrapedData": {"scores": scores},
        },
        headers={"Authorization": f"Bearer {COWORK_SECRET}"},
        timeout=10,
    )
    return resp.json()


# ── 메인 ──────────────────────────────────────────────────────────────────────

def run():
    print(f"\n[매일국어] {TODAY}")
    sess = _login()
    print("  로그인 성공")

    scraped = _scrape_today(sess)

    for student_idx, child_id in STUDENT_MAP.items():
        if student_idx in scraped:
            status, scores = scraped[student_idx]
        else:
            status, scores = "시작전", {}

        try:
            r = post_auto_log(child_id, status, scores)
            print(f"  {student_idx} → {status} [{r.get('result')}]")
        except Exception as e:
            print(f"  {student_idx} → POST 실패: {e}")


if __name__ == "__main__":
    run()
