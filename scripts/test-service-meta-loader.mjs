#!/usr/bin/env node
/**
 * service-meta-loader 검증 — Firestore serviceOverrides 직접 읽어서
 * 알림 함수가 같은 식으로 어떤 slug → 이름으로 풀어내는지 시뮬레이션.
 */
import admin from "firebase-admin";

admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();
const SITE_URL = "https://plantor.web.app";

const STATIC_BASE = {
  dailykor:           { name: "매일국어",              icon: `${SITE_URL}/service-icons/dailykor.png` },
  autovoca:           { name: "오토보카",               icon: `${SITE_URL}/service-icons/autovoca.png` },
  class5:             { name: "클래스5",           icon: `${SITE_URL}/service-icons/class5.png` },
  "classcard-middle": { name: "클래스카드",        icon: `${SITE_URL}/service-icons/classcard.png` },
  "great-books":      { name: "고전독서모임",       icon: `${SITE_URL}/service-icons/great-books.png` },
  "vibe-coding":      { name: "바이브코딩 수업",     icon: `${SITE_URL}/service-icons/vibe-coding.svg` },
  momsaipack:         { name: "엄마들을 위한 AI 패키지", icon: `${SITE_URL}/favicon.svg` },
  "mom-webinar":      { name: "[Mom&] 맘이랑 금요웨비나", icon: `${SITE_URL}/favicon.svg` },
};

function resolveIcon(iconUrl, fallback) {
  if (!iconUrl) return fallback;
  if (iconUrl.startsWith("http")) return iconUrl;
  if (iconUrl.startsWith("/")) return `${SITE_URL}${iconUrl}`;
  return iconUrl;
}

async function loadServiceMeta() {
  const result = new Map();
  for (const [slug, m] of Object.entries(STATIC_BASE)) result.set(slug, { ...m });

  const snap = await db.collection("serviceOverrides").get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const existing = result.get(doc.id);
    const fallbackIcon = existing?.icon ?? `${SITE_URL}/favicon.svg`;
    const fallbackName = existing?.name ?? doc.id;
    result.set(doc.id, {
      name: data.name || fallbackName,
      icon: resolveIcon(data.iconUrl, fallbackIcon),
    });
  }
  return result;
}

async function main() {
  const meta = await loadServiceMeta();
  console.log(`병합된 서비스 메타 ${meta.size}개:\n`);
  console.log("slug".padEnd(30), "name".padEnd(30), "icon");
  console.log("─".repeat(120));
  for (const [slug, info] of [...meta.entries()].sort()) {
    console.log(slug.padEnd(30), info.name.padEnd(30), info.icon);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
