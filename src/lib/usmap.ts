// ──────────────────────────────────────────────────────────────────────────
// 🇺🇸 → 🇰🇷 미장 테마 지도
//   간밤 미국에서 뭐가 떴는지(테마 ETF 등락률) → 같은 테마의 국내 종목은 뭔지
//   → 그 테마의 대장주(시총 1위)와 오늘 주도주(등락률 1위)까지.
//   ※ 검증 결과 연동은 대부분 '갭'에서 소화된다. 매수 신호가 아니라 지도로 쓸 것.
// ──────────────────────────────────────────────────────────────────────────
import { fetchThemes, fetchThemeStocks } from "./issues";

const UA = { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" as const };
const NH = { headers: { referer: "https://finance.naver.com/", "User-Agent": "Mozilla/5.0" }, cache: "no-store" as const };
const num = (s?: string) => (s ? parseFloat(String(s).replace(/,/g, "")) : NaN);

// 미국 테마 ↔ 네이버 테마명 매칭 규칙.
//   ETF 하나로 테마를 대표시키면 소수 종목에 몰린 테마를 통째로 놓친다.
//   (예: 8/3 희토류 — MP +6.0% / USAR +6.1% / UUUU +6.2%인데 REMX는 +2.5%.
//    REMX가 중국·호주 리튬주 비중이 커서 미국 희토류 랠리를 희석시켰다.)
//   → ETF + 주도 개별주 바스켓의 **중앙값**으로 본다.
const MAP: { syms: string[]; label: string; re: RegExp }[] = [
  { syms: ["SMH", "TSM", "AVGO", "MU"],       label: "반도체",        re: /반도체|파운드리|웨이퍼|비메모리|시스템반도체/ },
  { syms: ["NVDA", "AMD", "PLTR", "AIQ"],     label: "AI·GPU",       re: /AI|인공지능|HBM|온디바이스|데이터센터|GPU|CXL/ },
  { syms: ["SKYY", "ORCL", "SNOW"],           label: "클라우드",       re: /클라우드|데이터센터|서버/ },
  { syms: ["BOTZ", "ISRG", "SERV"],           label: "로봇",          re: /로봇/ },
  { syms: ["QTUM", "IONQ", "RGTI", "QBTS"],   label: "양자컴퓨팅",     re: /양자/ },
  { syms: ["CIBR", "CRWD", "PANW"],           label: "사이버보안",     re: /보안|사이버/ },
  { syms: ["LIT", "ALB", "SQM", "ENS"],       label: "2차전지",       re: /2차전지|이차전지|전기차|리튬|폐배터리|전해질|양극재|음극재/ },
  { syms: ["DRIV", "TSLA", "MBLY"],           label: "자율주행",       re: /자율주행|스마트카|전장/ },
  { syms: ["CARZ", "GM", "F"],                label: "자동차",        re: /자동차|타이어/ },
  { syms: ["XBI", "IBB", "MRNA"],             label: "바이오",        re: /제약|바이오|임상|신약|줄기세포|유전자|항암/ },
  { syms: ["IHI", "ISRG", "SYK"],             label: "의료기기",       re: /의료기기|헬스케어|치과|미용|덴탈/ },
  { syms: ["ITA", "LMT", "RTX", "NOC"],       label: "방산",          re: /방위산업|방산|무기|전투기/ },
  { syms: ["UFO", "RKLB", "LUNR", "ASTS"],    label: "우주·위성",      re: /우주|위성|항공/ },
  { syms: ["URA", "CCJ", "OKLO", "SMR"],      label: "원자력·우라늄",   re: /원자력|원전|우라늄|SMR/ },
  { syms: ["TAN", "FSLR", "ENPH"],            label: "태양광",        re: /태양광|태양열/ },
  { syms: ["ICLN", "NEE", "BEP"],             label: "신재생",        re: /풍력|신재생|재생에너지|ESS/ },
  { syms: ["PLUG", "BE", "BLDP"],             label: "수소",          re: /수소|연료전지/ },
  { syms: ["XLE", "XOM", "SLB"],              label: "에너지·정유",    re: /석유|정유|가스|LNG|셰일/ },
  { syms: ["XLU", "VST", "GEV"],              label: "전력·유틸리티",  re: /전력|전선|스마트그리드|송배전|변압기/ },
  { syms: ["XLB", "DOW", "NUE"],              label: "소재·화학",      re: /화학|철강|비철|시멘트|정밀화학/ },
  { syms: ["REMX", "MP", "USAR", "UUUU"],     label: "희토류·광물",    re: /희토류|니켈|광물|마그네슘/ },
  { syms: ["GLD", "NEM", "GDX"],              label: "금",            re: /금|귀금속/ },
  { syms: ["BOAT", "ZIM", "MATX"],            label: "해운·조선",      re: /해운|조선|물류|항만/ },
  { syms: ["XLF", "JPM", "GS"],               label: "금융",          re: /은행|증권|보험|금융지주|카드/ },
  { syms: ["XLRE", "CAT", "VMC"],             label: "건설·부동산",    re: /건설|부동산|리츠|건자재/ },
  { syms: ["XLI", "DE", "ETN"],               label: "기계·산업재",    re: /기계|중장비|공작기계|공작/ },
  { syms: ["ESPO", "EA", "RBLX"],             label: "게임",          re: /게임|메타버스/ },
  { syms: ["XLC", "NFLX", "DIS"],             label: "미디어·엔터",    re: /엔터테인먼트|미디어|영화|음원|드라마|광고|웹툰/ },
  { syms: ["XLY", "AMZN", "LULU"],            label: "소비재·유통",    re: /백화점|소매유통|화장품|의류|면세/ },
  { syms: ["XLP", "KO", "PEP"],               label: "음식료",        re: /음식료|식품|주류|담배|사료/ },
  { syms: ["MOO", "MOS", "CF"],               label: "농업·비료",      re: /비료|농업|곡물|농기계/ },
  { syms: ["IBIT", "MSTR", "COIN"],           label: "비트코인",       re: /가상화폐|비트코인|블록체인|암호화폐/ },
];

// ── 미국: 최근 세션 등락률 ────────────────────────────────────────────────
export interface UsTicker {
  sym: string;
  pct: number;
}
export interface UsTheme {
  sym: string; // 대표 심볼 (바스켓 첫 번째)
  label: string;
  pct: number | null; // 바스켓 중앙값
  date: string; // 해당 미국 거래일 (YYYY-MM-DD)
  tickers: UsTicker[]; // 구성 심볼별 등락률 (내림차순) — 뭐가 끌었는지 보이게
}

async function fetchOne(sym: string): Promise<{ pct: number; date: string } | null> {
  try {
    const j = (await (
      await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=5d&interval=1d`, UA)
    ).json()) as {
      chart?: {
        result?: {
          timestamp?: number[];
          indicators?: { quote?: { close?: (number | null)[] }[] };
          meta?: { regularMarketPrice?: number; regularMarketTime?: number };
        }[];
      };
    };
    const q = j.chart?.result?.[0];
    const closes = q?.indicators?.quote?.[0]?.close;
    if (!q?.timestamp || !closes) return null;
    const rows = q.timestamp
      .map((t, i) => ({ t, c: closes[i] }))
      .filter((x): x is { t: number; c: number } => x.c != null);
    if (!rows.length) return null;
    const last = rows[rows.length - 1];
    const lastDay = new Date(last.t * 1000).toISOString().slice(0, 10);

    // 야후는 최신 세션 봉을 timestamp엔 넣고 close는 null로 둔 채 한동안 놔둔다.
    // 그대로 쓰면 하루 밀린 등락률이 나오므로, meta의 현재가로 최신 세션을 직접 계산한다.
    const mp = q.meta?.regularMarketPrice;
    const mt = q.meta?.regularMarketTime;
    if (mp && mt) {
      const mDay = new Date(mt * 1000).toISOString().slice(0, 10);
      if (mDay > lastDay) return { pct: (mp / last.c - 1) * 100, date: mDay };
    }
    if (rows.length < 2) return null;
    return { pct: (last.c / rows[rows.length - 2].c - 1) * 100, date: lastDay };
  } catch {
    return null;
  }
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function fetchUs(): Promise<UsTheme[]> {
  // 심볼은 테마 간 중복되므로(ISRG 등) 한 번씩만 조회한다.
  const syms = [...new Set(MAP.flatMap((m) => m.syms))];
  const got = new Map<string, { pct: number; date: string }>();
  for (let i = 0; i < syms.length; i += 20) {
    const part = syms.slice(i, i + 20);
    const rs = await Promise.all(part.map(fetchOne));
    part.forEach((s, k) => {
      if (rs[k]) got.set(s, rs[k]!);
    });
  }
  return MAP.map(({ syms: ss, label }) => {
    const tickers = ss
      .map((s) => ({ sym: s, r: got.get(s) }))
      .filter((x): x is { sym: string; r: { pct: number; date: string } } => !!x.r)
      .map((x) => ({ sym: x.sym, pct: x.r.pct, date: x.r.date }));
    if (!tickers.length) return { sym: ss[0], label, pct: null, date: "", tickers: [] };
    // 중앙값: ETF 한 종목이 테마를 희석시키거나, 잡주 하나가 테마를 부풀리는 걸 둘 다 막는다.
    return {
      sym: ss[0],
      label,
      pct: median(tickers.map((t) => t.pct)),
      date: tickers[0].date,
      tickers: tickers.map(({ sym, pct }) => ({ sym, pct })).sort((a, b) => b.pct - a.pct),
    };
  });
}

// ── 국내: 테마 구성종목의 시세·시총 (벌크) ─────────────────────────────────
interface Quote {
  code: string;
  name: string;
  pct: number;
  value: number; // 거래대금(원)
  mcap: number; // 시가총액(원)
}
async function bulkQuotes(codes: string[]): Promise<Map<string, Quote>> {
  const map = new Map<string, Quote>();
  const chunks: string[] = [];
  for (let i = 0; i < codes.length; i += 80) chunks.push(codes.slice(i, i + 80).join(","));
  for (let i = 0; i < chunks.length; i += 8) {
    const rs = await Promise.all(
      chunks.slice(i, i + 8).map((q) =>
        fetch(`https://polling.finance.naver.com/api/realtime/domestic/stock/${q}`, NH)
          .then((r) => r.json())
          .catch(() => ({ datas: [] })),
      ),
    );
    for (const r of rs as { datas?: Record<string, string>[] }[]) {
      for (const d of r.datas ?? []) {
        map.set(d.itemCode, {
          code: d.itemCode,
          name: d.stockName,
          pct: num(d.fluctuationsRatioRaw ?? d.fluctuationsRatio) || 0,
          value: num(d.accumulatedTradingValueRaw) || 0,
          mcap: num(d.marketValueFullRaw) || 0,
        });
      }
    }
  }
  return map;
}

// ── 조립 ──────────────────────────────────────────────────────────────────
export interface KrTheme {
  no: string;
  name: string;
  chg: number; // 오늘 테마 등락률
  big: Quote | null; // 대장주 = 시가총액 1위 (평소의 대표주)
  leader: Quote | null; // 오늘 주도주 = 거래대금 상위 중 등락률 1위
  stocks: Quote[]; // 등락률 내림차순
}
export interface UsMapRow extends UsTheme {
  kr: KrTheme[];
}
export interface UsMapResult {
  usDate: string;
  krDate: string;
  rows: UsMapRow[];
  note?: string;
}

export async function getUsMap(): Promise<UsMapResult> {
  const [us, themes] = await Promise.all([fetchUs(), fetchThemes()]);

  // 미국 테마별로 매칭되는 국내 테마를 고른다. 오늘 많이 오른 테마 순으로 최대 3개.
  const picked = new Map<string, { no: string; name: string; chg: number }>();
  const rowThemes = new Map<string, string[]>(); // sym → theme no[]
  for (const u of us) {
    const rule = MAP.find((m) => m.label === u.label)!;
    const hit = themes
      .filter((t) => rule.re.test(t.name))
      .sort((a, b) => b.chg - a.chg)
      .slice(0, 3);
    rowThemes.set(u.label, hit.map((t) => t.no));
    for (const t of hit) picked.set(t.no, t);
  }

  // 선택된 테마의 구성종목을 모아 한 번에 시세 조회 (중복 종목은 자동으로 합쳐짐)
  const consts = new Map<string, string[]>(); // theme no → codes
  const list = [...picked.values()];
  for (let i = 0; i < list.length; i += 8) {
    await Promise.all(
      list.slice(i, i + 8).map(async (t) => {
        const ss = await fetchThemeStocks(t.no).catch(() => []);
        consts.set(t.no, ss.map((s) => s.code));
      }),
    );
  }
  const quotes = await bulkQuotes([...new Set([...consts.values()].flat())]);

  const krOf = (no: string): KrTheme | null => {
    const t = picked.get(no);
    if (!t) return null;
    const ss = (consts.get(no) ?? [])
      .map((c) => quotes.get(c))
      .filter((x): x is Quote => !!x)
      .sort((a, b) => b.pct - a.pct);
    if (!ss.length) return null;
    // 대장주: 시총 1위 — 테마를 떠올렸을 때 나오는 그 종목.
    const big = [...ss].sort((a, b) => b.mcap - a.mcap)[0] ?? null;
    // 오늘 주도주: 등락률만 보면 품절주·잡주가 1위가 되므로 거래대금 상위 절반에서 고른다.
    const byValue = [...ss].sort((a, b) => b.value - a.value);
    const liquid = byValue.slice(0, Math.max(3, Math.ceil(byValue.length / 2)));
    const leader = [...liquid].sort((a, b) => b.pct - a.pct)[0] ?? null;
    return { no, name: t.name, chg: t.chg, big, leader, stocks: ss.slice(0, 10) };
  };

  const rows: UsMapRow[] = us
    .map((u) => ({
      ...u,
      kr: (rowThemes.get(u.label) ?? []).map(krOf).filter((x): x is KrTheme => !!x),
    }))
    .sort((a, b) => (b.pct ?? -99) - (a.pct ?? -99));

  const kst = new Date(Date.now() + 9 * 3600e3);
  // 심볼마다 반영 시점이 조금씩 달라서, 헤더엔 가장 흔한 날짜를 쓴다(행별 날짜는 따로 표시).
  const dcount = new Map<string, number>();
  for (const r of rows) if (r.date) dcount.set(r.date, (dcount.get(r.date) ?? 0) + 1);
  const usDate = [...dcount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  return {
    usDate,
    krDate: kst.toISOString().slice(0, 10),
    rows,
    note: themes.length ? undefined : "네이버 테마 목록을 불러오지 못했습니다",
  };
}
