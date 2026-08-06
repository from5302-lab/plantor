"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { CenterMsg } from "@/components/ui/center-msg";
import { AccountDashboard } from "@/components/account/account-shell";
import { LearnDashboard } from "@/components/learn/learn-dashboard";
import { ProfileShell } from "@/components/profile/profile-shell";

/** 어드민 전용 읽기전용 미리보기 — 회원목록 이름 클릭 시 새창으로 학부모/학생 화면을 본다. */
export function AdminPreviewShell() {
  const { user, role, loading } = useAuth();
  const params = useSearchParams();
  const type = params.get("type");
  const uid = params.get("uid") ?? "";
  const childId = params.get("childId") ?? "";
  const loginId = params.get("loginId") ?? "";
  const name = params.get("name") ?? "";

  // 학부모 미리보기를 loginId로 호출한 경우: plantor_id → uid 해석 (직강 전용 학부모 등)
  const [resolvedUid, setResolvedUid] = useState<string | null>(uid || null);
  const [resolving, setResolving] = useState(type === "parent" && !uid && !!loginId);

  useEffect(() => {
    if (type !== "parent" || uid || !loginId) return;
    let cancelled = false;
    getDocs(query(collection(db, "users"), where("plantor_id", "==", loginId.toLowerCase())))
      .then((snap) => { if (!cancelled) { setResolvedUid(snap.empty ? "" : snap.docs[0].id); setResolving(false); } })
      .catch(() => { if (!cancelled) { setResolvedUid(""); setResolving(false); } });
    return () => { cancelled = true; };
  }, [type, uid, loginId]);

  if (loading) return <Frame name={name}><CenterMsg>로딩 중…</CenterMsg></Frame>;
  if (!user || role !== "admin") return <Frame name={name}><CenterMsg>어드민만 접근할 수 있습니다.</CenterMsg></Frame>;

  let content: ReactNode;
  if (type === "parent") {
    if (resolving) content = <CenterMsg>로딩 중…</CenterMsg>;
    else if (resolvedUid) content = <AccountDashboard userId={resolvedUid} fallbackName={name || null} readOnly previewUid={resolvedUid} />;
    else if (loginId) content = <AccountDashboard userId="" fallbackName={name || null} readOnly previewLoginId={loginId} />; // 계정 없는 직강 학부모
    else content = <CenterMsg>계정을 찾을 수 없습니다.</CenterMsg>;
  } else if (type === "feed" && childId) {
    // 학생이 로그인하면 보는 프로필 화면(카드 + 탭). childId 로 붙으므로 loginId 경로는 없다.
    content = <ProfileShell previewChildId={childId} previewName={name || undefined} />;
  } else if (type === "learn" && (childId || loginId)) {
    content = (
      <LearnDashboard
        userId={childId || loginId}
        userName={name || null}
        readOnly
        previewChildId={childId || undefined}
        previewLoginId={loginId || undefined}
      />
    );
  } else {
    content = <CenterMsg>잘못된 미리보기 주소입니다.</CenterMsg>;
  }

  return <Frame name={name}>{content}</Frame>;
}

function Frame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <>
      <div
        style={{
          position: "sticky", top: 0, zIndex: 1000,
          background: "#1f2937", color: "#fff",
          padding: "8px 16px", fontSize: 13, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 8,
        }}
      >
        🔍 미리보기 — 읽기전용{name ? ` · ${name}` : ""}
        <span style={{ opacity: 0.7, fontWeight: 400 }}>(어드민 전용 · 데이터 변경 불가)</span>
      </div>
      {children}
    </>
  );
}
