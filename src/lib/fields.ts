import type { NumericField, Op } from "@/lib/types";

// Single source of truth for how each numeric field is labelled, formatted,
// and turned into a human-readable condition string. Shared by the parser
// (parse.ts) and the screener (screener.ts) so they never drift.

export const FIELD_LABEL: Record<NumericField, string> = {
  per: "PER",
  pbr: "PBR",
  dividendYield: "배당수익률",
  marketCap: "시가총액",
  roe: "ROE",
  price: "주가",
  changePct: "등락률",
  volume: "거래량",
  volSurgeRatio: "전일 거래량비",
  volDropRatio: "당일 거래량비",
  gap5MAAbs: "5일선 이격",
  tradingValue: "거래대금",
};

const PERCENT_FIELDS: NumericField[] = [
  "dividendYield",
  "roe",
  "changePct",
  "volSurgeRatio",
  "volDropRatio",
  "gap5MAAbs",
];

export function unitFor(field: NumericField): string {
  if (field === "marketCap" || field === "tradingValue") return "억";
  if (PERCENT_FIELDS.includes(field)) return "%";
  if (field === "volume") return "주";
  if (field === "price") return "원";
  return "";
}

/** "PER < 10", "전일 거래량비 > 500%" — used for filter chips & matched badges. */
export function makeLabel(field: NumericField, op: Op, value: number): string {
  return `${FIELD_LABEL[field]} ${op} ${value.toLocaleString()}${unitFor(field)}`;
}

/** "PER 8.2", "전일 거래량비 720%" — the stock's actual value, for explainability. */
export function formatActual(field: NumericField, value: number): string {
  const label = FIELD_LABEL[field];
  if (field === "marketCap" || field === "tradingValue")
    return `${label} ${Math.round(value).toLocaleString()}억`;
  if (field === "volSurgeRatio" || field === "volDropRatio")
    return `${label} ${Math.round(value).toLocaleString()}%`;
  if (PERCENT_FIELDS.includes(field)) return `${label} ${value.toFixed(1)}%`;
  if (field === "volume") return `${label} ${value.toLocaleString()}주`;
  if (field === "price") return `${label} ${value.toLocaleString()}원`;
  return `${label} ${value.toFixed(1)}`;
}
