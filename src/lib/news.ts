// ──────────────────────────────────────────────────────────────────────────
// 뉴스 검색 — 네이버 검색 API (공식, 데이터센터 IP에서도 동작).
//   구글뉴스 RSS는 클라우드 IP를 차단해서 Vercel·서버에선 안 됨 → 네이버로 교체.
//   무료 키 필요: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET (developers.naver.com)
// ──────────────────────────────────────────────────────────────────────────

export interface NewsItem {
  title: string;
  link: string;
  ts: number; // 발행시각(ms). 없으면 NaN
}

const strip = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();

// 네이버 뉴스 검색. sort: "date"(최신) | "sim"(정확도). display 최대 100, start 최대 1000.
export async function searchNews(
  query: string,
  opts: { display?: number; sort?: "date" | "sim"; start?: number } = {},
): Promise<NewsItem[]> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) {
    console.error("[searchNews] NAVER keys missing (id:", !!id, "secret:", !!secret, ")");
    return [];
  }
  try {
    const url =
      `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}` +
      `&display=${opts.display ?? 100}&sort=${opts.sort ?? "date"}&start=${opts.start ?? 1}`;
    const r = await fetch(url, {
      headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
      cache: "no-store",
    });
    const j = (await r.json()) as {
      items?: { title: string; originallink?: string; link?: string; pubDate?: string }[];
      errorCode?: string;
      errorMessage?: string;
    };
    if (!j.items) console.error("[searchNews] no items:", r.status, j.errorCode, j.errorMessage);
    return (j.items || [])
      .map((it) => ({
        title: strip(it.title || ""),
        link: it.originallink || it.link || "",
        ts: it.pubDate ? Date.parse(it.pubDate) : NaN,
      }))
      .filter((x) => x.title);
  } catch (err) {
    console.error("[searchNews]", query, err instanceof Error ? err.message : err);
    return [];
  }
}

export const hasNaverKey = () => !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
