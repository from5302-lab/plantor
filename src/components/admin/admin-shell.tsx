"use client";

import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { ADMIN_EMAIL, SERVICES, SITE } from "@/data/site";
import { formatDateTime, formatWon } from "@/lib/format";
import { buildPaymentGuide } from "@/lib/messages";
import { convertSignupToFamily } from "@/lib/families";

type SignupStatus = "pending" | "confirmed" | "rejected";

type Signup = {
  id: string;
  parentName: string;
  phone: string;
  childName: string;
  childGrade: string;
  selectedServices: string[];
  estimatedMonthly: number;
  status: SignupStatus;
  createdAt: Date | null;
  convertedFamilyId: string | null;
};

type Filter = SignupStatus | "all";

export function AdminShell() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
  }, []);

  if (!authReady) {
    return <CenterMsg>인증 확인 중…</CenterMsg>;
  }

  if (!user) {
    return <LoginGate />;
  }

  if (user.email !== ADMIN_EMAIL) {
    return (
      <CenterMsg>
        <p className="mb-4">
          이 계정({user.email})은 운영자가 아닙니다.
        </p>
        <button
          onClick={() => signOut(auth)}
          className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          로그아웃
        </button>
      </CenterMsg>
    );
  }

  return <Dashboard user={user} />;
}

// ─────────────────────────────────────────────────────────
// Login Gate
// ─────────────────────────────────────────────────────────
function LoginGate() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "로그인 중 오류가 발생했습니다."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-3xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="text-center">
          <div className="mb-3 text-4xl">🛡️</div>
          <h1 className="text-2xl font-bold">Plantor 운영자</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            운영자 계정으로 로그인해 주세요.
          </p>
        </div>
        <div className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          />
        </div>
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-emerald-600 py-3 font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {submitting ? "로그인 중…" : "로그인"}
        </button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────
function Dashboard({ user }: { user: User }) {
  const [signups, setSignups] = useState<Signup[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "signups"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Signup[] = snap.docs.map((d) => {
          const data = d.data();
          const createdAt =
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate()
              : null;
          return {
            id: d.id,
            parentName: data.parentName ?? "",
            phone: data.phone ?? "",
            childName: data.childName ?? "",
            childGrade: data.childGrade ?? "",
            selectedServices: data.selectedServices ?? [],
            estimatedMonthly: data.estimatedMonthly ?? 0,
            status: (data.status ?? "pending") as SignupStatus,
            createdAt,
            convertedFamilyId: data.convertedFamilyId ?? null,
          };
        });
        setSignups(rows);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  const filtered =
    filter === "all" ? signups : signups.filter((s) => s.status === filter);

  const counts = {
    pending: signups.filter((s) => s.status === "pending").length,
    confirmed: signups.filter((s) => s.status === "confirmed").length,
    rejected: signups.filter((s) => s.status === "rejected").length,
    all: signups.length,
  };

  async function changeStatus(id: string, status: SignupStatus) {
    try {
      await updateDoc(doc(db, "signups", id), { status });
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "상태 변경 중 오류가 발생했습니다."
      );
    }
  }

  async function approveAsFamily(signup: Signup) {
    if (signup.convertedFamilyId) {
      alert(`이미 가족으로 등록되어 있습니다 (familyId: ${signup.convertedFamilyId})`);
      return;
    }
    try {
      const result = await convertSignupToFamily(signup);
      alert(
        `✅ 가족 등록 완료\n` +
          `familyId: ${result.familyId}\n` +
          `childId: ${result.childId}\n` +
          `subscriptions: ${result.subscriptionIds.length}건`
      );
    } catch (err) {
      alert(
        err instanceof Error
          ? `가족 등록 실패: ${err.message}`
          : "가족 등록 중 오류가 발생했습니다."
      );
    }
  }

  function exportCsv() {
    const header = [
      "신청일",
      "부모",
      "연락처",
      "자녀",
      "학년",
      "서비스",
      "월결제",
      "상태",
    ];
    const rows = signups.map((s) => [
      s.createdAt ? s.createdAt.toISOString() : "",
      s.parentName,
      s.phone,
      s.childName,
      s.childGrade,
      s.selectedServices.join("|"),
      String(s.estimatedMonthly),
      s.status,
    ]);
    const csv =
      "\uFEFF" +
      [header, ...rows]
        .map((row) =>
          row
            .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
            .join(",")
        )
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plantor-signups-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛡️</span>
            <div>
              <h1 className="text-lg font-bold leading-none">Plantor 운영자</h1>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {user.email}
              </p>
            </div>
          </div>
          <button
            onClick={() => signOut(auth)}
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            로그아웃
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* 필터 + CSV */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {(["pending", "confirmed", "rejected", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                filter === f
                  ? "bg-emerald-600 text-white"
                  : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {labelOf(f)} · {counts[f]}
            </button>
          ))}
          <div className="ml-auto">
            <button
              onClick={exportCsv}
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              📥 CSV 내보내기
            </button>
          </div>
        </div>

        {SITE.bank.name === "[은행명]" && (
          <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            ⚠️ <strong>계좌 정보가 비어 있습니다.</strong>{" "}
            <code className="font-mono">src/data/site.ts</code> 의{" "}
            <code className="font-mono">SITE.bank</code> 를 실제 계좌로 채우면
            메시지 복사 시 자동으로 들어갑니다.
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            데이터 로드 오류: {error}
          </div>
        )}

        {loading ? (
          <CenterMsg>불러오는 중…</CenterMsg>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-300 bg-white py-16 text-center text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
            {filter === "pending"
              ? "🌱 새로운 신청이 없습니다."
              : "해당 상태의 신청이 없습니다."}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((s) => (
              <SignupRow
                key={s.id}
                signup={s}
                onChangeStatus={changeStatus}
                onApproveAsFamily={approveAsFamily}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Signup Row
// ─────────────────────────────────────────────────────────
function SignupRow({
  signup,
  onChangeStatus,
  onApproveAsFamily,
}: {
  signup: Signup;
  onChangeStatus: (id: string, status: SignupStatus) => void;
  onApproveAsFamily: (signup: Signup) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyMessage() {
    const msg = buildPaymentGuide({
      parentName: signup.parentName,
      childName: signup.childName,
      childGrade: signup.childGrade,
      selectedServices: signup.selectedServices,
    });
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      alert("클립보드 복사 실패. 수동으로 복사해 주세요:\n\n" + msg);
    }
  }

  const statusBadge: Record<SignupStatus, string> = {
    pending:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    confirmed:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    rejected:
      "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-zinc-900 dark:text-white">
              {signup.parentName}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[signup.status]}`}
            >
              {labelOf(signup.status)}
            </span>
            {signup.convertedFamilyId && (
              <span
                className="rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-xs text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                title={`familyId: ${signup.convertedFamilyId}`}
              >
                👨‍👩‍👧 가족 등록됨
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {formatDateTime(signup.createdAt)} · 📞 {signup.phone}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">예상 월</div>
          <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">
            {formatWon(signup.estimatedMonthly)}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-zinc-50 p-4 text-sm dark:bg-zinc-800/50">
        <div>
          <strong>{signup.childName}</strong>
          <span className="ml-2 text-zinc-500 dark:text-zinc-400">
            {signup.childGrade}
          </span>
        </div>
        <ul className="mt-2 space-y-1">
          {signup.selectedServices.map((slug) => {
            const svc = SERVICES.find((s) => s.slug === slug);
            return (
              <li key={slug} className="text-zinc-700 dark:text-zinc-300">
                · {svc ? `${svc.emoji} ${svc.name} — ${svc.priceLabel}` : slug}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={copyMessage}
          className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {copied ? "✅ 복사됨" : "📋 카톡 메시지 복사"}
        </button>
        {!signup.convertedFamilyId && (
          <button
            onClick={() => onApproveAsFamily(signup)}
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700"
          >
            ✅ 입금 확인 + 가족 등록
          </button>
        )}
        {signup.convertedFamilyId && signup.status !== "confirmed" && (
          <button
            onClick={() => onChangeStatus(signup.id, "confirmed")}
            className="rounded-full border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
          >
            상태만 확인으로 표시
          </button>
        )}
        {signup.status !== "rejected" && (
          <button
            onClick={() => {
              if (confirm("이 신청을 거절하시겠습니까?")) {
                onChangeStatus(signup.id, "rejected");
              }
            }}
            className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-red-50 hover:text-red-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
          >
            ❌ 거절
          </button>
        )}
        {signup.status !== "pending" && (
          <button
            onClick={() => onChangeStatus(signup.id, "pending")}
            className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-500 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            ↩ 대기로 되돌리기
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────
function CenterMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 text-center text-zinc-500 dark:text-zinc-400">
      <div>{children}</div>
    </div>
  );
}

function labelOf(s: Filter): string {
  return {
    pending: "대기",
    confirmed: "확인",
    rejected: "거절",
    all: "전체",
  }[s];
}
