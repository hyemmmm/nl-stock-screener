"use client";

import { useEffect, useRef, useState } from "react";
import type { ChartResponse, EnrichedStock } from "@/lib/types";

interface Props {
  stock: EnrichedStock | null;
}

export default function ChartPanel({ stock }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<ChartResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, [data]);

  if (!stock) {
    return (
      <div className="flex h-[440px] items-center justify-center rounded-2xl border border-ink-600 bg-ink-800 text-sm text-zinc-500">
        종목을 선택하면 일봉 차트가 여기에 표시됩니다
      </div>
    );
  }

  const up = stock.changePct >= 0;

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
              {stock.price.toLocaleString()}
              <span className="ml-0.5 text-sm font-normal text-zinc-500">원</span>
            </span>
            <span className={`text-sm font-medium ${up ? "text-up" : "text-down"}`}>
              {up ? "▲" : "▼"} {Math.abs(stock.changePct).toFixed(2)}%
            </span>
          </div>
        </div>
        {data && (
          <span className="rounded-full border border-ink-500 px-2 py-0.5 text-[10px] text-zinc-500">
            {data.source === "kis" ? "KIS 실시간" : "MOCK 데이터"}
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
          <span className={stock.gap5MAAbs <= 3 ? "text-emerald-400" : "text-zinc-400"}>
            {stock.gap5MA >= 0 ? "+" : ""}
            {stock.gap5MA.toFixed(1)}%
          </span>
        </span>
        <span>당일 {stock.bearish ? "음봉 🔵" : "양봉 🔴"}</span>
      </div>
    </div>
  );
}
