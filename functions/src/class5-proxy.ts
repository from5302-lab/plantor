import { onRequest } from "firebase-functions/v2/https";

const UPSTREAM = "https://class5-planner.web.app/api/library-options";
let cache: { data: string; ts: number } | null = null;
const TTL = 60 * 60 * 1000; // 1시간

const ALLOWED_ORIGINS = [
  "https://plantor.web.app",
  "https://plantor.firebaseapp.com",
  "http://localhost:3000",
  "http://localhost:5000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5000",
];

export const class5Library = onRequest({ cors: ALLOWED_ORIGINS }, async (_req, res) => {
  if (cache && Date.now() - cache.ts < TTL) {
    res.set("Cache-Control", "public, max-age=3600");
    res.json(JSON.parse(cache.data));
    return;
  }
  const upstream = await fetch(UPSTREAM);
  const text = await upstream.text();
  cache = { data: text, ts: Date.now() };
  res.set("Cache-Control", "public, max-age=3600");
  res.json(JSON.parse(text));
});
