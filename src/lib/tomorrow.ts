// ──────────────────────────────────────────────────────────────────────────
// 📌 내일 시가 후보 (서버 전용) — 앱의 최종 종합 파이프라인.
//   [뉴스+공시 재료 수집] → [Groq: 재료 선별·단계(확정/검토)·관련주]
//   → [반복성: 같은 재료가 과거에 떴을 때 다음날 시가→종가]
//   → [신선도: 첫 등장 vs N번째 재탕] → [시황] → 후보 랭킹 + 거른 목록.
//   판단 재료를 대령할 뿐, 매수 결정은 사용자가.
// ──────────────────────────────────────────────────────────────────────────
import { searchNews } from "./news";
import { buildRelatedStocks, matchTheme, type RelStock } from "./stocks";
import { todayDisclosures, type Disclosure } from "./dart";
import { fetchThemes, type Theme } from "./issues";

const H = { headers: { referer: "https://finance.naver.com/" }, cache: "no-store" as const };
const p2 = (n: number) => String(n).padStart(2, "0");
const ymdOf = (d: Date) => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;

// ── 공통: 일봉 (시가/종가) ─────────────────────────────────────────────────
interface Candle {
  date: string;
  open: number;
  close: number;
  vol: number;
}
async function fetchDaily(code: string, days = 800): Promise<Candle[]> {
  const e = new Date(),
    s = new Date();
  s.setDate(s.getDate() - days);
  try {
    const r = await fetch(
      `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${ymdOf(
        s,
      )}&endTime=${ymdOf(e)}&timeframe=day`,
      H,
    );
    return JSON.parse((await r.text()).replace(/'/g, '"').replace(/,\s*\]/g, "]"))
      .slice(1)
      .map((x: unknown[]) => ({
        date: String(x[0]),
        open: +(x[1] as number),
        close: +(x[4] as number),
        vol: +(x[5] as number) || 0,
      }))
      .filter((c: Candle) => c.close > 0 && c.open > 0)
      .sort((a: Candle, b: Candle) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}
// ymd 다음 거래일의 시가매수→종가(%)
function nextOpenBuy(rows: Candle[], ymd: string): number | null {
  for (let i = 0; i < rows.length; i++)
    if (rows[i].date > ymd) return i >= 1 ? (rows[i].close / rows[i].open - 1) * 100 : null;
  return null;
}

// ── 1) 뉴스 재료 감지 (장마감 이후 + 단계·검색어 포함) ─────────────────────
const SIGNAL_QUERIES = ["규제 완화", "허용", "허가 획득", "대규모 수주", "관세", "확산"];

interface NewsCatalyst {
  title: string;
  type: string;
  stage: string; // 확정 | 검토
  why: string;
  stocks: string[];
  query: string; // 반복성 검색용 핵심 키워드
  headline: string; // 근거 헤드라인 원문 (기사 링크 매칭용)
}

// Groq 호출 (토큰 한도 초과 시 작은 모델로 폴백). 실패 이유를 함께 반환.
async function groqCatalysts(
  system: string,
  user: string,
): Promise<{ cats: NewsCatalyst[]; note: string | null }> {
  const models = [process.env.LLM_MODEL || "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
  let lastErr = "";
  for (const model of models) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
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
      if (!j.choices) {
        lastErr = String(j?.error?.message || `HTTP ${r.status}`);
        continue; // 다음(작은) 모델로 폴백
      }
      const cats = (JSON.parse(j.choices[0].message.content).catalysts || []).slice(
        0,
        5,
      ) as NewsCatalyst[];
      return { cats, note: model === models[0] ? null : `보조 모델(${model})로 분석` };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  const limited = /rate limit|TPD|quota/i.test(lastErr);
  return {
    cats: [],
    note: limited
      ? "AI 일일 토큰 한도 초과 — 뉴스 재료 분석을 건너뜀 (공시 재료만 표시). 잠시 후 다시 시도하세요."
      : `뉴스 재료 분석 실패: ${lastErr.slice(0, 80)}`,
  };
}

async function detectNewsCatalysts(
  cutoff: number,
  since: string,
): Promise<{ cats: NewsCatalyst[]; note: string | null; links: Record<string, string> }> {
  const empty = { cats: [] as NewsCatalyst[], links: {} as Record<string, string> };
  if (!process.env.GROQ_API_KEY)
    return { ...empty, note: "GROQ_API_KEY 없음 — 뉴스 재료 분석 불가" };
  // 배치(3개씩)로 네이버 호출
  const lists: Awaited<ReturnType<typeof searchNews>>[] = [];
  for (let i = 0; i < SIGNAL_QUERIES.length; i += 3) {
    lists.push(
      ...(await Promise.all(
        SIGNAL_QUERIES.slice(i, i + 3).map((q) => searchNews(q, { display: 100, sort: "date" })),
      )),
    );
  }
  const seen = new Set<string>();
  const heads: string[] = [];
  const links: Record<string, string> = {};
  for (const list of lists)
    for (const x of list) {
      if (!Number.isNaN(x.ts) && x.ts < cutoff) continue;
      if (seen.has(x.title)) continue;
      seen.add(x.title);
      heads.push(x.title);
      links[x.title] = x.link;
    }
  if (!heads.length) return { ...empty, note: "장마감 이후 재료성 뉴스가 없음" };

  const system = `너는 한국 주식 애널리스트다. 아래는 직전 장마감(${since}) 이후 나온 뉴스 헤드라인이다.
"어제까지 없던, 새로 생기거나 사라진 구조적 변화"로 내일 특정 업종·테마를 움직일 호재성 재료를 최대 5개 고른다.
★ 예정·반복·이미 알려진 이벤트 제외. ★ 악재성 사건이면 반사이익 수혜주(경쟁사·대체재·국내 대체 공급사)를 관련주로.
★ stage: 헤드라인이 확정된 사실(발표·통과·시행·체결)이면 "확정", 검토·추진·풀릴까·전망이면 "검토".
★ query: 이 재료를 과거 뉴스에서 찾을 핵심 검색어(3~5단어, 회사명 제외한 사건 키워드).
★ stocks: 실제 한국 상장사 5~8개(가능한 많이). 반드시 "현재 상장된" 정확한 종목명으로. 비상장 자회사(예: 포스코건설)·옛 사명(예: 대우조선해양→한화오션)은 쓰지 마라. 대형주뿐 아니라 중소형 수혜주도 포함.
★ headline: 근거로 삼은 헤드라인을 원문 그대로.
JSON만: {"catalysts":[{"title":"","type":"없다가 생김|있다가 사라짐|발생·확산|정책·규제|계약·수주","stage":"확정|검토","why":"","stocks":[""],"query":"","headline":""}]}`;
  // 토큰 절약: 헤드라인 50개로 제한
  const user = heads.slice(0, 50).map((h, i) => `[${i}] ${h}`).join("\n");
  const { cats, note } = await groqCatalysts(system, user);
  return { cats, note, links };
}


// ── 2) 뉴스 반복성: query로 과거 에피소드 찾고 관련주 반응 채점 ─────────────
interface Repeat {
  episodes: number; // 과거 발생 횟수(오늘 제외)
  scored: number; // 채점된 (종목×에피소드) 수
  upRate: number | null;
  avg: number | null;
  lastYmd: string | null; // 직전 발생일
}

async function newsRepeat(query: string, stocks: { code: string }[], todayYmd: string): Promise<Repeat> {
  const empty: Repeat = { episodes: 0, scored: 0, upRate: null, avg: null, lastYmd: null };
  if (!query || !stocks.length) return empty;
  try {
    const [a, b] = await Promise.all([
      searchNews(query, { display: 100, sort: "sim" }),
      searchNews(query, { display: 100, sort: "date" }),
    ]);
    const hits = [...a, ...b]
      .filter((x) => !Number.isNaN(x.ts))
      .sort((x, y) => x.ts - y.ts);
    // 10일 갭 에피소드
    const eps: string[] = [];
    let last: number | null = null;
    for (const x of hits) {
      const d = new Date(x.ts + 9 * 3600e3);
      const ymd = `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`;
      const t = Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8));
      if (last !== null && t - last <= 10 * 864e5) {
        last = t;
        continue;
      }
      last = t;
      eps.push(ymd);
    }
    const past = eps.filter((y) => y < todayYmd);
    if (!past.length) return { ...empty, episodes: 0 };
    // 관련주(최대 2개)의 각 에피소드 다음날 반응
    const vals: number[] = [];
    for (const s of stocks.slice(0, 2)) {
      const rows = await fetchDaily(s.code);
      for (const y of past) {
        const v = nextOpenBuy(rows, y);
        if (v != null) vals.push(v);
      }
    }
    return {
      episodes: past.length,
      scored: vals.length,
      upRate: vals.length ? (vals.filter((v) => v > 0).length / vals.length) * 100 : null,
      avg: vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null,
      lastYmd: past[past.length - 1],
    };
  } catch {
    return empty;
  }
}

// ── 3) 공시 반복성: 그 종목의 같은 유형 과거 공시 반응 ─────────────────────
async function discRepeat(d: Disclosure, todayYmd: string): Promise<Repeat> {
  const empty: Repeat = { episodes: 0, scored: 0, upRate: null, avg: null, lastYmd: null };
  const key = process.env.DART_API_KEY;
  if (!key || !d.corp) return empty;
  try {
    const s = new Date();
    s.setDate(s.getDate() - 720);
    const j = (await (
      await fetch(
        `https://opendart.fss.or.kr/api/list.json?crtfc_key=${key}&corp_code=${d.corp}&bgn_de=${ymdOf(
          s,
        )}&end_de=${todayYmd}&page_no=1&page_count=100`,
        { cache: "no-store" },
      )
    ).json()) as { list?: { report_nm: string; rcept_dt: string }[] };
    // 같은 유형(제목의 핵심어로 근사: 계약/수주는 공급계약류, 그 외는 유형명 첫 단어)
    const CONTRACT = /공급계약|단일판매|수주/;
    const isContract = CONTRACT.test(d.title);
    const past = (j.list || []).filter(
      (x) =>
        !/정정/.test(x.report_nm) &&
        x.rcept_dt < todayYmd &&
        (isContract ? CONTRACT.test(x.report_nm) : x.report_nm.includes(d.title.slice(0, 6))),
    );
    if (!past.length) return empty;
    const rows = await fetchDaily(d.code);
    const vals: number[] = [];
    let lastYmd: string | null = null;
    for (const x of past) {
      const v = nextOpenBuy(rows, x.rcept_dt);
      if (v != null) {
        vals.push(v);
        if (!lastYmd || x.rcept_dt > lastYmd) lastYmd = x.rcept_dt;
      }
    }
    return {
      episodes: past.length,
      scored: vals.length,
      upRate: vals.length ? (vals.filter((v) => v > 0).length / vals.length) * 100 : null,
      avg: vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null,
      lastYmd,
    };
  } catch {
    return empty;
  }
}

// ── 결과 타입 ──────────────────────────────────────────────────────────────
// RelStock(name·code·via·chg·reason) + 거래량 이력 표시
export type CandStock = RelStock & {
  bigVol?: boolean; // 최근 거래량 1,000만주+ 이력 (표시만, 필터 아님)
};
export interface Candidate {
  source: "뉴스" | "공시";
  title: string; // 재료
  type: string;
  stage: string; // 확정/검토 (공시는 항상 확정)
  why: string;
  stocks: CandStock[];
  repeat: Repeat;
  freshness: string; // "첫 등장" | "N번째 (직전 M/D)"
  verdict: string; // 판정 코멘트
  themeName: string | null; // 오늘 부각 테마 매칭 (시황)
  themeChg: number | null;
  link: string; // 근거: DART 공시 원문 / 뉴스 기사
  score: number; // 정렬용
}
export interface TomorrowResult {
  forDate: string; // 내일 M/D (표시용은 '다음 거래일')
  since: string;
  kospiPct: number | null; // 오늘 코스피 등락(시황 게이트)
  topThemes: { name: string; chg: number }[]; // 오늘 부각 테마 top
  candidates: Candidate[];
  rejected: Candidate[];
  note: string | null; // 뉴스 분석 실패/폴백 등 알림
  builtAt?: string; // 생성 시각(ISO) — 캐시 표시용
  cached?: boolean; // 저장된 결과를 그대로 반환했는지
}

const fmtYmd = (y: string | null) => (y ? `${+y.slice(4, 6)}/${+y.slice(6, 8)}` : "");

function judge(
  c: Omit<Candidate, "verdict" | "score" | "freshness" | "themeName" | "themeChg" | "link"> & {
    link?: string;
  },
): Candidate {
  const r = c.repeat;
  const fresh = r.episodes === 0;
  const freshness = fresh ? "첫 등장 🔥" : `${r.episodes + 1}번째 등장 (직전 ${fmtYmd(r.lastYmd)})`;
  let verdict = "";
  let score = 0;
  let reject = false;
  if (fresh) {
    verdict = "과거 데이터 없음 — 신선한 재료 (반응 미검증)";
    score = 1;
  } else if (r.avg != null && r.avg > 0.5) {
    verdict = `과거 같은 재료에 평균 +${r.avg.toFixed(1)}% (상승 ${r.upRate?.toFixed(0)}%) — 먹힌 이력`;
    score = 2 + r.avg / 10;
  } else if (r.avg != null && r.avg <= 0 && r.episodes >= 2) {
    verdict = `재탕 + 과거 무반응 (평균 ${r.avg.toFixed(1)}%) — 거르기 후보`;
    score = -1;
    reject = true;
  } else {
    verdict = `과거 ${r.episodes}회, 평균 ${r.avg != null ? (r.avg >= 0 ? "+" : "") + r.avg.toFixed(1) + "%" : "?"} — 애매`;
    score = 0.5 + (r.avg ?? 0) / 20;
  }
  if (c.stage === "검토") {
    verdict += " · '검토' 단계(불확실성)";
    score -= 0.7;
  }
  const cand = {
    ...c,
    link: c.link ?? "",
    freshness,
    verdict,
    score,
    themeName: null,
    themeChg: null,
  } as Candidate;
  return reject ? { ...cand, score: -1 } : cand;
}

export async function buildTomorrow(): Promise<TomorrowResult> {
  const now = Date.now();
  const kst = new Date(now + 9 * 3600e3);
  let cutoff = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), 6, 30, 0);
  if (now < cutoff) cutoff -= 864e5;
  const cd = new Date(cutoff + 9 * 3600e3);
  const since = `${cd.getUTCMonth() + 1}/${cd.getUTCDate()} 15:30`;
  const todayYmd = `${kst.getUTCFullYear()}${p2(kst.getUTCMonth() + 1)}${p2(kst.getUTCDate())}`;

  // 시황: 코스피 오늘 등락
  const kospi = await fetchDaily("KOSPI", 20);
  const kospiPct =
    kospi.length >= 2
      ? (kospi[kospi.length - 1].close / kospi[kospi.length - 2].close - 1) * 100
      : null;

  // 테마 목록 (관련주 보강 + 시황 판정에 공용)
  const themes = await fetchThemes().catch(() => [] as Theme[]);

  // 뉴스 재료 → 관련주 코드 → 반복성 (순차: 네이버 부하 관리)
  const { cats: newsCats, note, links: newsLinks } = await detectNewsCatalysts(cutoff, since);
  // 헤드라인 원문 → 기사 링크 (부분 일치 폴백)
  const linkOf = (headline: string) => {
    if (!headline) return "";
    if (newsLinks[headline]) return newsLinks[headline];
    const key = Object.keys(newsLinks).find(
      (t) => t.includes(headline.slice(0, 12)) || headline.includes(t.slice(0, 12)),
    );
    return key ? newsLinks[key] : "";
  };
  const all: Candidate[] = [];
  for (const nc of newsCats) {
    const { stocks } = await buildRelatedStocks(nc.stocks || [], themes, [
      nc.title,
      nc.why,
      nc.query,
    ]);
    if (!stocks.length) continue;
    const repeat = await newsRepeat(nc.query, stocks, todayYmd);
    all.push(
      judge({
        source: "뉴스",
        title: nc.title,
        type: nc.type,
        stage: nc.stage || "검토",
        why: nc.why,
        stocks,
        repeat,
        link: linkOf(nc.headline || nc.title),
      }),
    );
  }

  // 공시 재료(호재만, 최대 12건) → 종목별 반복성
  const disc = await todayDisclosures();
  const good = disc.items.filter((d) => d.dir === "호재").slice(0, 12);
  for (const d of good) {
    const repeat = await discRepeat(d, todayYmd);
    const nm = d.title.replace(/\s+$/, "").replace(/^주요사항보고서\(?/, "").replace(/\)$/, "");
    all.push(
      judge({
        source: "공시",
        title: `${d.name} — ${nm}`, // 회사명을 제목 앞에 (뭐가 뭔지 바로 보이게)
        type: d.type,
        stage: "확정",
        why: `${d.name} ${d.type} 공시 (DART)`,
        stocks: [{ name: d.name, code: d.code, via: "AI" }],
        repeat,
        link: d.link,
      }),
    );
  }

  // ── 시황: 오늘 부각 테마 top5 + 후보별 테마 매칭 ────────────────────────
  const topThemes = [...themes]
    .sort((a, b) => b.chg - a.chg)
    .slice(0, 5)
    .map((t) => ({ name: t.name, chg: t.chg }));
  for (const c of all) {
    const hit = matchTheme(themes, [c.title, c.why]);
    if (hit) {
      c.themeName = hit.name;
      c.themeChg = hit.chg;
      if (hit.chg >= 2) c.score += 0.5; // 오늘 부각 중인 테마면 가점(시황)
    }
  }

  // ── 거래량: 최근 1,000만주+ 이력 표시 (필터 아님) ─────────────────────────
  const codes = [...new Set(all.flatMap((c) => c.stocks.map((s) => s.code)))];
  const volMap: Record<string, boolean> = {};
  for (let i = 0; i < codes.length; i += 6) {
    await Promise.all(
      codes.slice(i, i + 6).map(async (code) => {
        const rows = await fetchDaily(code, 150);
        volMap[code] = rows.slice(-90).some((r) => r.vol >= 10_000_000);
      }),
    );
  }
  for (const c of all) for (const s of c.stocks) s.bigVol = volMap[s.code] || false;

  const candidates = all.filter((c) => c.score >= 0).sort((a, b) => b.score - a.score);
  const rejected = all.filter((c) => c.score < 0);
  const t = new Date(kst);
  t.setUTCDate(t.getUTCDate() + 1);
  return {
    forDate: `${t.getUTCMonth() + 1}/${t.getUTCDate()}`,
    since,
    kospiPct,
    topThemes,
    candidates,
    rejected,
    note,
    builtAt: new Date().toISOString(),
    cached: false,
  };
}
