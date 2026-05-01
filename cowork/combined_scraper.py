#!/usr/bin/env python3
"""
Plantor 학습 자동 인증 통합 스크래퍼 (단일 파일)
Cowork Scheduled Task로 매일 평일 오후 9시 실행
서비스: 클래스카드, 오토보카, 매일국어
"""

import requests
import hmac
import hashlib
import json
import re
import binascii
from datetime import date, datetime
from bs4 import BeautifulSoup

TODAY      = date.today().strftime("%Y-%m-%d")
TODAY_DAY  = date.today().day
TODAY_MMDD = date.today().strftime("%m/%d")
AUTOLOG_URL   = "https://autolog-mhiwnrzqba-uc.a.run.app"
COWORK_SECRET = "plantor-cowork-2026"

STATUS_RANK = {"시작전": 0, "진행중": 1, "완료": 2}

def _higher(a, b):
    return a if STATUS_RANK.get(a, 0) >= STATUS_RANK.get(b, 0) else b

def _safe_int(v):
    try: return int(v) if v not in (None, "", "null") else None
    except: return None

def _parse_score(text):
    m = re.search(r"(\d+)점", text)
    return int(m.group(1)) if m else None

def _parse_minutes(text):
    times = re.findall(r"(\d{2}:\d{2})", text)
    if len(times) < 2: return 0
    try:
        t1 = datetime.strptime(times[0], "%H:%M")
        t2 = datetime.strptime(times[1], "%H:%M")
        return max(0, (t2 - t1).seconds // 60)
    except: return 0

def post_auto_log(child_id, service_slug, status, scraped_data):
    resp = requests.post(
        AUTOLOG_URL,
        json={"childId": child_id, "serviceSlug": service_slug,
              "date": TODAY, "autoStatus": status, "scrapedData": scraped_data},
        headers={"Authorization": f"Bearer {COWORK_SECRET}"},
        timeout=10,
    )
    return resp.json()


# ══════════════════════════════════════════════════════════════════════════════
# 1. 클래스카드
# ══════════════════════════════════════════════════════════════════════════════

CC_ID      = "from302"
CC_PW      = "vision00^^"
CC_BASE    = "https://www.classcard.net"
CC_B_S_IDX = "19167"

CC_STUDENT_MAP = {
    "loea120423": "notion_sugar07c_loea120423",  # 이정민
    "sogmi79":    "notion_viky8282_sogmi79",      # 정윤오
}

CC_CLASSES = [
    {"type": "classMain", "class_idx": "1708319", "name": "능률보카 중등기본"},
    {"type": "classMain", "class_idx": "1998157", "name": "YBM 단어"},
    {"type": "classMain", "class_idx": "1883945", "name": "YBM 본문"},
    {"type": "classMain", "class_idx": "1111034", "name": "능률김 단어/본문"},
    {"type": "gClass",    "g_class_idx": "65419",  "name": "문법164"},
    {"type": "gClass",    "g_class_idx": "116419", "name": "문법(기타)"},
    {"type": "gClass",    "g_class_idx": "82592",  "name": "듣기평가"},
    {"type": "gClass",    "g_class_idx": "95899",  "name": "고1 모의고사"},
]

def cc_login():
    sess = requests.Session()
    sess.headers["User-Agent"] = "Mozilla/5.0"
    soup = BeautifulSoup(sess.get(f"{CC_BASE}/login").text, "html.parser")
    sk = soup.find("input", {"name": "sess_key"})
    if not sk: raise RuntimeError("sess_key 없음")
    r = sess.post(f"{CC_BASE}/LoginProc", data={"sess_key": sk["value"], "login_id": CC_ID, "login_pwd": CC_PW, "redirect": ""})
    if r.json().get("result") != "ok": raise RuntimeError(f"CC 로그인 실패")
    return sess

def cc_scrape_classMain(sess, class_idx):
    r = sess.post(f"{CC_BASE}/ReportAsync/getClassUserSetReport_v2",
        data={"class_idx": class_idx, "b_s_idx": CC_B_S_IDX, "b_s_type": "2",
              "view_sort": "1", "view_days": "1", "login_user_idx": "5101739"},
        headers={"X-Requested-With": "XMLHttpRequest"})
    try: data = r.json()
    except: return {}
    results = {}
    for item in (data if isinstance(data, list) else data.get("set_user_list", [])):
        lid = item.get("login_id") or item.get("std_login_id", "")
        if not lid: continue
        sd = item.get("start_date") or item.get("mem_date") or ""
        if not sd.startswith(TODAY): continue
        lc = item.get("learn_completed", False)
        ls = str(item.get("learn_start", "0"))
        status = "완료" if lc else ("진행중" if ls == "1" else "시작전")
        scores = {k: v for k, v in {"암기": _safe_int(item.get("mem_score")),
            "리콜": _safe_int(item.get("recall_score")), "스펠": _safe_int(item.get("spell_score")),
            "테스트": _safe_int(item.get("test_score"))}.items() if v is not None}
        prev = results.get(lid, {})
        results[lid] = {"status": _higher(prev.get("status","시작전"), status),
                        "scores": {**prev.get("scores",{}), **scores},
                        "studyMinutes": prev.get("studyMinutes", 0)}
    return results

def cc_scrape_gClass(sess, g_class_idx):
    soup = BeautifulSoup(sess.get(f"{CC_BASE}/GClass/report/{g_class_idx}").text, "html.parser")
    results = {}
    for item in soup.select(".sort-student-item"):
        lid = item.get("data-login-id", "")
        if not lid: continue
        for study in item.select(".study-item"):
            fte = study.select_one(".item-from-to")
            if not fte: continue
            ft = fte.get_text(" ", strip=True)
            if TODAY_MMDD not in ft: continue
            se = study.select_one(".item-status")
            done = se and "done" in (se.get("class") or [])
            ae = study.select_one(".item-average")
            avg = _parse_score(ae.get_text(strip=True) if ae else "")
            mins = _parse_minutes(ft)
            scores = {}
            for si in study.select(".score-board-item"):
                t = si.select_one(".title"); s = si.select_one(".score")
                if t and s:
                    sv = _parse_score(s.get_text(strip=True))
                    if sv is not None: scores[t.get_text(strip=True)] = sv
            status = ("완료" if done else "진행중") if avg is not None else "시작전"
            prev = results.get(lid, {})
            results[lid] = {"status": _higher(prev.get("status","시작전"), status),
                            "scores": {**prev.get("scores",{}), **scores},
                            "studyMinutes": prev.get("studyMinutes",0) + mins}
    for row in soup.select("table.report-table tbody tr"):
        cells = row.select("td")
        if len(cells) < 3: continue
        ue = row.select_one("td[data-idx]")
        if not ue: continue
        le = ue.select_one(".std-login-id")
        lid = le.get_text(strip=True) if le else ""
        if not lid: continue
        dt = cells[1].get_text(" ", strip=True) if len(cells) > 1 else ""
        if TODAY_MMDD not in dt: continue
        ts = _parse_score(cells[2].get_text(strip=True) if len(cells) > 2 else "")
        mins = _parse_minutes(dt)
        status = "완료" if ts and ts >= 80 else "진행중"
        scores = {"테스트": ts} if ts is not None else {}
        prev = results.get(lid, {})
        results[lid] = {"status": _higher(prev.get("status","시작전"), status),
                        "scores": {**prev.get("scores",{}), **scores},
                        "studyMinutes": prev.get("studyMinutes",0) + mins}
    return results

def run_classcard():
    print(f"\n[클래스카드] {TODAY}")
    sess = cc_login()
    sess.post(f"{CC_BASE}/ClassMainAsync/setClassUserSetReportViewDate",
              data={"view_date_from": TODAY, "view_date_to": TODAY},
              headers={"X-Requested-With": "XMLHttpRequest"})
    agg = {}
    for cls in CC_CLASSES:
        try:
            data = (cc_scrape_classMain(sess, cls["class_idx"]) if cls["type"] == "classMain"
                    else cc_scrape_gClass(sess, cls["g_class_idx"]))
            for lid, info in data.items():
                prev = agg.get(lid, {})
                agg[lid] = {"status": _higher(prev.get("status","시작전"), info["status"]),
                            "scores": {**prev.get("scores",{}), **info.get("scores",{})},
                            "studyMinutes": prev.get("studyMinutes",0) + info.get("studyMinutes",0)}
            print(f"  [{cls['name']}] {len(data)}명")
        except Exception as e: print(f"  [{cls['name']}] 실패: {e}")
    for lid in CC_STUDENT_MAP:
        if lid not in agg: agg[lid] = {"status": "시작전", "scores": {}, "studyMinutes": 0}
    for lid, info in agg.items():
        cid = CC_STUDENT_MAP.get(lid, "")
        if not cid: continue
        try:
            r = post_auto_log(cid, "classcard-middle", info["status"],
                              {"scores": info["scores"], "studyMinutes": info["studyMinutes"]})
            print(f"  {lid} → {info['status']} ({info['studyMinutes']}분) [{r.get('result')}]")
        except Exception as e: print(f"  {lid} → 실패: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# 2. 오토보카
# ══════════════════════════════════════════════════════════════════════════════

AV_BASE   = "https://mobile.autovoca.co.kr"
AV_SECRET = "fe21dc44796eb80b460742fc20f64184331b062a84bf15c030b00359612ec697"
AV_ID     = "from302"
AV_PW     = "vision00^^"

AV_STUDENT_MAP = {
    "dodalove": "notion_saboran_dodalove",  # 최도윤
    "sogmi79":  "notion_viky8282_sogmi79",  # 정윤오
}

def _av_crc32(s): return binascii.crc32(s.encode()) & 0xFFFFFFFF

def _av_sign(token, method, path, body, ts):
    data_str = path if method.upper() == "GET" else json.dumps(body or {}, separators=(",",":"))
    msg = f"{token}{ts}{_av_crc32(data_str)}"
    return hmac.new(AV_SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()

class _AV:
    def __init__(self):
        self.sess = requests.Session()
        self.sess.headers.update({"Content-Type": "application/json",
            "Origin": "https://www.autovoca.co.kr", "Referer": "https://www.autovoca.co.kr/",
            "User-Agent": "Mozilla/5.0"})
        self._tok = ""

    def _req(self, method, path, body=None):
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        sig = _av_sign(self._tok, method, path, body, ts)
        h = {"WebAuthorization": f"Bearer {self._tok}", "Ts": ts, "Hmac": sig}
        url = f"{AV_BASE}{path}"
        r = self.sess.get(url, headers=h) if method.upper() == "GET" else self.sess.post(url, json=body, headers=h)
        r.raise_for_status()
        return r.json()

    def login(self):
        body = {"login_id": AV_ID, "login_pw": AV_PW}
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        sig = _av_sign("", "POST", "/auth/login", body, ts)
        self.sess.headers.update({"WebAuthorization": "Bearer ", "Ts": ts, "Hmac": sig})
        r = self.sess.post(f"{AV_BASE}/auth/login", json=body)
        r.raise_for_status()
        d = r.json()
        if d["result"]["code"] != 200: raise RuntimeError(f"AV 로그인 실패")
        self._tok = d["res_data"]["token"]
        return d["res_data"]

    def students(self): return self._req("GET", "/academy/student/list")["res_data"]["student_list"]
    def weekly(self, uid, y, m): return self._req("GET", f"/report/get_user_weekly_report/{uid}/{y}/{m:02d}").get("res_data",{}).get("weekly_report_data",{})

def _av_today(weekly):
    status = "시작전"; secs = 0; words = 0; scores_list = []
    for week in weekly.get("weeks", []):
        for day in week.get("days", []):
            if day.get("day") != TODAY_DAY: continue
            for unit in day.get("unit_data", []):
                if unit.get("unit_start"):
                    status = _higher(status, "완료" if unit.get("unit_end") else "진행중")
                    secs += unit.get("unit_duration", 0) or 0
                    words += len((unit.get("json_data") or {}).get("mem_list", []))
                    if unit.get("pager_test_score") is not None:
                        scores_list.append(unit["pager_test_score"])
            for w in day.get("wrong_data", []):
                if w.get("is_made"): status = _higher(status, "진행중")
    scores = {"단어수": words} if words else {}
    if scores_list: scores["평균점수"] = round(sum(scores_list)/len(scores_list))
    return status, scores, secs // 60

def run_autovoca():
    print(f"\n[오토보카] {TODAY}")
    av = _AV()
    info = av.login()
    print(f"  로그인: {info['ac_info']['ac_name']}")
    students = {s["login_id"]: s for s in av.students() if not s["is_sample"]}
    now = date.today()
    for lid, cid in AV_STUDENT_MAP.items():
        stu = students.get(lid)
        if not stu: print(f"  SKIP {lid}: 미등록"); continue
        weekly = av.weekly(stu["user_idx"], now.year, now.month)
        status, scores, mins = _av_today(weekly)
        try:
            r = post_auto_log(cid, "autovoca", status, {"scores": scores, "studyMinutes": mins})
            print(f"  {lid} → {status} ({mins}분) [{r.get('result')}]")
        except Exception as e: print(f"  {lid} → 실패: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# 3. 매일국어
# ══════════════════════════════════════════════════════════════════════════════

DK_BASE = "https://www.dailykor.com"
DK_ID   = "from302"
DK_PW   = "vision00^^"

DK_STUDENT_MAP = {
    194015: "notion_bora8285_onyoo7777",        # 김온유
    193628: "notion_sora3061_hj1231",            # 임효주
    186855: "notion_stylelash007_milkshake01",   # 유나
    186432: "notion_viky8282_sogmi79",           # 정윤오
    184938: "zeqKyfMOH2el8evZc2XI",             # 김동한
    184911: "notion_would098_himjkk",            # 한우주
    162868: "Xzz9sb4Eg3wNj7Tchp0k",            # 조민준
}

DK_COLOR = {
    "bg-primary": ("완료", "최우수"), "bg-success": ("완료", "양호"),
    "bg-warning": ("진행중", "보통"), "bg-danger": ("진행중", "미흡"),
    "bg-secondary": ("완료", "완료"),
}

def dk_login():
    sess = requests.Session()
    sess.headers["User-Agent"] = "Mozilla/5.0"
    sess.get(f"{DK_BASE}/academy")
    sess.post(f"{DK_BASE}/academy/auth/login",
              data={"academy_id": DK_ID, "academy_pwd": DK_PW}, allow_redirects=False)
    if "로그아웃" not in sess.get(f"{DK_BASE}/academy/dashboard").text:
        raise RuntimeError("DK 로그인 실패")
    return sess

def dk_parse(html, td_cls, date_attr):
    soup = BeautifulSoup(html, "html.parser")
    results = {}
    for row in soup.find_all("tr"):
        tds = row.find_all("td")
        if not tds or not tds[0].get_text(strip=True).isdigit(): continue
        for td in row.find_all("td", class_=td_cls):
            sd = td.get(date_attr, ""); sid = td.get("data-student_idx")
            if not sid or sd != TODAY: continue
            idx = int(sid)
            sc = td.get_text(strip=True); sc = int(sc) if sc.isdigit() else None
            status, grade = "시작전", None
            for cls in td.get("class", []):
                if cls in DK_COLOR: status, grade = DK_COLOR[cls]; break
            scores = {k: v for k, v in {"등급": grade, "점수": sc}.items() if v is not None}
            prev = results.get(idx)
            results[idx] = (_higher(prev[0], status) if prev else status,
                            {**(prev[1] if prev else {}), **scores})
    return results

def run_dailykor():
    print(f"\n[매일국어] {TODAY}")
    sess = dk_login()
    print("  로그인 성공")
    ym = TODAY[:7]
    hdrs = {"X-Requested-With": "XMLHttpRequest"}

    mid = dk_parse(sess.post(f"{DK_BASE}/academy/student/ajax_sreport",
        data={"filter_sdate": ym}, headers={**hdrs, "Referer": f"{DK_BASE}/academy/student/sreport"}).text,
        "btn_dailyreport", "data-study_date")
    el = dk_parse(sess.post(f"{DK_BASE}/academy/elementary/ajax_sreport_tab1",
        data={"filter_sdate": ym}, headers={**hdrs, "Referer": f"{DK_BASE}/academy/elementary/sreport"}).text,
        "btn_learning_modal", "data-date_round")

    scraped = {**mid}
    for idx, val in el.items():
        if idx in scraped:
            scraped[idx] = (_higher(scraped[idx][0], val[0]), {**scraped[idx][1], **val[1]})
        else:
            scraped[idx] = val

    for idx, cid in DK_STUDENT_MAP.items():
        status, scores = scraped.get(idx, ("시작전", {}))
        try:
            r = post_auto_log(cid, "dailykor", status, {"scores": scores})
            print(f"  {idx} → {status} [{r.get('result')}]")
        except Exception as e: print(f"  {idx} → 실패: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# 메인
# ══════════════════════════════════════════════════════════════════════════════

def main():
    print(f"\n{'='*50}")
    print(f"  Plantor 학습 자동 인증 ({TODAY})")
    print(f"{'='*50}")
    for name, fn in [("classcard", run_classcard), ("autovoca", run_autovoca), ("dailykor", run_dailykor)]:
        try:
            fn()
        except Exception as e:
            print(f"\n[{name}] 치명적 오류: {e}")
    print(f"\n{'='*50}\n완료\n{'='*50}\n")

if __name__ == "__main__":
    main()
