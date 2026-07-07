// ──────────────────────────────────────────────────────────────────────────
// 오늘의 특징주 (서버 전용).
//   네이버 순위에서 "상한가" + "거래량 1000만주 이상(종가 기준)" 종목을 모으고,
//   구글뉴스 검색으로 각 종목의 급등 "이유"(헤드라인+링크)를 붙인다.
//   무료/무키(네이버·구글).
// ──────────────────────────────────────────────────────────────────────────

import { promises as fs } from "fs";
import path from "path";

const dec = (buf: ArrayBuffer) => new TextDecoder("euc-kr").decode(Buffer.from(buf));
const NAVER = { headers: { referer: "https://finance.naver.com/" }, cache: "no-store" as const };

// 오늘(KST) YYYY-MM-DD
export function kstDate(): string {
  const d = new Date(Date.now() + 9 * 3600e3);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export const MIN_VOLUME = 10_000_000; // 거래량 기준: 1000만주

// ETF/ETN·인버스·레버리지 제외(뉴스 '이유'가 없는 상품)
const NOT_STOCK =
  /KODEX|TIGER|KBSTAR|ARIRANG|ACE |SOL |PLUS |RISE |HANARO|KOSEF|TIMEFOLIO|WON |마이티|파워|레버리지|인버스|선물|ETN|채권|국고|나스닥|다우|S&P|MSCI/i;

export type MoverTag = "상한가" | "대량거래";
export interface Mover {
  code: string;
  name: string;
  close: number;
  changePct: number;
  volume: number;
  tags: MoverTag[];
  news: { title: string; link: string }[];
}

// 순위 페이지 한 장을 파싱 → 종목 행들.
function parseRankPage(txt: string): Omit<Mover, "tags" | "news">[] {
  const out: Omit<Mover, "tags" | "news">[] = [];
  const anchors = [...txt.matchAll(/\/item\/main\.naver\?code=(\d{6})"[^>]*>([^<]+)<\/a>/g)];
  for (let k = 0; k < anchors.length; k++) {
    const m = anchors[k];
    const code = m[1];
    const name = m[2].trim();
    const start = m.index ?? 0;
    const end = k + 1 < anchors.length ? (anchors[k + 1].index ?? txt.length) : start + 700;
    const chunk = txt.slice(start, end);
    // 상한가 페이지는 전일비·등락률 칸이 class="rate_up|rate_down"라 number만 잡으면 열이 밀린다.
    // rate 칸까지 포함해야 두 페이지 모두 [현재가, 전일비, 등락률, 거래량, ...] 순서로 정렬된다.
    const nums = [
      ...chunk.matchAll(/<td class="(?:number|rate_up|rate_down)"[^>]*>([\s\S]*?)<\/td>/g),
    ].map((x) => x[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    if (nums.length < 4) continue;
    const close = parseInt(nums[0].replace(/[^\d]/g, ""), 10);
    const chg = chunk.match(/([+\-][\d.]+)\s*%/);
    const volume = parseInt(nums[3].replace(/[^\d]/g, ""), 10);
    if (!close) continue;
    out.push({ code, name, close, changePct: chg ? parseFloat(chg[1]) : 0, volume });
  }
  return out;
}

async function fetchRank(url: string): Promise<Omit<Mover, "tags" | "news">[]> {
  try {
    const buf = await (await fetch(url, NAVER)).arrayBuffer();
    return parseRankPage(dec(buf));
  } catch {
    return [];
  }
}

// 구글뉴스 검색 → 최근 이틀 내 헤드라인 top N.
async function fetchNews(
  name: string,
  cutoffMs: number,
): Promise<{ title: string; link: string }[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
      name,
    )}&hl=ko&gl=KR&ceid=KR:ko`;
    const txt = await (await fetch(url, { cache: "no-store", signal: ctrl.signal })).text();
    const items: { title: string; link: string; ts: number }[] = [];
    for (const m of txt.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const b = m[1];
      const rawTitle = b.match(/<title>([^<]+)<\/title>/)?.[1];
      const link = b.match(/<link>([^<]+)<\/link>/)?.[1] ?? "";
      const pd = b.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1];
      if (!rawTitle) continue;
      const ts = pd ? Date.parse(pd) : NaN;
      if (!Number.isNaN(ts) && ts < cutoffMs) continue; // 오래된 기사 제외
      const title = rawTitle
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&");
      items.push({ title, link, ts: Number.isNaN(ts) ? 0 : ts });
    }
    items.sort((a, b) => b.ts - a.ts);
    return items.slice(0, 2).map(({ title, link }) => ({ title, link }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export interface MoversResult {
  date: string; // 기준일 표기용 YYYY-MM-DD (KST)
  minVolumeLabel: string;
  movers: Mover[];
}

export async function getMovers(): Promise<MoversResult> {
  // 상한가(양 시장) + 거래량 상위(양 시장) 병렬 수집
  const [upperK, upperQ, quantK, quantQ] = await Promise.all([
    fetchRank("https://finance.naver.com/sise/sise_upper.naver"),
    fetchRank("https://finance.naver.com/sise/sise_upper.naver?sosok=1"),
    fetchRank("https://finance.naver.com/sise/sise_quant.naver?sosok=0"),
    fetchRank("https://finance.naver.com/sise/sise_quant.naver?sosok=1"),
  ]);

  const byCode = new Map<string, Mover>();
  const add = (r: Omit<Mover, "tags" | "news">, tag: MoverTag) => {
    if (NOT_STOCK.test(r.name)) return;
    const cur = byCode.get(r.code);
    if (cur) {
      if (!cur.tags.includes(tag)) cur.tags.push(tag);
      if (r.volume > cur.volume) cur.volume = r.volume; // 두 페이지 중 큰 거래량 채택
    } else {
      byCode.set(r.code, { ...r, tags: [tag], news: [] });
    }
  };
  for (const r of [...upperK, ...upperQ]) add(r, "상한가");
  for (const r of [...quantK, ...quantQ]) if (r.volume >= MIN_VOLUME) add(r, "대량거래");

  // 상한가 우선 → 거래량 내림차순, 상위 18개만 (뉴스 호출량·시간 제한)
  const movers = [...byCode.values()]
    .sort((a, b) => {
      const au = a.tags.includes("상한가") ? 1 : 0;
      const bu = b.tags.includes("상한가") ? 1 : 0;
      if (au !== bu) return bu - au;
      return b.volume - a.volume;
    })
    .slice(0, 18);

  // 각 종목 이유(뉴스) 병렬 수집 — 최근 2일 이내
  const cutoff = Date.now() - 2 * 864e5;
  await Promise.all(
    movers.map(async (mv) => {
      mv.news = await fetchNews(mv.name, cutoff);
    }),
  );

  return { date: kstDate(), minVolumeLabel: "1,000만주", movers };
}

// ── 일별 스냅샷 저장/조회 (로컬 forward-accumulate) ─────────────────────────
const SNAP_DIR = path.join(process.cwd(), "data", "movers");

export async function saveMoversSnapshot(res: MoversResult): Promise<void> {
  await fs.mkdir(SNAP_DIR, { recursive: true });
  await fs.writeFile(path.join(SNAP_DIR, `${res.date}.json`), JSON.stringify(res), "utf8");
}

// 저장된 날짜들 (최신순)
export async function listSnapshotDates(): Promise<string[]> {
  try {
    const files = await fs.readdir(SNAP_DIR);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export async function readMoversSnapshot(date: string): Promise<MoversResult | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(SNAP_DIR, `${date}.json`), "utf8"));
  } catch {
    return null;
  }
}
