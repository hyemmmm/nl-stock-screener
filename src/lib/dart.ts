// ──────────────────────────────────────────────────────────────────────────
// 오늘의 공시 재료 (서버 전용) — DART 전자공시.
//   오늘 올라온 공시 중 '재료성'(계약·수주·증자·임상·투자·특허 등)만 추려서
//   관련 종목과 함께. 공시엔 종목코드가 들어있어 뉴스보다 정확.
//   무료 키: DART_API_KEY (opendart.fss.or.kr). 데이터센터에서도 잘 됨.
// ──────────────────────────────────────────────────────────────────────────

import { searchNews } from "./news";

const BASE = "https://opendart.fss.or.kr/api";

export type Dir = "호재" | "악재" | "중립";
// 재료성 공시 유형 + 방향 (순서 중요: 악재 자사주처분/해지를 취득보다 먼저)
const CATS: { t: string; dir: Dir; re: RegExp }[] = [
  { t: "자사주처분", dir: "악재", re: /자기주식.*(처분|신탁계약\s?해지|해지)/ },
  { t: "유상증자", dir: "악재", re: /유상증자/ },
  { t: "CB·BW", dir: "악재", re: /전환사채|신주인수권부사채|교환사채/ },
  { t: "감자", dir: "악재", re: /감자\s?결정/ },
  { t: "계약·수주", dir: "호재", re: /공급계약|단일판매|수주|납품|판매계약/ },
  { t: "임상·허가", dir: "호재", re: /임상|품목허가|허가|승인|식약처|FDA/ },
  { t: "자사주취득", dir: "호재", re: /자기주식.*취득/ },
  { t: "투자·M&A", dir: "호재", re: /타법인.*(취득|출자)|영업양수|시설투자|신규\s?투자|지분\s?인수/ },
  { t: "특허·기술", dir: "호재", re: /특허권|기술이전|기술수출|라이선스/ },
  { t: "무상증자", dir: "호재", re: /무상증자/ },
  { t: "국책·정부", dir: "호재", re: /국책|정부과제|국가과제|과제\s?선정/ },
  { t: "합병", dir: "중립", re: /합병\s?결정|분할\s?결정/ },
];
// 재료 아님(루틴/행정)
const EXCLUDE =
  /소유상황보고서|대량보유|소유주식\s?변동|특정증권등소유|임원ㆍ주요주주|기업설명회|IR개최|주주총회소집|실적공시\s?예고|투자설명서|사업보고서|분기보고서|반기보고서|감사보고서|증권신고서|일괄신고|주식등의대량|의결권|발행결과|청약결과/;
// 새 재료만 — 정정/재공시 제외
const REFILE = /정정|첨부정정|기재정정/;

function classify(nm: string): { t: string; dir: Dir } | null {
  if (EXCLUDE.test(nm) || REFILE.test(nm)) return null;
  for (const c of CATS) if (c.re.test(nm)) return { t: c.t, dir: c.dir };
  return null;
}

export interface Disclosure {
  code: string;
  name: string;
  corp: string; // DART corp_code (반복성 조회용)
  title: string;
  type: string;
  dir: Dir;
  link: string;
}
export interface DartResult {
  date: string; // M/D
  count: number; // 전체 공시 수
  items: Disclosure[]; // 재료성만
}

interface DartRow {
  corp_code: string;
  corp_name: string;
  stock_code: string;
  report_nm: string;
  rcept_no: string;
  rcept_dt: string;
}

const p2 = (n: number) => String(n).padStart(2, "0");
const order = CATS.map((c) => c.t);
const dirRank = { 호재: 0, 중립: 1, 악재: 2 } as const;

// 특정일(YYYYMMDD)의 재료성 공시 + 전체 건수
async function fetchDisclosures(ymd: string): Promise<{ count: number; items: Disclosure[] }> {
  const key = process.env.DART_API_KEY;
  if (!key) return { count: 0, items: [] };
  const rows: DartRow[] = [];
  let total = 0;
  for (let page = 1; page <= 6; page++) {
    try {
      const r = await fetch(
        `${BASE}/list.json?crtfc_key=${key}&bgn_de=${ymd}&end_de=${ymd}&page_no=${page}&page_count=100`,
        { cache: "no-store" },
      );
      const j = (await r.json()) as { status: string; total_count?: number; total_page?: number; list?: DartRow[] };
      if (j.status !== "000") break;
      total = j.total_count ?? total;
      rows.push(...(j.list || []));
      if (page >= (j.total_page ?? 1)) break;
    } catch {
      break;
    }
  }
  const seen = new Set<string>();
  const items: Disclosure[] = [];
  for (const x of rows) {
    if (!/^\d{6}$/.test(x.stock_code || "")) continue;
    const nm = (x.report_nm || "").trim();
    const cat = classify(nm);
    if (!cat) continue;
    const dedup = x.stock_code + "|" + nm;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    items.push({
      code: x.stock_code,
      name: x.corp_name,
      corp: x.corp_code || "",
      title: nm,
      type: cat.t,
      dir: cat.dir,
      link: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${x.rcept_no}`,
    });
  }
  items.sort((a, b) => dirRank[a.dir] - dirRank[b.dir] || order.indexOf(a.type) - order.indexOf(b.type));
  return { count: total, items };
}

export async function todayDisclosures(): Promise<DartResult> {
  const k = new Date(Date.now() + 9 * 3600e3);
  const ymd = `${k.getUTCFullYear()}${p2(k.getUTCMonth() + 1)}${p2(k.getUTCDate())}`;
  const { count, items } = await fetchDisclosures(ymd);
  return { date: `${k.getUTCMonth() + 1}/${k.getUTCDate()}`, count, items };
}

// ── 백테스트: 과거 호재 공시 → 다음 거래일 실제 등락 ────────────────────────
async function fetchDaily(code: string): Promise<{ date: string; open: number; close: number }[]> {
  const end = new Date(),
    start = new Date();
  start.setDate(start.getDate() - 40);
  const ymd = (d: Date) => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
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

export interface DiscEvent {
  date: string; // 공시일 M/D
  sessionDate: string; // 반응일 M/D
  name: string;
  code: string;
  type: string;
  title: string;
  changePct: number | null;
  openBuyPct: number | null;
  hot: boolean; // 공시일에 특징주·테마 뉴스로 부각됐는지 (시황 일치 여부)
  hotNote: string; // 근거 헤드라인 일부
}
export interface DiscBacktest {
  days: number;
  dates: string[]; // 선택 가능한 공시일 목록 (YYYYMMDD)
  selected: string | null; // 특정 날짜만 조회한 경우
  scored: number;
  upRateOpen: number | null;
  avgOpen: number | null;
  avgChange: number | null;
  byType: { type: string; n: number; upRate: number; avgOpen: number }[];
  // 시황 분해 — "공시일에 테마/특징주로 부각된 종목의 공시가 더 먹히나" 검증
  byHot: { label: string; n: number; upRate: number; avgOpen: number }[];
  hotThemes: { date: string; heads: string[] }[]; // 날짜별 그날 부각 헤드라인(참고)
  events: DiscEvent[];
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

// 시황 = 그날 뭐가 부각됐나. 특징주·테마 뉴스를 날짜별로 모아둔다.
async function fetchBuzz(): Promise<Record<string, string[]>> {
  const byDate: Record<string, string[]> = {};
  const queries = ["특징주", "테마 급등", "상한가"];
  const lists = await Promise.all(
    queries.flatMap((q) => [1, 101, 201].map((start) => searchNews(q, { display: 100, sort: "date", start }))),
  );
  for (const list of lists)
    for (const x of list) {
      if (Number.isNaN(x.ts)) continue;
      const d = new Date(x.ts + 9 * 3600e3);
      const ymd = `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`;
      (byDate[ymd] = byDate[ymd] || []).push(x.title);
    }
  return byDate;
}

// 공시일에 그 종목이 특징주/테마로 부각됐는지
function hotOf(
  buzz: Record<string, string[]>,
  ymd: string,
  name: string,
): { hot: boolean; hotNote: string } {
  const heads = buzz[ymd] || [];
  const key = name.replace(/\s/g, "");
  const hit = heads.find((h) => h.replace(/\s/g, "").includes(key));
  return { hot: !!hit, hotNote: hit ? hit.slice(0, 60) : "" };
}

// 최근 N일(또는 특정일) 호재 공시 → 다음 거래일 시가매수→종가 채점
export async function disclosureBacktest(
  daysBack = 6,
  onlyDate?: string | null,
): Promise<DiscBacktest> {
  const now = new Date(Date.now() + 9 * 3600e3);
  const allDays: string[] = [];
  for (let i = 1; i <= Math.max(daysBack, 10); i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    allDays.push(`${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`);
  }
  const dayList = onlyDate ? [onlyDate] : allDays.slice(0, daysBack);
  // 날짜별 호재 공시 수집(순차 — DART 부하 관리)
  const raw: { ymd: string; d: Disclosure }[] = [];
  for (const ymd of dayList) {
    const { items } = await fetchDisclosures(ymd);
    for (const it of items) if (it.dir === "호재") raw.push({ ymd, d: it });
  }
  // 종목·공시일 중복 제거, 최대 80건
  const seen = new Set<string>();
  const picked = raw.filter((x) => {
    const k = x.ymd + x.d.code;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 80);

  const codes = [...new Set(picked.map((x) => x.d.code))];
  const px: Record<string, { date: string; open: number; close: number }[]> = {};
  for (let i = 0; i < codes.length; i += 8) {
    await Promise.all(codes.slice(i, i + 8).map(async (c) => (px[c] = await fetchDaily(c))));
  }
  // 시황: 그날 부각된 것 = 특징주/테마 뉴스에서 찾는다 (공시일 기준 = 매수 전 정보)
  const buzz = await fetchBuzz();

  const events: DiscEvent[] = [];
  for (const { ymd, d } of picked) {
    const rows = px[d.code];
    let idx = -1;
    if (rows) for (let i = 0; i < rows.length; i++) if (rows[i].date > ymd) { idx = i; break; }
    const ok = idx >= 1;
    events.push({
      date: `${+ymd.slice(4, 6)}/${+ymd.slice(6, 8)}`,
      sessionDate: ok ? `${+rows[idx].date.slice(4, 6)}/${+rows[idx].date.slice(6, 8)}` : "",
      name: d.name,
      code: d.code,
      type: d.type,
      title: d.title,
      changePct: ok ? (rows[idx].close / rows[idx - 1].close - 1) * 100 : null,
      openBuyPct: ok ? (rows[idx].close / rows[idx].open - 1) * 100 : null,
      ...hotOf(buzz, ymd, d.name),
    });
  }
  events.sort((a, b) => b.date.localeCompare(a.date));

  const scored = events.filter((e) => e.openBuyPct != null);
  const opens = scored.map((e) => e.openBuyPct as number);
  const changes = scored.map((e) => e.changePct).filter((x): x is number => x != null);
  const typeMap = new Map<string, number[]>();
  for (const e of scored) {
    if (!typeMap.has(e.type)) typeMap.set(e.type, []);
    typeMap.get(e.type)!.push(e.openBuyPct as number);
  }
  const byType = [...typeMap.entries()]
    .map(([type, xs]) => ({ type, n: xs.length, upRate: (xs.filter((x) => x > 0).length / xs.length) * 100, avgOpen: mean(xs) ?? 0 }))
    .sort((a, b) => b.avgOpen - a.avgOpen);

  // 시황 분해: 공시일 부각(특징주 언급) 여부
  const grp = (label: string, xs: DiscEvent[]) => {
    const v = xs.map((e) => e.openBuyPct as number).filter((x) => x != null);
    return {
      label,
      n: v.length,
      upRate: v.length ? (v.filter((x) => x > 0).length / v.length) * 100 : 0,
      avgOpen: mean(v) ?? 0,
    };
  };
  const byHot = [
    grp("공시일 특징주/테마로 부각 O", scored.filter((e) => e.hot)),
    grp("부각 X", scored.filter((e) => !e.hot)),
  ].filter((g) => g.n > 0);

  const hotThemes = dayList
    .map((ymd) => ({
      date: `${+ymd.slice(4, 6)}/${+ymd.slice(6, 8)}`,
      heads: (buzz[ymd] || []).slice(0, 6),
    }))
    .filter((x) => x.heads.length);

  return {
    days: daysBack,
    dates: allDays,
    selected: onlyDate ?? null,
    scored: scored.length,
    upRateOpen: opens.length ? (opens.filter((x) => x > 0).length / opens.length) * 100 : null,
    avgOpen: mean(opens),
    avgChange: mean(changes),
    byType,
    byHot,
    hotThemes,
    events,
  };
}
