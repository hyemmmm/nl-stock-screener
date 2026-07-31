// ──────────────────────────────────────────────────────────────────────────
// 관심 종목 판별 (서버 전용).
//   조회수 상위 = "관심이 몰린 후보 풀"일 뿐. 그 관심이 사려는 관심인지
//   팔려는 관심인지를 재료·차트·거래량·시황(재차거시) 관점으로 분해해
//   매일 하나를 고를 수 있게 근거를 대령한다. 판단은 사용자가.
// ──────────────────────────────────────────────────────────────────────────
import { searchNews } from "./news";
import { fetchThemes, fetchThemeStocks, type Theme } from "./issues";

const NAVER = { headers: { referer: "https://finance.naver.com/" }, cache: "no-store" as const };
const UA = {
  headers: { "User-Agent": "Mozilla/5.0", referer: "https://m.stock.naver.com/" },
  cache: "no-store" as const,
};
const dec = (b: ArrayBuffer) => new TextDecoder("euc-kr").decode(Buffer.from(b));
const p2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;

// ── 1-A) 후보 풀: 전일 거래대금 상위 (돈이 실제로 몰린 곳 — 장전 확정 데이터)
const NOT_STOCK =
  /KODEX|TIGER|KBSTAR|ARIRANG|ACE |SOL |PLUS |RISE |HANARO|KOSEF|ETN|레버리지|인버스|선물|채권|국고/i;

export async function fetchTopValue(): Promise<{ code: string; name: string; value: number }[]> {
  const out: { code: string; name: string; value: number }[] = [];
  for (const sosok of [0, 1]) {
    try {
      const buf = await (
        await fetch(`https://finance.naver.com/sise/sise_quant.naver?sosok=${sosok}`, NAVER)
      ).arrayBuffer();
      const txt = dec(buf);
      const anchors = [...txt.matchAll(/\/item\/main\.naver\?code=(\d{6})"[^>]*>([^<]+)<\/a>/g)];
      for (let k = 0; k < anchors.length; k++) {
        const m = anchors[k];
        const start = m.index ?? 0;
        const end = k + 1 < anchors.length ? (anchors[k + 1].index ?? txt.length) : start + 700;
        const chunk = txt.slice(start, end);
        // [현재가, 전일비, 등락률, 거래량, 거래대금, ...]
        const nums = [
          ...chunk.matchAll(/<td class="(?:number|rate_up|rate_down)"[^>]*>([\s\S]*?)<\/td>/g),
        ].map((x) => x[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
        const value = parseInt((nums[4] || "").replace(/[^\d]/g, ""), 10);
        const name = m[2].trim();
        if (!value || NOT_STOCK.test(name)) continue;
        out.push({ code: m[1], name, value }); // 거래대금(백만원)
      }
    } catch {}
  }
  const seen = new Set<string>();
  return out
    .filter((x) => (seen.has(x.code) ? false : (seen.add(x.code), true)))
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);
}

// ── 1-B) 시간외 단일가 / 장전 예상체결 (장 끝난 뒤에도 남은 관심) ──────────
export async function fetchOverMarket(
  code: string,
): Promise<{ pct: number | null; session: string }> {
  try {
    const r = await fetch(`https://m.stock.naver.com/api/stock/${code}/basic`, UA);
    const j = (await r.json()) as {
      overMarketPriceInfo?: { fluctuationsRatio?: string; tradingSessionType?: string };
    };
    const info = j.overMarketPriceInfo;
    if (!info?.fluctuationsRatio) return { pct: null, session: "" };
    const label =
      info.tradingSessionType === "AFTER_MARKET"
        ? "시간외"
        : info.tradingSessionType === "BEFORE_MARKET"
          ? "장전"
          : "";
    return { pct: parseFloat(info.fluctuationsRatio), session: label };
  } catch {
    return { pct: null, session: "" };
  }
}

// ── 1-D) 후보 풀: 오늘 강세 테마의 주도주 ─────────────────────────────────
//   "오늘 뜨는 테마" = 등락률 상위 테마. "주도주" = 그 테마 안에서 가장 많이 오른 종목.
//   MTS의 [테마 순위 → 종목]과 같은 흐름을 자동화한 것.
export async function fetchThemeLeaders(
  themes: Theme[],
): Promise<{ code: string; name: string; theme: string; themeChg: number; leadRank: number }[]> {
  const strong = [...themes].sort((a, b) => b.chg - a.chg).slice(0, 6);
  const out: { code: string; name: string; theme: string; themeChg: number; leadRank: number }[] = [];
  const seen = new Set<string>();
  for (const t of strong) {
    const list = await fetchThemeStocks(t.no).catch(() => []);
    // 네이버는 등락률 내림차순 → 앞쪽이 그 테마의 주도주
    let rank = 0;
    for (const s of list.slice(0, 4)) {
      rank++;
      if (seen.has(s.code) || NOT_STOCK.test(s.name)) continue;
      seen.add(s.code);
      out.push({ code: s.code, name: s.name, theme: t.name, themeChg: t.chg, leadRank: rank });
    }
  }
  return out.slice(0, 20);
}

// 회전율: 거래대금 ÷ 시가총액 — 대형주 편향 없이 "얼마나 뜨거운지" 정규화
export async function fetchTurnover(
  code: string,
): Promise<{ value: number | null; mcap: number | null; turnover: number | null }> {
  try {
    const r = await fetch(`https://m.stock.naver.com/api/stock/${code}/integration`, UA);
    const j = (await r.json()) as { totalInfos?: { code: string; value: string }[] };
    const get = (k: string) => j.totalInfos?.find((x) => x.code === k)?.value ?? "";
    // "28조 2,428억" → 억 단위 숫자
    const toEok = (s: string) => {
      if (!s) return null;
      const jo = s.match(/([\d,]+)\s*조/);
      const eok = s.match(/([\d,]+)\s*억/);
      const n = (v?: string) => (v ? parseInt(v.replace(/,/g, ""), 10) : 0);
      const val = n(jo?.[1]) * 10000 + n(eok?.[1]);
      return val || null;
    };
    const value = toEok(get("accumulatedTradingValue"));
    const mcap = toEok(get("marketValue"));
    return { value, mcap, turnover: value && mcap ? (value / mcap) * 100 : null };
  } catch {
    return { value: null, mcap: null, turnover: null };
  }
}

// ── 1-C) 후보 풀(대안): 네이버 조회수 상위 ────────────────────────────────
export async function fetchMostSearched(): Promise<{ code: string; name: string }[]> {
  try {
    const buf = await (
      await fetch("https://finance.naver.com/sise/lastsearch2.naver", NAVER)
    ).arrayBuffer();
    const txt = dec(buf);
    const out: { code: string; name: string }[] = [];
    const seen = new Set<string>();
    for (const m of txt.matchAll(/\/item\/main\.naver\?code=(\d{6})"[^>]*>([^<]+)<\/a>/g)) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      out.push({ code: m[1], name: m[2].trim() });
    }
    return out.slice(0, 20);
  } catch {
    return [];
  }
}

// ── 2) 일봉 (차트·거래량) ─────────────────────────────────────────────────
interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
}
async function fetchDaily(code: string): Promise<Candle[]> {
  const e = new Date(),
    s = new Date();
  s.setDate(s.getDate() - 120);
  try {
    const r = await fetch(
      `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${ymd(
        s,
      )}&endTime=${ymd(e)}&timeframe=day`,
      NAVER,
    );
    return JSON.parse((await r.text()).replace(/'/g, '"').replace(/,\s*\]/g, "]"))
      .slice(1)
      .map((x: unknown[]) => ({
        date: String(x[0]),
        open: +(x[1] as number),
        high: +(x[2] as number),
        low: +(x[3] as number),
        close: +(x[4] as number),
        vol: +(x[5] as number) || 0,
      }))
      .filter((c: Candle) => c.open > 0 && c.close > 0)
      .sort((a: Candle, b: Candle) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

// ── 3) 수급: 외국인·기관·개인 순매수 (관심의 방향을 가르는 핵심) ──────────
interface TrendRow {
  bizdate: string;
  foreign: number;
  organ: number;
  indiv: number;
}
const num = (s?: string) => (s ? parseInt(s.replace(/[+,]/g, ""), 10) || 0 : 0);
async function fetchTrend(code: string): Promise<TrendRow[]> {
  try {
    const r = await fetch(`https://m.stock.naver.com/api/stock/${code}/trend?pageSize=5&page=1`, UA);
    const j = (await r.json()) as {
      bizdate: string;
      foreignerPureBuyQuant: string;
      organPureBuyQuant: string;
      individualPureBuyQuant: string;
    }[];
    return (j || []).map((x) => ({
      bizdate: x.bizdate,
      foreign: num(x.foreignerPureBuyQuant),
      organ: num(x.organPureBuyQuant),
      indiv: num(x.individualPureBuyQuant),
    }));
  } catch {
    return [];
  }
}

// ── 4) 재료: 최근 뉴스 (호재/악재 단어로 방향 근사) ───────────────────────
const GOOD_W = /수주|계약|공급|승인|허가|흑자|상향|호실적|최대\s?실적|신고가|급등|수혜|돌파|성공|체결|선정|확대|증설|자사주\s?취득|무상증자/;
const BAD_W = /하락|급락|약세|손실|적자|하향|철회|무산|취소|소송|리콜|제재|유상증자|전환사채|매도|처분|경고|하한가|부진|감소/;

export interface AttentionStock {
  code: string;
  name: string;
  rank: number;
  tradeValue: number | null; // 거래대금(백만원 or 억) — 풀에 따라
  turnover: number | null; // 회전율 = 거래대금/시총 (%) — 대형주 편향 제거
  leadRank: number | null; // 소속 테마 안에서의 등락률 순위(1=주도주)
  overPct: number | null; // 시간외/장전 예상 등락률
  overSession: string; // "시간외" | "장전"
  // 차트
  changePct: number | null; // 전일 등락률
  closePos: number | null; // 전일 종가의 캔들 내 위치(0=저가, 100=고가)
  vsMa5: number | null; // 5일선 대비 이격(%)
  vsMa20: number | null;
  // 거래량
  volMult: number | null; // 전일 거래량 / 20일 평균
  // 수급
  foreign: number; // 전일 외국인 순매수(주)
  organ: number;
  indiv: number;
  foreign3: number; // 3일 누적
  organ3: number;
  // 재료
  news: { title: string; link: string; good: boolean; bad: boolean }[];
  // 시황
  themeName: string | null;
  themeChg: number | null;
  // 종합
  buySignals: string[]; // 매수 관심 근거
  sellSignals: string[]; // 매도 관심 근거
  score: number; // 양수=매수 관심 우위
  verdict: string;
}

export interface AttentionResult {
  date: string;
  poolLabel: string;
  topThemes: { name: string; chg: number }[];
  stocks: AttentionStock[];
}

export type PoolKind = "theme" | "value" | "search";

export async function analyzeAttention(poolKind: PoolKind = "theme"): Promise<AttentionResult> {
  const themes = await fetchThemes().catch(() => [] as Theme[]);

  // 후보 풀
  //  theme  : 오늘 강세 테마의 주도주 (기본) — "오늘 뜨는 테마에서 1등 종목"
  //  value  : 거래대금 상위 (대형주 편향 있음)
  //  search : 조회수 상위
  const leaders = poolKind === "theme" ? await fetchThemeLeaders(themes) : [];
  const valueList = poolKind === "value" ? await fetchTopValue() : [];
  const pool =
    poolKind === "theme"
      ? leaders.map((x) => ({ code: x.code, name: x.name }))
      : poolKind === "value"
        ? valueList.map((x) => ({ code: x.code, name: x.name }))
        : await fetchMostSearched();
  const valueOf: Record<string, number> = {};
  for (const v of valueList) valueOf[v.code] = v.value;
  const leadOf: Record<string, { theme: string; themeChg: number; leadRank: number }> = {};
  for (const l of leaders) leadOf[l.code] = { theme: l.theme, themeChg: l.themeChg, leadRank: l.leadRank };
  // 오늘 강한 테마의 구성종목 → 종목별 테마 매칭용
  const strong = [...themes].sort((a, b) => b.chg - a.chg).slice(0, 8);
  const themeOf: Record<string, { name: string; chg: number }> = {};
  for (const t of strong) {
    const list = await fetchThemeStocks(t.no).catch(() => []);
    for (const s of list) if (!themeOf[s.code]) themeOf[s.code] = { name: t.name, chg: t.chg };
  }

  const stocks: AttentionStock[] = [];
  for (let i = 0; i < pool.length; i++) {
    const { code, name } = pool[i];
    const [rows, trend, news, over, turn] = await Promise.all([
      fetchDaily(code),
      fetchTrend(code),
      searchNews(name, { display: 10, sort: "date" }),
      fetchOverMarket(code),
      fetchTurnover(code),
    ]);
    if (rows.length < 21) continue;
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    const ma = (n: number) =>
      rows.slice(-n).reduce((a, r) => a + r.close, 0) / Math.min(n, rows.length);
    const avgVol20 = rows.slice(-21, -1).reduce((a, r) => a + r.vol, 0) / 20;

    const changePct = (last.close / prev.close - 1) * 100;
    const range = last.high - last.low;
    const closePos = range > 0 ? ((last.close - last.low) / range) * 100 : 50;
    const vsMa5 = (last.close / ma(5) - 1) * 100;
    const vsMa20 = (last.close / ma(20) - 1) * 100;
    const volMult = avgVol20 > 0 ? last.vol / avgVol20 : null;

    const t0 = trend[0] ?? { foreign: 0, organ: 0, indiv: 0, bizdate: "" };
    const f3 = trend.slice(0, 3).reduce((a, r) => a + r.foreign, 0);
    const o3 = trend.slice(0, 3).reduce((a, r) => a + r.organ, 0);

    const cutoff = Date.now() - 2 * 864e5;
    const recentNews = news
      .filter((n) => Number.isNaN(n.ts) || n.ts >= cutoff)
      .slice(0, 4)
      .map((n) => ({
        title: n.title,
        link: n.link,
        good: GOOD_W.test(n.title),
        bad: BAD_W.test(n.title),
      }));

    const lead = leadOf[code];
    const theme = lead
      ? { name: lead.theme, chg: lead.themeChg }
      : (themeOf[code] ?? null);

    // ── 매수 관심 vs 매도 관심 판정 ──
    const buy: string[] = [];
    const sell: string[] = [];
    let score = 0;
    // 수급 (가장 직접적)
    if (t0.foreign > 0 && t0.organ > 0) {
      buy.push("외국인·기관 동반 순매수");
      score += 2;
    } else if (t0.foreign > 0 || t0.organ > 0) {
      buy.push(t0.foreign > 0 ? "외국인 순매수" : "기관 순매수");
      score += 1;
    }
    if (t0.foreign < 0 && t0.organ < 0) {
      sell.push("외국인·기관 동반 순매도");
      score -= 2;
    }
    if (f3 > 0 && o3 > 0) {
      buy.push("3일 누적 외인·기관 매수");
      score += 1;
    }
    if (t0.indiv > 0 && t0.foreign < 0 && t0.organ < 0) {
      sell.push("개인만 사고 외인·기관은 던짐 (물량 떠넘기기)");
      score -= 1;
    }
    // 차트
    if (closePos >= 70) {
      buy.push(`전일 종가가 고가권(${closePos.toFixed(0)}%) — 매수세로 마감`);
      score += 1;
    } else if (closePos <= 30) {
      sell.push(`전일 종가가 저가권(${closePos.toFixed(0)}%) — 매도세로 마감`);
      score -= 1;
    }
    if (vsMa20 > 0 && vsMa5 > 0) {
      buy.push("5·20일선 위");
      score += 0.5;
    } else if (vsMa20 < -5) {
      sell.push("20일선 아래 이탈");
      score -= 0.5;
    }
    if (changePct <= -3) {
      sell.push(`전일 ${changePct.toFixed(1)}% 하락 — 하락에 쏠린 관심일 수 있음`);
      score -= 1;
    }
    if (changePct >= 10) {
      sell.push(`전일 +${changePct.toFixed(1)}% 급등 — 차익실현 매물 위험`);
      score -= 1;
    }
    // 거래량
    if (volMult != null && volMult >= 2) {
      if (changePct > 0) {
        buy.push(`거래량 ${volMult.toFixed(1)}배 + 상승 마감`);
        score += 1;
      } else {
        sell.push(`거래량 ${volMult.toFixed(1)}배인데 하락 — 매도 물량`);
        score -= 1;
      }
    }
    // 재료
    const g = recentNews.filter((n) => n.good).length;
    const b = recentNews.filter((n) => n.bad).length;
    if (g > b) {
      buy.push(`최근 뉴스 호재성 ${g}건`);
      score += 1;
    } else if (b > g) {
      sell.push(`최근 뉴스 악재성 ${b}건`);
      score -= 1;
    }
    // 주도주 (테마 내 1등)
    if (lead && lead.leadRank === 1) {
      buy.push(`${lead.theme} 테마 주도주(1위)`);
      score += 1;
    }
    // 회전율 — 시총 대비 얼마나 거래됐나 (대형주 편향 없는 열기 지표)
    if (turn.turnover != null) {
      if (turn.turnover >= 10) {
        buy.push(`회전율 ${turn.turnover.toFixed(1)}% — 시총 대비 거래 폭증`);
        score += 1;
      } else if (turn.turnover >= 5) {
        buy.push(`회전율 ${turn.turnover.toFixed(1)}%`);
        score += 0.5;
      }
    }
    // 시간외/장전 — 장 끝난 뒤에도 사려는 관심이 남았는지 (장전에 볼 수 있는 유일한 실시간 신호)
    if (over.pct != null && over.session) {
      if (over.pct >= 1) {
        buy.push(`${over.session} +${over.pct.toFixed(1)}% — 마감 후에도 매수세`);
        score += 1;
      } else if (over.pct <= -1) {
        sell.push(`${over.session} ${over.pct.toFixed(1)}% — 마감 후 매도세`);
        score -= 1;
      }
      if (over.pct >= 5) {
        sell.push(`${over.session} +${over.pct.toFixed(1)}% 과열 — 시가 갭 과대 위험`);
        score -= 1;
      }
    }
    // 시황
    if (theme && theme.chg >= 2) {
      buy.push(`오늘 강세 테마(${theme.name} +${theme.chg.toFixed(1)}%)`);
      score += 1;
    } else if (theme && theme.chg < 0) {
      sell.push(`테마 약세(${theme.name} ${theme.chg.toFixed(1)}%)`);
      score -= 0.5;
    }

    const verdict =
      score >= 3
        ? "🟢 사려는 관심 우위"
        : score >= 1
          ? "🟡 매수 쪽이나 근거 약함"
          : score > -1
            ? "⚪ 중립 — 판단 보류"
            : "🔴 팔려는 관심 우위";

    stocks.push({
      code,
      name,
      rank: i + 1,
      tradeValue: valueOf[code] ?? turn.value ?? null,
      turnover: turn.turnover,
      leadRank: leadOf[code]?.leadRank ?? null,
      overPct: over.pct,
      overSession: over.session,
      changePct,
      closePos,
      vsMa5,
      vsMa20,
      volMult,
      foreign: t0.foreign,
      organ: t0.organ,
      indiv: t0.indiv,
      foreign3: f3,
      organ3: o3,
      news: recentNews,
      themeName: theme?.name ?? null,
      themeChg: theme?.chg ?? null,
      buySignals: buy,
      sellSignals: sell,
      score,
      verdict,
    });
  }

  stocks.sort((a, b) => b.score - a.score);
  const k = new Date(Date.now() + 9 * 3600e3);
  return {
    date: `${k.getUTCMonth() + 1}/${k.getUTCDate()}`,
    poolLabel:
      poolKind === "theme"
        ? "오늘 강세 테마의 주도주"
        : poolKind === "value"
          ? "거래대금 상위"
          : "조회수 상위",
    topThemes: strong.slice(0, 5).map((t) => ({ name: t.name, chg: t.chg })),
    stocks,
  };
}
