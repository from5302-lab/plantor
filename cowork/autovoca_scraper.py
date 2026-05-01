"""
오토보카(autovoca.co.kr) 학원 관리자용 스크래퍼
학생별 학습현황 데이터를 가져오는 Python requests 구현

조사 결과 정리:
- API Base URL: https://mobile.autovoca.co.kr
- 인증: JWT (WebAuthorization 헤더) + 세션 쿠키
- 요청 서명: HMAC-SHA256 (Ts, Hmac 헤더 필수)
"""

import requests
import hmac
import hashlib
import json
from datetime import datetime
import binascii
from typing import Optional


# ─── 상수 ────────────────────────────────────────────────────────────────────
BASE_URL    = "https://mobile.autovoca.co.kr"
HMAC_SECRET = "fe21dc44796eb80b460742fc20f64184331b062a84bf15c030b00359612ec697"
LOGIN_ID    = "from302"
LOGIN_PW    = "vision00^^"


# ─── HMAC 서명 유틸 ──────────────────────────────────────────────────────────

def _crc32(s: str) -> int:
    """JavaScript의 crc32.str(s) >>> 0 에 해당"""
    return binascii.crc32(s.encode("utf-8")) & 0xFFFFFFFF


def _sign(token: str, method: str, url_path: str, body: Optional[dict], ts: str) -> str:
    """
    클라이언트 JS 코드의 _8() 함수 재현:
      data_hash = CRC32( GET → url_path,  POST → JSON(body) )
      hmac_input = f"{token}{ts}{data_hash}"
      return HMAC-SHA256(hmac_input, HMAC_SECRET).hex
    """
    if method.upper() == "GET":
        data_str = url_path or ""
    else:
        data_str = json.dumps(body or {}, separators=(",", ":"))
    data_hash = _crc32(data_str)
    message   = f"{token}{ts}{data_hash}"
    return hmac.new(HMAC_SECRET.encode(), message.encode(), hashlib.sha256).hexdigest()


# ─── AutoVoca 클라이언트 ─────────────────────────────────────────────────────

class AutoVocaClient:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "Origin":       "https://www.autovoca.co.kr",
            "Referer":      "https://www.autovoca.co.kr/",
            "User-Agent":   (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        })
        self._token: str = ""

    # ── 내부 요청 헬퍼 ──────────────────────────────────────────────────────

    def _req(self, method: str, path: str, body: Optional[dict] = None) -> dict:
        ts  = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        sig = _sign(self._token, method, path, body, ts)
        headers = {
            "WebAuthorization": f"Bearer {self._token}",
            "Ts":   ts,
            "Hmac": sig,
        }
        url = f"{BASE_URL}{path}"
        if method.upper() == "GET":
            resp = self.session.get(url, headers=headers)
        else:
            resp = self.session.post(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()

    def _get(self, path: str) -> dict:
        return self._req("GET", path)

    def _post(self, path: str, body: dict) -> dict:
        return self._req("POST", path, body)

    # ── 공개 API ────────────────────────────────────────────────────────────

    def login(self, login_id: str = LOGIN_ID, login_pw: str = LOGIN_PW) -> dict:
        """
        로그인

        POST /auth/login
        Body: {"login_id": str, "login_pw": str}

        응답에서 JWT token + 세션 쿠키(session_id, u_idx) 획득.
        token은 WebAuthorization 헤더로 이후 모든 요청에 사용.
        쿠키는 requests.Session이 자동 관리.

        Returns:
            res_data dict (user_info, ac_info, token, student_cnt 등)
        """
        body = {"login_id": login_id, "login_pw": login_pw}
        # 로그인 전이므로 token 없이 서명
        ts  = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        sig = _sign("", "POST", "/auth/login", body, ts)
        self.session.headers["WebAuthorization"] = "Bearer "
        self.session.headers["Ts"]   = ts
        self.session.headers["Hmac"] = sig

        resp = self.session.post(f"{BASE_URL}/auth/login", json=body)
        resp.raise_for_status()
        data = resp.json()

        if data["result"]["code"] != 200:
            raise RuntimeError(f"로그인 실패: {data['result']['msg']}")

        self._token = data["res_data"]["token"]
        return data["res_data"]

    def get_student_list(self) -> list:
        """
        학원 학생 전체 목록

        GET /academy/student/list

        Returns:
            student_list: [
              {user_idx, login_id, name, is_sample, last_login_date, ...}
            ]
        """
        data = self._get("/academy/student/list")
        return data["res_data"]["student_list"]

    def get_user_report(self, user_idx: int) -> dict:
        """
        학생 누적 리포트 요약

        GET /report/get_user_report_data/{user_idx}

        Returns dict with:
          accumulate_report_data:
            word_cnt          - 총 학습 단어 수
            wrong_cnt         - 현재 오답 수
            wrong_end_cnt     - 완료된 오답 수
            wrong_complete_rate - 오답 완료율(%)
          workbook_report_filter: 학습중인 교재 목록
          workbook_report_list:  교재별 리포트 목록
          level_test_*:          레벨 테스트 정보
        """
        data = self._get(f"/report/get_user_report_data/{user_idx}")
        return data.get("res_data", {}).get("report_data", {})

    def get_weekly_report(self, user_idx: int, year: int, month: int) -> dict:
        """
        학생 주간(월별) 학습 현황

        GET /report/get_user_weekly_report/{user_idx}/{year}/{month:02d}

        Returns dict with:
          weekly_report_data:
            year, month
            weeks: [
              {
                week_info:   "4월 3주차"
                week_period: "2026.04.13 ~ 2026.04.19"
                days: [
                  {
                    day:  19           # 날짜(일)
                    yoil: "일"         # 요일
                    unit_data: [       # 학습 유닛 데이터
                      {
                        report_type:  "unit"
                        report_idx:   22517
                        book_idx:     5
                        unit_start:   "2026-04-19T05:10:57.000Z"
                        unit_end:     null | ISO datetime
                        day_num:      1           # 유닛 내 day
                        unit_duration: 1037       # 학습 시간(초)
                        report_name:  "유닛 14"
                        pager_test_score: null | int  # 시험 점수
                        book_short_name: "5권"
                        json_data: {
                          mem_list:   [{word_idx, score, try_cnt, correct_cnt}, ...]
                          check_list: [{word_idx, score, try_cnt, correct_cnt}, ...]
                          speak_list: [{word_idx, score, try_cnt, correct_cnt}, ...]
                          write_list: [{word_idx, score, try_cnt, correct_cnt}, ...]
                          point_list: [{step, activity, point}, ...]
                        }
                      }
                    ]
                    wrong_data: [      # 오답 학습 데이터
                      {
                        study_date: ISO datetime
                        now_cnt:    13   # 현재 남은 오답 수
                        end_cnt:    0    # 완료된 오답 수
                        total_point: 0
                        is_made:    1
                      }
                    ]
                  }
                ]
                total_unit_count:        0   # 이번 주 유닛 완료 수
                total_unit_duration:     0   # 이번 주 총 학습 시간(초)
                total_average_test_score: 0  # 평균 시험 점수
                total_wrong_end_cnt:     0   # 완료 오답 수
                total_wrong_point:       0   # 오답 포인트
              }
            ]
        """
        path = f"/report/get_user_weekly_report/{user_idx}/{year}/{month:02d}"
        data = self._get(path)
        return data.get("res_data", {}).get("weekly_report_data", {})

    def get_workbook_list(self, user_idx: int) -> list:
        """
        학생의 교재 목록

        GET /user/workbook_list/{user_idx}

        Returns list of {book_idx, book_name, book_short_name, book_level, word_total_cnt, ...}
        """
        data = self._get(f"/user/workbook_list/{user_idx}")
        return data.get("res_data", [])

    def get_workbook_info(self, user_idx: int, book_idx: int) -> dict:
        """
        학생의 특정 교재 진행 상태

        GET /user/workbook_info/{user_idx}/{book_idx}

        Returns {user_idx, book_idx, status, is_level_test, levelup_option, ts, reg_date}
        """
        data = self._get(f"/user/workbook_info/{user_idx}/{book_idx}")
        return data.get("res_data", {})

    def logout(self):
        """
        로그아웃

        POST /auth/logout
        """
        try:
            self._post("/auth/logout", {})
        except Exception:
            pass
        self._token = ""


# ─── 사용 예시 ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    client = AutoVocaClient()

    # 1. 로그인
    info = client.login()
    print(f"[로그인 성공] 학원명: {info['ac_info']['ac_name']}, 학생 수: {info['student_cnt']}")

    # 2. 학생 목록
    students = client.get_student_list()
    real_students = [s for s in students if not s["is_sample"]]
    print(f"\n[학생 목록] 실제 학생 {len(real_students)}명")
    for s in real_students:
        print(f"  {s['name']:15} (user_idx={s['user_idx']}, id={s['login_id']})")

    # 3. 첫 번째 학생 상세 리포트
    if real_students:
        stu = real_students[0]
        uid = stu["user_idx"]

        # 누적 리포트
        report = client.get_user_report(uid)
        acc = report.get("accumulate_report_data", {})
        print(f"\n[{stu['name']}] 누적 현황")
        print(f"  총 학습 단어: {acc.get('word_cnt')}개")
        print(f"  현재 오답:    {acc.get('wrong_cnt')}개")
        print(f"  오답 완료율:  {acc.get('wrong_complete_rate')}%")

        # 이번 달 주간 리포트
        now = datetime.now()
        weekly = client.get_weekly_report(uid, now.year, now.month)
        print(f"\n[{stu['name']}] {now.year}년 {now.month:02d}월 주간 현황")
        for week in weekly.get("weeks", []):
            days_with_study = [d for d in week["days"] if d["unit_data"] or d["wrong_data"]]
            if days_with_study:
                print(f"  {week['week_info']} ({week['week_period']})")
                for day in days_with_study:
                    units = len(day["unit_data"])
                    wrongs = len(day["wrong_data"])
                    print(f"    {day['yoil']}({day['day']}일): 유닛학습 {units}건, 오답학습 {wrongs}건")

    client.logout()
    print("\n[로그아웃 완료]")
