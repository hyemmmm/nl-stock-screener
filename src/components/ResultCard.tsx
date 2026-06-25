"use client";

import type { ScreenResult } from "@/lib/types";

interface Props {
  result: ScreenResult;
  selected: boolean;
  onSelect: () => void;
}

export default function ResultCard({ result, selected, onSelect }: Props) {
  const { stock, matched } = result;
  const up = stock.changePct >= 0;

  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-xl border p-4 text-left transition-colors ${
        selected
          ? "border-indigo-500 bg-ink-700"
          : "border-ink-600 bg-ink-800 hover:border-ink-500 hover:bg-ink-700"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-white">{stock.name}</span>
            <span className="shrink-0 text-xs text-zinc-500">{stock.code}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="rounded bg-ink-600 px-1.5 py-0.5 text-[10px]">
              {stock.market}
            </span>
            <span>{stock.sector}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-semibold tabular-nums text-white">
            {stock.price.toLocaleString()}
          </div>
          <div className={`text-xs font-medium tabular-nums ${up ? "text-up" : "text-down"}`}>
            {up ? "+" : ""}
            {stock.changePct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* explainability: which conditions this stock satisfied */}
      {matched.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {matched.map((m, i) => (
            <span
              key={i}
              className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-300 ring-1 ring-inset ring-indigo-500/20"
              title={m.label}
            >
              {m.actual}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex gap-3 text-[11px] text-zinc-500">
        <span>PER {stock.per > 0 ? stock.per.toFixed(1) : "—"}</span>
        <span>PBR {stock.pbr > 0 ? stock.pbr.toFixed(1) : "—"}</span>
        <span>배당 {stock.dividendYield.toFixed(1)}%</span>
        <span>시총 {stock.marketCap.toLocaleString()}억</span>
      </div>
    </button>
  );
}
