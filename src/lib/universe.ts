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

export function getUniverse(): EnrichedStock[] {
  if (cached) return cached;

  cached = SNAPSHOT.map((s) => {
    const candles = generateCandles(s.code, s.price);
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
    };
  });
  return cached;
}
