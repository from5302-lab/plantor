/**
 * 서비스 메타(이름/아이콘) 단일 source 로더.
 *
 * 우선순위: Firestore `serviceOverrides`  >  정적 SERVICE_META (config.ts) fallback.
 *
 * 홈페이지(`src/lib/load-services.ts`)와 동일한 source(`serviceOverrides`)를 읽으므로
 * 어드민이 서비스명을 바꾸면 알림 발송에도 즉시(최대 5분 캐시 만료 후) 반영된다.
 *
 * 빈도 높은 호출에 대비해 메모리 캐시 사용. Cloud Functions 인스턴스가 따뜻한 동안에만 유효.
 */
import { db, SERVICE_META, SITE_URL } from "./config";

export type ServiceInfo = { name: string; icon: string };

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: Map<string, ServiceInfo> | null = null;
let cacheExpiry = 0;

function resolveIcon(iconUrl: string | undefined | null, fallback: string): string {
  if (!iconUrl) return fallback;
  if (iconUrl.startsWith("http")) return iconUrl;
  if (iconUrl.startsWith("/")) return `${SITE_URL}${iconUrl}`;
  return iconUrl;
}

/** 통합된 slug → {name, icon} 맵 로드. 5분간 메모리 캐시. */
export async function loadServiceMeta(): Promise<Map<string, ServiceInfo>> {
  const now = Date.now();
  if (cache && now < cacheExpiry) return cache;

  const result = new Map<string, ServiceInfo>();

  // 1) 정적 SERVICE_META를 base로
  for (const [slug, meta] of Object.entries(SERVICE_META)) {
    result.set(slug, { name: meta.name, icon: meta.icon });
  }

  // 2) Firestore serviceOverrides 병합 (덮어쓰기 + 새로 추가된 슬러그도 포함)
  try {
    const snap = await db.collection("serviceOverrides").get();
    for (const doc of snap.docs) {
      const data = doc.data() as { name?: string; iconUrl?: string };
      const existing = result.get(doc.id);
      const fallbackIcon = existing?.icon ?? `${SITE_URL}/favicon.svg`;
      const fallbackName = existing?.name ?? doc.id;
      result.set(doc.id, {
        name: data.name || fallbackName,
        icon: resolveIcon(data.iconUrl, fallbackIcon),
      });
    }
  } catch (e) {
    console.error("[loadServiceMeta] serviceOverrides 로드 실패, 정적 SERVICE_META만 사용:", e);
  }

  cache = result;
  cacheExpiry = now + CACHE_TTL_MS;
  return result;
}

/** 캐시 무효화 (어드민이 서비스명 수정 직후 호출하면 즉시 반영) */
export function invalidateServiceMetaCache(): void {
  cache = null;
  cacheExpiry = 0;
}

/** info에서 아이콘 HTML 생성 (sync) — 이메일 본문용 */
export function iconHtmlFromInfo(info: ServiceInfo | undefined): string {
  if (!info?.icon) return "";
  return `<img src="${info.icon}" width="22" height="22" style="border-radius:6px;vertical-align:middle;margin-right:6px" alt="${info.name}">`;
}
