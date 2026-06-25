"use client";

import { useState } from "react";
import { ChevronsLeft, FilePlus, Trash2, ChevronRight, ChevronDown, RotateCcw, X } from "lucide-react";
import type { NoteDoc, NoteMeta } from "@/lib/note/firestore";
import { TRASH_RETENTION_MS } from "@/lib/note/firestore";

function noteLabel(n: NoteDoc): string {
  const m: NoteMeta = n.meta ?? {};
  return m.smallUnit || m.middleUnit || m.largeUnit || n.title || "새 노트";
}

type Props = {
  notes: NoteDoc[];
  trash: NoteDoc[];
  activeId: string | null;
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onSoftDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
};

export function Sidebar({
  notes, trash, activeId, open, onClose,
  onSelect, onNew, onSoftDelete, onRestore, onPermanentDelete,
}: Props) {
  const [trashOpen, setTrashOpen] = useState(false);

  const handleSelect = (id: string) => {
    onSelect(id);
    if (window.matchMedia("(max-width: 720px)").matches) onClose();
  };

  const daysLeft = (deletedAt: number) => {
    const left = TRASH_RETENTION_MS - (Date.now() - deletedAt);
    return Math.max(0, Math.ceil(left / (24 * 60 * 60 * 1000)));
  };

  return (
    <>
      {open && <div className="planote-sidebar-overlay" onClick={onClose} />}

      <aside className={`planote-sidebar ${open ? "is-open" : "is-closed"}`}>
        <div className="planote-sidebar-header">
          <button className="planote-new-btn" onClick={onNew}>
            <FilePlus size={14} strokeWidth={1.8} />
            <span>새 노트</span>
          </button>
          <button
            className="planote-collapse-btn"
            onClick={onClose}
            aria-label="사이드바 접기"
            title="사이드바 접기 (⌘\\)"
          >
            <ChevronsLeft size={16} strokeWidth={1.6} color="rgba(0,0,0,0.55)" />
          </button>
        </div>

        <div className="planote-list">
          {notes.length === 0 && (
            <div className="planote-empty">노트가 없습니다</div>
          )}
          {notes.map((n) => (
            <div
              key={n.id}
              className={`planote-item ${n.id === activeId ? "is-active" : ""}`}
              onClick={() => handleSelect(n.id)}
            >
              <div className="planote-item-title">{n.title || "단원명 없음"}</div>
              <button
                className="planote-icon-btn planote-item-action"
                onClick={(e) => {
                  e.stopPropagation();
                  onSoftDelete(n.id);
                }}
                aria-label="휴지통으로 이동"
                title="휴지통으로 이동"
              >
                <Trash2 size={14} strokeWidth={1.6} />
              </button>
            </div>
          ))}
        </div>

        {/* 휴지통 섹션 */}
        <div className="planote-trash">
          <button
            className="planote-trash-header"
            onClick={() => setTrashOpen((v) => !v)}
          >
            {trashOpen
              ? <ChevronDown size={14} strokeWidth={1.6} />
              : <ChevronRight size={14} strokeWidth={1.6} />}
            <Trash2 size={14} strokeWidth={1.6} />
            <span>휴지통</span>
            {trash.length > 0 && <span className="planote-trash-count">{trash.length}</span>}
          </button>
          {trashOpen && (
            <div className="planote-trash-list">
              {trash.length === 0 && (
                <div className="planote-empty">비어있어요</div>
              )}
              {trash.map((n) => (
                <div key={n.id} className="planote-trash-item">
                  <div className="planote-trash-item-main">
                    <div className="planote-item-title">{noteLabel(n)}</div>
                    <div className="planote-trash-meta">
                      {n.deletedAt ? `${daysLeft(n.deletedAt)}일 남음` : ""}
                    </div>
                  </div>
                  <button
                    className="planote-icon-btn"
                    onClick={() => onRestore(n.id)}
                    aria-label="복원"
                    title="복원"
                  >
                    <RotateCcw size={13} strokeWidth={1.6} />
                  </button>
                  <button
                    className="planote-icon-btn"
                    onClick={() => {
                      if (confirm("이 노트를 영구 삭제할까요? 되돌릴 수 없습니다.")) {
                        onPermanentDelete(n.id);
                      }
                    }}
                    aria-label="영구 삭제"
                    title="영구 삭제"
                  >
                    <X size={14} strokeWidth={1.8} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
      <style>{styles}</style>
    </>
  );
}

const styles = `
  .planote-sidebar {
    width: 224px;
    flex-shrink: 0;
    height: calc(100vh - 56px);
    border-right: 1px solid rgba(0,0,0,0.06);
    background: rgb(251,251,250);
    display: flex;
    flex-direction: column;
    padding: 8px 0;
    overflow: hidden;
    position: sticky;
    top: 56px;
    transition: margin-left 0.18s ease, transform 0.18s ease;
  }
  .planote-sidebar.is-closed { margin-left: -224px; }
  .planote-sidebar-overlay { display: none; }

  .planote-sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 6px 0 4px;
    margin-bottom: 4px;
  }
  .planote-new-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border: none;
    background: transparent;
    color: rgba(0,0,0,0.65);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border-radius: 4px;
    text-align: left;
  }
  .planote-new-btn:hover { background: rgba(0,0,0,0.05); }
  .planote-collapse-btn {
    width: 26px;
    height: 26px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .planote-collapse-btn:hover { background: rgba(0,0,0,0.05); }

  .planote-list { flex: 1; overflow-y: auto; padding: 0 4px; }
  .planote-empty { padding: 8px 12px; color: rgba(0,0,0,0.35); font-size: 12px; }

  .planote-item {
    display: flex; align-items: center; gap: 4px;
    padding: 5px 8px; margin: 1px 4px;
    border-radius: 4px; cursor: pointer;
    font-size: 14px; color: rgba(0,0,0,0.75);
  }
  .planote-item:hover { background: rgba(0,0,0,0.05); }
  .planote-item.is-active { background: rgba(0,0,0,0.07); color: rgba(0,0,0,0.95); }
  .planote-item-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .planote-icon-btn {
    flex-shrink: 0;
    width: 24px; height: 24px;
    border: none; background: transparent;
    color: rgba(0,0,0,0.45);
    cursor: pointer; border-radius: 3px;
    display: flex; align-items: center; justify-content: center;
  }
  .planote-icon-btn:hover { background: rgba(0,0,0,0.08); color: rgba(0,0,0,0.85); }
  .planote-item-action { opacity: 0; }
  .planote-item:hover .planote-item-action { opacity: 1; }

  /* 휴지통 */
  .planote-trash {
    border-top: 1px solid rgba(0,0,0,0.06);
    margin-top: 6px;
    padding: 6px 4px 4px;
  }
  .planote-trash-header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 4px;
    color: rgba(0,0,0,0.6);
    font-size: 13px;
    font-weight: 500;
  }
  .planote-trash-header:hover { background: rgba(0,0,0,0.05); }
  .planote-trash-header > span:not(.planote-trash-count) { flex: 1; text-align: left; }
  .planote-trash-count {
    background: rgba(0,0,0,0.08);
    color: rgba(0,0,0,0.55);
    font-size: 11px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 8px;
    min-width: 18px;
    text-align: center;
  }
  .planote-trash-list { max-height: 240px; overflow-y: auto; padding-top: 2px; }
  .planote-trash-item {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 5px 8px;
    margin: 1px 0;
    border-radius: 4px;
    font-size: 13px;
    color: rgba(0,0,0,0.55);
  }
  .planote-trash-item:hover { background: rgba(0,0,0,0.04); }
  .planote-trash-item-main { flex: 1; min-width: 0; }
  .planote-trash-meta { font-size: 11px; color: rgba(0,0,0,0.4); margin-top: 1px; }

  @media (max-width: 720px) {
    .planote-sidebar {
      position: fixed;
      left: 0;
      top: 56px;
      height: calc(100vh - 56px);
      z-index: 100;
      box-shadow: 4px 0 16px rgba(0,0,0,0.12);
      transition: transform 0.18s ease;
      margin-left: 0;
    }
    .planote-sidebar.is-closed { transform: translateX(-100%); }
    .planote-sidebar.is-open { transform: translateX(0); }
    .planote-sidebar-overlay {
      display: block;
      position: fixed;
      inset: 56px 0 0 0;
      background: rgba(0,0,0,0.3);
      z-index: 99;
    }
  }
`;
