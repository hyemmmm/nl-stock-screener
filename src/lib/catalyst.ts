// ──────────────────────────────────────────────────────────────────────────
// 종목 재료 분석 (서버 전용).
//   한 종목의 전체 일봉을 훑어 "급등일"을 자동 탐지하고, 각 급등일의
//   등락률·거래량배수·시황(코스피)·재료(과거 뉴스)를 붙인 뒤 유형별로 집계.
//   무료/무키(네이버·구글). 유형 분류만 Groq(있으면).
// ──────────────────────────────────────────────────────────────────────────
import { searchNews } from "./news";

const NAVER = { headers: { referer: "https://finance.naver.com/" }, cache: "no-store" as const };

const ymd = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

export interface Candle {
  date: string; // YYYYMMDD
  close: number;
  vol: number;
}

// 네이버 일봉 (오래된→최신)
async function fetchHistory(code: string, days: number): Promise<Candle[]> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 864e5);
  try {
    const r = await fetch(
      `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${ymd(
        start,
      )}&endTime=${ymd(end)}&timeframe=day`,
      NAVER,
    );
    const rows = JSON.parse((await r.text()).replace(/'/g, '"').replace(/,\s*\]/g, "]"));
    return rows
      .slice(1)
      .map((x: unknown[]) => ({ date: String(x[0]), close: +(x[4] as number), vol: +(x[5] as number) }))
      .filter((c: Candle) => c.close > 0)
      .sort((a: Candle, b: Candle) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

// 코스피 지수 일별 등락률 맵 (YYYYMMDD → %). siseJson으로 전체 히스토리 한 번에.
async function fetchKospiMap(days: number): Promise<Record<string, number>> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 864e5);
  const map: Record<string, number> = {};
  try {
    const r = await fetch(
      `https://api.finance.naver.com/siseJson.naver?symbol=KOSPI&requestType=1&startTime=${ymd(
        start,
      )}&endTime=${ymd(end)}&timeframe=day`,
      NAVER,
    );
    const rows = JSON.parse((await r.text()).replace(/'/g, '"').replace(/,\s*\]/g, "]"))
      .slice(1)
      .map((x: unknown[]) => ({ date: String(x[0]), close: +(x[4] as number) }))
      .filter((c: { close: number }) => c.close > 0)
      .sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));
    for (let i = 1; i < rows.length; i++) {
      map[rows[i].date] = ((rows[i].close - rows[i - 1].close) / rows[i - 1].close) * 100;
    }
  } catch {}
  return map;
}

// 급등일의 뉴스 (네이버 검색). 날짜창 미지원 → 해당일 ±3일 근처 기사만 추림.
// (최근 급등일은 매칭되고, 아주 오래된 급등일은 최근 100건에 없어 비어있을 수 있음)
async function fetchDayNews(
  name: string,
  ymdDate: string,
): Promise<{ title: string; link: string }[]> {
  const y = +ymdDate.slice(0, 4),
    mo = +ymdDate.slice(4, 6),
    da = +ymdDate.slice(6, 8);
  const target = Date.UTC(y, mo - 1, da);
  const items = await searchNews(name, { display: 100, sort: "date" });
  return items
    .filter((x) => !Number.isNaN(x.ts) && Math.abs(x.ts - target) <= 3 * 864e5)
    .slice(0, 2)
    .map(({ title, link }) => ({ title, link }));
}

const CATEGORIES = ["실적", "공급계약·수주", "신제품·기술", "업황·테마", "지분·경영", "기타"];

// Groq로 각 급등일 재료 유형 분류(있으면). 실패 시 전부 "기타".
async function categorize(
  events: { i: number; date: string; headlines: string }[],
): Promise<Record<number, string>> {
  const fallback: Record<number, string> = {};
  for (const e of events) fallback[e.i] = "기타";
  if (!process.env.GROQ_API_KEY || events.length === 0) return fallback;
  try {
    const system = `너는 한국 주식 애널리스트다. 각 급등일의 뉴스 헤드라인을 보고 그날 상승의 재료 유형을 아래 중 하나로 분류한다.
유형: ${CATEGORIES.join(", ")}.
반드시 JSON만: {"results":[{"i":번호,"category":"유형"}]} — 모든 i에 대해.`;
    const user = events.map((e) => `[${e.i}] ${e.date}: ${e.headlines || "(뉴스 없음)"}`).join("\n");
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || "llama-3.3-70b-versatile",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      cache: "no-store",
    });
    const j = await r.json();
    const parsed = JSON.parse(j.choices[0].message.content) as {
      results?: { i: number; category: string }[];
    };
    const out = { ...fallback };
    for (const rr of parsed.results || []) {
      if (CATEGORIES.includes(rr.category)) out[rr.i] = rr.category;
    }
    return out;
  } catch {
    return fallback;
  }
}

export interface SurgeEvent {
  date: string; // YYYY-MM-DD
  chgPct: number; // 전일 대비 등락률
  volMultiple: number; // 직전 20일 평균 대비 거래량 배수
  marketPct: number | null; // 그날 코스피 등락률(시황)
  category: string;
  news: { title: string; link: string }[];
}

export interface CategoryStat {
  category: string;
  count: number;
  avgChg: number;
  avgVolMult: number;
}

export interface CatalystResult {
  code: string;
  name: string;
  fromDate: string;
  toDate: string;
  minChg: number;
  totalDays: number;
  events: SurgeEvent[]; // 최신순
  byCategory: CategoryStat[];
  avgChg: number;
  avgVolMult: number;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const fmtDate = (ymdStr: string) => `${ymdStr.slice(0, 4)}-${ymdStr.slice(4, 6)}-${ymdStr.slice(6, 8)}`;

export async function analyzeCatalysts(
  code: string,
  name: string,
  opts: { days?: number; minChg?: number; maxEvents?: number } = {},
): Promise<CatalystResult> {
  const days = opts.days ?? 1000;
  const minChg = opts.minChg ?? 10;
  const maxEvents = opts.maxEvents ?? 25;

  const [candles, kospi] = await Promise.all([fetchHistory(code, days), fetchKospiMap(days)]);
  if (candles.length < 25) {
    return {
      code, name, fromDate: "", toDate: "", minChg, totalDays: candles.length,
      events: [], byCategory: [], avgChg: 0, avgVolMult: 0,
    };
  }

  // 급등일 탐지: 전일 대비 등락률 >= minChg
  type Raw = { date: string; chg: number; volMult: number };
  const raws: Raw[] = [];
  for (let i = 1; i < candles.length; i++) {
    const chg = ((candles[i].close - candles[i - 1].close) / candles[i - 1].close) * 100;
    if (chg < minChg) continue;
    const prior = candles.slice(Math.max(0, i - 20), i).map((c) => c.vol);
    const volMult = prior.length ? candles[i].vol / avg(prior) : 0;
    raws.push({ date: candles[i].date, chg, volMult });
  }
  // 등락률 큰 순으로 상위 maxEvents만 뉴스 수집(호출량 제한)
  const picked = raws.sort((a, b) => b.chg - a.chg).slice(0, maxEvents);

  const withNews = await Promise.all(
    picked.map(async (r) => ({ ...r, news: await fetchDayNews(name, r.date) })),
  );
  const cats = await categorize(
    withNews.map((r, i) => ({ i, date: fmtDate(r.date), headlines: r.news.map((n) => n.title).join(" / ") })),
  );

  const events: SurgeEvent[] = withNews
    .map((r, i) => ({
      date: fmtDate(r.date),
      chgPct: r.chg,
      volMultiple: r.volMult,
      marketPct: kospi[r.date] ?? null,
      category: cats[i] ?? "기타",
      news: r.news,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  // 카테고리별 집계
  const byCat = new Map<string, SurgeEvent[]>();
  for (const e of events) {
    if (!byCat.has(e.category)) byCat.set(e.category, []);
    byCat.get(e.category)!.push(e);
  }
  const byCategory: CategoryStat[] = [...byCat.entries()]
    .map(([category, es]) => ({
      category,
      count: es.length,
      avgChg: avg(es.map((e) => e.chgPct)),
      avgVolMult: avg(es.map((e) => e.volMultiple)),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    code, name,
    fromDate: fmtDate(candles[0].date),
    toDate: fmtDate(candles[candles.length - 1].date),
    minChg,
    totalDays: candles.length,
    events,
    byCategory,
    avgChg: avg(events.map((e) => e.chgPct)),
    avgVolMult: avg(events.map((e) => e.volMultiple)),
  };
}

// 종목명 → 코드 자동완성 (네이버)
export async function searchStock(q: string): Promise<{ code: string; name: string; market: string }[]> {
  try {
    const r = await fetch(
      `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock&st=111`,
      { headers: { referer: "https://finance.naver.com/" }, cache: "no-store" },
    );
    const j = (await r.json()) as {
      items?: { code: string; name: string; typeName?: string }[];
    };
    return (j.items || [])
      .filter((it) => /^\d{6}$/.test(it.code))
      .slice(0, 8)
      .map((it) => ({ code: it.code, name: it.name, market: it.typeName || "" }));
  } catch {
    return [];
  }
}
