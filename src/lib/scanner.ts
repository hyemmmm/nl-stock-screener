// ──────────────────────────────────────────────────────────────────────────
// 재료 스캐너 (서버 전용).
//   등록된 '재료 규칙'별로 (1) 오늘 발동 여부 (2) 과거 이벤트 히스토리(종목별)를
//   보여준다. v1: "게임주 - 신작 출시 소식" 규칙 하나.
//   각 이벤트: 뉴스 날짜·세션(장중/장후)·헤드라인 + 주가 반응(종가/시가매수).
// ──────────────────────────────────────────────────────────────────────────

const NAVER = { headers: { referer: "https://finance.naver.com/" }, cache: "no-store" as const };
const ymd = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// v1 규칙: 게임주 + 신작/출시 키워드
export const GAME_STOCKS: { name: string; code: string }[] = [
  { name: "넥슨게임즈", code: "225570" },
  { name: "펄어비스", code: "263750" },
  { name: "크래프톤", code: "259960" },
  { name: "카카오게임즈", code: "293490" },
  { name: "위메이드", code: "112040" },
  { name: "네오위즈", code: "095660" },
];
const KW = /출시|신작|론칭|런칭|발매|사전\s?(예약|등록)|출격|글로벌\s?(서비스|출시)|공개|티저/;

interface Candle {
  date: string;
  open: number;
  close: number;
}

async function fetchPrices(code: string): Promise<Candle[]> {
  const end = new Date(),
    start = new Date();
  start.setDate(start.getDate() - 1000);
  try {
    const r = await fetch(
      `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${ymd(
        start,
      )}&endTime=${ymd(end)}&timeframe=day`,
      NAVER,
    );
    return JSON.parse((await r.text()).replace(/'/g, '"').replace(/,\s*\]/g, "]"))
      .slice(1)
      .map((x: unknown[]) => ({ date: String(x[0]), open: +(x[1] as number), close: +(x[4] as number) }))
      .filter((c: Candle) => c.close > 0 && c.open > 0)
      .sort((a: Candle, b: Candle) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

async function fetchNews(name: string, after?: string, before?: string) {
  const range = after && before ? ` after:${after} before:${before}` : "";
  try {
    const q = encodeURIComponent(`${name} 출시${range}`);
    const txt = await (
      await fetch(`https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`, {
        cache: "no-store",
      })
    ).text();
    const out: { ts: number; title: string; link: string }[] = [];
    for (const m of txt.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const b = m[1];
      const t = b.match(/<title>([^<]+)<\/title>/)?.[1];
      const pd = b.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1];
      const link = b.match(/<link>([^<]+)<\/link>/)?.[1] ?? "";
      if (t && pd) out.push({ ts: Date.parse(pd), title: t.replace(/&#39;/g, "'").replace(/&quot;/g, '"'), link });
    }
    return out;
  } catch {
    return [];
  }
}

export type Session = "장전" | "장중" | "장후" | "휴장";
export interface CatalystEvent {
  date: string; // 뉴스일 YYYY-MM-DD (KST)
  time: string; // HH:MM KST
  session: Session;
  title: string;
  link: string;
  closeReact: number | null; // 발표 반응: 전일종가→반응일종가 (%)
  openBuy: number | null; // 시가매수: 반응일 시가→종가 (%)
}
export interface StockHistory {
  name: string;
  code: string;
  events: CatalystEvent[];
}
export interface ScanResult {
  rule: string;
  today: { name: string; code: string; title: string; link: string }[];
  history: StockHistory[];
}

function analyze(px: Candle[], news: { ts: number; title: string; link: string }[]): CatalystEvent[] {
  const di: Record<string, number> = {};
  px.forEach((c, i) => (di[c.date] = i));
  const nextIdx = (y: string) => {
    for (let i = 0; i < px.length; i++) if (px[i].date > y) return i;
    return -1;
  };
  const hits = news.filter((x) => KW.test(x.title)).sort((a, b) => a.ts - b.ts);
  // 14일 에피소드로 묶기(같은 게임 반복 제거), 대표=첫 뉴스
  const eps: { ds: string; kd: Date; title: string; link: string }[] = [];
  let last: number | null = null;
  for (const it of hits) {
    const kd = new Date(it.ts + 9 * 3600e3);
    const ds = ymd(kd);
    const t = Date.UTC(+ds.slice(0, 4), +ds.slice(4, 6) - 1, +ds.slice(6, 8));
    if (last === null || t - last > 14 * 864e5) eps.push({ ds, kd, title: it.title, link: it.link });
    last = t;
  }
  return eps
    .map((e) => {
      const kh = e.kd.getUTCHours() + e.kd.getUTCMinutes() / 60;
      const wd = e.kd.getUTCDay();
      const trad = di[e.ds] != null;
      let session: Session, en: number;
      if (wd === 0 || wd === 6 || !trad) {
        session = "휴장";
        en = nextIdx(e.ds);
      } else if (kh < 9) {
        session = "장전";
        en = di[e.ds];
      } else if (kh <= 15.5) {
        session = "장중";
        en = nextIdx(e.ds);
      } else {
        session = "장후";
        en = nextIdx(e.ds);
      }
      const ok = en > 0 && en < px.length;
      return {
        date: iso(e.kd),
        time: `${String(Math.floor(kh)).padStart(2, "0")}:${String(Math.round((kh % 1) * 60)).padStart(2, "0")}`,
        session,
        title: e.title,
        link: e.link,
        closeReact: ok ? (px[en].close / px[en - 1].close - 1) * 100 : null,
        openBuy: ok ? (px[en].close / px[en].open - 1) * 100 : null,
      };
    })
    .reverse(); // 최신순
}

export async function scanGameCatalyst(): Promise<ScanResult> {
  const now = new Date();
  const windows: [string, string][] = [];
  let c = new Date(2023, 10, 1);
  while (c < now) {
    const nx = new Date(c);
    nx.setMonth(nx.getMonth() + 4);
    windows.push([iso(c), iso(nx)]);
    c = nx;
  }
  const cutoffRecent = now.getTime() - 3 * 864e5;

  const history: StockHistory[] = [];
  const today: ScanResult["today"] = [];

  await Promise.all(
    GAME_STOCKS.map(async ({ name, code }) => {
      const [px, recent, ...windowed] = await Promise.all([
        fetchPrices(code),
        fetchNews(name), // 최근(오늘 체크용)
        ...windows.map(([a, b]) => fetchNews(name, a, b)),
      ]);
      const allNews = windowed.flat();
      const events = px.length > 30 ? analyze(px, allNews) : [];
      history.push({ name, code, events });
      // 오늘/최근 발동: 최근 3일 내 키워드 매칭 뉴스
      const hit = recent
        .filter((x) => KW.test(x.title) && x.ts >= cutoffRecent)
        .sort((a, b) => b.ts - a.ts)[0];
      if (hit) today.push({ name, code, title: hit.title, link: hit.link });
    }),
  );

  history.sort(
    (a, b) => GAME_STOCKS.findIndex((s) => s.code === a.code) - GAME_STOCKS.findIndex((s) => s.code === b.code),
  );
  return { rule: "게임주 — 신작 출시 소식", today, history };
}
