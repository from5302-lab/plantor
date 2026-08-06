"use client";

import { useState, useEffect } from "react";
import { SERVICES } from "@/data/site";
import type { Service } from "@/data/site";
import { ServiceCard } from "@/components/ui/service-card";
import { FitText } from "@/components/ui/fit-text";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { useAuth } from "@/lib/auth-context";
import { useServices } from "@/lib/services-context";
import { doc, setDoc, deleteDoc, deleteField } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";

function normalizeSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "");
}

async function saveService(service: Service, isNew: boolean) {
  await setDoc(doc(db, "serviceOverrides", service.slug), isNew ? { ...service, _extra: true } : service, { merge: true });
}

async function deleteService(slug: string) {
  await deleteDoc(doc(db, "serviceOverrides", slug));
}

async function hideOrDeleteService(slug: string, isExtra: boolean) {
  if (isExtra) {
    await deleteDoc(doc(db, "serviceOverrides", slug));
  } else {
    await setDoc(doc(db, "serviceOverrides", slug), { _hidden: true }, { merge: true });
  }
}

// ── 폼 모달 ───────────────────────────────────────────────────────────────────

const EMPTY: Omit<Service, "slug"> = {
  emoji: "📌",
  name: "",
  hook: "",
  pricePerMonth: null,
  priceLabel: "",
  targetGrades: "",
  category: "subscription",
  bullets: ["", "", ""],
  externalUrl: "",
  status: "active",
  signupType: "both",
};

// ── 이미지에서 지배색 추출 (Canvas API) ──────────────────────────────────────

async function extractDominantColor(imageUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const SIZE = 24;
        const canvas = document.createElement("canvas");
        canvas.width = SIZE; canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 128) {
            const brightness = (data[i] + data[i+1] + data[i+2]) / 3;
            if (brightness > 20 && brightness < 235) {
              r += data[i]; g += data[i+1]; b += data[i+2]; count++;
            }
          }
        }
        if (count === 0) { resolve(null); return; }
        const toHex = (v: number) => Math.round(v / count).toString(16).padStart(2, "0");
        resolve(`#${toHex(r)}${toHex(g)}${toHex(b)}`);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

const LABEL_CLS = "block text-[11px] font-semibold text-p-secondary mb-1 tracking-[0.02em]";
const INPUT_CLS = "w-full box-border border border-black/10 rounded px-[10px] py-[7px] text-[13px] text-black/90 bg-white outline-none font-[inherit]";

// SVG 화살표 인라인 커스텀 드롭다운
function StyledSelect({ value, onChange, children, style }: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const arrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23615d59'/%3E%3C/svg%3E")`;
  return (
    <div className="relative w-full" style={style}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          border: "1px solid rgba(0,0,0,0.1)",
          borderRadius: 4,
          padding: "7px 32px 7px 10px",
          fontSize: 13,
          color: "rgba(0,0,0,0.9)",
          background: "#fff",
          outline: "none",
          fontFamily: "inherit",
          appearance: "none",
          WebkitAppearance: "none",
          cursor: "pointer",
          backgroundImage: arrow,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 10px center",
          backgroundSize: "10px 6px",
        }}
      >
        {children}
      </select>
    </div>
  );
}

function ServiceFormModal({
  initial,
  isNew,
  onClose,
  onSaved,
  onDeleted,
}: {
  initial: Service | null;
  isNew: boolean;
  onClose: () => void;
  onSaved: (s: Service) => void;
  onDeleted?: (slug: string) => void;
}) {
  const initStatus = initial?.status ?? (initial?.slug.startsWith("coming-soon") ? "coming_soon" : "active");
  const isBaseService = !isNew && SERVICES.some((s) => s.slug === initial?.slug);
  const [form, setForm] = useState<Service>(
    initial ?? { slug: "", ...EMPTY }
  );
  const [iconMode, setIconMode] = useState<"emoji" | "favicon" | "upload">(initial?.iconUrl ? "favicon" : "emoji");
  const [faviconPreview, setFaviconPreview] = useState<string>(() => {
    if (initial?.iconUrl) return initial.iconUrl;
    try { return initial?.externalUrl ? `https://www.google.com/s2/favicons?domain=${new URL(initial.externalUrl).hostname}&sz=64` : ""; }
    catch { return ""; }
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!form.status) setForm((p) => ({ ...p, status: initStatus }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setBullet(i: number, v: string) {
    const b = [...form.bullets];
    b[i] = v;
    setForm((p) => ({ ...p, bullets: b }));
  }

  function setPartName(i: number, name: string) {
    setForm((p) => {
      const parts = [...(p.parts ?? [])];
      parts[i] = { ...parts[i], name };
      return { ...p, parts };
    });
  }

  function movePart(i: number, dir: -1 | 1) {
    setForm((p) => {
      const parts = [...(p.parts ?? [])];
      const j = i + dir;
      if (j < 0 || j >= parts.length) return p;
      [parts[i], parts[j]] = [parts[j], parts[i]];
      return { ...p, parts };
    });
  }

  function removePart(i: number) {
    setForm((p) => ({ ...p, parts: (p.parts ?? []).filter((_, idx) => idx !== i) }));
  }

  function addPart() {
    setForm((p) => ({ ...p, parts: [...(p.parts ?? []), { slug: "", name: "" }] }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("서비스명을 입력해주세요."); return; }
    const slug = (isNew && !form.slug.trim())
      ? `${normalizeSlug(form.name) || "service"}-${Date.now()}`
      : form.slug;
    setSaving(true); setError("");
    try {
      const resolvedIconUrl = iconMode === "emoji"
        ? undefined
        : iconMode === "favicon"
          ? (faviconPreview || undefined)
          : (form.iconUrl || undefined);

      const rawPrice = form.priceLabel.replace(/,/g, "").trim();
      const formattedPriceLabel = /^\d+$/.test(rawPrice)
        ? `₩${Number(rawPrice).toLocaleString("ko-KR")}/월`
        : form.priceLabel;

      const priceNum = Number(formattedPriceLabel.replace(/[^0-9]/g, "")) || null;

      // 파트 정리: 빈 이름 제거, slug 없는 새 파트에 고유 slug 부여
      const cleanedParts = (form.parts ?? [])
        .filter((p) => p.name.trim())
        .map((p) => ({ ...p, name: p.name.trim() }));
      const usedPartSlugs = new Set(cleanedParts.filter((p) => p.slug).map((p) => p.slug));
      const partsWithSlugs = cleanedParts.map((p, i) => {
        let partSlug = p.slug;
        if (!partSlug) {
          const base = normalizeSlug(p.name) || `part-${i + 1}`;
          partSlug = base;
          let n = 2;
          while (usedPartSlugs.has(partSlug)) partSlug = `${base}-${n++}`;
          usedPartSlugs.add(partSlug);
        }
        return p.category ? { slug: partSlug, name: p.name, category: p.category } : { slug: partSlug, name: p.name };
      });

      const svc: Service = {
        ...form,
        slug,
        priceLabel: formattedPriceLabel,
        bullets: form.bullets.filter((b) => b.trim()),
        pricePerMonth: priceNum,
        iconUrl: resolvedIconUrl,
        emoji: iconMode === "emoji" ? form.emoji : "📌",
        parts: partsWithSlugs.length > 0 ? partsWithSlugs : undefined,
      };
      const firestoreData: Record<string, unknown> = {
        ...svc,
        iconUrl: resolvedIconUrl ?? deleteField(),
        signupUrl: svc.signupUrl ?? deleteField(),
        studentUrl: svc.studentUrl ?? deleteField(),
        parentUrl: svc.parentUrl ?? deleteField(),
        parts: partsWithSlugs.length > 0 ? partsWithSlugs : deleteField(),
        progressLabel: svc.progressLabel ?? deleteField(),
      };
      if (isNew) firestoreData._extra = true;
      await setDoc(doc(db, "serviceOverrides", svc.slug), firestoreData, { merge: true });
      onSaved(svc);
    } catch (e) { setError(e instanceof Error ? e.message : "저장 실패"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!initial) return;
    const label = isBaseService ? "기본 서비스를 숨기면 사이트에서 보이지 않게 됩니다." : "추가한 서비스가 완전히 삭제됩니다.";
    if (!window.confirm(`정말 삭제하시겠습니까?\n${label}\n(Firestore에서도 제거됩니다)`)) return;
    setDeleting(true); setError("");
    try {
      await hideOrDeleteService(initial.slug, !isBaseService);
      onDeleted?.(initial.slug);
    } catch (e) { setError(e instanceof Error ? e.message : "삭제 실패"); }
    finally { setDeleting(false); }
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-[rgba(0,0,0,0.4)] z-[300]" />
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(560px,95vw)] max-h-[90vh] overflow-y-auto bg-white rounded-xl z-[301] px-7 py-7 pb-8"
        style={{ boxShadow: "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 8px, rgba(0,0,0,0.02) 0px 0.8px 3px" }}
      >
        <div className="flex justify-between items-center mb-5">
          <h2 className="m-0 text-base font-bold">{isNew ? "서비스 추가" : "서비스 수정"}</h2>
          <button onClick={onClose} className="bg-transparent border-none text-lg cursor-pointer text-p-muted">✕</button>
        </div>

        <div className="flex flex-col gap-3.5">
          {/* 아이콘 섹션 */}
          <div>
            <label className={LABEL_CLS}>아이콘</label>
            <div className="flex rounded overflow-hidden mb-2.5 border border-black/10">
              {(["emoji", "favicon", "upload"] as const).map((mode, i) => (
                <button
                  key={mode}
                  onClick={() => setIconMode(mode)}
                  className="flex-1 py-[5px] text-xs font-semibold cursor-pointer transition-all rounded-none border-none"
                  style={{
                    borderLeft: i > 0 ? "1px solid rgba(0,0,0,0.1)" : "none",
                    backgroundColor: iconMode === mode ? "#f6f5f4" : "#fff",
                    color: iconMode === mode ? "rgba(0,0,0,0.9)" : "#a39e98",
                  }}
                >
                  {mode === "emoji" ? "이모지" : mode === "favicon" ? "파비콘" : "업로드"}
                </button>
              ))}
            </div>

            {iconMode === "emoji" && (
              <div className="flex gap-2.5 items-center">
                <EmojiPicker
                  value={form.emoji}
                  onChange={async (emoji) => {
                    setForm((p) => ({ ...p, emoji }));
                    try {
                      const SIZE = 64;
                      const canvas = document.createElement("canvas");
                      canvas.width = SIZE; canvas.height = SIZE;
                      const ctx = canvas.getContext("2d");
                      if (!ctx) return;
                      ctx.font = `${SIZE * 0.75}px serif`;
                      ctx.textAlign = "center";
                      ctx.textBaseline = "middle";
                      ctx.fillText(emoji, SIZE / 2, SIZE / 2);
                      const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
                      let r = 0, g = 0, b = 0, count = 0;
                      for (let i = 0; i < data.length; i += 4) {
                        if (data[i + 3] > 128) {
                          const brightness = (data[i] + data[i+1] + data[i+2]) / 3;
                          if (brightness > 20 && brightness < 235) {
                            r += data[i]; g += data[i+1]; b += data[i+2]; count++;
                          }
                        }
                      }
                      if (count === 0) return;
                      const toHex = (v: number) => Math.round(v / count).toString(16).padStart(2, "0");
                      setForm((p) => ({ ...p, brandColor: `#${toHex(r)}${toHex(g)}${toHex(b)}` }));
                    } catch { /* 추출 실패 시 무시 */ }
                  }}
                />
                <span className="text-[11px] text-p-muted">클릭해서 이모지를 선택하면 버튼 색상이 자동 추출됩니다</span>
              </div>
            )}

            {iconMode === "favicon" && (
              <div className="flex gap-2.5 items-center">
                {faviconPreview && (
                  <img src={faviconPreview} alt="favicon" width={32} height={32}
                    className="rounded-md object-contain shrink-0 border border-black/[0.08]"
                    onError={() => setFaviconPreview("")}
                  />
                )}
                <div className="flex-1">
                  <div className="text-xs text-p-secondary mb-1.5">
                    외부 링크 URL 기준으로 자동 추출됩니다
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const hostname = new URL(form.externalUrl ?? "").hostname;
                        const url = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
                        setFaviconPreview(url);
                        const color = await extractDominantColor(url);
                        if (color) setForm((p) => ({ ...p, brandColor: color }));
                      } catch { setError("외부 링크 URL을 먼저 입력해주세요."); }
                    }}
                    className="px-3 py-1.5 rounded border border-black/10 bg-[#f6f5f4] text-xs cursor-pointer text-black/80"
                  >
                    파비콘 가져오기
                  </button>
                  {faviconPreview && (
                    <span className="ml-2 text-[11px] text-p-green">✓ 가져옴</span>
                  )}
                </div>
              </div>
            )}

            {iconMode === "upload" && (
              <div className="flex gap-2.5 items-center">
                {form.iconUrl && (
                  <img src={form.iconUrl} alt="uploaded icon" width={32} height={32}
                    className="rounded-md object-contain shrink-0 border border-black/[0.08]"
                  />
                )}
                <div>
                  <label
                    className="inline-block px-3 py-1.5 rounded border border-black/10 bg-[#f6f5f4] text-xs text-black/80"
                    style={{ cursor: uploading ? "default" : "pointer", opacity: uploading ? 0.6 : 1 }}
                  >
                    {uploading ? "업로드 중…" : "파일 선택"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const slug = form.slug.trim()
                          || `${normalizeSlug(form.name) || "service"}-${Date.now()}`;
                        if (!slug || slug === `service-${Date.now()}`) { setError("서비스명을 먼저 입력해주세요."); return; }
                        if (!form.slug.trim()) setForm((p) => ({ ...p, slug }));
                        setUploading(true); setError("");
                        try {
                          const storageRef = ref(storage, `serviceIcons/${slug}/icon`);
                          await uploadBytes(storageRef, file);
                          const url = await getDownloadURL(storageRef);
                          setForm((p) => ({ ...p, iconUrl: url }));
                          const color = await extractDominantColor(url);
                          if (color) setForm((p) => ({ ...p, brandColor: color }));
                        } catch (err) { setError(err instanceof Error ? err.message : "업로드 실패"); }
                        finally { setUploading(false); }
                      }}
                    />
                  </label>
                  {form.iconUrl && iconMode === "upload" && (
                    <span className="ml-2 text-[11px] text-p-green">✓ 업로드 완료</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 버튼 색상 */}
          <div>
            <label className={LABEL_CLS}>버튼 색상 (아이콘에서 자동 추출)</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={form.brandColor ?? "#38a848"}
                onChange={(e) => setForm((p) => ({ ...p, brandColor: e.target.value }))}
                className="w-10 h-9 p-0.5 border border-black/10 rounded cursor-pointer bg-transparent"
              />
              <div
                className="flex-1 h-9 rounded flex items-center justify-center"
                style={{ backgroundColor: form.brandColor ?? "#38a848" }}
              >
                <span className="text-xs font-semibold text-white" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>
                  신청하기 →
                </span>
              </div>
              {form.brandColor && (
                <button
                  onClick={() => setForm((p) => ({ ...p, brandColor: undefined }))}
                  className="text-[11px] text-p-muted bg-transparent border-none cursor-pointer whitespace-nowrap"
                >초기화</button>
              )}
            </div>
          </div>

          {/* 서비스명 */}
          <div>
            <label className={LABEL_CLS}>서비스명</label>
            <input className={INPUT_CLS} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </div>

          <div>
            <label className={LABEL_CLS}>한 줄 소개</label>
            <input className={INPUT_CLS} value={form.hook} onChange={(e) => setForm((p) => ({ ...p, hook: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={LABEL_CLS}>가격 표시</label>
              <input
                className={INPUT_CLS}
                value={form.priceLabel}
                onChange={(e) => setForm((p) => ({ ...p, priceLabel: e.target.value }))}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>대상</label>
              <input className={INPUT_CLS} value={form.targetGrades} onChange={(e) => setForm((p) => ({ ...p, targetGrades: e.target.value }))} />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {["미취학", "초등", "중등", "고등", "학부모"].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, targetGrades: p.targetGrades ? `${p.targetGrades} · ${tag}` : tag }))}
                    className="px-2 py-0.5 rounded-full border border-black/10 bg-[#f6f5f4] text-[11px] font-semibold text-p-secondary cursor-pointer"
                  >
                    {tag}
                  </button>
                ))}
                {form.targetGrades && (
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, targetGrades: "" }))}
                    className="px-2 py-0.5 rounded-full border border-black/[0.08] bg-transparent text-[11px] text-p-muted cursor-pointer"
                  >
                    초기화
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 카테고리 */}
          <div>
            <label className={LABEL_CLS}>카테고리</label>
            <StyledSelect value={form.category} onChange={(v) => setForm((p) => ({ ...p, category: v as Service["category"] }))}>
              <option value="subscription">구독형</option>
              <option value="premium">프리미엄</option>
              <option value="community">커뮤니티</option>
            </StyledSelect>
          </div>

          {/* 등록 상태 */}
          <div>
            <label className={LABEL_CLS}>등록 상태</label>
            <StyledSelect value={form.status ?? "active"} onChange={(v) => setForm((p) => ({ ...p, status: v as Service["status"] }))}>
              <option value="active">등록 중</option>
              <option value="coming_soon">준비 중</option>
            </StyledSelect>
          </div>

          <div>
            <label className={LABEL_CLS}>외부 링크 URL</label>
            <input className={INPUT_CLS} value={form.externalUrl ?? ""} onChange={(e) => setForm((p) => ({ ...p, externalUrl: e.target.value }))} />
          </div>

          <div>
            <label className={LABEL_CLS}>
              신청하기 버튼 링크 <span className="font-normal text-p-muted">(비우면 /signup으로 연결)</span>
            </label>
            <input className={INPUT_CLS} value={form.signupUrl ?? ""} onChange={(e) => setForm((p) => ({ ...p, signupUrl: e.target.value || undefined }))} />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={LABEL_CLS}>학생 접속 링크</label>
              <input className={INPUT_CLS} value={form.studentUrl ?? ""} onChange={(e) => setForm((p) => ({ ...p, studentUrl: e.target.value || undefined }))} />
            </div>
            <div>
              <label className={LABEL_CLS}>학부모 접속 링크</label>
              <input className={INPUT_CLS} value={form.parentUrl ?? ""} onChange={(e) => setForm((p) => ({ ...p, parentUrl: e.target.value || undefined }))} />
            </div>
          </div>

          <div>
            <label className={LABEL_CLS}>특징 (bullet)</label>
            {(form.bullets.length > 0 ? form.bullets : ["", "", ""]).map((b, i) => (
              <input key={i} className={`${INPUT_CLS} mb-1.5`} value={b} onChange={(e) => setBullet(i, e.target.value)} />
            ))}
            <button
              onClick={() => setForm((p) => ({ ...p, bullets: [...p.bullets, ""] }))}
              className="text-xs text-p-green bg-transparent border-none cursor-pointer p-0"
            >+ 항목 추가</button>
          </div>

          {/* 학습 파트 — 플랜 과제 추가/편집의 파트 드롭다운 항목 */}
          <div>
            <label className={LABEL_CLS}>
              학습 파트 <span className="font-normal text-p-muted">(플랜 과제의 파트 드롭다운 항목)</span>
            </label>
            {(form.parts ?? []).map((p, i) => (
              <div key={i} className="flex gap-1.5 mb-1.5 items-center">
                <input className={INPUT_CLS} value={p.name} onChange={(e) => setPartName(i, e.target.value)} />
                <button
                  type="button"
                  onClick={() => movePart(i, -1)}
                  disabled={i === 0}
                  className="shrink-0 w-8 h-8 rounded border border-black/10 bg-white text-p-muted cursor-pointer text-xs"
                  style={{ opacity: i === 0 ? 0.3 : 1 }}
                >↑</button>
                <button
                  type="button"
                  onClick={() => movePart(i, 1)}
                  disabled={i === (form.parts?.length ?? 0) - 1}
                  className="shrink-0 w-8 h-8 rounded border border-black/10 bg-white text-p-muted cursor-pointer text-xs"
                  style={{ opacity: i === (form.parts?.length ?? 0) - 1 ? 0.3 : 1 }}
                >↓</button>
                <button
                  type="button"
                  onClick={() => removePart(i)}
                  className="shrink-0 w-8 h-8 rounded border border-[rgba(200,0,0,0.25)] bg-white text-[#c00] cursor-pointer text-xs"
                >✕</button>
              </div>
            ))}
            <button
              type="button"
              onClick={addPart}
              className="text-xs text-p-green bg-transparent border-none cursor-pointer p-0"
            >+ 파트 추가</button>
            <label className="flex items-center gap-1.5 mt-2 text-xs text-p-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={form.progressLabel ?? false}
                onChange={(e) => setForm((p) => ({ ...p, progressLabel: e.target.checked }))}
              />
              파트 대신 진도 라벨(n권 n유닛) 입력 사용
            </label>
          </div>

          {error && <p className="m-0 text-[#c00] text-[13px]">{error}</p>}
          <div className="flex gap-2 items-center mt-1">
            {!isNew && onDeleted && (
              <button
                onClick={handleDelete}
                disabled={deleting || saving}
                className="px-3.5 py-2 rounded border border-[rgba(200,0,0,0.25)] bg-transparent text-[13px] cursor-pointer text-[#c00]"
                style={{ opacity: deleting ? 0.6 : 1 }}
              >
                {deleting ? "삭제 중…" : "삭제"}
              </button>
            )}
            <div className="flex-1" />
            <button onClick={onClose} className="px-4 py-2 rounded border border-black/10 bg-transparent text-[13px] cursor-pointer text-black/90">취소</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded border-none bg-p-green text-white text-[13px] font-semibold cursor-pointer"
              style={{ opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export function ServicesSection() {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const { allServices: services } = useServices();
  const [editTarget, setEditTarget] = useState<Service | null>(null);
  const [adding, setAdding] = useState(false);

  function handleSaved(_saved: Service) {
    setEditTarget(null);
    setAdding(false);
  }

  function handleDeleted(_slug: string) {
    setEditTarget(null);
  }

  async function handleMove(slug: string, dir: -1 | 1) {
    const visible = isAdmin
      ? [...services]
      : services.filter((s) => s.status !== "coming_soon" && !s.slug.startsWith("coming-soon"));
    const sorted = [...visible].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    const idx = sorted.findIndex((s) => s.slug === slug);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const aOrder = idx;
    const bOrder = swapIdx;
    const updates: { slug: string; order: number }[] = [
      { slug: sorted[idx].slug, order: bOrder },
      { slug: sorted[swapIdx].slug, order: aOrder },
    ];

    await Promise.all(
      updates.map(({ slug: s, order }) =>
        setDoc(doc(db, "serviceOverrides", s), { order }, { merge: true })
      )
    );
  }

  const visibleServices = (isAdmin
    ? services
    : services.filter((s) => s.status !== "coming_soon" && !s.slug.startsWith("coming-soon"))
  ).slice().sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

  return (
    <section id="services" className="section-pad bg-p-bg px-6 py-[80px]">
      {editTarget && (
        <ServiceFormModal initial={editTarget} isNew={false} onClose={() => setEditTarget(null)} onSaved={handleSaved} onDeleted={handleDeleted} />
      )}
      {adding && (
        <ServiceFormModal initial={null} isNew onClose={() => setAdding(false)} onSaved={handleSaved} />
      )}

      <div className="mx-auto max-w-[1000px]">
        <div className="mb-6 text-center">
          <FitText as="h2" style={{ fontWeight: 700, letterSpacing: "-0.75px", color: "rgba(0,0,0,0.95)" }}>
            우리 아이와 나를 위한 딱 맞는 학습 프로그램
          </FitText>
        </div>

        <div className="services-row flex flex-row gap-4 overflow-x-auto pb-2 pt-4">
          {isAdmin && (
            <button
              onClick={() => setAdding(true)}
              className="shrink-0 w-[60px] max-[600px]:w-full min-h-[200px] max-[600px]:min-h-[60px] border-2 border-dashed border-black/[0.15] rounded-xl bg-transparent cursor-pointer text-[28px] text-p-muted flex items-center justify-center"
            >
              +
            </button>
          )}
          {visibleServices.map((service, i) => (
            <ServiceCard
              key={service.slug}
              service={service}
              onEdit={isAdmin ? () => setEditTarget(service) : undefined}
              onMoveLeft={isAdmin && i > 0 ? () => handleMove(service.slug, -1) : undefined}
              onMoveRight={isAdmin && i < visibleServices.length - 1 ? () => handleMove(service.slug, 1) : undefined}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
