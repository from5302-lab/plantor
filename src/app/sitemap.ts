import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://plantor.web.app";
  const now = new Date();
  return [
    // 소개(/about)가 검색으로 들어오는 사람이 처음 읽어야 할 페이지다.
    // 루트는 매일 바뀌는 피드라 갱신 빈도만 높게 둔다.
    { url: `${base}/about`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/momsaipack`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];
}
