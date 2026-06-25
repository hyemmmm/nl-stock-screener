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
  | "volume"
  // technical (derived from the candle series)
  | "volSurgeRatio" // 전일 거래량 / 전전일 거래량 × 100
  | "volDropRatio" // 당일 거래량 / 전일 거래량 × 100
  | "gap5MAAbs" // |5일선 이격도| %
  | "tradingValue" // 거래대금 (억)
  | "recentMaxVol"; // 최근 ~2개월 최대 거래량 (주)

export type Op = "<" | "<=" | ">" | ">=" | "==";

export interface Condition {
  field: NumericField;
  op: Op;
  value: number;
  /** Human-readable, e.g. "PER < 10" */
  label: string;
}

/** A stock enriched with technical metrics computed from its candle series. */
export interface EnrichedStock extends Stock {
  ma5: number; // 5일 이동평균
  gap5MA: number; // 5일선 이격도 % (부호)
  gap5MAAbs: number; // |이격도| %
  volSurgeRatio: number; // 전일 거래량 / 전전일 거래량 × 100 (신호일 기준)
  volDropRatio: number; // 당일 거래량 / 전일 거래량 × 100 (신호일 기준)
  bearish: boolean; // 신호일 음봉 여부
  tradingValue: number; // 거래대금 (억)
  recentMaxVol: number; // 최근 ~2개월 최대 거래량 (주)
  signalDate: string; // 신호일 (YYYY-MM-DD)
  signalDaysAgo: number; // 신호일이 며칠 전(거래일)인지
}

export interface ScreenFilter {
  market?: Market | "ALL";
  sector?: string | null;
  conditions: Condition[];
  /** 음봉 필터: true=음봉만, false=양봉만, null/미지정=무관 */
  bearish?: boolean | null;
  sortBy?: { field: NumericField; dir: "asc" | "desc" } | null;
  limit?: number;
  /** One-line explanation of how the query was interpreted. */
  rationale?: string;
}

export interface MatchDetail {
  label: string; // condition label, e.g. "PER < 10"
  actual: string; // formatted actual value, e.g. "PER 8.2"
  threshold?: string; // target part, e.g. "< 10" — for the ✓ checklist
}

export interface ScreenResult {
  stock: EnrichedStock;
  matched: MatchDetail[];
}

export interface ScreenResponse {
  filter: ScreenFilter;
  results: ScreenResult[];
  source: "claude" | "groq" | "rules";
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
