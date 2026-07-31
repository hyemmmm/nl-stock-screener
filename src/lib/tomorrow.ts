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
// 서버리스(Vercel)는 함수 실행 60초 제한 + 파일 캐시가 없어 매 요청이 풀 빌드다.
// 무거운 보강 단계를 줄여 타임아웃을 막는다(로컬은 그대로 전부 수행).
const LITE = !!process.env.VERCEL;
const LIM = {
  newsCats: LITE ? 3 : 5, // 뉴스 재료 개수
  discScore: LITE ? 5 : 14, // 과거 반응 채점할 호재 공시 수
  mcap: LITE ? 12 : 60, // 시가총액 조회 종목 수
  volCheck: !LITE, // ⚡ 거래량 이력 조회 여부
};
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

// 장마감 이후 재료성 뉴스 수집 (필터 없이 전부, 최신순)
async function collectNews(cutoff: number): Promise<{ title: string; link: string; ts: number }[]> {
  const lists: Awaited<ReturnType<typeof searchNews>>[] = [];
  for (let i = 0; i < SIGNAL_QUERIES.length; i += 3) {
    lists.push(
      ...(await Promise.all(
        SIGNAL_QUERIES.slice(i, i + 3).map((q) => searchNews(q, { display: 100, sort: "date" })),
      )),
    );
  }
  const seen = new Set<string>();
  const out: { title: string; link: string; ts: number }[] = [];
  for (const list of lists)
    for (const x of list) {
      if (!Number.isNaN(x.ts) && x.ts < cutoff) continue;
      if (seen.has(x.title)) continue;
      seen.add(x.title);
      out.push({ title: x.title, link: x.link, ts: Number.isNaN(x.ts) ? 0 : x.ts });
    }
  return out.sort((a, b) => b.ts - a.ts);
}

async function detectNewsCatalysts(
  news: { title: string; link: string }[],
  since: string,
): Promise<{ cats: NewsCatalyst[]; note: string | null }> {
  if (!process.env.GROQ_API_KEY)
    return { cats: [], note: "GROQ_API_KEY 없음 — AI 주목 표시 없이 목록만 제공" };
  const heads = news.map((n) => n.title);
  if (!heads.length) return { cats: [], note: "장마감 이후 재료성 뉴스가 없음" };

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
  return groqCatalysts(system, user);
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
  sector?: string | null; // 재료 섹터/테마
  score: number; // 정렬용
}
// ── 재료 → 섹터/테마 분류 (예: 신작 출시 → 게임주) ────────────────────────
//   키워드 기반. 종목명·공시제목·뉴스제목 어디에 걸려도 같은 라벨을 준다.
const SECTORS: { label: string; re: RegExp }[] = [
  { label: "게임", re: /게임|신작|출시|넥슨|엔씨|넷마블|크래프톤|펄어비스|위메이드|네오위즈|카카오게임|더블유게임|컴투스|웹젠|조이시티|데브시스터즈/ },
  { label: "바이오·제약", re: /임상|FDA|식약처|품목허가|신약|바이오|제약|백신|치료제|셀트리온|삼성바이오|유한양행|한미약품|녹십자|종근당|대웅|메디|팜$|헬스케어|진단|의료기기/ },
  { label: "반도체", re: /반도체|HBM|메모리|파운드리|웨이퍼|전공정|후공정|소부장|하이닉스|한미반도체|이오테크닉스|원익|주성|테스나|디아이|피에스케이|램리서치|D램|낸드/ },
  { label: "2차전지·전기차", re: /배터리|2차전지|이차전지|양극재|음극재|전해질|분리막|전기차|EV|에코프로|엘앤에프|포스코퓨처|LG에너지|삼성SDI|SK온|리튬/ },
  { label: "조선·해운", re: /조선소|조선업|조선주|해운(?!대)|선박|LNG선|컨테이너선|한화오션|HD현대|삼성중공업|HMM|팬오션|대한해운|해양플랜트|수주 잔고/ },
  { label: "방산·우주", re: /방산|국방|무기|미사일|전투기|한화에어로|LIG넥스원|현대로템|한국항공우주|KAI|우주|위성|발사체/ },
  { label: "건설·부동산", re: /건설|건축|시공|분양|재건축|재개발|부동산|아파트|현대건설|대우건설|GS건설|DL이앤씨|HDC|태영|금호건설/ },
  { label: "금융", re: /은행|증권|보험|카드|금융지주|대출|금리|KB금융|신한지주|하나금융|우리금융|미래에셋|삼성증권|키움/ },
  { label: "로봇·AI", re: /로봇|휴머노이드|\bAI\b|인공지능|자율주행|머신러닝|데이터센터|GPU|엔비디아|레인보우로보|두산로보|유진로봇/ },
  { label: "원전·에너지", re: /원전|원자력|SMR|전력|송전|변압기|태양광|풍력|수소|신재생|두산에너빌리티|한전|LS일렉|효성중공업|에너지/ },
  { label: "소비재·유통", re: /화장품|뷰티|K-뷰티|아모레|LG생활건강|코스맥스|한국콜마|씨앤씨|식품|라면|음료|유통|편의점|마트/ },
  { label: "엔터·미디어", re: /엔터|아이돌|콘서트|드라마|영화|음원|하이브|SM|JYP|YG|CJ ENM|스튜디오|미디어|웹툰/ },
  { label: "자동차·부품", re: /자동차|완성차|현대차|기아|모비스|타이어|부품|전장|현대위아|한온시스템|만도/ },
  { label: "철강·소재", re: /철강|포스코|현대제철|알루미늄|구리|희토류|비철|금속|화학|정유|석유화학|LG화학|롯데케미칼/ },
  { label: "통신·플랫폼", re: /통신|5G|6G|SKT|KT|LG유플러스|네이버|카카오|플랫폼|이커머스|쿠팡/ },
];

export function classifySector(...texts: (string | undefined | null)[]): string | null {
  const t = texts.filter(Boolean).join(" ");
  if (!t) return null;
  for (const s of SECTORS) if (s.re.test(t)) return s.label;
  return null;
}

// 공시 재료 한 줄 (전부 노출 + 링크)
export interface DiscFeedItem {
  name: string;
  code: string;
  title: string;
  type: string;
  dir: "호재" | "악재" | "중립";
  link: string;
  repeat?: Repeat; // 같은 유형 과거 공시 반응 (계산된 것만)
  verdict?: string;
  mcap?: number | null; // 시가총액(억원)
  mcapLabel?: string; // "1,210조" 같은 표시용
  sector?: string | null; // 재료가 속한 섹터/테마 (예: 게임, 반도체)
}

// 네이버 업종 코드(no) → 업종명. "동진쎄미켐 자사주 취득"처럼 제목·종목명에
// 섹터 키워드가 하나도 없는 공시를 분류하기 위한 fallback. 1회 호출 후 캐시.
let upjongMap: Record<string, string> | null = null;
async function fetchUpjongMap(): Promise<Record<string, string>> {
  if (upjongMap) return upjongMap;
  try {
    const r = await fetch("https://finance.naver.com/sise/sise_group.naver?type=upjong", H);
    const html = new TextDecoder("euc-kr").decode(Buffer.from(await r.arrayBuffer()));
    const m: Record<string, string> = {};
    for (const x of html.matchAll(/sise_group_detail\.naver\?type=upjong&no=(\d+)">([^<]+)</g))
      m[x[1]] = x[2].trim();
    upjongMap = m;
    return m;
  } catch {
    upjongMap = {};
    return upjongMap;
  }
}
// 네이버 업종명 → 앱의 섹터 라벨 (키워드 분류와 라벨을 통일해야 필터 칩이 안 쪼개진다)
const UPJONG_TO_SECTOR: [RegExp, string][] = [
  [/게임/, "게임"],
  [/반도체|전자장비|디스플레이/, "반도체"],
  [/제약|생물공학|생명과학|건강관리/, "바이오·제약"],
  [/건설|건축|부동산/, "건설·부동산"],
  [/조선|해운|운송인프라/, "조선·해운"],
  [/우주|국방/, "방산·우주"],
  [/은행|증권|보험|금융|카드/, "금융"],
  [/전기유틸리티|가스|복합유틸리티|에너지/, "원전·에너지"],
  [/자동차|자동차부품|타이어/, "자동차·부품"],
  [/화학|금속|철강|종이|포장/, "철강·소재"],
  [/화장품|가정용품|식품|음료|담배|판매업체|유통|호텔|섬유|의복/, "소비재·유통"],
  [/미디어|엔터테인먼트|레저/, "엔터·미디어"],
  [/소프트웨어|IT서비스|인터넷|통신/, "통신·플랫폼"],
  [/기계|전기장비|전기제품/, "기계·장비"],
];
function upjongSector(name?: string): string | null {
  if (!name) return null;
  for (const [re, label] of UPJONG_TO_SECTOR) if (re.test(name)) return label;
  return null;
}

// 네이버 시가총액 (억원 단위 숫자 + 표시용 라벨) + 업종 코드
async function fetchMarketCap(
  code: string,
): Promise<{ mcap: number | null; label: string; industry: string }> {
  try {
    const r = await fetch(`https://m.stock.naver.com/api/stock/${code}/integration`, {
      headers: { "User-Agent": "Mozilla/5.0", referer: "https://m.stock.naver.com/" },
      cache: "no-store",
    });
    const j = (await r.json()) as {
      totalInfos?: { code: string; value: string }[];
      industryCode?: string;
    };
    const industry = String(j.industryCode ?? "");
    const raw = j.totalInfos?.find((x) => x.code === "marketValue")?.value ?? "";
    if (!raw) return { mcap: null, label: "", industry };
    // "1,210조 1,797억" | "5,432억"
    const jo = raw.match(/([\d,]+)\s*조/);
    const eok = raw.match(/([\d,]+)\s*억/);
    const n = (s?: string) => (s ? parseInt(s.replace(/,/g, ""), 10) : 0);
    const mcap = n(jo?.[1]) * 10000 + n(eok?.[1]); // 억원
    const label = jo ? `${jo[1]}조` : eok ? `${eok[1]}억` : raw;
    return { mcap: mcap || null, label, industry };
  } catch {
    return { mcap: null, label: "", industry: "" };
  }
}
// 뉴스 재료 한 줄 (장마감 이후 전부 + 링크)
export interface NewsFeedItem {
  title: string;
  link: string;
  time: string; // HH:MM (KST)
  aiTag?: string; // AI가 주목한 경우 "규제·정책" 등
  sector?: string | null; // 헤드라인에서 추정한 섹터/테마
  noise?: boolean; // 지역행사·봉사·인사 등 재료와 무관해 보이는 것(숨김 기본, 토글로 볼 수 있음)
  strong?: boolean; // 재료성 키워드가 뚜렷한 것(상단 정렬)
}

export interface TomorrowResult {
  forDate: string; // 내일 M/D (표시용은 '다음 거래일')
  since: string;
  kospiPct: number | null; // 오늘 코스피 등락(시황 게이트)
  topThemes: { name: string; chg: number }[]; // 오늘 부각 테마 top
  candidates: Candidate[]; // AI 주목 (참고용, 걸러진 게 아님)
  discFeed: DiscFeedItem[]; // 오늘 공시 재료 전부
  newsFeed: NewsFeedItem[]; // 장마감 이후 뉴스 재료 전부
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
    sector: classifySector(c.title, c.why),
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

  // 뉴스: 장마감 이후 재료성 뉴스 전부 수집 (거르지 않고 목록으로 제공)
  const rawNews = await collectNews(cutoff);
  const { cats: newsCats, note } = await detectNewsCatalysts(rawNews.slice(0, 50), since);
  const newsLinks: Record<string, string> = {};
  for (const n of rawNews) newsLinks[n.title] = n.link;
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

  // 공시: 오늘 재료성 공시 전부 (호재/악재 그대로 노출), 호재는 과거 반응까지 채점
  const disc = await todayDisclosures();
  const cleanNm = (t: string) =>
    t.replace(/\s+$/, "").replace(/^주요사항보고서\(?/, "").replace(/\)$/, "");
  // 1) 항목 만들고 시가총액 조회(6개씩 배치)
  const discFeed: DiscFeedItem[] = disc.items.map((d) => ({
    name: d.name,
    code: d.code,
    title: cleanNm(d.title),
    type: d.type,
    dir: d.dir,
    link: d.link,
    sector: classifySector(d.title, d.name),
  }));
  const mcapCodes = [...new Set(discFeed.map((d) => d.code))].slice(0, LIM.mcap);
  const mcapMap: Record<string, { mcap: number | null; label: string; industry: string }> = {};
  const [, upjong] = await Promise.all([
    (async () => {
      for (let i = 0; i < mcapCodes.length; i += 6) {
        await Promise.all(
          mcapCodes.slice(i, i + 6).map(async (c) => (mcapMap[c] = await fetchMarketCap(c))),
        );
      }
    })(),
    fetchUpjongMap(),
  ]);
  for (const d of discFeed) {
    d.mcap = mcapMap[d.code]?.mcap ?? null;
    d.mcapLabel = mcapMap[d.code]?.label ?? "";
    // 제목·종목명 어디에도 키워드가 없으면(자사주취득 등) 네이버 업종으로 보완
    if (!d.sector) d.sector = upjongSector(upjong[mcapMap[d.code]?.industry ?? ""]);
  }
  // 2) 시가총액 큰 순으로 정렬 (없으면 뒤로)
  discFeed.sort((a, b) => (b.mcap ?? -1) - (a.mcap ?? -1));

  // 3) 호재는 시총 큰 순으로 14건까지 과거 같은 유형 공시 반응 채점
  let scored = 0;
  for (const item of discFeed) {
    if (item.dir !== "호재" || scored >= LIM.discScore) continue;
    scored++;
    const src = disc.items.find((x) => x.code === item.code && cleanNm(x.title) === item.title);
    if (!src) continue;
    const repeat = await discRepeat(src, todayYmd);
    item.repeat = repeat;
    item.verdict =
      repeat.scored > 0 && repeat.avg != null
        ? `과거 ${repeat.episodes}회 · 평균 ${repeat.avg >= 0 ? "+" : ""}${repeat.avg.toFixed(1)}%${
            repeat.upRate != null ? ` (상승 ${repeat.upRate.toFixed(0)}%)` : ""
          }`
        : "과거 같은 공시 없음 (첫 사례)";
    // AI 주목 후보에도 추가 (참고용 랭킹)
    all.push(
      judge({
        source: "공시",
        title: `${item.name} — ${item.title}`,
        type: item.type,
        stage: "확정",
        why: `${item.name} ${item.type} 공시 (DART)${item.mcapLabel ? ` · 시총 ${item.mcapLabel}` : ""}`,
        stocks: [{ name: item.name, code: item.code, via: "AI" }],
        repeat,
        link: item.link,
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
  const codes = LIM.volCheck ? [...new Set(all.flatMap((c) => c.stocks.map((s) => s.code)))] : [];
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

  // AI 주목: 거르지 않고 점수순 정렬만 (판단은 사용자)
  const candidates = [...all].sort((a, b) => b.score - a.score);

  // 뉴스 피드: 장마감 이후 전부 + AI가 집은 헤드라인에 태그
  const aiTagOf = new Map<string, string>();
  for (const nc of newsCats) {
    const key = (nc.headline || nc.title || "").slice(0, 12);
    if (key) aiTagOf.set(key, nc.type || "재료");
  }
  const hhmm = (ts: number) => {
    const d = new Date(ts + 9 * 3600e3);
    return ts ? `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}` : "";
  };
  // 재료와 무관해 보이는 잡음(지역행사·봉사·인사·스포츠 등) — 지우지 않고 표시만
  const NOISE =
    /봉사|기부|성금|나눔|헌혈|김장|삼계탕|장학|공모전|시상|수상자|축제|바자|캠페인|간담회|위촉|취임|부고|인사말|칼럼|사설|여론조사|응답|리셀러|퀴즈|대학|총장|교수|학생|초등|중학|고교|구청|군수|시장님|동네|맛집|여행|숙박|호텔|골프|프로야구|축구|올림픽|연예|드라마|가요/;
  const STRONG =
    /규제|허용|금지|승인|허가|인가|해제|완화|폐지|관세|수주|계약|공급|특징주|급등|상한가|정책|지원금|예산|국책|확진|확산|사고|화재|리콜|제재|보조금|투자|증설|착공|수출|낙찰|선정|타결|합의|시행|입법|통과/;
  const newsFeed: NewsFeedItem[] = rawNews.slice(0, 120).map((n) => {
    let aiTag: string | undefined;
    for (const [k, v] of aiTagOf) if (n.title.includes(k)) aiTag = v;
    const noise = !aiTag && NOISE.test(n.title);
    const strong = !!aiTag || (!noise && STRONG.test(n.title));
    return { title: n.title, link: n.link, time: hhmm(n.ts), aiTag, noise, strong, sector: classifySector(n.title) };
  });
  // 정렬: AI 주목 → 재료성 강함 → 나머지 → 잡음 (각 그룹 내 최신순)
  const rank = (x: NewsFeedItem) => (x.aiTag ? 0 : x.noise ? 3 : x.strong ? 1 : 2);
  newsFeed.sort((a, b) => rank(a) - rank(b) || b.time.localeCompare(a.time));

  const t = new Date(kst);
  t.setUTCDate(t.getUTCDate() + 1);
  return {
    forDate: `${t.getUTCMonth() + 1}/${t.getUTCDate()}`,
    since,
    kospiPct,
    topThemes,
    candidates,
    discFeed,
    newsFeed,
    note,
    builtAt: new Date().toISOString(),
    cached: false,
  };
}
