import { getUniverse } from "@/lib/universe";
import { formatActual } from "@/lib/fields";
import type {
  Condition,
  EnrichedStock,
  MatchDetail,
  NumericField,
  ScreenFilter,
  ScreenResult,
} from "@/lib/types";

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
    matched.push({ label: c.label, actual: formatActual(c.field, actual) });
  }
  return matched;
}

export function screen(filter: ScreenFilter): ScreenResult[] {
  const market = filter.market ?? "ALL";
  const sector = filter.sector?.trim() || null;

  const results: ScreenResult[] = [];

  for (const stock of getUniverse()) {
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
