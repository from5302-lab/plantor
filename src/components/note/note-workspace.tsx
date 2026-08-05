"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import {
  createNote,
  softDeleteNote,
  restoreNote,
  permanentDeleteNote,
  cleanupExpiredTrash,
  subscribeNotes,
  saveNote,
  type NoteDoc,
  type NoteMeta,
} from "@/lib/note/firestore";
import type { JSONContent } from "@tiptap/react";
import { Sidebar } from "./sidebar";
import { Editor } from "./editor";
import { MetaDialog } from "./meta-dialog";
import { NoteHome } from "./note-home";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";

type View = "home" | "editor";

export function NoteWorkspace({ userId }: { userId: string }) {
  const [notes, setNotes] = useState<NoteDoc[]>([]);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [view, setView] = useState<View>("home");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // 사이드바는 기본으로 화면 너비를 따르고(좁으면 닫힘), 사용자가 직접 여닫으면 그 선택을 지킨다.
  // 예전엔 마운트 이펙트에서 setState 로 닫았는데, 열린 상태로 한 번 그려진 뒤 다시 그려졌다.
  const isNarrow = useMediaQuery("(max-width: 720px)");
  const [sidebarPref, setSidebarPref] = useState<boolean | null>(null);
  const sidebarOpen = sidebarPref ?? !isNarrow;

  // Cmd/Ctrl + \ — 사이드바 토글 (에디터 뷰에서만)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setSidebarPref((v) => !(v ?? !isNarrow));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isNarrow]);

  // Planote 로고 클릭 시 홈으로 (navbar에서 발행하는 글로벌 이벤트)
  useEffect(() => {
    const handler = () => {
      setView("home");
      setCurrentId(null);
    };
    window.addEventListener("planote:home", handler);
    return () => window.removeEventListener("planote:home", handler);
  }, []);

  // 노트 목록 구독 + 7일 지난 휴지통 자동 정리
  useEffect(() => {
    return subscribeNotes(
      userId,
      (items) => {
        setNotes(items);
        setNotesLoaded(true);
        cleanupExpiredTrash(items).catch((e) => console.error("[cleanup]", e));
      },
      (err) => {
        setNotesLoaded(true);
        setErrorMsg(`노트 목록을 불러오지 못했어요: ${err.message}`);
      },
    );
  }, [userId]);

  const activeNotes = useMemo(() => notes.filter((n) => !n.deletedAt), [notes]);
  const trashNotes = useMemo(() => notes.filter((n) => !!n.deletedAt), [notes]);

  // 과목별 가장 최근 노트의 meta — 과목 선택 시 나머지 자동 채움용
  const lastMetaBySubject = useMemo<Record<string, NoteMeta>>(() => {
    const map: Record<string, NoteMeta> = {};
    // activeNotes는 updatedAt desc 정렬돼 있으므로 첫 진입이 곧 최근
    for (const n of activeNotes) {
      const m = n.meta;
      if (!m?.subject) continue;
      if (!map[m.subject]) map[m.subject] = m;
    }
    return map;
  }, [activeNotes]);

  // 다이얼로그: 새 노트용 (홈에서 + 클릭) / 편집용 (에디터에서 메타바 클릭)
  const [newNoteDialog, setNewNoteDialog] = useState(false);
  const [pendingSubject, setPendingSubject] = useState<string>("");
  const [metaDialogOpen, setMetaDialogOpen] = useState(false);

  // 저장 debounce
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ title?: string; content?: JSONContent; meta?: NoteMeta; color?: string }>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const queueSave = (noteId: string, patch: { title?: string; content?: JSONContent; meta?: NoteMeta; color?: string }) => {
    pending.current = { ...pending.current, ...patch };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(async () => {
      const payload = pending.current;
      pending.current = {};
      try {
        await saveNote(noteId, payload);
        setSaveStatus("saved");
      } catch (e) {
        console.error("[saveNote]", e);
        const msg = e instanceof Error ? e.message : String(e);
        setErrorMsg(`저장 실패: ${msg}`);
        setSaveStatus("idle");
      }
    }, 1000);
  };

  const active = activeNotes.find((n) => n.id === currentId) ?? null;

  const handleSelect = (id: string) => {
    setCurrentId(id);
    setView("editor");
  };

  // 홈에서 + 또는 사이드바에서 + 클릭 시 다이얼로그 먼저
  // subject 전달 시 다이얼로그에 자동 채움 (과목 필터링 상태에서 진입)
  const handleNewClick = (subject?: string) => {
    setPendingSubject(subject ?? "");
    setNewNoteDialog(true);
  };

  const handleCreateWithMeta = async (meta: NoteMeta) => {
    setNewNoteDialog(false);
    setPendingSubject("");
    try {
      const id = await createNote(userId, meta);
      setCurrentId(id);
      setView("editor");
    } catch (e) {
      console.error("[createNote]", e);
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`노트 생성 실패: ${msg}`);
    }
  };

  const handleSoftDelete = async (id: string) => {
    try {
      await softDeleteNote(id);
    } catch (e) {
      console.error("[softDeleteNote]", e);
      return;
    }
    if (id === currentId) {
      setCurrentId(null);
      setView("home");
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreNote(id);
      setCurrentId(id);
      setView("editor");
    } catch (e) {
      console.error("[restoreNote]", e);
    }
  };

  const handlePermanentDelete = async (id: string) => {
    try {
      await permanentDeleteNote(id);
    } catch (e) {
      console.error("[permanentDeleteNote]", e);
    }
  };

  const handleMetaSave = (newMeta: NoteMeta) => {
    if (!active) return;
    queueSave(active.id, { meta: newMeta });
  };

  const handleColorChange = (id: string, color: string) => {
    // Optimistic: 로컬 state 즉시 반영 → 카드 즉시 색 변경
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, color } : n)));
    // 백그라운드 저장 (debounce 우회, 즉시 호출)
    saveNote(id, { color }).catch((e) => {
      console.error("[saveColor]", e);
    });
  };

  if (errorMsg) {
    return (
      <div className="planote-error">
        {errorMsg}
        <style>{styles}</style>
      </div>
    );
  }

  if (!notesLoaded) {
    return (
      <div className="planote-loading-full">
        노트 목록 불러오는 중…
        <style>{styles}</style>
      </div>
    );
  }

  // 홈 뷰
  if (view === "home") {
    return (
      <>
        <NoteHome
          notes={activeNotes}
          trash={trashNotes}
          onSelect={handleSelect}
          onNew={handleNewClick}
          onSoftDelete={handleSoftDelete}
          onColorChange={handleColorChange}
          onRestore={handleRestore}
          onPermanentDelete={handlePermanentDelete}
        />
        {newNoteDialog && (
          <MetaDialog
            initial={pendingSubject
              ? { ...(lastMetaBySubject[pendingSubject] ?? {}), subject: pendingSubject }
              : {}}
            lastMetaBySubject={lastMetaBySubject}
            onClose={() => {
              setNewNoteDialog(false);
              setPendingSubject("");
            }}
            onSave={handleCreateWithMeta}
          />
        )}
      </>
    );
  }

  // 에디터 뷰
  return (
    <div className="planote-workspace">
      <Sidebar
        notes={activeNotes}
        trash={trashNotes}
        activeId={currentId}
        open={sidebarOpen}
        onClose={() => setSidebarPref(false)}
        onSelect={handleSelect}
        onNew={handleNewClick}
        onSoftDelete={handleSoftDelete}
        onRestore={handleRestore}
        onPermanentDelete={handlePermanentDelete}
      />

      <div className="planote-main">
        {active ? (
          <>
            <div className="planote-save-status">
              {saveStatus === "saving" && "저장 중…"}
              {saveStatus === "saved" && "저장됨"}
            </div>
            <Editor
              key={active.id}
              initialContent={active.content}
              meta={active.meta}
              onChange={(patch) => queueSave(active.id, patch)}
              onMetaClick={() => setMetaDialogOpen(true)}
            />
            {metaDialogOpen && (
              <MetaDialog
                initial={active.meta ?? {}}
                lastMetaBySubject={lastMetaBySubject}
                onClose={() => setMetaDialogOpen(false)}
                onSave={handleMetaSave}
              />
            )}
          </>
        ) : (
          <div className="planote-loading">노트를 불러오는 중…</div>
        )}
      </div>

      {/* 새 노트 다이얼로그 (사이드바의 + 등에서) */}
      {newNoteDialog && (
        <MetaDialog
          initial={pendingSubject
            ? { ...(lastMetaBySubject[pendingSubject] ?? {}), subject: pendingSubject }
            : {}}
          lastMetaBySubject={lastMetaBySubject}
          onClose={() => {
            setNewNoteDialog(false);
            setPendingSubject("");
          }}
          onSave={handleCreateWithMeta}
        />
      )}
      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .planote-workspace {
    display: flex;
    align-items: stretch;
    min-height: calc(100vh - 56px);
  }
  .planote-main {
    flex: 1;
    min-width: 0;
    position: relative;
  }
  .planote-save-status {
    position: absolute;
    top: 18px;
    right: 20px;
    font-size: 12px;
    color: rgba(0,0,0,0.4);
    z-index: 5;
    pointer-events: none;
    user-select: none;
  }
  .planote-loading, .planote-loading-full {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 60vh;
    color: rgba(0,0,0,0.4);
    font-size: 14px;
  }
  .planote-loading-full { height: calc(100vh - 56px); }
  .planote-error {
    max-width: 600px;
    margin: 60px auto;
    padding: 20px 24px;
    background: #fff5f5;
    border: 1px solid #fecaca;
    border-radius: 6px;
    color: #b91c1c;
    font-size: 14px;
    line-height: 1.6;
  }
`;
