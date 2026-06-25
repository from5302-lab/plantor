import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  type QuerySnapshot,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { JSONContent } from "@tiptap/react";

export type NoteMeta = {
  subject?: string;
  grade?: string;
  publisher?: string;
  textbook?: string;
  largeUnit?: string;
  middleUnit?: string;
  smallUnit?: string;
};

export type NoteDoc = {
  id: string;
  ownerId: string;
  title: string;
  content: JSONContent;
  meta?: NoteMeta;
  color?: string;            // 카드 배경 색 hex (예: "#fef9c3")
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  sharedSlug?: string;
};

export const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7일

const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

const col = () => collection(db, "notes");

// Firestore는 undefined 필드를 거부하므로 미리 제거
function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(obj) as (keyof T)[]) {
    const v = obj[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export async function createNote(ownerId: string, meta?: NoteMeta): Promise<string> {
  const now = Date.now();
  const cleanMeta = meta ? stripUndefined(meta) : null;
  const ref = await addDoc(col(), {
    ownerId,
    title: "",
    content: EMPTY_DOC,
    meta: cleanMeta,
    createdAt: now,
    updatedAt: now,
    serverUpdatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function saveNote(
  noteId: string,
  patch: { title?: string; content?: JSONContent; meta?: NoteMeta; color?: string },
): Promise<void> {
  const cleaned = stripUndefined(patch) as typeof patch;
  if (cleaned.meta) cleaned.meta = stripUndefined(cleaned.meta);
  await updateDoc(doc(col(), noteId), {
    ...cleaned,
    updatedAt: Date.now(),
    serverUpdatedAt: serverTimestamp(),
  });
}

// 휴지통으로 이동 (soft delete)
export async function softDeleteNote(noteId: string): Promise<void> {
  await updateDoc(doc(col(), noteId), {
    deletedAt: Date.now(),
    serverUpdatedAt: serverTimestamp(),
  });
}

// 휴지통에서 복원
export async function restoreNote(noteId: string): Promise<void> {
  await updateDoc(doc(col(), noteId), {
    deletedAt: null,
    serverUpdatedAt: serverTimestamp(),
  });
}

// 영구 삭제
export async function permanentDeleteNote(noteId: string): Promise<void> {
  await deleteDoc(doc(col(), noteId));
}

// 7일 지난 휴지통 노트 자동 정리 (클라이언트에서 호출)
export async function cleanupExpiredTrash(notes: NoteDoc[]): Promise<void> {
  const now = Date.now();
  const expired = notes.filter(
    (n) => typeof n.deletedAt === "number" && now - n.deletedAt > TRASH_RETENTION_MS,
  );
  await Promise.allSettled(expired.map((n) => permanentDeleteNote(n.id)));
}

export function subscribeNotes(
  ownerId: string,
  onChange: (notes: NoteDoc[]) => void,
  onError?: (err: Error) => void,
): () => void {
  // orderBy는 클라이언트에서 — composite index 없이도 동작
  const q = query(col(), where("ownerId", "==", ownerId));
  return onSnapshot(
    q,
    (snap: QuerySnapshot<DocumentData>) => {
      const items: NoteDoc[] = snap.docs.map((s) => {
        const d = s.data();
        return {
          id: s.id,
          ownerId: d.ownerId,
          title: d.title ?? "",
          content: d.content ?? EMPTY_DOC,
          meta: d.meta ?? undefined,
          color: typeof d.color === "string" ? d.color : undefined,
          createdAt: d.createdAt ?? 0,
          updatedAt: d.updatedAt ?? 0,
          deletedAt: typeof d.deletedAt === "number" ? d.deletedAt : undefined,
          sharedSlug: d.sharedSlug,
        };
      });
      items.sort((a, b) => b.updatedAt - a.updatedAt);
      onChange(items);
    },
    (err) => {
      console.error("[subscribeNotes]", err);
      onError?.(err);
    },
  );
}
