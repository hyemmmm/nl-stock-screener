import type { Candle } from "@/lib/types";

// ──────────────────────────────────────────────────────────────────────────
// Deterministic candle generation + technical-pattern detection.
//
// Both the per-stock chart (kis.ts mock fallback) and the universe screener
// (universe.ts) build candles from here, so a stock's chart and its computed
// technical metrics always agree.
//
// The surge→drop→bearish pattern is detected over a WINDOW (not just the last
// bar), so we can report on which day ("며칠 전") it occurred. In demo mode a
// deterministic subset of stocks has the pattern injected at a varied offset.
// ──────────────────────────────────────────────────────────────────────────

const SIGNAL_LOOKBACK = 20; // trading days to scan for a signal day
const VOL_LOOKBACK = 40; // ~2 months, for "recent max volume"

function hash(code: string): number {
  return Array.from(code).reduce((a, c) => a + c.charCodeAt(0), 0);
}

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export type PatternKind =
  | "surge-drop-bearish" // 거래량 폭증 → 급감 + 음봉 + 5일선 근접 (varied day)
  | "sustained-surge" // 거래량 지속 폭증 + 양봉 급등 (today)
  | "near-ma" // 5일선 근접 (today)
  | "natural";

export function patternFor(code: string): PatternKind {
  switch (hash(code) % 4) {
    case 0:
      return "surge-drop-bearish";
    case 1:
      return "sustained-surge";
    case 2:
      return "near-ma";
    default:
      return "natural";
  }
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function meanClose(candles: Candle[], from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += candles[i].close;
  return sum / (to - from);
}

/**
 * Overlay a pattern onto the candle series. For surge-drop-bearish the event is
 * placed `offset` bars before the last bar so different stocks signal on
 * different days. Mutates `candles` in place; `rnd` keeps it deterministic.
 */
function injectPattern(candles: Candle[], kind: PatternKind, rnd: () => number) {
  const n = candles.length;
  if (n < 10 || kind === "natural") return;

  if (kind === "surge-drop-bearish") {
    const offset = Math.min(Math.floor(rnd() * 15), n - 7); // 0~14 bars ago
    const p = n - 1 - offset; // event (drop+bearish) day
    const d0 = candles[p];
    const d1 = candles[p - 1]; // spike day
    const d2 = candles[p - 2];

    const baseVol = 600_000 + Math.round(rnd() * 800_000);
    d2.volume = baseVol;
    d1.volume = Math.round(baseVol * (12 + rnd() * 10)); // +1100~2100%
    d0.volume = Math.round(d1.volume * (0.08 + rnd() * 0.12)); // drop to 8~20%

    // close near the 5-day MA, and make the event day a bearish (down) candle
    const anchor = meanClose(candles, p - 4, p);
    const close = Math.round(anchor * (1 + (rnd() - 0.5) * 0.02));
    d0.close = close;
    d0.open = Math.round(close * (1 + 0.015 + rnd() * 0.02)); // open > close → 음봉
    d0.high = Math.round(Math.max(d0.open, close) * (1 + rnd() * 0.01));
    d0.low = Math.round(Math.min(d0.open, close) * (1 - rnd() * 0.01));
  } else if (kind === "sustained-surge") {
    const d0 = candles[n - 1];
    const baseVol = 1_000_000 + Math.round(rnd() * 1_000_000);
    candles[n - 3].volume = baseVol;
    candles[n - 2].volume = Math.round(baseVol * (8 + rnd() * 8)); // 폭증, 최대 ~32M (양봉+대량거래)
    d0.volume = Math.round(candles[n - 2].volume * (0.9 + rnd() * 0.3));
    d0.close = Math.round(d0.open * (1.04 + rnd() * 0.05)); // bullish 급등 +4~9%
    d0.high = Math.round(d0.close * (1 + rnd() * 0.01));
    d0.low = Math.round(d0.open * (1 - rnd() * 0.01));
  } else if (kind === "near-ma") {
    const d0 = candles[n - 1];
    const anchor = meanClose(candles, n - 5, n - 1);
    const close = Math.round(anchor * (1 + (rnd() - 0.5) * 0.015));
    d0.close = close;
    d0.open = Math.round(close * (1 - rnd() * 0.01)); // mild 양봉
    d0.high = Math.round(close * (1 + rnd() * 0.01));
    d0.low = Math.round(d0.open * (1 - rnd() * 0.01));
  }
}

export function generateCandles(code: string, basePrice: number): Candle[] {
  const rnd = seededRandom(hash(code) + basePrice);
  const days = 120;

  let price = basePrice;
  const series: number[] = [];
  for (let i = 0; i < days; i++) {
    series.push(price);
    const drift = (rnd() - 0.48) * 0.03;
    price = price / (1 + drift);
  }
  series.reverse();

  const today = new Date();
  const candles: Candle[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - i));
    if (d.getDay() === 0 || d.getDay() === 6) continue; // skip weekends

    const close = Math.round(series[i]);
    const open = Math.round(close * (1 + (rnd() - 0.5) * 0.02));
    const high = Math.round(Math.max(open, close) * (1 + rnd() * 0.015));
    const low = Math.round(Math.min(open, close) * (1 - rnd() * 0.015));
    const volume = Math.round(100_000 + rnd() * 2_000_000);
    candles.push({ time: fmtDate(d), open, high, low, close, volume });
  }

  injectPattern(candles, patternFor(code), rnd);
  return candles;
}

// ── Technical metrics ──────────────────────────────────────────────────────

export interface TechMetrics {
  ma5: number;
  gap5MA: number;
  gap5MAAbs: number;
  volSurgeRatio: number; // 전일 거래량 / 전전일 거래량 × 100 (신호일 기준)
  volDropRatio: number; // 당일 거래량 / 전일 거래량 × 100 (신호일 기준)
  bearish: boolean; // 신호일 음봉 여부
  signalDate: string; // 신호일 (YYYY-MM-DD)
  signalDaysAgo: number; // 신호일이 며칠 전(거래일)인지
  recentMaxVol: number; // 최근 ~2개월 최대 거래량 (주)
  lastClose: number;
  lastChangePct: number; // 당일(오늘) 등락률 %
  lastVolume: number;
  tradingValue: number; // 거래대금 (억) = 종가 × 거래량 / 1e8
}

function surgeAt(c: Candle[], d: number): number {
  return c[d - 2].volume > 0 ? (c[d - 1].volume / c[d - 2].volume) * 100 : 0;
}
function dropAt(c: Candle[], d: number): number {
  return c[d - 1].volume > 0 ? (c[d].volume / c[d - 1].volume) * 100 : 0;
}

/**
 * Find the event day (drop+bearish bar after a spike) with the strongest surge
 * within the lookback window. Returns the last bar index if none qualifies.
 */
function detectSignalIndex(c: Candle[]): number {
  const n = c.length;
  let best = -1;
  let bestSurge = 0;
  for (let d = n - 1; d >= Math.max(4, n - SIGNAL_LOOKBACK); d--) {
    const bearish = c[d].close < c[d].open;
    if (!bearish) continue;
    if (dropAt(c, d) > 40) continue; // must be a meaningful drop
    const surge = surgeAt(c, d);
    if (surge < 300) continue; // must follow a spike
    if (surge > bestSurge) {
      bestSurge = surge;
      best = d;
    }
  }
  return best === -1 ? n - 1 : best;
}

export function computeTech(candles: Candle[]): TechMetrics {
  const n = candles.length;
  const last = candles[n - 1];
  const prevClose = candles[n - 2].close;

  const d = detectSignalIndex(candles);
  const ma5 = meanClose(candles, d - 4, d + 1);
  const gap5MA = ((candles[d].close - ma5) / ma5) * 100;

  let recentMaxVol = 0;
  for (let i = Math.max(0, n - VOL_LOOKBACK); i < n; i++) {
    if (candles[i].volume > recentMaxVol) recentMaxVol = candles[i].volume;
  }

  return {
    ma5: Math.round(ma5),
    gap5MA,
    gap5MAAbs: Math.abs(gap5MA),
    volSurgeRatio: surgeAt(candles, d),
    volDropRatio: dropAt(candles, d),
    bearish: candles[d].close < candles[d].open,
    signalDate: candles[d].time,
    signalDaysAgo: n - 1 - d,
    recentMaxVol,
    lastClose: last.close,
    lastChangePct: prevClose > 0 ? ((last.close - prevClose) / prevClose) * 100 : 0,
    lastVolume: last.volume,
    tradingValue: (last.close * last.volume) / 1e8,
  };
}
