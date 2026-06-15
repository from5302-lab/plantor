"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import AnalysisView from "@/components/m2gosa/AnalysisView";
import type { PassageAnalysis } from "@/lib/m2gosa/types";

const C = { ink: "#1f2937", sub: "#4b5563", teal: "#0f766e", bg: "#f6f5f4" };

export default function M2GosaViewPage() {
  const [data, setData] = useState<PassageAnalysis | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ok">("loading");
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
      setStatus("error");
      setErrMsg("잘못된 링크입니다.");
      return;
    }
    const getSheet = httpsCallable<{ id: string }, PassageAnalysis>(
      functions,
      "getM2gosaSheet",
    );
    getSheet({ id })
      .then((res) => {
        setData(res.data);
        setStatus("ok");
      })
      .catch((e) => {
        setStatus("error");
        setErrMsg(e instanceof Error ? e.message : "분석지를 불러올 수 없습니다.");
      });
  }, []);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "20px 12px 60px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        {status === "loading" && (
          <p style={{ textAlign: "center", color: C.sub, fontSize: 14, marginTop: 40 }}>
            분석지를 불러오는 중…
          </p>
        )}
        {status === "error" && (
          <div style={{ textAlign: "center", marginTop: 60 }}>
            <p style={{ color: C.ink, fontSize: 16, fontWeight: 600 }}>{errMsg}</p>
            <a href="/m2gosa" style={{ color: C.teal, fontSize: 14 }}>
              새 분석 만들기 →
            </a>
          </div>
        )}
        {status === "ok" && data && (
          <>
            <AnalysisView data={data} />
            <div style={{ textAlign: "center", marginTop: 24 }}>
              <a
                href="/m2gosa"
                style={{
                  display: "inline-block",
                  background: C.teal,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                  borderRadius: 8,
                  padding: "11px 22px",
                }}
              >
                나도 영어 지문 분석해보기 →
              </a>
              <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>
                영어 지문을 붙여넣으면 구문분석·해석·어휘 자료가 자동으로 만들어져요
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
