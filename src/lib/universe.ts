import { SNAPSHOT } from "@/data/snapshot";
import { computeTech, generateCandles } from "@/lib/candles";
import type { EnrichedStock } from "@/lib/types";

// ──────────────────────────────────────────────────────────────────────────
// The screening universe: every stock enriched with technical metrics derived
// from its (mock) candle series. Built once and cached in module memory.
//
// price / changePct / volume are synced to the latest candle so a card's
// numbers, its technical badges, and its chart all tell the same story.
// Fundamentals (PER, PBR, 배당, 시총, ROE, 섹터) stay from the snapshot.
//
// In production this would be a daily post-close batch over the full KIS
// universe; the shape and the screener on top of it are identical.
// ──────────────────────────────────────────────────────────────────────────

let cached: EnrichedStock[] | null = null;
// Per-code daily volume series (most recent last) so recentMaxVol can be
// recomputed for any user-chosen "최근 N거래일" window without rebuilding.
const volSeries = new Map<string, number[]>();

export function getUniverse(): EnrichedStock[] {
  if (cached) return cached;

  cached = SNAPSHOT.map((s) => {
    const candles = generateCandles(s.code, s.price);
    volSeries.set(
      s.code,
      candles.map((c) => c.volume),
    );
    const t = computeTech(candles);
    return {
      ...s,
      price: t.lastClose,
      changePct: Number(t.lastChangePct.toFixed(2)),
      volume: t.lastVolume,
      ma5: t.ma5,
      gap5MA: t.gap5MA,
      gap5MAAbs: t.gap5MAAbs,
      volSurgeRatio: t.volSurgeRatio,
      volDropRatio: t.volDropRatio,
      bearish: t.bearish,
      tradingValue: t.tradingValue,
      recentMaxVol: t.recentMaxVol,
      signalDate: t.signalDate,
      signalDaysAgo: t.signalDaysAgo,
    };
  });
  return cached;
}

/** Max volume over the most recent `days` trading days, for a given stock. */
export function recentMaxVolFor(code: string, days: number): number {
  const v = volSeries.get(code);
  if (!v || v.length === 0) return 0;
  const slice = v.slice(Math.max(0, v.length - days));
  return slice.reduce((m, x) => (x > m ? x : m), 0);
}
