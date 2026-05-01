"""
오토보카 → Plantor autoLog 연동 스크래퍼
"""

import requests
import hmac
import hashlib
import json
import binascii
from datetime import datetime, date, timezone

AUTOVOCA_BASE  = "https://mobile.autovoca.co.kr"
HMAC_SECRET    = "fe21dc44796eb80b460742fc20f64184331b062a84bf15c030b00359612ec697"
LOGIN_ID       = "from302"
LOGIN_PW       = "vision00^^"

AUTOLOG_URL    = "https://autolog-mhiwnrzqba-uc.a.run.app"
COWORK_SECRET  = "plantor-cowork-2026"
SERVICE_SLUG   = "autovoca"

TODAY = date.today().strftime("%Y-%m-%d")
TODAY_DAY = date.today().day  # 일(day) 숫자

# autovoca login_id → Plantor childId
STUDENT_MAP = {
    "dodalove": "notion_saboran_dodalove",  # 최도윤
    "sogmi79":  "notion_viky8282_sogmi79",  # 정윤오
    # 추가 학생 등록 시 여기에 추가
}

STATUS_RANK = {"시작전": 0, "진행중": 1, "완료": 2}

def _higher_status(a, b):
    return a if STATUS_RANK.get(a, 0) >= STATUS_RANK.get(b, 0) else b


# ── HMAC 서명 ──────────────────────────────────────────────────────────────────

def _crc32(s):
    return binascii.crc32(s.encode("utf-8")) & 0xFFFFFFFF

def _sign(token, method, path, body, ts):
    data_str = path if method.upper() == "GET" else json.dumps(body or {}, separators=(",", ":"))
    message  = f"{token}{ts}{_crc32(data_str)}"
    return hmac.new(HMAC_SECRET.encode(), message.encode(), hashlib.sha256).hexdigest()


# ── 오토보카 클라이언트 ────────────────────────────────────────────────────────

class _Client:
    def __init__(self):
        self.sess  = requests.Session()
        self.sess.headers.update({
            "Content-Type": "application/json",
            "Origin":       "https://www.autovoca.co.kr",
            "Referer":      "https://www.autovoca.co.kr/",
            "User-Agent":   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        })
        self._token = ""

    def _req(self, method, path, body=None):
        ts  = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        sig = _sign(self._token, method, path, body, ts)
        hdrs = {"WebAuthorization": f"Bearer {self._token}", "Ts": ts, "Hmac": sig}
        url  = f"{AUTOVOCA_BASE}{path}"
        resp = (self.sess.get(url, headers=hdrs) if method.upper() == "GET"
                else self.sess.post(url, json=body, headers=hdrs))
        resp.raise_for_status()
        return resp.json()

    def login(self):
        body = {"login_id": LOGIN_ID, "login_pw": LOGIN_PW}
        ts   = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        sig  = _sign("", "POST", "/auth/login", body, ts)
        self.sess.headers.update({"WebAuthorization": "Bearer ", "Ts": ts, "Hmac": sig})
        resp = self.sess.post(f"{AUTOVOCA_BASE}/auth/login", json=body)
        resp.raise_for_status()
        data = resp.json()
        if data["result"]["code"] != 200:
            raise RuntimeError(f"로그인 실패: {data['result']['msg']}")
        self._token = data["res_data"]["token"]
        return data["res_data"]

    def get_student_list(self):
        data = self._req("GET", "/academy/student/list")
        return data["res_data"]["student_list"]

    def get_weekly_report(self, user_idx, year, month):
        path = f"/report/get_user_weekly_report/{user_idx}/{year}/{month:02d}"
        data = self._req("GET", path)
        return data.get("res_data", {}).get("weekly_report_data", {})


# ── 오늘 학습 상태 판별 ────────────────────────────────────────────────────────

def _today_status(weekly):
    """weekly_report_data에서 오늘 유닛/오답 활동 추출 → (status, scores, studyMinutes)"""
    status       = "시작전"
    study_secs   = 0
    words_today  = 0
    test_scores  = []

    for week in weekly.get("weeks", []):
        for day in week.get("days", []):
            if day.get("day") != TODAY_DAY:
                continue

            # 유닛 학습
            for unit in day.get("unit_data", []):
                unit_start = unit.get("unit_start")
                unit_end   = unit.get("unit_end")
                duration   = unit.get("unit_duration", 0) or 0
                pager_score = unit.get("pager_test_score")

                if unit_start:
                    new_status = "완료" if unit_end else "진행중"
                    status = _higher_status(status, new_status)
                    study_secs += duration

                    # 단어 수: mem_list 기준
                    json_data = unit.get("json_data") or {}
                    words_today += len(json_data.get("mem_list", []))

                    if pager_score is not None:
                        test_scores.append(pager_score)

            # 오답 학습 (활동 자체가 있으면 최소 진행중)
            for wrong in day.get("wrong_data", []):
                if wrong.get("is_made"):
                    status = _higher_status(status, "진행중")

    scores = {"단어수": words_today} if words_today else {}
    if test_scores:
        scores["평균점수"] = round(sum(test_scores) / len(test_scores))

    return status, scores, study_secs // 60


# ── autoLog POST ───────────────────────────────────────────────────────────────

def post_auto_log(child_id, status, scores, study_minutes):
    resp = requests.post(
        AUTOLOG_URL,
        json={
            "childId":     child_id,
            "serviceSlug": SERVICE_SLUG,
            "date":        TODAY,
            "autoStatus":  status,
            "scrapedData": {"scores": scores, "studyMinutes": study_minutes},
        },
        headers={"Authorization": f"Bearer {COWORK_SECRET}"},
        timeout=10,
    )
    return resp.json()


# ── 메인 ──────────────────────────────────────────────────────────────────────

def run():
    print(f"\n[오토보카] {TODAY}")
    client = _Client()
    info   = client.login()
    print(f"  로그인: {info['ac_info']['ac_name']}")

    students = {s["login_id"]: s for s in client.get_student_list() if not s["is_sample"]}
    now      = date.today()

    results = {}
    for login_id in STUDENT_MAP:
        stu = students.get(login_id)
        if not stu:
            print(f"  SKIP {login_id}: 오토보카에서 찾을 수 없음")
            continue
        weekly = client.get_weekly_report(stu["user_idx"], now.year, now.month)
        status, scores, minutes = _today_status(weekly)
        results[login_id] = (status, scores, minutes)

    # 활동 없는 학생 시작전으로 채우기
    for login_id in STUDENT_MAP:
        if login_id not in results:
            results[login_id] = ("시작전", {}, 0)

    for login_id, (status, scores, minutes) in results.items():
        child_id = STUDENT_MAP[login_id]
        try:
            r = post_auto_log(child_id, status, scores, minutes)
            print(f"  {login_id} → {status} ({minutes}분) [{r.get('result')}]")
        except Exception as e:
            print(f"  {login_id} → POST 실패: {e}")


if __name__ == "__main__":
    run()
