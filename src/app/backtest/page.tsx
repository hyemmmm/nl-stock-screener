"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DiscEvent {
  date: string;
  sessionDate: string;
  name: string;
  code: string;
  type: string;
  title: string;
  changePct: number | null;
  openBuyPct: number | null;
}
interface DiscBacktest {
  days: number;
  scored: number;
  upRateOpen: number | null;
  avgOpen: number | null;
  avgChange: number | null;
  byType: { type: string; n: number; upRate: number; avgOpen: number }[];
  events: DiscEvent[];
  error?: string;
}

const pct = (x: number | null) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`);
const cls = (x: number | null) => (x == null ? "text-zinc-500" : x >= 0 ? "text-up" : "text-down");
const naver = (code: string) => `https://finance.naver.com/item/main.naver?code=${code}`;

export default function DiscBacktestPage() {
  const [b, setB] = useState<DiscBacktest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/backtest", { cache: "no-store" });
      const j = await res.json();
      if (j.error) setError(j.error);
      else setB(j as DiscBacktest);
    } catch {
      setError("불러오기 실패");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">공시 백테스트</h1>
          <p className="mt-2 text-sm text-zinc-400">
            최근 {b?.days ?? 6}일 <span className="text-up">🔺호재 공시</span> → 다음 거래일{" "}
            <span className="text-indigo-400">시가매수→종가</span>로 채점.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← 내일 후보
          </Link>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? "채점 중…" : "새로고침"}
          </button>
        </div>
      </header>

      {loading && !b && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          최근 공시 긁고 실제 등락으로 채점 중… (약 5~10초)
        </div>
      )}
      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</p>
      )}

      {b && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="적중률 (시가매수)" value={b.upRateOpen == null ? "—" : `${b.upRateOpen.toFixed(0)}%`} />
            <Stat label="평균 · 시가매수" value={pct(b.avgOpen)} valueClass={cls(b.avgOpen)} />
            <Stat label="평균 · 전일대비" value={pct(b.avgChange)} valueClass={cls(b.avgChange)} />
            <Stat label="채점 건수" value={`${b.scored}건`} />
          </div>

          {b.byType.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-sm font-semibold text-zinc-300">공시 유형별 (시가매수 기준)</h2>
              <div className="overflow-x-auto rounded-2xl border border-ink-600 bg-ink-800">
                <table className="w-full text-sm">
                  <thead className="text-xs text-zinc-500">
                    <tr className="border-b border-ink-600">
                      <th className="px-4 py-2 text-left font-medium">유형</th>
                      <th className="px-4 py-2 text-right font-medium">건수</th>
                      <th className="px-4 py-2 text-right font-medium">적중률</th>
                      <th className="px-4 py-2 text-right font-medium">평균</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.byType.map((t) => (
                      <tr key={t.type} className="border-b border-ink-700/50 last:border-0">
                        <td className="px-4 py-2 text-zinc-200">{t.type}</td>
                        <td className="px-4 py-2 text-right text-zinc-400">{t.n}</td>
                        <td className="px-4 py-2 text-right text-zinc-400">{t.upRate.toFixed(0)}%</td>
                        <td className={`px-4 py-2 text-right font-medium ${cls(t.avgOpen)}`}>{pct(t.avgOpen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold text-zinc-300">공시별 결과 (최신순)</h2>
            <div className="overflow-x-auto rounded-2xl border border-ink-600 bg-ink-800">
              <table className="w-full text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr className="border-b border-ink-600">
                    <th className="px-3 py-2 text-left font-medium">공시→반응</th>
                    <th className="px-3 py-2 text-left font-medium">종목 / 유형</th>
                    <th className="px-2 py-2 text-right font-medium">전일대비</th>
                    <th className="px-2 py-2 text-right font-medium">시가매수</th>
                  </tr>
                </thead>
                <tbody>
                  {b.events.map((e, i) => (
                    <tr key={i} className="border-b border-ink-700/50 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">
                        {e.date}
                        {e.sessionDate && <span className="text-zinc-600"> → {e.sessionDate}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <a href={naver(e.code)} target="_blank" rel="noreferrer" className="text-zinc-200 hover:text-white hover:underline">
                          {e.name}
                        </a>
                        <span className="ml-1.5 rounded bg-zinc-500/15 px-1 py-0.5 text-[10px] text-zinc-400">
                          {e.type}
                        </span>
                      </td>
                      <td className={`whitespace-nowrap px-2 py-2 text-right ${cls(e.changePct)}`}>{pct(e.changePct)}</td>
                      <td className={`whitespace-nowrap px-2 py-2 text-right font-medium ${cls(e.openBuyPct)}`}>
                        {pct(e.openBuyPct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <footer className="mt-10 text-center text-xs text-zinc-600">
        호재 공시 다음 거래일 시가매수→종가 · 시장 급락일 포함 시 왜곡 · 표본 적음 · 참고용
      </footer>
    </main>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-800 p-4">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className={`mt-1 text-lg font-bold ${valueClass ?? "text-white"}`}>{value}</div>
    </div>
  );
}
