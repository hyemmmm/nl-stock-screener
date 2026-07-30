// ──────────────────────────────────────────────────────────────────────────
// 매매 전략 시뮬레이터 (일봉 기반).
//   전략: 시가 전량 매수 → 고가가 +3% 닿으면 절반 익절
//        → 저가가 -5% 닿으면 (남은 수량) 손절 → 둘 다 아니면 종가 전량 청산
//   일봉만으로는 고가·저가의 도달 순서를 알 수 없으므로, 둘 다 닿은 날은
//   "익절 먼저, 남은 절반 손절"로 가정한다(보수적 변형도 함께 계산).
// ──────────────────────────────────────────────────────────────────────────

export const TP = 3; // 익절 (%)
export const SL = -5; // 손절 (%)
export const TP_PORTION = 0.5; // 익절 비중

export interface Bar {
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface StrategyResult {
  ret: number; // 전략 수익률 (%)
  retWorst: number; // 보수적 가정(둘 다 닿으면 손절 먼저) 수익률 (%)
  maxUp: number; // 당일 고가까지 최대 상승 (시가 대비 %)
  maxDown: number; // 당일 저가까지 최대 하락 (시가 대비 %)
  closeRet: number; // 시가→종가 (%)
  tpHit: boolean; // +3% 도달 (위꼬리 포함)
  slHit: boolean; // -5% 도달
  exit: "익절+손절" | "익절+종가" | "손절" | "종가";
  detail: string; // 계산 내역 (예: "절반 +3% · 절반 종가 +3.7%")
}

const f = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`;

export function simulate(bar: Bar): StrategyResult {
  const { open, high, low, close } = bar;
  const maxUp = (high / open - 1) * 100;
  const maxDown = (low / open - 1) * 100;
  const closeRet = (close / open - 1) * 100;
  const tpHit = maxUp >= TP;
  const slHit = maxDown <= SL;

  let ret: number;
  let retWorst: number;
  let exit: StrategyResult["exit"];
  let detail: string;

  if (tpHit && slHit) {
    // 익절 먼저 가정: 절반 +3%, 남은 절반 -5%
    ret = TP_PORTION * TP + (1 - TP_PORTION) * SL;
    retWorst = SL; // 보수적: 손절이 먼저였다면 전량 -5%
    exit = "익절+손절";
    detail = `절반 ${f(TP)} · 절반 ${f(SL)}`;
  } else if (tpHit) {
    ret = TP_PORTION * TP + (1 - TP_PORTION) * closeRet;
    retWorst = ret;
    exit = "익절+종가";
    detail = `절반 ${f(TP)} · 절반 종가 ${f(closeRet)}`;
  } else if (slHit) {
    ret = SL;
    retWorst = SL;
    exit = "손절";
    detail = `전량 ${f(SL)} 손절`;
  } else {
    ret = closeRet;
    retWorst = closeRet;
    exit = "종가";
    detail = `전량 종가 ${f(closeRet)}`;
  }
  return { ret, retWorst, maxUp, maxDown, closeRet, tpHit, slHit, exit, detail };
}
