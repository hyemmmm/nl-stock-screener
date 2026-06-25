import { getUniverse, recentMaxVolFor } from "@/lib/universe";
import { RECENT_VOL_DAYS_DEFAULT } from "@/lib/config";
import { formatActual, thresholdLabel } from "@/lib/fields";
import type {
  Condition,
  EnrichedStock,
  MatchDetail,
  NumericField,
  ScreenFilter,
  ScreenResult,
} from "@/lib/types";

// Fields whose evaluation is anchored to a detected "signal day" — when any of
// these (or 음봉) is filtered, we surface that day's date for explainability.
const SIGNAL_FIELDS: NumericField[] = ["volSurgeRatio", "volDropRatio", "gap5MAAbs"];

function compare(actual: number, op: Condition["op"], value: number): boolean {
  switch (op) {
    case "<":
      return actual < value;
    case "<=":
      return actual <= value;
    case ">":
      return actual > value;
    case ">=":
      return actual >= value;
    case "==":
      return actual === value;
  }
}

/** PER/PBR of 0 means "no earnings / N/A" — treat as failing valuation filters. */
function isMeaningful(field: NumericField, value: number): boolean {
  if ((field === "per" || field === "pbr") && value <= 0) return false;
  return true;
}

function passesConditions(stock: EnrichedStock, conditions: Condition[]): MatchDetail[] | null {
  const matched: MatchDetail[] = [];
  for (const c of conditions) {
    const actual = stock[c.field];
    if (!isMeaningful(c.field, actual)) return null;
    if (!compare(actual, c.op, c.value)) return null;
    matched.push({
      label: c.label,
      actual: formatActual(c.field, actual),
      threshold: thresholdLabel(c.field, c.op, c.value),
    });
  }
  return matched;
}

export function screen(
  filter: ScreenFilter,
  recentDays: number = RECENT_VOL_DAYS_DEFAULT,
): ScreenResult[] {
  const market = filter.market ?? "ALL";
  const sector = filter.sector?.trim() || null;
  // Recompute recentMaxVol for the chosen "최근 N거래일" window if it differs.
  const overrideRecent = recentDays !== RECENT_VOL_DAYS_DEFAULT;

  const results: ScreenResult[] = [];

  for (const base of getUniverse()) {
    const stock = overrideRecent
      ? { ...base, recentMaxVol: recentMaxVolFor(base.code, recentDays) }
      : base;

    if (market !== "ALL" && stock.market !== market) continue;
    if (sector && !stock.sector.includes(sector)) continue;

    // 음봉/양봉 filter
    if (filter.bearish != null && stock.bearish !== filter.bearish) continue;

    const matched = passesConditions(stock, filter.conditions);
    if (matched === null) continue;

    if (filter.bearish != null) {
      matched.unshift({
        label: filter.bearish ? "음봉" : "양봉",
        actual: filter.bearish ? "음봉" : "양봉",
      });
    }

    // For signal-day pattern queries, surface WHEN the pattern occurred.
    const isSignalQuery =
      filter.bearish != null ||
      filter.conditions.some((c) => SIGNAL_FIELDS.includes(c.field));
    if (isSignalQuery) {
      matched.unshift({
        label: "신호일",
        actual:
          stock.signalDaysAgo === 0
            ? `신호일 ${stock.signalDate} (오늘)`
            : `신호일 ${stock.signalDate} (${stock.signalDaysAgo}거래일 전)`,
      });
    }

    results.push({ stock, matched });
  }

  // Sort: explicit sortBy wins; otherwise by market cap desc as a sensible default.
  const sortBy = filter.sortBy;
  results.sort((a, b) => {
    if (sortBy) {
      const av = a.stock[sortBy.field];
      const bv = b.stock[sortBy.field];
      return sortBy.dir === "asc" ? av - bv : bv - av;
    }
    return b.stock.marketCap - a.stock.marketCap;
  });

  const limit = filter.limit && filter.limit > 0 ? filter.limit : 30;
  return results.slice(0, limit);
}
