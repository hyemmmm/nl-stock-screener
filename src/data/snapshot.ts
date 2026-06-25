import type { Stock } from "@/lib/types";

/**
 * Mock end-of-day snapshot of ~50 well-known Korean stocks.
 *
 * In production this array would be replaced by a daily job that pulls the
 * full universe (~2,600 names) from KIS after market close and caches it.
 * The shape is identical, so the screener code is unchanged either way.
 *
 * Numbers are plausible but illustrative — do NOT use for real investing.
 */
export const SNAPSHOT: Stock[] = [
  { code: "005930", name: "삼성전자", market: "KOSPI", sector: "반도체", price: 79800, changePct: 1.27, marketCap: 4763000, per: 14.2, pbr: 1.4, dividendYield: 1.8, roe: 9.8, volume: 12850000 },
  { code: "000660", name: "SK하이닉스", market: "KOSPI", sector: "반도체", price: 201500, changePct: 2.91, marketCap: 1467000, per: 11.6, pbr: 1.9, dividendYield: 0.7, roe: 16.4, volume: 4120000 },
  { code: "373220", name: "LG에너지솔루션", market: "KOSPI", sector: "2차전지", price: 384000, changePct: -1.04, marketCap: 898000, per: 58.0, pbr: 3.6, dividendYield: 0.1, roe: 6.2, volume: 412000 },
  { code: "207940", name: "삼성바이오로직스", market: "KOSPI", sector: "바이오", price: 781000, changePct: 0.39, marketCap: 556000, per: 62.5, pbr: 6.1, dividendYield: 0.0, roe: 10.5, volume: 98000 },
  { code: "005380", name: "현대차", market: "KOSPI", sector: "자동차", price: 246500, changePct: 0.61, marketCap: 516000, per: 5.1, pbr: 0.6, dividendYield: 5.2, roe: 12.3, volume: 720000 },
  { code: "000270", name: "기아", market: "KOSPI", sector: "자동차", price: 118200, changePct: 1.11, marketCap: 472000, per: 4.4, pbr: 0.9, dividendYield: 5.8, roe: 21.5, volume: 1320000 },
  { code: "068270", name: "셀트리온", market: "KOSPI", sector: "바이오", price: 182300, changePct: -0.65, marketCap: 397000, per: 44.1, pbr: 2.3, dividendYield: 0.3, roe: 5.7, volume: 540000 },
  { code: "005490", name: "POSCO홀딩스", market: "KOSPI", sector: "철강", price: 384000, changePct: -2.12, marketCap: 324000, per: 9.8, pbr: 0.5, dividendYield: 3.4, roe: 5.1, volume: 410000 },
  { code: "035420", name: "NAVER", market: "KOSPI", sector: "인터넷", price: 168500, changePct: 1.84, marketCap: 269000, per: 18.7, pbr: 1.2, dividendYield: 0.8, roe: 6.9, volume: 880000 },
  { code: "012330", name: "현대모비스", market: "KOSPI", sector: "자동차부품", price: 231000, changePct: 0.22, marketCap: 217000, per: 5.6, pbr: 0.5, dividendYield: 2.9, roe: 8.4, volume: 290000 },
  { code: "035720", name: "카카오", market: "KOSPI", sector: "인터넷", price: 38950, changePct: -1.39, marketCap: 173000, per: 41.2, pbr: 1.4, dividendYield: 0.1, roe: 2.1, volume: 2210000 },
  { code: "051910", name: "LG화학", market: "KOSPI", sector: "화학", price: 312500, changePct: -0.79, marketCap: 220000, per: 22.4, pbr: 0.9, dividendYield: 2.0, roe: 3.8, volume: 360000 },
  { code: "006400", name: "삼성SDI", market: "KOSPI", sector: "2차전지", price: 318000, changePct: -1.85, marketCap: 218000, per: 18.9, pbr: 1.1, dividendYield: 1.3, roe: 6.0, volume: 410000 },
  { code: "105560", name: "KB금융", market: "KOSPI", sector: "은행", price: 84300, changePct: 1.69, marketCap: 327000, per: 6.2, pbr: 0.6, dividendYield: 4.4, roe: 9.6, volume: 1340000 },
  { code: "055550", name: "신한지주", market: "KOSPI", sector: "은행", price: 53700, changePct: 0.94, marketCap: 273000, per: 5.9, pbr: 0.5, dividendYield: 4.6, roe: 8.9, volume: 1610000 },
  { code: "086790", name: "하나금융지주", market: "KOSPI", sector: "은행", price: 63200, changePct: 1.28, marketCap: 184000, per: 5.4, pbr: 0.5, dividendYield: 5.5, roe: 9.1, volume: 980000 },
  { code: "316140", name: "우리금융지주", market: "KOSPI", sector: "은행", price: 15850, changePct: 0.70, marketCap: 117000, per: 4.8, pbr: 0.4, dividendYield: 6.8, roe: 8.2, volume: 3420000 },
  { code: "032830", name: "삼성생명", market: "KOSPI", sector: "보험", price: 96400, changePct: 0.42, marketCap: 193000, per: 11.2, pbr: 0.4, dividendYield: 4.1, roe: 4.5, volume: 320000 },
  { code: "015760", name: "한국전력", market: "KOSPI", sector: "전력", price: 22150, changePct: 2.31, marketCap: 142000, per: 7.9, pbr: 0.4, dividendYield: 0.0, roe: 3.2, volume: 4210000 },
  { code: "017670", name: "SK텔레콤", market: "KOSPI", sector: "통신", price: 53400, changePct: 0.38, marketCap: 117000, per: 10.4, pbr: 1.0, dividendYield: 6.3, roe: 9.7, volume: 640000 },
  { code: "030200", name: "KT", market: "KOSPI", sector: "통신", price: 41300, changePct: 0.61, marketCap: 107000, per: 8.1, pbr: 0.6, dividendYield: 5.0, roe: 7.4, volume: 720000 },
  { code: "033780", name: "KT&G", market: "KOSPI", sector: "필수소비재", price: 98700, changePct: -0.30, marketCap: 121000, per: 12.5, pbr: 1.3, dividendYield: 5.3, roe: 10.8, volume: 410000 },
  { code: "003550", name: "LG", market: "KOSPI", sector: "지주", price: 78900, changePct: 0.51, marketCap: 124000, per: 6.7, pbr: 0.5, dividendYield: 4.2, roe: 6.5, volume: 280000 },
  { code: "009150", name: "삼성전기", market: "KOSPI", sector: "전자부품", price: 138500, changePct: 1.39, marketCap: 103000, per: 14.8, pbr: 1.3, dividendYield: 1.5, roe: 8.9, volume: 510000 },
  { code: "010130", name: "고려아연", market: "KOSPI", sector: "비철금속", price: 489000, changePct: -1.21, marketCap: 101000, per: 16.2, pbr: 1.2, dividendYield: 3.0, roe: 7.6, volume: 92000 },
  { code: "011200", name: "HMM", market: "KOSPI", sector: "해운", price: 17850, changePct: 3.78, marketCap: 174000, per: 4.9, pbr: 0.6, dividendYield: 1.1, roe: 12.0, volume: 6210000 },
  { code: "009830", name: "한화솔루션", market: "KOSPI", sector: "화학", price: 24300, changePct: -2.41, marketCap: 47000, per: 30.5, pbr: 0.6, dividendYield: 1.0, roe: 1.9, volume: 1820000 },
  { code: "066570", name: "LG전자", market: "KOSPI", sector: "가전", price: 92800, changePct: 0.87, marketCap: 152000, per: 9.1, pbr: 0.9, dividendYield: 1.9, roe: 9.9, volume: 880000 },
  { code: "028260", name: "삼성물산", market: "KOSPI", sector: "건설", price: 142500, changePct: 0.42, marketCap: 263000, per: 11.8, pbr: 0.7, dividendYield: 2.7, roe: 6.3, volume: 410000 },
  { code: "010950", name: "S-Oil", market: "KOSPI", sector: "정유", price: 68900, changePct: 1.62, marketCap: 78000, per: 8.4, pbr: 1.1, dividendYield: 4.0, roe: 12.5, volume: 620000 },
  { code: "024110", name: "기업은행", market: "KOSPI", sector: "은행", price: 14200, changePct: 0.85, marketCap: 113000, per: 4.5, pbr: 0.4, dividendYield: 7.2, roe: 8.6, volume: 2410000 },
  { code: "323410", name: "카카오뱅크", market: "KOSPI", sector: "은행", price: 23950, changePct: -0.83, marketCap: 114000, per: 19.4, pbr: 1.6, dividendYield: 0.6, roe: 6.8, volume: 2010000 },
  { code: "259960", name: "크래프톤", market: "KOSPI", sector: "게임", price: 312000, changePct: 2.13, marketCap: 152000, per: 17.9, pbr: 3.0, dividendYield: 0.0, roe: 17.2, volume: 280000 },
  { code: "036570", name: "엔씨소프트", market: "KOSPI", sector: "게임", price: 187600, changePct: -1.52, marketCap: 41000, per: 28.4, pbr: 1.1, dividendYield: 1.8, roe: 3.9, volume: 190000 },
  { code: "247540", name: "에코프로비엠", market: "KOSDAQ", sector: "2차전지", price: 162800, changePct: -3.21, marketCap: 159000, per: 71.0, pbr: 4.8, dividendYield: 0.1, roe: 7.1, volume: 1410000 },
  { code: "086520", name: "에코프로", market: "KOSDAQ", sector: "2차전지", price: 81200, changePct: -2.88, marketCap: 108000, per: 49.0, pbr: 5.2, dividendYield: 0.2, roe: 11.0, volume: 1980000 },
  { code: "091990", name: "셀트리온헬스케어", market: "KOSDAQ", sector: "바이오", price: 71200, changePct: 0.42, marketCap: 113000, per: 38.1, pbr: 2.0, dividendYield: 0.0, roe: 5.4, volume: 720000 },
  { code: "066970", name: "엘앤에프", market: "KOSDAQ", sector: "2차전지", price: 98700, changePct: -4.12, marketCap: 35000, per: 0, pbr: 2.4, dividendYield: 0.2, roe: -3.1, volume: 1240000 },
  { code: "196170", name: "알테오젠", market: "KOSDAQ", sector: "바이오", price: 312000, changePct: 3.91, marketCap: 166000, per: 92.0, pbr: 14.2, dividendYield: 0.0, roe: 16.8, volume: 410000 },
  { code: "277810", name: "레인보우로보틱스", market: "KOSDAQ", sector: "로봇", price: 178500, changePct: 4.62, marketCap: 34000, per: 0, pbr: 9.1, dividendYield: 0.0, roe: -1.2, volume: 820000 },
  { code: "058470", name: "리노공업", market: "KOSDAQ", sector: "반도체장비", price: 184200, changePct: 1.04, marketCap: 28000, per: 22.1, pbr: 4.0, dividendYield: 1.6, roe: 19.4, volume: 110000 },
  { code: "240810", name: "원익IPS", market: "KOSDAQ", sector: "반도체장비", price: 34850, changePct: 2.20, marketCap: 17000, per: 18.5, pbr: 1.4, dividendYield: 0.0, roe: 7.8, volume: 980000 },
  { code: "357780", name: "솔브레인", market: "KOSDAQ", sector: "반도체소재", price: 268500, changePct: 0.75, marketCap: 21000, per: 12.9, pbr: 1.6, dividendYield: 0.9, roe: 13.1, volume: 96000 },
  { code: "112040", name: "위메이드", market: "KOSDAQ", sector: "게임", price: 41200, changePct: -2.13, marketCap: 14000, per: 0, pbr: 2.8, dividendYield: 0.0, roe: -8.4, volume: 1320000 },
  { code: "293490", name: "카카오게임즈", market: "KOSDAQ", sector: "게임", price: 19850, changePct: -1.49, marketCap: 16000, per: 24.0, pbr: 1.1, dividendYield: 0.0, roe: 4.4, volume: 1010000 },
  { code: "041510", name: "에스엠", market: "KOSDAQ", sector: "엔터", price: 78900, changePct: 1.28, marketCap: 19000, per: 13.7, pbr: 2.2, dividendYield: 1.4, roe: 16.0, volume: 240000 },
  { code: "035900", name: "JYP Ent.", market: "KOSDAQ", sector: "엔터", price: 62400, changePct: 2.04, marketCap: 22000, per: 14.9, pbr: 4.1, dividendYield: 1.1, roe: 28.5, volume: 410000 },
  { code: "067310", name: "하나마이크론", market: "KOSDAQ", sector: "반도체", price: 24600, changePct: 5.13, marketCap: 9000, per: 16.1, pbr: 2.0, dividendYield: 0.4, roe: 11.9, volume: 2140000 },
  { code: "078600", name: "대주전자재료", market: "KOSDAQ", sector: "2차전지소재", price: 98200, changePct: -1.80, marketCap: 16000, per: 34.2, pbr: 4.6, dividendYield: 0.2, roe: 12.8, volume: 320000 },
  { code: "095340", name: "ISC", market: "KOSDAQ", sector: "반도체장비", price: 71400, changePct: 1.71, marketCap: 14000, per: 19.8, pbr: 2.9, dividendYield: 0.7, roe: 14.6, volume: 280000 },
];
