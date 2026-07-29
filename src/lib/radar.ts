// ──────────────────────────────────────────────────────────────────────────
// 오늘의 재료 레이더 (서버 전용).
//   "어제까지 없던, 오늘 새로 생긴/사라진 구조적 변화"를 감지 → 관련주까지.
//   핵심: 예정된·이미 알려진 재료는 빼고, 내일 반영될 '서프라이즈'만.
//   뉴스(네이버) → Groq 선별 + 관련주 후보 → 회사명을 종목코드로 확정.
// ──────────────────────────────────────────────────────────────────────────
import { searchNews } from "./news";
import { searchStock } from "./catalyst";

// "없다가 생긴 것 / 있다가 사라진 것" 신호 검색어
const SIGNAL_QUERIES = [
  "규제 완화",
  "규제 폐지",
  "허용",
  "최초 승인",
  "허가 획득",
  "대규모 수주",
  "공급 계약",
  "정부 지원",
  "관세",
  "의무화",
  "확산",
  "긴급 도입",
];

// 방금 지난 15:30 KST(장마감). 마감 전이면 전 거래일 마감.
function lastCloseMs(): number {
  const now = Date.now();
  const kst = new Date(now + 9 * 3600e3);
  let cut = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), 6, 30, 0);
  if (now < cut) cut -= 86400e3;
  return cut;
}

export interface RadarStock {
  name: string;
  code: string;
}
export interface Catalyst {
  title: string; // 재료(오늘 생긴 사건)
  type: string; // 없다가 생김 / 있다가 사라짐 / 발생·확산 / 정책·규제 등
  why: string; // 왜 오르나(한 줄)
  sector: string; // 관련 업종/테마
  stocks: RadarStock[];
  link: string; // 근거 기사
}
export interface RadarResult {
  since: string; // "7/29 15:30" 이후 뉴스 반영
  catalysts: Catalyst[];
}

interface RawCatalyst {
  title: string;
  type: string;
  why: string;
  sector: string;
  stocks: string[]; // 회사명 후보
  headline: string; // 근거로 삼은 헤드라인
}

async function pickCatalysts(headlines: { title: string; link: string }[], since: string) {
  if (!process.env.GROQ_API_KEY || headlines.length === 0) return [] as RawCatalyst[];
  const system = `너는 한국 주식 애널리스트다. 아래는 직전 장마감(${since}) 이후 나온 뉴스 헤드라인이다.
이 중에서 "어제까지 없던, 오늘 새로 생기거나 사라진 구조적 변화"로 내일 한국 증시의 특정 업종·테마를 움직일 재료를 최대 5개 고른다.

★ 반드시 '변화'여야 한다: 규제가 새로 생기거나 없어짐 / 최초 허용·금지 / 신규 발생·확산 / 갑작스런 대형 계약·수주 / 관세 신설·철폐 등. ("없다가 생긴 것 / 있다가 사라진 것")
★ 이미 예정됐거나 다 알려진 이벤트(예정된 출시·정기 실적·기존 진행사항)는 제외.
★ 각 재료에 관련 '상장사' 2~4개를 제시한다. 코로나→씨젠(진단)뿐 아니라 인테리어·홈트처럼 파급되는 종목까지 상상해서 넣어라. 실제 한국 상장사 이름으로.
★ 재료가 없으면 빈 배열.

반드시 JSON만:
{"catalysts":[{"title":"재료 한 줄","type":"없다가 생김|있다가 사라짐|발생·확산|정책·규제|계약·수주|기타","why":"내일 왜 오를지 한 줄","sector":"관련 업종/테마","stocks":["회사명1","회사명2"],"headline":"근거로 삼은 헤드라인 원문"}]}`;
  const user = headlines.map((h, i) => `[${i}] ${h.title}`).join("\n");
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, "content-type": "application/json" },
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
    return (JSON.parse(j.choices[0].message.content).catalysts || []) as RawCatalyst[];
  } catch {
    return [];
  }
}

export async function detectCatalysts(): Promise<RadarResult> {
  const cutoff = lastCloseMs();
  const c = new Date(cutoff + 9 * 3600e3);
  const since = `${c.getUTCMonth() + 1}/${c.getUTCDate()} 15:30`;

  // 1) 신호 검색어로 오늘 뉴스 수집(마감 후, 최신)
  const lists = await Promise.all(SIGNAL_QUERIES.map((q) => searchNews(q, { display: 20, sort: "date" })));
  const seen = new Set<string>();
  const headlines: { title: string; link: string }[] = [];
  for (const list of lists) {
    for (const x of list) {
      if (!Number.isNaN(x.ts) && x.ts < cutoff) continue;
      if (seen.has(x.title)) continue;
      seen.add(x.title);
      headlines.push({ title: x.title, link: x.link });
    }
  }
  const capped = headlines.slice(0, 70);

  // 2) Groq가 '오늘 새로 생긴 재료' 선별 + 관련주 후보
  const raw = await pickCatalysts(capped, since);

  // 3) 관련주 회사명 → 종목코드 확정(안 잡히면 제외)
  const names = [...new Set(raw.flatMap((r) => r.stocks || []))].slice(0, 40);
  const codeMap: Record<string, string> = {};
  await Promise.all(
    names.map(async (n) => {
      const hits = await searchStock(n);
      if (hits[0]) codeMap[n] = hits[0].code;
    }),
  );

  const linkOf = (headline: string) =>
    headlines.find((h) => h.title === headline)?.link ??
    headlines.find((h) => headline && h.title.includes(headline.slice(0, 12)))?.link ??
    "";

  const catalysts: Catalyst[] = raw.slice(0, 5).map((r) => ({
    title: r.title,
    type: r.type || "기타",
    why: r.why,
    sector: r.sector || "",
    stocks: (r.stocks || [])
      .map((n) => ({ name: n, code: codeMap[n] || "" }))
      .filter((s) => s.code),
    link: linkOf(r.headline),
  }));

  return { since, catalysts };
}

// ── 어제 재료 → 오늘 결과 검증 ──────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");
async function fetchDaily(code: string): Promise<{ date: string; open: number; close: number }[]> {
  const end = new Date(),
    start = new Date();
  start.setDate(start.getDate() - 20);
  const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  try {
    const r = await fetch(
      `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${ymd(
        start,
      )}&endTime=${ymd(end)}&timeframe=day`,
      { headers: { referer: "https://finance.naver.com/" }, cache: "no-store" },
    );
    return JSON.parse((await r.text()).replace(/'/g, '"').replace(/,\s*\]/g, "]"))
      .slice(1)
      .map((x: unknown[]) => ({ date: String(x[0]), open: +(x[1] as number), close: +(x[4] as number) }))
      .filter((c: { close: number }) => c.close > 0)
      .sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

export interface ValidatedStock {
  name: string;
  code: string;
  changePct: number | null; // 전일종가 대비 오늘 종가
  openBuyPct: number | null; // 오늘 시가 매수 → 종가
}
export interface ValidatedCatalyst {
  title: string;
  type: string;
  sector: string;
  stocks: ValidatedStock[];
  link: string;
}
export interface ValidateResult {
  forDate: string; // 검증 대상일(오늘) M/D
  since: string; // 재료 수집 기준(어제) M/D
  catalysts: ValidatedCatalyst[];
  ready: boolean; // 오늘 종가 데이터 있는지
}

export async function validateYesterday(): Promise<ValidateResult> {
  const kst = new Date(Date.now() + 9 * 3600e3);
  const Y = kst.getUTCFullYear(),
    M = kst.getUTCMonth(),
    D = kst.getUTCDate();
  const todayOpen = Date.UTC(Y, M, D, 0, 0, 0); // 09:00 KST
  const yStart = Date.UTC(Y, M, D - 1, 0, 0, 0); // 어제 00:00 KST
  const todayYmd = `${Y}${pad(M + 1)}${pad(D)}`;

  // 어제~오늘개장전 재료성 헤드라인
  const lists = await Promise.all(SIGNAL_QUERIES.map((q) => searchNews(q, { display: 100, sort: "date" })));
  const seen = new Set<string>();
  const heads: { title: string; link: string }[] = [];
  for (const list of lists) {
    for (const x of list) {
      if (Number.isNaN(x.ts) || x.ts < yStart || x.ts > todayOpen) continue;
      if (seen.has(x.title)) continue;
      seen.add(x.title);
      heads.push({ title: x.title, link: x.link });
    }
  }
  const raw = await pickCatalysts(heads.slice(0, 70), `${M + 1}/${D - 1} 15:30`);

  const names = [...new Set(raw.flatMap((r) => r.stocks || []))].slice(0, 40);
  const codeMap: Record<string, string> = {};
  await Promise.all(
    names.map(async (n) => {
      const hits = await searchStock(n);
      if (hits[0]) codeMap[n] = hits[0].code;
    }),
  );
  const codes = [...new Set(Object.values(codeMap))];
  const pxMap: Record<string, { date: string; open: number; close: number }[]> = {};
  await Promise.all(codes.map(async (c) => (pxMap[c] = await fetchDaily(c))));

  let ready = false;
  const move = (code: string): { changePct: number | null; openBuyPct: number | null } => {
    const rows = pxMap[code];
    if (!rows) return { changePct: null, openBuyPct: null };
    const ti = rows.findIndex((r) => r.date === todayYmd);
    if (ti < 1) return { changePct: null, openBuyPct: null };
    ready = true;
    return {
      changePct: (rows[ti].close / rows[ti - 1].close - 1) * 100,
      openBuyPct: (rows[ti].close / rows[ti].open - 1) * 100,
    };
  };

  const linkOf = (headline: string) =>
    heads.find((h) => h.title === headline)?.link ??
    heads.find((h) => headline && h.title.includes(headline.slice(0, 12)))?.link ??
    "";

  const catalysts: ValidatedCatalyst[] = raw
    .slice(0, 6)
    .map((r) => ({
      title: r.title,
      type: r.type || "기타",
      sector: r.sector || "",
      stocks: (r.stocks || [])
        .map((n) => ({ name: n, code: codeMap[n] || "", ...move(codeMap[n] || "") }))
        .filter((s) => s.code),
      link: linkOf(r.headline),
    }))
    .filter((c) => c.stocks.length);

  return { forDate: `${M + 1}/${D}`, since: `${M + 1}/${D - 1}`, catalysts, ready };
}
