// ──────────────────────────────────────────────────────────────────────────
// 🌙 시간외 단일가 테마 감지 (16:00~18:00)
//   전제: "한 종목이 아니라 섹터 전체가 시간외에서 시세를 뿜으면
//          다음날 그게 테마가 될 확률이 크다."
//   → 개별 급등주가 아니라 **폭(breadth)**을 본다. 테마 구성종목 중 몇 %가 올랐나.
//   전 종목(약 2,300개)을 네이버 벌크 시세로 훑고, 테마별로 묶어 점수를 매긴다.
// ──────────────────────────────────────────────────────────────────────────
import { fetchThemes, fetchThemeStocks } from "./issues";

const H = { headers: { referer: "https://finance.naver.com/", "User-Agent": "Mozilla/5.0" }, cache: "no-store" as const };
const MH = { headers: { referer: "https://m.stock.naver.com/", "User-Agent": "Mozilla/5.0" }, cache: "no-store" as const };
const num = (s?: string) => (s ? parseFloat(String(s).replace(/,/g, "")) : NaN);

// ── 1) 전 종목 코드 (시총순 페이징) ────────────────────────────────────────
async function allCodes(): Promise<Map<string, string>> {
  const out = new Map<string, string>(); // code → name
  for (const mkt of ["KOSPI", "KOSDAQ"]) {
    for (let p = 1; p <= 15; p++) {
      try {
        const j = (await (
          await fetch(`https://m.stock.naver.com/api/stocks/marketValue/${mkt}?page=${p}&pageSize=100`, MH)
        ).json()) as { stocks?: { itemCode: string; stockName: string; stockEndType: string }[] };
        if (!j.stocks?.length) break;
        for (const s of j.stocks) if (s.stockEndType === "stock") out.set(s.itemCode, s.stockName);
      } catch {
        break;
      }
    }
  }
  return out;
}

// ── 2) 시간외 시세 벌크 조회 (80종목/콜) ───────────────────────────────────
export interface OverQuote {
  code: string;
  name: string;
  close: number; // 정규장 종가
  dayPct: number; // 정규장 등락률
  overPrice: number; // 시간외 단일가
  overPct: number; // 시간외 등락률 (종가 대비) ← 핵심
  status: string; // OPEN | CLOSE
}

async function fetchOverBulk(codes: string[]): Promise<Map<string, OverQuote>> {
  const map = new Map<string, OverQuote>();
  const chunks: string[] = [];
  for (let i = 0; i < codes.length; i += 80) chunks.push(codes.slice(i, i + 80).join(","));
  for (let i = 0; i < chunks.length; i += 8) {
    const rs = await Promise.all(
      chunks.slice(i, i + 8).map((q) =>
        fetch(`https://polling.finance.naver.com/api/realtime/domestic/stock/${q}`, H)
          .then((r) => r.json())
          .catch(() => ({ datas: [] })),
      ),
    );
    for (const r of rs as { datas?: Record<string, unknown>[] }[]) {
      for (const d of r.datas ?? []) {
        const o = d.overMarketPriceInfo as Record<string, unknown> | undefined;
        const close = num(d.closePrice as string);
        const over = num(o?.overPrice as string);
        if (!o || !(close > 0) || !(over > 0)) continue;
        map.set(d.itemCode as string, {
          code: d.itemCode as string,
          name: d.stockName as string,
          close,
          dayPct: num(d.fluctuationsRatio as string) || 0,
          overPrice: over,
          // 네이버가 주는 fluctuationsRatio는 '전일 종가' 대비라 정규장 상승분이 섞여 있다.
          // 시간외에서만 얼마나 움직였는지는 오늘 종가 대비로 직접 계산해야 한다.
          overPct: (over / close - 1) * 100,
          status: String((o.overMarketStatus as string) ?? ""),
        });
      }
    }
  }
  return map;
}

// ── 3) 테마 → 구성종목 맵 (무겁다: 하루 한 번만 만들고 캐시) ────────────────
interface ThemeDef {
  no: string;
  name: string;
  chg: number;
  codes: string[];
}
let themeCache: { at: number; defs: ThemeDef[] } | null = null;

async function themeDefs(limit: number): Promise<ThemeDef[]> {
  if (themeCache && Date.now() - themeCache.at < 12 * 3600e3) return themeCache.defs;
  const themes = (await fetchThemes()).slice(0, limit);
  const defs: ThemeDef[] = [];
  for (let i = 0; i < themes.length; i += 8) {
    const got = await Promise.all(
      themes.slice(i, i + 8).map(async (t) => {
        const list = await fetchThemeStocks(t.no).catch(() => []);
        return { no: t.no, name: t.name, chg: t.chg, codes: list.map((s) => s.code) };
      }),
    );
    defs.push(...got.filter((d) => d.codes.length >= 3));
  }
  themeCache = { at: Date.now(), defs };
  return defs;
}

// ── 4) 테마별 시간외 집계 ──────────────────────────────────────────────────
export interface ThemeHeat {
  no: string;
  name: string;
  dayChg: number; // 정규장 테마 등락률
  n: number; // 시간외 시세가 잡힌 구성종목 수
  upRate: number; // 그중 오른 비율 (%)  ← "섹터 전체가 뿜었나"
  strongCount: number; // +1% 이상 오른 종목 수
  avgPct: number; // 평균 시간외 등락률
  medPct: number; // 중앙값 — 한 종목 급등에 안 휘둘리는 지표
  score: number;
  verdict: "🔥 섹터 시세" | "🟡 관찰" | "⚪ 무의미";
  stocks: OverQuote[]; // 시간외 등락률 내림차순
}

export interface AfterHoursResult {
  at: string; // 조회 시각 (KST)
  session: string; // 시간외 단일가 상태
  scanned: number; // 시간외 시세가 잡힌 종목 수
  themes: ThemeHeat[];
  solo: OverQuote[]; // 테마 없이 혼자 뛴 종목 (참고용 — 확률 낮은 쪽)
  note?: string;
}

// 테마 수를 줄이면 커버리지가 그대로 깎인다(120개로 줄였더니 🔥로 잡힌 테마가 통째로 누락됐다).
// 전 종목 스캔이 2~3초, 서버리스 실측 15초로 60초 한도에 여유가 있어 배포에서도 전부 본다.
export async function getAfterHours(): Promise<AfterHoursResult> {
  const [codeMap, defs] = await Promise.all([allCodes(), themeDefs(260)]);
  const quotes = await fetchOverBulk([...codeMap.keys()]);

  const kst = new Date(Date.now() + 9 * 3600e3);
  const p2 = (n: number) => String(n).padStart(2, "0");
  const at = `${p2(kst.getUTCHours())}:${p2(kst.getUTCMinutes())}`;
  const session = [...quotes.values()].some((q) => q.status === "OPEN") ? "진행 중" : "마감";

  const themes: ThemeHeat[] = [];
  for (const d of defs) {
    const ss = d.codes.map((c) => quotes.get(c)).filter((x): x is OverQuote => !!x);
    if (ss.length < 3) continue; // 표본이 3개 미만이면 "섹터 전체"를 논할 수 없다
    const up = ss.filter((s) => s.overPct > 0).length;
    const strong = ss.filter((s) => s.overPct >= 1).length;
    const avg = ss.reduce((a, b) => a + b.overPct, 0) / ss.length;
    const upRate = (up / ss.length) * 100;
    // 중앙값을 주 지표로 쓴다. 평균은 한 종목이 +7% 튀면 테마 전체가 뜬 것처럼 보이지만,
    // 중앙값이 같이 올라오려면 구성종목 절반 이상이 실제로 움직여야 한다.
    const sorted = [...ss].map((s) => s.overPct).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const med = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    // 사용자 규칙: "하나의 종목이 아니라 섹터 전체가 시세를 보여줬을 때"
    const verdict: ThemeHeat["verdict"] =
      strong >= 3 && upRate >= 60 && med >= 0.5
        ? "🔥 섹터 시세"
        : strong >= 2 && upRate >= 50 && med > 0
          ? "🟡 관찰"
          : "⚪ 무의미";
    themes.push({
      no: d.no,
      name: d.name,
      dayChg: d.chg,
      n: ss.length,
      upRate,
      strongCount: strong,
      avgPct: avg,
      medPct: med,
      score: med * (0.5 + upRate / 200) + strong * 0.2,
      verdict,
      stocks: ss.sort((a, b) => b.overPct - a.overPct),
    });
  }
  themes.sort((a, b) => b.score - a.score);

  // 혼자 뛴 종목 = 개별 재료. 규칙상 확률이 낮은 쪽이지만, 뭐가 움직였는지는 봐야 하니 따로 뺀다.
  const solo = [...quotes.values()]
    .filter((q) => q.overPct >= 2)
    .sort((a, b) => b.overPct - a.overPct)
    .slice(0, 15);

  return {
    at,
    session,
    scanned: quotes.size,
    themes: themes.slice(0, 20),
    solo,
    note: quotes.size < 50 ? "시간외 시세가 거의 없습니다 (16:00~18:00에만 유효)" : undefined,
  };
}
