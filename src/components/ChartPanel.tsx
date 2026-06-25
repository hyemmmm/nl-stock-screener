"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { detectLevels } from "@/lib/levels";
import type { ChartResponse, EnrichedStock } from "@/lib/types";

interface Props {
  stock: EnrichedStock | null;
}

const SUPPORT_COLOR = "#22c55e"; // 지지 = 초록
const RESIST_COLOR = "#f59e0b"; // 저항 = 주황

export default function ChartPanel({ stock }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<ChartResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 지지/저항 레벨 (캔들에서 자동 탐지)
  const levels = useMemo(() => (data ? detectLevels(data.candles) : []), [data]);

  // fetch candles when the selected stock changes
  useEffect(() => {
    if (!stock) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/chart?code=${stock.code}`)
      .then((r) => r.json())
      .then((json: ChartResponse & { error?: string }) => {
        if (cancelled) return;
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch(() => !cancelled && setError("차트를 불러오지 못했습니다"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [stock]);

  // render the chart whenever candle data arrives
  useEffect(() => {
    if (!data || !containerRef.current) return;
    const el = containerRef.current;
    let disposed = false;
    let cleanup = () => {};

    import("lightweight-charts").then(({ createChart, ColorType }) => {
      if (disposed) return;
      el.innerHTML = "";
      const chart = createChart(el, {
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#8b93a7",
          fontFamily: "var(--font-sans)",
        },
        grid: {
          vertLines: { color: "#1a2030" },
          horzLines: { color: "#1a2030" },
        },
        rightPriceScale: { borderColor: "#222a3a" },
        timeScale: { borderColor: "#222a3a", timeVisible: false },
        width: el.clientWidth,
        height: 360,
        crosshair: { mode: 0 },
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: "#f6465d",
        downColor: "#2f80ed",
        borderUpColor: "#f6465d",
        borderDownColor: "#2f80ed",
        wickUpColor: "#f6465d",
        wickDownColor: "#2f80ed",
      });
      candleSeries.setData(
        data.candles.map((c) => ({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
      );

      // 신호 마커는 mock 스냅샷 기반 → 실데이터 차트엔 표시하지 않음
      if (stock && stock.signalDaysAgo > 0 && data.source === "mock") {
        candleSeries.setMarkers([
          {
            time: stock.signalDate,
            position: "aboveBar",
            color: "#eab308",
            shape: "arrowDown",
            text: `신호 ${stock.signalDaysAgo}일전`,
          },
        ]);
      }

      // 5-day moving average overlay (so "5일선 이격" is visible at a glance)
      const ma5 = data.candles
        .map((c, i, arr) => {
          if (i < 4) return null;
          const avg = arr.slice(i - 4, i + 1).reduce((s, x) => s + x.close, 0) / 5;
          return { time: c.time, value: Math.round(avg) };
        })
        .filter((v): v is { time: string; value: number } => v !== null);
      const ma5Series = chart.addLineSeries({
        color: "#eab308",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      ma5Series.setData(ma5);

      // 지지/저항 수평선 (1차 = 실선·굵게, 2차+ = 점선)
      for (const lv of levels) {
        candleSeries.createPriceLine({
          price: lv.price,
          color: lv.kind === "support" ? SUPPORT_COLOR : RESIST_COLOR,
          lineWidth: lv.rank === 1 ? 2 : 1,
          lineStyle: lv.rank === 1 ? 0 : 2, // 0 Solid, 2 Dashed
          axisLabelVisible: true,
          title: `${lv.kind === "support" ? "지지" : "저항"}${lv.rank}차`,
        });
      }

      const volSeries = chart.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
      });
      chart.priceScale("vol").applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      });
      volSeries.setData(
        data.candles.map((c) => ({
          time: c.time,
          value: c.volume,
          color: c.close >= c.open ? "#f6465d55" : "#2f80ed55",
        })),
      );

      chart.timeScale().fitContent();

      const onResize = () => chart.applyOptions({ width: el.clientWidth });
      window.addEventListener("resize", onResize);
      cleanup = () => {
        window.removeEventListener("resize", onResize);
        chart.remove();
      };
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [data, levels, stock]);

  if (!stock) {
    return (
      <div className="flex h-[440px] items-center justify-center rounded-2xl border border-ink-600 bg-ink-800 text-sm text-zinc-500">
        종목을 선택하면 일봉 차트가 여기에 표시됩니다
      </div>
    );
  }

  // 차트가 실데이터면 표시값(가격·등락률·이격·음봉)도 실캔들에서 계산
  const cs = data?.candles ?? [];
  const lastC = cs[cs.length - 1];
  const prevC = cs[cs.length - 2];
  const price = lastC?.close ?? stock.price;
  const changePct =
    lastC && prevC ? ((lastC.close - prevC.close) / prevC.close) * 100 : stock.changePct;
  const ma5last = cs.length >= 5 ? cs.slice(-5).reduce((s, x) => s + x.close, 0) / 5 : 0;
  const gap5 = ma5last ? ((price - ma5last) / ma5last) * 100 : stock.gap5MA;
  const dayBearish = lastC ? lastC.close < lastC.open : stock.bearish;
  const up = changePct >= 0;

  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-800 p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-white">{stock.name}</h3>
            <span className="text-xs text-zinc-500">{stock.code}</span>
            <span className="rounded bg-ink-600 px-1.5 py-0.5 text-[10px] text-zinc-400">
              {stock.market}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-white">
              {price.toLocaleString()}
              <span className="ml-0.5 text-sm font-normal text-zinc-500">원</span>
            </span>
            <span className={`text-sm font-medium ${up ? "text-up" : "text-down"}`}>
              {up ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%
            </span>
          </div>
        </div>
        {data && (
          <span className="rounded-full border border-ink-500 px-2 py-0.5 text-[10px] text-zinc-500">
            {data.source === "kis"
              ? "KIS 실시간"
              : data.source === "naver"
                ? "네이버 실데이터"
                : "MOCK 데이터"}
          </span>
        )}
      </div>

      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-zinc-500">
            차트 불러오는 중…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-up">
            {error}
          </div>
        )}
        <div ref={containerRef} className="h-[360px] w-full" />
      </div>

      <div className="mt-2 flex items-center gap-4 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 bg-yellow-500" /> 5일 이동평균
        </span>
        <span>
          5일선 이격{" "}
          <span className={Math.abs(gap5) <= 3 ? "text-emerald-400" : "text-zinc-400"}>
            {gap5 >= 0 ? "+" : ""}
            {gap5.toFixed(1)}%
          </span>
        </span>
        <span>당일 {dayBearish ? "음봉 🔵" : "양봉 🔴"}</span>
      </div>

      {/* 자동 탐지된 지지/저항 레벨 */}
      {levels.length > 0 && (
        <div className="mt-3 border-t border-ink-700 pt-3">
          <div className="mb-1.5 text-[11px] font-medium text-zinc-400">
            자동 지지/저항{" "}
            <span className="text-zinc-600">· 스윙 고저점 {`>`} 가격대 클러스터 (터치=강도)</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {levels
              .slice()
              .sort((a, b) => b.price - a.price)
              .map((lv, i) => (
                <span
                  key={i}
                  className="rounded-md px-2 py-0.5 text-[11px] tabular-nums ring-1 ring-inset"
                  style={{
                    color: lv.kind === "support" ? SUPPORT_COLOR : RESIST_COLOR,
                    borderColor: "transparent",
                    boxShadow: `inset 0 0 0 1px ${
                      lv.kind === "support" ? SUPPORT_COLOR : RESIST_COLOR
                    }33`,
                  }}
                  title={`${lv.touches}회 터치`}
                >
                  {lv.kind === "support" ? "지지" : "저항"}
                  {lv.rank}차 {lv.price.toLocaleString()} · {lv.touches}터치
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
