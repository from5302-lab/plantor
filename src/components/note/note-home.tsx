"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Search,
  Plus,
  LayoutGrid,
  List as ListIcon,
  ChevronDown,
  X,
  MoreVertical,
  Trash2,
  RotateCcw,
} from "lucide-react";
import type { NoteDoc, NoteMeta } from "@/lib/note/firestore";
import { TRASH_RETENTION_MS } from "@/lib/note/firestore";
import { SUBJECTS } from "@/lib/note/textbook-catalog";

type ViewMode = "grid" | "list";
type SortMode = "recent" | "oldest" | "subject";
type ListMode = SortMode | "trash";

type Props = {
  notes: NoteDoc[];
  trash: NoteDoc[];
  onSelect: (id: string) => void;
  onNew: (subject?: string) => void;
  onSoftDelete: (id: string) => void;
  onColorChange: (id: string, color: string) => void;
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
};

// 카드 배경 팔레트 (white + 6 pastel)
const COLOR_PALETTE: { name: string; value: string }[] = [
  { name: "기본", value: "#ffffff" },
  { name: "분홍", value: "#fef2f2" },
  { name: "노랑", value: "#fef9c3" },
  { name: "초록", value: "#dcfce7" },
  { name: "파랑", value: "#dbeafe" },
  { name: "보라", value: "#f3e8ff" },
  { name: "회색", value: "#f5f5f4" },
];

function noteLabel(n: NoteDoc): string {
  const m: NoteMeta = n.meta ?? {};
  return m.smallUnit || m.middleUnit || m.largeUnit || n.title || "새 노트";
}

function gradeSubjectBadge(n: NoteDoc): string {
  const m: NoteMeta = n.meta ?? {};
  return [m.grade, m.subject].filter(Boolean).join(" · ");
}

function publisherBadge(n: NoteDoc): string | null {
  return n.meta?.publisher ?? null;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

export function NoteHome({
  notes, trash, onSelect, onNew, onSoftDelete, onColorChange,
  onRestore, onPermanentDelete,
}: Props) {
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("grid");
  const [listMode, setListMode] = useState<ListMode>("recent");
  const [sortOpen, setSortOpen] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string>("");
  const [subjectOpen, setSubjectOpen] = useState(false);

  const isTrash = listMode === "trash";
  const sort: SortMode = isTrash ? "recent" : (listMode as SortMode);
  const baseList = isTrash ? trash : notes;

  // 메뉴 외부 클릭 감지하여 닫음
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".card-menu") && !target.closest(".card-menu-btn")) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpenId]);

  const filtered = useMemo(() => {
    let result = baseList;
    if (subjectFilter) {
      result = result.filter((n) => n.meta?.subject === subjectFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((n) => {
        const label = noteLabel(n).toLowerCase();
        const badge = gradeSubjectBadge(n).toLowerCase();
        return label.includes(q) || badge.includes(q);
      });
    }
    const sorted = [...result];
    if (isTrash) {
      // 휴지통은 삭제 시각 최신순
      sorted.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
    } else if (sort === "recent") sorted.sort((a, b) => b.updatedAt - a.updatedAt);
    else if (sort === "oldest") sorted.sort((a, b) => a.updatedAt - b.updatedAt);
    else if (sort === "subject") {
      const idx = (s?: string) => {
        const i = (SUBJECTS as readonly string[]).indexOf(s ?? "");
        return i === -1 ? SUBJECTS.length : i;
      };
      sorted.sort((a, b) => {
        const d = idx(a.meta?.subject) - idx(b.meta?.subject);
        return d !== 0 ? d : b.updatedAt - a.updatedAt;
      });
    }
    return sorted;
  }, [baseList, search, sort, isTrash, subjectFilter]);

  const dropdownLabel = isTrash
    ? `휴지통${trash.length > 0 ? ` (${trash.length})` : ""}`
    : { recent: "최신 항목", oldest: "오래된 순", subject: "과목순" }[sort];

  const daysLeft = (deletedAt?: number) => {
    if (!deletedAt) return 0;
    const left = TRASH_RETENTION_MS - (Date.now() - deletedAt);
    return Math.max(0, Math.ceil(left / (24 * 60 * 60 * 1000)));
  };

  return (
    <div className="planote-home">
      <div className="home-controls">
        <div className="ctl-left">
          {searchOpen ? (
            <div className="ctl-search-open">
              <Search size={14} strokeWidth={1.8} color="rgba(0,0,0,0.5)" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="검색"
              />
              <button
                className="ctl-icon-btn"
                onClick={() => {
                  setSearch("");
                  setSearchOpen(false);
                }}
                aria-label="검색 닫기"
              >
                <X size={14} strokeWidth={1.8} />
              </button>
            </div>
          ) : (
            <button
              className="ctl-icon-btn"
              onClick={() => setSearchOpen(true)}
              aria-label="검색"
            >
              <Search size={16} strokeWidth={1.8} />
            </button>
          )}

          <div className="ctl-view">
            <button
              className={`ctl-view-btn ${view === "grid" ? "is-active" : ""}`}
              onClick={() => setView("grid")}
              aria-label="격자 보기"
            >
              <LayoutGrid size={14} strokeWidth={1.8} />
            </button>
            <button
              className={`ctl-view-btn ${view === "list" ? "is-active" : ""}`}
              onClick={() => setView("list")}
              aria-label="리스트 보기"
            >
              <ListIcon size={14} strokeWidth={1.8} />
            </button>
          </div>

          {!isTrash && (
            <div className="ctl-sort-wrap">
              <button
                className="ctl-sort-btn"
                onClick={() => setSubjectOpen((v) => !v)}
              >
                {subjectFilter || "전체 과목"}
                <ChevronDown size={12} strokeWidth={1.8} />
              </button>
              {subjectOpen && (
                <>
                  <div className="ctl-sort-overlay" onClick={() => setSubjectOpen(false)} />
                  <div className="ctl-sort-menu">
                    <button
                      className={`ctl-sort-item ${!subjectFilter ? "is-active" : ""}`}
                      onClick={() => {
                        setSubjectFilter("");
                        setSubjectOpen(false);
                      }}
                    >
                      전체 과목
                    </button>
                    {SUBJECTS.map((s) => (
                      <button
                        key={s}
                        className={`ctl-sort-item ${subjectFilter === s ? "is-active" : ""}`}
                        onClick={() => {
                          setSubjectFilter(s);
                          setSubjectOpen(false);
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="ctl-sort-wrap">
            <button
              className="ctl-sort-btn"
              onClick={() => setSortOpen((v) => !v)}
            >
              {dropdownLabel}
              <ChevronDown size={12} strokeWidth={1.8} />
            </button>
            {sortOpen && (
              <>
                <div className="ctl-sort-overlay" onClick={() => setSortOpen(false)} />
                <div className="ctl-sort-menu">
                  {(["recent", "oldest", "subject"] as SortMode[]).map((s) => (
                    <button
                      key={s}
                      className={`ctl-sort-item ${!isTrash && sort === s ? "is-active" : ""}`}
                      onClick={() => {
                        setListMode(s);
                        setSortOpen(false);
                      }}
                    >
                      {s === "recent" ? "최신 항목" : s === "oldest" ? "오래된 순" : "과목순"}
                    </button>
                  ))}
                  <div className="ctl-sort-divider" />
                  <button
                    className={`ctl-sort-item ${isTrash ? "is-active" : ""}`}
                    onClick={() => {
                      setListMode("trash");
                      setSortOpen(false);
                    }}
                  >
                    <Trash2 size={13} strokeWidth={1.8} />
                    <span>휴지통{trash.length > 0 ? ` (${trash.length})` : ""}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {!isTrash && (
          <button className="ctl-new-btn" onClick={() => onNew(subjectFilter || undefined)}>
            <Plus size={14} strokeWidth={2} />
            <span>새로 만들기</span>
          </button>
        )}
      </div>


      <div className={`note-grid view-${view}`}>
        {filtered.map((n) => {
          const bg = n.color ?? "#ffffff";
          const badge = gradeSubjectBadge(n);
          const pub = publisherBadge(n);
          const dleft = daysLeft(n.deletedAt);
          return (
            <div
              key={n.id}
              className={`note-card ${isTrash ? "is-trash" : ""}`}
              style={{ background: bg }}
              onClick={() => {
                if (!isTrash) onSelect(n.id);
              }}
            >
              <div className="card-top">
                <div className="card-badges">
                  {badge && <span className="card-badge">{badge}</span>}
                  {pub && <span className="card-badge">{pub}</span>}
                  {isTrash && (
                    <span className="card-badge card-badge-trash">{dleft}일 남음</span>
                  )}
                </div>
                <button
                  className="card-menu-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenId(menuOpenId === n.id ? null : n.id);
                  }}
                  aria-label="메뉴"
                >
                  <MoreVertical size={16} strokeWidth={1.8} />
                </button>
                {menuOpenId === n.id && (
                  <div className={`card-menu ${isTrash ? "is-trash" : ""}`} onClick={(e) => e.stopPropagation()}>
                    {isTrash ? (
                      <>
                        <button
                          className="menu-item"
                          onClick={() => {
                            onRestore(n.id);
                            setMenuOpenId(null);
                          }}
                        >
                          <RotateCcw size={14} strokeWidth={1.6} />
                          <span>복원</span>
                        </button>
                        <div className="menu-divider" />
                        <button
                          className="menu-item menu-danger"
                          onClick={() => {
                            if (confirm("이 노트를 영구 삭제할까요? 되돌릴 수 없습니다.")) {
                              onPermanentDelete(n.id);
                            }
                            setMenuOpenId(null);
                          }}
                        >
                          <Trash2 size={14} strokeWidth={1.6} />
                          <span>삭제</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="menu-section-label">색상</div>
                        <div className="menu-colors">
                          {COLOR_PALETTE.map((c) => (
                            <button
                              key={c.value}
                              className={`color-dot ${(n.color ?? "#ffffff") === c.value ? "is-active" : ""}`}
                              style={{ background: c.value }}
                              onClick={() => {
                                onColorChange(n.id, c.value);
                                setMenuOpenId(null);
                              }}
                              title={c.name}
                              aria-label={`색상 ${c.name}`}
                            />
                          ))}
                        </div>
                        <div className="menu-divider" />
                        <button
                          className="menu-item menu-danger"
                          onClick={() => {
                            if (confirm("이 노트를 휴지통으로 이동할까요?")) {
                              onSoftDelete(n.id);
                            }
                            setMenuOpenId(null);
                          }}
                        >
                          <Trash2 size={14} strokeWidth={1.6} />
                          <span>휴지통으로</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="card-body">
                <h3 className="card-title">{noteLabel(n)}</h3>
                <div className="card-meta">{formatDate(n.updatedAt)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="home-empty">
          {isTrash
            ? (search ? "검색 결과가 없습니다" : "휴지통이 비어있어요")
            : (search ? "검색 결과가 없습니다" : "")}
        </div>
      )}

      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .planote-home {
    max-width: 1200px;
    margin: 0 auto;
    padding: 32px 32px 80px;
    font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  }
  .home-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }
  .ctl-left { display: flex; align-items: center; gap: 8px; flex: 1; flex-wrap: wrap; }
  .ctl-icon-btn {
    width: 36px; height: 36px;
    border-radius: 50%;
    border: 1px solid rgba(0,0,0,0.08);
    background: #fff;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: rgba(0,0,0,0.65);
  }
  .ctl-icon-btn:hover { background: rgba(0,0,0,0.04); }
  .ctl-search-open {
    display: flex; align-items: center; gap: 6px;
    height: 36px;
    border: 1px solid rgba(0,0,0,0.12);
    background: #fff;
    border-radius: 18px;
    padding: 0 12px;
    min-width: 220px;
  }
  .ctl-search-open input {
    flex: 1; border: none; outline: none; background: transparent;
    font-size: 14px; font-family: inherit; color: rgba(0,0,0,0.9);
  }
  .ctl-search-open .ctl-icon-btn { width: 24px; height: 24px; border: none; background: transparent; }
  .ctl-view {
    display: inline-flex;
    border: 1px solid rgba(0,0,0,0.08);
    background: rgba(0,0,0,0.04);
    border-radius: 18px;
    padding: 2px;
    height: 36px;
  }
  .ctl-view-btn {
    border: none; background: transparent;
    width: 36px; height: 32px;
    border-radius: 16px; cursor: pointer;
    color: rgba(0,0,0,0.55);
    display: flex; align-items: center; justify-content: center;
  }
  .ctl-view-btn.is-active {
    background: #fff; color: rgba(0,0,0,0.9);
    box-shadow: 0 1px 2px rgba(0,0,0,0.08);
  }
  .ctl-sort-wrap { position: relative; }
  .ctl-sort-btn {
    display: inline-flex; align-items: center; gap: 4px;
    height: 36px; padding: 0 14px;
    border-radius: 18px;
    border: 1px solid rgba(0,0,0,0.08);
    background: #fff; cursor: pointer;
    font-size: 13px; font-weight: 500; color: rgba(0,0,0,0.75);
    font-family: inherit;
  }
  .ctl-sort-btn:hover { background: rgba(0,0,0,0.04); }
  .ctl-sort-overlay { position: fixed; inset: 0; z-index: 30; }
  .ctl-sort-menu {
    position: absolute; top: calc(100% + 4px); left: 0; z-index: 31;
    min-width: 140px; background: #fff;
    border: 1px solid rgba(0,0,0,0.08);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    padding: 4px;
  }
  .ctl-sort-item {
    display: block; width: 100%; text-align: left;
    border: none; background: transparent;
    padding: 8px 12px; border-radius: 4px;
    font-size: 13px; color: rgba(0,0,0,0.8);
    cursor: pointer; font-family: inherit;
  }
  .ctl-sort-item {
    display: flex; align-items: center; gap: 8px;
  }
  .ctl-sort-item:hover { background: rgba(0,0,0,0.05); }
  .ctl-sort-item.is-active { background: rgba(0,0,0,0.05); font-weight: 600; }
  .ctl-sort-divider { height: 1px; background: rgba(0,0,0,0.06); margin: 4px 0; }

  .card-badge-trash {
    background: #fef2f2;
    color: #b91c1c;
  }
  .note-card.is-trash { opacity: 0.85; cursor: default; }
  .note-card.is-trash:hover { transform: none; box-shadow: 0 4px 14px rgba(0,0,0,0.04); }

  .ctl-new-btn {
    display: inline-flex; align-items: center; gap: 6px;
    height: 36px; padding: 0 16px;
    border-radius: 18px;
    border: 1px solid rgba(0,0,0,0.12);
    background: #fff; color: rgba(0,0,0,0.85);
    cursor: pointer; font-size: 13px; font-weight: 500;
    font-family: inherit;
  }
  .ctl-new-btn:hover { background: rgba(0,0,0,0.04); }

  .note-grid { display: grid; gap: 16px; }
  .note-grid.view-grid { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  .note-grid.view-list { grid-template-columns: 1fr; }

  .note-card {
    position: relative;
    text-align: left;
    border: 1px solid rgba(0,0,0,0.08);
    background: #fff;
    color: rgba(0,0,0,0.88);
    border-radius: 12px;
    padding: 16px;
    cursor: pointer;
    min-height: 160px;
    display: flex;
    flex-direction: column;
    font-family: inherit;
    transition: transform 0.1s ease, box-shadow 0.1s ease, border-color 0.1s ease;
  }
  .note-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 14px rgba(0,0,0,0.06);
    border-color: rgba(0,0,0,0.18);
  }

  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 16px;
    min-height: 22px;
  }
  .card-badges {
    display: flex; flex-wrap: wrap; gap: 4px;
  }
  .card-badge {
    font-size: 11px;
    font-weight: 500;
    color: rgba(0,0,0,0.55);
    background: rgba(0,0,0,0.05);
    padding: 2px 7px;
    border-radius: 10px;
    white-space: nowrap;
  }
  .card-menu-btn {
    flex-shrink: 0;
    width: 24px; height: 24px;
    border: none; background: transparent;
    cursor: pointer; border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
    color: rgba(0,0,0,0.4);
    opacity: 0;
  }
  .note-card:hover .card-menu-btn { opacity: 1; }
  .card-menu-btn:hover { background: rgba(0,0,0,0.07); color: rgba(0,0,0,0.75); }

  .card-menu-overlay { position: fixed; inset: 0; z-index: 40; }
  .card-menu {
    position: absolute; top: 36px; right: 12px;
    z-index: 41;
    min-width: 200px;
    background: #fff;
    border: 1px solid rgba(0,0,0,0.08);
    border-radius: 8px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.12);
    padding: 8px;
  }
  .card-menu.is-trash { min-width: 120px; }
  .menu-section-label {
    font-size: 11px;
    color: rgba(0,0,0,0.4);
    padding: 4px 6px 6px;
    font-weight: 500;
  }
  .menu-colors {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    padding: 0 4px 4px;
  }
  .color-dot {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 50%;
    border: 1px solid rgba(0,0,0,0.1);
    cursor: pointer;
    padding: 0;
  }
  .color-dot.is-active {
    box-shadow: 0 0 0 2px rgba(0,0,0,0.85);
  }
  .menu-divider { height: 1px; background: rgba(0,0,0,0.06); margin: 6px 0; }
  .menu-item {
    width: 100%; display: flex; align-items: center; gap: 8px;
    border: none; background: transparent;
    padding: 8px 8px; border-radius: 4px;
    cursor: pointer; font-size: 13px;
    color: rgba(0,0,0,0.8); font-family: inherit;
    text-align: left;
  }
  .menu-item:hover { background: rgba(0,0,0,0.05); }
  .menu-danger { color: #b91c1c; }
  .menu-danger:hover { background: #fef2f2; }

  .card-body { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; }
  .card-title {
    margin: 0; font-size: 15px; font-weight: 600;
    line-height: 1.35; letter-spacing: -0.2px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .card-meta {
    margin-top: 6px;
    font-size: 12px;
    color: rgba(0,0,0,0.4);
  }

  .note-grid.view-list .note-card {
    flex-direction: row;
    align-items: center;
    gap: 16px;
    min-height: 0;
    padding: 12px 16px;
  }
  .note-grid.view-list .note-card.new-card {
    justify-content: flex-start; text-align: left;
  }
  .note-grid.view-list .new-card-plus { margin: 0; width: 32px; height: 32px; }
  .note-grid.view-list .card-top { margin-bottom: 0; min-height: 0; }
  .note-grid.view-list .card-body { flex-direction: row; align-items: center; gap: 12px; }
  .note-grid.view-list .card-title { font-size: 14px; -webkit-line-clamp: 1; flex: 1; }
  .note-grid.view-list .card-meta { margin-top: 0; }

  .home-empty {
    text-align: center; padding: 60px 20px;
    color: rgba(0,0,0,0.4); font-size: 14px;
  }

  @media (max-width: 720px) {
    .planote-home { padding: 24px 16px 60px; }
    .ctl-search-open { min-width: 0; flex: 1; }
    .note-grid.view-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
    .note-card { padding: 14px; min-height: 140px; }
  }
`;
