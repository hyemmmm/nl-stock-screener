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
// 신작 출시가 아닌 명백한 노이즈 (DLC·굿즈·업데이트·음원·콜라보·실적·코인 등)
const EXCLUDE =
  /DLC|굿즈|도시락|음원|이모티콘|업데이트|스킨|코스튬|콜라보|협업|스테이블\s?코인|메인넷|목표가|실적|리포트|서포트\s?카드|액세서리|현대카드|블록체인|웹3|NFT|밈코인|정령|굿즈|한국여행/i;
// Groq 없을 때 폴백(대략적)
const STRICT = /신작|정식\s?출시|글로벌\s?(출시|서비스)|사전\s?(예약|등록)|출시일|퍼블리싱/;
// 특정 게임명이 아닌 뭉뚱그린 표현 (진짜 '한 게임 최초 언급'이 아님)
const GENERIC = /라인업|미공개|여러|다수|^신작$|^-?$/;

// Groq로 "진짜 신작 게임 출시/발표"인지 판별 (아니면 폴백 키워드).
async function classifyNewGame(titles: string[]): Promise<{ isNew: boolean; game: string }[]> {
  const fb = () => titles.map((t) => ({ isNew: STRICT.test(t), game: "" }));
  if (!process.env.GROQ_API_KEY || titles.length === 0) return fb();
  try {
    const sys = `너는 게임주 애널리스트다. 각 헤드라인이 "새 게임(신작)의 출시 또는 출시 관련 발표(정식출시/글로벌출시/사전예약/출시일 확정/퍼블리싱 계약/신작 공개)"인지 판별하라.
DLC·업데이트·스킨·굿즈·음원·콜라보·이모티콘·실적·목표가·코인/블록체인·기존게임 이벤트/근황은 전부 false.
JSON만: {"results":[{"i":번호,"isNew":true/false,"game":"게임명 또는 -"}]} — 모든 i에 대해.`;
    const user = titles.map((t, i) => `[${i}] ${t}`).join("\n");
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || "llama-3.3-70b-versatile",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
      cache: "no-store",
    });
    const j = await r.json();
    const parsed = JSON.parse(j.choices[0].message.content) as {
      results?: { i: number; isNew: boolean; game: string }[];
    };
    const out = titles.map(() => ({ isNew: false, game: "" }));
    for (const rr of parsed.results || [])
      if (rr.i >= 0 && rr.i < out.length)
        out[rr.i] = { isNew: !!rr.isNew, game: rr.game && rr.game !== "-" ? rr.game : "" };
    return out;
  } catch {
    return fb();
  }
}

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

// 게임명으로 검색해 '최초 언급' 시각(ms). 최초 공개일 판별용.
async function firstMentionTs(game: string): Promise<number | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const q = encodeURIComponent(`"${game}"`);
    const txt = await (
      await fetch(`https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`, {
        cache: "no-store",
        signal: ctrl.signal,
      })
    ).text();
    let min = Infinity;
    for (const m of txt.matchAll(/<pubDate>([^<]+)<\/pubDate>/g)) {
      const ts = Date.parse(m[1]);
      if (!Number.isNaN(ts) && ts < min) min = ts;
    }
    return min === Infinity ? null : min;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type Session = "장전" | "장중" | "장후" | "휴장";
export interface CatalystEvent {
  date: string; // 뉴스일 YYYY-MM-DD (KST)
  time: string; // HH:MM KST
  session: Session;
  title: string;
  link: string;
  game: string; // Groq가 뽑은 게임명
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
  today: { name: string; code: string; title: string; link: string; game: string }[];
  history: StockHistory[];
}

function analyze(px: Candle[], news: { ts: number; title: string; link: string }[]): CatalystEvent[] {
  const di: Record<string, number> = {};
  px.forEach((c, i) => (di[c.date] = i));
  const nextIdx = (y: string) => {
    for (let i = 0; i < px.length; i++) if (px[i].date > y) return i;
    return -1;
  };
  const hits = news
    .filter((x) => KW.test(x.title) && !EXCLUDE.test(x.title))
    .sort((a, b) => a.ts - b.ts);
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
        game: "",
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
  const todayCand: ScanResult["today"] = [];

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
      // 오늘/최근 발동 후보: 최근 3일 내 키워드 매칭 뉴스
      const hit = recent
        .filter((x) => KW.test(x.title) && !EXCLUDE.test(x.title) && x.ts >= cutoffRecent)
        .sort((a, b) => b.ts - a.ts)[0];
      if (hit) todayCand.push({ name, code, title: hit.title, link: hit.link, game: "" });
    }),
  );

  history.sort(
    (a, b) => GAME_STOCKS.findIndex((s) => s.code === a.code) - GAME_STOCKS.findIndex((s) => s.code === b.code),
  );

  // Groq로 "진짜 신작 출시"만 남기기 (히스토리 이벤트 + 오늘 후보 한 번에)
  const allTitles = [...history.flatMap((s) => s.events.map((e) => e.title)), ...todayCand.map((t) => t.title)];
  const cls = await classifyNewGame(allTitles);
  let gi = 0;
  for (const s of history) {
    const kept: CatalystEvent[] = [];
    for (const e of s.events) {
      const c = cls[gi++];
      if (c.isNew) kept.push({ ...e, game: c.game });
    }
    s.events = kept;
  }
  const today: ScanResult["today"] = [];
  for (const t of todayCand) {
    const c = cls[gi++];
    if (c.isNew) today.push({ ...t, game: c.game });
  }

  // 게임별 '최초 언급일' 조회 → 처음 언급되는 게임만 남김 (재탕·후속 소식 제외)
  const games = [
    ...new Set(
      [...history.flatMap((s) => s.events.map((e) => e.game)), ...today.map((t) => t.game)].filter(Boolean),
    ),
  ].slice(0, 60);
  const firstMap: Record<string, number | null> = {};
  await Promise.all(games.map(async (g) => (firstMap[g] = await firstMentionTs(g))));
  const DAY = 864e5;
  const evTs = (d: string) => Date.parse(`${d}T00:00:00+09:00`);

  for (const s of history) {
    // 종목·게임별 최초 이벤트만 남기고, 그게 게임 최초 언급 근처일 때만(=이 종목이 데뷔시킨 게임)
    const byGame = new Map<string, CatalystEvent>();
    for (const e of s.events) {
      if (!e.game || GENERIC.test(e.game)) continue;
      const prev = byGame.get(e.game);
      if (!prev || e.date < prev.date) byGame.set(e.game, e);
    }
    s.events = [...byGame.values()]
      .filter((e) => {
        const fs = firstMap[e.game];
        return fs == null || evTs(e.date) - fs <= 12 * DAY;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  const nowTs = Date.now();
  const todayFresh = today.filter((t) => {
    const fs = firstMap[t.game];
    return t.game && !GENERIC.test(t.game) && fs != null && nowTs - fs <= 4 * DAY; // 최근에 '처음' 언급된 게임만
  });

  return { rule: "게임주 — 신작 출시 소식", today: todayFresh, history };
}
