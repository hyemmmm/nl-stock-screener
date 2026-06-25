export type Market = "KOSPI" | "KOSDAQ";

/** A single stock's daily fundamental snapshot. marketCap is in 억원 (100M KRW). */
export interface Stock {
  code: string;
  name: string;
  market: Market;
  sector: string;
  price: number; // 현재가 (원)
  changePct: number; // 등락률 (%)
  marketCap: number; // 시가총액 (억원)
  per: number; // 주가수익비율
  pbr: number; // 주가순자산비율
  dividendYield: number; // 배당수익률 (%)
  roe: number; // 자기자본이익률 (%)
  volume: number; // 거래량 (주)
}

export type NumericField =
  | "per"
  | "pbr"
  | "dividendYield"
  | "marketCap"
  | "roe"
  | "price"
  | "changePct"
  | "volume";

export type Op = "<" | "<=" | ">" | ">=" | "==";

export interface Condition {
  field: NumericField;
  op: Op;
  value: number;
  /** Human-readable, e.g. "PER < 10" */
  label: string;
}

export interface ScreenFilter {
  market?: Market | "ALL";
  sector?: string | null;
  conditions: Condition[];
  sortBy?: { field: NumericField; dir: "asc" | "desc" } | null;
  limit?: number;
  /** One-line explanation of how the query was interpreted. */
  rationale?: string;
}

export interface MatchDetail {
  label: string; // condition label, e.g. "PER < 10"
  actual: string; // formatted actual value, e.g. "PER 8.2"
}

export interface ScreenResult {
  stock: Stock;
  matched: MatchDetail[];
}

export interface ScreenResponse {
  filter: ScreenFilter;
  results: ScreenResult[];
  source: "claude" | "rules";
  count: number;
}

export interface Candle {
  time: string; // "YYYY-MM-DD"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartResponse {
  code: string;
  name: string;
  candles: Candle[];
  source: "kis" | "mock";
}
