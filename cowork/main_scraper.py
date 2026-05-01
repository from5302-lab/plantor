#!/usr/bin/env python3
"""
Plantor 학습 자동 인증 통합 스크래퍼
Cowork Scheduled Task로 매일 평일 오후 9시 실행

서비스별 독립 실행 — 하나 실패해도 나머지 계속 진행
"""

from datetime import date

TODAY = date.today().strftime("%Y-%m-%d")

SCRAPERS = [
    ("classcard", "scrapers.classcard"),
    ("autovoca",  "scrapers.autovoca"),
    ("dailykor",  "scrapers.dailykor"),
]


def main():
    print(f"\n{'='*50}")
    print(f"  Plantor 학습 자동 인증 ({TODAY})")
    print(f"{'='*50}")

    results = {}
    for name, module_path in SCRAPERS:
        try:
            import importlib
            mod = importlib.import_module(module_path)
            mod.run()
            results[name] = "OK"
        except Exception as e:
            print(f"\n[{name}] 실패: {e}")
            results[name] = f"FAIL: {e}"

    print(f"\n{'='*50}")
    for name, status in results.items():
        print(f"  {name}: {status}")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()
