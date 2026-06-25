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
  recentMaxVol: "최근 최대거래량",
};

const PERCENT_FIELDS: NumericField[] = [
  "dividendYield",
  "roe",
  "changePct",
  "volSurgeRatio",
  "volDropRatio",
  "gap5MAAbs",
];
const VOLUME_FIELDS: NumericField[] = ["volume", "recentMaxVol"];

export function unitFor(field: NumericField): string {
  if (field === "marketCap" || field === "tradingValue") return "억";
  if (PERCENT_FIELDS.includes(field)) return "%";
  if (VOLUME_FIELDS.includes(field)) return "주";
  if (field === "price") return "원";
  return "";
}

/** Compact display of a field value, e.g. 12,000,000 → "1,200만주". */
function fmtValue(field: NumericField, value: number): string {
  if (field === "marketCap" || field === "tradingValue")
    return `${Math.round(value).toLocaleString()}억`;
  if (VOLUME_FIELDS.includes(field)) {
    const man = Math.round(value / 10_000);
    return `${man.toLocaleString()}만주`;
  }
  if (field === "volSurgeRatio" || field === "volDropRatio")
    return `${Math.round(value).toLocaleString()}%`;
  if (PERCENT_FIELDS.includes(field)) return `${value.toFixed(1)}%`;
  if (field === "price") return `${value.toLocaleString()}원`;
  return value.toFixed(1);
}

/** "PER < 10", "최근 최대거래량 >= 1,000만주" — filter chips. */
export function makeLabel(field: NumericField, op: Op, value: number): string {
  return `${FIELD_LABEL[field]} ${op} ${fmtValue(field, value)}`;
}

/** "PER 8.2", "전일 거래량비 720%" — the stock's actual value, for explainability. */
export function formatActual(field: NumericField, value: number): string {
  return `${FIELD_LABEL[field]} ${fmtValue(field, value)}`;
}

/** Just the target part: "< 10", ">= 1,000만주" — the right side of a ✓ row. */
export function thresholdLabel(field: NumericField, op: Op, value: number): string {
  return `${op} ${fmtValue(field, value)}`;
}
