"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface NewsItem {
  title: string;
  link: string;
}
interface SurgeEvent {
  date: string;
  chgPct: number;
  volMultiple: number;
  marketPct: number | null;
  category: string;
  news: NewsItem[];
}
interface CategoryStat {
  category: string;
  count: number;
  avgChg: number;
  avgVolMult: number;
}
interface CatalystResult {
  code: string;
  name: string;
  fromDate: string;
  toDate: string;
  minChg: number;
  totalDays: number;
  events: SurgeEvent[];
  byCategory: CategoryStat[];
  avgChg: number;
  avgVolMult: number;
  error?: string;
}
interface StockHit {
  code: string;
  name: string;
  market: string;
}

const CAT_COLOR: Record<string, string> = {
  실적: "bg-emerald-500/15 text-emerald-300",
  "공급계약·수주": "bg-indigo-500/15 text-indigo-300",
  "신제품·기술": "bg-sky-500/15 text-sky-300",
  "업황·테마": "bg-amber-500/15 text-amber-300",
  "지분·경영": "bg-fuchsia-500/15 text-fuchsia-300",
  기타: "bg-zinc-500/15 text-zinc-400",
};

export default function CatalystPage() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<StockHit[]>([]);
  const [stock, setStock] = useState<{ code: string; name: string } | null>(null);
  const [minChg, setMinChg] = useState(10);
  const [data, setData] = useState<CatalystResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const acTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 마지막 조회 종목 복원
  useEffect(() => {
    try {
      const last = localStorage.getItem("catalyst:last");
      if (last) {
        const s = JSON.parse(last) as { code: string; name: string };
        setStock(s);
        const cached = localStorage.getItem(`catalyst:${s.code}`);
        if (cached) setData(JSON.parse(cached));
      }
    } catch {}
  }, []);

  // 종목명 자동완성
  function onQuery(v: string) {
    setQuery(v);
    if (acTimer.current) clearTimeout(acTimer.current);
    if (v.trim().length < 1) {
      setHits([]);
      return;
    }
    acTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/catalyst/search?q=${encodeURIComponent(v.trim())}`);
        const j = await r.json();
        setHits(j.items ?? []);
      } catch {
        setHits([]);
      }
    }, 250);
  }

  async function analyze(s: { code: string; name: string }, chg: number) {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/catalyst?code=${s.code}&name=${encodeURIComponent(s.name)}&minChg=${chg}`,
      );
      const j = (await r.json()) as CatalystResult;
      if (j.error) setError(j.error);
      else {
        setData(j);
        try {
          localStorage.setItem("catalyst:last", JSON.stringify(s));
          localStorage.setItem(`catalyst:${s.code}`, JSON.stringify(j));
        } catch {}
      }
    } catch {
      setError("분석 실패");
    } finally {
      setLoading(false);
    }
  }

  function pick(h: StockHit) {
    const s = { code: h.code, name: h.name };
    setStock(s);
    setQuery("");
    setHits([]);
    analyze(s, minChg);
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">종목 재료 분석</h1>
          <p className="mt-2 text-sm text-zinc-400">
            한 종목의 <span className="text-rose-400">급등 역사</span>를 자동으로 훑어, 각 급등일의
            등락률·거래량·시황·재료(뉴스)를 유형별로 정리.
          </p>
        </div>
        <Link href="/movers" className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300">
          특징주 →
        </Link>
      </header>

      {/* 종목 검색 */}
      <div className="relative mb-3">
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="종목명 검색 (예: 삼성전자, 금호타이어)"
          className="w-full rounded-xl border border-ink-600 bg-ink-800 px-4 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-indigo-500"
        />
        {hits.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-ink-600 bg-ink-800 shadow-xl">
            {hits.map((h) => (
              <li key={h.code}>
                <button
                  onClick={() => pick(h)}
                  className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-zinc-200 hover:bg-ink-700"
                >
                  <span>
                    {h.name} <span className="text-xs text-zinc-500">{h.code}</span>
                  </span>
                  <span className="text-xs text-zinc-600">{h.market}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 급등 기준 슬라이더 */}
      <div className="mb-6 flex items-center gap-3 text-sm text-zinc-400">
        <span className="shrink-0">
          급등 기준: 전일 대비 <span className="font-semibold text-rose-400">+{minChg}%</span> 이상
        </span>
        <input
          type="range"
          min={5}
          max={30}
          step={1}
          value={minChg}
          onChange={(e) => setMinChg(Number(e.target.value))}
          onMouseUp={() => stock && analyze(stock, minChg)}
          onTouchEnd={() => stock && analyze(stock, minChg)}
          className="flex-1 accent-indigo-500"
        />
      </div>

      {loading && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          {stock?.name} 전체 역사 훑는 중… 급등일 찾고 재료 붙이는 중 (약 5~15초)
        </div>
      )}
      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </p>
      )}

      {data && !loading && (
        <>
          {/* 요약 */}
          <div className="mb-5 rounded-2xl border border-ink-600 bg-ink-800 p-5">
            <div className="flex items-baseline justify-between">
              <div className="text-lg font-bold text-white">
                {data.name} <span className="text-sm font-normal text-zinc-500">{data.code}</span>
              </div>
              <div className="text-xs text-zinc-500">
                {data.fromDate} ~ {data.toDate} ({data.totalDays}거래일)
              </div>
            </div>
            {data.events.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">
                이 기간에 +{data.minChg}% 이상 급등한 날이 없어요. 기준을 낮춰보세요.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Stat label={`급등일 (+${data.minChg}%↑)`} value={`${data.events.length}일`} />
                <Stat label="평균 상승률" value={`+${data.avgChg.toFixed(1)}%`} cls="text-up" />
                <Stat label="평균 거래량" value={`${data.avgVolMult.toFixed(1)}배`} />
              </div>
            )}
          </div>

          {/* 카테고리별 집계 */}
          {data.byCategory.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-sm font-semibold text-zinc-300">재료 유형별 반응</h2>
              <div className="overflow-x-auto rounded-2xl border border-ink-600 bg-ink-800">
                <table className="w-full text-sm">
                  <thead className="text-xs text-zinc-500">
                    <tr className="border-b border-ink-600">
                      <th className="px-4 py-2 text-left font-medium">유형</th>
                      <th className="px-4 py-2 text-right font-medium">횟수</th>
                      <th className="px-4 py-2 text-right font-medium">평균 상승률</th>
                      <th className="px-4 py-2 text-right font-medium">평균 거래량</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCategory.map((c) => (
                      <tr key={c.category} className="border-b border-ink-700/50 last:border-0">
                        <td className="px-4 py-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                              CAT_COLOR[c.category] ?? CAT_COLOR["기타"]
                            }`}
                          >
                            {c.category}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-zinc-400">{c.count}</td>
                        <td className="px-4 py-2 text-right font-medium text-up">
                          +{c.avgChg.toFixed(1)}%
                        </td>
                        <td className="px-4 py-2 text-right text-zinc-300">
                          {c.avgVolMult.toFixed(1)}배
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 급등일 리스트 */}
          {data.events.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-zinc-300">급등일 상세 (최신순)</h2>
              <div className="space-y-3">
                {data.events.map((e) => (
                  <div key={e.date} className="rounded-2xl border border-ink-600 bg-ink-800 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{e.date}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            CAT_COLOR[e.category] ?? CAT_COLOR["기타"]
                          }`}
                        >
                          {e.category}
                        </span>
                      </div>
                      <div className="text-right text-xs text-zinc-500">
                        <span className="text-base font-bold text-up">+{e.chgPct.toFixed(1)}%</span>
                        <span className="ml-2">거래량 {e.volMultiple.toFixed(1)}배</span>
                        {e.marketPct != null && (
                          <span className="ml-2">
                            시황 {e.marketPct >= 0 ? "+" : ""}
                            {e.marketPct.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                    {e.news.length > 0 ? (
                      <ul className="mt-2 space-y-1 border-t border-ink-700/50 pt-2">
                        {e.news.map((n, i) => (
                          <li key={i} className="text-sm leading-snug">
                            <a
                              href={n.link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-zinc-300 hover:text-white hover:underline"
                            >
                              <span className="mr-1 text-zinc-600">›</span>
                              {n.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-2 border-t border-ink-700/50 pt-2 text-xs text-zinc-600">
                        그날 매칭된 뉴스 없음
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {!data && !loading && !error && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          위에서 종목을 검색해 보세요. 그 종목이 과거에 급등한 날들과 당시 재료를 자동으로 모아줍니다.
        </div>
      )}

      <footer className="mt-10 text-center text-xs text-zinc-600">
        급등일 = 전일 종가 대비 기준% 이상 · 재료 뉴스는 자동 매칭이라 실제 원인과 다를 수 있음 · 과거
        반응이 미래를 보장하지 않음 · 참고용
      </footer>
    </main>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-xl border border-ink-700/50 bg-ink-900/40 p-3">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-lg font-bold ${cls ?? "text-white"}`}>{value}</div>
    </div>
  );
}
