"""
매일국어(dailykor.com) 학원 관리자 스크래퍼
학생별 학습현황 데이터를 수집합니다.

조사 결과 요약:
- 서버: Apache/2.4.6 + PHP/7.1.33 (CodeIgniter 프레임워크, ci_session 쿠키)
- 인증: 세션 쿠키 방식 (CSRF 토큰 없음)
- 로그인 엔드포인트: POST /academy/auth/login
"""

import requests
import json
import re
from datetime import datetime, timedelta
from bs4 import BeautifulSoup


BASE_URL = "https://www.dailykor.com"

# --- 학습 분류 색상 코드 ---
# bg-danger  (빨강) = 준비훈련 미완료 / 낮은 점수
# bg-warning (노랑) = 보통
# bg-success (초록) = 양호
# bg-primary (파랑) = 최우수 / 완료
# bg-secondary (회색) = 초등 학습 완료

COLOR_TO_GRADE = {
    "bg-danger": "low",       # 빨강: 미흡
    "bg-warning": "average",  # 노랑: 보통
    "bg-success": "good",     # 초록: 양호
    "bg-primary": "excellent", # 파랑: 최우수
    "bg-secondary": "done",   # 회색(초등): 완료
}


class DailykorScraper:
    def __init__(self, academy_id: str, academy_pwd: str):
        self.academy_id = academy_id
        self.academy_pwd = academy_pwd
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": BASE_URL,
        })
        self._logged_in = False

    # ------------------------------------------------------------------ #
    # 1. 로그인
    # ------------------------------------------------------------------ #
    def login(self) -> bool:
        """
        학원 관리자 로그인

        엔드포인트: POST /academy/auth/login
        필드: academy_id, academy_pwd
        세션: ci_session 쿠키 (HttpOnly, Secure, 도메인: .dailykor.com)
        CSRF: 없음
        성공 시: /academy/dashboard 로 리다이렉트 (JavaScript window.location.replace)
        실패 시: /academy 로 리다이렉트
        """
        # 1) 세션 쿠키 발급 (GET /academy)
        self.session.get(f"{BASE_URL}/academy")

        # 2) 로그인 POST
        resp = self.session.post(
            f"{BASE_URL}/academy/auth/login",
            data={
                "academy_id": self.academy_id,
                "academy_pwd": self.academy_pwd,
            },
            allow_redirects=False,  # JS redirect이므로 따라가지 않음
        )

        # 로그인 POST 후 응답은 항상 JS redirect이므로
        # 대시보드에 접근해서 로그아웃 메뉴 유무로 성공 여부 판별
        dashboard = self.session.get(f"{BASE_URL}/academy/dashboard")
        if "로그아웃" in dashboard.text:
            self._logged_in = True
            print("[로그인] 성공")
            return True
        else:
            print("[로그인] 실패 - 대시보드 로그아웃 메뉴 없음")
            return False

    def _check_login(self):
        if not self._logged_in:
            raise RuntimeError("로그인이 필요합니다. login()을 먼저 호출하세요.")

    # ------------------------------------------------------------------ #
    # 2. 학생 목록 조회
    # ------------------------------------------------------------------ #
    def get_student_list(self, active_only: bool = True) -> list[dict]:
        """
        전체 학생 목록 반환

        엔드포인트: POST /academy/student/list_sub  (DataTables 서버사이드)
        파라미터:
            draw=1
            start=0
            length=200          # 충분히 크게
            search[value]=
            filter_status[]=T   # T=사용중, 없으면 전체
        반환 필드 (aaData 각 행):
            [0] 학년 텍스트 (예: "초등 6", "중등 1")
            [1] JSON {"name": "홍길동", "url": "/academy/student/detail/186432"}
            [2] 레벨 (A/B)
            [3] 학기 (예: "6학년 1학기")
            [4] 포인트
            [5] 서비스 상태 (T=사용중)
            [6] ...
        """
        self._check_login()

        payload = {
            "draw": 1,
            "start": 0,
            "length": 500,
            "search[value]": "",
        }
        if active_only:
            payload["filter_status[]"] = "T"

        resp = self.session.post(
            f"{BASE_URL}/academy/student/list_sub",
            data=payload,
            headers={"X-Requested-With": "XMLHttpRequest"},
        )
        data = resp.json()

        students = []
        for row in data.get("aaData", []):
            grade_text = row[0]  # "초등 6", "중등 1" 등
            name_raw = row[1]
            level = row[2]

            try:
                name_data = json.loads(name_raw)
                name = name_data["name"]
                url_path = name_data["url"]
                student_idx = re.search(r"/(\d+)$", url_path)
                student_idx = int(student_idx.group(1)) if student_idx else None
            except Exception:
                name = name_raw
                student_idx = None

            students.append({
                "student_idx": student_idx,
                "name": name,
                "grade": grade_text,
                "level": level,
            })

        print(f"[학생목록] {len(students)}명 조회 완료")
        return students

    # ------------------------------------------------------------------ #
    # 3. 중고등 월별 학습현황 (메인 리포트)
    # ------------------------------------------------------------------ #
    def get_middle_high_report(
        self,
        year_month: str = None,          # "YYYY-MM", 기본값: 이번달
        teacher_idx: str = None,
        group: str = None,
        level: str = None,
        grade: str = None,
        student_name: str = None,
    ) -> list[dict]:
        """
        중고등 학습현황 조회

        엔드포인트: POST /academy/student/ajax_sreport
        파라미터:
            filter_sdate     YYYY-MM 형식 (생략 시 이번달)
            filter_teacher   선생님 idx
            filter_group     반 이름
            filter_slevel    레벨 (1~6)
            filter_grade     학년 (1~9)
            filter_student_name 학생 이름 검색

        반환 구조 (학생별):
            {
                "rank": 순위,
                "name": 이름,
                "grade": 학년,
                "level": 레벨,
                "step": 단계,
                "study_count": 총 학습 횟수,
                "low_count": 낮은점수 횟수,
                "average_count": 보통 횟수,
                "good_count": 양호 횟수,
                "excellent_count": 최우수 횟수,
                "total_xp": 포인트,
                "student_idx": student_idx,
                "daily": [
                    {
                        "date": "YYYY-MM-DD",
                        "score": 점수(없으면 None),
                        "grade": "low"/"average"/"good"/"excellent" (없으면 None),
                    },
                    ...
                ]
            }

        날짜별 색상 의미:
            bg-danger  (빨강) = low      준비훈련 미완료/낮은 점수
            bg-warning (노랑) = average  보통
            bg-success (초록) = good     양호
            bg-primary (파랑) = excellent 최우수
        """
        self._check_login()

        if year_month is None:
            year_month = datetime.today().strftime("%Y-%m")

        payload = {"filter_sdate": year_month}
        if teacher_idx:
            payload["filter_teacher"] = teacher_idx
        if group:
            payload["filter_group"] = group
        if level:
            payload["filter_slevel"] = level
        if grade:
            payload["filter_grade"] = grade
        if student_name:
            payload["filter_student_name"] = student_name

        resp = self.session.post(
            f"{BASE_URL}/academy/student/ajax_sreport",
            data=payload,
            headers={"X-Requested-With": "XMLHttpRequest",
                     "Referer": f"{BASE_URL}/academy/student/sreport"},
        )

        return self._parse_sreport_html(resp.text)

    def _parse_sreport_html(self, html: str) -> list[dict]:
        """중고등 학습현황 HTML 파싱"""
        soup = BeautifulSoup(html, "html.parser")
        rows = soup.find_all("tr")

        # 헤더에서 날짜 추출 (th.btn_workbook의 data-date 속성)
        date_headers = []
        for th in soup.find_all("th", class_="btn_workbook"):
            date_val = th.get("data-date")
            if date_val:
                date_headers.append(date_val)

        students = []
        for row in rows:
            tds = row.find_all("td")
            if not tds:
                continue

            # 첫 번째 셀이 숫자(순위)인 행만 학생 데이터
            first_text = tds[0].get_text(strip=True)
            if not first_text.isdigit():
                continue

            # 기본 정보 (앞 12개 TD)
            rank = int(first_text)
            name = tds[1].get_text(strip=True)
            grade = tds[2].get_text(strip=True)
            level = tds[3].get_text(strip=True)
            step = tds[4].get_text(strip=True)
            study_count = tds[5].get_text(strip=True)

            # 학습분류 (색상별 카운트)
            low_count = tds[6].get_text(strip=True) if len(tds) > 6 else "0"
            avg_count = tds[7].get_text(strip=True) if len(tds) > 7 else "0"
            good_count = tds[8].get_text(strip=True) if len(tds) > 8 else "0"
            exc_count = tds[9].get_text(strip=True) if len(tds) > 9 else "0"
            total_xp = tds[10].get_text(strip=True) if len(tds) > 10 else "0xp"

            # 날짜별 학습 데이터 (TD 12번 이후 = btn_dailyreport)
            daily = []
            daily_tds = row.find_all("td", class_="btn_dailyreport")
            for i, td in enumerate(daily_tds):
                date_val = td.get("data-study_date")
                student_idx = td.get("data-student_idx")
                score_text = td.get_text(strip=True)
                score = int(score_text) if score_text.isdigit() else None

                # 색상으로 등급 판별
                classes = td.get("class", [])
                grade_tag = None
                for cls, grade_label in COLOR_TO_GRADE.items():
                    if cls in classes:
                        grade_tag = grade_label
                        break

                # 날짜가 없는 경우 headers에서 인덱스로 추정
                if not date_val and i < len(date_headers):
                    date_val = date_headers[i]

                if date_val:
                    daily.append({
                        "date": date_val,
                        "score": score,
                        "grade": grade_tag,
                        "student_idx": int(student_idx) if student_idx else None,
                    })

            # student_idx 추출 (일별 데이터에서)
            student_idx = None
            if daily:
                student_idx = daily[0].get("student_idx")

            students.append({
                "rank": rank,
                "name": name,
                "grade": grade,
                "level": level,
                "step": step,
                "study_count": int(study_count) if study_count.isdigit() else 0,
                "low_count": int(low_count) if low_count.isdigit() else 0,
                "average_count": int(avg_count) if avg_count.isdigit() else 0,
                "good_count": int(good_count) if good_count.isdigit() else 0,
                "excellent_count": int(exc_count) if exc_count.isdigit() else 0,
                "total_xp": total_xp,
                "student_idx": student_idx,
                "daily": daily,
            })

        return students

    # ------------------------------------------------------------------ #
    # 4. 초등 월별 학습현황
    # ------------------------------------------------------------------ #
    def get_elementary_report(self, year_month: str = None) -> list[dict]:
        """
        초등 학습현황 조회

        엔드포인트: POST /academy/elementary/ajax_sreport_tab1
        날짜별 TD: class="btn_learning_modal"
                   data-student_idx, data-type="date", data-date_round="YYYY-MM-DD"
        """
        self._check_login()

        if year_month is None:
            year_month = datetime.today().strftime("%Y-%m")

        resp = self.session.post(
            f"{BASE_URL}/academy/elementary/ajax_sreport_tab1",
            data={"filter_sdate": year_month},
            headers={"X-Requested-With": "XMLHttpRequest",
                     "Referer": f"{BASE_URL}/academy/elementary/sreport"},
        )

        return self._parse_elementary_html(resp.text)

    def _parse_elementary_html(self, html: str) -> list[dict]:
        """초등 학습현황 HTML 파싱"""
        soup = BeautifulSoup(html, "html.parser")
        rows = soup.find_all("tr")

        students = []
        for row in rows:
            tds = row.find_all("td")
            if len(tds) < 5:
                continue

            first_text = tds[0].get_text(strip=True)
            if not first_text.isdigit():
                continue

            rank = int(first_text)
            name = tds[1].get_text(strip=True)
            grade = tds[2].get_text(strip=True)
            level = tds[3].get_text(strip=True)
            study_count = tds[4].get_text(strip=True)

            # 날짜별 학습 TD
            daily = []
            modal_tds = row.find_all("td", class_="btn_learning_modal")
            for td in modal_tds:
                date_round = td.get("data-date_round")
                student_idx = td.get("data-student_idx")
                score_text = td.get_text(strip=True)
                score = int(score_text) if score_text.isdigit() else None

                classes = td.get("class", [])
                grade_tag = None
                for cls, grade_label in COLOR_TO_GRADE.items():
                    if cls in classes:
                        grade_tag = grade_label
                        break

                if date_round:
                    daily.append({
                        "date": date_round,
                        "score": score,
                        "grade": grade_tag,
                        "student_idx": int(student_idx) if student_idx else None,
                    })

            student_idx = daily[0]["student_idx"] if daily else None

            students.append({
                "rank": rank,
                "name": name,
                "grade": grade,
                "level": level,
                "study_count": int(study_count) if study_count.isdigit() else 0,
                "student_idx": student_idx,
                "daily": daily,
            })

        return students

    # ------------------------------------------------------------------ #
    # 5. 개별 학생 일별 상세 리포트
    # ------------------------------------------------------------------ #
    def get_daily_report(self, student_idx: int, study_date: str) -> dict:
        """
        개별 학생 특정 날짜 학습 상세 리포트

        엔드포인트: GET /academy/student/ajax_calendar_dailyreport/{student_idx}/{study_date}
        반환: JSON {"result": "T", "study_date": "YYYY-MM-DD", "html": "..."}

        html 내용 예시:
            - 지문 ID (예: A000112)
            - 학습 유형 (비문학 > 인문 등)
            - 정답률
            - 분당독해속도
            - 획득 경험치 / 최대 경험치
            - 준비훈련/독해훈련/실전대비훈련 시간
        """
        self._check_login()

        resp = self.session.get(
            f"{BASE_URL}/academy/student/ajax_calendar_dailyreport/{student_idx}/{study_date}",
            headers={"X-Requested-With": "XMLHttpRequest",
                     "Referer": f"{BASE_URL}/academy/student/sreport"},
        )

        data = resp.json()
        if data.get("result") != "T":
            return {"error": data.get("msg", "알 수 없는 오류")}

        # HTML에서 텍스트 추출
        html = data.get("html", "")
        text = re.sub(r"<[^>]+>", " ", html)
        text = re.sub(r"\s+", " ", text).strip()

        return {
            "student_idx": student_idx,
            "study_date": data.get("study_date"),
            "raw_html": html,
            "text_summary": text,
        }

    # ------------------------------------------------------------------ #
    # 6. 선생님별 반(그룹) 목록
    # ------------------------------------------------------------------ #
    def get_group_list(self, teacher_idx: int) -> list[str]:
        """
        특정 선생님의 반 목록 조회

        엔드포인트: POST /academy/student/ajax_sreport_group_list
        파라미터: teacher_idx
        반환: JSON {"code": 200, "data": [{"name": "반이름"}, ...]}
        """
        self._check_login()

        resp = self.session.post(
            f"{BASE_URL}/academy/student/ajax_sreport_group_list",
            data={"teacher_idx": teacher_idx},
            headers={"X-Requested-With": "XMLHttpRequest"},
        )
        data = resp.json()
        if data.get("code") == 200:
            return [item["name"] for item in data.get("data", [])]
        return []


# ------------------------------------------------------------------ #
# 사용 예시
# ------------------------------------------------------------------ #
if __name__ == "__main__":
    scraper = DailykorScraper(
        academy_id="from302",
        academy_pwd="vision00^^",
    )

    # 1. 로그인
    if not scraper.login():
        exit(1)

    # 2. 학생 목록
    students = scraper.get_student_list(active_only=True)
    print(f"\n=== 학생 목록 ({len(students)}명) ===")
    for s in students:
        print(f"  [{s['student_idx']}] {s['name']} ({s['grade']}, 레벨 {s['level']})")

    # 3. 중고등 이번달 학습현황
    print("\n=== 중고등 이번달 학습현황 ===")
    mh_report = scraper.get_middle_high_report()
    for s in mh_report:
        study_days = [d["date"] for d in s["daily"] if d["grade"] is not None]
        print(f"  {s['name']:6} | 학습일: {len(study_days)}일 | XP: {s['total_xp']} | "
              f"낮음:{s['low_count']} 보통:{s['average_count']} 양호:{s['good_count']} 최우수:{s['excellent_count']}")

    # 4. 특정 학생 특정 날짜 상세 리포트
    if mh_report:
        first = mh_report[0]
        if first["daily"] and first["student_idx"]:
            first_day = first["daily"][0]
            print(f"\n=== [{first['name']}] {first_day['date']} 상세 리포트 ===")
            detail = scraper.get_daily_report(first["student_idx"], first_day["date"])
            print(detail["text_summary"])

    # 5. 초등 이번달 학습현황
    print("\n=== 초등 이번달 학습현황 ===")
    el_report = scraper.get_elementary_report()
    for s in el_report:
        study_days = [d["date"] for d in s["daily"] if d["grade"] is not None]
        print(f"  {s['name']:6} | 학습일: {len(study_days)}일 | 총학습: {s['study_count']}회")
