import { SNAPSHOT } from "@/data/snapshot";
import type {
  Condition,
  MatchDetail,
  NumericField,
  ScreenFilter,
  ScreenResult,
  Stock,
} from "@/lib/types";

const FIELD_LABEL: Record<NumericField, string> = {
  per: "PER",
  pbr: "PBR",
  dividendYield: "배당수익률",
  marketCap: "시가총액",
  roe: "ROE",
  price: "주가",
  changePct: "등락률",
  volume: "거래량",
};

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

function formatActual(field: NumericField, value: number): string {
  const label = FIELD_LABEL[field];
  if (field === "marketCap") return `${label} ${value.toLocaleString()}억`;
  if (field === "dividendYield" || field === "roe" || field === "changePct")
    return `${label} ${value.toFixed(1)}%`;
  if (field === "volume") return `${label} ${value.toLocaleString()}주`;
  if (field === "price") return `${label} ${value.toLocaleString()}원`;
  return `${label} ${value.toFixed(1)}`;
}

function passesConditions(stock: Stock, conditions: Condition[]): MatchDetail[] | null {
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

  let results: ScreenResult[] = [];

  for (const stock of SNAPSHOT) {
    if (market !== "ALL" && stock.market !== market) continue;
    if (sector && !stock.sector.includes(sector)) continue;

    const matched = passesConditions(stock, filter.conditions);
    if (matched === null) continue;

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
